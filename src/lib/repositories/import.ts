import { newDocument, supportedFile } from "../documents";
import { mediaType } from "../import";
import type { LocalWorkspace, ReaderAsset, ReaderDocument } from "../types";
import type {
  RepositoryAdapter,
  RepositoryEntry,
  RepositorySnapshot,
} from "./types";
import { repositoryLimits, repositoryPath } from "./types";
import { repositoryText } from "./github";
export function repositoryTextDocument(path: string) {
  return (
    supportedFile(path) ||
    /^(?:readme|license|copying|changelog|contributing|security|authors|notice)$/i.test(
      path.split("/").at(-1) || "",
    )
  );
}
export function repositoryEntrySupported(entry: RepositoryEntry) {
  return (
    entry.kind === "file" &&
    ["100644", "100755"].includes(entry.mode) &&
    (repositoryTextDocument(entry.name) || !!mediaType(entry.name))
  );
}
export async function repositoryImport(
  adapter: RepositoryAdapter,
  snapshot: RepositorySnapshot,
  entries: RepositoryEntry[],
  signal: AbortSignal,
  progress: (message: string) => void = () => {},
) {
  if (!entries.length || entries.length > repositoryLimits.files)
    throw new Error("Select between 1 and 200 repository files.");
  if (!entries.some((entry) => repositoryTextDocument(entry.path)))
    throw new Error("Select at least one Markdown or text document.");
  const paths = new Set<string>();
  let bytes = 0;
  const documents: ReaderDocument[] = [],
    assets: ReaderAsset[] = [];
  for (const [index, entry] of entries.entries()) {
    signal.throwIfAborted();
    repositoryPath(entry.path);
    if (!repositoryEntrySupported(entry) || paths.has(entry.path))
      throw new Error(
        "Selection contains unsupported or duplicate repository paths.",
      );
    paths.add(entry.path);
    progress(`Reading ${index + 1} of ${entries.length}: ${entry.path}`);
    const data = await adapter.read(snapshot, entry, signal);
    bytes += data.length;
    if (bytes > repositoryLimits.batchBytes)
      throw new Error(
        "Selected files exceed the 50 MB repository import limit.",
      );
    if (repositoryTextDocument(entry.path)) {
      const doc = newDocument(entry.path, repositoryText(data));
      doc.repositorySource = {
        ...snapshot.repository,
        provider: "github",
        ref: { ...snapshot.ref },
        commit: snapshot.commit,
        path: entry.path,
        blob: entry.sha,
      };
      documents.push(doc);
    } else {
      const type = mediaType(entry.path)!;
      assets.push({
        path: entry.path,
        blob: new Blob([data as BlobPart], { type }),
        type,
      });
    }
  }
  signal.throwIfAborted();
  const workspace: LocalWorkspace = {
    id: crypto.randomUUID(),
    name: `${snapshot.repository.owner}/${snapshot.repository.name} · ${snapshot.ref.name}`.slice(
      0,
      200,
    ),
    description: `GitHub ${snapshot.ref.kind} ${snapshot.ref.name} at commit ${snapshot.commit}. Imported local snapshot.`,
    icon: "📦",
    createdAt: Date.now(),
    initialized: true,
  };
  return { workspace, documents, assets, bytes };
}
