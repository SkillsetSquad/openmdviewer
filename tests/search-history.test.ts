import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, expect, it, vi } from "vitest";
import { createStorage } from "../src/lib/storage";
import { newDocument } from "../src/lib/documents";
import { defaultSearchOptions } from "../src/lib/search-results";
import {
  searchHistoryEntry,
  searchHistoryLimit,
} from "../src/lib/search-history";

const fuzzy = defaultSearchOptions;
const literal = { ...fuzzy, literal: true, caseSensitive: true };
async function database(
  test: (
    storage: ReturnType<typeof createStorage>,
    name: string,
  ) => Promise<void>,
) {
  const name = `history-${crypto.randomUUID()}`,
    storage = createStorage(name);
  try {
    await test(storage, name);
  } finally {
    storage.close();
    await Dexie.delete(name);
  }
}
describe("local workspace search history", () => {
  it("ignores drafts, commands and oversized queries, and distinguishes actual matching options", () => {
    for (const query of ["", "  ", " > files", "x".repeat(513)])
      expect(searchHistoryEntry(query, fuzzy)).toBeNull();
    expect(searchHistoryEntry(" Case ", fuzzy)?.query).toBe("Case");
    expect(
      searchHistoryEntry("Case", { ...fuzzy, wholeWord: true })?.options
        .literal,
    ).toBe(true);
    expect(searchHistoryEntry("Case", fuzzy)?.key).not.toBe(
      searchHistoryEntry("case", fuzzy)?.key,
    );
    expect(searchHistoryEntry("Case", fuzzy)?.key).not.toBe(
      searchHistoryEntry("Case", literal)?.key,
    );
  });
  it("deduplicates repeated queries, restores matching flags and isolates clear/remove by workspace", async () =>
    database(async (storage) => {
      await storage.rememberSearch("one", " tag:ops ", fuzzy);
      await storage.rememberSearch("one", "tag:ops", fuzzy);
      await storage.rememberSearch("one", "tag:ops", literal);
      await storage.rememberSearch("two", "tag:ops", fuzzy);
      const entries = await storage.searchHistory("one");
      expect(entries).toHaveLength(2);
      expect(entries[0].options).toEqual(literal);
      await storage.removeSearch("one", entries[0].key);
      expect((await storage.searchHistory("one"))[0].options).toEqual(fuzzy);
      await storage.clearSearchHistory("one");
      expect(await storage.searchHistory("one")).toEqual([]);
      expect(await storage.searchHistory("two")).toHaveLength(1);
    }));
  it("serializes concurrent tab writes and keeps the newest 30 even with identical clocks", async () =>
    database(async (storage, name) => {
      const other = createStorage(name),
        clock = vi.spyOn(Date, "now").mockReturnValue(1000);
      try {
        await Promise.all(
          Array.from({ length: 45 }, (_, index) =>
            (index % 2 ? storage : other).rememberSearch(
              "one",
              `query ${index}`,
              fuzzy,
            ),
          ),
        );
        const items = await storage.searchHistory("one");
        expect(items).toHaveLength(searchHistoryLimit);
        expect(new Set(items.map((item) => item.usedAt)).size).toBe(
          searchHistoryLimit,
        );
        await storage.rememberSearch("one", items.at(-1)!.query, fuzzy);
        const reordered = await other.searchHistory("one");
        expect(reordered).toHaveLength(searchHistoryLimit);
        expect(reordered[0].key).toBe(items.at(-1)!.key);
      } finally {
        clock.mockRestore();
        other.close();
      }
    }));
  it("upgrades version 3 additively without changing documents, media, workspaces or revisions", async () =>
    database(async (storage, name) => {
      const old = new Dexie(name);
      old
        .version(3)
        .stores({
          documents: "id, workspaceId, [workspaceId+path], path, updatedAt",
          assets: "path",
          workspaceAssets: "[workspaceId+path], workspaceId",
          workspaces: "id, name, createdAt",
          snapshots: "id, documentId, workspaceId, createdAt",
        });
      const document = {
        ...newDocument("Original.md", "# Original bytes\r\n"),
        workspaceId: "default",
        revision: 7,
      };
      const snapshot = {
        id: "original",
        documentId: document.id,
        workspaceId: "default",
        document,
        createdAt: 1,
        reason: "edit",
      };
      const workspace = {
        id: "default",
        name: "Original workspace",
        createdAt: 1,
        description: "Keep",
        icon: "📚",
        initialized: true,
      };
      await old.table("documents").put(document);
      await old
        .table("workspaceAssets")
        .put({
          workspaceId: "default",
          path: "image.png",
          type: "image/png",
          blob: new Blob(["bytes"]),
        });
      await old.table("workspaces").put(workspace);
      await old.table("snapshots").put(snapshot);
      old.close();
      expect(await storage.get(document.id)).toEqual(document);
      await storage.rememberSearch("default", "Original", literal);
      expect(await storage.get(document.id)).toEqual(document);
      expect(await storage.workspaces()).toEqual([workspace]);
      expect(await storage.snapshots(document.id)).toEqual([snapshot]);
      expect(await (await storage.loadAssets())[0].blob.text()).toBe("bytes");
      storage.close();
      const reopened = createStorage(name);
      try {
        expect((await reopened.searchHistory("default"))[0].query).toBe(
          "Original",
        );
      } finally {
        reopened.close();
      }
    }));
});
