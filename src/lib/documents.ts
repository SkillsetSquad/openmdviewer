import { markdownModel } from "./markdown-model";
import { metadataString, metadataTags } from "./frontmatter";
import type { Heading, ReaderDocument } from "./types";

export const supportedFile = (name: string) =>
  /\.(md|markdown|mdown|mkd|mdx|txt)$/i.test(name);
import { fileName, safePath } from "./paths";
export { fileName, safePath, resolvePath } from "./paths";
import { resolveDocumentLink } from "./references";
export const documentTitle = (doc: ReaderDocument) =>
  metadataString(markdownModel(doc.content).frontmatter.metadata, "title") ||
  markdownModel(doc.content).headings.find((h) => h.depth === 1)?.text ||
  fileName(doc.path).replace(/\.[^.]+$/, "");
export const documentTags = (doc: ReaderDocument) => [
  ...new Set([
    ...doc.tags,
    ...metadataTags(markdownModel(doc.content).frontmatter.metadata),
  ]),
];
export function headings(content: string): Heading[] {
  return markdownModel(content).headings.map(({ id, text, depth }) => ({
    id,
    text,
    depth,
  }));
}
export function stats(content: string) {
  return markdownModel(content).statistics;
}
export function newDocument(path: string, content: string): ReaderDocument {
  return {
    id: crypto.randomUUID(),
    path: safePath(path),
    content,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: [],
    favorite: false,
    scroll: 0,
  };
}
export function download(
  name: string,
  content: BlobPart,
  type = "text/markdown;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName(name);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function analyze(doc: ReaderDocument, docs: ReaderDocument[]) {
  const issues: { message: string; heading?: string }[] = [];
  const outline = headings(doc.content);
  if (!outline.some((h) => h.depth === 1))
    issues.push({ message: "Add a level-one title." });
  if (outline.filter((h) => h.depth === 1).length > 1)
    issues.push({ message: "Use a single level-one title." });
  outline.forEach((h, i) => {
    if (i && h.depth > outline[i - 1].depth + 1)
      issues.push({
        message: `Skipped heading level: ${h.text}`,
        heading: h.id,
      });
  });
  const seen = new Set<string>();
  outline.forEach((h) => {
    if (seen.has(h.text.toLowerCase()))
      issues.push({ message: `Repeated heading: ${h.text}`, heading: h.id });
    seen.add(h.text.toLowerCase());
  });
  for (const link of markdownModel(doc.content).links) {
    if (link.image) {
      if (!link.alt)
        issues.push({ message: "Add descriptive alt text to images." });
      continue;
    }
    const result = resolveDocumentLink(doc, link.href, docs);
    if (result.external) continue;
    if (!result.target)
      issues.push({ message: `Missing local document: ${result.path}` });
    else if (
      result.anchor &&
      !markdownModel(result.target.content).anchors.includes(
        result.actualAnchor,
      )
    )
      issues.push({ message: `Missing heading: ${result.anchor}` });
  }
  return issues;
}
