"use client";
import { useEffect, useMemo, useState } from "react";
import { Download, FileText, RefreshCw, ShieldCheck } from "lucide-react";
import { Modal } from "./modal";
import { Button } from "@/components/ui/button";
import { basePath, type ReaderDocument } from "@/lib/types";
import {
  healthRules,
  type HealthIssue,
  type WorkspaceHealth,
} from "@/lib/health";
import { download } from "@/lib/documents";
export default function Insights({
  documents,
  assetPaths,
  documentId,
  onOpenIssue,
  onClose,
}: {
  documents: ReaderDocument[];
  assetPaths: string[];
  documentId?: string;
  onOpenIssue: (issue: HealthIssue) => void;
  onClose: () => void;
}) {
  const [snapshot, setSnapshot] = useState(() => ({
    documents,
    assetPaths,
    documentId,
  }));
  const [report, setReport] = useState<WorkspaceHealth | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("Starting local checks…");
  const [tab, setTab] = useState<"findings" | "documents" | "rules">(
    "findings",
  );
  const [filter, setFilter] = useState("");
  const tooLarge =
    snapshot.documents
      .filter((d) => !snapshot.documentId || d.id === snapshot.documentId)
      .reduce((n, d) => n + d.content.length, 0) > 25000000;
  useEffect(() => {
    if (tooLarge) return;
    let canceled = false;
    const worker = new Worker(`${basePath}/analysis-worker.js`);
    worker.onmessage = (event) => {
      if (canceled) return;
      if (event.data.type === "progress")
        setProgress(
          `${event.data.phase} ${event.data.done} of ${event.data.total} documents…`,
        );
      else if (event.data.type === "result") setReport(event.data.report);
      else if (event.data.type === "error") setError(event.data.message);
    };
    worker.onerror = () => {
      if (!canceled)
        setError("Local analysis could not run. Reload the app and try again.");
    };
    worker.postMessage(snapshot);
    return () => {
      canceled = true;
      worker.terminate();
    };
  }, [snapshot, tooLarge]);
  const findings = useMemo(
    () =>
      report?.documents
        .flatMap((doc) => doc.issues)
        .filter(
          (issue) =>
            !filter ||
            `${issue.path} ${issue.message} ${issue.rule}`
              .toLowerCase()
              .includes(filter.toLowerCase()),
        ) || [],
    [report, filter],
  );
  return (
    <Modal
      title={documentId ? "Document health" : "Workspace health"}
      wide
      onClose={onClose}
    >
      <div className="insights-content">
        <p className="dialog-description">
          A local snapshot of the current workspace view. Scores measure the
          rules below, not factual accuracy. External URLs are not fetched.
        </p>
        <div className="insights-toolbar">
          <Button
            variant="outline"
            onClick={() => {
              setReport(null);
              setError("");
              setProgress("Starting local checks…");
              setSnapshot({ documents, assetPaths, documentId });
            }}
          >
            <RefreshCw size={13} />
            Refresh report
          </Button>
          <Button
            variant="outline"
            disabled={!report}
            onClick={() =>
              download(
                "openmdviewer-health.json",
                JSON.stringify(report, null, 2),
                "application/json",
              )
            }
          >
            <Download size={13} />
            Export JSON
          </Button>
        </div>
        {tooLarge || error ? (
          <p className="frontmatter-error" role="alert">
            {tooLarge
              ? "This report exceeds the 25-million-character analysis limit. Analyze individual documents or split the workspace."
              : error}
          </p>
        ) : !report ? (
          <p className="empty-panel" role="status">
            {progress}
          </p>
        ) : (
          <>
            <div className="health-cards">
              <div>
                <strong>
                  {report.summary.score === null
                    ? "—"
                    : `${report.summary.score}/100`}
                </strong>
                <span>Rule-based health</span>
              </div>
              <div>
                <strong>{report.summary.documents}</strong>
                <span>{documentId ? "Document" : "Documents"}</span>
              </div>
              <div>
                <strong>{report.summary.words.toLocaleString()}</strong>
                <span>Rendered-text words</span>
              </div>
              <div>
                <strong>{report.summary.issues}</strong>
                <span>Findings</span>
              </div>
            </div>
            {!documentId && (
              <div className="health-secondary">
                <span>{report.summary.folders} document folders</span>
                <span>{report.summary.brokenLinks} link/image issues</span>
                <span>
                  {report.summary.missingMetadata} missing owner/review metadata
                </span>
                <span>{report.summary.staleDocuments} overdue reviews</span>
                <span>
                  {report.summary.unlinkedDocuments} unlinked documents
                </span>
              </div>
            )}
            <div
              className="insights-tabs"
              role="tablist"
              aria-label="Health report views"
            >
              {(["findings", "documents", "rules"] as const).map((name) => (
                <button
                  key={name}
                  role="tab"
                  aria-selected={tab === name}
                  onClick={() => setTab(name)}
                >
                  {name === "findings"
                    ? "Findings"
                    : name === "documents"
                      ? "Documents"
                      : "Scoring rules"}
                </button>
              ))}
            </div>
            {tab === "findings" && (
              <>
                <label className="form-label">
                  Filter findings
                  <input
                    placeholder="File path, message, or rule…"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                </label>
                <div className="health-findings">
                  {findings.length ? (
                    findings.map((issue) => (
                      <button key={issue.id} onClick={() => onOpenIssue(issue)}>
                        <span className={`finding-level ${issue.severity}`}>
                          {issue.severity}
                        </span>
                        <span>
                          <strong>{issue.message}</strong>
                          <small>
                            {issue.path} · line {issue.line} · −{issue.penalty}{" "}
                            points
                          </small>
                        </span>
                        <FileText size={15} />
                      </button>
                    ))
                  ) : (
                    <div className="analysis-good">
                      <ShieldCheck size={25} />
                      <strong>
                        {filter
                          ? "No matching findings."
                          : "No findings from these checks."}
                      </strong>
                    </div>
                  )}
                </div>
              </>
            )}
            {tab === "documents" && (
              <div className="health-documents">
                {report.documents.map((doc) => (
                  <div key={doc.id}>
                    <div>
                      <strong>{doc.title}</strong>
                      <small>{doc.path}</small>
                      <p>
                        {doc.owner || "Owner not declared"} ·{" "}
                        {doc.status || "Status not declared"} ·{" "}
                        {doc.statistics.words} words · {doc.statistics.headings}{" "}
                        headings
                      </p>
                      <p>
                        Last review: {doc.lastReviewed || "Not declared"} · Next
                        review: {doc.nextReview || "Not declared"}
                      </p>
                    </div>
                    <span>{doc.score}/100</span>
                    <button
                      onClick={() =>
                        onOpenIssue({
                          id: `open-${doc.id}`,
                          documentId: doc.id,
                          path: doc.path,
                          line: 1,
                          rule: "missing_title",
                          severity: "info",
                          penalty: 0,
                          message: "Open document source",
                        })
                      }
                    >
                      Open source
                    </button>
                  </div>
                ))}
              </div>
            )}
            {tab === "rules" && (
              <div className="health-rules">
                <p>
                  Each document starts at 100. Subtract the points for each
                  finding, with a minimum of 0. Workspace health is the rounded
                  mean of document scores. An empty workspace has no score.
                  These are deterministic checks, not AI judgments.
                </p>
                <p>
                  Reviews use calendar dates on this device. A declared
                  next-review date takes precedence over the 180-day fallback.
                  Duplicate bodies are compared after whitespace normalization,
                  excluding frontmatter, and only when at least 50 characters
                  long.
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Check</th>
                      <th>Points per finding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {healthRules.map((rule) => (
                      <tr key={rule.id}>
                        <td>{rule.label}</td>
                        <td>−{rule.penalty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p>
                  No network requests validate external URLs. No score proves
                  content is true, complete, or compliant. Missing owner/review
                  fields are recommendations for documentation workflows.
                </p>
              </div>
            )}
            <footer className="health-checked">
              Checked {new Date(report.checkedAt).toLocaleString()} · rules v
              {report.version}
            </footer>
          </>
        )}
      </div>
    </Modal>
  );
}
