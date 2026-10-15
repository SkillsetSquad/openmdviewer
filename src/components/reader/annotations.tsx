"use client";
import { useState, type FormEvent } from "react";
import {
  Bookmark,
  Highlighter,
  StickyNote,
  Download,
  Pencil,
  Trash2,
} from "lucide-react";
import { Modal } from "./modal";
import { Button } from "@/components/ui/button";
import {
  annotationExport,
  annotationLimit,
  createAnnotation,
} from "@/lib/annotations";
import { download, headings } from "@/lib/documents";
import type { ReaderAnnotation, ReaderDocument, TextQuote } from "@/lib/types";
import type { AnnotationLocation } from "@/hooks/use-annotations";
const labels: Record<string, string> = {
  missing: "Location no longer found",
  ambiguous: "Several passages match; location uncertain",
  found: "Location available",
  document: "Document note",
  source: "Open reading view to locate",
};
export default function Annotations({
  doc,
  documents,
  selection,
  locations,
  currentHeading,
  onClose,
  onSave,
  onNavigate,
}: {
  doc: ReaderDocument;
  documents: ReaderDocument[];
  selection?: TextQuote;
  locations: Record<string, AnnotationLocation>;
  currentHeading: string;
  onClose: () => void;
  onSave: (documentId: string, items: ReaderAnnotation[]) => Promise<boolean>;
  onNavigate: (documentId: string, item: ReaderAnnotation) => void;
}) {
  const [canPaint] = useState(
    () =>
      typeof Highlight !== "undefined" &&
      typeof CSS !== "undefined" &&
      !!CSS.highlights,
  );
  const [scope, setScope] = useState("document");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<ReaderAnnotation["kind"]>(
    selection ? "highlight" : "note",
  );
  const [quote, setQuote] = useState(selection);
  const [heading, setHeading] = useState(() =>
    headings(doc.content).some((h) => h.id === currentHeading)
      ? currentHeading
      : "",
  );
  const [editing, setEditing] = useState<{
    documentId: string;
    item: ReaderAnnotation;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const target = documents.find((d) => d.id === editing?.documentId) || doc;
  const outline = headings(target.content);
  const list = (scope === "workspace" ? documents : [doc])
    .flatMap((d) =>
      (d.annotations || []).map((item) => ({ document: d, item })),
    )
    .filter(({ document, item }) =>
      `${document.path}\n${item.title}\n${item.note}\n${item.quote?.exact || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.item.updatedAt - a.item.updatedAt);
  const pages = Math.max(1, Math.ceil(list.length / 50));
  const currentPage = Math.min(page, pages);
  const visibleItems = list.slice((currentPage - 1) * 50, currentPage * 50);
  function reset() {
    setEditing(null);
    setTitle("");
    setNote("");
    setQuote(undefined);
    setKind("note");
    setHeading("");
  }
  async function persist(documentId: string, items: ReaderAnnotation[]) {
    setBusy(true);
    setMessage("");
    try {
      const ok = await onSave(documentId, items);
      if (!ok)
        setMessage(
          "Could not save. Review browser storage or the pending conflict; your draft remains here.",
        );
      return ok;
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save this reading data.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!editing && (target.annotations?.length || 0) >= annotationLimit) {
      setMessage(
        "This document already has 500 reading items. Export or remove an item first.",
      );
      return;
    }
    if (kind === "highlight" && !quote) {
      setMessage("Select a passage in reading view before adding a highlight.");
      return;
    }
    if (kind === "note" && !note.trim()) {
      setMessage("Write a note before saving.");
      return;
    }
    const item = createAnnotation(
      {
        kind,
        title:
          title.trim() ||
          (kind === "bookmark"
            ? outline.find((h) => h.id === heading)?.text || "Document start"
            : quote?.exact.slice(0, 80) || "Personal note"),
        note: note.trim(),
        quote: kind === "bookmark" ? undefined : quote,
        heading: kind === "bookmark" ? heading : undefined,
      },
      editing?.item,
    );
    const items = editing
      ? (target.annotations || []).map((a) => (a.id === item.id ? item : a))
      : [...(target.annotations || []), item];
    if (await persist(target.id, items)) {
      reset();
      setMessage("Reading item saved in this browser.");
    }
  }
  return (
    <Modal
      title="Notes and bookmarks"
      wide
      onClose={onClose}
      dismissible={!busy}
      className="annotations-dialog"
    >
      <div className="annotation-content">
        <p className="dialog-description">
          Private reading data saved in this browser, separate from Markdown.
          Workspace ZIP backups include it.
        </p>
        {!canPaint && (
          <p className="annotation-hint">
            This browser cannot paint saved highlights. Quotes, notes, and Go to
            location remain available.
          </p>
        )}
        <form className="annotation-compose" onSubmit={submit}>
          <h3>
            {editing
              ? "Edit reading item"
              : quote
                ? "Selected passage"
                : "Add a reading item"}
          </h3>
          {editing && <p className="annotation-path">{target.path}</p>}
          {quote && <blockquote>{quote.exact}</blockquote>}
          <div className="annotation-form-row">
            <label>
              Type
              <select
                aria-label="Reading item type"
                value={kind}
                onChange={(e) =>
                  setKind(e.target.value as ReaderAnnotation["kind"])
                }
                disabled={busy}
              >
                <option value="note">Note</option>
                <option value="bookmark">Bookmark</option>
                <option value="highlight" disabled={!quote}>
                  Highlight
                </option>
              </select>
            </label>
            <label>
              Title
              <input
                aria-label="Reading item title"
                value={title}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Optional title"
                disabled={busy}
              />
            </label>
          </div>
          {kind === "bookmark" && (
            <label>
              Section
              <select
                aria-label="Bookmark section"
                value={heading}
                onChange={(e) => setHeading(e.target.value)}
                disabled={busy}
              >
                <option value="">Document start</option>
                {!outline.some((h) => h.id === heading) && heading && (
                  <option value={heading}>
                    Saved section (currently missing)
                  </option>
                )}
                {outline.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.text}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {kind === "note" ? "Note" : "Note (optional)"}
            <textarea
              aria-label="Personal note"
              value={note}
              maxLength={10000}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
              disabled={busy}
              required={kind === "note"}
            />
          </label>
          <div className="annotation-compose-actions">
            <Button type="submit" disabled={busy}>
              {busy
                ? "Saving…"
                : editing
                  ? "Save reading item"
                  : "Add reading item"}
            </Button>
            {(editing || quote) && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={reset}
              >
                Cancel draft
              </Button>
            )}
          </div>
          {!quote && !editing && (
            <p className="annotation-hint">
              To highlight prose, select up to 8,000 characters in reading view,
              then open Notes and bookmarks. Code blocks, tables, math,
              diagrams, and media controls are excluded.
            </p>
          )}
        </form>
        <div className="annotation-list-tools">
          <label>
            Show
            <select
              aria-label="Reading items scope"
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setPage(1);
              }}
            >
              <option value="document">This document</option>
              <option value="workspace">Whole workspace</option>
            </select>
          </label>
          <input
            aria-label="Find reading items"
            type="search"
            placeholder="Find notes, passages, files…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
          <button
            type="button"
            onClick={() => {
              download(
                "openmdviewer-annotations.json",
                annotationExport(scope === "workspace" ? documents : [doc]),
                "application/json",
              );
              setMessage("Annotations JSON download requested.");
            }}
          >
            <Download size={14} />
            Export JSON
          </button>
        </div>
        <p role="status" className="annotation-message">
          {message ||
            `${list.length} saved reading ${list.length === 1 ? "item" : "items"}`}
        </p>
        <ul className="annotation-list" aria-label="Saved reading items">
          {visibleItems.map(({ document: owner, item }) => (
            <li key={`${owner.id}:${item.id}`}>
              <div className="annotation-item-heading">
                {item.kind === "bookmark" ? (
                  <Bookmark size={15} />
                ) : item.kind === "highlight" ? (
                  <Highlighter size={15} />
                ) : (
                  <StickyNote size={15} />
                )}
                <strong>{item.title}</strong>
                <span>{item.kind}</span>
              </div>
              {scope === "workspace" && (
                <p className="annotation-path">{owner.path}</p>
              )}
              {item.quote && <blockquote>{item.quote.exact}</blockquote>}
              {item.note && <p className="annotation-note">{item.note}</p>}
              <small>
                {owner.id === doc.id
                  ? labels[locations[item.id] || "source"]
                  : "Open document to locate"}{" "}
                · {new Date(item.updatedAt).toLocaleString()}
              </small>
              <div className="annotation-item-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onNavigate(owner.id, item)}
                >
                  Go to location
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditing({ documentId: owner.id, item });
                    setKind(item.kind);
                    setTitle(item.title);
                    setNote(item.note);
                    setQuote(item.quote);
                    setHeading(item.heading || "");
                    setMessage("");
                  }}
                >
                  <Pencil size={13} />
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await persist(
                        owner.id,
                        (owner.annotations || []).filter(
                          (a) => a.id !== item.id,
                        ),
                      )
                    ) {
                      if (editing?.item.id === item.id) reset();
                      setMessage("Reading item removed.");
                    }
                  }}
                >
                  <Trash2 size={13} />
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
        {pages > 1 && (
          <nav
            className="annotation-pagination"
            aria-label="Reading items pages"
          >
            <button
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous items
            </button>
            <span>
              Page {currentPage} of {pages}
            </span>
            <button
              disabled={currentPage === pages}
              onClick={() => setPage(currentPage + 1)}
            >
              Next items
            </button>
          </nav>
        )}
        {!list.length && (
          <p className="empty-panel">
            {query
              ? "No reading items match your search."
              : "No saved reading items in this view yet."}
          </p>
        )}
      </div>
    </Modal>
  );
}
