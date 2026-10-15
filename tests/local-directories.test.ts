import { expect, it } from "vitest";
import {
  directoryAdditions,
  directoryChanges,
  directoryImport,
  directoryLimits,
  scanDirectory,
} from "../src/lib/local-directories";
import { contentHash } from "../src/lib/local-files";
import type { LocalDirectoryHandle } from "../src/lib/local-directory-types";
import type { LocalFileHandle } from "../src/lib/local-file-types";
const file = (name: string, text: string): LocalFileHandle =>
  ({
    kind: "file",
    name,
    getFile: async () => new File([text], name),
  }) as LocalFileHandle;
const folder = (
  name: string,
  children: (LocalFileHandle | LocalDirectoryHandle)[],
): LocalDirectoryHandle =>
  ({
    kind: "directory",
    name,
    async *values() {
      yield* children;
    },
  }) as unknown as LocalDirectoryHandle;
const signal = () => new AbortController().signal;
it("preserves nested relative paths and strict text while caching supported media without reading excluded directories", async () => {
  const root = folder("Docs", [
    file("README.md", "\ufeff# Root\r\n"),
    folder("guide", [
      file("Start.mdx", "# Start"),
      file("map.svg", '<svg onload="evil()"/>'),
    ]),
    folder(".git", [file("bad.md", "\0")]),
    folder("node_modules", [file("bad.md", "\0")]),
    file("credentials.env", "private"),
  ]);
  const scan = await scanDirectory(root, signal());
  expect(scan.documents.map((item) => item.path)).toEqual([
    "guide/Start.mdx",
    "README.md",
  ]);
  expect(scan.documents[1].disk).toMatchObject({
    content: "# Root\r\n",
    bom: true,
    lineEnding: "crlf",
  });
  expect(await scan.assets[0].asset.blob.text()).toBe('<svg onload="evil()"/>');
  expect(scan.assets[0].asset.path).toBe("guide/map.svg");
  expect(scan.skipped).toBe(3);
  const bundle = await directoryImport(root, scan);
  expect(bundle.files[0].directoryId).toBe(bundle.workspace.id);
  expect(
    bundle.source.entries.find((item) => item.path === "README.md")?.documentId,
  ).toBe(bundle.documents[1].id);
});
it("rejects partial scans on invalid UTF-8/NUL, ambiguous names, file/byte/entry/depth limits, and cancellation", async () => {
  await expect(
    scanDirectory(
      folder("Root", [file("okay.md", "# Fine"), file("bad.md", "\0")]),
      signal(),
    ),
  ).rejects.toThrow("NUL");
  await expect(
    scanDirectory(folder("Root", [file("a\\b.md", "x")]), signal()),
  ).rejects.toThrow("name");
  for (const limits of [
    { ...directoryLimits, bytes: 1 },
    { ...directoryLimits, files: 0 },
    { ...directoryLimits, entries: 0 },
    { ...directoryLimits, depth: -1 },
  ])
    await expect(
      scanDirectory(
        folder("Root", [file("README.md", "# Text")]),
        signal(),
        () => {},
        limits,
      ),
    ).rejects.toThrow("limit");
  const abort = new AbortController();
  abort.abort();
  await expect(
    scanDirectory(folder("Root", []), abort.signal),
  ).rejects.toThrow();
  const large = {
    kind: "file",
    name: "large.md",
    getFile: async () => ({ size: 31 * 1024 * 1024 }),
  } as LocalFileHandle;
  await expect(
    scanDirectory(folder("Root", [large]), signal()),
  ).rejects.toThrow("30 MB");
  const invalid = {
    kind: "file",
    name: "bad.md",
    getFile: async () => new File([new Uint8Array([0xff])], "bad.md"),
  } as LocalFileHandle;
  await expect(
    scanDirectory(folder("Root", [invalid]), signal()),
  ).rejects.toThrow("UTF-8");
});
it("distinguishes both-side edits, missing files, disconnected copies, and saved baselines without mutating cached contents", async () => {
  const root = folder("Root", [
    file("A.md", "original"),
    file("B.md", "original"),
    file("C.md", "original"),
    file("D.md", "original"),
  ]);
  const bundle = await directoryImport(
    root,
    await scanDirectory(root, signal()),
  );
  const docs = bundle.documents.map((doc) =>
    doc.path === "A.md" ? { ...doc, content: "browser" } : doc,
  );
  const scan = await scanDirectory(
    folder("Root", [
      file("A.md", "external"),
      file("B.md", "external"),
      file("D.md", "original"),
      file("New.md", "new"),
    ]),
    signal(),
  );
  const changes = await directoryChanges(
    bundle.source,
    scan,
    docs,
    bundle.files.filter(
      (file) => file.documentId !== docs.find((doc) => doc.path === "D.md")!.id,
    ),
  );
  expect(changes.map((item) => [item.path, item.state])).toEqual([
    ["A.md", "both changed"],
    ["B.md", "disk changed"],
    ["C.md", "missing"],
    ["D.md", "disconnected"],
    ["New.md", "new"],
  ]);
  expect(docs.find((doc) => doc.path === "A.md")?.content).toBe("browser");
  const updated = bundle.files.map((file) => ({
    ...file,
    diskHash: scan.documents.find((item) => item.path === "A.md")!.disk.hash,
    browserHash: "old",
  }));
  expect(
    (await directoryChanges(bundle.source, scan, docs, updated))[0].state,
  ).toBe("browser changed");
  updated[0].browserHash = await contentHash("browser");
  expect(
    (await directoryChanges(bundle.source, scan, docs, updated))[0].state,
  ).toBe("unchanged");
});
it("prepares only new paths and retains missing-file baselines, browser identities and original hashes", async () => {
  const root = folder("Root", [file("A.md", "original")]);
  const bundle = await directoryImport(
    root,
    await scanDirectory(root, signal()),
  );
  const scan = await scanDirectory(
    folder("Root", [file("New.md", "new"), file("image.png", "pixels")]),
    signal(),
  );
  const additions = await directoryAdditions(bundle.source, scan);
  expect(additions.documents.map((doc) => doc.path)).toEqual(["New.md"]);
  expect(additions.source.entries[0]).toEqual(bundle.source.entries[0]);
  expect(additions.source.workspaceId).toBe(bundle.workspace.id);
  expect(additions.files[0]).toMatchObject({
    workspaceId: bundle.workspace.id,
    directoryId: bundle.workspace.id,
    documentId: additions.documents[0].id,
  });
});

it("cancels report classification before hashing cached documents", async () => {
  const root = folder("Root", [file("A.md", "original")]);
  const scan = await scanDirectory(root, signal());
  const bundle = await directoryImport(root, scan);
  const abort = new AbortController();
  abort.abort();
  await expect(
    directoryChanges(
      bundle.source,
      scan,
      bundle.documents,
      bundle.files,
      abort.signal,
    ),
  ).rejects.toThrow();
});
