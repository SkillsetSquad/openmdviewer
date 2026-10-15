import { visit } from "unist-util-visit";
import type { Root } from "hast";
/** Added after sanitization so imported attributes cannot spoof source locations. */
export function rehypeSourceLocations({
  offset = 0,
}: { offset?: number } = {}) {
  return (tree: Root) => {
    visit(tree, "element", (node) => {
      if (
        !node.position ||
        ![
          "p",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "li",
          "pre",
          "code",
          "blockquote",
          "details",
          "summary",
          "table",
          "td",
          "th",
        ].includes(node.tagName)
      )
        return;
      node.properties.dataReaderStart = node.position.start.line + offset;
      node.properties.dataReaderEnd = node.position.end.line + offset;
    });
  };
}
