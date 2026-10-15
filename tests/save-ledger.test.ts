import { it, expect } from "vitest";
import { SaveLedger } from "../src/lib/save-ledger";
import { DocumentConflict } from "../src/lib/storage";
import { newDocument } from "../src/lib/documents";
it("retains every conflicting document until each is resolved", () => {
  const a = newDocument("A.md", "a"),
    b = newDocument("B.md", "b");
  const ledger = new SaveLedger();
  ledger.failure(a, new DocumentConflict({ ...a, revision: 1 }));
  ledger.failure(b, new DocumentConflict({ ...b, revision: 1 }));
  expect(ledger.firstConflict()?.local.id).toBe(a.id);
  ledger.resolve(a.id);
  expect(ledger.hasFailures()).toBe(true);
  expect(ledger.firstConflict()?.local.id).toBe(b.id);
  ledger.resolve(b.id);
  expect(ledger.hasFailures()).toBe(false);
});
it("does not clear an earlier failed write when another document saves successfully", () => {
  const a = newDocument("A.md", "a"),
    b = newDocument("B.md", "b");
  const ledger = new SaveLedger();
  ledger.failure(a, new Error("quota"));
  ledger.success(b.id);
  expect(ledger.hasFailures()).toBe(true);
  ledger.success(a.id);
  expect(ledger.hasFailures()).toBe(false);
});
