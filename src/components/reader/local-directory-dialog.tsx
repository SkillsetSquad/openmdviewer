"use client";
import { useEffect, useRef, useState } from "react";
import { liveQuery } from "dexie";
import { FolderOpen, RefreshCw } from "lucide-react";
import { Modal } from "./modal";
import { storage } from "@/lib/storage";
import {
  beginFileRequest,
  filePermission,
  withLocalFileLock,
  type FilePickerWindow,
} from "@/lib/local-files";
import {
  directoryAdditions,
  directoryChanges,
  directoryImport,
  scanDirectory,
  type DirectoryChange,
  type DirectoryScan,
} from "@/lib/local-directories";
import type {
  LocalDirectoryHandle,
  LocalDirectorySource,
} from "@/lib/local-directory-types";
import type { ReaderDocument } from "@/lib/types";

const quantity = (value: number, noun: string) =>
  `${value.toLocaleString()} ${noun}${value === 1 ? "" : "s"}`;

export default function LocalDirectoryDialog({
  workspaceId,
  flush,
  onBusy,
  onChanged,
  onInspect,
  onImport,
  onClose,
}: {
  workspaceId: string;
  flush: () => Promise<boolean>;
  onBusy: (busy: boolean) => void;
  onChanged: (
    workspaceId: string,
    documents: ReaderDocument[],
  ) => Promise<void>;
  onInspect: (id: string) => void;
  onImport: () => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState<LocalDirectorySource | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false),
    busyRef = useRef(false);
  const [message, setMessage] = useState("");
  const [visited, setVisited] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [report, setReport] = useState<{
    scan: DirectoryScan;
    changes: DirectoryChange[];
    handle: LocalDirectoryHandle;
    token: string | null;
  } | null>(null);
  const [filter, setFilter] = useState(""),
    [offset, setOffset] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const picker =
    typeof window === "undefined" ? null : (window as FilePickerWindow);
  const canPick =
    !!picker?.isSecureContext &&
    typeof picker.showDirectoryPicker === "function";
  useEffect(() => {
    const subscription = liveQuery(() =>
      storage.directorySource(workspaceId),
    ).subscribe({
      next: (value) => {
        setSource(value || null);
        setLoading(false);
        setReport(null);
      },
      error: () => {
        setLoading(false);
        setMessage("Folder connections could not be loaded.");
      },
    });
    return () => {
      subscription.unsubscribe();
      controller.current?.abort();
    };
  }, [workspaceId]);
  async function run(work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    onBusy(true);
    setMessage("");
    try {
      await work();
    } catch (error) {
      setMessage(
        error instanceof Error && error.name === "AbortError"
          ? "Folder operation canceled. Browser and disk files are preserved."
          : `${error instanceof Error ? error.message : "Folder operation failed."} Existing browser and disk files are preserved.`,
      );
    } finally {
      controller.current = null;
      setScanning(false);
      busyRef.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  async function scan(handle: LocalDirectoryHandle, token: string | null) {
    setReport(null);
    setVisited(0);
    setOffset(0);
    setFilter("");
    const abort = new AbortController();
    controller.current = abort;
    setScanning(true);
    const result = await scanDirectory(handle, abort.signal, setVisited);
    const changes =
      token && source
        ? await directoryChanges(
            source,
            result,
            await storage.load(workspaceId),
            await storage.fileSources(workspaceId),
            abort.signal,
          )
        : [
            ...result.documents.map((item) => ({
              path: item.path,
              state: "new" as const,
            })),
            ...result.assets.map((item) => ({
              path: item.asset.path,
              state: "new" as const,
            })),
          ];
    abort.signal.throwIfAborted();
    setReport({ scan: result, changes, handle, token });
    setMessage(
      "Scan complete. No disk files were written and no existing browser contents were replaced.",
    );
  }
  function choose() {
    if (!canPick || busyRef.current) return;
    const selected = beginFileRequest(() =>
      picker!.showDirectoryPicker!({ mode: "read" }),
    );
    void run(async () => {
      const handle = await selected;
      if (!(await flush()))
        throw new Error(
          "Resolve pending browser saves before connecting a folder.",
        );
      await withLocalFileLock(() => scan(handle, null));
    });
  }
  function rescan() {
    if (!source || busyRef.current) return;
    const permission = filePermission(source.handle, "read");
    void run(async () => {
      if ((await permission) !== "granted")
        throw new Error("Folder read permission was not granted.");
      if (!(await flush()))
        throw new Error("Resolve pending browser saves before scanning.");
      await withLocalFileLock(() => scan(source.handle, source.token));
    });
  }
  function add() {
    if (!report || busyRef.current) return;
    void run(async () => {
      if (!(await flush()))
        throw new Error("Resolve pending browser saves before adding files.");
      await withLocalFileLock(async () => {
        const bundle =
          report.token && source
            ? await directoryAdditions(source, report.scan)
            : await directoryImport(report.handle, report.scan);
        await storage.connectDirectory(bundle, report.token);
        setReport(null);
        setMessage(
          `Added ${quantity(bundle.documents.length, "document")} and ${quantity(bundle.assets.length, "media file")} to browser storage. Existing contents were preserved.`,
        );
        await onChanged(bundle.workspace.id, bundle.documents);
      });
    });
  }
  const filtered =
    report?.changes.filter(
      (item) =>
        !filter ||
        item.path.toLowerCase().includes(filter.toLowerCase()) ||
        item.state.includes(filter.toLowerCase()),
    ) || [];
  const newCount =
    report?.changes.filter((item) => item.state === "new").length || 0;
  return (
    <Modal
      title="Local folder connection"
      wide
      dismissible={!busy}
      onClose={onClose}
      className="local-directory-dialog"
    >
      <div className="local-directory-body" aria-busy={busy}>
        <p>
          Connect a folder as its own workspace, keeping relative Markdown and
          media paths. Browser autosave stays local; each disk save remains an
          explicit action in local file controls.
        </p>
        <p>
          <strong>Connected folder:</strong>{" "}
          {loading ? "Loading…" : source?.name || "None in this workspace"}
        </p>
        <div className="local-file-actions">
          {canPick ? (
            <button type="button" disabled={busy || loading} onClick={choose}>
              <FolderOpen size={16} />
              Choose local folder…
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={onImport}>
              Import a folder copy
            </button>
          )}
          {source && (
            <>
              <button type="button" disabled={busy} onClick={rescan}>
                <RefreshCw size={16} />
                Scan connected folder
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await withLocalFileLock(() =>
                      storage.disconnectDirectory(workspaceId, source.token),
                    );
                    setReport(null);
                    setMessage(
                      "Folder disconnected. Browser documents, media, and disk files are preserved.",
                    );
                  })
                }
              >
                Disconnect folder
              </button>
            </>
          )}
          {busy && scanning && (
            <button type="button" onClick={() => controller.current?.abort()}>
              Cancel scan
            </button>
          )}
        </div>
        {!canPick && (
          <p>
            Direct folder selection is unavailable in this browser or context.
            Importing a folder copy and downloading edits remain available.
          </p>
        )}
        {busy && (
          <p role="status">
            Working… {visited.toLocaleString()} entries visited.
          </p>
        )}
        {message && (
          <p role="status" className="local-file-notice">
            {message}
          </p>
        )}
        {report && (
          <section aria-label="Folder scan results">
            <h3>{report.handle.name}</h3>
            <p>
              {quantity(report.scan.documents.length, "document")} ·{" "}
              {quantity(report.scan.assets.length, "media file")} ·{" "}
              {report.scan.skipped.toLocaleString()} unsupported entries or
              excluded directories skipped.
            </p>
            <p>
              Review changed documents before loading or saving. Missing files
              stay cached.
            </p>
            <button
              type="button"
              className="directory-add"
              disabled={busy || (!!report.token && !newCount)}
              onClick={add}
            >
              {report.token
                ? `Add ${quantity(newCount, "new file")}`
                : "Connect folder workspace"}
            </button>
            <label className="directory-filter">
              Filter scan results
              <input
                type="search"
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value);
                  setOffset(0);
                }}
                placeholder="Path or change status"
              />
            </label>
            <ul className="directory-results" aria-label="Scanned files">
              {filtered.slice(offset, offset + 50).map((item) => (
                <li key={item.path}>
                  <span>
                    <code>{item.path}</code>
                    <small>{item.state}</small>
                  </span>
                  {item.documentId && item.state !== "disconnected" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onInspect(item.documentId!)}
                    >
                      Review file<span className="sr-only"> {item.path}</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {!filtered.length && <p>No matching files.</p>}
            {filtered.length > 50 && (
              <div className="directory-pages">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - 50))}
                >
                  Previous files
                </button>
                <span>
                  {offset + 1}–{Math.min(filtered.length, offset + 50)} of{" "}
                  {filtered.length}
                </span>
                <button
                  type="button"
                  disabled={offset + 50 >= filtered.length}
                  onClick={() => setOffset(offset + 50)}
                >
                  Next files
                </button>
              </div>
            )}
          </section>
        )}
        <details className="directory-help">
          <summary>Scan behavior and limits</summary>
          <p>
            Scans are explicit and read-only. Changed media stays cached;
            reconnect as a new workspace to read a fresh media collection.
            External renames appear as a new path and a missing old path.
          </p>
          <p>
            Limits: 10,000 supported files, 100 MB total, 30 MB per file, 50,000
            visited entries, 64 nested levels. .git, node_modules, and .next
            directories are excluded. Folder and file handles stay in this
            browser and are excluded from ZIP backups. Browser renames and trash
            never change disk paths.
          </p>
        </details>
      </div>
    </Modal>
  );
}
