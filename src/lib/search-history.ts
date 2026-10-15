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
  query = query.trim();
  if (!query || query.length > 512 || query.startsWith(">")) return null;
  const normalized: SearchOptions = {
    literal: !!(options.literal || options.caseSensitive || options.wholeWord),
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
    ]),
  };
}
export function searchOptionsLabel(options: SearchOptions) {
  return [
    options.literal ? "Literal" : "Fuzzy",
    options.caseSensitive && "Match case",
    options.wholeWord && "Whole words",
  ]
    .filter(Boolean)
    .join(" · ");
}
