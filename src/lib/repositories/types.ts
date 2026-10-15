export interface RepositoryId {
  owner: string;
  name: string;
}
export interface RepositoryInfo extends RepositoryId {
  defaultBranch: string;
  description: string;
  private: boolean;
}
export interface RepositoryRef {
  name: string;
  kind: "branch" | "tag";
}
export interface RepositoryRefPage {
  refs: RepositoryRef[];
  nextPage: number | null;
}
export interface RepositorySnapshot {
  repository: RepositoryId;
  ref: RepositoryRef;
  commit: string;
  tree: string;
}
export interface RepositoryEntry {
  path: string;
  name: string;
  sha: string;
  kind: "directory" | "file";
  mode: string;
  size: number | null;
}
export interface RepositoryRate {
  remaining: number | null;
  resetAt: number | null;
  retryAfter: number | null;
}
export interface RepositoryAdapter {
  info(signal: AbortSignal): Promise<RepositoryInfo>;
  refs(
    kind: RepositoryRef["kind"],
    page: number,
    signal: AbortSignal,
  ): Promise<RepositoryRefPage>;
  snapshot(
    ref: RepositoryRef,
    signal: AbortSignal,
  ): Promise<RepositorySnapshot>;
  directory(
    snapshot: RepositorySnapshot,
    path: string,
    signal: AbortSignal,
  ): Promise<RepositoryEntry[]>;
  read(
    snapshot: RepositorySnapshot,
    entry: RepositoryEntry,
    signal: AbortSignal,
  ): Promise<Uint8Array>;
}
export interface RepositoryOrigin extends RepositoryId {
  provider: "github";
  ref: RepositoryRef;
  commit: string;
  path: string;
  blob: string;
}
export const repositoryLimits = {
  fileBytes: 5 * 1024 * 1024,
  batchBytes: 50 * 1024 * 1024,
  files: 200,
  entries: 20000,
  requests: 500,
  metadataBytes: 8 * 1024 * 1024,
};
export function repositoryPath(path: string) {
  if (
    !path ||
    path.length > 2000 ||
    /[\\\u0000-\u001f\u007f]/.test(path) ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("The repository path cannot be represented safely.");
  return path;
}
export function repositoryId(value: string): RepositoryId {
  let raw = value.trim();
  if (/^https:\/\//i.test(raw)) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new Error("Enter owner/repository or its GitHub repository URL.");
    }
    if (
      url.origin !== "https://github.com" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error(
        "Use an HTTPS github.com repository URL without credentials or query parameters.",
      );
    raw = url.pathname.replace(/^\/|\/$/g, "");
  }
  const parts = raw.split("/");
  if (parts.length === 2) parts[1] = parts[1].replace(/\.git$/i, "");
  if (
    parts.length !== 2 ||
    !parts.every(
      (part) => /^[a-z\d_.-]+$/i.test(part) && ![".", ".."].includes(part),
    ) ||
    parts[0].length > 100 ||
    parts[1].length > 100
  )
    throw new Error(
      "Enter owner/repository, such as SkillsetSquad/openmdviewer.",
    );
  return { owner: parts[0], name: parts[1] };
}
export function gitSha(value: unknown): value is string {
  return typeof value === "string" && /^[a-f\d]{40}$/.test(value);
}
export function parseRepositoryOrigin(
  value: unknown,
): RepositoryOrigin | undefined {
  if (!value || typeof value !== "object") return;
  const data = value as Partial<RepositoryOrigin>;
  try {
    if (
      data.provider !== "github" ||
      !gitSha(data.commit) ||
      !gitSha(data.blob) ||
      typeof data.owner !== "string" ||
      typeof data.name !== "string" ||
      typeof data.path !== "string" ||
      !data.ref ||
      !["branch", "tag"].includes(data.ref.kind) ||
      typeof data.ref.name !== "string" ||
      !data.ref.name ||
      data.ref.name.length > 1000 ||
      /[\u0000-\u001f\u007f]/.test(data.ref.name)
    )
      return;
    const id = repositoryId(`${data.owner}/${data.name}`);
    return {
      ...id,
      provider: "github",
      ref: { kind: data.ref.kind, name: data.ref.name },
      commit: data.commit,
      blob: data.blob,
      path: repositoryPath(data.path),
    };
  } catch {
    return;
  }
}
export function repositoryFileURL(origin: RepositoryOrigin) {
  return `https://github.com/${encodeURIComponent(origin.owner)}/${encodeURIComponent(origin.name)}/blob/${origin.commit}/${origin.path.split("/").map(encodeURIComponent).join("/")}`;
}
