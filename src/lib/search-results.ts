import type { SearchSuggestion } from "./search-suggestions";
export const regexSearchTimeout = 1500;
export interface SearchOptions {
  regex?: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  literal: boolean;
}
export const defaultSearchOptions: SearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  literal: false,
};
export interface SearchLocation {
  line: number;
  offset: number;
  needle: string;
  sourceOnly: boolean;
  context?: { before: string; after: string };
}
export interface SearchHit {
  id: string;
  title: string;
  path: string;
  tags: string[];
  status: string;
  excerpt: string;
  excerptRanges: { start: number; end: number }[];
  terms: string[];
  fuzzy: boolean;
  titleRanges?: { start: number; end: number }[];
  pathRanges?: { start: number; end: number }[];
  headingRanges?: { start: number; end: number }[];
  heading?: { id: string; text: string; line: number };
  location?: SearchLocation;
}
export interface SearchPage {
  suggestions?: SearchSuggestion[];
  error?: string;
  hits: SearchHit[];
  total: number;
  offset: number;
}
export function parseSearchQuery(query: string) {
  const tokens = query.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  const filters = tokens.filter((token) =>
    /^(tag|path|heading|status|type):/i.test(token),
  );
  const phrases = tokens
    .filter((token) => token.startsWith('"'))
    .map((token) => token.replace(/^"|"$/g, ""));
  const words = tokens.filter(
    (token) => !filters.includes(token) && !token.startsWith('"'),
  );
  return {
    filters,
    phrases,
    words,
    terms: [...phrases, ...words].filter(Boolean),
  };
}
const word = /[\p{L}\p{N}\p{M}_]/u;
export function wordBoundary(text: string, start: number, end: number) {
  const before =
    Array.from(text.slice(Math.max(0, start - 2), start)).at(-1) || "";
  const after =
    end < text.length ? String.fromCodePoint(text.codePointAt(end)!) : "";
  return !word.test(before) && !word.test(after);
}
/** User strings are escaped literals. No user-provided regular expression is executed here. */
export function literalMatches(
  text: string,
  term: string,
  options: Pick<SearchOptions, "caseSensitive" | "wholeWord">,
  limit = 64,
) {
  if (!term) return [];
  const expression = new RegExp(
    term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    options.caseSensitive ? "gu" : "giu",
  );
  const found: { start: number; end: number }[] = [];
  for (const match of text.matchAll(expression)) {
    const end = match.index + match[0].length;
    if (!options.wholeWord || wordBoundary(text, match.index, end))
      found.push({ start: match.index, end });
    if (found.length >= limit) break;
  }
  return found;
}
export function highlightRanges(
  text: string,
  terms: string[],
  options: Pick<SearchOptions, "caseSensitive" | "wholeWord">,
) {
  const ranges = terms
    .flatMap((term) => literalMatches(text, term, options))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: { start: number; end: number }[] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range.start <= last.end)
      last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

export function unicodePrefix(text: string, length: number) {
  let end = Math.min(length, text.length);
  if (
    end > 0 &&
    end < text.length &&
    /[\uDC00-\uDFFF]/.test(text[end]) &&
    /[\uD800-\uDBFF]/.test(text[end - 1])
  )
    end--;
  return text.slice(0, end);
}
export function searchExcerpt(
  content: string,
  position: number,
  length: number,
  fallbackStart = 0,
  terms: string[] = [],
  options: SearchOptions = defaultSearchOptions,
  sourceRanges?: { start: number; end: number }[],
) {
  let start = position >= 0 ? Math.max(0, position - 40) : fallbackStart;
  if (
    start > 0 &&
    /[\uDC00-\uDFFF]/.test(content[start]) &&
    /[\uD800-\uDBFF]/.test(content[start - 1])
  )
    start--;
  const raw = unicodePrefix(content.slice(start, start + 221), 220);
  const normalize = (text: string) => text.replace(/\r\n?|\n/g, " ");
  const prefix = start > 0 ? "…" : "";
  const displayOffset = (offset: number) =>
    prefix.length +
    normalize(raw.slice(0, Math.max(0, Math.min(raw.length, offset)))).length;
  // Check word boundaries against the full source, not an artificial excerpt edge.
  const matched = sourceRanges
    ? sourceRanges
        .filter(
          (range) => range.end > start && range.start < start + raw.length,
        )
        .map((range) => ({
          start: range.start - start,
          end: range.end - start,
        }))
    : terms
        .flatMap((term) =>
          literalMatches(raw, term, { ...options, wholeWord: false }, 220),
        )
        .filter(
          (range) =>
            !options.wholeWord ||
            wordBoundary(content, start + range.start, start + range.end),
        );
  return {
    excerpt:
      prefix +
      normalize(raw) +
      (start + raw.length < content.length ? "…" : ""),
    excerptRanges: [
      ...(position >= 0
        ? [
            {
              start: displayOffset(position - start),
              end: displayOffset(position - start + length),
            },
          ]
        : []),
      ...matched.map((range) => ({
        start: displayOffset(range.start),
        end: displayOffset(range.end),
      })),
    ],
  };
}

export function hasSearchQuery(query: string, options: SearchOptions) {
  return options.regex ? query.length > 0 : !!query.trim();
}
