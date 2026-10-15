import { matchQuote, quoteAt } from "./annotations";
import type { TextQuote } from "./types";
const excluded =
  "button,input,select,textarea,svg,.code-block,pre,.katex,.media-player,.interactive-table,.diagram,[aria-hidden=true]";
export function readingText(root: HTMLElement) {
  const entries: { node: Text; start: number; end: number }[] = [];
  let text = "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest(excluded)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    entries.push({ node, start: text.length, end: text.length + node.length });
    text += node.data;
  }
  return { text, entries };
}
export function captureQuote(
  root: HTMLElement,
  selection: Selection | null,
): TextQuote | undefined {
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  )
    return;
  const index = readingText(root);
  let start = -1,
    end = -1;
  for (const entry of index.entries) {
    if (!range.intersectsNode(entry.node)) continue;
    const lo = range.startContainer === entry.node ? range.startOffset : 0;
    const hi =
      range.endContainer === entry.node ? range.endOffset : entry.node.length;
    if (hi <= lo) continue;
    if (start === -1) start = entry.start + lo;
    end = entry.start + hi;
  }
  if (start < 0 || end <= start || end - start > 8000) return;
  const quote = quoteAt(index.text, start, end);
  // Ignore generated controls and unsupported rendered widgets, even when selected across blocks.
  if (
    !quote.exact.trim() ||
    quote.exact.replace(/\s/g, "") !== range.toString().replace(/\s/g, "")
  )
    return;
  return quote;
}
export function locateQuote(
  index: ReturnType<typeof readingText>,
  quote: TextQuote,
) {
  const match = matchQuote(index.text, quote);
  if (match.status !== "found") return { status: match.status };
  const first = index.entries.find((entry) => entry.end > match.start);
  const last = index.entries.find(
    (entry) => entry.end >= match.end && entry.start < match.end,
  );
  if (!first || !last) return { status: "missing" as const };
  const range = document.createRange();
  range.setStart(first.node, match.start - first.start);
  range.setEnd(last.node, match.end - last.start);
  return { status: "found" as const, range };
}
