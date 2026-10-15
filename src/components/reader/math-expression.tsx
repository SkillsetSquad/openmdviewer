"use client";
import { useId, useState, type ReactNode } from "react";
import { Copy, Braces, Check } from "lucide-react";

export function MathExpression({
  source,
  display,
  limited,
  error,
  children,
}: {
  source: string;
  display: boolean;
  limited: boolean;
  error: string;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState("");
  const [copied, setCopied] = useState(false);
  const sourceId = useId();
  async function copy() {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setStatus("LaTeX source copied.");
    } catch {
      setCopied(false);
      setExpanded(true);
      setStatus(
        "Clipboard unavailable. Select and copy the LaTeX source below.",
      );
    }
  }
  return (
    <span
      className={`reader-math ${display ? "reader-math-display" : "reader-math-inline"}`}
      role="group"
      aria-label={display ? "Display equation" : "Inline equation"}
    >
      <span
        className={`math-rendered${limited ? " math-rendered-limited" : ""}`}
      >
        {children}
      </span>
      <span className="math-tools" aria-label="Equation tools">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={sourceId}
          aria-label={expanded ? "Hide LaTeX source" : "Show LaTeX source"}
          title={expanded ? "Hide LaTeX source" : "Show LaTeX source"}
        >
          <Braces size={14} />
          {display && <span>Source</span>}
        </button>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy LaTeX source"
          title="Copy LaTeX source"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
          {display && <span>Copy LaTeX</span>}
        </button>
      </span>
      {error && (
        <span className="math-feedback math-error">
          Could not fully render this equation. {error}
        </span>
      )}
      {limited && (
        <span className="math-feedback">
          This expression exceeds 30,000 characters. Its original LaTeX is shown
          without rendering.
        </span>
      )}
      <span id={sourceId} className="math-source-panel" hidden={!expanded}>
        <label htmlFor={`${sourceId}-input`}>LaTeX source</label>
        <textarea
          id={`${sourceId}-input`}
          readOnly
          value={source}
          rows={Math.min(10, Math.max(2, source.split("\n").length))}
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
        />
      </span>
      {status && (
        <span className="math-feedback" role="status">
          {status}
        </span>
      )}
    </span>
  );
}
