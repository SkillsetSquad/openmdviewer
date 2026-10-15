import {
  searchExcerpt,
  unicodePrefix,
  wordBoundary,
  type SearchOptions,
  type SearchPage,
  type SearchHit,
} from "./search-results";

export interface RegexDocument {
  id: string;
  path: string;
  title: string;
  content: string;
  tags: string[];
  status: string;
  metadata: string;
  bodyStart: number;
  headings: { id: string; text: string; line: number }[];
  sourceBlocks: { startOffset: number; endOffset: number }[];
}
/** Call only inside the dedicated, terminable regex worker. Never on the UI/index worker. */
export function regexMatches(
  text: string,
  expression: RegExp,
  wholeWord: boolean,
  limit = 64,
) {
  expression.lastIndex = 0;
  const ranges: { start: number; end: number }[] = [];
  for (const match of text.matchAll(expression)) {
    const start = match.index,
      end = start + match[0].length;
    if (!wholeWord || wordBoundary(text, start, end))
      ranges.push({ start, end });
    if (ranges.length >= limit) break;
  }
  return ranges;
}
export function findRegex(
  documents: RegexDocument[],
  query: string,
  options: SearchOptions,
  offset = 0,
): SearchPage {
  if (query.length > 512)
    return {
      hits: [],
      total: 0,
      offset: 0,
      error:
        "Search supports up to 512 characters. Shorten this query to search.",
    };
  let expression: RegExp;
  try {
    expression = new RegExp(query, options.caseSensitive ? "gmu" : "gimu");
  } catch (error) {
    return {
      hits: [],
      total: 0,
      offset: 0,
      error: `Invalid regular expression: ${error instanceof Error ? error.message : "Check the pattern syntax."}`,
    };
  }
  const ranges = (text: string, limit = 64) =>
    regexMatches(text, expression, options.wholeWord, limit);
  const matches = documents.filter((doc) =>
    [
      doc.title,
      doc.path,
      doc.content,
      ...doc.headings.map((heading) => heading.text),
      ...doc.tags,
      doc.metadata,
    ].some((text) => ranges(text, 1).length),
  );
  const start = Math.min(
    Math.max(0, Math.floor((Number.isFinite(offset) ? offset : 0) / 50) * 50),
    Math.max(0, Math.floor((matches.length - 1) / 50) * 50),
  );
  const hits = matches.slice(start, start + 50).map((doc): SearchHit => {
    const sourceRanges = ranges(doc.content),
      first = sourceRanges[0];
    const position = first?.start ?? -1;
    const line = first
      ? doc.content.slice(0, position).split(/\r\n?|\n/).length
      : undefined;
    const heading = line
      ? doc.headings.filter((item) => item.line <= line).at(-1)
      : doc.headings.find((item) => ranges(item.text, 1).length);
    const headingRanges = heading ? ranges(heading.text) : [];
    const headingMatch = headingRanges[0];
    const relevantTags = doc.tags.filter((tag) => ranges(tag, 1).length),
      relevantSet = new Set(relevantTags);
    const needle = first
      ? unicodePrefix(
          doc.content.slice(
            first.start,
            Math.min(first.end, first.start + 4097),
          ),
          4096,
        )
      : "";
    return {
      id: doc.id,
      title: doc.title,
      path: doc.path,
      status: doc.status,
      tags: [
        ...relevantTags,
        ...doc.tags.filter((tag) => !relevantSet.has(tag)),
      ].slice(0, 10),
      terms: [],
      fuzzy: false,
      titleRanges: ranges(doc.title),
      pathRanges: ranges(doc.path),
      headingRanges,
      ...(position < 0 && heading
        ? searchExcerpt(
            heading.text,
            headingMatch?.start ?? -1,
            headingMatch ? headingMatch.end - headingMatch.start : 0,
            0,
            [],
            options,
            headingRanges,
          )
        : searchExcerpt(
            doc.content,
            position,
            needle.length,
            doc.bodyStart,
            [],
            options,
            sourceRanges,
          )),
      heading,
      ...(first && line
        ? {
            location: {
              line,
              offset: position,
              needle,
              sourceOnly:
                !needle.length ||
                first.end - first.start > 4096 ||
                position < doc.bodyStart ||
                doc.sourceBlocks.some(
                  (block) =>
                    position < block.endOffset && first.end > block.startOffset,
                ),
              context: {
                before: doc.content.slice(Math.max(0, position - 32), position),
                after: doc.content.slice(
                  position + needle.length,
                  position + needle.length + 32,
                ),
              },
            },
          }
        : {}),
    };
  });
  return { hits, total: matches.length, offset: start };
}
