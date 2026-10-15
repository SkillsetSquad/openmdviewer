import { expect, it } from "vitest";
import { zipSync, strToU8, unzipSync } from "fflate";
import { htmlToMarkdown } from "../src/lib/html-conversion";
import { checkDocx, docxToHtml } from "../src/lib/docx-conversion";
import { convertImport } from "../src/lib/convert-import";
import { readLocalFiles } from "../src/lib/import";
import { markdownModel } from "../src/lib/markdown-model";
import { conversionDocx, fixturePng } from "./fixtures/conversion-docx";
const input = (name: string, content: BlobPart, path = `Imported/${name}`) => ({
  file: new File([content], name),
  path,
});
it("converts semantic HTML, keeps safe anchors and relative links, extracts data images, and drops active content without a DOM", async () => {
  const html =
    '<!doctype html><html><head><title>Source &amp; title</title><base href="https://attacker.invalid/"></head><body><h1 id="custom">My heading</h1><p><strong>Bold</strong> <em>italic</em> <del>deleted</del> <a href="Other.html?download=1#target">Sibling</a> <a href="#custom">Jump</a></p><ul><li>First</li><li>Second</li></ul><table><tr><th>Name</th><th>Score</th></tr><tr><td>A</td><td>3</td></tr></table><pre><code class="language-js">const x = 1;</code></pre><img alt="Local" src="data:image/png;base64,' +
    Buffer.from(fixturePng).toString("base64") +
    '"><img src="https://attacker.invalid/remote.png" onerror="alert(1)"><script>evil()</script><iframe src="https://attacker.invalid/frame"></iframe><form><input value="secret"></form><p hidden>Hidden content</p><a href="javascript:alert(1)">Unsafe text</a></body></html>';
  const result = await htmlToMarkdown(
    html,
    "Imported/Page.md",
    new Map([["Imported/Other.html", "Imported/Other.md"]]),
  );
  expect(result.markdown).toContain("title: Source & title");
  expect(result.markdown).toContain('<a id="custom"></a>');
  expect(result.markdown).toContain("[Sibling](Other.md?download=1#target)");
  expect(result.markdown).toContain("[Jump](#custom)");
  expect(result.markdown).toContain("```js");
  expect(result.markdown).toContain("| Name");
  expect(result.markdown).not.toMatch(
    /javascript:|evil\(\)|iframe|onerror|Hidden content|<form/,
  );
  expect(result.assets).toHaveLength(1);
  expect(new Uint8Array(await result.assets[0].blob.arrayBuffer())).toEqual(
    fixturePng,
  );
  expect(result.markdown).toContain("https://attacker.invalid/remote.png");
  expect(markdownModel(result.markdown).anchors).toContain(
    "user-content-custom",
  );
});
it("converts DOCX headings, emphasis, lists, basic tables and local images through the actual parser", async () => {
  const bytes = conversionDocx(),
    result = await docxToHtml(bytes.buffer as ArrayBuffer, "Imported/Word.md");
  expect(result.html).toContain("<h1>Converted Word document</h1>");
  expect(result.html).toContain("<strong>Bold text</strong>");
  expect(result.html).toContain("<ul>");
  expect(result.assets).toHaveLength(1);
  expect(new Uint8Array(await result.assets[0].blob.arrayBuffer())).toEqual(
    fixturePng,
  );
  const converted = await htmlToMarkdown(
    result.html,
    "Imported/Word.md",
    new Map(),
    result.assets,
  );
  expect(converted.markdown).toContain("# Converted Word document");
  expect(converted.markdown).toContain("| Column");
  expect(converted.markdown).not.toContain("javascript:");
  expect(converted.assets[0].path).toBe("Imported/_converted/Word/image-1.png");
});
it("rejects unsafe/malformed DOCX XML, traversal and incomplete archives; measures actual deflated output", () => {
  expect(() => checkDocx(conversionDocx({ dtd: true }))).toThrow("entities");
  expect(() => checkDocx(strToU8("not zip"))).toThrow();
  expect(() =>
    checkDocx(zipSync({ "../escape.xml": strToU8("<x/>") })),
  ).toThrow("unsafe");
  const bytes = conversionDocx();
  expect(() => checkDocx(bytes.subarray(0, 100))).toThrow();
  const valid = unzipSync(checkDocx(bytes));
  expect(valid["word/media/image.png"]).toEqual(fixturePng);
  const oversized = zipSync({
    "word/document.xml": new Uint8Array(31 * 1024 * 1024),
  });
  // Lie about the uncompressed size in both ZIP headers; actual streaming output must still be bounded.
  const view = new DataView(
    oversized.buffer,
    oversized.byteOffset,
    oversized.byteLength,
  );
  for (let index = 0; index + 46 < oversized.length; index++) {
    const signature = view.getUint32(index, true);
    if (signature === 0x04034b50) view.setUint32(index + 22, 1, true);
    else if (signature === 0x02014b50) view.setUint32(index + 24, 1, true);
  }
  expect(() => checkDocx(oversized)).toThrow("expanded limit");
});
it("keeps DOCX text with an unavailable-image notice without reading an externally linked image", async () => {
  const result = await docxToHtml(
    conversionDocx({ externalImage: true }).buffer as ArrayBuffer,
    "Imported/External.md",
  );
  expect(result.html).toContain("Converted Word document");
  expect(result.assets).toEqual([]);
  expect(result.warnings.join(" ")).toContain(
    "Linked external images are blocked",
  );
  expect(result.html).not.toContain("https://conversion-attacker.invalid");
});
it("keeps exact original bytes and related files with derived Markdown in one batch, and portable ZIP imports keep sources as attachments", async () => {
  const original = conversionDocx(),
    html = '<h1>Other</h1><a href="Word.docx">Word</a><img src="pic.png">';
  const result = await convertImport([
    input("Word.docx", original as BlobPart),
    input("Other.html", html),
    input("pic.png", fixturePng as BlobPart),
  ]);
  expect(result.documents.map((doc) => doc.path)).toEqual([
    "Imported/Word.md",
    "Imported/Other.md",
  ]);
  expect(result.documents[1].content).toContain("[Word](Word.md)");
  const source = result.assets.find(
    (asset) => asset.path === "Imported/_sources/Word.docx",
  )!;
  expect(new Uint8Array(await source.blob.arrayBuffer())).toEqual(original);
  expect(source.blob.type).toBe("application/octet-stream");
  expect(
    result.assets.find((asset) => asset.path.endsWith("/Other.html"))?.blob
      .type,
  ).toBe("application/octet-stream");
  const archive = zipSync(
    Object.fromEntries(
      await Promise.all([
        ...result.documents.map(
          (doc) => [doc.path, strToU8(doc.content)] as const,
        ),
        ...(await Promise.all(
          result.assets.map(
            async (asset) =>
              [
                asset.path,
                new Uint8Array(await asset.blob.arrayBuffer()),
              ] as const,
          ),
        )),
      ]),
    ),
  );
  const restored = await readLocalFiles([
    new File([archive as BlobPart], "Backup.zip"),
  ]);
  expect(restored.documents.map((doc) => doc.content)).toEqual(
    result.documents.map((doc) => doc.content),
  );
  expect(
    new Uint8Array(
      await restored.assets
        .find((asset) => asset.path === source.path)!
        .blob.arrayBuffer(),
    ),
  ).toEqual(original);
});
it("rejects output path collisions and invalid encodings instead of silently replacing files", async () => {
  await expect(
    convertImport([
      input("Same.html", "<h1>HTML</h1>"),
      input("Same.md", "# Markdown"),
    ]),
  ).rejects.toThrow("conflicting paths");
  await expect(
    convertImport([input("Bad.html", new Uint8Array([0xff]))]),
  ).rejects.toThrow("UTF-8");
});

it("uses the generated heading anchor when an HTML ID already matches its Markdown slug", async () => {
  const result = await htmlToMarkdown(
    '<h1 id="same-heading">Same heading</h1><a href="#same-heading">Jump</a>',
    "Page.md",
    new Map(),
  );
  expect(result.markdown).not.toContain('<a id="same-heading">');
  expect(result.markdown).toContain("[Jump](#same-heading)");
  expect(
    markdownModel(result.markdown).anchors.filter(
      (id) => id === "user-content-same-heading",
    ),
  ).toHaveLength(1);
});

it("rejects encrypted-PDF output collisions before asking for passwords or loading a parser", async () => {
  await expect(
    convertImport([
      { file: new File(["not parsed"], "Same.pdf"), path: "Imported/Same.pdf" },
      {
        file: new File(["# Existing Markdown"], "Same.md"),
        path: "Imported/Same.md",
      },
    ]),
  ).rejects.toThrow("conflicting paths");
});

it("rewrites PDF viewer page fragments to verified generated heading anchors", async () => {
  const result = await htmlToMarkdown(
    '<h1>Index</h1><a href="Other.pdf#page=2">Page link</a>',
    "Imported/Index.md",
    new Map([["Imported/Other.pdf", "Imported/Other.md"]]),
    [],
    new Map([["Imported/Other.md", { 2: "page-2-1" }]]),
  );
  expect(result.markdown).toContain("[Page link](Other.md#page-2-1)");
});

it("keeps PDFs marked as attachments opaque while converting other selected formats", async () => {
  const result = await convertImport([
    {
      file: new File(["opaque PDF attachment"], "guide.pdf"),
      path: "Imported/guide.pdf",
      pdfMode: "attachment",
    },
    input("Index.html", '<h1>Index</h1><a href="guide.pdf">Download PDF</a>'),
  ]);
  expect(result.documents).toHaveLength(1);
  expect(result.documents[0].content).toContain("[Download PDF](guide.pdf)");
  expect(
    await result.assets
      .find((asset) => asset.path === "Imported/guide.pdf")!
      .blob.text(),
  ).toBe("opaque PDF attachment");
});
