import { expect, it } from "vitest";
import {
  PdfTextBuilder,
  pdfLimits,
  type PdfTextItem,
} from "../src/lib/pdf-text";
const item = (
  str: string,
  x = 0,
  y = 0,
  width = 10,
  hasEOL = false,
): PdfTextItem => ({
  str,
  width,
  height: 10,
  transform: [10, 0, 0, 10, x, y],
  hasEOL,
  dir: "ltr",
});
it("joins split words using measured gaps and keeps source-order lines and paragraphs", () => {
  const text = new PdfTextBuilder();
  text.add(item("Hel", 0, 0, 15));
  text.add(item("lo", 15, 0, 10));
  text.add(item("world", 30, 0, 25));
  text.add(item("Next line", 0, 12, 45));
  text.add(item("New paragraph", 0, 40, 65));
  expect(text.text()).toBe("Hello world\nNext line\n\nNew paragraph");
});
it("handles rotated baselines and empty end-of-line markers without inventing heading structure", () => {
  const text = new PdfTextBuilder();
  text.add({ ...item("Rot", 0, 0, 15), transform: [0, 10, -10, 0, 0, 0] });
  text.add({ ...item("ated", 0, 15, 20), transform: [0, 10, -10, 0, 0, 15] });
  text.add({ ...item("", 0, 0, 0, true) });
  text.add({ ...item("second", 0, 35, 30), transform: [0, 10, -10, 0, 0, 35] });
  expect(text.text()).toBe("Rotated\nsecond");
});
it("bounds streamed text and item counts, reports replaced NULs, and leaves Markdown-looking source as literal text", () => {
  const text = new PdfTextBuilder();
  text.add(item("# [literal] <script>\0"));
  expect(text.text()).toBe("# [literal] <script>\ufffd");
  expect(text.replacedControls).toBe(true);
  const many = new PdfTextBuilder();
  for (let i = 0; i < pdfLimits.pageItems; i++) many.add(item(""));
  expect(() => many.add(item(""))).toThrow("text-item limit");
  expect(() =>
    new PdfTextBuilder().add(item("a".repeat(pdfLimits.textBytes + 1))),
  ).toThrow("extraction limit");
});
