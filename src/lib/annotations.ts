import type { ReaderAnnotation, TextQuote } from "./types";
export const annotationLimit = 500;
export type QuoteMatch =
  | { status: "found"; start: number; end: number }
  | { status: "missing" | "ambiguous" };
export function matchQuote(text: string, quote: TextQuote): QuoteMatch {
  if (!quote.exact) return { status: "missing" };
  const matches: number[] = [];
  let offset = text.indexOf(quote.exact);
  while (offset !== -1) {
    matches.push(offset);
    // Stop pathological repeated passages without guessing which was intended.
    if (matches.length > 10000) return { status: "ambiguous" };
    offset = text.indexOf(quote.exact, offset + 1);
  }
  if (!matches.length) return { status: "missing" };
  if (matches.length === 1)
    return {
      status: "found",
      start: matches[0],
      end: matches[0] + quote.exact.length,
    };
  const contextual = matches.filter(
    (start) =>
      text.slice(Math.max(0, start - quote.prefix.length), start) ===
        quote.prefix &&
      text.slice(
        start + quote.exact.length,
        start + quote.exact.length + quote.suffix.length,
      ) === quote.suffix,
  );
  // Saved offsets are a hint for diagnostics, never proof after a document edit.
  if (contextual.length !== 1) return { status: "ambiguous" };
  return {
    status: "found",
    start: contextual[0],
    end: contextual[0] + quote.exact.length,
  };
}
export function quoteAt(text: string, start: number, end: number): TextQuote {
  return {
    exact: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - 64), start),
    suffix: text.slice(end, end + 64),
    start,
  };
}
export function parseAnnotations(value: unknown): ReaderAnnotation[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > annotationLimit)
    throw new Error(
      "Annotations must be a list of at most 500 items per document.",
    );
  const ids = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object")
      throw new Error("Invalid annotation metadata.");
    const a = item as Record<string, unknown>;
    const validText = (v: unknown, limit: number): v is string =>
      typeof v === "string" && v.length <= limit;
    if (
      !validText(a.id, 100) ||
      !a.id ||
      ids.has(a.id) ||
      typeof a.kind !== "string" ||
      !["bookmark", "highlight", "note"].includes(a.kind) ||
      !validText(a.title, 200) ||
      !validText(a.note, 10000) ||
      !Number.isFinite(a.createdAt) ||
      !Number.isFinite(a.updatedAt) ||
      Number(a.createdAt) < 0 ||
      Number(a.updatedAt) < 0 ||
      Number(a.createdAt) >= 1e13 ||
      Number(a.updatedAt) >= 1e13 ||
      (a.heading !== undefined && !validText(a.heading, 500))
    )
      throw new Error("Invalid or duplicate annotation metadata.");
    ids.add(a.id);
    let quote: TextQuote | undefined;
    if (a.quote !== undefined) {
      if (!a.quote || typeof a.quote !== "object")
        throw new Error("Invalid passage metadata.");
      const q = a.quote as Record<string, unknown>;
      if (
        !validText(q.exact, 8000) ||
        !q.exact.trim() ||
        !validText(q.prefix, 64) ||
        !validText(q.suffix, 64) ||
        !Number.isSafeInteger(q.start) ||
        Number(q.start) < 0
      )
        throw new Error("Invalid passage metadata.");
      quote = {
        exact: q.exact,
        prefix: q.prefix,
        suffix: q.suffix,
        start: Number(q.start),
      };
    }
    if (a.kind === "highlight" && !quote)
      throw new Error("A highlight must contain a passage.");
    if (a.kind === "note" && !a.note.trim())
      throw new Error("A note must contain text.");
    return {
      id: a.id,
      kind: a.kind as ReaderAnnotation["kind"],
      title: a.title,
      note: a.note,
      heading: a.heading as string | undefined,
      quote,
      createdAt: Number(a.createdAt),
      updatedAt: Number(a.updatedAt),
    };
  });
}
export function annotationExport(
  documents: { path: string; annotations?: ReaderAnnotation[] }[],
) {
  return JSON.stringify(
    {
      format: "openmdviewer-annotations",
      version: 1,
      exportedAt: new Date().toISOString(),
      documents: documents
        .filter((d) => d.annotations?.length)
        .map((d) => ({ path: d.path, annotations: d.annotations })),
    },
    null,
    2,
  );
}

// Called only by explicit user actions; metadata creation is separate from rendering.
export function createAnnotation(
  values: Omit<ReaderAnnotation, "id" | "createdAt" | "updatedAt">,
  previous?: ReaderAnnotation,
): ReaderAnnotation {
  const now = Date.now();
  return {
    ...values,
    id: previous?.id || crypto.randomUUID(),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
}
