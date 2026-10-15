import type { LocalFileSource } from "./local-file-types";
import Dexie, { type EntityTable, type Table } from "dexie";
import type {
  ReaderDocument,
  ReaderAsset,
  LocalWorkspace,
  DocumentSnapshot,
} from "./types";
import {
  searchHistoryEntry,
  searchHistoryLimit,
  type RecentSearch,
} from "./search-history";
import type { SearchOptions } from "./search-results";
export class DocumentConflict extends Error {
  constructor(public current: ReaderDocument) {
    super(
      "This document changed in another tab. Your edits have not overwritten the saved version.",
    );
    this.name = "DocumentConflict";
  }
}
const defaultWorkspace = (): LocalWorkspace => ({
  id: "default",
  name: "My workspace",
  description: "Your local notes and documentation",
  icon: "📚",
  createdAt: Date.now(),
  initialized: false,
});
export function createStorage(name = "openmdviewer") {
  const db = new Dexie(name) as Dexie & {
    documents: EntityTable<ReaderDocument, "id">;
    assets: EntityTable<ReaderAsset, "path">;
    workspaceAssets: EntityTable<ReaderAsset, "path">;
    workspaces: EntityTable<LocalWorkspace, "id">;
    snapshots: EntityTable<DocumentSnapshot, "id">;
    searchHistory: Table<RecentSearch, [string, string]>;
    fileSources: EntityTable<LocalFileSource, "documentId">;
  };
  db.version(1).stores({ documents: "id, path, updatedAt, favorite" });
  db.version(2).stores({
    documents: "id, path, updatedAt, favorite",
    assets: "path",
  });
  db.version(3)
    .stores({
      documents: "id, workspaceId, [workspaceId+path], path, updatedAt",
      assets: "path",
      workspaceAssets: "[workspaceId+path], workspaceId",
      workspaces: "id, name, createdAt",
      snapshots: "id, documentId, workspaceId, createdAt",
    })
    .upgrade(async (tx) => {
      await tx
        .table("documents")
        .toCollection()
        .modify((d) => {
          d.workspaceId = "default";
          d.revision = 0;
        });
      const assets = await tx.table("assets").toArray();
      await tx
        .table("workspaceAssets")
        .bulkPut(assets.map((a) => ({ ...a, workspaceId: "default" })));
      await tx.table("workspaces").put({
        ...defaultWorkspace(),
        initialized: (await tx.table("documents").count()) > 0,
      });
    });
  db.version(4).stores({ searchHistory: "[workspaceId+key], workspaceId" });
  db.version(5).stores({ fileSources: "documentId, workspaceId" });
  const scoped = (id = "default") =>
    db.documents.where("workspaceId").equals(id);
  async function ensurePath(doc: ReaderDocument) {
    const conflict = await db.documents
      .where("[workspaceId+path]")
      .equals([doc.workspaceId || "default", doc.path])
      .filter((d) => d.id !== doc.id && !d.deletedAt)
      .first();
    if (conflict)
      throw new Error("That document path already exists in this workspace.");
  }
  async function snapshot(
    doc: ReaderDocument,
    reason: DocumentSnapshot["reason"],
  ) {
    await db.snapshots.put({
      id: crypto.randomUUID(),
      documentId: doc.id,
      workspaceId: doc.workspaceId || "default",
      document: { ...doc },
      createdAt: Date.now(),
      reason,
    });
    const all = await db.snapshots.where("documentId").equals(doc.id).toArray();
    all.sort(
      (a, b) =>
        (a.document.revision || 0) - (b.document.revision || 0) ||
        a.createdAt - b.createdAt,
    );
    if (all.length > 50)
      await db.snapshots.bulkDelete(
        all.slice(0, all.length - 50).map((s) => s.id),
      );
  }
  const api = {
    close: () => db.close(),
    fileSource: (documentId: string) => db.fileSources.get(documentId),
    fileSources: (workspaceId: string) =>
      db.fileSources.where("workspaceId").equals(workspaceId).toArray(),
    setFileSource: (source: LocalFileSource, expectedToken: string | null) =>
      db.transaction("rw", db.documents, db.fileSources, async () => {
        const current = await db.fileSources.get(source.documentId);
        if ((current?.token || null) !== expectedToken)
          throw new Error(
            "Another tab changed this file connection. Close and reopen local file controls.",
          );
        const doc = await db.documents.get(source.documentId);
        if (
          !doc ||
          doc.deletedAt ||
          (doc.workspaceId || "default") !== source.workspaceId
        )
          throw new Error(
            "This browser document is no longer available in its workspace.",
          );
        await db.fileSources.put(source);
      }),
    disconnectFile: (documentId: string, expectedToken: string) =>
      db.transaction("rw", db.fileSources, async () => {
        const current = await db.fileSources.get(documentId);
        if (current?.token !== expectedToken)
          throw new Error(
            "Another tab changed this file connection. Close and reopen local file controls.",
          );
        await db.fileSources.delete(documentId);
      }),
    connectFile: (doc: ReaderDocument, source: LocalFileSource) =>
      db.transaction("rw", db.documents, db.fileSources, async () => {
        await ensurePath(doc);
        if (await db.documents.get(doc.id))
          throw new Error("That browser document already exists.");
        if (
          source.documentId !== doc.id ||
          source.workspaceId !== (doc.workspaceId || "default")
        )
          throw new Error("Invalid file connection workspace.");
        await db.documents.add(doc);
        await db.fileSources.add(source);
      }),
    searchHistory: async (workspaceId: string) => {
      const items = await db.searchHistory
        .where("workspaceId")
        .equals(workspaceId)
        .toArray();
      return items.sort(
        (a, b) => b.usedAt - a.usedAt || a.key.localeCompare(b.key),
      );
    },
    rememberSearch: async (
      workspaceId: string,
      query: string,
      options: SearchOptions,
    ) => {
      const entry = searchHistoryEntry(query, options);
      if (!entry) return;
      await db.transaction("rw", db.searchHistory, async () => {
        const previous = await api.searchHistory(workspaceId);
        await db.searchHistory.put({
          ...entry,
          workspaceId,
          usedAt: Math.max(Date.now(), (previous[0]?.usedAt || 0) + 1),
        });
        const expired = previous
          .filter((item) => item.key !== entry.key)
          .slice(searchHistoryLimit - 1);
        await db.searchHistory.bulkDelete(
          expired.map((item) => [workspaceId, item.key]),
        );
      });
    },
    removeSearch: (workspaceId: string, key: string) =>
      db.searchHistory.delete([workspaceId, key]),
    clearSearchHistory: (workspaceId: string) =>
      db.searchHistory.where("workspaceId").equals(workspaceId).delete(),
    async initialize(examples: ReaderDocument[], selectedId = "default") {
      await db.transaction("rw", db.documents, db.workspaces, async () => {
        let workspace = await db.workspaces.get("default");
        if (!workspace) {
          workspace = defaultWorkspace();
          await db.workspaces.put(workspace);
        }
        if (!workspace.initialized) {
          if (!(await scoped().count()))
            await db.documents.bulkPut(
              examples.map((d) => ({
                ...d,
                workspaceId: "default",
                revision: 0,
              })),
            );
          await db.workspaces.update("default", { initialized: true });
        }
      });
      const workspaces = await db.workspaces.toArray();
      const selected =
        workspaces.find((w) => w.id === selectedId) ||
        workspaces.find((w) => w.id === "default")!;
      return { workspaces, selected, documents: await api.load(selected.id) };
    },
    load: (workspaceId = "default") =>
      scoped(workspaceId)
        .filter((d) => !d.deletedAt)
        .toArray(),
    get: (id: string) => db.documents.get(id),
    loadAssets: (workspaceId = "default") =>
      db.workspaceAssets.where("workspaceId").equals(workspaceId).toArray(),
    import: (
      documents: ReaderDocument[],
      assets: ReaderAsset[],
      workspaceId = "default",
    ) =>
      db.transaction("rw", db.documents, db.workspaceAssets, async () => {
        const scopedDocs = documents.map((d) => ({
          ...d,
          workspaceId,
          revision: 0,
        }));
        for (const doc of scopedDocs) await ensurePath(doc);
        await db.documents.bulkAdd(scopedDocs);
        await db.workspaceAssets.bulkAdd(
          assets.map((a) => ({ ...a, workspaceId })),
        );
      }),
    // Compatibility helpers for initial document creation; content edits use save().
    put: async (doc: ReaderDocument) => {
      const created = {
        ...doc,
        workspaceId: doc.workspaceId || "default",
        revision: doc.revision || 0,
      };
      await db.transaction("rw", db.documents, async () => {
        await ensurePath(created);
        await db.documents.put(created);
      });
      return created;
    },
    putAll: (docs: ReaderDocument[]) =>
      db.documents.bulkPut(
        docs.map((d) => ({
          ...d,
          workspaceId: d.workspaceId || "default",
          revision: d.revision || 0,
        })),
      ),
    scroll: (id: string, scroll: number) => db.documents.update(id, { scroll }),
    save: (
      doc: ReaderDocument,
      expectedRevision: number,
      reason: DocumentSnapshot["reason"] = "edit",
    ) =>
      db.transaction("rw", db.documents, db.snapshots, async () => {
        const current = await db.documents.get(doc.id);
        if (current && (current.revision || 0) !== expectedRevision)
          throw new DocumentConflict(current);
        if (current?.deletedAt) throw new DocumentConflict(current);
        const next = {
          ...doc,
          workspaceId: doc.workspaceId || "default",
          revision: expectedRevision + 1,
        };
        await ensurePath(next);
        if (current && current.content !== doc.content)
          await snapshot(current, reason);
        await db.documents.put(next);
        return next;
      }),
    workspaces: () => db.workspaces.orderBy("createdAt").toArray(),
    async createWorkspace(name: string, description = "", icon = "📁") {
      const workspace: LocalWorkspace = {
        id: crypto.randomUUID(),
        name: name.trim() || "Untitled workspace",
        description,
        icon: icon.slice(0, 8) || "📁",
        createdAt: Date.now(),
        initialized: true,
      };
      await db.workspaces.add(workspace);
      return workspace;
    },
    async renameWorkspace(
      id: string,
      name: string,
      description: string,
      icon: string,
    ) {
      await db.workspaces.update(id, {
        name: name.trim() || "Untitled workspace",
        description,
        icon: icon.slice(0, 8) || "📁",
      });
    },
    snapshots: async (documentId: string) => {
      const items = await db.snapshots
        .where("documentId")
        .equals(documentId)
        .toArray();
      return items.sort(
        (a, b) =>
          (b.document.revision || 0) - (a.document.revision || 0) ||
          b.createdAt - a.createdAt,
      );
    },
    trash: (doc: ReaderDocument, expectedRevision: number) =>
      db.transaction("rw", db.documents, db.snapshots, async () => {
        const current = await db.documents.get(doc.id);
        if (!current) throw new Error("Document not found.");
        if ((current.revision || 0) !== expectedRevision)
          throw new DocumentConflict(current);
        await snapshot(current, "trash");
        await db.documents.put({
          ...current,
          deletedAt: Date.now(),
          revision: expectedRevision + 1,
        });
      }),
    trashItems: (workspaceId = "default") =>
      scoped(workspaceId)
        .filter((d) => !!d.deletedAt)
        .toArray(),
    restoreTrash: (id: string) =>
      db.transaction("rw", db.documents, async () => {
        const doc = await db.documents.get(id);
        if (!doc || !doc.deletedAt)
          throw new Error("Trashed document not found.");
        let path = doc.path;
        let n = 2;
        while (
          await db.documents
            .where("[workspaceId+path]")
            .equals([doc.workspaceId || "default", path])
            .filter((d) => !d.deletedAt)
            .count()
        )
          path = doc.path.replace(/(\.[^.]*)?$/, ` (restored ${n++})$1`);
        const restored = {
          ...doc,
          path,
          deletedAt: undefined,
          revision: (doc.revision || 0) + 1,
        };
        await db.documents.put(restored);
        return restored;
      }),
  };
  return api;
}
export const storage = createStorage();
