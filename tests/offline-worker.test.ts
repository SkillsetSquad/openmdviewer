import { afterEach, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { offlineWorkerSource } from "../scripts/offline-worker.mjs";

const origin = "https://reader.invalid";
function harness({
  urls = ["/app.js", "/"],
  fetcher = async () => new Response("asset"),
  putError = false,
}: {
  urls?: string[];
  fetcher?: (url: string, init: RequestInit) => Promise<Response>;
  putError?: boolean;
} = {}) {
  const listeners = new Map<string, (event: unknown) => void>();
  const stores = new Map<string, Map<string, Response>>([
    ["openmdviewer-root-old", new Map([["/", new Response("old release")]])],
    ["unrelated", new Map()],
  ]);
  const writes: string[] = [];
  let claims = 0,
    skipped = 0;
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        async put(url: string, response: Response) {
          if (putError) throw new DOMException("Full", "QuotaExceededError");
          store.set(url, response.clone());
          writes.push(url);
        },
        async match(request: string | Request) {
          return store
            .get(
              typeof request === "string"
                ? request
                : new URL(request.url).pathname,
            )
            ?.clone();
        },
      };
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name: string) {
      return stores.delete(name);
    },
  };
  const fetch = vi.fn(fetcher);
  const source = offlineWorkerSource({ base: "", urls, version: "candidate" });
  runInNewContext(source, {
    self: {
      location: { origin },
      clients: {
        claim: async () => {
          claims++;
        },
      },
      skipWaiting: () => {
        skipped++;
      },
      addEventListener: (name: string, handler: (event: unknown) => void) =>
        listeners.set(name, handler),
    },
    caches,
    fetch,
    URL,
    AbortController,
    TypeError,
    Error,
    setTimeout,
    clearTimeout,
    Promise,
    Set,
  });
  const install = () => {
    let work: Promise<void> | undefined;
    listeners.get("install")!({
      waitUntil: (promise: Promise<void>) => {
        work = promise;
      },
    });
    return work!;
  };
  const activate = () => {
    let work: Promise<void> | undefined;
    listeners.get("activate")!({
      waitUntil: (promise: Promise<void>) => {
        work = promise;
      },
    });
    return work!;
  };
  const request = async (url: string, method = "GET", mode = "cors") => {
    let response: Promise<Response> | undefined;
    listeners.get("fetch")!({
      request: { url, method, mode },
      respondWith: (promise: Promise<Response>) => {
        response = promise;
      },
    });
    return response ? await response : undefined;
  };
  return {
    stores,
    writes,
    fetch,
    install,
    activate,
    request,
    source,
    get claims() {
      return claims;
    },
    get skipped() {
      return skipped;
    },
    message: (data: string) => listeners.get("message")!({ data }),
  };
}
afterEach(() => vi.useRealTimers());
it("retries a transient HTTP 503, caches every asset, and only prunes old same-scope caches after activation", async () => {
  vi.useFakeTimers();
  let attempts = 0;
  const worker = harness({
    fetcher: async (url) =>
      url === "/app.js" && ++attempts === 1
        ? new Response("retry", { status: 503 })
        : new Response(`asset:${url}`),
  });
  const install = worker.install();
  await vi.advanceTimersByTimeAsync(500);
  await install;
  expect(
    worker.fetch.mock.calls.filter(([url]) => url === "/app.js"),
  ).toHaveLength(2);
  expect(
    worker.fetch.mock.calls.every(([, init]) => init.cache === "reload"),
  ).toBe(true);
  expect(
    [...worker.stores.get("openmdviewer-root-candidate")!.keys()].sort(),
  ).toEqual(["/", "/app.js"]);
  expect(worker.stores.has("openmdviewer-root-old")).toBe(true);
  expect(worker.claims).toBe(0);
  expect(worker.skipped).toBe(0);
  await worker.activate();
  expect(worker.stores.has("openmdviewer-root-old")).toBe(false);
  expect(worker.stores.has("unrelated")).toBe(true);
  expect(worker.claims).toBe(1);
  worker.message("ACTIVATE_UPDATE");
  expect(worker.skipped).toBe(1);
});
it("bounds parallel downloads at eight without truncating the asset list", async () => {
  vi.useFakeTimers();
  let active = 0,
    maximum = 0;
  const urls = Array.from({ length: 25 }, (_, i) => `/asset-${i}.js`);
  const worker = harness({
    urls,
    fetcher: async () => {
      maximum = Math.max(maximum, ++active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      return new Response("complete");
    },
  });
  const install = worker.install();
  await vi.advanceTimersByTimeAsync(1000);
  await install;
  expect(maximum).toBe(8);
  expect(worker.writes).toHaveLength(25);
  expect(new Set(worker.writes).size).toBe(25);
});
it.each([401, 403, 404])(
  "does not retry permanent HTTP %s or activate a partial version",
  async (status) => {
    const worker = harness({
      urls: ["/missing.js"],
      fetcher: async () => new Response("unavailable", { status }),
    });
    await expect(worker.install()).rejects.toThrow(`HTTP ${status}`);
    expect(worker.fetch).toHaveBeenCalledTimes(1);
    expect(worker.stores.has("openmdviewer-root-candidate")).toBe(false);
    expect(
      await worker.stores.get("openmdviewer-root-old")!.get("/")!.text(),
    ).toBe("old release");
    expect(worker.claims).toBe(0);
    expect(worker.skipped).toBe(0);
  },
);
it("limits transient failures to three attempts and leaves the active version intact", async () => {
  vi.useFakeTimers();
  const worker = harness({
    urls: ["/app.js"],
    fetcher: async () => new Response("retry", { status: 503 }),
  });
  const failed = expect(worker.install()).rejects.toThrow("HTTP 503");
  await vi.advanceTimersByTimeAsync(2000);
  await failed;
  expect(worker.fetch).toHaveBeenCalledTimes(3);
  expect(worker.stores.has("openmdviewer-root-candidate")).toBe(false);
  expect(worker.stores.has("openmdviewer-root-old")).toBe(true);
});
it("retries request timeouts with cancellation and stops a stalled fetch body", async () => {
  vi.useFakeTimers();
  let aborted = 0;
  const worker = harness({
    urls: ["/slow.js"],
    fetcher: async (_url, init) => {
      const body = new ReadableStream({
        start(controller) {
          init.signal!.addEventListener("abort", () => {
            aborted++;
            controller.error(new DOMException("Aborted", "AbortError"));
          });
        },
      });
      return new Response(body);
    },
  });
  const failed = expect(worker.install()).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(50000);
  await failed;
  expect(worker.fetch).toHaveBeenCalledTimes(3);
  expect(aborted).toBe(3);
  expect(worker.stores.has("openmdviewer-root-old")).toBe(true);
});
it("stops all outstanding network work at the overall install budget", async () => {
  vi.useFakeTimers();
  let aborted = 0,
    completed = 0;
  const urls = Array.from({ length: 1000 }, (_, i) => `/slow-${i}.js`);
  const worker = harness({
    urls,
    fetcher: async (_url, init) =>
      new Promise((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          aborted++;
          reject(new DOMException("Abort", "AbortError"));
        };
        const timer = setTimeout(() => {
          init.signal!.removeEventListener("abort", abort);
          completed++;
          resolve(new Response("downloaded"));
        }, 10000);
        init.signal!.addEventListener("abort", abort, { once: true });
      }),
  });
  const failed = expect(worker.install()).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(121000);
  await failed;
  expect(completed).toBeGreaterThan(0);
  expect(aborted).toBeGreaterThan(0);
  expect(worker.fetch.mock.calls.length).toBe(completed + aborted);
  expect(worker.fetch.mock.calls.length).toBeLessThan(urls.length);
  expect(worker.claims).toBe(0);
  expect(worker.stores.has("openmdviewer-root-old")).toBe(true);
});

it("never treats quota failures or off-origin redirects as retryable network errors", async () => {
  const full = harness({ urls: ["/app.js"], putError: true });
  await expect(full.install()).rejects.toMatchObject({
    name: "QuotaExceededError",
  });
  expect(full.fetch).toHaveBeenCalledTimes(1);
  expect(full.stores.has("openmdviewer-root-old")).toBe(true);
  const redirected = harness({
    urls: ["/app.js"],
    fetcher: async () => {
      const response = new Response("remote");
      Object.defineProperty(response, "url", {
        value: "https://outside.invalid/asset",
      });
      return response;
    },
  });
  await expect(redirected.install()).rejects.toThrow("redirected outside");
  expect(redirected.fetch).toHaveBeenCalledTimes(1);
});
it("serves only fixed same-origin GET assets and canonical navigation without caching documents or external URLs", async () => {
  const worker = harness();
  await worker.install();
  expect(await (await worker.request(`${origin}/app.js`))!.text()).toBe(
    "asset",
  );
  expect(
    await (await worker.request(
      `${origin}/?private=query`,
      "GET",
      "navigate",
    ))!.text(),
  ).toBe("asset");
  const count = worker.fetch.mock.calls.length;
  expect(
    await worker.request("https://outside.invalid/app.js"),
  ).toBeUndefined();
  expect(await worker.request(`${origin}/private.md`)).toBeUndefined();
  expect(await worker.request(`${origin}/app.js`, "POST")).toBeUndefined();
  expect(worker.fetch.mock.calls.length).toBe(count);
  expect(worker.writes).toHaveLength(2);
});
it("versions the actual generated cache from worker behavior even when exported asset bytes are unchanged", async () => {
  const stage = await mkdtemp(
    path.join(tmpdir(), "openmdviewer-cache-version-"),
  );
  try {
    const script = await readFile("scripts/prepare-static.mjs", "utf8");
    const worker = await readFile("scripts/offline-worker.mjs", "utf8");
    await mkdir(path.join(stage, "scripts"));
    await writeFile(path.join(stage, "scripts/prepare-static.mjs"), script);
    const build = async (source: string) => {
      await rm(path.join(stage, "out"), { recursive: true, force: true });
      await mkdir(path.join(stage, "out"));
      await writeFile(
        path.join(stage, "out/index.html"),
        "<html><head></head><body>Same assets</body></html>",
      );
      const specialNames = [
        "space #.txt",
        "icon@2x.png",
        "percent%20.txt",
        ...(process.platform === "win32" ? [] : ["query?.txt"]),
      ];
      for (const name of specialNames)
        await writeFile(path.join(stage, "out", name), "same bytes");
      await writeFile(path.join(stage, "scripts/offline-worker.mjs"), source);
      execFileSync(
        process.execPath,
        [path.join(stage, "scripts/prepare-static.mjs")],
        {
          cwd: stage,
          env: { ...process.env, NEXT_PUBLIC_BASE_PATH: "" },
          stdio: "pipe",
        },
      );
      const result = await readFile(path.join(stage, "out/sw.js"), "utf8");
      const urls = JSON.parse(result.match(/const URLS=([^;]+);/)![1]);
      expect(urls).toEqual(
        expect.arrayContaining([
          "/space%20%23.txt",
          "/icon@2x.png",
          "/percent%2520.txt",
        ]),
      );
      if (process.platform !== "win32") expect(urls).toContain("/query%3F.txt");

      return {
        cache: result.match(/const CACHE=([^;]+);/)![1],
        asset: await readFile(path.join(stage, "out/index.html"), "utf8"),
      };
    };
    const original = await build(worker);
    const changed = await build(
      worker.replace("const CONCURRENCY=8", "const CONCURRENCY=4"),
    );
    expect(changed.asset).toBe(original.asset);
    expect(changed.cache).not.toBe(original.cache);
    expect(await build(worker)).toEqual(original);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
});
