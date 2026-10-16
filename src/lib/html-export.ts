import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import { rehypeRawWhenNeeded } from "./markdown-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import rehypeSlug from "rehype-slug";
import { visit, SKIP } from "unist-util-visit";
import type { Root } from "hast";
import { VFile } from "vfile";
import { frontmatter } from "./frontmatter";
import {
  markdownSchema,
  remarkReaderExtensions,
  rehypeCalloutLabels,
  rehypeRememberAnchors,
  rehypeRepairAnchors,
  rehypeHeadingAliases,
} from "./markdown-pipeline";
import {
  remarkDefinitionList,
  defListHastHandlers,
  remarkReaderEmoji,
} from "./markdown-extensions";
function exportPresentation() {
  return (tree: Root) => {
    const ids = new Set<string>();
    visit(tree, "element", (node) => {
      if (node.properties.id) ids.add(String(node.properties.id));
    });
    visit(tree, "element", (node, index, parent) => {
      if (
        ["img", "audio", "video", "source", "track"].includes(node.tagName) &&
        parent &&
        typeof index === "number"
      ) {
        const references = [
          node.properties.src,
          ...node.children.flatMap((child) =>
            child.type === "element" ? [child.properties.src] : [],
          ),
        ].filter((value) => typeof value === "string");
        parent.children.splice(index, 1, {
          type: "text",
          value: `[${node.tagName === "img" ? `Image: ${String(node.properties.alt || "image")}` : `Media: ${node.tagName}`} — ${references.join(", ") || "not embedded"}]`,
        });
        return SKIP;
      }
      if (node.properties.dataCallout) {
        // Flatten disclosures for a portable, fully readable and printable export.
        if (node.tagName === "details") {
          node.tagName = "blockquote";
          delete node.properties.open;
        }
        if (node.tagName === "summary") node.tagName = "p";
        delete node.properties.dataCallout;
      }
      if (
        node.tagName === "p" &&
        Array.isArray(node.properties.className) &&
        node.properties.className.includes("callout-label")
      ) {
        node.children = [
          {
            type: "element",
            tagName: "strong",
            properties: {},
            children: node.children,
          },
        ];
        delete node.properties.className;
      }
      delete node.properties.dataCodeMeta;
      delete node.properties.dataCodeBlock;
      if (node.tagName === "a" && typeof node.properties.href === "string") {
        if (/^https?:|^\/\//i.test(node.properties.href)) {
          node.properties.rel = ["noopener", "noreferrer"];
          node.properties.target = "_blank";
        }
        if (node.properties.href.startsWith("wiki:")) {
          delete node.properties.href;
          node.properties.title =
            "Workspace wiki reference (requires the reader)";
        }
        if (
          typeof node.properties.href === "string" &&
          node.properties.href.startsWith("#")
        )
          try {
            const fragment = decodeURIComponent(node.properties.href.slice(1));
            if (!ids.has(fragment) && ids.has(`user-content-${fragment}`))
              node.properties.href = `#${encodeURIComponent(`user-content-${fragment}`)}`;
          } catch {}
      }
    });
  };
}
export async function exportHTMLTree(content: string): Promise<Root> {
  const file = new VFile({ value: frontmatter(content).body });
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDefinitionList)
    .use(remarkReaderExtensions)
    .use(remarkReaderEmoji)
    .use(remarkRehype, {
      allowDangerousHtml: true,
      handlers: defListHastHandlers,
    })
    .use(rehypeRawWhenNeeded)
    .use(rehypeRememberAnchors)
    .use(rehypeSanitize, markdownSchema)
    .use(rehypeCalloutLabels)
    .use(rehypeRepairAnchors)
    .use(rehypeSlug, { prefix: "user-content-" })
    .use(rehypeHeadingAliases);
  return (await processor.run(processor.parse(file), file)) as Root;
}
export async function exportHTMLBody(content: string) {
  const tree = await exportHTMLTree(content);
  exportPresentation()(tree);
  return String(unified().use(rehypeStringify).stringify(tree));
}
