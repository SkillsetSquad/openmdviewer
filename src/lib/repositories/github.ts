import {
  gitSha,
  repositoryId,
  repositoryPath,
  repositoryLimits,
  type RepositoryAdapter,
  type RepositoryEntry,
  type RepositoryInfo,
  type RepositoryRef,
  type RepositoryRefPage,
  type RepositorySnapshot,
  type RepositoryRate,
  type RepositoryId,
} from "./types";
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("GitHub returned an unexpected response.");
  return value as Record<string, unknown>;
};
const text = (value: unknown) => {
  if (typeof value !== "string")
    throw new Error("GitHub returned an unexpected text field.");
  return value;
};
const sha = (value: unknown) => {
  if (!gitSha(value)) throw new Error("GitHub returned an invalid object ID.");
  return value;
};
function headerNumber(headers: Headers, key: string) {
  const raw = headers.get(key);
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}
export class GitHubRepository implements RepositoryAdapter {
  private root: string;
  private requests = 0;
  private blockedUntil = 0;
  private cachedTrees = new Map<string, RepositoryEntry[]>();
  private cachedBlobs = new Map<string, Uint8Array>();
  private blobBytes = 0;
  constructor(
    readonly id: RepositoryId,
    private token = "",
    private onRate: (rate: RepositoryRate) => void = () => {},
  ) {
    const checked = repositoryId(`${id.owner}/${id.name}`);
    this.root = `/repos/${encodeURIComponent(checked.owner)}/${encodeURIComponent(checked.name)}`;
    if (token.length > 1024 || /[\s\u0000-\u001f\u007f]/.test(token))
      throw new Error(
        "The token contains unsupported whitespace or control characters.",
      );
  }
  dispose() {
    this.token = "";
    this.cachedBlobs.clear();
    this.cachedTrees.clear();
    this.blobBytes = 0;
  }
  private async request(path: string, signal: AbortSignal, raw = false) {
    signal.throwIfAborted();
    if (Date.now() < this.blockedUntil)
      throw new Error(
        `GitHub rate limit is still active. Retry after ${new Date(this.blockedUntil).toISOString()}.`,
      );
    if (++this.requests > repositoryLimits.requests)
      throw new Error(
        "This browsing session reached its 500-request limit. Reopen the repository to continue.",
      );
    const controller = new AbortController(),
      abort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30000);
    try {
      let response: Response;
      try {
        response = await fetch("https://api.github.com" + path, {
          method: "GET",
          mode: "cors",
          credentials: "omit",
          cache: "no-store",
          redirect: "error",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
          headers: {
            Accept: raw
              ? "application/vnd.github.raw+json"
              : "application/vnd.github+json",
            "X-GitHub-Api-Version": "2026-03-10",
            ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          },
        });
      } catch (error) {
        if (controller.signal.aborted) throw error;
        throw new Error(
          "GitHub could not be reached. Check connectivity, CORS and the repository URL. Moved repositories need their current URL.",
        );
      }
      const remaining = headerNumber(response.headers, "x-ratelimit-remaining"),
        reset = headerNumber(response.headers, "x-ratelimit-reset"),
        retry = headerNumber(response.headers, "retry-after");
      this.onRate({
        remaining,
        resetAt: reset === null ? null : reset * 1000,
        retryAfter: retry,
      });
      if (remaining === 0 && reset !== null) this.blockedUntil = reset * 1000;
      if (
        (response.status === 429 || response.status === 403) &&
        retry !== null
      )
        this.blockedUntil = Math.max(
          this.blockedUntil,
          Date.now() + retry * 1000,
        );
      if (!response.ok) {
        await response.body?.cancel();
        if (
          response.status === 429 ||
          (response.status === 403 && remaining === 0)
        )
          throw new Error(
            `GitHub rate limit reached.${reset !== null ? ` Retry after ${new Date(reset * 1000).toISOString()}.` : retry !== null ? ` Retry after ${retry} seconds.` : " Retry later."}`,
          );
        if (response.status === 401)
          throw new Error(
            "GitHub rejected this token. Replace it or browse public repositories without one.",
          );
        if (response.status === 404)
          throw new Error(
            "GitHub did not find this repository, reference or file, or the token cannot read it.",
          );
        if (response.status === 409)
          throw new Error("This repository has no available commit to browse.");
        if (response.status === 403)
          throw new Error(
            "GitHub denied this request. Check token permissions, organization access and API limits.",
          );
        throw new Error(`GitHub request failed (HTTP ${response.status}).`);
      }
      const limit = raw
          ? repositoryLimits.fileBytes
          : repositoryLimits.metadataBytes,
        length = headerNumber(response.headers, "content-length");
      if (length !== null && length > limit) {
        await response.body?.cancel();
        throw new Error("GitHub response exceeds the local read limit.");
      }
      if (!response.body)
        throw new Error("GitHub returned no readable response body.");
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > limit) {
            await reader.cancel();
            throw new Error("GitHub response exceeds the local read limit.");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      controller.signal.throwIfAborted();
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return { bytes, headers: response.headers };
    } catch (error) {
      if (signal.aborted)
        throw new DOMException("Repository request canceled.", "AbortError");
      if (timedOut)
        throw new Error(
          "GitHub request exceeded the 30-second read limit. Retry when connectivity improves.",
        );
      throw error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  }
  private async json(path: string, signal: AbortSignal) {
    const result = await this.request(path, signal);
    try {
      return {
        data: JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(result.bytes),
        ) as unknown,
        headers: result.headers,
      };
    } catch {
      throw new Error("GitHub returned invalid JSON.");
    }
  }
  async info(signal: AbortSignal): Promise<RepositoryInfo> {
    const { data } = await this.json(this.root, signal),
      value = object(data);
    if (typeof value.private !== "boolean")
      throw new Error(
        "GitHub returned an unexpected repository visibility field.",
      );
    return {
      ...this.id,
      defaultBranch: text(value.default_branch),
      description:
        typeof value.description === "string" ? value.description : "",
      private: value.private === true,
    };
  }
  async refs(
    kind: RepositoryRef["kind"],
    page: number,
    signal: AbortSignal,
  ): Promise<RepositoryRefPage> {
    if (!Number.isSafeInteger(page) || page < 1 || page > 20)
      throw new Error(
        "Reference browsing supports up to 2,000 branches or tags.",
      );
    const { data, headers } = await this.json(
      `${this.root}/${kind === "branch" ? "branches" : "tags"}?per_page=100&page=${page}`,
      signal,
    );
    if (!Array.isArray(data) || data.length > 100)
      throw new Error("GitHub returned an unexpected reference list.");
    const refs = data.map((item) => {
      const name = text(object(item).name);
      if (!name || name.length > 1000 || /[\u0000-\u001f\u007f]/.test(name))
        throw new Error("GitHub returned an invalid reference name.");
      return { name, kind };
    });
    return {
      refs,
      nextPage: headers.get("link")?.includes('rel="next"') ? page + 1 : null,
    };
  }
  async snapshot(
    ref: RepositoryRef,
    signal: AbortSignal,
  ): Promise<RepositorySnapshot> {
    if (
      !["branch", "tag"].includes(ref.kind) ||
      !ref.name ||
      ref.name.length > 1000 ||
      /[\u0000-\u001f\u007f]/.test(ref.name)
    )
      throw new Error("Choose a valid branch or tag.");
    const qualified = `${ref.kind === "branch" ? "heads" : "tags"}/${ref.name}`;
    const { data } = await this.json(
        `${this.root}/commits/${encodeURIComponent(qualified)}?per_page=1`,
        signal,
      ),
      value = object(data),
      commit = object(value.commit),
      tree = object(commit.tree);
    return {
      repository: { ...this.id },
      ref: { ...ref },
      commit: sha(value.sha),
      tree: sha(tree.sha),
    };
  }
  private async tree(id: string, prefix: string, signal: AbortSignal) {
    if (!gitSha(id)) throw new Error("Invalid repository tree ID.");
    const key = `${id}:${prefix}`;
    if (this.cachedTrees.has(key)) return this.cachedTrees.get(key)!;
    const { data } = await this.json(`${this.root}/git/trees/${id}`, signal),
      value = object(data);
    if (value.truncated !== false)
      throw new Error(
        "GitHub returned a truncated directory. It cannot be treated as a complete listing.",
      );
    if (
      sha(value.sha) !== id ||
      !Array.isArray(value.tree) ||
      value.tree.length > repositoryLimits.entries
    )
      throw new Error(
        "This directory exceeds the 20,000-entry limit or has an unexpected tree ID.",
      );
    const paths = new Set<string>();
    const entries: RepositoryEntry[] = value.tree
      .flatMap((item) => {
        const entry = object(item),
          name = text(entry.path);
        repositoryPath(name);
        if (name.includes("/"))
          throw new Error(
            "GitHub returned an unexpected nested directory entry.",
          );
        const path = prefix ? `${prefix}/${name}` : name;
        repositoryPath(path);
        if (paths.has(path))
          throw new Error("GitHub returned duplicate directory paths.");
        paths.add(path);
        const mode = text(entry.mode),
          kind =
            entry.type === "tree"
              ? "directory"
              : entry.type === "blob" || entry.type === "commit"
                ? "file"
                : null;
        if (!kind || (kind === "directory" && mode !== "040000"))
          throw new Error(
            "GitHub returned an unsupported Git entry type or directory mode.",
          );
        const size =
          typeof entry.size === "number" &&
          Number.isSafeInteger(entry.size) &&
          entry.size >= 0
            ? entry.size
            : null;
        return [
          {
            path,
            name,
            sha: sha(entry.sha),
            kind,
            mode,
            size,
          } as RepositoryEntry,
        ];
      })
      .sort((a, b) =>
        a.kind !== b.kind
          ? a.kind === "directory"
            ? -1
            : 1
          : a.name.localeCompare(b.name),
      );
    this.cachedTrees.set(key, entries);
    return entries;
  }
  async directory(
    snapshot: RepositorySnapshot,
    path: string,
    signal: AbortSignal,
  ): Promise<RepositoryEntry[]> {
    signal.throwIfAborted();
    if (
      snapshot.repository.owner.toLowerCase() !== this.id.owner.toLowerCase() ||
      snapshot.repository.name.toLowerCase() !== this.id.name.toLowerCase() ||
      !gitSha(snapshot.commit) ||
      !gitSha(snapshot.tree)
    )
      throw new Error(
        "The snapshot belongs to a different or invalid repository.",
      );
    let id = snapshot.tree,
      prefix = "";
    if (path) {
      repositoryPath(path);
      for (const part of path.split("/")) {
        const entries = await this.tree(id, prefix, signal),
          child = entries.find(
            (e) => e.name === part && e.kind === "directory",
          );
        if (!child)
          throw new Error(
            "This directory is not present in the pinned commit.",
          );
        id = child.sha;
        prefix = prefix ? `${prefix}/${part}` : part;
      }
    }
    return this.tree(id, path, signal);
  }
  async read(
    snapshot: RepositorySnapshot,
    entry: RepositoryEntry,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    repositoryPath(entry.path);
    if (
      entry.kind !== "file" ||
      !["100644", "100755"].includes(entry.mode) ||
      !gitSha(entry.sha)
    )
      throw new Error(
        "Only regular repository files can be read. Symlinks and submodules are not followed.",
      );
    const directory = entry.path.split("/").slice(0, -1).join("/"),
      expected = (await this.directory(snapshot, directory, signal)).find(
        (e) => e.path === entry.path,
      );
    if (expected?.sha !== entry.sha || expected.mode !== entry.mode)
      throw new Error(
        "The file does not belong to the pinned repository snapshot.",
      );
    if (entry.size !== null && entry.size > repositoryLimits.fileBytes)
      throw new Error("This file exceeds the 5 MB repository read limit.");
    if (this.cachedBlobs.has(entry.sha))
      return this.cachedBlobs.get(entry.sha)!.slice();
    const { bytes } = await this.request(
      `${this.root}/git/blobs/${entry.sha}`,
      signal,
      true,
    );
    if (entry.size !== null && entry.size !== bytes.length)
      throw new Error("The file size differs from its pinned Git tree.");
    if (!crypto.subtle)
      throw new Error("Verified repository reads require HTTPS or localhost.");
    const prefix = new TextEncoder().encode(`blob ${bytes.length}\0`),
      objectBytes = new Uint8Array(prefix.length + bytes.length);
    objectBytes.set(prefix);
    objectBytes.set(bytes, prefix.length);
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-1", objectBytes)),
    )
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
    signal.throwIfAborted();
    if (digest !== entry.sha)
      throw new Error(
        "The file bytes do not match the pinned Git blob ID. Nothing was imported.",
      );
    if (
      new TextDecoder()
        .decode(bytes.slice(0, 128))
        .replace(/^\uFEFF/, "")
        .startsWith("version https://git-lfs.github.com/spec/v1")
    )
      throw new Error(
        "This is a Git LFS pointer. Its external content is not fetched by the reader.",
      );
    if (this.blobBytes + bytes.length > repositoryLimits.batchBytes)
      throw new Error(
        "This repository session exceeds its 50 MB verified-content cache limit. Reopen it to start a fresh session.",
      );
    this.blobBytes += bytes.length;
    this.cachedBlobs.set(entry.sha, bytes);
    return bytes.slice();
  }
}
export function repositoryText(bytes: Uint8Array) {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new Error(
      "This repository file is not UTF-8 text. Download and convert a copy before importing.",
    );
  }
  if (text.includes("\0"))
    throw new Error(
      "This file contains NUL bytes and cannot be imported as Markdown text.",
    );
  if (
    text
      .replace(/^\uFEFF/, "")
      .startsWith("version https://git-lfs.github.com/spec/v1")
  )
    throw new Error(
      "This is a Git LFS pointer. Its external content is not fetched by the reader.",
    );
  return text;
}
