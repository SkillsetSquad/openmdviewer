import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const exec = promisify(execFile);
const prefix = process.env.TEST_DOCKER_BASE_PATH || "";
assert(
  /^(?:\/[a-z\d_-]+)*$/i.test(prefix),
  "Use a safe absolute base path without a trailing slash.",
);
const nonce = randomUUID().slice(0, 12);
const image = `openmdviewer-verification:${nonce}`;
const container = `openmdviewer-verification-${nonce}`;
const docker = async (...args) =>
  (
    await exec("docker", args, { timeout: 15000, maxBuffer: 1024 * 1024 })
  ).stdout.trim();
const build = () =>
  new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "build",
        "--build-arg",
        `NEXT_PUBLIC_BASE_PATH=${prefix}`,
        "--tag",
        image,
        ".",
      ],
      { stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Docker build exited ${code}.`)),
    );
  });
const pause = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
function security(response) {
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
}
let createdImage = false,
  started = false;
try {
  // No images or containers outside this invocation's random names are modified.
  await docker("version", "--format", "{{.Server.Version}}");
  await build();
  createdImage = true;
  await docker(
    "run",
    "--detach",
    "--rm",
    "--name",
    container,
    "--publish",
    "127.0.0.1::80",
    image,
  );
  started = true;
  const info = JSON.parse(await docker("inspect", container))[0];
  const binding = info.NetworkSettings.Ports["80/tcp"].find(
    (item) => item.HostIp === "127.0.0.1",
  );
  assert(
    binding?.HostPort,
    "The test server must bind only to loopback on a random port.",
  );
  const base = `http://127.0.0.1:${binding.HostPort}`;
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`${base}${prefix}/`, {
        signal: AbortSignal.timeout(2000),
      });
      ready = response.ok;
      await response.body?.cancel();
      if (ready) break;
    } catch {}
    await pause(1000);
  }
  assert(
    ready,
    "The container did not serve the application within 30 readiness attempts.",
  );
  const get = async (path, status = 200) => {
    const response = await fetch(base + path, {
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, status, `${path} HTTP status`);
    security(response);
    return response;
  };
  const page = await get(`${prefix}/`),
    html = await page.text();
  assert.match(html, /OpenMDViewer/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(page.headers.get("cache-control") || "", /no-cache/);
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(
    (match) => match[1],
  );
  const script = scripts.find(
    (path) =>
      path.startsWith(`${prefix}/_next/static/`) && path.endsWith(".js"),
  );
  assert(
    script,
    "A built Next.js script with the correct prefix must be present.",
  );
  const scriptResponse = await get(script);
  assert.match(scriptResponse.headers.get("cache-control") || "", /immutable/);
  assert.match(scriptResponse.headers.get("content-type") || "", /javascript/);
  await scriptResponse.body?.cancel();
  const manifest = await get(`${prefix}/manifest.webmanifest`);
  assert.match(manifest.headers.get("content-type") || "", /json/);
  const metadata = await manifest.json();
  assert.equal(metadata.start_url, `${prefix}/`);
  assert.equal(metadata.scope, `${prefix}/`);
  const sw = await get(`${prefix}/sw.js`),
    worker = await sw.text();
  assert.match(sw.headers.get("cache-control") || "", /no-store/);
  assert.match(sw.headers.get("content-type") || "", /javascript/);
  assert(worker.includes(`${prefix}/repository-diff-worker.js`));
  assert(worker.includes(`${prefix}/pdf-worker.js`));
  const missing = await get(`${prefix}/missing-${nonce}.md`, 404);
  await missing.body?.cancel();
  // Check a file that must remain JavaScript, not an HTML fallback page.
  const missingChunk = await get(
    `${prefix}/_next/static/missing-${nonce}.js`,
    404,
  );
  await missingChunk.body?.cancel();
  await docker(
    "exec",
    container,
    "sh",
    "-c",
    "if command -v node >/dev/null 2>&1 || command -v npm >/dev/null 2>&1; then exit 1; fi; nginx -t",
  );
  // Invoke the image's actual health command now rather than waiting 30 seconds.
  const health = info.Config.Healthcheck.Test;
  assert.equal(health[0], "CMD-SHELL");
  await docker("exec", container, "sh", "-c", health[1]);
  console.log(
    `Verified Docker ${prefix || "/"}: static HTML, prefixed JavaScript/manifest/service worker, cache/security headers, 404s, health command and Node-free Nginx runtime.`,
  );
} catch (error) {
  if (started) {
    try {
      console.error(await docker("logs", "--tail", "50", container));
    } catch {}
  }
  throw error;
} finally {
  if (started) await docker("stop", "--time", "5", container);
  if (createdImage) await docker("image", "rm", image);
}
