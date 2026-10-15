"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { storage, DocumentConflict } from "@/lib/storage";
import { exampleDocuments } from "@/lib/examples";
import { useReader } from "@/lib/store";
import { newDocument } from "@/lib/documents";
import type {
  DocumentSnapshot,
  LocalWorkspace,
  ReaderAsset,
  ReaderDocument,
  Preferences,
} from "@/lib/types";
const urlsFor = (assets: ReaderAsset[]) =>
  Object.fromEntries(assets.map((a) => [a.path, URL.createObjectURL(a.blob)]));
const readPreference = (current: Preferences): Preferences => {
  try {
    const p = JSON.parse(
      localStorage.getItem("openmdviewer.preferences") || "{}",
    );
    return {
      ...current,
      theme: ["dark", "light", "sepia", "oled", "contrast", "system"].includes(
        p.theme,
      )
        ? p.theme
        : current.theme,
      fontFamily: ["sans", "serif", "mono"].includes(p.fontFamily)
        ? p.fontFamily
        : current.fontFamily,
      fontSize: Number.isFinite(p.fontSize)
        ? Math.max(12, Math.min(24, p.fontSize))
        : current.fontSize,
      lineHeight: Number.isFinite(p.lineHeight)
        ? Math.max(1.3, Math.min(2.2, p.lineHeight))
        : current.lineHeight,
      readingWidth: Number.isFinite(p.readingWidth)
        ? Math.max(600, Math.min(1400, p.readingWidth))
        : current.readingWidth,
    };
  } catch {
    return current;
  }
};
function applyDocuments(documents: ReaderDocument[], workspaceId: string) {
  let selected = "";
  try {
    selected =
      localStorage.getItem(`openmdviewer.active.${workspaceId}`) ||
      (workspaceId === "default"
        ? localStorage.getItem("openmdviewer.active")
        : "") ||
      "";
  } catch {}
  const id = documents.some((d) => d.id === selected)
    ? selected
    : documents[0]?.id || "";
  useReader.setState({
    documents,
    workspaceId,
    activeId: id,
    tabs: id ? [id] : [],
    mode: "read",
  });
}
export function useWorkspaceSession(notify: (message: string) => void) {
  const [workspaceId, setWorkspaceId] = useState("default");
  const [workspaces, setWorkspaces] = useState<LocalWorkspace[]>([]);
  const [loaded, setLoaded] = useState(false);
  const switchingRef = useRef(false);
  const [switching, setSwitching] = useState(false);
  const [assetURLs, setAssetURLs] = useState<Record<string, string>>({});
  const [storageStatus, setStorageStatus] = useState(
    "Opening local workspace…",
  );
  const [conflict, setConflict] = useState<{
    current: ReaderDocument;
    local: ReaderDocument;
  } | null>(null);
  const revisions = useRef(new Map<string, number>());
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const savingCount = useRef(0);
  const pendingEdit = useRef<ReaderDocument | null>(null);
  const editTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshAssets = useCallback(
    async (id = workspaceId) => {
      const assets = await storage.loadAssets(id);
      if (useReader.getState().workspaceId === id)
        setAssetURLs(urlsFor(assets));
    },
    [workspaceId],
  );
  const save = useCallback(
    (document: ReaderDocument, reason: DocumentSnapshot["reason"] = "edit") => {
      savingCount.current++;
      setStorageStatus("Saving to browser…");
      const work = queue.current.then(async () => {
        try {
          const expected =
            revisions.current.get(document.id) ?? document.revision ?? 0;
          const saved = await storage.save(document, expected, reason);
          revisions.current.set(saved.id, saved.revision!);
          useReader.setState((s) => ({
            documents: s.documents.map((d) =>
              d.id === saved.id ? { ...d, revision: saved.revision } : d,
            ),
          }));
          setStorageStatus("Saved in this browser");
          return true;
        } catch (error) {
          if (error instanceof DocumentConflict) {
            setConflict({ current: error.current, local: document });
            setStorageStatus("Conflicting changes need review");
          } else {
            setStorageStatus("Browser storage unavailable");
            notify(
              error instanceof Error
                ? error.message
                : "Could not save locally. Export a backup to keep your changes.",
            );
          }
          return false;
        } finally {
          savingCount.current--;
        }
      });
      queue.current = work;
      return work;
    },
    [notify],
  );
  const flushEdit = useCallback(async () => {
    if (editTimer.current) clearTimeout(editTimer.current);
    const pending = pendingEdit.current;
    pendingEdit.current = null;
    if (pending) await save(pending);
    return queue.current;
  }, [save]);
  const scheduleSave = useCallback(
    (document: ReaderDocument) => {
      pendingEdit.current = document;
      setStorageStatus("Saving to browser…");
      if (editTimer.current) clearTimeout(editTimer.current);
      editTimer.current = setTimeout(() => {
        void flushEdit();
      }, 450);
    },
    [flushEdit],
  );
  const hasPendingChanges = useCallback(
    () => !!pendingEdit.current || savingCount.current > 0,
    [],
  );
  useEffect(() => {
    let canceled = false;
    let selected = "default";
    try {
      selected = localStorage.getItem("openmdviewer.workspace") || "default";
    } catch {}
    storage
      .initialize(exampleDocuments(), selected)
      .then(async (result) => {
        const assets = await storage.loadAssets(result.selected.id);
        if (canceled) return;
        revisions.current = new Map(
          result.documents.map((d) => [d.id, d.revision || 0]),
        );
        setWorkspaces(result.workspaces);
        setWorkspaceId(result.selected.id);
        setAssetURLs(urlsFor(assets));
        useReader.setState((s) => ({
          preferences: readPreference(s.preferences),
        }));
        applyDocuments(result.documents, result.selected.id);
        setStorageStatus("Saved in this browser");
        setLoaded(true);
      })
      .catch(() => {
        if (!canceled) {
          const docs = exampleDocuments();
          applyDocuments(docs, "default");
          setWorkspaces([
            {
              id: "default",
              name: "Temporary workspace",
              description: "Storage is unavailable",
              icon: "📚",
              createdAt: Date.now(),
              initialized: true,
            },
          ]);
          setStorageStatus("Browser storage unavailable");
          setLoaded(true);
          notify(
            "Local storage could not be opened. Download your files before closing.",
          );
        }
      });
    return () => {
      canceled = true;
    };
  }, [notify]);
  useEffect(
    () => () => {
      Object.values(assetURLs).forEach((url) => URL.revokeObjectURL(url));
    },
    [assetURLs],
  );
  const reloadWorkspaces = useCallback(async () => {
    setWorkspaces(await storage.workspaces());
  }, []);
  const switchWorkspace = useCallback(
    async (id: string) => {
      if (id === workspaceId) return true;
      if (switchingRef.current) return false;
      switchingRef.current = true;
      setSwitching(true);
      try {
        if (!(await flushEdit())) return false;
        const [documents, assets] = await Promise.all([
          storage.load(id),
          storage.loadAssets(id),
        ]);
        revisions.current = new Map(
          documents.map((d) => [d.id, d.revision || 0]),
        );
        applyDocuments(documents, id);
        setAssetURLs(urlsFor(assets));
        setWorkspaceId(id);
        try {
          localStorage.setItem("openmdviewer.workspace", id);
        } catch {}
        setStorageStatus("Saved in this browser");
        return true;
      } catch {
        notify(
          "Could not open that workspace. Your current documents are unchanged.",
        );
        return false;
      } finally {
        switchingRef.current = false;
        setSwitching(false);
      }
    },
    [workspaceId, flushEdit, notify],
  );
  const resolveConflict = useCallback(
    async (keepBoth: boolean) => {
      if (!conflict) return;
      if (editTimer.current) clearTimeout(editTimer.current);
      pendingEdit.current = null;
      await queue.current;
      const local =
        useReader
          .getState()
          .documents.find((d) => d.id === conflict.local.id) || conflict.local;
      const current = await storage.get(conflict.current.id);
      if (!current) {
        notify(
          "The saved document is no longer available. Download your local copy.",
        );
        return;
      }
      const documents = useReader.getState().documents;
      let copy: ReaderDocument | undefined;
      if (keepBoth) {
        let n = 1;
        let path = local.path.replace(/(\.[^.]*)?$/, ` (conflict copy ${n})$1`);
        const paths = new Set(
          (await storage.load(local.workspaceId)).map((d) => d.path),
        );
        while (paths.has(path))
          path = local.path.replace(/(\.[^.]*)?$/, ` (conflict copy ${++n})$1`);
        copy = await storage.put({
          ...newDocument(path, local.content),
          workspaceId: local.workspaceId,
          tags: local.tags,
        });
      }
      revisions.current.set(current.id, current.revision || 0);
      useReader.setState({
        documents: [
          ...documents.filter((d) => d.id !== current.id),
          ...(!current.deletedAt ? [current] : []),
          ...(copy ? [copy] : []),
        ],
      });
      if (copy) useReader.getState().open(copy.id);
      else if (!current.deletedAt) useReader.getState().open(current.id);
      queue.current = Promise.resolve(true);
      setConflict(null);
      setStorageStatus("Saved in this browser");
      notify(
        keepBoth
          ? "Both versions are preserved. Your edits are in a separate document."
          : "Loaded the saved version.",
      );
    },
    [conflict, notify],
  );
  return {
    loaded,
    workspaceId,
    workspaces,
    switching,
    assetURLs,
    storageStatus,
    setStorageStatus,
    save,
    flushEdit,
    scheduleSave,
    hasPendingChanges,
    refreshAssets,
    reloadWorkspaces,
    switchWorkspace,
    conflict,
    resolveConflict,
  };
}
