import rehypeRaw from "rehype-raw";
import { visit, EXIT } from "unist-util-visit";
import type { Root } from "hast";
import type { VFile } from "vfile";

// remark-rehype already produces a structured tree for plain Markdown. Raw
// nodes and generated footnote data attributes retain the existing HTML
// normalization path; both may occur at any depth in the tree.
const parseRaw = rehypeRaw();
export function rehypeRawWhenNeeded() {
  return (tree: Root, file: VFile): Root => {
    let needsHTML = false;
    visit(tree, (node) => {
      if (
        node.type === "raw" ||
        (node.type === "element" &&
          ("dataFootnoteRef" in node.properties ||
            "dataFootnotes" in node.properties))
      ) {
        needsHTML = true;
        return EXIT;
      }
    });
    return needsHTML ? parseRaw(tree, file) : tree;
  };
}
