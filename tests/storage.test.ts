import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStorage, DocumentConflict } from "../src/lib/storage";
import { newDocument } from "../src/lib/documents";
const names: string[] = [];
const make = () => {
  const name = `test-${crypto.randomUUID()}`;
  names.push(name);
  return { name, storage: createStorage(name) };
};
afterEach(async () => {
  for (const name of names.splice(0)) await Dexie.delete(name);
});
describe("durable workspace storage", () => {
  it("migrates existing documents and assets without losing original bytes", async () => {
    const name = `test-${crypto.randomUUID()}`;
    names.push(name);
    const legacy = new Dexie(name);
    legacy
      .version(2)
      .stores({ documents: "id, path, updatedAt, favorite", assets: "path" });
    const doc = newDocument("Notes/A.md", "# Preserve me");
    await legacy.table("documents").put(doc);
    await legacy.table("assets").put({
      path: "Notes/a.png",
      blob: new Blob(["original"]),
      type: "image/png",
    });
    legacy.close();
    const storage = createStorage(name);
    const result = await storage.initialize([]);
    expect(result.documents[0].content).toBe("# Preserve me");
    expect(result.documents[0].workspaceId).toBe("default");
    expect(await (await storage.loadAssets())[0].blob.text()).toBe("original");
    storage.close();
  });
  it("isolates identically named documents and assets across workspaces", async () => {
    const { storage } = make();
    await storage.initialize([]);
    const other = await storage.createWorkspace("Other");
    await storage.import(
      [newDocument("Readme.md", "first")],
      [{ path: "a.png", blob: new Blob(["one"]), type: "image/png" }],
    );
    await storage.import(
      [newDocument("Readme.md", "second")],
      [{ path: "a.png", blob: new Blob(["two"]), type: "image/png" }],
      other.id,
    );
    expect((await storage.load())[0].content).toBe("first");
    expect((await storage.load(other.id))[0].content).toBe("second");
    expect(await (await storage.loadAssets(other.id))[0].blob.text()).toBe(
      "two",
    );
    storage.close();
  });
  it("keeps edit snapshots and rejects a stale-tab overwrite", async () => {
    const { storage } = make();
    await storage.initialize([]);
    const original = await storage.put(newDocument("A.md", "old"));
    const edited = await storage.save({ ...original, content: "new" }, 0);
    expect(edited.revision).toBe(1);
    expect((await storage.snapshots(original.id))[0].document.content).toBe(
      "old",
    );
    await expect(
      storage.save({ ...original, content: "stale" }, 0),
    ).rejects.toBeInstanceOf(DocumentConflict);
    expect((await storage.get(original.id))?.content).toBe("new");
    storage.close();
  });
  it("soft-deletes and restores without overwriting a replacement path", async () => {
    const { storage } = make();
    await storage.initialize([]);
    const original = await storage.put(newDocument("A.md", "keep"));
    await storage.trash(original, 0);
    expect(await storage.load()).toEqual([]);
    expect((await storage.trashItems()).length).toBe(1);
    await storage.put(newDocument("A.md", "replacement"));
    const restored = await storage.restoreTrash(original.id);
    expect(restored.path).toBe("A (restored 2).md");
    expect((await storage.load()).length).toBe(2);
    storage.close();
  });
  it("does not reseed a deliberately empty workspace", async () => {
    const { storage } = make();
    await storage.initialize([]);
    await storage.initialize([newDocument("Example.md", "example")]);
    expect(await storage.load()).toEqual([]);
    storage.close();
  });
});

it("retains the newest 50 revisions even when timestamps are identical", async () => {
  const { storage } = make();
  await storage.initialize([]);
  let doc = await storage.put(newDocument("Revisions.md", "revision 0"));
  const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
  try {
    for (let i = 1; i <= 55; i++)
      doc = await storage.save(
        { ...doc, content: `revision ${i}` },
        doc.revision || 0,
      );
    const history = await storage.snapshots(doc.id);
    expect(history).toHaveLength(50);
    expect(history[0].document.revision).toBe(54);
    expect(history[49].document.revision).toBe(5);
  } finally {
    clock.mockRestore();
    storage.close();
  }
});
