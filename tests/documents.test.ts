import { describe, expect, it } from "vitest";
import {
  analyze,
  headings,
  newDocument,
  resolvePath,
  safePath,
  stats,
  supportedFile,
} from "../src/lib/documents";

describe("local document utilities", () => {
  it("imports supported text formats without treating HTML as executable input", () => {
    expect(supportedFile("README.MD")).toBe(true);
    expect(supportedFile("guide.mdx")).toBe(true);
    expect(supportedFile("payload.html")).toBe(false);
  });
  it("keeps paths inside the exported workspace", () => {
    expect(safePath("../../vault/../Notes.md")).toBe("vault/Notes.md");
    expect(safePath("")).toBe("Untitled.md");
    expect(
      resolvePath("Docs/Setup/Install.md", "../../Notes/My%20Note.md"),
    ).toBe("Notes/My Note.md");
  });
  it("uses stable unique heading slugs and excludes code fences", () => {
    expect(
      headings(
        "# Title\n\n## Hello world\n## Hello world\n```md\n## Not a heading\n```",
      ),
    ).toEqual([
      { id: "title", text: "Title", depth: 1 },
      { id: "hello-world", text: "Hello world", depth: 2 },
      { id: "hello-world-1", text: "Hello world", depth: 2 },
    ]);
  });
  it("counts real content and task completion", () => {
    const result = stats("# Test\n\n- [x] Done\n- [ ] Later");
    expect(result.tasks).toBe(2);
    expect(result.completed).toBe(1);
    expect(result.headings).toBe(1);
    expect(stats("").words).toBe(0);
  });
  it("finds structural errors and broken local links", () => {
    const doc = newDocument(
      "Docs/Test.md",
      "# Test\n#### Skipped\n[Missing](missing.md)\n[Anchor](#absent)\n![](photo.png)",
    );
    const issues = analyze(doc, [doc]);
    expect(issues.some((i) => i.message.includes("Skipped heading"))).toBe(
      true,
    );
    expect(
      issues.some((i) => i.message.includes("Missing local document")),
    ).toBe(true);
    expect(issues.some((i) => i.message.includes("Missing heading"))).toBe(
      true,
    );
    expect(issues.some((i) => i.message.includes("alt text"))).toBe(true);
  });
  it("recognizes valid encoded cross-document links", () => {
    const a = newDocument(
      "Docs/A.md",
      "# A\n[Read](../Notes/My%20Note.md#hello)",
    );
    const b = newDocument("Notes/My Note.md", "# Hello");
    expect(analyze(a, [a, b])).toEqual([]);
  });
});
