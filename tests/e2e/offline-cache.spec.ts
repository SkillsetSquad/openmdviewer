import { test, expect, type Page } from "@playwright/test";
import { offlineCachePrefix } from "../../scripts/offline-worker.mjs";
const base = process.env.TEST_BASE_PATH || "";
const asset = `${base}/pdf-LICENSE.txt`;
const prefix = offlineCachePrefix(base);
async function ready(page: Page) {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
}
async function controlled(page: Page) {
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
      timeout: 90000,
    })
    .toBe(true);
}
async function keys(page: Page) {
  return page.evaluate(() => caches.keys());
}
test("recovers a real transient HTTP 503 while installing all offline assets", async ({
  page,
  context,
  request,
}) => {
  await request.post("http://127.0.0.1:3116/.__cache_test", {
    data: { path: asset, status: 503, remaining: 1 },
  });
  await ready(page);
  await controlled(page);
  const state = await (
    await request.get("http://127.0.0.1:3116/.__cache_test")
  ).json();
  expect(state.failures).toBe(1);
  expect(state.counts[asset]).toBe(2);
  const current = (await keys(page)).find((key) => key.startsWith(prefix))!;
  expect(
    await page.evaluate(
      async ({ key, asset }) => !!(await (await caches.open(key)).match(asset)),
      { key: current, asset },
    ),
  ).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search documents and commands" })
    .fill("> settings");
  await page
    .getByRole("option", { name: "Reading settings", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Make yourself at home", exact: true }),
  ).toBeVisible();
});
test("rejects a real permanent missing asset without replacing the active offline version or source documents", async ({
  page,
  context,
  request,
}) => {
  await request.post("http://127.0.0.1:3116/.__cache_test", { data: {} });
  await ready(page);
  await controlled(page);
  const original = (await keys(page)).filter((key) => key.startsWith(prefix));
  expect(original).toHaveLength(1);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Kept.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Kept document\n\nPreserve this browser copy.\n"),
    });
  await expect(
    page.getByRole("heading", { name: "Kept document", exact: true }),
  ).toBeVisible();
  await request.post("http://127.0.0.1:3116/.__cache_test", {
    data: { path: asset, status: 404, remaining: -1, update: "broken-update" },
  });
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration!.update();
  });
  await expect(page.locator(".toast")).toContainText(
    "Offline caching could not be completed",
    { timeout: 90000 },
  );
  expect((await keys(page)).filter((key) => key.startsWith(prefix))).toEqual(
    original,
  );
  const state = await (
    await request.get("http://127.0.0.1:3116/.__cache_test")
  ).json();
  expect(state.failures).toBe(1);
  expect(state.counts[asset]).toBe(1);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Kept document", exact: true }),
  ).toBeVisible();
  expect((await keys(page)).filter((key) => key.startsWith(prefix))).toEqual(
    original,
  );
});

test("migrates only this deployment's legacy cache and preserves neighboring deployments", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:3116/.__cache_test", { data: {} });
  await ready(page);
  await controlled(page);
  // A legacy deployment already has an active worker when its update migrates caches.
  const ownLegacy = `openmdviewer-${base || "root"}-0123456789abcdef`;
  const neighborBase = base ? `${base}-test` : "/reader";
  const retained = [
    `openmdviewer-${neighborBase}-0123456789abcdef`,
    offlineCachePrefix(neighborBase) + "0123456789abcdef",
    "unrelated-application-cache",
  ];
  await page.evaluate(
    async (names) => {
      for (const name of names) {
        const cache = await caches.open(name);
        const url = `http://127.0.0.1:3116/migration-proof/${encodeURIComponent(name)}`;
        await cache.put(url, new Response(`preserved:${name}`));
        if ((await (await cache.match(url))?.text()) !== `preserved:${name}`)
          throw new Error(`Migration fixture could not seed ${name}`);
      }
    },
    [ownLegacy, ...retained],
  );
  await request.post("http://127.0.0.1:3116/.__cache_test", {
    data: { update: "migration-update" },
  });
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())!.update();
  });
  const apply = page.getByRole("button", {
    name: "Apply application update",
    exact: true,
  });
  await expect(apply).toBeVisible({ timeout: 90000 });
  await Promise.all([page.waitForEvent("load"), apply.click()]);
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  const names = await keys(page);
  expect(names).not.toContain(ownLegacy);
  expect(names.filter((name) => name.startsWith(prefix))).toHaveLength(1);
  for (const name of retained) {
    expect(names).toContain(name);
    expect(
      await page.evaluate(
        async (name) =>
          (await (
            await caches.open(name)
          ).match(
            `http://127.0.0.1:3116/migration-proof/${encodeURIComponent(name)}`,
          ))!.text(),
        name,
      ),
    ).toBe(`preserved:${name}`);
  }
});
