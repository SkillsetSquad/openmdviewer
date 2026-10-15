import { expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import {
  exportSite,
  siteLimits,
  type SiteExportInput,
} from "../src/lib/site-export";
import { fixturePng } from "./fixtures/conversion-docx";
const doc = (id: string, path: string, content: string) => ({
  id,
  path,
  content,
});
const input = (documents: SiteExportInput["documents"]): SiteExportInput => ({
  title: "Docs <test>",
  description: 'Local "guide"',
  documents,
  assets: [],
});
function unpack(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  return { files, text: (name: string) => strFromU8(files[name]) };
}
it("exports linked documents with real heading IDs, collision-free paths, complete search text and escaped branding", async () => {
  const value = input([
    doc(
      "a",
      "A/Read me.md",
      "# First\n\n[Other](../B/Read%20me.md#section) [[Read me|Ambiguous]]\n\n[Raw](../B/Read%20me.md#custom)\n\n[Same](#first)",
    ),
    doc(
      "b",
      "B/Read me.md",
      '---\ntitle: Second title\nprivate: DO_NOT_PUBLISH_METADATA\n---\n# Second\n\n## Section\n\n<h3 id="custom">Custom title</h3>\n\n' +
        "Repeated prose. ".repeat(5000) +
        "FINAL_SEARCH_TOKEN",
    ),
  ]);
  const result = await exportSite(value),
    { text, files } = unpack(result.bytes),
    report = JSON.parse(text("export-report.json"));
  expect(result.documents).toBe(2);
  expect(result.noticeCount).toBe(0);
  expect(report.documents.map((d: { url: string }) => d.url)).toEqual([
    "document-00001.html",
    "document-00002.html",
  ]);
  const first = text("document-00001.html");
  expect(first).toContain('href="document-00002.html#user-content-section"');
  expect(first).toContain('href="document-00002.html#user-content-custom"');
  expect(first).toContain('href="#user-content-first"');
  expect(text("document-00002.html")).toContain('id="user-content-custom"');
  expect(text("index.html")).toContain("Docs &lt;test&gt;");
  expect(text("search-data.js")).toContain("FINAL_SEARCH_TOKEN");
  expect(Object.keys(files)).not.toContain(".openmdviewer/workspace.json");
  expect(
    Object.values(files)
      .map((v) => strFromU8(v))
      .join(""),
  ).not.toContain("DO_NOT_PUBLISH_METADATA");
  expect(value.documents[0].content).toContain("../B/Read%20me.md");
});
it("copies referenced originals exactly, embeds validated raster images and captions, and leaves remote/active content inert", async () => {
  const value = input([
    doc(
      "a",
      "Guide/Start.md",
      '# Safe\n\n![Local](photo.png) ![Remote](https://site-attacker.invalid/pixel) ![Vector](vector.svg)\n\n[Original](_sources/raw.html) [Missing](absent.md)\n\n<video src="movie.mp4" poster="photo.png"><track src="captions.vtt" kind="captions" label="English" srclang="en" default></video>\n\n<script>window.SITE_XSS=1</script><iframe src="https://site-attacker.invalid/frame"></iframe>\n\n[Unsafe](javascript:alert(1))',
    ),
  ]);
  const raw = "<script>window.PUBLISHED_ORIGINAL_XSS=1</script>",
    svg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>';
  value.assets = [
    { path: "Guide/photo.png", blob: new Blob([fixturePng as BlobPart]) },
    { path: "Guide/vector.svg", blob: new Blob([svg]) },
    { path: "Guide/_sources/raw.html", blob: new Blob([raw]) },
    { path: "Guide/movie.mp4", blob: new Blob(["opaque-video"]) },
    {
      path: "Guide/captions.vtt",
      blob: new Blob(["WEBVTT\n\n00:00.000 --> 00:02.000\nCaption text\n"]),
    },
    { path: "unused.png", blob: new Blob([fixturePng as BlobPart]) },
  ];
  const result = await exportSite(value),
    { text, files } = unpack(result.bytes),
    html = text("document-00001.html"),
    report = JSON.parse(text("export-report.json"));
  expect(result.assets).toBe(5);
  expect(result.noticeCount).toBeGreaterThanOrEqual(3);
  expect(html).toContain('src="assets/asset-00001.png"');
  expect(html).not.toMatch(/src="https?:|<iframe|SITE_XSS|javascript:/);
  expect(html).toContain("controls");
  expect(html).toContain(".vtt");
  expect(html).not.toContain('href="absent.md"');
  const original = report.assets.find((a: { path: string }) =>
    a.path.endsWith("raw.html"),
  );
  expect(original.url).toMatch(/\.bin$/);
  expect(text(original.url)).toBe(raw);
  expect(html).toContain('download="raw.html"');
  const image = report.assets.find((a: { path: string }) =>
    a.path.endsWith("photo.png"),
  );
  expect(files[image.url]).toEqual(fixturePng);
  expect(
    report.assets.some((a: { path: string }) => a.path === "unused.png"),
  ).toBe(false);
  expect(html).toContain("connect-src 'none'");
  expect(html).toContain("script-src 'self'");
});
it("reports ambiguous wiki references and malformed paths instead of exporting broken executable hrefs", async () => {
  const value = input([
    doc(
      "a",
      "Start.md",
      "# Start\n\n[[Shared]] [Bad](%ZZ.md) [Lost](missing.md#section)",
    ),
    doc("b", "A/Shared.md", "# Shared"),
    doc("c", "B/Shared.md", "# Shared"),
  ]);
  const result = await exportSite(value),
    { text } = unpack(result.bytes);
  expect(result.noticeCount).toBe(3);
  expect(result.notices.join(" ")).toContain("ambiguous");
  expect(text("document-00003.html")).not.toContain('href="wiki:');
});
it("fails empty, conflicting and oversized exports without silently omitting documents", async () => {
  await expect(exportSite(input([]))).rejects.toThrow("Add a document");
  await expect(
    exportSite(input([doc("a", "same.md", "# A"), doc("b", "same.md", "# B")])),
  ).rejects.toThrow("unique");
  const value = input([doc("a", "one.md", "# One")]),
    oversized = new Blob([]);
  Object.defineProperty(oversized, "size", { value: siteLimits.bytes + 1 });
  value.assets = [{ path: "large.bin", blob: oversized }];
  await expect(exportSite(value)).rejects.toThrow("100 MB");
});
