import { expect, it } from "vitest";
import { markdownModel } from "../src/lib/markdown-model";
import { exportHTMLBody } from "../src/lib/html-export";
import { escapedEmojiPositions } from "../src/lib/markdown-extensions";
const glossary =
  "# Terms :rocket:\n\nWorkspace\n:   A **local** collection with [Guide](Guide.md).\n:   Another meaning :smile:.\n\nLong term\n:   First paragraph.\n\n    Second paragraph with :+1:.\n\n    - Nested item\n\n## Details :sparkles:";
it("renders definition lists with multiple meanings and nested Markdown, and derives emoji headings from the shared model", async () => {
  const html = await exportHTMLBody(glossary);
  expect(html.match(/<dl>/g)?.length).toBe(1);
  expect(html).toContain("<dt>Workspace</dt>");
  expect(html.match(/<dd>/g)?.length).toBe(3);
  expect(html).toContain("<strong>local</strong>");
  expect(html).toContain("<li>Nested item</li>");
  expect(html).toContain("😄");
  expect(html).toContain("👍");
  const model = markdownModel(glossary);
  expect(model.headings.map((h) => h.text)).toEqual(["Terms 🚀", "Details ✨"]);
  expect(model.links[0]).toMatchObject({ href: "Guide.md", line: 4 });
  expect(model.statistics.words).toBeGreaterThan(15);
});
it("preserves escapes through entities, container prefixes and stripped callout markers", () => {
  expect([
    ...escapedEmojiPositions(
      "&amp; \\:smile\\: :rocket:",
      "& :smile: :rocket:",
    )!,
  ]).toEqual([2, 8]);
  expect([
    ...escapedEmojiPositions(
      "first\n> \\:smile: :rocket:",
      "first\n:smile: :rocket:",
    )!,
  ]).toEqual([6]);
  expect([
    ...escapedEmojiPositions(
      "[!NOTE]\n> \\:smile: :rocket:",
      ":smile: :rocket:",
    )!,
  ]).toEqual([0]);
  expect(escapedEmojiPositions("unrelated \\:smile:", "different")).toBeNull();
});
it("protects escaped emoji before and after wiki links and within explicit labels", async () => {
  const content =
    "# Escapes\n\n\\:smile: [[Guide|\\:smile: and :rocket:]] and \\:rocket: :smile:.";
  const model = markdownModel(content);
  expect(model.links[0]).toMatchObject({
    href: "wiki:Guide",
    text: ":smile: and 🚀",
  });
  const html = await exportHTMLBody(content);
  expect(html).toContain(":smile: <a");
  expect(html).toContain(":smile: and 🚀");
  expect(html).toContain("and :rocket: 😄.");
});
it("leaves code, math, URLs, unknown names and metadata literal while converting ordinary text", async () => {
  const content =
    '---\ntitle: "Literal :rocket:"\n---\n# Text :rocket:\n\nUnknown :unknown_name_xyz:. Inline `:smile:`.\n\n```js title="literal:smile:.js"\nconst literal = ":smile:";\n```\n\n<https://example.test/:smile:>\n\n[Label :smile:](https://example.test/:rocket:)\n\n$x_{:smile:}$';
  const model = markdownModel(content);
  expect(model.frontmatter.metadata.title).toBe("Literal :rocket:");
  expect(model.statistics.codeBlocks).toBe(1);
  expect(model.links).toMatchObject([
    {
      href: "https://example.test/:smile:",
      text: "https://example.test/:smile:",
    },
    { href: "https://example.test/:rocket:", text: "Label 😄" },
  ]);
  const html = await exportHTMLBody(content);
  expect(html).toContain("Unknown :unknown_name_xyz:");
  expect(html).toContain("<code>:smile:</code>");
  expect(html).toContain('const literal = ":smile:";');
  expect(html).not.toContain("title: Literal");
});
it("standalone HTML keeps media passive and strips active input", async () => {
  const html = await exportHTMLBody(
    "# Safe\n\n![External :smile:](https://media.example.test/pixel.png)\n\n<script>alert(1)</script>\n\n[External](https://example.test/)",
  );
  expect(html).not.toMatch(/<img|<script|onerror/);
  expect(html).toContain(
    "[Image: External :smile: — https://media.example.test/pixel.png]",
  );
  expect(html).toContain('rel="noopener noreferrer" target="_blank"');
});

it("recognizes only literal callout markers while preserving escaped marker text", async () => {
  const html = await exportHTMLBody(
    "> [!NOTE]\n> Real note :rocket:\n\n---\n\n> \\[!NOTE]\n> Literal quote :rocket:",
  );
  expect(html.match(/<strong>NOTE<\/strong>/g)).toHaveLength(1);
  expect(html).toContain("[!NOTE]");
  expect(html).toContain("Literal quote 🚀");
});
