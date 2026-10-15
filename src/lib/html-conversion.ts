import { defaultHandlers, type Handle } from "hast-util-to-mdast";
import GithubSlugger from "github-slugger";
import { toString as markdownText } from "mdast-util-to-string";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeRemark from "rehype-remark";
import remarkStringify from "remark-stringify";
import remarkGfm from "remark-gfm";
import type { Element, Root, RootContent } from "hast";
import type { Root as MarkdownRoot } from "mdast";
import { stringify as yamlStringify } from "yaml";
import type { ReaderAsset } from "./types";
import { fileName, resolvePath } from "./paths";

export const conversionLimits = {
  input: 30 * 1024 * 1024,
  output: 10 * 1024 * 1024,
  expanded: 100 * 1024 * 1024,
  entries: 10000,
  nodes: 200000,
  depth: 256,
};
const droppedTags = new Set([
  "head",
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "template",
  "noscript",
  "form",
  "button",
  "canvas",
]);
const imageTypes: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};
export const imageExtension = (type: string) => imageTypes[type.toLowerCase()];
export function localAssetReference(from: string, target: string) {
  const a = from.split("/").slice(0, -1),
    b = target.split("/");
  while (a.length && a[0] === b[0]) {
    a.shift();
    b.shift();
  }
  return [...a.map(() => ".."), ...b]
    .map((part) => (part === ".." ? part : encodeURIComponent(part)))
    .join("/");
}
export async function htmlToMarkdown(
  html: string,
  outputPath: string,
  convertedPaths: Map<string, string>,
  embedded: ReaderAsset[] = [],
  pdfPages: Map<string, Record<number, string>> = new Map(),
) {
  if (new TextEncoder().encode(html).length > conversionLimits.output)
    throw new Error(
      "HTML conversion supports up to 10 MB of source/generated HTML.",
    );
  let markup = 0;
  for (
    let offset = html.indexOf("<");
    offset >= 0;
    offset = html.indexOf("<", offset + 1)
  ) {
    if (++markup > conversionLimits.nodes * 2)
      throw new Error("HTML exceeds the markup complexity limit.");
  }
  const tree = unified().use(rehypeParse).parse(html) as Root;
  const warnings: string[] = [];
  const assets = [...embedded];
  let nodes = 0,
    removed = 0,
    imageIndex = embedded.length,
    title = "",
    bytes = embedded.reduce((sum, asset) => sum + asset.blob.size, 0);
  const base = outputPath.split("/").slice(0, -1).join("/");
  const prefix = `${base ? base + "/" : ""}_converted/${fileName(outputPath).replace(/\.md$/i, "")}`;
  function walk(parent: Root | Element, depth: number) {
    if (depth > conversionLimits.depth)
      throw new Error("HTML exceeds the 256-level conversion limit.");
    const children: RootContent[] = [];
    for (const child of parent.children) {
      if (++nodes > conversionLimits.nodes)
        throw new Error("HTML exceeds the 200,000-node conversion limit.");
      if (child.type !== "element") {
        children.push(child as RootContent);
        continue;
      }
      if (child.tagName === "head") {
        const titleNode = child.children.find(
          (item) => item.type === "element" && item.tagName === "title",
        ) as Element | undefined;
        title =
          titleNode?.children
            .filter((item) => item.type === "text")
            .map((item) => (item.type === "text" ? item.value : ""))
            .join("")
            .trim() || "";
        if (
          child.children.some(
            (item) => item.type === "element" && item.tagName === "base",
          )
        )
          warnings.push(
            "The HTML base URL was ignored. Relative links resolve within this workspace.",
          );
      }
      if (
        droppedTags.has(child.tagName) ||
        (child.tagName === "input" && child.properties.type !== "checkbox")
      ) {
        removed++;
        continue;
      }
      if (
        child.properties.hidden === true ||
        child.properties.ariaHidden === "true"
      ) {
        removed++;
        continue;
      }
      walk(child, depth + 1);
      if (child.tagName === "a" && typeof child.properties.href === "string") {
        const href = child.properties.href;
        if (!/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href)) {
          try {
            const [pathname, fragment] = href.split("#", 2),
              query = pathname.includes("?")
                ? pathname.slice(pathname.indexOf("?"))
                : "",
              target = convertedPaths.get(
                resolvePath(outputPath, pathname.split("?")[0]),
              );
            if (target) {
              const requestedPage =
                fragment &&
                /^page=(\d+)(?:&.*)?$/i.exec(decodeURIComponent(fragment));
              const pdfAnchor =
                requestedPage &&
                pdfPages.get(target)?.[Number(requestedPage[1])];
              child.properties.href =
                localAssetReference(outputPath, target) +
                query +
                (pdfAnchor
                  ? "#" + encodeURIComponent(pdfAnchor)
                  : fragment === undefined
                    ? ""
                    : "#" + fragment);
            }
          } catch {
            warnings.push("A malformed relative link could not be resolved.");
          }
        }
      }
      if (child.tagName === "img") {
        const src = child.properties.src;
        if (typeof src === "string" && /^data:/i.test(src)) {
          const match = /^data:([^;,]+);base64,([a-z\d+/=\s]*)$/i.exec(src),
            type = match?.[1].toLowerCase(),
            ext = type && imageExtension(type);
          if (!match || !ext) {
            delete child.properties.src;
            warnings.push("An unsupported embedded image was omitted.");
          } else {
            const data = Uint8Array.from(
              atob(match[2].replace(/\s/g, "")),
              (c) => c.charCodeAt(0),
            );
            bytes += data.length;
            if (
              data.length > conversionLimits.input ||
              bytes > conversionLimits.expanded
            )
              throw new Error(
                "Embedded images exceed the conversion size limit.",
              );
            const path = `${prefix}/image-${++imageIndex}.${ext}`;
            assets.push({
              path,
              type: type!,
              blob: new Blob([data as BlobPart], { type }),
            });
            child.properties.src = localAssetReference(outputPath, path);
          }
        }
        if (!child.properties.src) {
          children.push({
            type: "text",
            value: String(child.properties.alt || "[Image unavailable]"),
          });
          continue;
        }
      }
      children.push(child);
    }
    parent.children = children as Element["children"];
  }
  walk(tree, 0);
  if (removed)
    warnings.push(
      `${removed} non-reading or active HTML elements were omitted. Styling and interactive behavior are not converted.`,
    );
  const sanitized = await unified()
    .use(rehypeSanitize, {
      ...defaultSchema,
      clobberPrefix: "",
      attributes: {
        ...defaultSchema.attributes,
        code: [
          ...(defaultSchema.attributes?.code || []),
          ["className", /^language-/],
        ],
        input: ["type", "checked", "disabled"],
      },
    })
    .run(tree);
  const anchorIds = new Set<string>();
  const headingSlugger = new GithubSlugger();
  const handlers: Record<string, Handle> = {};
  const escapeAttribute = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character]!,
    );
  for (const [tag, handler] of Object.entries(defaultHandlers)) {
    if (!handler) continue;
    handlers[tag] = (state, node) => {
      const id =
        node.properties.id || (tag === "a" ? node.properties.name : undefined);
      const converted =
        tag === "a" && !node.properties.href
          ? state.all(node)
          : handler(state, node);
      if (
        converted &&
        !Array.isArray(converted) &&
        converted.type === "heading"
      ) {
        const slug = headingSlugger.slug(markdownText(converted));
        if (id === slug) return converted;
      }
      if (typeof id !== "string" || !id || anchorIds.has(id)) return converted;
      anchorIds.add(id);
      return [
        { type: "html", value: `<a id="${escapeAttribute(id)}"></a>` },
        ...(Array.isArray(converted)
          ? converted
          : converted
            ? [converted]
            : []),
      ];
    };
  }
  const processor = unified()
    .use(rehypeRemark, { handlers })
    .use(remarkGfm)
    .use(remarkStringify, { bullet: "-", fences: true, emphasis: "_" });
  const markdownTree = (await processor.run(
    sanitized,
  )) as unknown as MarkdownRoot;
  const body = processor.stringify(markdownTree);
  const markdown = title
    ? `---\n${yamlStringify({ title: title.slice(0, 1000) })}---\n\n${body}`
    : body;
  if (new TextEncoder().encode(markdown).length > conversionLimits.output)
    throw new Error("Converted Markdown exceeds the 10 MB output limit.");
  if (!body.trim())
    warnings.push(
      "No readable body content was extracted. Review the empty result before importing.",
    );
  return { markdown, assets, warnings };
}
