import type { ReaderDocument } from "./types";
import { DocumentConflict } from "./storage";
export interface PendingConflict {
  current: ReaderDocument;
  local: ReaderDocument;
}
export class SaveLedger {
  private failed = new Map<string, ReaderDocument>();
  private conflicts = new Map<string, PendingConflict>();
  failure(document: ReaderDocument, error: unknown) {
    this.failed.set(document.id, document);
    if (error instanceof DocumentConflict)
      this.conflicts.set(document.id, {
        current: error.current,
        local: document,
      });
  }
  success(id: string) {
    if (!this.conflicts.has(id)) this.failed.delete(id);
  }
  resolve(id: string) {
    this.failed.delete(id);
    this.conflicts.delete(id);
  }
  firstConflict() {
    return this.conflicts.values().next().value || null;
  }
  hasFailures() {
    return this.failed.size > 0;
  }
}
