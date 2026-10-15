import "fake-indexeddb/auto";
import Dexie from "dexie";
import { expect, it } from "vitest";
import { createStorage } from "../src/lib/storage";
import { newDocument } from "../src/lib/documents";
import type {
  LocalFileSource,
  LocalFileHandle,
} from "../src/lib/local-file-types";
function source(
  documentId: string,
  workspaceId = "default",
  token = "first",
): LocalFileSource {
  return {
    documentId,
    workspaceId,
    token,
    name: "Original.md",
    handle: { kind: "file", name: "Original.md" } as LocalFileHandle,
    diskHash: "original",
    browserHash: "browser",
    checkedAt: 1,
  };
}
async function database(
  test: (
    store: ReturnType<typeof createStorage>,
    name: string,
  ) => Promise<void>,
) {
  const name = `file-sources-${crypto.randomUUID()}`,
    store = createStorage(name);
  try {
    await test(store, name);
  } finally {
    store.close();
    await Dexie.delete(name);
  }
}
it("adds the file-source store without changing version 4 documents, annotations, media, workspaces, snapshots or search history", async () =>
  database(async (store, name) => {
    const old = new Dexie(name);
    old.version(4).stores({
      documents: "id, workspaceId, [workspaceId+path], path, updatedAt",
      assets: "path",
      workspaceAssets: "[workspaceId+path], workspaceId",
      workspaces: "id, name, createdAt",
      snapshots: "id, documentId, workspaceId, createdAt",
      searchHistory: "[workspaceId+key], workspaceId",
    });
    const doc = {
      ...newDocument("Original.md", "# Original\r\n"),
      workspaceId: "default",
      revision: 5,
      annotations: [
        {
          id: "note",
          kind: "note",
          title: "Keep",
          note: "My note",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    const snapshot = {
      id: "snapshot",
      documentId: doc.id,
      workspaceId: "default",
      document: doc,
      createdAt: 1,
      reason: "edit",
    };
    const history = {
      workspaceId: "default",
      key: "query",
      query: "original",
      options: { literal: false, caseSensitive: false, wholeWord: false },
      usedAt: 2,
    };
    const workspace = {
      id: "default",
      name: "Original workspace",
      icon: "📚",
      description: "Preserve",
      createdAt: 1,
      initialized: true,
    };
    await old.table("workspaces").put(workspace);
    await old.table("documents").put(doc);
    await old.table("snapshots").put(snapshot);
    await old.table("searchHistory").put(history);
    await old.table("workspaceAssets").put({
      workspaceId: "default",
      path: "original.png",
      blob: new Blob(["bytes"]),
      type: "image/png",
    });
    old.close();
    expect(await store.get(doc.id)).toEqual(doc);
    expect(await store.workspaces()).toEqual([workspace]);
    expect(await store.fileSources("default")).toEqual([]);
    await store.setFileSource(source(doc.id), null);
    expect(await store.get(doc.id)).toEqual(doc);
    expect(await store.snapshots(doc.id)).toEqual([snapshot]);
    expect(await store.searchHistory("default")).toEqual([history]);
    expect(await (await store.loadAssets())[0].blob.text()).toBe("bytes");
  }));
it("atomically creates a connected document and rejects conflicting paths/workspaces", async () =>
  database(async (store) => {
    await store.initialize([]);
    const doc = {
      ...newDocument("Connected/Original.md", "original"),
      workspaceId: "default",
      revision: 0,
    };
    await store.connectFile(doc, source(doc.id));
    expect(await store.get(doc.id)).toEqual(doc);
    expect((await store.fileSource(doc.id))?.token).toBe("first");
    const duplicate = {
      ...newDocument(doc.path, "duplicate"),
      workspaceId: "default",
    };
    await expect(
      store.connectFile(duplicate, source(duplicate.id)),
    ).rejects.toThrow("already exists");
    expect(await store.get(duplicate.id)).toBeUndefined();
    const invalid = { ...newDocument("Bad.md", "bad"), workspaceId: "other" };
    await expect(
      store.connectFile(invalid, source(invalid.id)),
    ).rejects.toThrow("workspace");
    expect(await store.get(invalid.id)).toBeUndefined();
  }));
it("isolates sources, rejects stale connection updates and disconnects without deleting documents", async () =>
  database(async (store) => {
    await store.initialize([]);
    const first = await store.put(newDocument("A.md", "one")),
      other = await store.createWorkspace("Other"),
      second = await store.put({
        ...newDocument("A.md", "two"),
        workspaceId: other.id,
      });
    await store.setFileSource(source(first.id), null);
    await store.setFileSource(source(second.id, other.id), null);
    await store.setFileSource(source(first.id, "default", "new"), "first");
    await expect(
      store.setFileSource(source(first.id), "first"),
    ).rejects.toThrow("Another tab");
    await expect(store.disconnectFile(first.id, "first")).rejects.toThrow(
      "Another tab",
    );
    await store.disconnectFile(first.id, "new");
    expect(await store.get(first.id)).toEqual(first);
    expect(await store.fileSources("default")).toEqual([]);
    expect(await store.fileSources(other.id)).toHaveLength(1);
    await store.trash(second, 0);
    await expect(
      store.setFileSource(source(second.id, other.id, "later"), "first"),
    ).rejects.toThrow("no longer available");
  }));
