import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const address =
  "https://url-import.example.invalid/Remote.md?temporary=private#intro";
const content =
  "\uFEFF# URL document\r\n\r\nRead the **remote text**. [Section](#section). [Related](related.md).\r\n\r\n![Remote image](https://url-attacker.invalid/pixel.png)\r\n\r\n<script>window.URL_SCRIPT_EXECUTED=true</script>\r\n\r\n## Section\r\n\r\nLocal after import.\r\n";
const dialog = (page: Page) =>
  page.getByRole("dialog", { name: "Open Markdown URL", exact: true });
async function allDocs(page: Page) {
  return page.evaluate(
    () =>
      new Promise<
        { id: string; path: string; content: string; workspaceId: string }[]
      >((resolve, reject) => {
        const request = indexedDB.open("openmdviewer");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db
            .transaction("documents")
            .objectStore("documents")
            .getAll();
          read.onsuccess = () => {
            resolve(read.result);
            db.close();
          };
          read.onerror = () => {
            reject(read.error);
            db.close();
          };
        };
      }),
  );
}
async function open(page: Page) {
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search documents and commands" })
    .fill("> open markdown url");
  await page
    .getByRole("option", { name: "Open Markdown URL", exact: true })
    .click();
  return dialog(page);
}
async function fetchPreview(page: Page) {
  await dialog(page).getByLabel("Document URL", { exact: true }).fill(address);
  await dialog(page)
    .getByRole("button", { name: "Fetch preview", exact: true })
    .click();
}
test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
});
test("explicitly previews raw text without active content, preserves path collisions, stores no URL metadata and reads the imported copy offline", async ({
  page,
  context,
}) => {
  test.setTimeout(150000);
  const calls: { url: string; headers: Record<string, string> }[] = [],
    remote: string[] = [];
  await context.route(
    "https://url-import.example.invalid/**",
    async (route) => {
      calls.push({
        url: route.request().url(),
        headers: route.request().headers(),
      });
      await route.fulfill({
        status: 200,
        contentType: "text/markdown; charset=utf-8",
        headers: { "access-control-allow-origin": "*" },
        body: content,
      });
    },
  );
  page.on("request", (request) => {
    if (request.url().includes("url-attacker.invalid"))
      remote.push(request.url());
  });
  const before = await allDocs(page);
  const view = await open(page);
  expect(calls).toHaveLength(0);
  await fetchPreview(page);
  await expect(
    view.getByRole("heading", { name: "URL document", exact: true }),
  ).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe(address.split("#")[0]);
  expect(calls[0].headers.cookie).toBeUndefined();
  expect(calls[0].headers.authorization).toBeUndefined();
  expect(calls[0].headers.referer).toBeUndefined();
  expect(remote).toEqual([]);
  expect(await page.evaluate(() => "URL_SCRIPT_EXECUTED" in window)).toBe(
    false,
  );
  await view.getByRole("link", { name: "Section", exact: true }).click();
  await expect(view.locator("#user-content-section")).toBeInViewport();
  await view.getByRole("link", { name: "Related", exact: true }).click();
  await expect(view.getByRole("status")).toContainText(
    "not available in the URL preview",
  );
  await view
    .getByRole("button", { name: "URL source preview", exact: true })
    .click();
  await expect(view.getByLabel("Fetched Markdown source")).toHaveValue(
    content.replace(/\r\n/g, "\n"),
  );
  expect(await allDocs(page)).toEqual(before);
  const collision = before.find((doc) =>
    doc.path.endsWith("Configuration.md"),
  )!;
  await view
    .getByLabel("Local document path", { exact: true })
    .fill(collision.path);
  await page.screenshot({ path: "/tmp/openmdviewer-url-import-desktop.png" });
  await view
    .getByRole("button", { name: "Import reviewed document", exact: true })
    .click();
  await expect(view).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "URL document", exact: true }),
  ).toBeVisible();
  const after = await allDocs(page),
    added = after.find(
      (doc) => !before.some((previous) => previous.id === doc.id),
    )!;
  expect(after).toHaveLength(before.length + 1);
  expect(added.content).toBe(content);
  expect(added.path).toBe(`Imports/Batch 2/${collision.path}`);
  expect(after.find((doc) => doc.id === collision.id)).toEqual(collision);
  expect(JSON.stringify(added)).not.toContain("temporary=private");
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
      timeout: 90000,
    })
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "URL document", exact: true }),
  ).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(remote).toEqual([]);
});
test("failed HTTP, HTML, binary and redirect responses never enable import or alter local documents", async ({
  page,
  context,
}) => {
  const before = await allDocs(page);
  let mode = "missing";
  const calls: string[] = [];
  await context.route(
    "https://url-import.example.invalid/**",
    async (route) => {
      calls.push(route.request().url());
      const headers = { "access-control-allow-origin": "*" };
      if (mode === "missing")
        await route.fulfill({ status: 404, body: "private response", headers });
      else if (mode === "html")
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<html>login</html>",
          headers,
        });
      else if (mode === "binary")
        await route.fulfill({
          status: 200,
          contentType: "text/plain",
          body: Buffer.from([0xff, 0x00]),
          headers,
        });
      else
        await route.fulfill({
          status: 302,
          headers: {
            ...headers,
            location: "https://url-attacker.invalid/redirect.md",
          },
        });
    },
  );
  const view = await open(page);
  for (const [value, message] of [
    ["missing", "HTTP 404"],
    ["html", "not Markdown/plain text"],
    ["binary", "not valid UTF-8"],
    ["redirect", "could not be fetched"],
  ]) {
    mode = value;
    await fetchPreview(page);
    await expect(view.getByRole("status")).toContainText(message);
    await expect(
      view.getByRole("button", {
        name: "Import reviewed document",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(await allDocs(page)).toEqual(before);
  }
  expect(calls).toHaveLength(4);
});
test("cancel ignores late responses and a fresh request succeeds", async ({
  page,
  context,
}) => {
  let release: () => void = () => {},
    started: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    began = new Promise<void>((resolve) => {
      started = resolve;
    });
  let slow = true;
  await context.route(
    "https://url-import.example.invalid/**",
    async (route) => {
      if (slow) {
        started();
        await gate;
      }
      await route
        .fulfill({
          status: 200,
          contentType: "text/markdown",
          headers: { "access-control-allow-origin": "*" },
          body: content,
        })
        .catch(() => {});
    },
  );
  const before = await allDocs(page),
    view = await open(page);
  await fetchPreview(page);
  await began;
  await view
    .getByRole("button", { name: "Cancel URL request", exact: true })
    .click();
  await expect(view.getByRole("status")).toContainText("canceled");
  release();
  slow = false;
  await expect(
    view.getByRole("button", { name: "Import reviewed document", exact: true }),
  ).toHaveCount(0);
  expect(await allDocs(page)).toEqual(before);
  await fetchPreview(page);
  await expect(
    view.getByRole("heading", { name: "URL document", exact: true }),
  ).toBeVisible();
});
test("mobile preview is bounded, accessible and retains the full source for import", async ({
  page,
  context,
}) => {
  const big =
    "# Large URL document\n\n```text\n" + "x".repeat(100100) + "\n```\n";
  await context.route("https://url-import.example.invalid/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/plain",
      headers: { "access-control-allow-origin": "*" },
      body: big,
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const view = await open(page);
  await fetchPreview(page);
  await expect(
    view.getByText(/Rendered preview shows the first 100,000/),
  ).toBeVisible();
  await expect(
    view.getByRole("heading", { name: "Large URL document", exact: true }),
  ).toBeVisible();
  await view
    .getByRole("button", { name: "URL source preview", exact: true })
    .click();
  await expect(view.getByLabel("Fetched Markdown source")).toHaveValue(big);
  const scan = await new AxeBuilder({ page }).include("dialog[open]").analyze();
  expect(scan.violations).toEqual([]);
  expect(
    await view.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/openmdviewer-url-import-mobile.png" });
  await view
    .getByLabel("Local document path", { exact: true })
    .fill("../unsafe.md");
  await view
    .getByRole("button", { name: "Import reviewed document", exact: true })
    .click();
  await expect(view.getByRole("status")).toContainText(
    "relative Markdown/text path",
  );
  await view
    .getByLabel("Local document path", { exact: true })
    .fill("Imported/Large.md");
  await view
    .getByRole("button", { name: "Import reviewed document", exact: true })
    .click();
  await expect(view).not.toBeVisible();
  expect(
    (await allDocs(page)).find((doc) => doc.path === "Imported/Large.md")
      ?.content,
  ).toBe(big);
});
