import {
  remarkDefinitionList,
  defListHastHandlers,
  remarkReaderEmoji,
} from "./markdown-extensions";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import { rehypeRawWhenNeeded } from "./markdown-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import { visit } from "unist-util-visit";
import { toText } from "hast-util-to-text";
import { toString } from "mdast-util-to-string";
import { VFile } from "vfile";
import type { Root as HtmlRoot } from "hast";
import type { Root as MdRoot } from "mdast";
import { frontmatter } from "./frontmatter";
import {
  markdownSchema,
  remarkReaderExtensions,
  rehypeCalloutLabels,
  rehypeRememberAnchors,
  rehypeRepairAnchors,
  rehypeHeadingAliases,
} from "./markdown-pipeline";
export interface ModelHeading {
  id: string;
  text: string;
  depth: number;
  line: number;
}
export interface ModelLink {
  href: string;
  text: string;
  line: number;
  image: boolean;
  alt?: string;
}
export interface MarkdownModel {
  frontmatter: ReturnType<typeof frontmatter>;
  headings: ModelHeading[];
  anchors: string[];
  anchorLocations: { id: string; line: number }[];
  anchorAliases: Record<string, string>;
  links: ModelLink[];
  rawLinks: ModelLink[];
  paragraphs: { text: string; line: number }[];
  sourceBlocks: {
    start: number;
    end: number;
    startOffset: number;
    endOffset: number;
  }[];
  statistics: {
    words: number;
    characters: number;
    minutes: number;
    headings: number;
    codeBlocks: number;
    images: number;
    links: number;
    tasks: number;
    completed: number;
    paragraphs: number;
    sentences: number;
    tables: number;
  };
}
const modelCacheCharacters = 4 * 1024 * 1024;
const modelCacheEntries = 24;
const cache = new Map<string, MarkdownModel>();
let cachedSize = 0;
const parser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkDefinitionList)
  .use(remarkReaderExtensions)
  .use(remarkReaderEmoji);
const html = unified()
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
export function markdownModel(content: string): MarkdownModel {
  const saved = cache.get(content);
  if (saved) {
    cache.delete(content);
    cache.set(content, saved);
    return saved;
  }
  const meta = frontmatter(content);
  const file = new VFile({ value: meta.body });
  const parsed = parser.runSync(parser.parse(file), file) as MdRoot;
  const rendered = html.runSync(parsed, file) as HtmlRoot;
  const headings: ModelHeading[] = [];
  const anchors: string[] = [];
  const anchorLocations: { id: string; line: number }[] = [];
  const links: ModelLink[] = [];
  const paragraphs: { text: string; line: number }[] = [];
  const sourceBlocks: MarkdownModel["sourceBlocks"] = [];
  let codeBlocks = 0,
    tasks = 0,
    completed = 0,
    tables = 0;
  visit(parsed, (node) => {
    if (node.type === "code") codeBlocks++;
    if (
      ["code", "math", "inlineMath", "html"].includes(node.type) &&
      node.position
    )
      sourceBlocks.push({
        start: node.position.start.line + meta.lineOffset,
        end: node.position.end.line + meta.lineOffset,
        startOffset:
          (node.position.start.offset || 0) + content.length - meta.body.length,
        endOffset:
          (node.position.end.offset || 0) + content.length - meta.body.length,
      });
    if (node.type === "listItem" && typeof node.checked === "boolean") {
      tasks++;
      if (node.checked) completed++;
    }
    if (node.type === "paragraph")
      paragraphs.push({
        text: toString(node),
        line: (node.position?.start.line || 1) + meta.lineOffset,
      });
  });
  visit(rendered, "element", (node) => {
    const line = (node.position?.start.line || 1) + meta.lineOffset;
    if (node.properties.id) {
      anchors.push(String(node.properties.id));
      anchorLocations.push({ id: String(node.properties.id), line });
    }
    if (
      /^h[1-6]$/.test(node.tagName) &&
      node.position &&
      !node.properties.className?.toString().includes("sr-only")
    )
      headings.push({
        id: String(node.properties.id || ""),
        text: toText(node),
        depth: Number(node.tagName[1]),
        line,
      });
    if (
      node.tagName === "a" &&
      typeof node.properties.href === "string" &&
      !node.properties.dataFootnoteBackref &&
      !node.properties.dataFootnoteRef
    )
      links.push({
        href: node.properties.href,
        text: toText(node),
        line,
        image: false,
      });
    if (node.tagName === "img" && typeof node.properties.src === "string")
      links.push({
        href: node.properties.src,
        text: String(node.properties.alt || ""),
        alt: String(node.properties.alt || ""),
        line,
        image: true,
      });
    if (node.tagName === "table") tables++;
  });
  const text = toText(rendered);
  const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
  const model: MarkdownModel = {
    frontmatter: meta,
    headings,
    anchors,
    anchorLocations,
    anchorAliases: (file.data.readerAnchorAliases || {}) as Record<
      string,
      string
    >,
    links,
    rawLinks: ((file.data.readerRawLinks || []) as ModelLink[]).map((link) => ({
      ...link,
      line: link.line + meta.lineOffset,
    })),
    paragraphs,
    sourceBlocks,
    statistics: {
      words,
      characters: meta.body.length,
      minutes: Math.max(1, Math.ceil(words / 220)),
      headings: headings.length,
      codeBlocks,
      images: links.filter((l) => l.image).length,
      links: links.filter((l) => !l.image).length,
      tasks,
      completed,
      paragraphs: paragraphs.length,
      sentences: text.split(/[.!?。！？]+(?:\s|$)/u).filter((s) => s.trim())
        .length,
      tables,
    },
  };
  // Entries that fit the total budget can be reused, including manuals above 1 MiB.
  if (content.length <= modelCacheCharacters) {
    cache.set(content, model);
    cachedSize += content.length;
    while (
      cache.size > modelCacheEntries ||
      cachedSize > modelCacheCharacters
    ) {
      const oldest = cache.keys().next().value!;
      cachedSize -= oldest.length;
      cache.delete(oldest);
    }
  }
  return model;
}
