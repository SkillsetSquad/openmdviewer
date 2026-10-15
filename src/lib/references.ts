import { fileName, resolvePath } from "./paths";
import { markdownModel, type MarkdownModel } from "./markdown-model";
import { metadataString, metadataTags } from "./frontmatter";
import type { ReaderDocument } from "./types";
export type LinkedDocument = Pick<ReaderDocument, "id" | "path" | "content">;
export interface ReferenceIndex<T extends LinkedDocument> {
  paths: Map<string, T>;
  lower: Map<string, T[]>;
  names: Map<string, T[]>;
  models?: Map<string, MarkdownModel>;
}
export function referenceIndex<T extends LinkedDocument>(
  documents: T[],
  models?: Map<string, MarkdownModel>,
): ReferenceIndex<T> {
  const paths = new Map<string, T>(),
    lower = new Map<string, T[]>(),
    names = new Map<string, T[]>();
  for (const doc of documents) {
    paths.set(doc.path, doc);
    lower.set(doc.path.toLowerCase(), [
      ...(lower.get(doc.path.toLowerCase()) || []),
      doc,
    ]);
    const name = fileName(doc.path);
    names.set(name, [...(names.get(name) || []), doc]);
  }
  return { paths, lower, names, models };
}
export interface ResolvedReference<T extends LinkedDocument = ReaderDocument> {
  target?: T;
  path: string;
  anchor: string;
  actualAnchor: string;
  external: boolean;
  error?: "missing" | "ambiguous" | "invalid" | "unsupported";
  caseMatch?: T;
}
export function resolveDocumentLink<T extends LinkedDocument>(
  from: T,
  href: string,
  documents: T[],
  lookup = referenceIndex(documents),
): ResolvedReference<T> {
  const empty = { path: "", anchor: "", actualAnchor: "", external: false };
  try {
    const raw = href.trim();
    if (/^(https?:|mailto:|tel:|\/\/)/i.test(raw))
      return { ...empty, external: true, path: raw };
    const wiki = raw.startsWith("wiki:");
    if (!wiki && /^[a-z][a-z\d+.-]*:/i.test(raw))
      return { ...empty, path: raw, error: "unsupported" };
    const value = wiki ? decodeURIComponent(raw.slice(5)) : raw;
    const hash = value.indexOf("#");
    const pathname = (hash < 0 ? value : value.slice(0, hash)).split("?")[0];
    const anchor = hash < 0 ? "" : decodeURIComponent(value.slice(hash + 1));
    const path = pathname ? resolvePath(from.path, pathname) : from.path;
    let target: T | undefined;
    if (!pathname) target = from;
    else if (wiki) {
      const variants = [path, `${path}.md`, `${path}.markdown`, `${path}.mdx`];
      target = variants.map((v) => lookup.paths.get(v)).find(Boolean);
      if (!target) {
        const original = decodeURIComponent(pathname).replace(/^\//, "");
        const names = [
          original,
          `${original}.md`,
          `${original}.markdown`,
          `${original}.mdx`,
        ];
        const matches = [
          ...new Map(
            names
              .flatMap((name) => [
                ...(lookup.paths.has(name) ? [lookup.paths.get(name)!] : []),
                ...(lookup.names.get(name) || []),
              ])
              .map((d) => [d.id, d]),
          ).values(),
        ];
        if (matches.length > 1)
          return { ...empty, path: original, anchor, error: "ambiguous" };
        target = matches[0];
      }
    } else target = lookup.paths.get(path);
    const model =
      target && anchor
        ? lookup.models?.get(target.id) || markdownModel(target.content)
        : undefined;
    const actualAnchor = model
      ? model.anchors.includes(anchor)
        ? anchor
        : model.anchorAliases[anchor] || anchor
      : anchor;
    return {
      target,
      path,
      anchor,
      actualAnchor,
      external: false,
      ...(!target
        ? {
            error: "missing" as const,
            caseMatch:
              lookup.lower.get(path.toLowerCase())?.length === 1
                ? lookup.lower.get(path.toLowerCase())![0]
                : undefined,
          }
        : {}),
    };
  } catch {
    return { ...empty, path: href, error: "invalid" };
  }
}
export interface DocumentEdge {
  from: string;
  to: string;
  count: number;
  line: number;
}
export interface DocumentSummary {
  id: string;
  path: string;
  title: string;
  tags: string[];
  words: number;
}
export interface WorkspaceNavigation {
  edges: DocumentEdge[];
  summaries: DocumentSummary[];
}
export function workspaceNavigation<
  T extends LinkedDocument & { tags?: string[] },
>(documents: T[], models?: Map<string, MarkdownModel>): WorkspaceNavigation {
  const lookup = referenceIndex(documents, models);
  const edges = new Map<string, DocumentEdge>();
  const summaries = documents.map((doc) => {
    const model = models?.get(doc.id) || markdownModel(doc.content);
    for (const link of model.links) {
      if (link.image) continue;
      const target = resolveDocumentLink(
        doc,
        link.href,
        documents,
        lookup,
      ).target;
      if (!target || target.id === doc.id) continue;
      const key = JSON.stringify([doc.id, target.id]);
      const existing = edges.get(key);
      if (existing) existing.count++;
      else
        edges.set(key, {
          from: doc.id,
          to: target.id,
          count: 1,
          line: link.line,
        });
    }
    return {
      id: doc.id,
      path: doc.path,
      title:
        metadataString(model.frontmatter.metadata, "title") ||
        model.headings.find((h) => h.depth === 1)?.text ||
        fileName(doc.path),
      tags: [
        ...new Set([
          ...(doc.tags || []),
          ...metadataTags(model.frontmatter.metadata),
        ]),
      ],
      words: model.statistics.words,
    };
  });
  return { edges: [...edges.values()], summaries };
}
export function documentBacklinks(
  target: ReaderDocument,
  documents: ReaderDocument[],
): ReaderDocument[] {
  const index = referenceIndex(documents);
  return documents.filter(
    (d) =>
      d.id !== target.id &&
      markdownModel(d.content).links.some(
        (link) =>
          !link.image &&
          resolveDocumentLink(d, link.href, documents, index).target?.id ===
            target.id,
      ),
  );
}
