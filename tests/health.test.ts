import { describe, it, expect } from "vitest";
import { analyzeWorkspace, healthRules } from "../src/lib/health";
import { newDocument } from "../src/lib/documents";
const now = Date.parse("2026-10-15T12:00:00Z");
describe("transparent document health rules", () => {
  it("scores only explicit rules, preserves source, and resolves encoded reference links", () => {
    const a = newDocument(
      "Docs/A.md",
      "---\nowner: Morgan\nlast_reviewed: 2026-10-01\n---\n# A\n\n[Read][b]\n\n[b]: ../Notes/B.md#hello-world",
    );
    const b = newDocument(
      "Notes/B.md",
      "---\nowner: Alex\nlast_reviewed: 2026-10-01\n---\n# Hello *world*\n\nA useful document.",
    );
    const report = analyzeWorkspace([a, b], [], now);
    expect(report.summary.score).toBe(100);
    expect(report.summary.brokenLinks).toBe(0);
    expect(report.navigation.edges).toHaveLength(1);
    expect(report.summary.unlinkedDocuments).toBe(0);
    expect(a.content).toContain("[Read][b]");
  });
  it("finds issues at original source lines and explains every point deduction", () => {
    const doc = newDocument(
      "Bad.md",
      "---\nowner: Morgan\nlast_reviewed: 2026-10-01\n---\n# A\n\n#### Jump\n\n[Missing](No.md)\n\n![](lost.png)",
    );
    const result = analyzeWorkspace([doc], [], now).documents[0];
    expect(result.issues.find((i) => i.rule === "heading_gap")?.line).toBe(7);
    expect(result.issues.find((i) => i.rule === "missing_document")?.line).toBe(
      9,
    );
    expect(result.issues.find((i) => i.rule === "image_alt")?.line).toBe(11);
    expect(result.score).toBe(
      Math.max(0, 100 - result.issues.reduce((n, i) => n + i.penalty, 0)),
    );
    for (const issue of result.issues)
      expect(
        healthRules.some(
          (r) => r.id === issue.rule && r.penalty === issue.penalty,
        ),
      ).toBe(true);
  });
  it("does not infer review freshness from browser timestamps or guess ambiguous wiki targets", () => {
    const a = newDocument("A.md", "# A\n\n[[B]]");
    const b = newDocument("X/B.md", "# B\n\nBody");
    const c = newDocument("Y/B.md", "# B\n\nBody");
    const report = analyzeWorkspace([a, b, c], [], now);
    expect(report.summary.staleDocuments).toBe(0);
    expect(
      report.documents[0].issues.some((i) => i.rule === "missing_review"),
    ).toBe(true);
    expect(
      report.documents[0].issues.some((i) => i.rule === "ambiguous_wiki"),
    ).toBe(true);
  });
  it("checks declared review schedules, invalid dates, path case, and imported images", () => {
    const a = newDocument(
      "A.md",
      "---\nowner: Morgan\nlast_reviewed: 2025-01-01\nnext_review: 2026-10-14\n---\n# A\n\n[Other](notes/B.md)\n\n![Alt](photo.png)",
    );
    const b = newDocument("Notes/B.md", "# B\n\nBody");
    const result = analyzeWorkspace([a, b], ["photo.png"], now).documents[0];
    expect(result.stale).toBe(true);
    expect(result.issues.some((i) => i.rule === "case_mismatch")).toBe(true);
    expect(result.issues.some((i) => i.rule === "missing_image")).toBe(false);
    const bad = newDocument(
      "Dates.md",
      "---\nlast_reviewed: 2026-02-31\n---\n# Dates\n\nBody",
    );
    expect(
      analyzeWorkspace([bad], [], now).documents[0].issues.some(
        (i) => i.rule === "invalid_review",
      ),
    ).toBe(true);
  });
  it("counts isolated documents and exact normalized duplicate bodies without network validation", () => {
    const content =
      "# Shared\n\nThis is a sufficiently long shared document body for exact normalized duplicate checks.";
    const a = newDocument("A.md", content);
    const b = newDocument(
      "B.md",
      content.replace("shared document", "shared  document"),
    );
    const report = analyzeWorkspace([a, b], [], now);
    expect(report.summary.unlinkedDocuments).toBe(2);
    expect(
      report.documents.every((d) =>
        d.issues.some((i) => i.rule === "duplicate_content"),
      ),
    ).toBe(true);
  });
  it("keeps document-only reports scoped and rejects oversized whole-workspace analysis clearly", () => {
    const a = newDocument("A.md", "# A\n\n[Other](B.md#b)");
    const b = newDocument("B.md", "# B\n\nBody");
    expect(
      analyzeWorkspace([a, b], [], now, { documentId: a.id }).documents,
    ).toHaveLength(1);
    expect(
      analyzeWorkspace([a, b], [], now, { documentId: a.id }).summary
        .unlinkedDocuments,
    ).toBeNull();
    expect(() =>
      analyzeWorkspace([newDocument("Huge.md", "x".repeat(25000001))], [], now),
    ).toThrow("25 million");
  });
});

it("has no score for an empty workspace and does not call it perfectly healthy", () => {
  expect(analyzeWorkspace([], [], now).summary.score).toBeNull();
});
