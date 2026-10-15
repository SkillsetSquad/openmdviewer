import { repositoryText } from "./github";
import {
  repositoryPath,
  type RepositoryAdapter,
  type RepositoryRef,
  type RepositorySnapshot,
} from "./types";

export { repositoryDiff } from "./line-diff";
export async function compareRepositoryFile(
  adapter: RepositoryAdapter,
  path: string,
  ref: RepositoryRef,
  signal: AbortSignal,
): Promise<{ snapshot: RepositorySnapshot; text: string; blob: string }> {
  repositoryPath(path);
  const snapshot = await adapter.snapshot(ref, signal);
  const entries = await adapter.directory(
    snapshot,
    path.split("/").slice(0, -1).join("/"),
    signal,
  );
  const entry = entries.find((item) => item.path === path);
  if (!entry)
    throw new Error(
      "This path is absent from the comparison commit. Renames are not inferred; choose another reference or browse its files.",
    );
  const bytes = await adapter.read(snapshot, entry, signal);
  signal.throwIfAborted();
  return { snapshot, text: repositoryText(bytes), blob: entry.sha };
}
