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
  HardDrive,
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
import { SearchHighlight } from "./search-highlight";
import {
  hasSearchQuery,
  type SearchPage,
  type SearchOptions,
  type SearchHit,
} from "@/lib/search-results";
import {
  searchHistoryEntry,
  searchOptionsLabel,
  type RecentSearch,
} from "@/lib/search-history";
import { fileName } from "@/lib/paths";

const icons = {
  files: Upload,
  localFile: HardDrive,
  folder: FolderOpen,
  new: FilePlus2,
  graph: Network,
  settings: Settings2,
  focus: Maximize2,
  exportZip: ArrowDownToLine,
  exportSite: BookOpen,
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
export default function CommandPalette({
  query,
  onQuery,
  documents,
  summaries,
  hasDocument,
  searching,
  onCancelSearch,
  onRetrySearch,
  failed,
  onCommand,
  onOpen,
  onClose,
  page,
  options,
  onOptions,
  onPage,
  history,
  historyError,
  onRemember,
  onRemoveHistory,
  onClearHistory,
  onRestoreHistory,
}: {
  history: RecentSearch[];
  historyError?: string;
  onRemember: () => void;
  onRemoveHistory: (key: string) => void;
  onClearHistory: () => void;
  onRestoreHistory: (entry: RecentSearch) => void;
  query: string;
  onQuery: (query: string) => void;
  documents: ReaderDocument[];
  summaries: Record<string, DocumentSummary>;
  hasDocument: boolean;
  searching: boolean;
  onCancelSearch: () => void;
  onRetrySearch: () => void;
  failed: boolean;
  onCommand: (id: CommandId) => void;
  onOpen: (id: string, hit?: SearchHit) => void;
  page: SearchPage | null;
  options: SearchOptions;
  onOptions: (options: SearchOptions) => void;
  onPage: (offset: number) => void;
  onClose: () => void;
}) {
  const hitMap = new Map(page?.hits.map((hit) => [hit.id, hit]) || []);
  const listId = useId();
  const hintId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const matches = useMemo(
    () => commandMatches(query, hasDocument),
    [query, hasDocument],
  );
  const only = query.trimStart().startsWith(">");
  const hasQuery = hasSearchQuery(query, options);
  const visibleDocuments = only ? [] : documents;
  const suggestions = only ? [] : page?.suggestions || [];
  const historyEntry = searchHistoryEntry(query, options);
  const remembered = history.some((entry) => entry.key === historyEntry?.key);
  const keys = [
    ...suggestions.map((_, index) => `suggestion:${index}`),
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
    if (key.startsWith("suggestion:")) {
      const suggestion = suggestions[Number(key.slice(11))];
      if (suggestion) onQuery(suggestion.query);
      setSelectedKey(null);
      input.current?.focus();
    } else if (key.startsWith("command:")) onCommand(key.slice(8) as CommandId);
    else onOpen(key.slice(9), hitMap.get(key.slice(9)));
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
          maxLength={512}
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
      {!only && (
        <div className="search-options">
          <label>
            Matching{" "}
            <select
              aria-label="Document matching"
              value={
                options.regex ? "regex" : options.literal ? "literal" : "fuzzy"
              }
              onChange={(event) =>
                onOptions(
                  event.target.value === "fuzzy"
                    ? { literal: false, caseSensitive: false, wholeWord: false }
                    : {
                        ...options,
                        regex: event.target.value === "regex",
                        literal: event.target.value !== "regex",
                      },
                )
              }
            >
              <option value="fuzzy">Fuzzy</option>
              <option value="literal">Literal</option>
              <option value="regex">Regex</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={options.caseSensitive}
              onChange={(event) =>
                onOptions({
                  ...options,
                  literal: !options.regex,
                  caseSensitive: event.target.checked,
                })
              }
            />{" "}
            Match case
          </label>
          <label>
            <input
              type="checkbox"
              checked={options.wholeWord}
              onChange={(event) =>
                onOptions({
                  ...options,
                  literal: !options.regex,
                  wholeWord: event.target.checked,
                })
              }
            />{" "}
            Whole words
          </label>
        </div>
      )}
      {!only && options.regex && (
        <div className="regex-search-help">
          <p>
            JavaScript pattern · Unicode and line anchors · Match case controls
            i · Use [\s\S] to span lines. Filters are treated as pattern text.
          </p>
          {searching && (
            <button type="button" onClick={onCancelSearch}>
              Cancel regex search
            </button>
          )}
          {page?.error && (
            <button type="button" onClick={onRetrySearch}>
              Retry regex search
            </button>
          )}
        </div>
      )}
      {!only && (
        <div className="search-memory">
          {historyEntry && (
            <button
              type="button"
              className="remember-search"
              disabled={remembered}
              onClick={onRemember}
            >
              <History size={13} aria-hidden="true" />{" "}
              {remembered ? "Search remembered" : "Remember search"}
            </button>
          )}
          <details className="recent-searches">
            <summary>Recent searches ({history.length})</summary>
            <p>
              Up to 30 searches, saved only in this browser and workspace.
              Opening a document result remembers its query.
            </p>
            {historyError && <p role="status">{historyError}</p>}
            {!history.length && !historyError && (
              <p>
                No recent searches yet. Type a query and choose Remember search.
              </p>
            )}
            {!!history.length && (
              <>
                <button
                  type="button"
                  className="clear-search-history"
                  onClick={onClearHistory}
                >
                  Clear search history
                </button>
                <ul>
                  {history.map((entry) => (
                    <li key={entry.key}>
                      <button
                        type="button"
                        className="restore-search"
                        aria-label={`Restore search: ${entry.query} (${searchOptionsLabel(entry.options)})`}
                        onClick={() => {
                          onRestoreHistory(entry);
                          setSelectedKey(null);
                          input.current?.focus();
                        }}
                      >
                        <span>{entry.query}</span>
                        <small>{searchOptionsLabel(entry.options)}</small>
                      </button>
                      <button
                        type="button"
                        className="remove-search"
                        aria-label={`Remove search: ${entry.query} (${searchOptionsLabel(entry.options)})`}
                        onClick={onRemoveHistory.bind(null, entry.key)}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </details>
        </div>
      )}
      <div
        className="palette-results"
        id={listId}
        role="listbox"
        aria-label="Documents and commands"
        aria-busy={searching && !only}
      >
        {!!suggestions.length && (
          <div role="group" aria-label="Filter suggestions">
            <div className="result-label" aria-hidden="true">
              WORKSPACE FILTER VALUES
            </div>
            {suggestions.map((suggestion, index) => {
              const key = `suggestion:${index}`;
              return (
                <button
                  role="option"
                  tabIndex={-1}
                  id={`${listId}-${index}`}
                  key={suggestion.query}
                  aria-selected={selected === key}
                  className={`command-result filter-suggestion ${selected === key ? "palette-active" : ""}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => setSelectedKey(key)}
                  onClick={() => activate(key)}
                >
                  <Search size={16} aria-hidden="true" />
                  <span>
                    {suggestion.filter}:<strong>{suggestion.value}</strong>
                    <small>
                      {suggestion.count} workspace document
                      {suggestion.count === 1 ? "" : "s"} with this value
                    </small>
                  </span>
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}
        {!!matches.length && (
          <div role="group" aria-label="Commands">
            <div className="result-label" aria-hidden="true">
              {hasQuery
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
                  id={`${listId}-${suggestions.length + index}`}
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
              {hasQuery
                ? `${page?.total ?? visibleDocuments.length} MATCHING DOCUMENT${(page?.total ?? visibleDocuments.length) === 1 ? "" : "S"}`
                : "DOCUMENTS"}
            </div>
            {visibleDocuments.map((doc, index) => {
              const key = `document:${doc.id}`;
              const hit = hitMap.get(doc.id);
              const terms = hit?.terms || [];
              return (
                <button
                  role="option"
                  tabIndex={-1}
                  id={`${listId}-${suggestions.length + matches.length + index}`}
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
                      <SearchHighlight
                        text={
                          hit?.title ||
                          summaries[doc.id]?.title ||
                          fileName(doc.path)
                        }
                        terms={terms}
                        options={options}
                        ranges={hit?.titleRanges}
                      />
                    </strong>
                    <small>
                      <SearchHighlight
                        text={doc.path}
                        terms={terms}
                        options={options}
                        ranges={hit?.pathRanges}
                      />
                    </small>
                    {hit?.heading && (
                      <small className="search-section">
                        Section:{" "}
                        <SearchHighlight
                          text={hit.heading.text}
                          terms={terms}
                          options={options}
                          ranges={hit.headingRanges}
                        />
                      </small>
                    )}
                    {hasQuery && hit && (
                      <span className="search-excerpt">
                        <SearchHighlight
                          text={hit.excerpt}
                          terms={[]}
                          options={options}
                          ranges={hit.excerptRanges}
                        />
                      </span>
                    )}
                    {hasQuery && hit && (
                      <span className="search-result-meta">
                        {hit.location
                          ? `Line ${hit.location.line}${hit.location.sourceOnly ? " · Source" : ""}${!hit.location.needle.length ? " · Zero-width match" : ""}`
                          : hit.heading
                            ? "Section match"
                            : "Title, path, or metadata"}
                        {hit.fuzzy && " · Fuzzy match"}
                        {hit.status && ` · ${hit.status}`}
                        {hit.tags.length > 0 && ` · ${hit.tags.join(", ")}`}
                      </span>
                    )}
                  </span>
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}
      </div>
      {!only && page && page.total > 50 && (
        <nav className="search-pagination" aria-label="Search result pages">
          <button
            type="button"
            disabled={searching || page.offset === 0}
            onClick={() => onPage(page.offset - 50)}
          >
            Previous results
          </button>
          <span>
            {page.offset + 1}–{Math.min(page.offset + 50, page.total)} of{" "}
            {page.total} documents
          </span>
          <button
            type="button"
            disabled={searching || page.offset + 50 >= page.total}
            onClick={() => onPage(page.offset + 50)}
          >
            Next results
          </button>
        </nav>
      )}
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
        {page?.error && !only && <p className="empty-panel">{page.error}</p>}
        {hasQuery && !keys.length && !page?.error && (!searching || only) && (
          <p className="empty-panel">
            {only
              ? "No matching commands. Try settings, graph, or export."
              : "No matches. Try a different phrase, path:docs, tag:guide, or > for commands."}
          </p>
        )}
      </div>
      <p className="palette-hint" id={hintId}>
        ↑ / ↓ to navigate · Enter to choose · Escape to close · Type &gt; to
        search actions only. Tab to manage recent searches.
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
