import "fake-indexeddb/auto";
import Dexie from "dexie";
import { expect, it } from "vitest";
import { createStorage } from "../src/lib/storage";
import { newDocument } from "../src/lib/documents";
import type { DirectoryImport } from "../src/lib/local-directory-types";
import type { LocalFileHandle } from "../src/lib/local-file-types";
function bundle(id = "folder"): DirectoryImport {
  const doc = {
    ...newDocument("guide/README.md", "original"),
    workspaceId: id,
    revision: 0,
  };
  return {
    workspace: {
      id,
      name: "Docs",
      description: "Keep",
      icon: "📂",
      initialized: true,
      createdAt: 1,
    },
    source: {
      workspaceId: id,
      name: "Docs",
      token: "first",
      handle: {
        kind: "directory",
        name: "Docs",
      } as DirectoryImport["source"]["handle"],
      entries: [
        { path: doc.path, hash: "disk", documentId: doc.id },
        { path: "image.png", hash: "image" },
      ],
      checkedAt: 1,
    },
    documents: [doc],
    assets: [
      {
        workspaceId: id,
        path: "image.png",
        type: "image/png",
        blob: new Blob(["original pixels"]),
      },
    ],
    files: [
      {
        workspaceId: id,
        directoryId: id,
        documentId: doc.id,
        handle: { kind: "file", name: "README.md" } as LocalFileHandle,
        token: "file",
        name: "README.md",
        diskHash: "disk",
        browserHash: "browser",
        checkedAt: 1,
      },
    ],
  };
}
async function database(
  test: (
    store: ReturnType<typeof createStorage>,
    name: string,
  ) => Promise<void>,
) {
  const name = `directories-${crypto.randomUUID()}`,
    store = createStorage(name);
  try {
    await test(store, name);
  } finally {
    store.close();
    await Dexie.delete(name);
  }
}
it("migrates version 5 without altering existing file handles, document revisions or content", async () =>
  database(async (store, name) => {
    const old = new Dexie(name),
      original = bundle("default");
    old
      .version(5)
      .stores({
        documents: "id, workspaceId, [workspaceId+path], path, updatedAt",
        assets: "path",
        workspaceAssets: "[workspaceId+path], workspaceId",
        workspaces: "id, name, createdAt",
        snapshots: "id, documentId, workspaceId, createdAt",
        searchHistory: "[workspaceId+key], workspaceId",
        fileSources: "documentId, workspaceId",
      });
    await old.table("documents").put({ ...original.documents[0], revision: 8 });
    await old.table("fileSources").put(original.files[0]);
    old.close();
    expect(await store.directorySources()).toEqual([]);
    expect(await store.fileSource(original.documents[0].id)).toEqual(
      original.files[0],
    );
    expect(await store.get(original.documents[0].id)).toMatchObject({
      content: "original",
      revision: 8,
    });
  }));
it("atomically connects a folder and rolls back all records on conflicting or invalid paths", async () =>
  database(async (store) => {
    const original = bundle();
    await store.connectDirectory(original);
    expect(await store.directorySource("folder")).toEqual(original.source);
    expect(await store.load("folder")).toEqual(original.documents);
    expect(await (await store.loadAssets("folder"))[0].blob.text()).toBe(
      "original pixels",
    );
    const bad = bundle("bad");
    bad.assets[0].path = bad.documents[0].path;
    await expect(store.connectDirectory(bad)).rejects.toThrow("path");
    expect(await store.directorySource("bad")).toBeUndefined();
    expect(await store.load("bad")).toEqual([]);
    expect(
      (await store.workspaces()).some((workspace) => workspace.id === "bad"),
    ).toBe(false);
  }));
it("rejects stale scan additions and path collisions without replacing browser edits or media", async () =>
  database(async (store) => {
    const original = bundle();
    await store.connectDirectory(original);
    const edited = await store.save(
      { ...original.documents[0], content: "browser changes" },
      0,
    );
    const added = bundle();
    added.documents[0].path = "New.md";
    added.source.entries = [
      ...original.source.entries,
      { path: "New.md", hash: "new", documentId: added.documents[0].id },
    ];
    added.source.token = "second";
    added.assets = [];
    await store.connectDirectory(added, "first");
    expect(await store.get(edited.id)).toEqual(edited);
    await expect(store.connectDirectory(added, "first")).rejects.toThrow(
      "Another tab",
    );
    const collision = bundle();
    collision.documents[0].path = "New.md";
    collision.source.token = "third";
    await expect(store.connectDirectory(collision, "second")).rejects.toThrow(
      "path",
    );
    expect(await (await store.loadAssets("folder"))[0].blob.text()).toBe(
      "original pixels",
    );
    expect(await store.directorySource("folder")).toEqual(added.source);
  }));
it("disconnects only folder-owned handles while retaining documents, assets, unrelated file connections and revision history", async () =>
  database(async (store) => {
    const original = bundle();
    await store.connectDirectory(original);
    const doc = original.documents[0];
    await store.save({ ...doc, content: "browser" }, 0);
    const unrelated = {
      ...newDocument("Other.md", "other"),
      workspaceId: "folder",
    };
    await store.connectFile(unrelated, {
      ...original.files[0],
      documentId: unrelated.id,
      directoryId: undefined,
    });
    await expect(store.disconnectDirectory("folder", "stale")).rejects.toThrow(
      "Another tab",
    );
    await store.disconnectDirectory("folder", "first");
    expect(await store.directorySource("folder")).toBeUndefined();
    expect(await store.fileSource(doc.id)).toBeUndefined();
    expect(await store.fileSource(unrelated.id)).toBeDefined();
    expect(await store.get(doc.id)).toMatchObject({ content: "browser" });
    expect(await store.snapshots(doc.id)).toHaveLength(1);
    expect(await store.loadAssets("folder")).toHaveLength(1);
  }));
