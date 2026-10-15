import { expect, it } from "vitest";
import {
  repositoryDiff,
  compareRepositoryFile,
} from "../src/lib/repositories/compare";
import type { RepositoryAdapter } from "../src/lib/repositories/types";
it("preserves exact line semantics, counts additions/removals and records both line numbers", () => {
  const result = repositoryDiff("# Title\nold\nend\n", "# Title\nnew\nend\n");
  expect(result.added).toBe(1);
  expect(result.removed).toBe(1);
  expect(result.rows).toEqual([
    { kind: "unchanged", before: 1, after: 1, text: "# Title" },
    { kind: "removed", before: 2, after: null, text: "old" },
    { kind: "added", before: null, after: 2, text: "new" },
    { kind: "unchanged", before: 3, after: 3, text: "end" },
  ]);
  expect(repositoryDiff("a", "a").identical).toBe(true);
  expect(repositoryDiff("a", "a\n").identical).toBe(false);
  expect(repositoryDiff("a\r\n", "a\n").identical).toBe(false);
  expect(repositoryDiff("", "").rows).toEqual([]);
  expect(repositoryDiff("", "a").added).toBe(1);
});
it("rejects size, line-count and edit-complexity overflows rather than truncating results", () => {
  expect(() => repositoryDiff("a".repeat(100001), "")).toThrow(/100,000/);
  expect(() => repositoryDiff("\n".repeat(4000), "")).toThrow(/4,000/);
  expect(() =>
    repositoryDiff(
      Array.from({ length: 1100 }, (_, i) => `old${i}`).join("\n"),
      Array.from({ length: 1100 }, (_, i) => `new${i}`).join("\n"),
    ),
  ).toThrow(/complexity/);
});
it("resolves and reads the exact same path through the verified adapter, rejects absent paths and honors cancellation", async () => {
  const snapshot = {
    repository: { owner: "example", name: "manual" },
    ref: { kind: "tag" as const, name: "v1" },
    commit: "a".repeat(40),
    tree: "b".repeat(40),
  };
  const entry = {
    path: "docs/Guide.md",
    name: "Guide.md",
    kind: "file" as const,
    mode: "100644",
    sha: "c".repeat(40),
    size: 5,
  };
  const calls: string[] = [];
  const adapter: RepositoryAdapter = {
    info: async () => ({
      ...snapshot.repository,
      defaultBranch: "main",
      description: "",
      private: false,
    }),
    refs: async () => ({ refs: [], nextPage: null }),
    snapshot: async () => snapshot,
    directory: async (pinned, path) => {
      expect(pinned).toBe(snapshot);
      calls.push(path);
      return [entry];
    },
    read: async (pinned, file) => {
      expect(pinned).toBe(snapshot);
      expect(file).toBe(entry);
      return new TextEncoder().encode("# New");
    },
  };
  const signal = new AbortController().signal;
  expect(
    await compareRepositoryFile(adapter, entry.path, snapshot.ref, signal),
  ).toEqual({ snapshot, text: "# New", blob: entry.sha });
  expect(calls).toEqual(["docs"]);
  await expect(
    compareRepositoryFile(adapter, "missing.md", snapshot.ref, signal),
  ).rejects.toThrow(/absent/);
  const abort = new AbortController();
  abort.abort();
  await expect(
    compareRepositoryFile(adapter, entry.path, snapshot.ref, abort.signal),
  ).rejects.toThrow();
});
