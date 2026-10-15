declare module "hast" {
  interface ElementData {
    readerAnchorRepaired?: boolean;
  }
}
import { toText } from "hast-util-to-text";
import type { SourceReference } from "./types";
import { defaultSchema } from "rehype-sanitize";
import { visit } from "unist-util-visit";
import type { Root as MdRoot, Text, Link, Blockquote } from "mdast";
import type { Root as HtmlRoot } from "hast";
import type { VFile } from "vfile";
export const markdownSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    blockquote: [
      ...(defaultSchema.attributes?.blockquote || []),
      "dataCallout",
    ],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto", "tel", "wiki"],
    src: ["http", "https", "asset", "blob"],
  },
};
export function remarkReaderExtensions() {
  return (tree: MdRoot) => {
    visit(tree, "blockquote", (node: Blockquote) => {
      const paragraph = node.children[0];
      if (paragraph?.type !== "paragraph") return;
      const first = paragraph.children[0];
      if (first?.type !== "text") return;
      const match =
        /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|INFO|SUCCESS|ERROR)\](?:\s|$)/i.exec(
          first.value,
        );
      if (match) {
        node.data = {
          ...node.data,
          hProperties: {
            ...node.data?.hProperties,
            dataCallout: match[1].toLowerCase(),
          },
        };
        first.value = first.value.slice(match[0].length);
      }
    });
    visit(tree, "text", (node: Text, index, parent) => {
      if (
        !parent ||
        typeof index !== "number" ||
        parent.type === "link" ||
        parent.type === "linkReference"
      )
        return;
      const matcher = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g;
      const replacement: (Text | Link)[] = [];
      let start = 0;
      for (const match of node.value.matchAll(matcher)) {
        if (match.index! > start)
          replacement.push({
            type: "text",
            value: node.value.slice(start, match.index),
          });
        replacement.push({
          type: "link",
          url: `wiki:${encodeURIComponent(match[1].trim())}`,
          children: [{ type: "text", value: match[2] || match[1] }],
          position: node.position,
        });
        start = match.index! + match[0].length;
      }
      if (!replacement.length) return;
      if (start < node.value.length)
        replacement.push({ type: "text", value: node.value.slice(start) });
      parent.children.splice(index, 1, ...(replacement as never[]));
      return index + replacement.length;
    });
  };
}
// Preserve the sanitizer's DOM-clobbering prefix and repair references to prefixed IDs.
export function rehypeRememberAnchors() {
  return (tree: HtmlRoot, file: VFile) => {
    const ids: string[] = [];
    const rawLinks: SourceReference[] = [];
    visit(tree, "element", (node) => {
      if (node.properties.id) ids.push(String(node.properties.id));
      const image = node.tagName === "img";
      const href = image
        ? node.properties.src
        : node.tagName === "a"
          ? node.properties.href
          : undefined;
      if (
        typeof href === "string" &&
        !("dataFootnoteRef" in node.properties) &&
        !("dataFootnoteBackref" in node.properties)
      )
        rawLinks.push({
          href,
          text: image ? String(node.properties.alt || "") : toText(node),
          line: node.position?.start.line || 1,
          image,
          ...(image ? { alt: String(node.properties.alt || "") } : {}),
        });
    });
    file.data.readerOriginalIds = ids;
    file.data.readerRawLinks = rawLinks;
  };
}
export function rehypeRepairAnchors() {
  return (tree: HtmlRoot, file: VFile) => {
    const existing = new Set<string>();
    visit(tree, "element", (node) => {
      if (node.properties.id) existing.add(String(node.properties.id));
    });
    const aliases: Record<string, string> = Object.create(null);
    for (const id of (file.data.readerOriginalIds as string[]) || []) {
      const prefixed = `user-content-${id}`;
      if (existing.has(prefixed)) aliases[id] = prefixed;
    }
    visit(tree, "element", (node) => {
      if (
        typeof node.properties.href === "string" &&
        node.properties.href.startsWith("#")
      ) {
        try {
          const target = decodeURIComponent(node.properties.href.slice(1));
          if (aliases[target]) {
            node.properties.href = `#${encodeURIComponent(aliases[target])}`;
            node.data = { ...node.data, readerAnchorRepaired: true };
          }
        } catch {}
      }
    });
    file.data.readerAnchorAliases = aliases;
  };
}

export function rehypeHeadingAliases() {
  return (tree: HtmlRoot, file: VFile) => {
    const aliases = (file.data.readerAnchorAliases ||
      Object.create(null)) as Record<string, string>;
    visit(tree, "element", (node) => {
      if (
        /^h[1-6]$/.test(node.tagName) &&
        typeof node.properties.id === "string" &&
        node.properties.id.startsWith("user-content-")
      ) {
        const original = node.properties.id.slice("user-content-".length);
        if (!aliases[original]) aliases[original] = node.properties.id;
      }
    });
    visit(tree, "element", (node) => {
      if (
        !node.data?.readerAnchorRepaired &&
        typeof node.properties.href === "string" &&
        node.properties.href.startsWith("#")
      ) {
        try {
          const target = decodeURIComponent(node.properties.href.slice(1));
          if (aliases[target]) {
            node.properties.href = `#${encodeURIComponent(aliases[target])}`;
            node.data = { ...node.data, readerAnchorRepaired: true };
          }
        } catch {}
      }
    });
    file.data.readerAnchorAliases = aliases;
  };
}
