import { newDocument, supportedFile } from "./documents";
import { mediaType } from "./import";
import {
  bytesHash,
  contentHash,
  localFileLimit,
  readDiskFile,
} from "./local-files";
import type { DiskFile } from "./local-files";
import type { LocalFileHandle, LocalFileSource } from "./local-file-types";
import type {
  DirectoryImport,
  LocalDirectoryHandle,
  LocalDirectorySource,
} from "./local-directory-types";
import type { ReaderAsset, ReaderDocument } from "./types";

export const directoryLimits = {
  entries: 50000,
  files: 10000,
  bytes: 100 * 1024 * 1024,
  depth: 64,
};
export const skippedDirectories = new Set([".git", "node_modules", ".next"]);
export interface DirectoryScan {
  documents: { path: string; disk: DiskFile; handle: LocalFileHandle }[];
  assets: { asset: ReaderAsset; hash: string }[];
  visited: number;
  skipped: number;
}
/** Read only. A partial or failed scan never becomes an import or a missing-file report. */
export async function scanDirectory(
  root: LocalDirectoryHandle,
  signal: AbortSignal,
  progress: (visited: number) => void = () => {},
  limits = directoryLimits,
): Promise<DirectoryScan> {
  const result: DirectoryScan = {
    documents: [],
    assets: [],
    visited: 0,
    skipped: 0,
  };
  const seen = new Set<string>();
  let bytes = 0;
  async function walk(
    directory: LocalDirectoryHandle,
    prefix: string,
    depth: number,
  ) {
    signal.throwIfAborted();
    if (depth > limits.depth)
      throw new Error("Folder nesting exceeds the 64-level scan limit.");
    for await (const handle of directory.values()) {
      signal.throwIfAborted();
      if (++result.visited > limits.entries)
        throw new Error("Folder exceeds the 50,000-entry scan limit.");
      if (result.visited % 25 === 0) progress(result.visited);
      // Do not silently rewrite filesystem names into different browser paths.
      if (
        !handle.name ||
        /[\\/\0]/.test(handle.name) ||
        handle.name === "." ||
        handle.name === ".."
      )
        throw new Error(
          "A folder entry has a name that cannot be represented safely.",
        );
      const path = prefix + handle.name;
      if (handle.kind === "directory") {
        if (skippedDirectories.has(handle.name)) {
          result.skipped++;
          continue;
        }
        await walk(handle as LocalDirectoryHandle, path + "/", depth + 1);
        continue;
      }
      if (!supportedFile(path) && !mediaType(path)) {
        result.skipped++;
        continue;
      }
      if (seen.has(path)) throw new Error(`Duplicate folder path: ${path}`);
      seen.add(path);
      if (seen.size > limits.files)
        throw new Error("Folder exceeds the 10,000 supported-file limit.");
      const file = await handle.getFile();
      if (file.size > localFileLimit)
        throw new Error(`${path} exceeds the 30 MB per-file limit.`);
      bytes += file.size;
      if (bytes > limits.bytes)
        throw new Error("Folder exceeds the 100 MB scan limit.");
      if (supportedFile(path)) {
        const disk = await readDiskFile(handle);
        // Recheck the size of the actual snapshot, since another application may have changed it.
        bytes += disk.size - file.size;
        if (bytes > limits.bytes)
          throw new Error("Folder exceeds the 100 MB scan limit.");
        result.documents.push({
          path,
          disk,
          handle: handle as LocalFileHandle,
        });
      } else {
        const data = new Uint8Array(await file.arrayBuffer());
        result.assets.push({
          asset: {
            path,
            type: mediaType(path),
            blob: new Blob([data as BlobPart], { type: mediaType(path) }),
          },
          hash: await bytesHash(data),
        });
      }
    }
  }
  await walk(root, "", 0);
  signal.throwIfAborted();
  result.documents.sort((a, b) => a.path.localeCompare(b.path));
  result.assets.sort((a, b) => a.asset.path.localeCompare(b.asset.path));
  progress(result.visited);
  return result;
}
export async function directoryImport(
  handle: LocalDirectoryHandle,
  scan: DirectoryScan,
): Promise<DirectoryImport> {
  const id = crypto.randomUUID();
  const documents: ReaderDocument[] = [],
    files: LocalFileSource[] = [];
  for (const item of scan.documents) {
    const doc = {
      ...newDocument(item.path, item.disk.content),
      workspaceId: id,
      revision: 0,
    };
    documents.push(doc);
    files.push({
      documentId: doc.id,
      workspaceId: id,
      directoryId: id,
      token: crypto.randomUUID(),
      name: item.disk.name,
      handle: item.handle,
      diskHash: item.disk.hash,
      browserHash: await contentHash(item.disk.content),
      checkedAt: Date.now(),
    });
  }
  return {
    workspace: {
      id,
      name: handle.name,
      icon: "📂",
      description:
        "Connected local folder. Browser autosave; explicit disk saves.",
      createdAt: Date.now(),
      initialized: true,
    },
    source: {
      workspaceId: id,
      token: crypto.randomUUID(),
      name: handle.name,
      handle,
      entries: [
        ...scan.documents.map((item, i) => ({
          path: item.path,
          hash: item.disk.hash,
          documentId: documents[i].id,
        })),
        ...scan.assets.map((item) => ({
          path: item.asset.path,
          hash: item.hash,
        })),
      ],
      checkedAt: Date.now(),
    },
    documents,
    files,
    assets: scan.assets.map((item) => ({ ...item.asset, workspaceId: id })),
  };
}
export interface DirectoryChange {
  path: string;
  state:
    | "new"
    | "unchanged"
    | "disk changed"
    | "both changed"
    | "browser changed"
    | "missing"
    | "disconnected";
  documentId?: string;
}
export async function directoryChanges(
  source: LocalDirectorySource,
  scan: DirectoryScan,
  docs: ReaderDocument[],
  files: LocalFileSource[],
  signal?: AbortSignal,
) {
  const current = new Map([
    ...scan.documents.map((item) => [item.path, item.disk.hash] as const),
    ...scan.assets.map((item) => [item.asset.path, item.hash] as const),
  ]);
  const changes: DirectoryChange[] = [];
  const documents = new Map(docs.map((doc) => [doc.id, doc])),
    links = new Map(files.map((file) => [file.documentId, file]));
  for (const entry of source.entries) {
    signal?.throwIfAborted();
    const diskHash = current.get(entry.path);
    current.delete(entry.path);
    if (!entry.documentId) {
      changes.push({
        path: entry.path,
        state:
          diskHash === undefined
            ? "missing"
            : diskHash !== entry.hash
              ? "disk changed"
              : "unchanged",
      });
      continue;
    }
    const doc = documents.get(entry.documentId),
      link = links.get(entry.documentId);
    if (!doc || doc.deletedAt || link?.directoryId !== source.workspaceId) {
      changes.push({ ...entry, state: "disconnected" });
      continue;
    }
    const browserChanged =
      (await contentHash(doc.content)) !== link.browserHash;
    changes.push({
      path: entry.path,
      documentId: doc.id,
      state:
        diskHash === undefined
          ? "missing"
          : diskHash !== link.diskHash
            ? browserChanged
              ? "both changed"
              : "disk changed"
            : browserChanged
              ? "browser changed"
              : "unchanged",
    });
  }
  for (const path of current.keys()) changes.push({ path, state: "new" });
  signal?.throwIfAborted();
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}
/** Prepare only new paths. Existing browser/disk versions and missing files remain untouched. */
export async function directoryAdditions(
  source: LocalDirectorySource,
  scan: DirectoryScan,
) {
  const known = new Set(source.entries.map((entry) => entry.path));
  const prepared = await directoryImport(source.handle, {
    ...scan,
    documents: scan.documents.filter((item) => !known.has(item.path)),
    assets: scan.assets.filter((item) => !known.has(item.asset.path)),
  });
  return {
    ...prepared,
    workspace: { ...prepared.workspace, id: source.workspaceId },
    source: {
      ...source,
      token: crypto.randomUUID(),
      entries: [...source.entries, ...prepared.source.entries],
      checkedAt: Date.now(),
    },
    documents: prepared.documents.map((doc) => ({
      ...doc,
      workspaceId: source.workspaceId,
    })),
    assets: prepared.assets.map((asset) => ({
      ...asset,
      workspaceId: source.workspaceId,
    })),
    files: prepared.files.map((file) => ({
      ...file,
      workspaceId: source.workspaceId,
      directoryId: source.workspaceId,
    })),
  };
}
