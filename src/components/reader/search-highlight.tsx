import { highlightRanges, type SearchOptions } from "@/lib/search-results";
export function SearchHighlight({
  text,
  terms,
  options,
  ranges = [],
}: {
  text: string;
  terms: string[];
  options: SearchOptions;
  ranges?: { start: number; end: number }[];
}) {
  const matches = [...highlightRanges(text, terms, options), ...ranges].sort(
    (a, b) => a.start - b.start || b.end - a.end,
  );
  const merged: { start: number; end: number }[] = [];
  for (const range of matches) {
    const last = merged.at(-1);
    if (last && range.start <= last.end)
      last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.start > cursor) parts.push(text.slice(cursor, range.start));
    parts.push(
      <mark key={`${range.start}:${range.end}`}>
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
