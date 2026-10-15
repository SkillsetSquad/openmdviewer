"use client";
import { useEffect, useRef, useState } from "react";
import { Modal } from "./modal";
import { Button } from "@/components/ui/button";
import { download } from "@/lib/documents";
import { exportSiteInWorker } from "@/lib/site-export-client";
import type { SiteExportInput, SiteExportResult } from "@/lib/site-export";
export default function SiteExportDialog({
  workspaceName,
  snapshot,
  onBusy,
  onClose,
}: {
  workspaceName: string;
  snapshot: () => Promise<SiteExportInput>;
  onBusy: (value: boolean) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [result, setResult] = useState<SiteExportResult | null>(null),
    [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      onBusy(false);
    },
    [onBusy],
  );
  async function generate() {
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    onBusy(true);
    setResult(null);
    setMessage("Preparing a snapshot of the current workspace…");
    try {
      const input = await snapshot();
      if (abort.signal.aborted) return;
      const value = await exportSiteInWorker(input, abort.signal, (value) => {
        if (!abort.signal.aborted) setMessage(value);
      });
      if (!abort.signal.aborted) {
        setResult(value);
        setMessage("Website ZIP ready. Review the files before publishing.");
      }
    } catch (error) {
      setMessage(
        error instanceof Error && error.name === "AbortError"
          ? "Website export canceled. Browser documents are unchanged."
          : `Website export failed: ${error instanceof Error ? error.message : "Browser storage unavailable."}`,
      );
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <Modal
      title="Export documentation website"
      onClose={onClose}
      className="site-export-dialog"
    >
      <p className="dialog-description">
        Create a browsable website from every current document in{" "}
        <strong>{workspaceName}</strong>. The ZIP includes navigation, contents,
        full-text search, light/dark themes, and linked local assets. Extract it
        and serve the folder on any static host.
      </p>
      <p className="dialog-description">
        Review all documents and linked attachments before sharing. Anyone with
        the files can read their text, including the search index. Personal
        notes, history, trash, file connections, and browser settings are
        excluded.
      </p>
      <p className="dialog-description">
        Remote media stays blocked. Math and Mermaid remain readable source.
        PNG/JPEG/GIF/WebP images render locally; other images and original
        documents remain downloads. This creates a snapshot for publishing; use
        workspace ZIP for backups.
      </p>
      {message && <p role="status">{message}</p>}
      {result && (
        <div className="site-export-summary">
          <p>
            {result.documents.toLocaleString()} documents ·{" "}
            {result.assets.toLocaleString()} linked assets ·{" "}
            {(result.expandedBytes / 1024 / 1024).toFixed(2)} MB expanded
          </p>
          <p>
            {result.noticeCount.toLocaleString()} export notices. The ZIP
            retains up to 500 notices in export-report.json.
          </p>
          {!!result.notices.length && (
            <details>
              <summary>Review export notices</summary>
              <ul>
                {result.notices.slice(0, 50).map((notice, i) => (
                  <li key={i}>{notice}</li>
                ))}
              </ul>
              {result.notices.length > 50 && (
                <p>More notices are in export-report.json.</p>
              )}
            </details>
          )}
        </div>
      )}
      <div className="dialog-buttons">
        {busy ? (
          <Button
            variant="outline"
            onClick={() => {
              controller.current?.abort();
              setMessage(
                "Website export canceled. Browser documents are unchanged.",
              );
            }}
          >
            Cancel export
          </Button>
        ) : (
          <Button onClick={() => void generate()}>
            {result ? "Generate fresh snapshot" : "Generate website ZIP"}
          </Button>
        )}
        {result && (
          <Button
            variant="outline"
            onClick={() =>
              download(
                "openmdviewer-website.zip",
                result.bytes as BlobPart,
                "application/zip",
              )
            }
          >
            Download website ZIP
          </Button>
        )}
        {!busy && (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
    </Modal>
  );
}
