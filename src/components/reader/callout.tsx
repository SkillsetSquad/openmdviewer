"use client";
import { useEffect, type ReactNode } from "react";
import { ChevronDown, Info, Lightbulb, ShieldAlert } from "lucide-react";
import type { Components } from "react-markdown";
function style(kind: string) {
  return ["tip", "success"].includes(kind)
    ? "tip"
    : ["warning", "caution", "error"].includes(kind)
      ? "warning"
      : "note";
}
function Icon({ kind }: { kind: string }) {
  const Glyph =
    style(kind) === "tip"
      ? Lightbulb
      : style(kind) === "warning"
        ? ShieldAlert
        : Info;
  return <Glyph className="callout-icon" size={20} aria-hidden="true" />;
}
export const BlockquoteRenderer: Components["blockquote"] = ({
  children,
  node,
}) => {
  const kind = String(node?.properties.dataCallout || "");
  return (
    <blockquote className={kind ? `callout ${style(kind)}` : "quote"}>
      {kind && <Icon kind={kind} />}
      <div>{children}</div>
    </blockquote>
  );
};
export const DetailsRenderer: Components["details"] = ({
  node,
  children,
  ...props
}) => {
  const kind = String(node?.properties.dataCallout || "");
  return (
    <details
      {...props}
      className={kind ? `callout callout-fold ${style(kind)}` : props.className}
    >
      {children}
    </details>
  );
};
export const SummaryRenderer: Components["summary"] = ({
  node,
  children,
  ...props
}) => {
  const kind = String(node?.properties.dataCallout || "");
  return (
    <summary {...props}>
      {kind ? (
        <>
          <Icon kind={kind} />
          <span>{children as ReactNode}</span>
          <ChevronDown
            className="callout-chevron"
            size={16}
            aria-hidden="true"
          />
        </>
      ) : (
        children
      )}
    </summary>
  );
};
/** Expand closed callouts for a real print operation, then restore the reader state. */
export function useCalloutPrint() {
  useEffect(() => {
    let closed: HTMLDetailsElement[] = [];
    const before = () => {
      if (closed.length) return;
      closed = Array.from(
        document.querySelectorAll<HTMLDetailsElement>(
          "article details.callout-fold:not([open])",
        ),
      );
      closed.forEach((node) => (node.open = true));
    };
    const after = () => {
      closed.forEach((node) => (node.open = false));
      closed = [];
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      after();
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
}
