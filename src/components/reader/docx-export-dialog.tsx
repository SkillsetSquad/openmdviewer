"use client";
import { useEffect, useRef, useState } from "react";
import { Modal } from "./modal";
import { Button } from "@/components/ui/button";
import { download, fileName } from "@/lib/documents";
import { exportDocxInWorker } from "@/lib/docx-export-client";
import type { DocxExportInput, DocxExportResult } from "@/lib/docx-export";
export default function DocxExportDialog({
  path,
  snapshot,
  onBusy,
  onClose,
}: {
  path: string;
  snapshot: () => Promise<Omit<DocxExportInput, "options">>;
  onBusy: (value: boolean) => void;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<DocxExportInput["options"]>({
    pageSize: "a4",
    images: true,
    contents: false,
    pageNumbers: false,
  });
  const [busy, setBusy] = useState(false),
    [result, setResult] = useState<DocxExportResult | null>(null),
    [message, setMessage] = useState(""),
    [filename, setFilename] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      onBusy(false);
    },
    [onBusy],
  );
  function change(value: Partial<DocxExportInput["options"]>) {
    setOptions((previous) => ({ ...previous, ...value }));
    setResult(null);
    setMessage("");
  }
  async function generate() {
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    onBusy(true);
    setResult(null);
    setMessage("Preparing the current document…");
    try {
      const input = await snapshot();
      if (abort.signal.aborted) return;
      const output = await exportDocxInWorker(
        { ...input, options },
        abort.signal,
        (value) => {
          if (!abort.signal.aborted) setMessage(value);
        },
      );
      if (!abort.signal.aborted) {
        setResult(output);
        setFilename(fileName(input.path).replace(/\.[^.]+$/, "") + ".docx");
        setMessage(
          "Word document ready. Review the export notices before downloading.",
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error && error.name === "AbortError"
          ? "DOCX export canceled. Browser documents are unchanged."
          : `DOCX export failed: ${error instanceof Error ? error.message : "Browser storage unavailable."}`,
      );
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <Modal
      title="Export Word document"
      onClose={onClose}
      className="docx-export-dialog"
    >
      <p className="dialog-description">
        Create an editable DOCX copy of <strong>{path}</strong> locally.
        Headings, emphasis, lists, tables, code, and supported local images are
        included. The Markdown source stays unchanged.
      </p>
      <p className="dialog-description">
        Remote media is never fetched. Other workspace files and attachments
        remain text references. Math and diagrams retain their source. Personal
        notes, history, file connections, and hidden frontmatter fields are
        excluded.
      </p>
      <fieldset disabled={busy} className="docx-export-options">
        <legend>Word layout</legend>
        <label htmlFor="docx-paper-size">Paper size</label>
        <select
          id="docx-paper-size"
          value={options.pageSize}
          onChange={(event) =>
            change({ pageSize: event.target.value as "a4" | "letter" })
          }
        >
          <option value="a4">A4</option>
          <option value="letter">US Letter</option>
        </select>
        <label>
          <input
            type="checkbox"
            checked={options.images}
            onChange={(event) => change({ images: event.target.checked })}
          />{" "}
          Embed local PNG JPEG GIF images
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.contents}
            onChange={(event) => change({ contents: event.target.checked })}
          />{" "}
          Add linked contents after the title
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.pageNumbers}
            onChange={(event) => change({ pageNumbers: event.target.checked })}
          />{" "}
          Add page numbers
        </label>
      </fieldset>
      {message && <p role="status">{message}</p>}
      {result && (
        <div className="docx-export-summary">
          <p>
            {result.images.toLocaleString()} embedded{" "}
            {result.images === 1 ? "image" : "images"} ·{" "}
            {result.tables.toLocaleString()} editable{" "}
            {result.tables === 1 ? "table" : "tables"} ·{" "}
            {(result.bytes.length / 1024).toFixed(1)} KB
          </p>
          <p>{result.noticeCount.toLocaleString()} export notices.</p>
          {!!result.notices.length && (
            <details>
              <summary>Review DOCX export notices</summary>
              <ul>
                {result.notices.map((value, index) => (
                  <li key={index}>{value}</li>
                ))}
              </ul>
              {result.noticeCount > result.notices.length && (
                <p>Only the first 200 notices are retained.</p>
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
                "DOCX export canceled. Browser documents are unchanged.",
              );
            }}
          >
            Cancel DOCX export
          </Button>
        ) : (
          <Button onClick={() => void generate()}>
            {result ? "Generate fresh Word copy" : "Generate Word document"}
          </Button>
        )}
        {result && (
          <Button
            variant="outline"
            onClick={() =>
              download(
                filename,
                result.bytes as BlobPart,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              )
            }
          >
            Download Word document
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
