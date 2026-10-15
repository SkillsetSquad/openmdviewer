"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "./modal";
import { Markdown } from "./markdown";
import { GitHubRepository, repositoryText } from "@/lib/repositories/github";
import {
  repositoryId,
  repositoryFileURL,
  repositoryLimits,
  type RepositoryEntry,
  type RepositoryInfo,
  type RepositorySnapshot,
  type RepositoryRef,
  type RepositoryRate,
} from "@/lib/repositories/types";
import {
  repositoryImport,
  repositoryEntrySupported,
  repositoryTextDocument,
} from "@/lib/repositories/import";
import {
  compareRepositoryFile,
  repositoryDiff,
} from "@/lib/repositories/compare";
import { repositoryDiffInWorker } from "@/lib/repositories/diff-client";
import { storage } from "@/lib/storage";
import { resolvePath } from "@/lib/paths";
export default function RepositoryDialog({
  flush,
  onBusy,
  onImported,
  onClose,
}: {
  flush: () => Promise<boolean>;
  onBusy: (value: boolean) => void;
  onImported: (workspaceId: string, documentId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [input, setInput] = useState(""),
    [token, setToken] = useState(""),
    [info, setInfo] = useState<RepositoryInfo | null>(null),
    [snapshot, setSnapshot] = useState<RepositorySnapshot | null>(null);
  const [refs, setRefs] = useState<RepositoryRef[]>([]),
    [next, setNext] = useState<{ branch: number | null; tag: number | null }>({
      branch: null,
      tag: null,
    }),
    [chosen, setChosen] = useState("");
  const [directory, setDirectory] = useState(""),
    [entries, setEntries] = useState<RepositoryEntry[]>([]),
    [selection, setSelection] = useState<Map<string, RepositoryEntry>>(
      new Map(),
    ),
    [filter, setFilter] = useState(""),
    [offset, setOffset] = useState(0);
  const [preview, setPreview] = useState<{
      entry: RepositoryEntry;
      text: string;
    } | null>(null),
    [sourceView, setSourceView] = useState(false),
    [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState(""),
    [rate, setRate] = useState<RepositoryRate | null>(null);
  const [compareRef, setCompareRef] = useState("");
  const [comparison, setComparison] = useState<{
    snapshot: RepositorySnapshot;
    blob: string;
    diff: ReturnType<typeof repositoryDiff>;
  } | null>(null);
  const [diffOffset, setDiffOffset] = useState(0);
  const pendingAnchor = useRef("");
  useEffect(() => {
    if (!preview || !pendingAnchor.current) return;
    const id = pendingAnchor.current;
    pendingAnchor.current = "";
    const frame = requestAnimationFrame(() => {
      const target = Array.from(
        previewRoot.current?.querySelectorAll<HTMLElement>("[id]") || [],
      ).find(
        (element) => element.id === id || element.id === `user-content-${id}`,
      );
      if (target) target.scrollIntoView({ block: "start" });
      else
        setMessage(
          "The linked document opened, but its heading was not found.",
        );
    });
    return () => cancelAnimationFrame(frame);
  }, [preview]);
  const adapter = useRef<GitHubRepository | null>(null),
    controller = useRef<AbortController | null>(null),
    busyRef = useRef(false),
    alive = useRef(true),
    previewRoot = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
      adapter.current?.dispose();
      onBusy(false);
    };
  }, [onBusy]);
  const reportRate = useCallback((value: RepositoryRate) => {
    if (alive.current) setRate(value);
  }, []);
  async function run(work: (signal: AbortSignal) => Promise<void>) {
    if (busyRef.current) return;
    const abort = new AbortController();
    controller.current = abort;
    busyRef.current = true;
    setBusy(true);
    onBusy(true);
    setMessage("");
    try {
      await work(abort.signal);
    } catch (error) {
      if (alive.current)
        setMessage(
          error instanceof Error && error.name === "AbortError"
            ? "Repository request canceled. No partial workspace was imported."
            : error instanceof Error
              ? error.message
              : "Repository operation failed.",
        );
    } finally {
      busyRef.current = false;
      if (alive.current) {
        setBusy(false);
        setSaving(false);
        onBusy(false);
      }
    }
  }
  async function showFile(
    client: GitHubRepository,
    pinned: RepositorySnapshot,
    entry: RepositoryEntry,
    signal: AbortSignal,
  ) {
    setComparison(null);
    setDiffOffset(0);
    if (!repositoryTextDocument(entry.path)) {
      setPreview(null);
      setMessage(
        "This local asset can be selected for import. Only Markdown/text files have a document preview.",
      );
      return;
    }
    setMessage(`Reading ${entry.path}…`);
    const bytes = await client.read(pinned, entry, signal),
      text = repositoryText(bytes);
    signal.throwIfAborted();
    setPreview({ entry, text });
    setSourceView(false);
    setMessage(
      `Previewing ${entry.path} from commit ${pinned.commit.slice(0, 12)}. Nothing is imported yet.`,
    );
  }
  async function loadSnapshot(
    client: GitHubRepository,
    ref: RepositoryRef,
    signal: AbortSignal,
  ) {
    setComparison(null);
    setSnapshot(null);
    setEntries([]);
    setPreview(null);
    setSelection(new Map());
    setDirectory("");
    setFilter("");
    setOffset(0);
    const pinned = await client.snapshot(ref, signal),
      files = await client.directory(pinned, "", signal);
    signal.throwIfAborted();
    setSnapshot(pinned);
    setEntries(files);
    const readme = files.find(
      (entry) =>
        entry.kind === "file" &&
        /^readme(?:\.(md|markdown|mdown|mkd|mdx|txt))?$/i.test(entry.name) &&
        repositoryEntrySupported(entry),
    );
    setMessage(
      `Loaded ${ref.kind} ${ref.name} at ${pinned.commit.slice(0, 12)}.`,
    );
    if (readme) {
      setSelection(new Map([[readme.path, readme]]));
      await showFile(client, pinned, readme, signal);
    }
  }
  function connect() {
    const id = repositoryId(input),
      value = token;
    setToken("");
    void run(async (signal) => {
      adapter.current?.dispose();
      const client = new GitHubRepository(id, value, reportRate);
      adapter.current = client;
      setComparison(null);
      setInfo(null);
      setSnapshot(null);
      setEntries([]);
      setPreview(null);
      setSelection(new Map());
      setRefs([]);
      setRate(null);
      const details = await client.info(signal);
      setInfo(details);
      const branches = await client.refs("branch", 1, signal),
        tags = await client.refs("tag", 1, signal);
      signal.throwIfAborted();
      const first = { kind: "branch" as const, name: details.defaultBranch };
      setRefs([
        first,
        ...branches.refs.filter((ref) => ref.name !== first.name),
        ...tags.refs,
      ]);
      setNext({ branch: branches.nextPage, tag: tags.nextPage });
      setChosen(`branch:${first.name}`);
      await loadSnapshot(client, first, signal);
    });
  }
  function changeRef(value: string) {
    setChosen(value);
    const ref = refs.find((item) => `${item.kind}:${item.name}` === value);
    if (ref && adapter.current)
      void run((signal) => loadSnapshot(adapter.current!, ref, signal));
  }
  function browse(path: string) {
    if (!adapter.current || !snapshot) return;
    void run(async (signal) => {
      const files = await adapter.current!.directory(snapshot, path, signal);
      signal.throwIfAborted();
      setDirectory(path);
      setEntries(files);
      setFilter("");
      setOffset(0);
      setMessage(path ? `Browsing ${path}` : "Browsing the repository root.");
    });
  }
  function toggle(entry: RepositoryEntry) {
    setSelection((previous) => {
      const copy = new Map(previous);
      if (copy.has(entry.path)) copy.delete(entry.path);
      else if (copy.size < repositoryLimits.files) copy.set(entry.path, entry);
      else setMessage("Select at most 200 files per import.");
      return copy;
    });
  }
  async function follow(href: string) {
    if (!preview || !snapshot || !adapter.current) return;
    if (href.startsWith("#")) {
      try {
        const id = decodeURIComponent(href.slice(1)),
          target = Array.from(
            previewRoot.current?.querySelectorAll<HTMLElement>("[id]") || [],
          ).find(
            (element) =>
              element.id === id || element.id === `user-content-${id}`,
          );
        if (target) {
          target.scrollIntoView({ block: "start" });
          return;
        }
      } catch {}
      setMessage("This heading was not found in the preview.");
      return;
    }
    void run(async (signal) => {
      const wiki = href.startsWith("wiki:"),
        value = wiki ? decodeURIComponent(href.slice(5)) : href,
        path = resolvePath(preview.entry.path, value.split(/[?#]/)[0]);
      const variants = wiki
        ? [path, `${path}.md`, `${path}.markdown`, `${path}.mdx`]
        : [path];
      for (const candidate of variants) {
        const folder = candidate.split("/").slice(0, -1).join("/"),
          files = await adapter.current!.directory(snapshot, folder, signal),
          entry = files.find((item) => item.path === candidate);
        if (entry) {
          const hash = value.indexOf("#");
          pendingAnchor.current =
            hash >= 0 ? decodeURIComponent(value.slice(hash + 1)) : "";
          await showFile(adapter.current!, snapshot, entry, signal);
          return;
        }
      }
      throw new Error(
        "The linked document is not present at this path in the pinned commit. Browse the file tree to select it.",
      );
    });
  }
  const visible = entries.filter(
      (entry) => entry.kind === "directory" || repositoryEntrySupported(entry),
    ),
    matches = visible.filter((entry) =>
      entry.name.toLowerCase().includes(filter.toLowerCase()),
    ),
    shown = matches.slice(offset, offset + 50);
  return (
    <Modal
      title="Browse GitHub repository"
      onClose={onClose}
      dismissible={!saving}
      wide
      className="repository-dialog"
    >
      <div className="repository-body">
        <p>
          Browse repository documents directly from GitHub, then import selected
          files into a new local workspace. All reads use a pinned commit.
          Browser edits stay local.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            try {
              connect();
            } catch (error) {
              setMessage(
                error instanceof Error ? error.message : "Enter a repository.",
              );
            }
          }}
        >
          <label htmlFor="repository-address">GitHub repository</label>
          <input
            id="repository-address"
            required
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={busy}
            placeholder="owner/repository or https://github.com/owner/repository"
            autoComplete="off"
            spellCheck={false}
          />
          <details>
            <summary>Optional GitHub token</summary>
            <p>
              Use a token with read access to repository contents for private
              repositories or higher API limits. It is sent only to
              api.github.com, held in memory for this dialog, and excluded from
              local documents and exports.
            </p>
            <label htmlFor="repository-token">Session token</label>
            <input
              id="repository-token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              maxLength={1024}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
          </details>
          <Button type="submit" disabled={busy || !input.trim()}>
            Browse repository
          </Button>
        </form>
        {message && <p role="status">{message}</p>}
        {rate && (
          <p className="repository-rate">
            GitHub API remaining:{" "}
            {rate.remaining === null ? "unavailable" : rate.remaining}
            {rate.resetAt !== null
              ? ` · resets ${new Date(rate.resetAt).toLocaleString()}`
              : ""}
          </p>
        )}
        {busy && !saving && (
          <Button variant="outline" onClick={() => controller.current?.abort()}>
            Cancel repository request
          </Button>
        )}
        {info && (
          <div className="repository-summary">
            <strong>
              {info.owner}/{info.name}
            </strong>
            <p>{info.description}</p>
            {info.private && (
              <p>
                Private repository. Imported documents are stored unencrypted in
                this browser.
              </p>
            )}
            {!!refs.length && (
              <>
                <label htmlFor="repository-ref">Branch or tag</label>
                <select
                  id="repository-ref"
                  value={chosen}
                  disabled={busy}
                  onChange={(event) => changeRef(event.target.value)}
                >
                  {refs.map((ref) => (
                    <option
                      key={`${ref.kind}:${ref.name}`}
                      value={`${ref.kind}:${ref.name}`}
                    >
                      {ref.kind}: {ref.name}
                    </option>
                  ))}
                </select>
                <div className="repository-buttons">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      const ref = refs.find(
                        (item) => `${item.kind}:${item.name}` === chosen,
                      );
                      if (ref && adapter.current)
                        void run((signal) =>
                          loadSnapshot(adapter.current!, ref, signal),
                        );
                    }}
                  >
                    Load latest snapshot
                  </Button>
                  {(["branch", "tag"] as const).map(
                    (kind) =>
                      next[kind] && (
                        <Button
                          key={kind}
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void run(async (signal) => {
                              const result = await adapter.current!.refs(
                                kind,
                                next[kind]!,
                                signal,
                              );
                              setRefs((previous) => [
                                ...previous,
                                ...result.refs.filter(
                                  (ref) =>
                                    !previous.some(
                                      (item) =>
                                        item.kind === ref.kind &&
                                        item.name === ref.name,
                                    ),
                                ),
                              ]);
                              setNext((previous) => ({
                                ...previous,
                                [kind]: result.nextPage,
                              }));
                            })
                          }
                        >
                          More {kind === "branch" ? "branches" : "tags"}
                        </Button>
                      ),
                  )}
                </div>
              </>
            )}
          </div>
        )}
        {snapshot && (
          <>
            <p className="repository-commit">
              Viewing {snapshot.ref.kind} {snapshot.ref.name} · commit{" "}
              {snapshot.commit}
            </p>
            <div className="repository-browser">
              <section aria-label="Repository files">
                <h3>Files</h3>
                <nav aria-label="Repository folders">
                  <button disabled={busy} onClick={() => browse("")}>
                    Root
                  </button>
                  {directory
                    .split("/")
                    .filter(Boolean)
                    .map((part, index, parts) => (
                      <button
                        key={index}
                        disabled={busy}
                        onClick={() =>
                          browse(parts.slice(0, index + 1).join("/"))
                        }
                      >
                        {part}
                      </button>
                    ))}
                </nav>
                <label htmlFor="repository-filter">Filter this folder</label>
                <input
                  id="repository-filter"
                  value={filter}
                  onChange={(event) => {
                    setFilter(event.target.value);
                    setOffset(0);
                  }}
                />
                <p>
                  {matches.length
                    ? `${offset + 1}–${Math.min(offset + 50, matches.length)} of ${matches.length}`
                    : "No matching"}{" "}
                  supported entries · {entries.length - visible.length} other
                  entries omitted
                </p>
                <ul className="repository-files">
                  {shown.map((entry) => (
                    <li key={entry.path}>
                      {entry.kind === "directory" ? (
                        <button
                          disabled={busy}
                          onClick={() => browse(entry.path)}
                        >
                          Folder {entry.name}
                        </button>
                      ) : (
                        <>
                          <label>
                            <input
                              type="checkbox"
                              aria-label={`Select ${entry.path}`}
                              checked={selection.has(entry.path)}
                              disabled={busy}
                              onChange={() => toggle(entry)}
                            />
                            <span>{entry.name}</span>
                          </label>
                          <button
                            disabled={busy}
                            onClick={() =>
                              void run((signal) =>
                                showFile(
                                  adapter.current!,
                                  snapshot,
                                  entry,
                                  signal,
                                ),
                              )
                            }
                          >
                            Preview {entry.name}
                          </button>
                          <small>
                            {entry.size === null
                              ? "Size unavailable"
                              : `${entry.size.toLocaleString()} bytes`}
                          </small>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="repository-buttons">
                  <Button
                    variant="outline"
                    disabled={offset === 0 || busy}
                    onClick={() =>
                      setOffset((value) => Math.max(0, value - 50))
                    }
                  >
                    Previous files
                  </Button>
                  <Button
                    variant="outline"
                    disabled={offset + 50 >= matches.length || busy}
                    onClick={() => setOffset((value) => value + 50)}
                  >
                    Next files
                  </Button>
                </div>
              </section>
              <section
                aria-label="Repository document preview"
                ref={previewRoot}
                className="repository-preview"
              >
                <h3>Document preview</h3>
                {preview ? (
                  <>
                    <p>{preview.entry.path}</p>
                    <a
                      href={repositoryFileURL({
                        ...snapshot.repository,
                        provider: "github",
                        ref: snapshot.ref,
                        commit: snapshot.commit,
                        path: preview.entry.path,
                        blob: preview.entry.sha,
                      })}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View pinned file on GitHub
                    </a>
                    <div className="repository-buttons">
                      <Button
                        variant="outline"
                        aria-pressed={!sourceView}
                        onClick={() => setSourceView(false)}
                      >
                        Read preview
                      </Button>
                      <Button
                        variant="outline"
                        aria-pressed={sourceView}
                        onClick={() => setSourceView(true)}
                      >
                        Source preview
                      </Button>
                    </div>
                    <details className="repository-comparison">
                      <summary>Compare this file across Git references</summary>
                      <p>
                        Compare the current pinned file (before) with the same
                        path at another branch or tag (after). References
                        resolve only when you request a comparison.
                      </p>
                      <label htmlFor="repository-compare-ref">
                        Compare with branch or tag
                      </label>
                      <select
                        id="repository-compare-ref"
                        value={compareRef}
                        disabled={busy}
                        onChange={(event) => {
                          setCompareRef(event.target.value);
                          setComparison(null);
                        }}
                      >
                        <option value="">Choose a reference</option>
                        {refs.map((ref) => (
                          <option
                            key={`${ref.kind}:${ref.name}`}
                            value={`${ref.kind}:${ref.name}`}
                          >
                            {ref.kind}: {ref.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="outline"
                        disabled={busy || !compareRef}
                        onClick={() => {
                          const ref = refs.find(
                            (item) =>
                              `${item.kind}:${item.name}` === compareRef,
                          );
                          if (!ref || !adapter.current) return;
                          setComparison(null);
                          void run(async (signal) => {
                            const result = await compareRepositoryFile(
                              adapter.current!,
                              preview.entry.path,
                              ref,
                              signal,
                            );
                            const diff = await repositoryDiffInWorker(
                              preview.text,
                              result.text,
                              signal,
                            );
                            signal.throwIfAborted();
                            setDiffOffset(0);
                            setComparison({
                              snapshot: result.snapshot,
                              blob: result.blob,
                              diff,
                            });
                            setMessage(
                              "Comparison ready. Repository files and local workspaces are unchanged.",
                            );
                          });
                        }}
                      >
                        Compare pinned file
                      </Button>
                      {comparison && (
                        <section aria-label="Git file comparison">
                          <p>
                            Before: {snapshot.ref.kind} {snapshot.ref.name} ·{" "}
                            {snapshot.commit}
                          </p>
                          <p>
                            After: {comparison.snapshot.ref.kind}{" "}
                            {comparison.snapshot.ref.name} ·{" "}
                            {comparison.snapshot.commit}
                          </p>
                          <a
                            href={repositoryFileURL({
                              ...snapshot.repository,
                              provider: "github",
                              ref: comparison.snapshot.ref,
                              commit: comparison.snapshot.commit,
                              path: preview.entry.path,
                              blob: comparison.blob,
                            })}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View comparison file on GitHub
                          </a>
                          <p>
                            {comparison.diff.identical
                              ? "Files are identical."
                              : `${comparison.diff.added} added lines · ${comparison.diff.removed} removed lines`}
                          </p>
                          <p>
                            − removed · + added · blank unchanged. Line numbers
                            are before / after. Line endings and final-newline
                            differences count as changes.
                          </p>
                          <div
                            className="repository-diff"
                            tabIndex={0}
                            role="region"
                            aria-label="Read-only line diff"
                          >
                            {comparison.diff.rows
                              .slice(diffOffset, diffOffset + 100)
                              .map((row, index) => (
                                <div
                                  className={`repository-diff-line ${row.kind}`}
                                  key={diffOffset + index}
                                >
                                  <span>
                                    {row.kind === "added"
                                      ? "+"
                                      : row.kind === "removed"
                                        ? "−"
                                        : " "}
                                  </span>
                                  <span>{row.before ?? "·"}</span>
                                  <span>{row.after ?? "·"}</span>
                                  <code>{row.text || " "}</code>
                                </div>
                              ))}
                          </div>
                          <p>
                            {comparison.diff.rows.length
                              ? `${diffOffset + 1}–${Math.min(diffOffset + 100, comparison.diff.rows.length)} of ${comparison.diff.rows.length} diff lines`
                              : "No diff lines"}
                          </p>
                          <div className="repository-buttons">
                            <Button
                              variant="outline"
                              disabled={!diffOffset}
                              onClick={() =>
                                setDiffOffset((value) =>
                                  Math.max(0, value - 100),
                                )
                              }
                            >
                              Previous diff lines
                            </Button>
                            <Button
                              variant="outline"
                              disabled={
                                diffOffset + 100 >= comparison.diff.rows.length
                              }
                              onClick={() =>
                                setDiffOffset((value) => value + 100)
                              }
                            >
                              Next diff lines
                            </Button>
                          </div>
                        </section>
                      )}
                    </details>
                    {sourceView ? (
                      <textarea
                        aria-label="Repository Markdown source"
                        readOnly
                        value={preview.text}
                      />
                    ) : (
                      <article className="markdown-body">
                        <Markdown
                          content={preview.text}
                          sourcePath={preview.entry.path}
                          onLink={(href) => void follow(href)}
                          assetURLs={{}}
                        />
                      </article>
                    )}
                  </>
                ) : (
                  <p>
                    Select a Markdown/text file to preview it. Local media is
                    downloaded only when selected for import; remote media
                    requires explicit consent in the reader.
                  </p>
                )}
              </section>
            </div>
            <p>
              {selection.size} selected files. Paths are preserved in a new
              workspace; existing workspaces are unchanged.
            </p>
            <div className="repository-buttons">
              <Button
                variant="outline"
                disabled={busy || !selection.size}
                onClick={() => setSelection(new Map())}
              >
                Clear selection
              </Button>
              <Button
                disabled={
                  busy ||
                  !Array.from(selection.values()).some((entry) =>
                    repositoryTextDocument(entry.path),
                  )
                }
                onClick={() =>
                  void run(async (signal) => {
                    if (!(await flush()))
                      throw new Error(
                        "Resolve pending browser saves before importing.",
                      );
                    const bundle = await repositoryImport(
                      adapter.current!,
                      snapshot,
                      Array.from(selection.values()),
                      signal,
                      setMessage,
                    );
                    signal.throwIfAborted();
                    if (!(await flush()))
                      throw new Error(
                        "Resolve pending browser saves before importing.",
                      );
                    signal.throwIfAborted();
                    setSaving(true);
                    setMessage(
                      "Saving the complete repository snapshot in this browser…",
                    );
                    await storage.createImportedWorkspace(
                      bundle.workspace,
                      bundle.documents,
                      bundle.assets,
                    );
                    await onImported(
                      bundle.workspace.id,
                      bundle.documents[0].id,
                    );
                  })
                }
              >
                {saving ? "Saving workspace…" : "Import selected files locally"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
