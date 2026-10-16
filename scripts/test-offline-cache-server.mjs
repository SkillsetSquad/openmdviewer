// Test-only loopback static host with controlled cache-install faults. Never exported.
import http from "node:http";
import { offlineCachePrefix } from "./offline-worker.mjs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(process.env.STATIC_TEST_DIR || "out");
const base = process.env.TEST_BASE_PATH || "";
const port = 3116;
let control = {};
let counts = {};
let failures = 0;
const types = {
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".txt": "text/plain",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
};
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/.__cache_test") {
      if (req.method === "POST") {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 4096) throw new Error("Control too large");
        }
        const next = JSON.parse(body);
        if (
          next.path !== undefined &&
          (typeof next.path !== "string" || !next.path.startsWith(`${base}/`))
        )
          throw new Error("Invalid fault path");
        if (next.status !== undefined && ![404, 503].includes(next.status))
          throw new Error("Invalid test status");
        if (
          next.remaining !== undefined &&
          (!Number.isInteger(next.remaining) ||
            next.remaining < -1 ||
            next.remaining > 3)
        )
          throw new Error("Invalid fault count");
        if (next.update !== undefined && !/^[a-z-]{1,32}$/.test(next.update))
          throw new Error("Invalid test update");
        control = next;
        counts = {};
        failures = 0;
      }
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ control, counts, failures }));
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    counts[url.pathname] = (counts[url.pathname] || 0) + 1;
    if (control.path === url.pathname && control.remaining !== 0) {
      if (control.remaining > 0) control.remaining--;
      failures++;
      res.writeHead(control.status, {
        "Content-Type": "text/plain",
        "Cache-Control": "no-store",
      });
      res.end("Controlled offline-cache fixture");
      return;
    }
    const decoded = decodeURIComponent(url.pathname);
    let file = path.resolve(root, `.${decoded}`);
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
    let bytes = await readFile(file);
    if (url.pathname === `${base}/sw.js` && control.update) {
      bytes = Buffer.from(
        bytes
          .toString()
          .replace(
            /const CACHE="[^"]+";/,
            `const CACHE=${JSON.stringify(offlineCachePrefix(base) + control.update)};`,
          ),
      );
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch {
    if (!res.headersSent) res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
});
server.listen(port, "127.0.0.1", () =>
  process.stdout.write(`Offline cache fixture at http://127.0.0.1:${port}\n`),
);
