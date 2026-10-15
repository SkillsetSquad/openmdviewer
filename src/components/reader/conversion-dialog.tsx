"use client";
import { useEffect, useRef, useState } from "react";
import { Modal } from "./modal";
import { convertInWorker } from "@/lib/conversion-client";
import { download } from "@/lib/documents";
import { unicodePrefix } from "@/lib/search-results";
import type { ConversionInput, ConversionResult } from "@/lib/conversion-types";

export default function ConversionDialog({
  inputs,
  workspaceName,
  onApply,
  onClose,
  onBusy,
}: {
  inputs: ConversionInput[];
  workspaceName: string;
  onApply: (result: ConversionResult) => Promise<void>;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [message, setMessage] = useState("Preparing local conversion…");
  const [busy, setBusy] = useState(true),
    [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(0),
    [attempt, setAttempt] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    onBusy(true);
    return () => onBusy(false);
  }, [onBusy]);
  const savingRef = useRef(false);
  useEffect(() => {
    let current = true;
    const abort = new AbortController();
    controller.current = abort;
    void convertInWorker(inputs, abort.signal, (value) => {
      if (current) setMessage(value);
    })
      .then((value) => {
        if (current) {
          setResult(value);
          setMessage("Conversion ready. Review the Markdown before importing.");
        }
      })
      .catch((error) => {
        if (current)
          setMessage(
            error instanceof Error && error.name === "AbortError"
              ? "Conversion canceled. No documents were imported."
              : `Conversion failed: ${error instanceof Error ? error.message : "Worker unavailable."}`,
          );
      })
      .finally(() => {
        if (current) setBusy(false);
      });
    return () => {
      current = false;
      abort.abort();
    };
  }, [inputs, attempt]);
  const report = result?.reports[selected];
  const doc = result?.documents.find((item) => item.id === report?.documentId);
  return (
    <Modal
      title="Convert documents"
      wide
      dismissible={!saving}
      onClose={onClose}
      className="conversion-dialog"
    >
      <div className="conversion-body" aria-busy={busy || saving}>
        <p>
          Convert HTML and DOCX locally to Markdown. Review the result, then
          import it into <strong>{workspaceName}</strong>. Original files and
          embedded images stay alongside the browser copy.
        </p>
        <p role="status">{message}</p>
        {busy && (
          <button type="button" onClick={() => controller.current?.abort()}>
            Cancel conversion
          </button>
        )}
        {!busy && !result && (
          <button
            type="button"
            onClick={() => {
              setBusy(true);
              setMessage("Preparing local conversion…");
              setAttempt((value) => value + 1);
            }}
          >
            Retry conversion
          </button>
        )}
        {result && (
          <>
            <label>
              Converted document
              <select
                value={selected}
                disabled={saving}
                onChange={(event) => setSelected(Number(event.target.value))}
              >
                {result.reports.map((item, index) => (
                  <option key={item.documentId} value={index}>
                    {item.sourcePath} → {item.path}
                  </option>
                ))}
              </select>
            </label>
            <div className="conversion-actions">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  if (savingRef.current) return;
                  savingRef.current = true;
                  setSaving(true);
                  void onApply(result)
                    .then(onClose)
                    .catch((error) =>
                      setMessage(
                        `Import failed: ${error instanceof Error ? error.message : "Browser storage unavailable."} The preview and original files remain available.`,
                      ),
                    )
                    .finally(() => {
                      savingRef.current = false;
                      setSaving(false);
                    });
                }}
              >
                {saving ? "Importing…" : "Import converted files"}
              </button>
              <button type="button" disabled={saving} onClick={onClose}>
                Discard preview
              </button>
            </div>
            {report && doc && (
              <>
                <p>
                  {report.format} → Markdown ·{" "}
                  {doc.content.length.toLocaleString()} characters ·{" "}
                  {report.images.toLocaleString()} embedded{" "}
                  {report.images === 1 ? "image" : "images"} ·{" "}
                  {report.warningCount.toLocaleString()} conversion{" "}
                  {report.warningCount === 1 ? "notice" : "notices"}
                </p>
                {!!report.warnings.length && (
                  <details>
                    <summary>Conversion notices</summary>
                    <ul>
                      {report.warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                    {report.warningCount > report.warnings.length && (
                      <p>
                        Showing {report.warnings.length} distinct notices from{" "}
                        {report.warningCount} reported notices.
                      </p>
                    )}
                  </details>
                )}
                <label>
                  Markdown preview
                  <textarea
                    readOnly
                    value={unicodePrefix(doc.content, 30000)}
                    aria-label="Converted Markdown preview"
                  />
                </label>
                {doc.content.length > 30000 && (
                  <p>
                    Preview shows the first 30,000 characters. Download or
                    import includes the complete Markdown.
                  </p>
                )}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => download(doc.path, doc.content)}
                >
                  Download converted Markdown
                </button>
              </>
            )}
          </>
        )}
        <details>
          <summary>What conversion preserves</summary>
          <p>
            Headings, paragraphs, lists, links, basic tables, code and supported
            images are converted where the source exposes them. Scripts, page
            styling, forms and interactive embeds are omitted. Complex Word
            layouts, equations, bookmarks and merged tables may need review.
            Relative files must be imported together; external media stays
            blocked until individually allowed. Originals are stored under
            _sources; extracted images under _converted. Nothing is saved back
            to the source files.
          </p>
        </details>
      </div>
    </Modal>
  );
}
