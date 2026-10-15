"use client";
import { useEffect, useState } from "react";
import { diffLines } from "diff";
import { History, RotateCcw } from "lucide-react";
import { Modal } from "./modal";
import { Button } from "@/components/ui/button";
import { storage } from "@/lib/storage";
import type { DocumentSnapshot, ReaderDocument } from "@/lib/types";
export function RevisionHistory({
  document,
  onRestore,
  onClose,
}: {
  document: ReaderDocument;
  onRestore: (content: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [snapshots, setSnapshots] = useState<DocumentSnapshot[] | null>(null);
  const [selected, setSelected] = useState<DocumentSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    storage
      .snapshots(document.id)
      .then(setSnapshots)
      .catch(() => setError("Could not read recovery snapshots."));
  }, [document.id]);
  return (
    <Modal title="Document history" wide onClose={onClose}>
      <div className="recovery-content">
        <p className="dialog-description">
          The previous 50 content revisions are kept in this browser. Restoring
          also snapshots the current version, so it can be recovered.
        </p>
        {error && <p role="alert">{error}</p>}
        {snapshots === null ? (
          <p>Loading snapshots…</p>
        ) : !snapshots.length ? (
          <div className="empty-panel">
            <History size={24} />
            <p>
              No previous revisions yet. Edits create recovery snapshots
              automatically.
            </p>
          </div>
        ) : (
          <>
            <label className="form-label">
              Previous revision
              <select
                value={selected?.id || ""}
                onChange={(e) =>
                  setSelected(
                    snapshots.find((s) => s.id === e.target.value) || null,
                  )
                }
              >
                <option value="">Choose a revision</option>
                {snapshots.map((s, i) => (
                  <option key={s.id} value={s.id}>
                    {new Date(s.createdAt).toLocaleString()} · revision{" "}
                    {s.document.revision || 0} · {s.reason} · #
                    {snapshots.length - i}
                  </option>
                ))}
              </select>
            </label>
            {selected && (
              <>
                <div className="diff-label">
                  <span>
                    <i className="diff-removed" />
                    Previous revision
                  </span>
                  <span>
                    <i className="diff-added" />
                    Current document
                  </span>
                </div>
                <pre className="document-diff" aria-label="Revision comparison">
                  {diffLines(selected.document.content, document.content).map(
                    (part, i) => (
                      <span
                        key={i}
                        className={
                          part.added
                            ? "diff-added"
                            : part.removed
                              ? "diff-removed"
                              : ""
                        }
                      >
                        {part.value}
                      </span>
                    ),
                  )}
                </pre>
                <div className="dialog-buttons">
                  <Button
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      if (await onRestore(selected.document.content)) onClose();
                      setBusy(false);
                    }}
                  >
                    <RotateCcw size={14} />
                    Restore this revision
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
export function WorkspaceTrash({
  workspaceId,
  onRestore,
  onClose,
}: {
  workspaceId: string;
  onRestore: (document: ReaderDocument) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<ReaderDocument[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    storage
      .trashItems(workspaceId)
      .then(setItems)
      .catch(() => setError("Could not open the trash."));
  }, [workspaceId]);
  return (
    <Modal title="Workspace trash" onClose={onClose}>
      <p className="dialog-description">
        Deleted documents stay here until restored. Media and snapshots are
        kept. Original local files are never removed.
      </p>
      {error && <p role="alert">{error}</p>}
      {items === null ? (
        <p>Loading trash…</p>
      ) : !items.length ? (
        <p className="empty-panel">No deleted documents.</p>
      ) : (
        <div className="trash-list">
          {items.map((item) => (
            <div key={item.id}>
              <span>
                <strong>{item.path}</strong>
                <small>
                  Deleted {new Date(item.deletedAt!).toLocaleString()}
                </small>
              </span>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const restored = await storage.restoreTrash(item.id);
                    onRestore(restored);
                    setItems(items.filter((d) => d.id !== item.id));
                  } catch {
                    setError(
                      "Could not restore this document. Your saved data is unchanged.",
                    );
                  }
                }}
              >
                Restore
              </Button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
