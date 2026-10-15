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
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: https: http:; font-src 'self' data:; connect-src 'self' https:; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'self'";
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
const hash = createHash("sha256");
for (const file of files.sort()) hash.update(await readFile(file));
const version = hash.digest("hex").slice(0, 16);
const urls = files.map(
  (f) => `${base}/${path.relative("out", f).split(path.sep).join("/")}`,
);
urls.push(`${base}/`);
const prefix = `openmdviewer-${base || "root"}-`;
await writeFile(
  "out/sw.js",
  `/* Generated from the static build. No documents or external responses are cached. */
const CACHE=${JSON.stringify(prefix + version)};
const PREFIX=${JSON.stringify(prefix)};
const URLS=${JSON.stringify(urls)};
const ALLOWED=new Set(URLS);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(URLS))));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()])));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match(${JSON.stringify(base + "/")})));
 else if(ALLOWED.has(url.pathname))event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(event.request))||fetch(event.request)));
});
`,
);
console.log(
  `Prepared static app: ${files.length} cached assets, revision ${version}, base path ${base || "/"}`,
);
