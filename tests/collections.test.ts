import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import {
  CollectionConflict,
  collectionLimit,
  collectionsFromArchive,
  normalizeCollection,
  type ReaderCollection,
} from "../src/lib/collections";
import { createStorage } from "../src/lib/storage";
import { newDocument } from "../src/lib/documents";
import {
  workspaceMetadata,
  workspaceMetadataPath,
  applyWorkspaceMetadata,
} from "../src/lib/workspace-archive";
import { readLocalFiles, isolateImport } from "../src/lib/import";
import { convertImport } from "../src/lib/convert-import";
import { zipSync, strToU8 } from "fflate";
const names: string[] = [];
const make = () => {
  const name = `collections-${crypto.randomUUID()}`;
  names.push(name);
  return { name, storage: createStorage(name) };
};
afterEach(async () => {
  for (const name of names.splice(0)) await Dexie.delete(name);
});
const search = {
  name: "API search",
  kind: "search" as const,
  query: 'tag:api "recovery checkpoint"',
  options: { literal: true, caseSensitive: false, wholeWord: true },
};

describe("collection contracts", () => {
  it("normalizes manual, tag and saved-query definitions without retaining unknown fields", () => {
    expect(
      normalizeCollection({
        name: "  Reading  ",
        kind: "manual",
        documentIds: ["one", "one", "two"],
        token: "secret",
        workspaceId: "outside",
      }),
    ).toEqual({ name: "Reading", kind: "manual", documentIds: ["one", "two"] });
    expect(
      normalizeCollection({
        name: "API",
        kind: "tag",
        tag: " api ",
        documentIds: ["outside"],
      }),
    ).toEqual({ name: "API", kind: "tag", tag: "api" });
    expect(
      normalizeCollection({
        ...search,
        options: { ...search.options, token: "secret" },
      }),
    ).toEqual(search);
    expect(
      normalizeCollection({
        ...search,
        query: "  foo  ",
        options: { literal: false, caseSensitive: true, wholeWord: false },
      }),
    ).toMatchObject({
      query: "foo",
      options: { literal: true, caseSensitive: true },
    });
    expect(
      normalizeCollection({
        ...search,
        query: "  (a+)+$  ",
        options: {
          regex: true,
          literal: true,
          caseSensitive: false,
          wholeWord: false,
        },
      }),
    ).toMatchObject({
      query: "  (a+)+$  ",
      options: { regex: true, literal: false },
    });
  });
  it("rejects malformed definitions and unbounded or command-only saved queries", () => {
    for (const value of [
      null,
      [],
      {},
      { name: "x", kind: "unknown" },
      { name: "\nx", kind: "tag", tag: "a" },
      { name: "x".repeat(81), kind: "tag", tag: "a" },
      { name: "x", kind: "manual", documentIds: [1] },
      { name: "x", kind: "manual", documentIds: Array(10001).fill("one") },
      { name: "x", kind: "tag", tag: " " },
      { ...search, query: "> settings" },
      { ...search, query: "a".repeat(513) },
      { ...search, options: { literal: "true" } },
    ])
      expect(() => normalizeCollection(value)).toThrow();
    expect(() => collectionsFromArchive(Array(101).fill(search), [])).toThrow(
      /100 collections/,
    );
  });
});
describe("workspace-scoped collection storage", () => {
  it("isolates workspaces, validates membership and rejects duplicate normalized names", async () => {
    const { storage } = make();
    await storage.initialize([]);
    const other = await storage.createWorkspace("Other");
    const one = await storage.put(newDocument("A.md", "# A"));
    const two = await storage.put({
      ...newDocument("A.md", "# B"),
      workspaceId: other.id,
    });
    const collection = await storage.putCollection("default", {
      name: "Reading",
      kind: "manual",
      documentIds: [one.id],
    });
    await storage.putCollection(other.id, {
      name: "Reading",
      kind: "manual",
      documentIds: [two.id],
    });
    expect(await storage.collections("default")).toEqual([collection]);
    await expect(
      storage.putCollection("default", {
        name: "ＲＥＡＤＩＮＧ",
        kind: "manual",
        documentIds: [],
      }),
    ).rejects.toThrow(/name already exists/);
    await expect(
      storage.putCollection("default", {
        name: "Outside",
        kind: "manual",
        documentIds: [two.id],
      }),
    ).rejects.toThrow(/belong to this workspace/);
    await expect(
      storage.putCollection("missing", {
        name: "Outside",
        kind: "manual",
        documentIds: [],
      }),
    ).rejects.toThrow(/no longer available/);
    await expect(
      storage.putCollection(
        other.id,
        { name: "Hijack", kind: "manual", documentIds: [two.id] },
        { id: collection.id, revision: 0 },
      ),
    ).rejects.toBeInstanceOf(CollectionConflict);
    expect((await storage.collections("default"))[0]).toEqual(collection);
    storage.close();
  });
  it("retains manual membership across document rename, trash and recovery without writing source", async () => {
    const { storage } = make();
    await storage.initialize([]);
    const doc = await storage.put(
      newDocument("A.md", "# Retain exact source\r\n"),
    );
    const collection = await storage.putCollection("default", {
      name: "Reading",
      kind: "manual",
      documentIds: [doc.id],
    });
    expect(await storage.get(doc.id)).toEqual(doc);
    expect(await storage.snapshots(doc.id)).toEqual([]);
    const renamed = await storage.save({ ...doc, path: "Moved/B.md" }, 0);
    await storage.trash(renamed, 1);
    await storage.restoreTrash(doc.id);
    expect(await storage.collections("default")).toEqual([collection]);
    expect((await storage.get(doc.id))?.content).toBe(doc.content);
    await storage.deleteCollection("default", collection.id, 0);
    expect(await storage.collections("default")).toEqual([]);
    expect((await storage.load())[0].id).toBe(doc.id);
    storage.close();
  });
  it("allows exactly one concurrent edit and rejects stale deletion across two connections", async () => {
    const { name, storage } = make();
    await storage.initialize([]);
    const second = createStorage(name);
    const original = await storage.putCollection("default", {
      name: "Review",
      kind: "tag",
      tag: "review",
    });
    const outcome = await Promise.allSettled([
      storage.putCollection(
        "default",
        { name: "First", kind: "tag", tag: "one" },
        original,
      ),
      second.putCollection(
        "default",
        { name: "Second", kind: "tag", tag: "two" },
        original,
      ),
    ]);
    expect(
      outcome.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcome.find((result) => result.status === "rejected"),
    ).toMatchObject({ reason: expect.any(CollectionConflict) });
    const saved = (await second.collections("default"))[0];
    expect(saved.revision).toBe(1);
    expect(saved.createdAt).toBe(original.createdAt);
    await expect(
      second.deleteCollection("default", saved.id, 0),
    ).rejects.toBeInstanceOf(CollectionConflict);
    await second.deleteCollection("default", saved.id, 1);
    expect(await storage.collections("default")).toEqual([]);
    await expect(
      storage.putCollection(
        "default",
        { name: "Resurrect", kind: "tag", tag: "x" },
        saved,
      ),
    ).rejects.toBeInstanceOf(CollectionConflict);
    storage.close();
    second.close();
  });
  it("rolls back imported documents, assets and definitions when a collection is invalid", async () => {
    const { storage } = make();
    await storage.initialize([]);
    const retained = await storage.put(newDocument("Keep.md", "keep"));
    const doc = newDocument("New.md", "new");
    await expect(
      storage.import(
        [doc],
        [{ path: "a.png", blob: new Blob(["bytes"]), type: "image/png" }],
        "default",
        [{ name: "Bad", kind: "manual", documentIds: ["missing"] }],
      ),
    ).rejects.toThrow(/belong/);
    expect(await storage.load()).toEqual([retained]);
    expect(await storage.loadAssets()).toEqual([]);
    expect(await storage.collections("default")).toEqual([]);
    const workspace = {
      id: "bad-import",
      name: "New",
      icon: "📚",
      description: "",
      createdAt: 1,
      initialized: true,
    };
    await expect(
      storage.createImportedWorkspace(
        workspace,
        [doc],
        [],
        [{ name: "Bad", kind: "manual", documentIds: [retained.id] }],
      ),
    ).rejects.toThrow(/belong/);
    expect((await storage.workspaces()).map((w) => w.id)).toEqual(["default"]);
    expect(await storage.get(doc.id)).toBeUndefined();
    storage.close();
  });
  it("bounds each workspace and preserves existing names while atomically importing duplicate names", async () => {
    const { storage } = make();
    await storage.initialize([]);
    const first = await storage.putCollection("default", {
      name: "Review",
      kind: "tag",
      tag: "old",
    });
    await storage.import([], [], "default", [
      { name: "review", kind: "tag", tag: "new" },
      { name: "review", kind: "tag", tag: "other" },
    ]);
    const collections = await storage.collections("default");
    expect(collections.map((c) => c.name).sort()).toEqual([
      "Review",
      "review (imported 2)",
      "review (imported 3)",
    ]);
    expect(collections.find((c) => c.id === first.id)).toEqual(first);
    for (let n = collections.length; n < collectionLimit; n++)
      await storage.putCollection("default", {
        name: `Collection ${n}`,
        kind: "manual",
        documentIds: [],
      });
    await expect(storage.putCollection("default", search)).rejects.toThrow(
      /up to 100/,
    );
    const doc = newDocument("Rejected.md", "preserve outside transaction");
    await expect(
      storage.import([doc], [], "default", [search]),
    ).rejects.toThrow(/up to 100/);
    expect(await storage.get(doc.id)).toBeUndefined();
    expect(await storage.collections("default")).toHaveLength(100);
    storage.close();
  });
  it("adds the collection table to an existing version-six database without changing documents or assets", async () => {
    const { name, storage } = make();
    storage.close();
    const legacy = new Dexie(name);
    legacy.version(6).stores({
      documents: "id, workspaceId, [workspaceId+path], path, updatedAt",
      assets: "path",
      workspaceAssets: "[workspaceId+path], workspaceId",
      workspaces: "id, name, createdAt",
      snapshots: "id, documentId, workspaceId, createdAt",
      searchHistory: "[workspaceId+key], workspaceId",
      fileSources: "documentId, workspaceId",
      directorySources: "workspaceId",
    });
    const doc = {
      ...newDocument("Keep.md", "# Keep\r\n"),
      workspaceId: "default",
      revision: 7,
    };
    await legacy.table("documents").put(doc);
    await legacy.table("workspaces").put({
      id: "default",
      name: "Existing",
      description: "",
      icon: "📚",
      createdAt: 10,
      initialized: true,
    });
    await legacy.table("workspaceAssets").put({
      workspaceId: "default",
      path: "pixel.png",
      type: "image/png",
      blob: new Uint8Array([0, 255, 17]).buffer,
    });
    legacy.close();
    const current = createStorage(name);
    await current.initialize([]);
    expect(await current.get(doc.id)).toEqual(doc);
    expect(
      new Uint8Array(await (await current.loadAssets())[0].blob.arrayBuffer()),
    ).toEqual(new Uint8Array([0, 255, 17]));
    expect(await current.collections("default")).toEqual([]);
    await current.putCollection("default", search);
    expect(await current.collections("default")).toHaveLength(1);
    current.close();
  });
});

it("round-trips collections through ZIP using paths and fresh IDs, retaining membership under import path collisions", async () => {
  const { storage } = make();
  await storage.initialize([]);
  const doc = await storage.put(newDocument("Guide.md", "# Exact source\r\n"));
  const manual = await storage.putCollection("default", {
    name: "Reading",
    kind: "manual",
    documentIds: [doc.id],
  });
  const tag = await storage.putCollection("default", {
    name: "API",
    kind: "tag",
    tag: "api",
  });
  const saved = await storage.putCollection("default", search);
  const other: ReaderCollection = {
    ...saved,
    kind: "search",
    options: search.options,
    id: "outside",
    workspaceId: "other",
    name: "Private outside",
    query: "do not export",
  };
  const metadata = workspaceMetadata([doc], undefined, [
    manual,
    tag,
    saved,
    other,
  ]);
  expect(metadata).not.toContain(doc.id);
  expect(metadata).not.toContain("workspaceId");
  expect(metadata).not.toContain("do not export");
  expect(metadata).not.toContain("revision");
  const buffer = zipSync({
    [doc.path]: strToU8(doc.content),
    [workspaceMetadataPath]: strToU8(metadata),
  });
  const restored = await readLocalFiles([
    new File([buffer as BlobPart], "backup.zip"),
  ]);
  expect(restored.documents[0].id).not.toBe(doc.id);
  expect(restored.collections[0]).toEqual({
    name: "Reading",
    kind: "manual",
    documentIds: [restored.documents[0].id],
  });
  isolateImport(restored.documents, restored.assets, new Set([doc.path]));
  expect(restored.documents[0].path).toBe("Imports/Batch 2/Guide.md");
  await storage.import(
    restored.documents,
    restored.assets,
    "default",
    restored.collections,
  );
  const imported = (await storage.collections("default")).find(
    (c) => c.name === "Reading (imported 2)",
  )!;
  expect(imported).toMatchObject({
    kind: "manual",
    documentIds: [restored.documents[0].id],
  });
  expect((await storage.get(restored.documents[0].id))?.content).toBe(
    doc.content,
  );
  const again = JSON.parse(
    workspaceMetadata(
      await storage.load(),
      undefined,
      await storage.collections("default"),
    ),
  );
  expect(
    again.collections.find(
      (c: { name: string }) => c.name === "Reading (imported 2)",
    ).documentPaths,
  ).toEqual(["Imports/Batch 2/Guide.md"]);
  // A mixed ZIP + HTML conversion carries definitions through the worker result too.
  const converted = await convertImport([
    { file: new File([buffer as BlobPart], "backup.zip"), path: "backup.zip" },
    {
      file: new File(["<h1>HTML source</h1>"], "Page.html"),
      path: "Page.html",
    },
  ]);
  expect(converted.collections?.[0]).toMatchObject({
    kind: "manual",
    documentIds: [converted.documents[0].id],
  });
  expect(converted.documents).toHaveLength(2);
  storage.close();
});
it("rejects missing archive members before applying document metadata and keeps old backups compatible", () => {
  const doc = newDocument("A.md", "# A");
  const previous = structuredClone(doc);
  expect(() =>
    applyWorkspaceMetadata(
      [doc],
      JSON.stringify({
        format: "openmdviewer",
        version: 1,
        documents: [{ path: doc.path, favorite: true }],
        collections: [
          { name: "Missing", kind: "manual", documentPaths: ["B.md"] },
        ],
      }),
    ),
  ).toThrow(/missing from this archive/);
  expect(doc).toEqual(previous);
  expect(applyWorkspaceMetadata([doc], workspaceMetadata([doc]))).toEqual([]);
});
