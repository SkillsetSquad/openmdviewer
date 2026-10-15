import { afterEach, expect, it, vi } from "vitest";
import {
  GitHubRepository,
  repositoryText,
} from "../src/lib/repositories/github";
import {
  repositoryId,
  parseRepositoryOrigin,
  repositoryFileURL,
} from "../src/lib/repositories/types";
import { repositoryImport } from "../src/lib/repositories/import";
import {
  fixtureFiles,
  githubResponse,
  gitBlob,
  commits,
  trees,
} from "./fixtures/github-repository";
const signal = () => new AbortController().signal;
function mocked() {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const value = String(url);
      calls.push({ url: value, init });
      const result = githubResponse(value);
      return new Response(result.body, {
        status: result.status,
        headers: result.headers,
      });
    }),
  );
  return calls;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("accepts only repository identifiers and fixed GitHub URLs, and strips untrusted source metadata fields", () => {
  expect(repositoryId("https://github.com/example/manual.git/")).toEqual({
    owner: "example",
    name: "manual",
  });
  for (const value of [
    "https://github.com.evil.invalid/example/manual",
    "https://token@github.com/example/manual",
    "https://github.com/example/manual?token=secret",
    "https://github.com/example/manual/tree/main",
    "example/../manual",
    "example/.git",
  ])
    expect(() => repositoryId(value)).toThrow();
  const origin = parseRepositoryOrigin({
    provider: "github",
    owner: "example",
    name: "manual",
    path: "docs/Guide.md",
    ref: { kind: "branch", name: "feature/docs" },
    commit: commits.main,
    blob: gitBlob(fixtureFiles["docs/Guide.md"]),
    token: "UNSAFE_TOKEN_FIELD",
    url: "https://attacker.invalid",
  });
  expect(origin).toBeDefined();
  expect(JSON.stringify(origin)).not.toMatch(/TOKEN|attacker/);
  expect(repositoryFileURL(origin!)).toBe(
    `https://github.com/example/manual/blob/${commits.main}/docs/Guide.md`,
  );
  expect(
    parseRepositoryOrigin({ ...origin, path: "../secret.md" }),
  ).toBeUndefined();
});
it("pins slash-containing branches and tags, traverses immutable trees, verifies blob bytes and reuses safe copies", async () => {
  const calls = mocked(),
    rate = vi.fn(),
    client = new GitHubRepository(
      { owner: "example", name: "manual" },
      "test-only-token",
      rate,
    );
  await client.info(signal());
  await client.refs("branch", 1, signal());
  const pinned = await client.snapshot(
    { kind: "branch", name: "feature/docs" },
    signal(),
  );
  expect(pinned.commit).toBe(commits.feature);
  expect(pinned.tree).toBe(trees.feature);
  const root = await client.directory(pinned, "", signal());
  await expect(
    client.read(
      pinned,
      root.find((entry) => entry.name === "submodule")!,
      signal(),
    ),
  ).rejects.toThrow("Symlinks and submodules");
  expect(root.filter((entry) => entry.mode === "160000")).toHaveLength(1);
  const files = await client.directory(pinned, "docs", signal()),
    entry = files.find((item) => item.name === "Guide.md")!,
    bytes = await client.read(pinned, entry, signal());
  expect(bytes).toEqual(new Uint8Array(fixtureFiles["docs/Guide.md"]));
  bytes[0] = 0;
  expect(await client.read(pinned, entry, signal())).toEqual(
    new Uint8Array(fixtureFiles["docs/Guide.md"]),
  );
  expect(calls.filter((call) => call.url.includes("/git/blobs/"))).toHaveLength(
    1,
  );
  expect(
    calls.some((call) => call.url.includes("heads%2Ffeature%2Fdocs")),
  ).toBe(true);
  expect(
    calls.every((call) =>
      call.url.startsWith("https://api.github.com/repos/example/manual"),
    ),
  ).toBe(true);
  for (const call of calls) {
    expect(call.init).toMatchObject({
      method: "GET",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
    });
    expect((call.init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-only-token",
    );
  }
  expect(rate).toHaveBeenLastCalledWith({
    remaining: 48,
    resetAt: 2000000000000,
    retryAfter: null,
  });
  client.dispose();
  await client.info(signal());
  expect(
    (calls.at(-1)!.init!.headers as Record<string, string>).Authorization,
  ).toBeUndefined();
});
it("rejects truncated directory listings, mismatched Git content, binary text and external Git LFS pointers", async () => {
  mocked();
  const client = new GitHubRepository({ owner: "example", name: "manual" }),
    pinned = await client.snapshot({ kind: "tag", name: "v1.0" }, signal());
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    const response = await original(url, init);
    if (String(url).includes("/git/trees/")) {
      const data = await response.json();
      return new Response(JSON.stringify({ ...data, truncated: true }), {
        status: 200,
      });
    }
    return response;
  });
  await expect(client.directory(pinned, "", signal())).rejects.toThrow(
    "truncated",
  );
  vi.mocked(fetch).mockImplementation(original);
  const entry = (await client.directory(pinned, "", signal())).find(
    (item) => item.name === "README.md",
  )!;
  vi.mocked(fetch).mockImplementation(async (url, init) =>
    String(url).includes("/git/blobs/")
      ? new Response("different bytes", { status: 200 })
      : original(url, init),
  );
  await expect(
    client.read(pinned, { ...entry, size: null }, signal()),
  ).rejects.toThrow("blob ID");
  expect(() => repositoryText(new Uint8Array([255]))).toThrow("UTF-8");
  expect(() => repositoryText(new Uint8Array([65, 0]))).toThrow("NUL");
  expect(() =>
    repositoryText(
      Buffer.from("version https://git-lfs.github.com/spec/v1\noid sha256:abc"),
    ),
  ).toThrow("Git LFS");
});
it("reports real API rate limits and blocks retries without leaking tokens or following Link URLs", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response("{}", {
          status: 403,
          headers: {
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": "2000000000",
          },
        }),
    ),
  );
  const client = new GitHubRepository(
    { owner: "example", name: "manual" },
    "test-only-token",
  );
  await expect(client.info(signal())).rejects.toThrow("rate limit");
  await expect(client.info(signal())).rejects.toThrow("still active");
  expect(fetch).toHaveBeenCalledTimes(1);
  mocked();
  vi.mocked(fetch).mockResolvedValue(
    new Response('[{"name":"main"}]', {
      headers: { link: '<https://attacker.invalid/credential>; rel="next"' },
    }),
  );
  const page = await new GitHubRepository({
    owner: "example",
    name: "manual",
  }).refs("branch", 1, signal());
  expect(page.nextPage).toBe(2);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("builds a complete local bundle with exact paths and provenance while cancellation yields no bundle", async () => {
  mocked();
  const client = new GitHubRepository({ owner: "example", name: "manual" }),
    pinned = await client.snapshot({ kind: "branch", name: "main" }, signal()),
    root = await client.directory(pinned, "", signal()),
    nested = await client.directory(pinned, "docs", signal());
  const entries = [root.find((e) => e.name === "README.md")!, ...nested];
  const bundle = await repositoryImport(client, pinned, entries, signal());
  expect(bundle.documents.map((d) => d.path)).toEqual([
    "README.md",
    "docs/Guide.md",
  ]);
  expect(bundle.documents[1].repositorySource?.commit).toBe(commits.main);
  expect(new Uint8Array(await bundle.assets[0].blob.arrayBuffer())).toEqual(
    fixtureFiles["docs/picture.png"],
  );
  expect(bundle.workspace.initialized).toBe(true);
  const abort = new AbortController();
  abort.abort();
  await expect(
    repositoryImport(client, pinned, entries, abort.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
});

it("round-trips only validated repository provenance through portable workspace metadata", async () => {
  const { workspaceMetadata, applyWorkspaceMetadata } =
    await import("../src/lib/workspace-archive");
  const { newDocument } = await import("../src/lib/documents");
  const original = newDocument("README.md", "# Original");
  original.repositorySource = {
    provider: "github",
    owner: "example",
    name: "manual",
    path: "README.md",
    ref: { kind: "tag", name: "v1.0" },
    commit: commits.tag,
    blob: gitBlob(fixtureFiles["README.md"]),
  };
  const restored = newDocument("README.md", "# Original");
  applyWorkspaceMetadata([restored], workspaceMetadata([original]));
  expect(restored.repositorySource).toEqual(original.repositorySource);
  const data = JSON.parse(workspaceMetadata([original]));
  data.documents[0].repositorySource = {
    ...data.documents[0].repositorySource,
    owner: "https://attacker.invalid",
    token: "DO_NOT_IMPORT",
  };
  const unsafe = newDocument("README.md", "# Original");
  applyWorkspaceMetadata([unsafe], JSON.stringify(data));
  expect(unsafe.repositorySource).toBeUndefined();
});
