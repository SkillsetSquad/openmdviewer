import { visit, SKIP } from "unist-util-visit";
import { toText } from "hast-util-to-text";
import type { Root, Element } from "hast";
import type { VFile } from "vfile";

/** Runs after sanitizing imported HTML and before KaTeX replaces its source nodes. */
export function rehypeMathTools() {
  return (tree: Root) => {
    visit(tree, "element", (node, index, parent) => {
      if (!parent || typeof index !== "number") return;
      const code =
        node.tagName === "pre" &&
        node.children.length === 1 &&
        node.children[0].type === "element"
          ? node.children[0]
          : node;
      const classes = code.properties.className;
      if (
        code.tagName !== "code" ||
        !Array.isArray(classes) ||
        !classes.some((value) =>
          ["language-math", "math-inline", "math-display"].includes(
            String(value),
          ),
        )
      )
        return;
      const display =
        node.tagName === "pre" || classes.includes("math-display");
      const text = toText(code, { whitespace: "pre" });
      const source = display ? text.replace(/\n$/, "") : text;
      const tooLarge = source.length > 30_000;
      const wrapper: Element = {
        type: "element",
        tagName: "span",
        properties: {
          dataMathSource: source,
          dataMathDisplay: display,
          dataMathLimited: tooLarge,
        },
        children: tooLarge
          ? [
              {
                type: "element",
                tagName: "span",
                properties: {},
                children: [{ type: "text", value: source }],
              },
            ]
          : [node],
      };
      parent.children.splice(index, 1, wrapper);
      return SKIP;
    });
  };
}

/** Keep KaTeX diagnostics visible even when its recovery output is partial MathML. */
export function rehypeMathErrors() {
  return (_tree: Root, file: VFile) => {
    for (const message of file.messages) {
      if (message.source !== "rehype-katex") continue;
      for (const ancestor of message.ancestors || []) {
        if (ancestor.type === "element") {
          const element = ancestor as Element;
          if (typeof element.properties.dataMathSource === "string") {
            element.children = [
              {
                type: "element",
                tagName: "span",
                properties: { className: ["math-invalid-source"] },
                children: [
                  { type: "text", value: element.properties.dataMathSource },
                ],
              },
            ];
            element.properties.dataMathError = String(
              message.cause instanceof Error
                ? message.cause.message
                : message.reason,
            ).slice(0, 500);
          }
        }
      }
    }
  };
}
