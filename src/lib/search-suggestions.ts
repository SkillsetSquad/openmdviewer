export interface SearchSuggestion {
  query: string;
  value: string;
  filter: string;
  count: number;
}
export interface SuggestionDocument {
  path: string;
  tags: string[];
  headings: string;
  status: string;
}
/** Suggestions use already indexed metadata, never parse documents on the UI thread. */
export function filterSuggestions(
  query: string,
  documents: Iterable<SuggestionDocument>,
): SearchSuggestion[] {
  if (query.trimStart().startsWith(">") || query.length > 512) return [];
  const token =
    /(?:^|\s)(tag|path|heading|status|type):(?:"([^"]*)|([^\s"]*))$/i.exec(
      query,
    );
  if (!token) return [];
  const start = token.index + (query[token.index]?.match(/\s/) ? 1 : 0);
  const before = query.slice(0, start);
  // Do not mistake a word inside an unfinished quoted phrase for a filter.
  if ((before.match(/"/g)?.length || 0) % 2) return [];
  const filter = token[1].toLowerCase(),
    prefix = (token[2] ?? token[3] ?? "").toLowerCase();
  const counts = new Map<string, number>();
  for (const doc of documents) {
    let values: string[] = [];
    if (filter === "tag") values = doc.tags;
    if (filter === "status") values = [doc.status];
    if (filter === "heading") values = doc.headings.split("\n");
    if (filter === "path") {
      const parts = doc.path.split("/");
      values = parts
        .slice(0, -1)
        .map((_, index) => parts.slice(0, index + 1).join("/") + "/");
    }
    if (filter === "type") {
      if (/\.(md|markdown|mdown|mkd|mdx)$/i.test(doc.path))
        values = ["markdown"];
      else if (/\.txt$/i.test(doc.path)) values = ["text"];
    }
    for (const value of new Set(values)) {
      if (
        !value ||
        value.length > 200 ||
        /["\r\n\x00-\x1f]/.test(value) ||
        !value.toLowerCase().startsWith(prefix)
      )
        continue;
      counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return [...counts]
    .map(([value, count]) => ({
      value,
      count,
      filter,
      query: `${before}${filter}:"${value}"`,
    }))
    .filter((item) => item.query.length <= 512 && item.query !== query)
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, 8);
}
