import { createHash } from "node:crypto";
import { fixturePng } from "./conversion-docx";
export const gitBlob = (bytes: Uint8Array | string) => {
  const data =
    typeof bytes === "string" ? Buffer.from(bytes) : Buffer.from(bytes);
  return createHash("sha1")
    .update(`blob ${data.length}\0`)
    .update(data)
    .digest("hex");
};
export const commits = {
  main: "1".repeat(40),
  feature: "2".repeat(40),
  tag: "3".repeat(40),
};
export const trees = {
  main: "a".repeat(40),
  feature: "b".repeat(40),
  tag: "c".repeat(40),
  docs: "d".repeat(40),
};
export const fixtureFiles: Record<string, Uint8Array> = {
  "README.md": Buffer.from(
    "# Repository README\n\nRead this public documentation. [Open guide](docs/Guide.md#details).\n\n![Blocked remote](https://repository-attacker.invalid/pixel.png)\n\n<script>window.REPOSITORY_SCRIPT_EXECUTED=true</script>",
  ),
  "docs/Guide.md": Buffer.from(
    "# Repository guide\n\n[Back to README](../README.md)\n\n## Details\n\nCommit-pinned detail text. ![Local picture](picture.png)\n",
  ),
  "docs/picture.png": fixturePng,
};
export function githubResponse(url: string) {
  const path = new URL(url).pathname.replace("/repos/example/manual", "");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-ratelimit-remaining": "48",
    "x-ratelimit-reset": "2000000000",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization,accept,x-github-api-version",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-expose-headers":
      "x-ratelimit-remaining,x-ratelimit-reset,retry-after,link",
  };
  const json = (data: unknown) => ({
    status: 200,
    headers,
    body: Buffer.from(JSON.stringify(data)),
  });
  if (path === "")
    return json({
      default_branch: "main",
      description: "Actual provider fixture description",
      private: false,
    });
  if (path === "/branches")
    return json([
      { name: "main", commit: { sha: commits.main } },
      { name: "feature/docs", commit: { sha: commits.feature } },
    ]);
  if (path === "/tags")
    return json([{ name: "v1.0", commit: { sha: commits.tag } }]);
  if (path.startsWith("/commits/")) {
    const ref = decodeURIComponent(path.slice("/commits/".length)),
      kind =
        ref === "heads/main"
          ? "main"
          : ref === "heads/feature/docs"
            ? "feature"
            : ref === "tags/v1.0"
              ? "tag"
              : null;
    if (kind)
      return json({
        sha: commits[kind],
        commit: { tree: { sha: trees[kind] } },
      });
  }
  if (path.startsWith("/git/trees/")) {
    const id = path.slice("/git/trees/".length),
      root = [trees.main, trees.feature, trees.tag].includes(id);
    if (root)
      return json({
        sha: id,
        truncated: false,
        tree: [
          {
            path: "README.md",
            mode: "100644",
            type: "blob",
            sha: gitBlob(fixtureFiles["README.md"]),
            size: fixtureFiles["README.md"].length,
          },
          { path: "docs", mode: "040000", type: "tree", sha: trees.docs },
          {
            path: "submodule",
            mode: "160000",
            type: "commit",
            sha: "9".repeat(40),
          },
          {
            path: "package.json",
            mode: "100644",
            type: "blob",
            sha: "e".repeat(40),
            size: 5,
          },
          {
            path: "shortcut.md",
            mode: "120000",
            type: "blob",
            sha: "f".repeat(40),
            size: 9,
          },
        ],
      });
    if (id === trees.docs)
      return json({
        sha: id,
        truncated: false,
        tree: ["Guide.md", "picture.png"].map((name) => ({
          path: name,
          mode: "100644",
          type: "blob",
          sha: gitBlob(fixtureFiles[`docs/${name}`]),
          size: fixtureFiles[`docs/${name}`].length,
        })),
      });
  }
  if (path.startsWith("/git/blobs/")) {
    const id = path.slice("/git/blobs/".length),
      file = Object.values(fixtureFiles).find((bytes) => gitBlob(bytes) === id);
    if (file)
      return {
        status: 200,
        headers: { ...headers, "content-type": "application/octet-stream" },
        body: Buffer.from(file),
      };
  }
  return {
    status: 404,
    headers,
    body: Buffer.from(JSON.stringify({ message: "Not Found" })),
  };
}
