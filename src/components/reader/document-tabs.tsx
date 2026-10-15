"use client";
import { useId, useRef } from "react";
import { FileText, X } from "lucide-react";
import { fileName } from "@/lib/paths";
export const documentTabId = (id: string) =>
  `document-tab-${encodeURIComponent(id)}`;
export function DocumentTabs({
  items,
  activeId,
  onOpen,
  onClose,
}: {
  items: { id: string; path: string }[];
  activeId: string;
  onOpen: (id: string) => void;
  onClose: (id: string) => void;
}) {
  const hintId = useId();
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const close = (id: string) => {
    onClose(id);
    requestAnimationFrame(() => {
      const active = document.querySelector<HTMLButtonElement>(
        ".document-tab-list [aria-selected=true]",
      );
      (active || document.getElementById("active-document-panel"))?.focus();
    });
  };
  return (
    <div
      className="document-tabs"
      style={{ gridTemplateColumns: `repeat(${items.length}, max-content)` }}
    >
      <div
        className="document-tab-list"
        role="tablist"
        aria-label="Open documents"
        aria-describedby={hintId}
      >
        {items.map((item, index) => (
          <button
            key={item.id}
            ref={(element) => {
              if (element) buttons.current.set(item.id, element);
              else buttons.current.delete(item.id);
            }}
            id={documentTabId(item.id)}
            className={`document-tab-button ${item.id === activeId ? "active" : ""}`}
            role="tab"
            aria-selected={item.id === activeId}
            aria-controls="active-document-panel"
            tabIndex={item.id === activeId ? 0 : -1}
            onClick={() => onOpen(item.id)}
            onKeyDown={(event) => {
              if (event.key === "Delete") {
                event.preventDefault();
                close(item.id);
                return;
              }
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                items[
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? items.length - 1
                      : (index +
                          (event.key === "ArrowRight" ? 1 : -1) +
                          items.length) %
                        items.length
                ];
              if (next) {
                onOpen(next.id);
                requestAnimationFrame(() =>
                  buttons.current.get(next.id)?.focus(),
                );
              }
            }}
          >
            <FileText size={13} aria-hidden="true" />
            {fileName(item.path)}
          </button>
        ))}
      </div>
      <p id={hintId} className="sr-only">
        Use Left and Right, Home or End to choose a document. Delete closes the
        focused document tab.
      </p>
      {/* Close buttons are siblings of the tablist, not invalid owned tab roles. */}
      <div
        className="document-tab-closers"
        role="group"
        aria-label="Close documents"
      >
        {items.map((item) => (
          <div key={item.id}>
            <button
              aria-label={`Close ${fileName(item.path)} tab`}
              title={`Close ${fileName(item.path)} tab`}
              onClick={() => close(item.id)}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
