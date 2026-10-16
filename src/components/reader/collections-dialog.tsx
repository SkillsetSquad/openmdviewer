"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LibraryBig, Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "./modal";
import { storage } from "@/lib/storage";
import {
  CollectionConflict,
  collectionLimit,
  normalizeCollection,
  type CollectionDraft,
  type ReaderCollection,
  type ReadingActivity,
} from "@/lib/collections";
import type { ReaderDocument } from "@/lib/types";
import { basePath } from "@/lib/types";
import type { DocumentSummary } from "@/lib/references";
import { fileName } from "@/lib/paths";
import {
  defaultSearchOptions,
  type SearchOptions,
  type SearchPage,
  type SearchHit,
} from "@/lib/search-results";
import { searchOptionsLabel } from "@/lib/search-history";
import type { WorkspaceHealth } from "@/lib/health";

type Builtin = "favorites" | "recent" | "review" | "issues";
type View = Builtin | { id: string };
const builtins: { id: Builtin; name: string }[] = [
  { id: "recent", name: "Recently opened" },
  { id: "favorites", name: "Favorites" },
  { id: "review", name: "Needs review" },
  { id: "issues", name: "Documentation issues" },
];
const pageSize = 50;
type SearchState = {
  query: string;
  options: SearchOptions;
  page: SearchPage | null;
  failed: boolean;
  offset: number;
};
export default function CollectionsDialog({
  workspaceId,
  documents,
  summaries,
  indexing,
  assetPaths,
  search,
  onSearch,
  onCancelSearch,
  onRetrySearch,
  onOpen,
  onClose,
}: {
  workspaceId: string;
  documents: ReaderDocument[];
  summaries: Record<string, DocumentSummary>;
  indexing: boolean;
  assetPaths: string[];
  search: SearchState;
  onSearch: (query: string, options: SearchOptions, offset: number) => void;
  onCancelSearch: () => void;
  onRetrySearch: () => void;
  onOpen: (id: string, hit?: SearchHit) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<ReaderCollection[]>([]),
    [activity, setActivity] = useState<ReadingActivity[]>([]);
  const [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [epoch, setEpoch] = useState(0);
  const [view, setView] = useState<View>("recent"),
    [editing, setEditing] = useState<{ original?: ReaderCollection } | null>(
      null,
    ),
    [deleting, setDeleting] = useState<ReaderCollection | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    const [collections, recent] = await Promise.all([
      storage.collections(workspaceId),
      storage.recentDocuments(workspaceId),
    ]);
    if (mounted.current) {
      setItems(collections);
      setActivity(recent);
      setLoaded(true);
      setError("");
    }
  }, [workspaceId]);
  useEffect(() => {
    let closed = false;
    Promise.all([
      storage.collections(workspaceId),
      storage.recentDocuments(workspaceId),
    ])
      .then(([collections, recent]) => {
        if (!closed) {
          setItems(collections);
          setActivity(recent);
          setLoaded(true);
          setError("");
        }
      })
      .catch(() => {
        if (!closed) {
          setLoaded(false);
          setError(
            "Collections could not be read from this browser. Export a backup before clearing storage.",
          );
        }
      });
    return () => {
      closed = true;
    };
  }, [workspaceId, epoch]);
  useEffect(() => {
    const refreshOnFocus = () => setEpoch((n) => n + 1);
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, []);
  const selected =
    typeof view === "object"
      ? items.find((item) => item.id === view.id)
      : undefined;
  const title =
    typeof view === "string"
      ? builtins.find((item) => item.id === view)!.name
      : selected?.name || "Collection unavailable";
  async function save(draft: CollectionDraft, original?: ReaderCollection) {
    setBusy(true);
    try {
      const saved = await storage.putCollection(workspaceId, draft, original);
      await refresh();
      if (mounted.current) {
        setEditing(null);
        setView({ id: saved.id });
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const docMap = useMemo(
    () => new Map(documents.map((doc) => [doc.id, doc])),
    [documents],
  );
  const recent = activity.flatMap((item) =>
    docMap.has(item.documentId) ? [docMap.get(item.documentId)!] : [],
  );
  return (
    <Modal
      title="Collections"
      wide
      className="collections-dialog"
      dismissible={!busy}
      onClose={onClose}
    >
      <p className="dialog-description">
        Group this workspace without moving or changing source files. Saved
        collections are included in workspace ZIP backups; reading history stays
        in this browser.
      </p>
      {error && (
        <p role="alert" className="frontmatter-error">
          {error}
        </p>
      )}
      {editing ? (
        <CollectionEditor
          key={
            editing.original
              ? `${editing.original.id}-${editing.original.revision}`
              : "new"
          }
          original={editing.original}
          documents={documents}
          summaries={summaries}
          busy={busy}
          onSave={save}
          onCancel={() => setEditing(null)}
          onLoadSaved={async () => {
            await refresh();
            const current = (await storage.collections(workspaceId)).find(
              (item) => item.id === editing.original?.id,
            );
            if (!current)
              throw new Error(
                "This collection was removed. Rename your draft and save it as a new collection, or cancel.",
              );
            setEditing({ original: current });
          }}
        />
      ) : deleting ? (
        <div className="collection-delete">
          <h3>Delete {deleting.name}?</h3>
          <p>
            The saved group or search will be removed. Its documents, tags,
            notes and original files stay in place.
          </p>
          <div className="dialog-buttons">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Cancel deletion
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await storage.deleteCollection(
                    workspaceId,
                    deleting.id,
                    deleting.revision,
                  );
                  await refresh();
                  setDeleting(null);
                  setView("recent");
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Collection could not be deleted.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Delete collection
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="collection-toolbar">
            <Button
              disabled={!loaded || busy || items.length >= collectionLimit}
              onClick={() => setEditing({})}
            >
              <Plus size={14} />
              New collection
            </Button>
            <Button variant="outline" onClick={() => setEpoch((n) => n + 1)}>
              <RefreshCw size={14} />
              Refresh collections
            </Button>
            <small>
              {loaded
                ? `${items.length} / ${collectionLimit} saved`
                : error
                  ? "Saved count unavailable"
                  : "Opening collections…"}
            </small>
          </div>
          <div className="collection-layout">
            <nav aria-label="Collection library" className="collection-library">
              {builtins.map((item) => (
                <button
                  key={item.id}
                  aria-current={view === item.id ? "page" : undefined}
                  onClick={() => {
                    setView(item.id);
                    setError("");
                  }}
                >
                  {item.name}
                </button>
              ))}
              <h3>Saved collections</h3>
              {!loaded ? (
                <p role="status">
                  {error ? "Collections unavailable" : "Opening collections…"}
                </p>
              ) : !items.length ? (
                <p>No saved collections yet.</p>
              ) : (
                items.map((item) => (
                  <button
                    key={item.id}
                    aria-label={`Open collection: ${item.name}`}
                    aria-current={selected?.id === item.id ? "page" : undefined}
                    onClick={() => {
                      setView({ id: item.id });
                      setError("");
                    }}
                  >
                    <LibraryBig size={14} />
                    <span>
                      {item.name}
                      <small>
                        {item.kind === "search"
                          ? "Saved search"
                          : item.kind === "tag"
                            ? "Tag group"
                            : "Manual group"}
                      </small>
                    </span>
                  </button>
                ))
              )}
            </nav>
            <section
              className="collection-view"
              aria-label="Collection documents"
            >
              <div className="collection-heading">
                <h3>{title}</h3>
                {selected && (
                  <div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing({ original: selected })}
                    >
                      <Pencil size={13} />
                      Edit collection
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleting(selected)}
                    >
                      <Trash2 size={13} />
                      Delete
                    </Button>
                  </div>
                )}
              </div>
              {!loaded ? (
                <p role="status">
                  {error
                    ? "Use Refresh collections to try reading saved data again."
                    : "Reading local collections…"}
                </p>
              ) : selected?.kind === "search" ? (
                <SavedSearch
                  key={`${selected.id}-${selected.revision}`}
                  collection={selected}
                  search={search}
                  onSearch={onSearch}
                  onOpen={onOpen}
                  onCancel={onCancelSearch}
                  onRetry={onRetrySearch}
                />
              ) : selected?.kind === "tag" ? (
                search.failed ? (
                  <p role="alert">
                    The local tag index is unavailable. Reload the app to
                    rebuild it.
                  </p>
                ) : indexing || documents.some((doc) => !summaries[doc.id]) ? (
                  <p role="status">Updating the local tag index…</p>
                ) : (
                  <>
                    <p className="dialog-description">
                      Documents with the tag “{selected.tag}”, including
                      frontmatter tags.
                    </p>
                    <DocumentList
                      key={selected.id}
                      documents={documents.filter((doc) =>
                        summaries[doc.id]?.tags.some(
                          (tag) =>
                            tag.toLowerCase() === selected.tag.toLowerCase(),
                        ),
                      )}
                      summaries={summaries}
                      onOpen={onOpen}
                    />
                  </>
                )
              ) : selected?.kind === "manual" ? (
                <>
                  <p className="dialog-description">
                    {selected.documentIds.length} saved references. Trashed
                    documents are hidden here and return when restored.
                  </p>
                  <DocumentList
                    key={selected.id}
                    documents={selected.documentIds.flatMap((id) =>
                      docMap.has(id) ? [docMap.get(id)!] : [],
                    )}
                    summaries={summaries}
                    onOpen={onOpen}
                  />
                </>
              ) : view === "review" || view === "issues" ? (
                <HealthCollection
                  key={view}
                  kind={view}
                  documents={documents}
                  assetPaths={assetPaths}
                  summaries={summaries}
                  onOpen={onOpen}
                />
              ) : typeof view === "object" ? (
                <p>
                  This collection is no longer available. Refresh or select
                  another group.
                </p>
              ) : (
                <>
                  <p className="dialog-description">
                    {view === "recent"
                      ? "Documents you have opened in this browser, newest first. This is separate from edit dates."
                      : "Documents marked as favorites in this workspace."}
                  </p>
                  <DocumentList
                    key={view}
                    documents={
                      view === "recent"
                        ? recent
                        : documents.filter((doc) => doc.favorite)
                    }
                    summaries={summaries}
                    onOpen={onOpen}
                  />
                </>
              )}
            </section>
          </div>
        </>
      )}
    </Modal>
  );
}
function DocumentList({
  documents,
  summaries,
  onOpen,
  selection,
  onToggle,
  details,
  onSelectMatching,
}: {
  documents: ReaderDocument[];
  summaries: Record<string, DocumentSummary>;
  onOpen?: (id: string) => void;
  selection?: Set<string>;
  onToggle?: (id: string) => void;
  details?: Map<string, string>;
  onSelectMatching?: (ids: string[], selected: boolean) => void;
}) {
  const [filter, setFilter] = useState(""),
    [offset, setOffset] = useState(0);
  const filtered = useMemo(
    () =>
      documents.filter((doc) =>
        `${doc.path} ${summaries[doc.id]?.title || ""}`
          .toLowerCase()
          .includes(filter.toLowerCase()),
      ),
    [documents, summaries, filter],
  );
  const start = Math.min(
    offset,
    Math.max(0, Math.floor((filtered.length - 1) / pageSize) * pageSize),
  );
  return (
    <>
      <label className="form-label">
        Filter collection documents
        <input
          value={filter}
          placeholder="Find a title or path…"
          onChange={(e) => {
            setFilter(e.target.value);
            setOffset(0);
          }}
        />
      </label>
      {selection && onSelectMatching && (
        <div className="collection-options">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onSelectMatching(
                filtered.map((doc) => doc.id),
                true,
              )
            }
          >
            Select matches
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onSelectMatching(
                filtered.map((doc) => doc.id),
                false,
              )
            }
          >
            Deselect matches
          </Button>
        </div>
      )}
      <p className="collection-count" role="status">
        {filtered.length}{" "}
        {selection
          ? filtered.length === 1
            ? "available document"
            : "available documents"
          : filtered.length === 1
            ? "document"
            : "documents"}
        {filtered.length > pageSize
          ? ` · showing ${start + 1}–${Math.min(start + pageSize, filtered.length)}`
          : ""}
      </p>
      {!filtered.length ? (
        <p className="empty-panel">No documents match this view.</p>
      ) : (
        <ul className="collection-documents">
          {filtered.slice(start, start + pageSize).map((doc) => (
            <li key={doc.id}>
              {selection ? (
                <label>
                  <input
                    type="checkbox"
                    checked={selection.has(doc.id)}
                    onChange={() => onToggle?.(doc.id)}
                  />
                  <span>
                    <strong>
                      {summaries[doc.id]?.title || fileName(doc.path)}
                    </strong>
                    <small>{doc.path}</small>
                  </span>
                </label>
              ) : (
                <button onClick={() => onOpen?.(doc.id)}>
                  <strong>
                    {summaries[doc.id]?.title || fileName(doc.path)}
                  </strong>
                  <small>{doc.path}</small>
                  {details?.has(doc.id) && <small>{details.get(doc.id)}</small>}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {filtered.length > pageSize && (
        <div className="collection-pagination">
          <Button
            type="button"
            variant="outline"
            disabled={start === 0}
            onClick={() => setOffset(Math.max(0, start - pageSize))}
          >
            Previous documents
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={start + pageSize >= filtered.length}
            onClick={() => setOffset(start + pageSize)}
          >
            Next documents
          </Button>
        </div>
      )}
    </>
  );
}
function CollectionEditor({
  original,
  documents,
  summaries,
  busy,
  onSave,
  onCancel,
  onLoadSaved,
}: {
  original?: ReaderCollection;
  documents: ReaderDocument[];
  summaries: Record<string, DocumentSummary>;
  busy: boolean;
  onSave: (
    draft: CollectionDraft,
    original?: ReaderCollection,
  ) => Promise<void>;
  onCancel: () => void;
  onLoadSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(original?.name || ""),
    [kind, setKind] = useState<CollectionDraft["kind"]>(
      original?.kind || "manual",
    );
  const [members, setMembers] = useState(
    () => new Set(original?.kind === "manual" ? original.documentIds : []),
  );
  const [tag, setTag] = useState(original?.kind === "tag" ? original.tag : "");
  const [query, setQuery] = useState(
    original?.kind === "search" ? original.query : "",
  );
  const [options, setOptions] = useState<SearchOptions>(
    original?.kind === "search" ? original.options : defaultSearchOptions,
  );
  const [error, setError] = useState(""),
    [conflict, setConflict] = useState(false);
  const tags = useMemo(
    () =>
      [...new Set(Object.values(summaries).flatMap((summary) => summary.tags))]
        .sort()
        .slice(0, 500),
    [summaries],
  );
  async function submit(copy = false) {
    setError("");
    try {
      const draft = normalizeCollection(
        kind === "manual"
          ? { name, kind, documentIds: [...members] }
          : kind === "tag"
            ? { name, kind, tag }
            : { name, kind, query, options },
      );
      await onSave(draft, copy ? undefined : original);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Collection could not be saved.",
      );
      if (e instanceof CollectionConflict) setConflict(true);
    }
  }
  return (
    <form
      aria-busy={busy}
      className="collection-editor"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h3>{original ? "Edit collection" : "New collection"}</h3>
      <p className="dialog-description">
        Save applies your changes to the browser group. Cancel keeps the saved
        version.
      </p>
      <fieldset className="collection-fields" disabled={busy}>
        <label className="form-label">
          Collection name
          <input
            autoFocus
            required
            maxLength={80}
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="form-label">
          Collection type
          <select
            value={kind}
            disabled={busy}
            onChange={(e) => setKind(e.target.value as CollectionDraft["kind"])}
          >
            <option value="manual">Manual selection</option>
            <option value="tag">Tag-based group</option>
            <option value="search">Saved search</option>
          </select>
        </label>
        {kind === "manual" ? (
          <>
            <p className="collection-count">
              {members.size} selected. Trashed members stay saved until you
              remove them after restoring the document.
            </p>
            <DocumentList
              documents={documents}
              summaries={summaries}
              selection={members}
              onSelectMatching={(ids, selected) =>
                setMembers((current) => {
                  const next = new Set(current);
                  for (const id of ids) {
                    if (selected) next.add(id);
                    else next.delete(id);
                  }
                  return next;
                })
              }
              onToggle={(id) =>
                setMembers((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
            />
          </>
        ) : kind === "tag" ? (
          <label className="form-label">
            Tag
            <input
              aria-label="Tag"
              aria-describedby="collection-tag-hint"
              required
              maxLength={80}
              list="collection-tag-suggestions"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            />
            <datalist id="collection-tag-suggestions">
              {tags.map((tag) => (
                <option key={tag} value={tag} />
              ))}
            </datalist>
            <small id="collection-tag-hint">
              Use a tag from document properties or frontmatter. Matching
              ignores case. Suggestions show up to 500 tags.
            </small>
          </label>
        ) : (
          <>
            <label className="form-label">
              Saved query
              <input
                required
                maxLength={512}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={'tag:api "recovery checkpoint"'}
              />
            </label>
            <label className="form-label">
              Search matching
              <select
                value={
                  options.regex
                    ? "regex"
                    : options.literal ||
                        options.caseSensitive ||
                        options.wholeWord
                      ? "literal"
                      : "fuzzy"
                }
                onChange={(e) =>
                  setOptions({
                    literal: e.target.value === "literal",
                    caseSensitive: false,
                    wholeWord: false,
                    ...(e.target.value === "regex" ? { regex: true } : {}),
                  })
                }
              >
                <option value="fuzzy">Fuzzy</option>
                <option value="literal">Literal</option>
                <option value="regex">Regular expression</option>
              </select>
            </label>
            <div className="collection-options">
              <label>
                <input
                  type="checkbox"
                  checked={options.caseSensitive}
                  onChange={(e) =>
                    setOptions({
                      ...options,
                      caseSensitive: e.target.checked,
                      ...(!options.regex && e.target.checked
                        ? { literal: true }
                        : {}),
                    })
                  }
                />
                Match case
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={options.wholeWord}
                  onChange={(e) =>
                    setOptions({
                      ...options,
                      wholeWord: e.target.checked,
                      ...(!options.regex && e.target.checked
                        ? { literal: true }
                        : {}),
                    })
                  }
                />
                Whole words
              </label>
            </div>
            <p className="dialog-description">
              The query runs locally when you open this collection. Regex runs
              in a cancellable worker with a time limit. Document contents are
              not uploaded.
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="frontmatter-error">
            {error}
          </p>
        )}
        {conflict && (
          <div className="collection-options">
            <Button
              variant="outline"
              type="button"
              disabled={busy}
              onClick={() => {
                void onLoadSaved().catch((e) =>
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Saved collection could not be loaded.",
                  ),
                );
              }}
            >
              Load saved collection
            </Button>
            <Button
              variant="outline"
              type="button"
              disabled={busy}
              onClick={() => void submit(true)}
            >
              Save draft as new collection
            </Button>
          </div>
        )}
        <div className="dialog-buttons">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel editing
          </Button>
          <Button type="submit" disabled={busy || conflict}>
            {busy ? "Saving…" : "Save collection"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
function SavedSearch({
  collection,
  search,
  onSearch,
  onOpen,
  onCancel,
  onRetry,
}: {
  collection: Extract<ReaderCollection, { kind: "search" }>;
  search: SearchState;
  onSearch: (query: string, options: SearchOptions, offset: number) => void;
  onOpen: (id: string, hit?: SearchHit) => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    onSearch(collection.query, collection.options, offset);
  }, [collection.query, collection.options, offset, onSearch]);
  const matching =
    search.query === collection.query &&
    JSON.stringify(search.options) === JSON.stringify(collection.options);
  const page = matching && search.offset === offset ? search.page : null;
  return (
    <>
      <p className="collection-query">{collection.query}</p>
      <p className="dialog-description">
        {searchOptionsLabel(collection.options)}
      </p>
      {search.failed ? (
        <p role="alert">
          The local search index is unavailable. Reload the app to rebuild it.
        </p>
      ) : page?.error ? (
        <>
          <p role="alert" className="frontmatter-error">
            {page.error}
          </p>
          <Button variant="outline" onClick={onRetry}>
            Retry search
          </Button>
        </>
      ) : !page ? (
        <>
          <p role="status">Searching locally…</p>
          {collection.options.regex && (
            <Button variant="outline" onClick={onCancel}>
              Cancel search
            </Button>
          )}
        </>
      ) : (
        <>
          <p role="status">
            {page.total} matching {page.total === 1 ? "document" : "documents"}
            {page.total
              ? ` · showing ${page.offset + 1}–${page.offset + page.hits.length}`
              : ""}
          </p>
          <ul className="collection-documents">
            {page.hits.map((hit) => (
              <li key={hit.id}>
                <button onClick={() => onOpen(hit.id, hit)}>
                  <strong>{hit.title}</strong>
                  <small>{hit.path}</small>
                  <span>{hit.excerpt}</span>
                </button>
              </li>
            ))}
          </ul>
          {!page.total && (
            <p className="empty-panel">No documents match this saved search.</p>
          )}
          <div className="collection-pagination">
            <Button
              variant="outline"
              disabled={!page.offset}
              onClick={() => setOffset(Math.max(0, page.offset - pageSize))}
            >
              Previous results
            </Button>
            <Button
              variant="outline"
              disabled={page.offset + pageSize >= page.total}
              onClick={() => setOffset(page.offset + pageSize)}
            >
              Next results
            </Button>
          </div>
        </>
      )}
    </>
  );
}
function HealthCollection({
  kind,
  documents,
  assetPaths,
  summaries,
  onOpen,
}: {
  kind: "review" | "issues";
  documents: ReaderDocument[];
  assetPaths: string[];
  summaries: Record<string, DocumentSummary>;
  onOpen: (id: string) => void;
}) {
  const [snapshot, setSnapshot] = useState(() => ({ documents, assetPaths })),
    [result, setResult] = useState<{
      report?: WorkspaceHealth;
      error?: string;
      progress?: string;
    }>({});
  useEffect(() => {
    if (
      snapshot.documents.reduce((total, doc) => total + doc.content.length, 0) >
      25000000
    )
      return;
    let closed = false;
    const worker = new Worker(`${basePath}/analysis-worker.js`);
    worker.onmessage = (event) => {
      if (closed) return;
      const data = event.data;
      if (data.type === "result") setResult({ report: data.report });
      else if (data.type === "error") setResult({ error: data.message });
      else if (data.type === "progress")
        setResult({
          progress: `${data.phase} ${data.done} of ${data.total} documents…`,
        });
    };
    worker.onerror = () => {
      if (!closed)
        setResult({
          error: "Local analysis could not run. Reload the app and try again.",
        });
    };
    worker.postMessage(snapshot);
    return () => {
      closed = true;
      worker.terminate();
    };
  }, [snapshot]);
  const tooLarge =
    snapshot.documents.reduce((total, doc) => total + doc.content.length, 0) >
    25000000;
  const report = result.report;
  const relevant =
    report?.documents.filter((doc) =>
      kind === "review"
        ? doc.stale ||
          doc.issues.some((issue) =>
            ["missing_review", "invalid_review"].includes(issue.rule),
          )
        : doc.issues.length > 0,
    ) || [];
  const ids = new Set(relevant.map((doc) => doc.id));
  const details = new Map(
    relevant.map((doc) => [
      doc.id,
      kind === "review"
        ? doc.issues
            .filter((issue) =>
              ["missing_review", "invalid_review", "stale_review"].includes(
                issue.rule,
              ),
            )
            .map((issue) => issue.message)
            .join(" ")
        : `${doc.issues.length} local findings`,
    ]),
  );
  return (
    <>
      <p className="dialog-description">
        {kind === "review"
          ? "Documents with missing, invalid or overdue declared review dates."
          : "Documents with findings from the transparent local health rules. Findings are not a factual-accuracy judgment."}{" "}
        External links are not fetched.
      </p>
      <Button
        variant="outline"
        onClick={() => {
          setResult({});
          setSnapshot({ documents, assetPaths });
        }}
      >
        Refresh checks
      </Button>
      {tooLarge || result.error ? (
        <p role="alert">
          {tooLarge
            ? "This workspace exceeds the 25-million-character analysis limit. Analyze smaller workspaces in Document health."
            : result.error}
        </p>
      ) : !report ? (
        <p role="status">{result.progress || "Checking local documents…"}</p>
      ) : (
        <>
          <p className="collection-count">
            Checked {new Date(report.checkedAt).toLocaleString()}
          </p>
          <DocumentList
            documents={snapshot.documents.filter((doc) => ids.has(doc.id))}
            summaries={summaries}
            onOpen={onOpen}
            details={details}
          />
        </>
      )}
    </>
  );
}
