import GithubSlugger from "github-slugger";
import type { Heading, ReaderDocument } from "./types";

export const supportedFile = (name: string) =>
  /\.(md|markdown|mdown|mkd|mdx|txt)$/i.test(name);
export const fileName = (path: string) => path.split("/").pop() || path;
export const documentTitle = (doc: ReaderDocument) =>
  doc.content.match(/^#\s+(.+)$/m)?.[1] ||
  fileName(doc.path).replace(/\.[^.]+$/, "");
export function headings(content: string): Heading[] {
  const slugger = new GithubSlugger();
  const clean = content.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, "");
  return [...clean.matchAll(/^(#{1,6})\s+(.+?)\s*#*\s*$/gm)].map((m) => ({
    id: slugger.slug(m[2]),
    text: m[2],
    depth: m[1].length,
  }));
}
export function stats(content: string) {
  const words = content.trim() ? content.trim().split(/\s+/u).length : 0;
  const tasks = [...content.matchAll(/^\s*[-*]\s+\[([ xX])\]/gm)];
  return {
    words,
    characters: content.length,
    minutes: Math.max(1, Math.ceil(words / 220)),
    headings: headings(content).length,
    codeBlocks: [...content.matchAll(/^```/gm)].length / 2,
    images: [...content.matchAll(/!\[[^\]]*\]\([^)]+\)/g)].length,
    links: [...content.matchAll(/(?<!!)\[[^\]]+\]\([^)]+\)/g)].length,
    tasks: tasks.length,
    completed: tasks.filter((t) => t[1].toLowerCase() === "x").length,
  };
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
export function safePath(path: string): string {
  return (
    path
      .replace(/\\/g, "/")
      .split("/")
      .filter((s) => s && s !== "." && s !== "..")
      .join("/") || "Untitled.md"
  );
}
export function resolvePath(from: string, href: string) {
  const stack = from.split("/").slice(0, -1);
  for (const part of decodeURIComponent(href).split("/")) {
    if (part === "..") stack.pop();
    else if (part && part !== ".") stack.push(part);
  }
  return stack.join("/");
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
  for (const m of doc.content.matchAll(/(?<!!)\[[^\]]*\]\(([^)]+)\)/g)) {
    if (/^(https?:|mailto:)/i.test(m[1])) continue;
    const [path, anchor] = m[1].split("#");
    const target = path
      ? docs.find((d) => d.path === resolvePath(doc.path, path))
      : doc;
    if (!target) issues.push({ message: `Missing local document: ${path}` });
    else if (anchor && !headings(target.content).some((h) => h.id === anchor))
      issues.push({ message: `Missing heading: ${anchor}` });
  }
  if (/!\[\s*\]\(/.test(doc.content))
    issues.push({ message: "Add descriptive alt text to images." });
  return issues;
}
