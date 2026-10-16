import { offlineWorkerSource } from "./offline-worker.mjs";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
await writeFile("out/.nojekyll", "");
await writeFile(
  "out/manifest.webmanifest",
  JSON.stringify(
    {
      name: "OpenMDViewer",
      short_name: "OpenMDViewer",
      description: "Your words. Your space. A private Markdown workspace.",
      start_url: `${base}/`,
      scope: `${base}/`,
      display: "standalone",
      background_color: "#101419",
      theme_color: "#101419",
      icons: [192, 512].map((size) => ({
        src: `${base}/icon-${size}.png`,
        sizes: `${size}x${size}`,
        type: "image/png",
        purpose: "any",
      })),
    },
    null,
    2,
  ),
);
const csp =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: https: http:; media-src 'self' blob: https: http:; font-src 'self' data:; connect-src 'self' blob: https:; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'self'";
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory()
          ? walk(path.join(dir, e.name))
          : [path.join(dir, e.name)],
      ),
    )
  ).flat();
}
const files = (await walk("out")).filter(
  (f) => !f.endsWith("sw.js") && !f.endsWith(".map"),
);
for (const file of files.filter((f) => f.endsWith(".html"))) {
  const html = await readFile(file, "utf8");
  await writeFile(
    file,
    html.replace(
      "<head>",
      `<head><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer">`,
    ),
  );
}
files.sort();
const urls = files.map((file) => {
  const relative = path.relative("out", file).split(path.sep).join("/");
  const url = new URL("https://static.invalid");
  // pathname encoding preserves valid path punctuation while escaping fragments,
  // query delimiters and literal percent signs from source filenames.
  url.pathname = `${base}/${relative.replaceAll("%", "%25")}`;
  return url.pathname;
});
urls.push(`${base}/`);
const hash = createHash("sha256");
// Include worker behavior and URL scope, not just asset bytes, in cache identity.
function fingerprintPart(bytes) {
  // Frame every input so moving bytes between adjacent files changes identity.
  hash.update(`${bytes.byteLength}:`);
  hash.update(bytes);
}
fingerprintPart(
  Buffer.from(
    offlineWorkerSource({ base, urls, version: "__BUILD_REVISION__" }),
  ),
);
for (const file of files) fingerprintPart(await readFile(file));
const version = hash.digest("hex").slice(0, 16);
await writeFile("out/sw.js", offlineWorkerSource({ base, urls, version }));

console.log(
  `Prepared static app: ${files.length} cached assets, revision ${version}, base path ${base || "/"}`,
);
