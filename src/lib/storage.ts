import {
  CollectionConflict,
  collectionLimit,
  collectionNameKey,
  normalizeCollection,
  type CollectionDraft,
  type ReaderCollection,
  type ReadingActivity,
} from "./collections";
import {
  assetBytes,
  restoredAsset,
  blobPreparationFailed,
  type StoredAsset,
} from "./asset-storage";
import type {
  DirectoryImport,
  LocalDirectorySource,
} from "./local-directory-types";
import type { LocalFileSource } from "./local-file-types";
import { safePath } from "./paths";
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
    workspaceAssets: EntityTable<StoredAsset, "path">;
    workspaces: EntityTable<LocalWorkspace, "id">;
    snapshots: EntityTable<DocumentSnapshot, "id">;
    searchHistory: Table<RecentSearch, [string, string]>;
    fileSources: EntityTable<LocalFileSource, "documentId">;
    directorySources: EntityTable<LocalDirectorySource, "workspaceId">;
    collections: EntityTable<ReaderCollection, "id">;
    readingActivity: Table<ReadingActivity, [string, string]>;
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
      // Preserve original legacy records; move readable payloads through bytes so
      // an upgrade does not require the engine to prepare new native Blob files.
      for (const asset of assets) {
        const [record] = await Dexie.waitFor(assetBytes([asset]));
        await tx
          .table("workspaceAssets")
          .put({ ...record, workspaceId: "default" });
      }
      await tx.table("workspaces").put({
        ...defaultWorkspace(),
        initialized: (await tx.table("documents").count()) > 0,
      });
    });
  db.version(4).stores({ searchHistory: "[workspaceId+key], workspaceId" });
  db.version(5).stores({ fileSources: "documentId, workspaceId" });
  db.version(6).stores({ directorySources: "workspaceId" });
  db.version(7).stores({ collections: "id, workspaceId, updatedAt" });
  db.version(8).stores({
    readingActivity: "[workspaceId+documentId], workspaceId",
  });
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
  let preferAssetBytes = false;
  async function withAssetStorage<T>(
    assets: ReaderAsset[],
    write: (records: StoredAsset[]) => Promise<T>,
  ): Promise<T> {
    if (preferAssetBytes) return write(await assetBytes(assets));
    try {
      return await write(assets);
    } catch (error) {
      // write() is a complete transaction: await its rollback before retrying.
      // Other failures (quota, conflicts, permissions, corrupt records) are not retried.
      if (!assets.length || !blobPreparationFailed(error)) throw error;
      preferAssetBytes = true;
      return write(await assetBytes(assets));
    }
  }
  async function checkCollectionMembers(
    workspaceId: string,
    draft: CollectionDraft,
  ) {
    if (draft.kind !== "manual") return;
    const documents = await db.documents.bulkGet(draft.documentIds);
    if (
      documents.some(
        (doc) => !doc || (doc.workspaceId || "default") !== workspaceId,
      )
    )
      throw new Error("Collection members must belong to this workspace.");
  }
  async function addCollectionImports(
    workspaceId: string,
    drafts: CollectionDraft[],
  ) {
    if (!drafts.length) return;
    if (!(await db.workspaces.get(workspaceId)))
      throw new Error("This workspace is no longer available.");
    const existing = await db.collections
      .where("workspaceId")
      .equals(workspaceId)
      .toArray();
    if (drafts.length + existing.length > collectionLimit)
      throw new Error(
        `This workspace supports up to ${collectionLimit} collections.`,
      );
    const names = new Set(existing.map((item) => collectionNameKey(item.name)));
    const now = Date.now();
    for (const value of drafts) {
      const draft = normalizeCollection(value);
      await checkCollectionMembers(workspaceId, draft);
      const original = draft.name;
      let suffix = 2;
      while (names.has(collectionNameKey(draft.name))) {
        const end = ` (imported ${suffix++})`;
        draft.name = original.slice(0, 80 - end.length).trimEnd() + end;
      }
      names.add(collectionNameKey(draft.name));
      await db.collections.add({
        ...draft,
        id: crypto.randomUUID(),
        workspaceId,
        revision: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  const api = {
    close: () => db.close(),
    recentDocuments: (workspaceId: string) =>
      db.readingActivity
        .where("workspaceId")
        .equals(workspaceId)
        .sortBy("openedAt")
        .then((items) => items.reverse()),
    markOpened: (workspaceId: string, documentId: string) =>
      db.transaction("rw", db.documents, db.readingActivity, async () => {
        const doc = await db.documents.get(documentId);
        if (
          !doc ||
          doc.deletedAt ||
          (doc.workspaceId || "default") !== workspaceId
        )
          return;
        const current = await db.readingActivity.get([workspaceId, documentId]);
        await db.readingActivity.put({
          workspaceId,
          documentId,
          openedAt: Math.max(Date.now(), current?.openedAt || 0),
        });
      }),
    collections: (workspaceId: string) =>
      db.collections
        .where("workspaceId")
        .equals(workspaceId)
        .sortBy("createdAt"),
    putCollection: (
      workspaceId: string,
      value: CollectionDraft,
      expected?: { id: string; revision: number },
    ) =>
      db.transaction(
        "rw",
        db.workspaces,
        db.documents,
        db.collections,
        async () => {
          if (!(await db.workspaces.get(workspaceId)))
            throw new Error("This workspace is no longer available.");
          const draft = normalizeCollection(value);
          const current = expected
            ? await db.collections.get(expected.id)
            : undefined;
          if (
            expected &&
            (!current ||
              current.workspaceId !== workspaceId ||
              current.revision !== expected.revision)
          )
            throw new CollectionConflict();
          const existing = await db.collections
            .where("workspaceId")
            .equals(workspaceId)
            .toArray();
          if (!current && existing.length >= collectionLimit)
            throw new Error(
              `This workspace supports up to ${collectionLimit} collections.`,
            );
          if (
            existing.some(
              (item) =>
                item.id !== current?.id &&
                collectionNameKey(item.name) === collectionNameKey(draft.name),
            )
          )
            throw new Error(
              "A collection with that name already exists in this workspace.",
            );
          await checkCollectionMembers(workspaceId, draft);
          const now = Date.now();
          const next: ReaderCollection = {
            ...draft,
            id: current?.id || crypto.randomUUID(),
            workspaceId,
            revision: current ? current.revision + 1 : 0,
            createdAt: current?.createdAt ?? now,
            updatedAt: now,
          };
          await db.collections.put(next);
          return next;
        },
      ),
    deleteCollection: (
      workspaceId: string,
      id: string,
      expectedRevision: number,
    ) =>
      db.transaction("rw", db.collections, async () => {
        const current = await db.collections.get(id);
        if (
          !current ||
          current.workspaceId !== workspaceId ||
          current.revision !== expectedRevision
        )
          throw new CollectionConflict();
        await db.collections.delete(id);
      }),
    directorySource: (workspaceId: string) =>
      db.directorySources.get(workspaceId),
    directorySources: () => db.directorySources.toArray(),
    connectDirectory: (
      bundle: DirectoryImport,
      expectedToken: string | null = null,
    ) =>
      withAssetStorage(bundle.assets, (assetRecords) =>
        db.transaction(
          "rw",
          [
            db.workspaces,
            db.documents,
            db.workspaceAssets,
            db.fileSources,
            db.directorySources,
          ],
          async () => {
            const id = bundle.source.workspaceId;
            const current = await db.directorySources.get(id);
            if ((current?.token || null) !== expectedToken)
              throw new Error(
                "Another tab changed this folder connection. Scan again before adding files.",
              );
            if (
              bundle.workspace.id !== id ||
              bundle.documents.length !== bundle.files.length
            )
              throw new Error("Invalid folder connection workspace.");
            if (!expectedToken) await db.workspaces.add(bundle.workspace);
            else if (!(await db.workspaces.get(id)))
              throw new Error("This workspace is no longer available.");
            const paths = new Set<string>();
            const previous = new Set(
              current?.entries.map((entry) => entry.path) || [],
            );
            const assets = await db.workspaceAssets
              .where("workspaceId")
              .equals(id)
              .toArray();
            const existingAssets = new Set(assets.map((asset) => asset.path));
            const ids = new Set<string>();
            const fileById = new Map(
              bundle.files.map((file) => [file.documentId, file]),
            );
            const entryById = new Map(
              bundle.source.entries
                .filter((entry) => entry.documentId)
                .map((entry) => [entry.documentId!, entry.path]),
            );
            for (const doc of bundle.documents) {
              const file = fileById.get(doc.id);
              if (
                doc.workspaceId !== id ||
                file?.workspaceId !== id ||
                file.directoryId !== id ||
                entryById.get(doc.id) !== doc.path ||
                ids.has(doc.id) ||
                paths.has(doc.path) ||
                previous.has(doc.path) ||
                existingAssets.has(doc.path)
              )
                throw new Error("Invalid or conflicting folder document path.");
              await ensurePath(doc);
              ids.add(doc.id);
              paths.add(doc.path);
            }
            for (const asset of bundle.assets) {
              if (
                asset.workspaceId !== id ||
                paths.has(asset.path) ||
                previous.has(asset.path) ||
                existingAssets.has(asset.path) ||
                (await db.documents
                  .where("[workspaceId+path]")
                  .equals([id, asset.path])
                  .count())
              )
                throw new Error(
                  "That folder path already exists in the browser workspace.",
                );
              paths.add(asset.path);
            }
            if ((await scoped(id).count()) + bundle.documents.length > 10000)
              throw new Error(
                "This workspace supports up to 10,000 documents.",
              );
            await db.documents.bulkAdd(bundle.documents);
            await db.workspaceAssets.bulkAdd(assetRecords);
            await db.fileSources.bulkAdd(bundle.files);
            await db.directorySources.put(bundle.source);
          },
        ),
      ),
    disconnectDirectory: (workspaceId: string, expectedToken: string) =>
      db.transaction("rw", db.directorySources, db.fileSources, async () => {
        if (
          (await db.directorySources.get(workspaceId))?.token !== expectedToken
        )
          throw new Error(
            "Another tab changed this folder connection. Reopen folder controls.",
          );
        await db.directorySources.delete(workspaceId);
        const sources = await db.fileSources
          .where("workspaceId")
          .equals(workspaceId)
          .toArray();
        await db.fileSources.bulkDelete(
          sources
            .filter((source) => source.directoryId === workspaceId)
            .map((source) => source.documentId),
        );
      }),
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
      db.workspaceAssets
        .where("workspaceId")
        .equals(workspaceId)
        .toArray()
        .then((assets) => assets.map(restoredAsset)),
    import: (
      documents: ReaderDocument[],
      assets: ReaderAsset[],
      workspaceId = "default",
      collections: CollectionDraft[] = [],
    ) =>
      withAssetStorage(assets, (assetRecords) =>
        db.transaction(
          "rw",
          [db.documents, db.workspaceAssets, db.workspaces, db.collections],
          async () => {
            const scopedDocs = documents.map((d) => ({
              ...d,
              workspaceId,
              revision: 0,
            }));
            for (const doc of scopedDocs) await ensurePath(doc);
            await db.documents.bulkAdd(scopedDocs);
            await db.workspaceAssets.bulkAdd(
              assetRecords.map((a) => ({ ...a, workspaceId })),
            );
            await addCollectionImports(workspaceId, collections);
          },
        ),
      ),
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
    createImportedWorkspace: (
      workspace: LocalWorkspace,
      documents: ReaderDocument[],
      assets: ReaderAsset[],
      collections: CollectionDraft[] = [],
    ) =>
      withAssetStorage(assets, (assetRecords) =>
        db.transaction(
          "rw",
          [db.workspaces, db.documents, db.workspaceAssets, db.collections],
          async () => {
            if (
              !workspace.id ||
              !workspace.name.trim() ||
              !documents.length ||
              documents.length > 10000 ||
              !workspace.initialized
            )
              throw new Error("Invalid imported workspace.");
            const paths = new Set<string>(),
              ids = new Set<string>();
            for (const item of [...documents, ...assets]) {
              if (safePath(item.path) !== item.path || paths.has(item.path))
                throw new Error(
                  "Imported workspace contains invalid or duplicate paths.",
                );
              paths.add(item.path);
            }
            for (const doc of documents) {
              if (!doc.id || ids.has(doc.id))
                throw new Error(
                  "Imported workspace contains duplicate document IDs.",
                );
              ids.add(doc.id);
            }
            await db.workspaces.add(workspace);
            await db.documents.bulkAdd(
              documents.map((doc) => ({
                ...doc,
                workspaceId: workspace.id,
                revision: 0,
              })),
            );
            if (assets.length)
              await db.workspaceAssets.bulkAdd(
                assetRecords.map((asset) => ({
                  ...asset,
                  workspaceId: workspace.id,
                })),
              );
            await addCollectionImports(workspace.id, collections);
          },
        ),
      ),
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
