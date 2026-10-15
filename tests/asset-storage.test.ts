import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, expect, it, vi } from "vitest";
import { createStorage } from "../src/lib/storage";
import { newDocument } from "../src/lib/documents";
import { assetBytes, restoredAsset } from "../src/lib/asset-storage";
const names: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const name of names.splice(0)) await Dexie.delete(name);
});
function blockedBlobs() {
  const original = IDBObjectStore.prototype.add;
  let rejected = 0;
  vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (
    this: IDBObjectStore,
    value,
    key,
  ) {
    if (this.name === "workspaceAssets" && value.blob instanceof Blob) {
      rejected++;
      throw new DOMException(
        "Error preparing Blob/File data to be stored in object store",
        "UnknownError",
      );
    }
    return key === undefined
      ? original.call(this, value)
      : original.call(this, value, key);
  });
  return () => rejected;
}
const asset = () => ({
  path: "image.png",
  type: "image/png",
  blob: new Blob([new Uint8Array([0, 255, 1, 128])], { type: "image/png" }),
});
it("restores legacy Blob records and byte records without changing MIME, paths or binary bytes", async () => {
  const original = asset();
  expect(restoredAsset(original)).toBe(original);
  const [bytes] = await assetBytes([original]);
  expect(bytes.blob).toBeInstanceOf(ArrayBuffer);
  const restored = restoredAsset(bytes);
  expect(restored.path).toBe(original.path);
  expect(restored.blob.type).toBe(original.type);
  expect(Array.from(new Uint8Array(await restored.blob.arrayBuffer()))).toEqual(
    [0, 255, 1, 128],
  );
  expect(() =>
    restoredAsset({ ...bytes, blob: null as unknown as Blob }),
  ).toThrow(/preserved/);
});
it("rolls back native Blob failures before a complete byte fallback and remembers the working format within a storage session", async () => {
  const count = blockedBlobs(),
    name = `asset-test-${crypto.randomUUID()}`;
  names.push(name);
  const storage = createStorage(name);
  await storage.initialize([]);
  const first = newDocument("First.md", "first");
  await storage.import([first], [asset()]);
  expect(count()).toBe(1);
  expect((await storage.load()).map((doc) => doc.id)).toEqual([first.id]);
  expect(await (await storage.loadAssets())[0].blob.arrayBuffer()).toEqual(
    await asset().blob.arrayBuffer(),
  );
  await storage.import(
    [newDocument("Second.md", "second")],
    [{ ...asset(), path: "second.png" }],
  );
  expect(count()).toBe(1);
  expect(await storage.load()).toHaveLength(2);
  expect(await storage.loadAssets()).toHaveLength(2);
  const raw = new Dexie(name);
  raw.version(6).stores({ workspaceAssets: "[workspaceId+path], workspaceId" });
  expect(
    (await raw.table("workspaceAssets").get(["default", "image.png"])).blob,
  ).toBeInstanceOf(ArrayBuffer);
  raw.close();
  storage.close();
  const reopened = createStorage(name);
  await reopened.initialize([]);
  expect((await reopened.loadAssets())[0].blob).toBeInstanceOf(Blob);
  reopened.close();
});
it("retries complete imported workspace transactions without duplicate documents or partial workspaces", async () => {
  const count = blockedBlobs(),
    name = `asset-test-${crypto.randomUUID()}`;
  names.push(name);
  const storage = createStorage(name);
  await storage.initialize([newDocument("Original.md", "keep")]);
  const workspace = {
    id: "repository",
    name: "Repository",
    description: "",
    icon: "📦",
    createdAt: Date.now(),
    initialized: true,
  };
  await storage.createImportedWorkspace(
    workspace,
    [newDocument("Readme.md", "imported")],
    [asset()],
  );
  expect(count()).toBe(1);
  expect(await storage.load("repository")).toHaveLength(1);
  expect(await storage.loadAssets("repository")).toHaveLength(1);
  expect(
    (await storage.workspaces()).filter((item) => item.id === workspace.id),
  ).toHaveLength(1);
  expect((await storage.load("default"))[0].content).toBe("keep");
  storage.close();
});
it("never retries quota errors and keeps the transaction atomic when byte preparation fails", async () => {
  const name = `asset-test-${crypto.randomUUID()}`;
  names.push(name);
  const storage = createStorage(name);
  await storage.initialize([]);
  const original = IDBObjectStore.prototype.add;
  let quotaAttempts = 0;
  const spy = vi
    .spyOn(IDBObjectStore.prototype, "add")
    .mockImplementation(function (this: IDBObjectStore, value, key) {
      if (this.name === "workspaceAssets") {
        quotaAttempts++;
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      }
      return key === undefined
        ? original.call(this, value)
        : original.call(this, value, key);
    });
  await expect(
    storage.import([newDocument("Quota.md", "keep out")], [asset()]),
  ).rejects.toThrow(/Quota/);
  expect(await storage.load()).toHaveLength(0);
  expect(quotaAttempts).toBe(1);
  spy.mockRestore();
  blockedBlobs();
  const broken = asset();
  vi.spyOn(broken.blob, "arrayBuffer").mockRejectedValue(
    new Error("Cannot read original bytes"),
  );
  await expect(
    storage.import([newDocument("Broken.md", "keep out")], [broken]),
  ).rejects.toThrow(/original bytes/);
  expect(await storage.load()).toHaveLength(0);
  expect(await storage.loadAssets()).toHaveLength(0);
  storage.close();
});

it("keeps directory connection tokens and workspace records atomic through the same asset fallback", async () => {
  const count = blockedBlobs(),
    name = `asset-test-${crypto.randomUUID()}`;
  names.push(name);
  const storage = createStorage(name);
  const bundle = {
    workspace: {
      id: "folder",
      name: "Folder",
      description: "",
      icon: "📂",
      createdAt: 1,
      initialized: true,
    },
    documents: [],
    files: [],
    assets: [{ ...asset(), workspaceId: "folder" }],
    source: {
      workspaceId: "folder",
      name: "Folder",
      token: "one",
      checkedAt: 1,
      entries: [{ path: "image.png", hash: "disk-hash" }],
      handle: {
        kind: "directory",
        name: "Folder",
      } as import("../src/lib/local-directory-types").LocalDirectorySource["handle"],
    },
  };
  await storage.connectDirectory(bundle);
  expect(count()).toBe(1);
  expect((await storage.directorySource("folder"))?.token).toBe("one");
  expect((await storage.loadAssets("folder"))[0].blob.size).toBe(4);
  await expect(
    storage.connectDirectory(
      { ...bundle, assets: [], source: { ...bundle.source, token: "two" } },
      "stale",
    ),
  ).rejects.toThrow(/Another tab/);
  expect((await storage.directorySource("folder"))?.token).toBe("one");
  storage.close();
});

it("migrates legacy Blob and byte records without creating native Blob files or rewriting the original asset store", async () => {
  const name = `asset-test-${crypto.randomUUID()}`;
  names.push(name);
  const legacy = new Dexie(name);
  legacy
    .version(2)
    .stores({ documents: "id, path, updatedAt, favorite", assets: "path" });
  const blob = asset(),
    buffer = {
      ...asset(),
      path: "second.png",
      blob: await asset().blob.arrayBuffer(),
    };
  await legacy
    .table("documents")
    .put(newDocument("Legacy.md", "# Keep legacy"));
  await legacy.table("assets").bulkPut([blob, buffer]);
  legacy.close();
  const original = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
    this: IDBObjectStore,
    value,
    key,
  ) {
    if (this.name === "workspaceAssets" && value.blob instanceof Blob)
      throw new DOMException(
        "Error preparing Blob/File data to be stored in object store",
        "UnknownError",
      );
    return key === undefined
      ? original.call(this, value)
      : original.call(this, value, key);
  });
  const storage = createStorage(name);
  await storage.initialize([]);
  expect((await storage.load())[0].content).toBe("# Keep legacy");
  const assets = await storage.loadAssets();
  expect(assets).toHaveLength(2);
  for (const item of assets)
    expect(await item.blob.arrayBuffer()).toEqual(
      await blob.blob.arrayBuffer(),
    );
  const raw = new Dexie(name);
  await raw.open();
  expect((await raw.table("assets").get(blob.path)).blob).toBeInstanceOf(Blob);
  expect((await raw.table("assets").get(buffer.path)).blob).toBeInstanceOf(
    ArrayBuffer,
  );
  expect(
    (await raw.table("workspaceAssets").get(["default", blob.path])).blob,
  ).toBeInstanceOf(ArrayBuffer);
  raw.close();
  storage.close();
});
