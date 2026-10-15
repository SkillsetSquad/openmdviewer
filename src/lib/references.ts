import { fileName, resolvePath } from "./paths";
import { markdownModel } from "./markdown-model";
import type { ReaderDocument } from "./types";
export interface ResolvedReference {
  target?: ReaderDocument;
  path: string;
  anchor: string;
  actualAnchor: string;
  external: boolean;
  error?: "missing" | "ambiguous" | "invalid" | "unsupported";
  caseMatch?: ReaderDocument;
}
export function resolveDocumentLink(
  from: ReaderDocument,
  href: string,
  documents: ReaderDocument[],
): ResolvedReference {
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
    let target: ReaderDocument | undefined;
    if (!pathname) target = from;
    else if (wiki) {
      const variants = [path, `${path}.md`, `${path}.markdown`, `${path}.mdx`];
      target = documents.find((d) => variants.includes(d.path));
      if (!target) {
        const original = decodeURIComponent(pathname).replace(/^\//, "");
        const matches = documents.filter(
          (d) =>
            [
              original,
              `${original}.md`,
              `${original}.markdown`,
              `${original}.mdx`,
            ].includes(d.path) ||
            [
              original,
              `${original}.md`,
              `${original}.markdown`,
              `${original}.mdx`,
            ].includes(fileName(d.path)),
        );
        if (matches.length > 1)
          return { ...empty, path: original, anchor, error: "ambiguous" };
        target = matches[0];
      }
    } else target = documents.find((d) => d.path === path);
    const actualAnchor =
      target && anchor
        ? markdownModel(target.content).anchors.includes(anchor)
          ? anchor
          : markdownModel(target.content).anchorAliases[anchor] || anchor
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
            caseMatch: documents.find(
              (d) => d.path.toLowerCase() === path.toLowerCase(),
            ),
          }
        : {}),
    };
  } catch {
    return { ...empty, path: href, error: "invalid" };
  }
}
export function documentBacklinks(
  target: ReaderDocument,
  documents: ReaderDocument[],
): ReaderDocument[] {
  return documents.filter(
    (d) =>
      d.id !== target.id &&
      markdownModel(d.content).links.some(
        (link) =>
          !link.image &&
          resolveDocumentLink(d, link.href, documents).target?.id === target.id,
      ),
  );
}
