import { markdownModel } from "./markdown-model";
import { readingText } from "./annotation-dom";
import type { SearchHit } from "./search-results";
export function renderedSearchRange(root: HTMLElement, hit: SearchHit) {
  if (!hit.location) return;
  const { line, needle } = hit.location;
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>("[data-reader-start]"),
  )
    .filter(
      (node) =>
        Number(node.dataset.readerStart) <= line &&
        Number(node.dataset.readerEnd) >= line,
    )
    .sort(
      (a, b) =>
        Number(a.dataset.readerEnd) -
        Number(a.dataset.readerStart) -
        (Number(b.dataset.readerEnd) - Number(b.dataset.readerStart)),
    );
  for (const candidate of candidates) {
    const index = readingText(candidate),
      start = index.text.indexOf(needle),
      end = start + needle.length;
    if (start < 0) continue;
    const first = index.entries.find((entry) => entry.end > start),
      last = index.entries.find(
        (entry) => entry.end >= end && entry.start < end,
      );
    if (!first || !last) continue;
    const range = document.createRange();
    range.setStart(first.node, start - first.start);
    range.setEnd(last.node, end - last.start);
    return range;
  }
}

/** Validate the actual target again after pending editor writes finish. */
export function refreshSearchHit(
  hit: SearchHit,
  content: string,
): SearchHit | null {
  if (hit.location) {
    const { offset, needle } = hit.location;
    if (content.slice(offset, offset + needle.length) !== needle) return null;
    return {
      ...hit,
      location: {
        ...hit.location,
        line: content.slice(0, offset).split(/\r\n?|\n/).length,
      },
    };
  }
  if (hit.heading) {
    const heading = markdownModel(content).headings.find(
      (value) =>
        value.id === hit.heading!.id && value.text === hit.heading!.text,
    );
    return heading ? { ...hit, heading } : null;
  }
  return hit;
}
