import { expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import {
  markdownSchema,
  remarkReaderExtensions,
  rehypeCalloutLabels,
} from "../src/lib/markdown-pipeline";
import { remarkReaderEmoji } from "../src/lib/markdown-extensions";
import { markdownModel } from "../src/lib/markdown-model";
import { exportHTMLBody } from "../src/lib/html-export";
async function html(source: string) {
  return String(
    await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkReaderExtensions)
      .use(remarkReaderEmoji)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw)
      .use(rehypeSanitize, markdownSchema)
      .use(rehypeCalloutLabels)
      .use(rehypeStringify)
      .process(source),
  );
}
it("supports eight standard callouts and bounded custom names with default labels", async () => {
  const types = [
    "note",
    "tip",
    "important",
    "warning",
    "caution",
    "info",
    "success",
    "error",
    "release-plan",
  ];
  const output = await html(
    types.map((type) => `> [!${type}]\n> Body.`).join("\n\n"),
  );
  expect(output.match(/data-callout=/g)).toHaveLength(types.length);
  for (const type of types)
    expect(output).toContain(`>${type.replace(/-/g, " ").toUpperCase()}</p>`);
});
it("uses native details/summary for explicit folding and preserves rich titles and literal escapes", async () => {
  const output = await html(
    "> [!TIP]+ **Open** :rocket:\n> Visible \\:smile:.\n\n> [!custom_name]- Closed\n> Hidden :smile:.",
  );
  expect(output).toContain('<details data-callout="tip" open>');
  expect(output).toContain('<details data-callout="custom_name">');
  expect(output).toContain("<strong>Open</strong> 🚀");
  expect(output).toContain("Visible :smile:.");
  expect(output).toContain("Hidden 😄.");
});
it("keeps links, search text and source-line locations in callout titles and bodies", async () => {
  const source =
    "---\ntitle: Callouts\n---\n# Guide\n\n> [!NOTE]- [Title](Title.md) :rocket:\n> Body [[Guide|Go :smile:]] with \\:smile:.\n>\n> ## Inside\n>\n> Paragraph.";
  const model = markdownModel(source);
  expect(model.links).toMatchObject([
    { href: "Title.md", text: "Title", line: 6 },
    { href: "wiki:Guide", text: "Go 😄", line: 7 },
  ]);
  expect(model.headings.map((h) => [h.text, h.line])).toEqual([
    ["Guide", 4],
    ["Inside", 9],
  ]);
  expect(model.paragraphs.map((p) => p.text)).toContain("Title 🚀");
  expect(model.paragraphs.map((p) => p.text)).toContain(
    "Body Go 😄 with :smile:.",
  );
});
it("leaves escaped, encoded, malformed and multiline titles as ordinary quotations", async () => {
  for (const marker of [
    "\\[!NOTE]",
    "&#91;!NOTE]",
    "[!1bad]",
    "[!note]-no-space",
    `[!${"x".repeat(41)}]`,
    "[!note] **cross\n> line**",
  ]) {
    const output = await html(`> ${marker}\n> Body.`);
    expect(output).not.toContain("data-callout");
  }
  expect(
    await html("```markdown\n> [!TIP]- Example\n> Body.\n```"),
  ).not.toContain("data-callout");
});
it("exports all folded content without active markup or duplicate generated labels", async () => {
  const output = await exportHTMLBody(
    "> [!TIP]- **Portable** :rocket:\n> Complete body.\n>\n> > [!custom]+ Nested\n> > Nested body.\n\n> [!NOTE]\n> A note.\n\n> [!ERROR]- <script>alert(1)</script>Title\n> Safe.",
  );
  expect(output).not.toMatch(/<details|<summary|<script|data-callout/);
  expect(output).toContain("Complete body.");
  expect(output).toContain("Nested body.");
  expect(output).toContain("Portable");
  expect(output).toContain("🚀");
  expect(output.match(/<strong>NOTE<\/strong>/g)).toHaveLength(1);
});

it("preserves escaped and ordinary emoji in CRLF callout titles and bodies", async () => {
  const output = await html(
    "> [!TIP]- \\:smile: :rocket:\r\n> \\:rocket: :smile:",
  );
  expect(output).toContain(":smile: 🚀");
  expect(output).toContain(":rocket: 😄");
  expect(await html("> [!NOTE]\r\n> Body.")).toContain('data-callout="note"');
});

it("keeps an accessible label when a title contains only stripped HTML", async () => {
  const output = await html("> [!WARNING]- <script>alert(1)</script>\n> Body.");
  expect(output).toContain('data-callout="warning">WARNING</summary>');
  expect(output).not.toContain("<script");
});
