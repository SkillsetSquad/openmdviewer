import { expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeKatex from "rehype-katex";
import { visit } from "unist-util-visit";
import type { Element, Root } from "hast";
import { markdownSchema } from "../src/lib/markdown-pipeline";
import { rehypeMathTools, rehypeMathErrors } from "../src/lib/math-tools";
async function render(content: string) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize, markdownSchema)
    .use(rehypeMathTools)
    .use(rehypeKatex, { trust: false, maxExpand: 1000, maxSize: 20 })
    .use(rehypeMathErrors);
  return (await processor.run(processor.parse(content))) as Root;
}
function equations(tree: Root) {
  const found: Element[] = [];
  visit(tree, "element", (node) => {
    if (typeof node.properties.dataMathSource === "string") found.push(node);
  });
  return found;
}
it("preserves exact inline, display, and fenced math sources before KaTeX replacement", async () => {
  const found = equations(
    await render(
      "Inline $x^2 + y^2$.\n\n$$\n\\frac{1}{2} \\tag{A}\n$$\n\n```math\nE=mc^2\n```",
    ),
  );
  expect(
    found.map((node) => [
      node.properties.dataMathSource,
      node.properties.dataMathDisplay,
    ]),
  ).toEqual([
    ["x^2 + y^2", false],
    ["\\frac{1}{2} \\tag{A}", true],
    ["E=mc^2", true],
  ]);
  const math: Element[] = [];
  visit(found[0], "element", (node) => {
    if (node.tagName === "math") math.push(node);
  });
  expect(math).toHaveLength(1);
});
it("does not recognize ordinary code or attacker-provided control attributes", async () => {
  const tree = await render(
    '`x^2`\n\n```tex\nx^2\n```\n\n<span data-math-source="fake" data-math-display="true">Fake</span>',
  );
  expect(equations(tree)).toHaveLength(0);
});
it("leaves oversized expressions as literal bounded-view content without KaTeX rendering", async () => {
  const found = equations(await render(`$$\n${"x".repeat(30001)}\n$$`));
  expect(found[0].properties.dataMathLimited).toBe(true);
  expect(found[0].properties.dataMathSource).toBe("x".repeat(30001));
  let math = 0;
  visit(found[0], "element", (node) => {
    if (node.tagName === "math") math++;
  });
  expect(math).toBe(0);
});
it("does not emit active links or external images from untrusted LaTeX", async () => {
  const tree = await render(
    "$\\href{javascript:alert(1)}{Click}$\n\n$$\n\\includegraphics{https://example.test/pixel.png}\n$$",
  );
  const active: Element[] = [];
  visit(tree, "element", (node) => {
    if (["a", "img", "script", "iframe"].includes(node.tagName))
      active.push(node);
  });
  expect(active).toEqual([]);
});

it("retains visible diagnostics for partially recovered equations", async () => {
  const found = equations(await render("$\\notARealCommand{x}$"));
  expect(found[0].properties.dataMathError).toContain(
    "Undefined control sequence",
  );
});
