"use client";
import { useEffect, useRef, useState } from "react";
import { liveQuery } from "dexie";
import { FileUp, HardDrive, Save } from "lucide-react";
import { Modal } from "./modal";
import { storage } from "@/lib/storage";
import { useReader } from "@/lib/store";
import { newDocument, download } from "@/lib/documents";
import { unicodePrefix } from "@/lib/search-results";
import { fileName } from "@/lib/paths";
import { isolateImport } from "@/lib/import";
import type { ReaderDocument } from "@/lib/types";
import type { LocalFileHandle, LocalFileSource } from "@/lib/local-file-types";
import {
  beginFileRequest,
  bytesHash,
  contentHash,
  DiskFileConflict,
  encodeDiskContent,
  filePermission,
  markdownPickerTypes,
  readDiskFile,
  withLocalFileLock,
  writeDiskFile,
  type DiskFile,
  type FilePickerWindow,
} from "@/lib/local-files";

type Plan = {
  kind: "save" | "reload";
  snapshot: ReaderDocument;
  handle: LocalFileHandle;
  disk: DiskFile;
  token: string | null;
};
export default function LocalFileDialog({
  doc,
  workspaceId,
  flush,
  onOpened,
  onLoaded,
  onDownload,
  onImport,
  onFolder,
  onBusy,
  onClose,
}: {
  doc?: ReaderDocument;
  workspaceId: string;
  flush: () => Promise<boolean>;
  onOpened: (doc: ReaderDocument) => void;
  onLoaded: (
    snapshot: ReaderDocument,
    content: string,
  ) => Promise<ReaderDocument | null>;
  onDownload: () => void;
  onImport: () => void;
  onFolder: () => void;
  onBusy: (busy: boolean) => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState<LocalFileSource | null>(null);
  const [loading, setLoading] = useState(!!doc);
  const [permissionState, setPermissionState] = useState<{
    token: string;
    state: PermissionState | "unknown";
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState("");
  const [review, setReview] = useState<Plan | null>(null);
  const [changeState, setChangeState] = useState<{
    token: string;
    content: string;
    changed: boolean;
  } | null>(null);
  const changed =
    source &&
    doc &&
    changeState?.token === source.token &&
    changeState.content === doc.content
      ? changeState.changed
      : null;
  const activePlan = useRef<Plan | null>(null);
  const picker =
    typeof window === "undefined" ? null : (window as FilePickerWindow);
  const canOpen =
    !!picker?.isSecureContext &&
    typeof picker.showOpenFilePicker === "function";
  const canSaveAs =
    !!picker?.isSecureContext &&
    typeof picker.showSaveFilePicker === "function";
  useEffect(() => {
    if (!doc) return;
    const subscription = liveQuery(() => storage.fileSource(doc.id)).subscribe({
      next: (value) => {
        setSource(value || null);
        setLoading(false);
      },
      error: () => {
        setLoading(false);
        setMessage(
          "File connections could not be loaded. Your browser copy can still be downloaded.",
        );
      },
    });
    return () => subscription.unsubscribe();
  }, [doc]);
  useEffect(() => {
    let current = true;
    if (doc && source)
      void contentHash(doc.content).then((hash) => {
        if (current)
          setChangeState({
            token: source.token,
            content: doc.content,
            changed: hash !== source.browserHash,
          });
      });
    return () => {
      current = false;
    };
  }, [doc, source]);
  useEffect(() => {
    let current = true;
    if (source)
      void beginFileRequest<PermissionState | "unknown">(() =>
        typeof source.handle.queryPermission === "function"
          ? source.handle.queryPermission({ mode: "readwrite" })
          : Promise.resolve("unknown"),
      )
        .then((state) => {
          if (current) setPermissionState({ token: source.token, state });
        })
        .catch(() => {
          if (current)
            setPermissionState({ token: source.token, state: "unknown" });
        });
    return () => {
      current = false;
    };
  }, [source]);
  async function run(work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    onBusy(true);
    setMessage("");
    try {
      await work();
    } catch (error) {
      if (error instanceof DiskFileConflict && activePlan.current) {
        setReview({ ...activePlan.current, disk: error.disk });
        setMessage(
          "The file changed on disk. Review the latest version before continuing.",
        );
      } else
        setMessage(
          error instanceof Error && error.name === "AbortError"
            ? "File operation canceled."
            : `${error instanceof Error ? error.message : "File operation could not be completed."} ${doc ? "Your browser copy remains available." : "No disk save was requested."}`,
        );
    } finally {
      busyRef.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  async function snapshot() {
    if (!doc || !(await flush()))
      throw new Error(
        "Resolve pending browser saves before changing a local file.",
      );
    const current = useReader
      .getState()
      .documents.find((item) => item.id === doc.id);
    if (!current || useReader.getState().workspaceId !== workspaceId)
      throw new Error("The selected workspace changed.");
    const stored = await storage.get(doc.id);
    if (
      !stored ||
      stored.deletedAt ||
      stored.content !== current.content ||
      stored.revision !== current.revision
    )
      throw new Error(
        "The browser document changed in another tab. Review that version before continuing.",
      );
    return { ...current };
  }
  async function guard(plan: Plan) {
    const current = await storage.get(plan.snapshot.id),
      link = await storage.fileSource(plan.snapshot.id);
    if (
      !current ||
      current.deletedAt ||
      current.content !== plan.snapshot.content ||
      current.revision !== plan.snapshot.revision ||
      (current.workspaceId || "default") !== workspaceId ||
      useReader.getState().workspaceId !== workspaceId
    )
      throw new Error(
        "The browser document changed while this operation was open. Reopen local file controls.",
      );
    if ((link?.token || null) !== plan.token)
      throw new Error(
        "Another tab changed this file connection. Reopen local file controls.",
      );
  }
  async function remember(plan: Plan, disk: DiskFile, content: string) {
    const previous = await storage.fileSource(plan.snapshot.id);
    const directoryId =
      previous?.directoryId && (await previous.handle.isSameEntry(plan.handle))
        ? previous.directoryId
        : undefined;
    const next: LocalFileSource = {
      directoryId,
      documentId: plan.snapshot.id,
      workspaceId,
      name: disk.name,
      handle: plan.handle,
      token: crypto.randomUUID(),
      diskHash: disk.hash,
      browserHash: await contentHash(content),
      checkedAt: Date.now(),
    };
    await storage.setFileSource(next, plan.token);
  }
  async function commit(plan: Plan) {
    activePlan.current = plan;
    await guard(plan);
    const result = await writeDiskFile(
      plan.handle,
      plan.snapshot.content,
      plan.disk.hash,
      () => guard(plan),
    );
    try {
      await remember(plan, result.disk, plan.snapshot.content);
    } catch {
      setReview(null);
      setMessage(
        `The contents of ${result.disk.name} were verified on disk, but the browser could not retain its connection. Reopen controls before another save.`,
      );
      return;
    }
    setReview(null);
    setMessage(
      result.changed
        ? `Saved and verified ${result.disk.name} on disk.`
        : `${result.disk.name} already contains this content. No disk write was needed.`,
    );
  }
  function saveExisting() {
    if (!source || busyRef.current) return;
    const permission = filePermission(source.handle, "readwrite");
    void run(async () => {
      if ((await permission) !== "granted")
        throw new Error("Write permission was not granted.");
      const current = await snapshot();
      await withLocalFileLock(async () => {
        const disk = await readDiskFile(source.handle);
        const plan: Plan = {
          kind: "save",
          snapshot: current,
          handle: source.handle,
          disk,
          token: source.token,
        };
        activePlan.current = plan;
        await guard(plan);
        const alreadyMatches =
          (await bytesHash(encodeDiskContent(current.content, disk))) ===
          disk.hash;
        if (disk.hash !== source.diskHash && !alreadyMatches) {
          setReview(plan);
          setMessage(
            "Another application changed the connected file. Your browser copy has not overwritten it.",
          );
          return;
        }
        await commit(plan);
      });
    });
  }
  function saveAs() {
    if (!doc || !canSaveAs || busyRef.current) return;
    // The native picker must be called during this click, before any asynchronous preparation.
    const selected = beginFileRequest(() =>
      picker!.showSaveFilePicker!({
        suggestedName: fileName(doc.path),
        types: markdownPickerTypes,
        excludeAcceptAllOption: true,
      }),
    );
    void run(async () => {
      const handle = await selected;
      const current = await snapshot();
      await withLocalFileLock(async () => {
        const disk = await readDiskFile(handle);
        const plan: Plan = {
          kind: "save",
          snapshot: current,
          handle,
          disk,
          token: source?.token || null,
        };
        activePlan.current = plan;
        await guard(plan);
        const alreadyMatches =
          (await bytesHash(encodeDiskContent(current.content, disk))) ===
          disk.hash;
        if (disk.size && !alreadyMatches) {
          setReview(plan);
          setMessage(
            "The chosen file contains data. Review it before replacing its contents.",
          );
          return;
        }
        await commit(plan);
      });
    });
  }
  async function applyDisk(plan: Plan) {
    activePlan.current = plan;
    await guard(plan);
    const disk = await readDiskFile(plan.handle);
    if (disk.hash !== plan.disk.hash) {
      setReview({ ...plan, disk });
      setMessage("The disk version changed again. Review the latest contents.");
      return;
    }
    const loaded =
      disk.content === plan.snapshot.content
        ? plan.snapshot
        : await onLoaded(plan.snapshot, disk.content);
    if (!loaded)
      throw new Error(
        "The disk version could not be loaded into browser storage. Resolve the browser conflict first.",
      );
    try {
      await remember(plan, disk, loaded.content);
    } catch {
      setReview(null);
      setMessage(
        "Loaded the disk contents into this browser, but its file connection changed or could not be updated. Reopen local file controls.",
      );
      return;
    }
    setReview(null);
    setMessage(
      `Loaded ${disk.name} from disk. Previous browser contents remain in revision history when changed.`,
    );
  }
  function reloadDisk() {
    if (!source || busyRef.current) return;
    const permission = filePermission(source.handle, "read");
    void run(async () => {
      if ((await permission) !== "granted")
        throw new Error("Read permission was not granted.");
      const current = await snapshot();
      await withLocalFileLock(async () => {
        const disk = await readDiskFile(source.handle);
        const plan: Plan = {
          kind: "reload",
          snapshot: current,
          handle: source.handle,
          disk,
          token: source.token,
        };
        activePlan.current = plan;
        await guard(plan);
        if (
          disk.content !== current.content &&
          (await contentHash(current.content)) !== source.browserHash
        ) {
          setReview(plan);
          setMessage(
            "The browser copy has changes. Review both versions before loading disk contents.",
          );
          return;
        }
        await applyDisk(plan);
      });
    });
  }
  function openFile() {
    if (!canOpen || busyRef.current) return;
    const selected = beginFileRequest(() =>
      picker!.showOpenFilePicker!({
        multiple: false,
        types: markdownPickerTypes,
        excludeAcceptAllOption: true,
      }),
    );
    void run(async () => {
      const [handle] = await selected;
      if (!handle) return;
      if (!(await flush()))
        throw new Error(
          "Resolve pending browser saves before opening another file.",
        );
      await withLocalFileLock(async () => {
        for (const existing of await storage.fileSources(workspaceId)) {
          if (await existing.handle.isSameEntry(handle)) {
            const cached = await storage.get(existing.documentId);
            if (cached && !cached.deletedAt) {
              onOpened(cached);
              return;
            }
          }
        }
        const disk = await readDiskFile(handle);
        const added = {
          ...newDocument(`Connected/${disk.name}`, disk.content),
          workspaceId,
          revision: 0,
        };
        const existing = await storage.load(workspaceId);
        if (existing.length >= 10000)
          throw new Error("This workspace supports up to 10,000 documents.");
        isolateImport([added], [], new Set(existing.map((item) => item.path)));
        await storage.connectFile(added, {
          documentId: added.id,
          workspaceId,
          token: crypto.randomUUID(),
          name: disk.name,
          handle,
          diskHash: disk.hash,
          browserHash: await contentHash(disk.content),
          checkedAt: Date.now(),
        });
        onOpened(added);
      });
    });
  }
  function continueReview() {
    if (!review || busyRef.current) return;
    const permission = filePermission(
      review.handle,
      review.kind === "save" ? "readwrite" : "read",
    );
    void run(async () => {
      if ((await permission) !== "granted")
        throw new Error("File permission was not granted.");
      await withLocalFileLock(() =>
        review.kind === "save" ? commit(review) : applyDisk(review),
      );
    });
  }
  return (
    <Modal
      title="Local file connection"
      wide
      onClose={onClose}
      dismissible={!busy}
      className="local-file-dialog"
    >
      <div className="local-file-body" aria-busy={busy}>
        {!review && (
          <>
            <p>
              Browser autosave stays in this browser. Only Save to connected
              file or Save As writes a chosen local file.
            </p>
            {doc && (
              <dl>
                <dt>Browser document</dt>
                <dd>{doc.path}</dd>
                <dt>Connected file</dt>
                <dd>
                  {loading
                    ? "Loading connection…"
                    : source?.name || "None · browser copy only"}
                </dd>
                {source && (
                  <>
                    <dt>File write permission</dt>
                    <dd>
                      {permissionState?.token !== source.token
                        ? "Checking…"
                        : permissionState.state === "granted"
                          ? "Granted · explicit saves only"
                          : permissionState.state === "unknown"
                            ? "Checked when saving"
                            : "Write access not granted"}
                    </dd>
                    <dt>Browser changes since last file check</dt>
                    <dd>
                      {changed === null
                        ? "Checking…"
                        : changed
                          ? "Changed"
                          : "Unchanged"}
                    </dd>
                  </>
                )}
              </dl>
            )}
            {!canOpen && !canSaveAs && (
              <p className="local-file-notice">
                Native file pickers are unavailable in this browser or context.
                Import files to read/edit locally, then download Markdown to
                keep an external copy.
              </p>
            )}
            <div className="local-file-actions">
              <button type="button" disabled={busy} onClick={onFolder}>
                Local folder controls…
              </button>
              {canOpen ? (
                <button type="button" disabled={busy} onClick={openFile}>
                  <FileUp size={16} />
                  Open connected file…
                </button>
              ) : (
                <button type="button" disabled={busy} onClick={onImport}>
                  <FileUp size={16} />
                  Import files
                </button>
              )}
              {doc && canSaveAs && (
                <button
                  type="button"
                  disabled={busy || loading}
                  onClick={saveAs}
                >
                  <Save size={16} />
                  Save As…
                </button>
              )}
              {doc && source && (
                <>
                  <button type="button" disabled={busy} onClick={saveExisting}>
                    <Save size={16} />
                    Save to connected file
                  </button>
                  <button type="button" disabled={busy} onClick={reloadDisk}>
                    <HardDrive size={16} />
                    Reload from disk
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await withLocalFileLock(() =>
                          storage.disconnectFile(
                            source.documentId,
                            source.token,
                          ),
                        );
                        setReview(null);
                        setMessage(
                          "File disconnected. The disk file and browser document are preserved.",
                        );
                      })
                    }
                  >
                    Disconnect file
                  </button>
                </>
              )}
              {doc && (
                <button type="button" disabled={busy} onClick={onDownload}>
                  Download Markdown copy
                </button>
              )}
            </div>
            <p className="local-file-note">
              A connection identifies the chosen file, independently of the
              browser document path. Browser renames and trash never rename or
              delete the disk file. File connections stay in this browser and
              are not included in ZIP exports.
            </p>
          </>
        )}
        {review && (
          <section
            className="local-file-review"
            aria-label="Review file versions"
          >
            <h3>
              {review.kind === "save"
                ? "Review disk replacement"
                : "Review loading disk contents"}
            </h3>
            <p>
              Browser: {review.snapshot.path}
              <br />
              Chosen file: <strong>{review.disk.name}</strong> ·{" "}
              {review.disk.size.toLocaleString()} bytes
            </p>
            <p>
              Previews show up to 20,000 characters. Complete versions are
              available to download below.
            </p>
            <div className="local-file-versions">
              <label>
                Browser version
                <textarea
                  aria-label="Browser file version"
                  readOnly
                  value={unicodePrefix(review.snapshot.content, 20000)}
                />
              </label>
              <label>
                Disk version
                <textarea
                  aria-label="Disk file version"
                  readOnly
                  value={unicodePrefix(review.disk.content, 20000)}
                />
              </label>
            </div>
            <p>
              {review.kind === "save"
                ? "Replacing writes the displayed browser version to this file. The disk checksum is checked again before committing."
                : "Loading replaces the browser contents. Its previous contents will be kept in revision history."}
            </p>
            <div className="local-file-actions">
              <button type="button" disabled={busy} onClick={continueReview}>
                {review.kind === "save"
                  ? "Replace reviewed disk version"
                  : "Load reviewed disk version"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setReview(null);
                  setMessage(
                    "Kept the current browser copy. No disk replacement was requested.",
                  );
                }}
              >
                Keep browser copy
              </button>
            </div>
            <details className="local-file-downloads">
              <summary>Download complete versions</summary>
              <div className="local-file-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    download(
                      `browser-${fileName(review.snapshot.path)}`,
                      review.snapshot.content,
                    )
                  }
                >
                  Download browser version
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    download(
                      `disk-${review.disk.name}`,
                      encodeDiskContent(
                        review.disk.content,
                        review.disk,
                      ) as BlobPart,
                    )
                  }
                >
                  Download disk version
                </button>
              </div>
            </details>
          </section>
        )}
        <p role="status" aria-live="polite">
          {busy ? "Working with the chosen file…" : message}
        </p>
      </div>
    </Modal>
  );
}
