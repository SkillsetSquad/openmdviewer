/** PDF text-layer order is preserved; geometry is used only to separate adjacent text runs. */
export interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL: boolean;
  dir?: string;
}
export const pdfLimits = {
  pages: 500,
  pageItems: 200000,
  items: 1000000,
  textBytes: 10 * 1024 * 1024,
};
export class PdfTextBuilder {
  private parts: string[] = [];
  private previous: PdfTextItem | null = null;
  private forcedLine = false;
  private trailingSpace = false;
  items = 0;
  bytes = 0;
  replacedControls = false;
  add(item: PdfTextItem) {
    if (++this.items > pdfLimits.pageItems)
      throw new Error("A PDF page exceeds the 200,000 text-item limit.");
    const text = item.str.replace(/\0/g, "\ufffd");
    if (text !== item.str) this.replacedControls = true;
    this.bytes += new TextEncoder().encode(text).length;
    if (this.bytes > pdfLimits.textBytes)
      throw new Error("PDF text exceeds the 10 MB extraction limit.");
    if (!text) {
      this.forcedLine ||= item.hasEOL;
      return;
    }
    const previous = this.previous;
    if (previous) {
      const [a, b, c, d, x, y] = previous.transform;
      const length = Math.hypot(a, b) || 1,
        ux = a / length,
        uy = b / length;
      const dx = item.transform[4] - x,
        dy = item.transform[5] - y;
      const cross = Math.abs(dx * uy - dy * ux),
        font = Math.max(Math.hypot(c, d), previous.height, 1);
      const line = this.forcedLine || previous.hasEOL || cross > font * 0.5;
      if (line) this.parts.push(cross > font * 1.6 ? "\n\n" : "\n");
      else {
        const gap = dx * ux + dy * uy - previous.width;
        if (gap > font * 0.15 && !this.trailingSpace && !/^\s/.test(text))
          this.parts.push(" ");
      }
    }
    this.parts.push(text);
    this.previous = item;
    this.forcedLine = false;
    this.trailingSpace = /\s$/.test(text);
  }
  text() {
    return this.parts.join("").trim();
  }
}
