import { expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import mammoth from "mammoth";
import {
  exportDocx,
  docxImageSize,
  type DocxExportInput,
} from "../src/lib/docx-export";
import { fixturePng } from "./fixtures/conversion-docx";
const input = (content: string): DocxExportInput => ({
  path: "Guide.md",
  content,
  assets: [],
  options: {
    pageSize: "a4",
    images: true,
    contents: false,
    pageNumbers: false,
  },
});
const parts = (bytes: Uint8Array) => {
  const files = unzipSync(bytes);
  return { files, xml: (name: string) => strFromU8(files[name]) };
};
it("exports editable headings, emphasis, nested lists, tables, code, safe hyperlinks and custom heading bookmarks", async () => {
  const value = input(
    '# Word fixture\n\n**Bold text** and *italic words* with ~~removed words~~.\n\n[Jump](#custom) [External](https://example.org/docs)\n\n3. Ordered first\n4. Ordered second\n   - Nested item\n\n- Paragraph one\n\n  Paragraph two\n\n| Key | Value |\n| --- | --- |\n| Editable | 42 |\n\n```ts\nconst first = 1;\nconst second = 2;\n```\n\n<h2 id="custom">Destination</h2>\n\n[Bad](javascript:alert(1))<script>EXECUTABLE_SOURCE_TOKEN</script>',
  );
  value.options.contents = true;
  value.options.pageNumbers = true;
  const result = await exportDocx(value),
    { xml, files } = parts(result.bytes),
    body = xml("word/document.xml"),
    text = (await mammoth.extractRawText({ buffer: Buffer.from(result.bytes) }))
      .value;
  expect(result.tables).toBe(1);
  expect(result.noticeCount).toBe(0);
  expect(body).toContain('w:pStyle w:val="Title"');
  expect(body).toContain("<w:tbl>");
  expect(body).toContain("<w:numPr>");
  expect(body).toContain('w:anchor="OMD_');
  expect(xml("word/numbering.xml")).toContain('w:start w:val="3"');
  expect(xml("word/_rels/document.xml.rels")).toContain(
    "https://example.org/docs",
  );
  expect(
    Object.keys(files).some((name) => name.startsWith("word/footer")),
  ).toBe(true);
  expect(text).toContain("Ordered first");
  expect(text.match(/Paragraph one/g)).toHaveLength(1);
  expect(text.match(/Paragraph two/g)).toHaveLength(1);
  expect(body).toContain("<w:br/>");
  const html = (
    await mammoth.convertToHtml({ buffer: Buffer.from(result.bytes) })
  ).value;
  expect(html).toMatch(/const first = 1;<br\s*\/>const second = 2;/);
  expect(text).not.toMatch(/EXECUTABLE_SOURCE_TOKEN|javascript:/);
  expect(value.content).toContain("<script>");
});
it("embeds exact local raster bytes once per occurrence and never creates external media relationships", async () => {
  const value = input(
    "# Images\n\n- ![List image](local.png)\n\n![Remote](https://docx-attacker.invalid/image.png) ![SVG](vector.svg)\n\n[Attachment](original.pdf) [[Other document]]",
  );
  value.assets = [
    { path: "local.png", blob: new Blob([fixturePng as BlobPart]) },
    { path: "vector.svg", blob: new Blob(['<svg onload="alert(1)"></svg>']) },
  ];
  const result = await exportDocx(value),
    { files, xml } = parts(result.bytes),
    media = Object.keys(files).filter(
      (name) => name.startsWith("word/media/") && files[name].length,
    );
  expect(result.images).toBe(1);
  expect(media).toHaveLength(1);
  expect(files[media[0]]).toEqual(fixturePng);
  expect(result.noticeCount).toBe(4);
  expect(xml("word/_rels/document.xml.rels")).not.toContain(
    "docx-attacker.invalid",
  );
  expect(xml("word/document.xml")).toContain("[Image: Remote");
  value.options.images = false;
  const plain = await exportDocx(value);
  expect(plain.images).toBe(0);
  expect(
    Object.keys(parts(plain.bytes).files).filter(
      (name) =>
        name.startsWith("word/media/") && parts(plain.bytes).files[name].length,
    ),
  ).toHaveLength(0);
});
it("honors Letter layout and excludes hidden source metadata while preserving Unicode and unsupported XML character notices", async () => {
  const value = input(
    "---\ntitle: Public title\nsecret: PRIVATE_DOCX_METADATA\n---\n# Export résumé 😀\n\nVisible\u0000text",
  );
  value.options.pageSize = "letter";
  const result = await exportDocx(value),
    { files, xml } = parts(result.bytes);
  expect(xml("word/document.xml")).toContain('w:w="12240"');
  expect(xml("word/document.xml")).toContain('w:h="15840"');
  expect(xml("docProps/core.xml")).toContain("Public title");
  expect(
    Object.values(files)
      .map((v) => strFromU8(v))
      .join(""),
  ).not.toContain("PRIVATE_DOCX_METADATA");
  expect(result.notices.join(" ")).toContain("unsupported by Word XML");
  expect(xml("word/document.xml")).toContain("Visible�text");
  expect(xml("word/document.xml")).toContain("😀");
});
it("rejects unsupported table sizes and implausible raster dimensions", async () => {
  const source =
    "# Wide table\n\n|" +
    Array.from({ length: 21 }, (_, i) => "Column " + i).join("|") +
    "|\n|" +
    Array(21).fill("---").join("|") +
    "|\n|" +
    Array(21).fill("Value").join("|") +
    "|";
  await expect(exportDocx(input(source))).rejects.toThrow("20 columns");
  expect(docxImageSize(new Uint8Array([1, 2, 3]))).toBeNull();
  const large = fixturePng.slice();
  new DataView(large.buffer).setUint32(16, 99999);
  expect(docxImageSize(large)).toBeNull();
  expect(docxImageSize(fixturePng)).toMatchObject({
    type: "png",
    width: 1,
    height: 1,
  });
});
