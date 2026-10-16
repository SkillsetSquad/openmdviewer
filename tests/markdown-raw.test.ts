import { expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import type { Root } from "hast";
import { VFile } from "vfile";
import { visit } from "unist-util-visit";
import { rehypeRawWhenNeeded } from "../src/lib/markdown-raw";
import { markdownSchema } from "../src/lib/markdown-pipeline";
const render = (
  source: string,
  raw: typeof rehypeRaw | typeof rehypeRawWhenNeeded,
) =>
  String(
    unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(raw)
      .use(rehypeSanitize, markdownSchema)
      .use(rehypeStringify)
      .processSync(source),
  );
// Compare semantic HTML, ignoring structural whitespace at the root and
// inside table containers (also ignored by the reader table/JSX renderers).
// Keep text inside paragraphs, cells, pre and code intact.
function canonicalHTML(html: string) {
  const processor = unified().use(rehypeRaw).use(rehypeStringify);
  const tree = processor.runSync(
    { type: "root", children: [{ type: "raw", value: html }] },
    new VFile({ value: html }),
  );
  visit(tree, (node) => {
    if (
      node.type === "root" ||
      (node.type === "element" &&
        ["table", "thead", "tbody", "tfoot", "tr"].includes(node.tagName))
    ) {
      node.children = node.children.filter(
        (child) => child.type !== "text" || child.value.trim() !== "",
      );
    }
  });
  return String(processor.stringify(tree));
}
it("reuses a structured tree without raw nodes and preserves its source positions", () => {
  const tree: Root = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "p",
        properties: {},
        children: [
          {
            type: "text",
            value: "Plain text",
            position: {
              start: { line: 2, column: 1, offset: 2 },
              end: { line: 2, column: 11, offset: 12 },
            },
          },
        ],
      },
    ],
  };
  const before = structuredClone(tree);
  expect(rehypeRawWhenNeeded()(tree, new VFile())).toBe(tree);
  expect(tree).toEqual(before);
});
it.each([
  "# Plain heading\n\nA paragraph with **bold**, _emphasis_, ~~old~~ and [link](guide.md#section).",
  "# Heading\n\n- [x] Finished\n- [ ] Pending\n  - Nested\n\n> Quote\n\n---",
  "| Name | Count |\n| --- | ---: |\n| First | 12 |\n| Second | 5 |",
  "# References\n\n[Named][ref] and a note[^n].\n\n[ref]: guide.md\n[^n]: Footnote **text**.",
  "# Unicode مرحبا\n\nनमस्ते 🌱 and escaped \\*literal\\*.\n\n```html\n<script>literal code</script>\n```",
])("preserves the sanitized semantic HTML of plain Markdown: %s", (source) => {
  expect(canonicalHTML(render(source, rehypeRawWhenNeeded))).toBe(
    canonicalHTML(render(source, rehypeRaw)),
  );
});
it("retains exact generated footnote attribute normalization", () => {
  const source = "# Note\n\nText[^n].\n\n[^n]: Kept footnote.";
  expect(render(source, rehypeRawWhenNeeded)).toBe(render(source, rehypeRaw));
});
it.each([
  '# Mixed\n\n<div id="section"><b>Safe</b><script>alert(1)</script><img src="pixel.png" onerror="alert(1)"></div>',
  '> Nested **text** with <span onclick="bad()">inline HTML</span> and <a href="javascript:bad()">unsafe URL</a>.',
  "<details><summary>More</summary>\n\n## Nested heading\n\n**Formatted** body.\n\n</details>",
  "<table><tr><td>One</td><td><b>Two</b></td></tr></table>",
  '<!-- a raw comment -->\n\n# Normal heading\n\n<svg onload="bad()"><script>bad()</script></svg>',
  '<Component run={bad()} />\n\nexport const value = "inert";',
])("keeps raw HTML on the existing parser and sanitizer path: %s", (source) => {
  const result = render(source, rehypeRawWhenNeeded);
  expect(result).toBe(render(source, rehypeRaw));
  expect(result).not.toMatch(
    /<script|onerror=|onclick=|onload=|href="javascript:/i,
  );
});
it("still removes unsafe properties from structured trees without raw nodes", () => {
  const tree: Root = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "a",
        properties: { href: "javascript:bad()", onClick: "bad()" },
        children: [{ type: "text", value: "Link" }],
      },
    ],
  };
  const result = unified()
    .use(rehypeRawWhenNeeded)
    .use(rehypeSanitize, markdownSchema)
    .runSync(tree);
  expect(result.children[0]).toMatchObject({
    type: "element",
    tagName: "a",
    properties: {},
  });
});
