import type { SearchOptions } from "./search-results";

export const searchHistoryLimit = 30;
export interface RecentSearch {
  workspaceId: string;
  key: string;
  query: string;
  options: SearchOptions;
  usedAt: number;
}
export function searchHistoryEntry(query: string, options: SearchOptions) {
  query = options.regex ? query : query.trim();
  if (!query || query.length > 512 || query.trimStart().startsWith(">"))
    return null;
  const normalized: SearchOptions = {
    literal: options.regex
      ? false
      : !!(options.literal || options.caseSensitive || options.wholeWord),
    ...(options.regex ? { regex: true } : {}),
    caseSensitive: !!options.caseSensitive,
    wholeWord: !!options.wholeWord,
  };
  return {
    query,
    options: normalized,
    key: JSON.stringify([
      query,
      normalized.literal,
      normalized.caseSensitive,
      normalized.wholeWord,
      ...(normalized.regex ? ["regex"] : []),
    ]),
  };
}
export function searchOptionsLabel(options: SearchOptions) {
  return [
    options.regex ? "Regex" : options.literal ? "Literal" : "Fuzzy",
    options.caseSensitive && "Match case",
    options.wholeWord && "Whole words",
  ]
    .filter(Boolean)
    .join(" · ");
}
