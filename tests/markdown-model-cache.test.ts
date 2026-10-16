import { expect, it } from "vitest";
import { markdownModel } from "../src/lib/markdown-model";
const manual = (name: string, size: number) =>
  `# ${name}\n\n\`\`\`text\n${"x".repeat(size)}\n\`\`\`\n`;
it("reuses a manual above one MiB instead of reparsing it for title, statistics and navigation", () => {
  const content = manual("Cached large manual", 1024 * 1024 + 100);
  const model = markdownModel(content);
  expect(markdownModel(content)).toBe(model);
  expect(model.headings[0].text).toBe("Cached large manual");
  expect(model.statistics.codeBlocks).toBe(1);
  expect(model.statistics.characters).toBe(content.length);
});
it("evicts large models when their combined source-character budget exceeds four MiB", () => {
  const first = manual("First budgeted manual", 2 * 1024 * 1024 + 100);
  const second = manual("Second budgeted manual", 2 * 1024 * 1024 + 100);
  const initial = markdownModel(first);
  const retained = markdownModel(second);
  expect(markdownModel(second)).toBe(retained);
  expect(markdownModel(first)).not.toBe(initial);
}, 15000);
