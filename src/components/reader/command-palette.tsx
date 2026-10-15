"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  BookOpen,
  StickyNote,
  ChevronRight,
  CircleHelp,
  Copy,
  FilePlus2,
  FileText,
  FolderOpen,
  History,
  Info,
  Link2,
  Maximize2,
  Moon,
  Network,
  Printer,
  Search,
  Settings2,
  ShieldCheck,
  SplitSquareHorizontal,
  Trash2,
  Upload,
  Code2,
} from "lucide-react";
import { Modal } from "./modal";
import { commandMatches, type CommandId } from "@/lib/commands";
import type { DocumentSummary } from "@/lib/references";
import type { ReaderDocument } from "@/lib/types";
import { fileName } from "@/lib/paths";

const icons = {
  files: Upload,
  folder: FolderOpen,
  new: FilePlus2,
  graph: Network,
  settings: Settings2,
  focus: Maximize2,
  exportZip: ArrowDownToLine,
  workspaces: FolderOpen,
  theme: Moon,
  health: ShieldCheck,
  trash: Trash2,
  help: CircleHelp,
  read: BookOpen,
  source: Code2,
  split: SplitSquareHorizontal,
  backlinks: Link2,
  analyze: ShieldCheck,
  properties: Info,
  notes: StickyNote,
  history: History,
  copy: Copy,
  exportMarkdown: ArrowDownToLine,
  exportPdf: Printer,
  presentation: Maximize2,
};
function excerpt(content: string, query: string) {
  const searchable = content.slice(0, 50000);
  const term =
    query.match(/"([^"]+)"/)?.[1] ||
    query.split(/\s+/).find((term) => term && !term.includes(":")) ||
    "";
  const position = term
    ? searchable.toLowerCase().indexOf(term.toLowerCase())
    : -1;
  const start = Math.max(0, position - 40);
  return searchable.slice(start, start + 150).replace(/[#*`]/g, "");
}

export default function CommandPalette({
  query,
  onQuery,
  documents,
  summaries,
  hasDocument,
  searching,
  failed,
  onCommand,
  onOpen,
  onClose,
}: {
  query: string;
  onQuery: (query: string) => void;
  documents: ReaderDocument[];
  summaries: Record<string, DocumentSummary>;
  hasDocument: boolean;
  searching: boolean;
  failed: boolean;
  onCommand: (id: CommandId) => void;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const listId = useId();
  const hintId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const matches = useMemo(
    () => commandMatches(query, hasDocument),
    [query, hasDocument],
  );
  const only = query.trimStart().startsWith(">");
  const visibleDocuments = only ? [] : documents;
  const keys = [
    ...matches.map((command) => `command:${command.id}`),
    ...visibleDocuments.map((doc) => `document:${doc.id}`),
  ];
  const selected =
    selectedKey && keys.includes(selectedKey) ? selectedKey : keys[0];
  const activeIndex = selected ? keys.indexOf(selected) : -1;
  const activeId = activeIndex < 0 ? undefined : `${listId}-${activeIndex}`;
  useEffect(() => {
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (activeId)
      document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId, selected]);
  const activate = (key: string | undefined) => {
    if (!key) return;
    if (key.startsWith("command:")) onCommand(key.slice(8) as CommandId);
    else onOpen(key.slice(9));
  };
  return (
    <Modal
      title="Search your workspace"
      wide
      className="command-palette-dialog"
      onClose={onClose}
    >
      <div className="palette-search">
        <Search size={20} aria-hidden="true" />
        <input
          ref={input}
          autoFocus
          role="combobox"
          aria-label="Search documents and commands"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-describedby={hintId}
          autoComplete="off"
          spellCheck={false}
          placeholder="Search documents or commands · > for actions"
          value={query}
          onChange={(event) => {
            setSelectedKey(null);
            onQuery(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              event.stopPropagation();
              if (keys.length)
                setSelectedKey(
                  keys[
                    (activeIndex +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      keys.length) %
                      keys.length
                  ],
                );
            }
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              activate(selected);
            }
          }}
        />
        <kbd>esc</kbd>
      </div>
      <div
        className="palette-results"
        id={listId}
        role="listbox"
        aria-label="Documents and commands"
        aria-busy={searching && !only}
      >
        {!!matches.length && (
          <div role="group" aria-label="Commands">
            <div className="result-label" aria-hidden="true">
              {query.trim()
                ? `${matches.length} MATCHING ACTIONS`
                : "QUICK ACTIONS"}
            </div>
            {matches.map((command, index) => {
              const Icon = icons[command.id];
              const key = `command:${command.id}`;
              return (
                <button
                  role="option"
                  tabIndex={-1}
                  id={`${listId}-${index}`}
                  aria-selected={selected === key}
                  className={`command-result ${selected === key ? "palette-active" : ""}`}
                  key={key}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => setSelectedKey(key)}
                  onClick={() => activate(key)}
                >
                  <Icon size={17} aria-hidden="true" />
                  <span>{command.label}</span>
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}
        {!only && (
          <div role="group" aria-label="Documents">
            <div className="result-label" aria-hidden="true">
              {query.trim()
                ? `${visibleDocuments.length}${visibleDocuments.length === 50 ? "+" : ""} MATCHING DOCUMENTS`
                : "DOCUMENTS"}
            </div>
            {visibleDocuments.map((doc, index) => {
              const key = `document:${doc.id}`;
              return (
                <button
                  role="option"
                  tabIndex={-1}
                  id={`${listId}-${matches.length + index}`}
                  aria-selected={selected === key}
                  className={`search-result ${selected === key ? "palette-active" : ""}`}
                  key={key}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => setSelectedKey(key)}
                  onClick={() => activate(key)}
                >
                  <FileText size={18} aria-hidden="true" />
                  <span>
                    <strong>
                      {summaries[doc.id]?.title || fileName(doc.path)}
                    </strong>
                    <small>{doc.path}</small>
                    {query.trim() && <p>{excerpt(doc.content, query)}</p>}
                  </span>
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="palette-feedback" role="status" aria-live="polite">
        {searching && !only && (
          <p className="empty-panel">Searching documents on this device…</p>
        )}
        {failed && !only && (
          <p className="empty-panel">
            Document search is unavailable. Commands still work; reload the app
            to rebuild the document index.
          </p>
        )}
        {query.trim() && !keys.length && (!searching || only) && (
          <p className="empty-panel">
            {only
              ? "No matching commands. Try settings, graph, or export."
              : "No matches. Try a different phrase, path:docs, tag:guide, or > for commands."}
          </p>
        )}
      </div>
      <p className="palette-hint" id={hintId}>
        ↑ / ↓ to navigate · Enter to choose · Escape to close · Type &gt; to
        search actions only.
      </p>
      <footer className="palette-footer">
        <span>
          <ShieldCheck size={12} />
          Search runs on this device
        </span>
        <span>
          {keys.length} available {keys.length === 1 ? "result" : "results"}
        </span>
      </footer>
    </Modal>
  );
}
