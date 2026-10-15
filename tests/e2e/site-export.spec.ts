import { test, expect, type Page, type Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { unzipSync, zipSync, strToU8 } from "fflate";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fixturePng } from "../fixtures/conversion-docx";

async function openExporter(page: Page) {
  await page.keyboard.press("Control+k");
  const search = page.getByRole("combobox", {
    name: "Search documents and commands",
  });
  await search.fill("> export documentation website");
  await page
    .getByRole("option", { name: "Export documentation website", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Export documentation website",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  return dialog;
}
async function website(page: Page, existing?: Locator) {
  const dialog = existing || (await openExporter(page));
  await dialog
    .getByRole("button", { name: "Generate website ZIP", exact: true })
    .click();
  const download = dialog.getByRole("button", {
    name: "Download website ZIP",
    exact: true,
  });
  await expect(download).toBeVisible();
  const pending = page.waitForEvent("download");
  await download.click();
  const result = await pending,
    stream = await result.createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(result.suggestedFilename()).toBe("openmdviewer-website.zip");
  return { dialog, files: unzipSync(Buffer.concat(chunks)) };
}
async function serve(files: Record<string, Uint8Array>, prefix = "/") {
  const requests: string[] = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    requests.push(url.pathname);
    const name = url.pathname.startsWith(prefix)
      ? decodeURIComponent(url.pathname.slice(prefix.length) || "index.html")
      : "";
    const bytes = files[name];
    if (!bytes) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const type = name.endsWith(".html")
      ? "text/html"
      : name.endsWith(".css")
        ? "text/css"
        : name.endsWith(".js")
          ? "text/javascript"
          : name.endsWith(".png")
            ? "image/png"
            : name.endsWith(".vtt")
              ? "text/vtt"
              : "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "X-Content-Type-Options": "nosniff",
    });
    res.end(bytes);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}${prefix}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
async function importZIP(page: Page, entries: Record<string, Uint8Array>) {
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Site source.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zipSync(entries)),
    });
}
const readerReady = (page: Page) =>
  expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await readerReady(page);
});

test("exports real workspace pages that navigate, search complete text, show local assets and remain safe at root and subpaths", async ({
  page,
  context,
}) => {
  const entries = {
    "Publish/Start.md": strToU8(
      '# Published start\n\n[Next guide](nested/Second%20guide.md#deep-section) [[Second guide|Wiki destination]] [Same](#published-start)\n\n![Local picture](picture.png) ![Remote picture](https://site-attacker.invalid/pixel) ![Vector](vector.svg)\n\n[Original](_sources/original.html)\n\n<script>window.SITE_XSS=true;fetch("https://site-attacker.invalid/script")</script><iframe src="https://site-attacker.invalid/frame"></iframe>',
    ),
    "Publish/nested/Second guide.md": strToU8(
      "---\ntitle: Published second title\nsecret: PRIVATE_FRONTMATTER_TOKEN\n---\n# Second guide\n\n" +
        "Long document text. ".repeat(3000) +
        '\n\n## Deep section\n\nFINAL_UNIQUE_SEARCH_TOKEN\n\n<h3 id="custom">Raw HTML heading</h3>\n\n[Back](../Start.md#published-start)',
    ),
    "Publish/picture.png": fixturePng,
    "Publish/vector.svg": strToU8(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="fetch(\'https://site-attacker.invalid/svg\')"></svg>',
    ),
    "Publish/_sources/original.html": strToU8(
      "<script>window.ORIGINAL_SCRIPT_EXECUTED=true</script>",
    ),
    ".openmdviewer/workspace.json": strToU8(
      JSON.stringify({
        format: "openmdviewer",
        version: 1,
        documents: [
          {
            path: "Publish/Start.md",
            annotations: [
              {
                id: "private",
                kind: "note",
                title: "PRIVATE_READING_NOTE_TOKEN",
                note: "PRIVATE_NOTE_BODY",
                createdAt: 1,
                updatedAt: 1,
              },
            ],
          },
        ],
      }),
    ),
  };
  await importZIP(page, entries);
  await expect(
    page.getByRole("heading", { name: "Published start", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        new Promise<boolean>((resolve, reject) => {
          const request = indexedDB.open("openmdviewer");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result,
              read = db
                .transaction("documents")
                .objectStore("documents")
                .getAll();
            read.onsuccess = () => {
              resolve(
                read.result.some(
                  (item) =>
                    item.path === "Publish/Start.md" &&
                    item.annotations?.some(
                      (note: { title: string }) =>
                        note.title === "PRIVATE_READING_NOTE_TOKEN",
                    ),
                ),
              );
              db.close();
            };
            read.onerror = () => {
              reject(read.error);
              db.close();
            };
          };
        }),
    ),
  ).toBe(true);
  const { files, dialog } = await website(page);
  await expect(dialog).toContainText("export notices");
  await page.screenshot({ path: "/tmp/openmdviewer-site-export-desktop.png" });
  const report = JSON.parse(
      Buffer.from(files["export-report.json"]).toString(),
    ),
    first = report.documents.find(
      (d: { path: string }) => d.path === "Publish/Start.md",
    ),
    second = report.documents.find(
      (d: { path: string }) => d.path === "Publish/nested/Second guide.md",
    );
  expect(report.assets).toHaveLength(3);
  expect(
    Object.values(files)
      .map((bytes) => Buffer.from(bytes).toString())
      .join(""),
  ).not.toMatch(
    /PRIVATE_READING_NOTE_TOKEN|PRIVATE_NOTE_BODY|PRIVATE_FRONTMATTER_TOKEN/,
  );
  const original = report.assets.find((asset: { path: string }) =>
    asset.path.endsWith("original.html"),
  );
  expect(Buffer.from(files[original.url])).toEqual(
    Buffer.from(entries["Publish/_sources/original.html"]),
  );
  expect(original.url).toMatch(/\.bin$/);
  for (const prefix of ["/", "/nested/docs/"]) {
    const host = await serve(files, prefix),
      site = await context.newPage(),
      external: string[] = [];
    site.on("request", (req) => {
      if (req.url().includes("site-attacker.invalid")) external.push(req.url());
    });
    try {
      await site.goto(host.url + first.url);
      await expect(
        site.getByRole("heading", { name: "Published start", exact: true }),
      ).toBeVisible();
      await expect(
        site.getByRole("img", { name: "Local picture", exact: true }),
      ).toHaveJSProperty("naturalWidth", 1);
      expect(
        await site.evaluate(
          () => "SITE_XSS" in window || "ORIGINAL_SCRIPT_EXECUTED" in window,
        ),
      ).toBe(false);
      expect(external).toEqual([]);
      await site.getByRole("link", { name: "Next guide", exact: true }).click();
      await expect(site).toHaveURL(
        host.url + second.url + "#user-content-deep-section",
      );
      await expect(site.locator("#user-content-deep-section")).toBeInViewport();
      await site
        .getByRole("navigation", { name: "On this page" })
        .getByRole("link", { name: "Raw HTML heading", exact: true })
        .click();
      await expect(site).toHaveURL(/#user-content-custom$/);
      await site
        .getByRole("button", { name: "Use light theme", exact: true })
        .click();
      await expect(site.locator("html")).toHaveAttribute("data-theme", "light");
      await site.reload();
      await expect(site.locator("html")).toHaveAttribute("data-theme", "light");
      await site
        .getByRole("searchbox", { name: "Search this site", exact: true })
        .fill("FINAL_UNIQUE_SEARCH_TOKEN");
      await expect(site.getByRole("status")).toHaveText("1–1 of 1 documents");
      await site
        .getByRole("complementary", { name: "Document navigation" })
        .getByRole("link", { name: "Published second title", exact: true })
        .click();
      await expect(site).toHaveURL(host.url + second.url);
      await site.getByRole("link", { name: "Back", exact: true }).click();
      await site
        .getByRole("link", { name: "Wiki destination", exact: true })
        .click();
      await expect(site).toHaveURL(host.url + second.url);
      await site.screenshot({
        path: "/tmp/openmdviewer-exported-site-desktop.png",
      });
      const a11y = await new AxeBuilder({ page: site }).analyze();
      expect(
        a11y.violations.filter((v) =>
          ["serious", "critical"].includes(v.impact || ""),
        ),
      ).toEqual([]);
    } finally {
      await site.close();
      await host.close();
    }
  }
});

test("paginates the full navigation, finds later documents, and keeps every page reachable without JavaScript", async ({
  page,
  browser,
}) => {
  const entries: Record<string, Uint8Array> = {};
  for (let i = 0; i < 125; i++)
    entries[`Collection/Entry ${String(i).padStart(3, "0")}.md`] = strToU8(
      `# Published entry ${i}\n\nUnique token ${i}.`,
    );
  await importZIP(page, entries);
  await expect(
    page.getByRole("heading", { name: "Published entry 0", exact: true }),
  ).toBeVisible();
  const { files } = await website(page),
    report = JSON.parse(Buffer.from(files["export-report.json"]).toString()),
    host = await serve(files, "/docs/");
  const context = await browser.newContext(),
    site = await context.newPage();
  try {
    await site.goto(host.url);
    await expect(site.locator("#site-documents li")).toHaveCount(50);
    await site
      .getByRole("button", { name: "Next results", exact: true })
      .click();
    await expect(site.getByRole("status")).toContainText("51–100");
    await site
      .getByRole("button", { name: "Next results", exact: true })
      .click();
    await expect(site.getByRole("status")).toContainText("101–");
    await site
      .getByRole("searchbox", { name: "Search this site", exact: true })
      .fill("published entry 124");
    await expect(site.getByRole("status")).toHaveText("1–1 of 1 documents");
    await site.locator("#site-documents a").click();
    await expect(
      site.getByRole("heading", { name: "Published entry 124", exact: true }),
    ).toBeVisible();
    const plain = await browser.newContext({ javaScriptEnabled: false });
    try {
      const fallback = await plain.newPage();
      await fallback.goto(host.url);
      await expect(fallback.locator(".document-list a")).toHaveCount(
        report.documents.length,
      );
      await fallback
        .getByRole("link", { name: "Published entry 124", exact: true })
        .click();
      await expect(
        fallback.getByRole("heading", {
          name: "Published entry 124",
          exact: true,
        }),
      ).toBeVisible();
    } finally {
      await plain.close();
    }
  } finally {
    await context.close();
    await host.close();
  }
});

test("generates offline after an app restart and keeps export and published navigation accessible on mobile", async ({
  page,
  context,
}) => {
  test.setTimeout(150000);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
      timeout: 90000,
    })
    .toBe(true);
  await expect
    .poll(
      () =>
        page.evaluate(
          async () => !!(await caches.match(new URL("./", location.href).href)),
        ),
      { timeout: 90000 },
    )
    .toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await context.setOffline(true);
  await page.reload();
  await readerReady(page);
  const { dialog, files } = await website(page);
  await expect(dialog).toContainText("Website ZIP ready");
  const scan = await new AxeBuilder({ page }).analyze();
  expect(
    scan.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/openmdviewer-site-export-mobile.png" });
  await context.setOffline(false);
  const host = await serve(files),
    site = await context.newPage();
  try {
    await site.setViewportSize({ width: 390, height: 844 });
    await site.goto(host.url);
    await site.locator(".sidebar summary").click();
    await expect(site.locator("#site-documents a").first()).toBeVisible();
    await site.locator("#site-documents a").first().click();
    await expect(site.locator(".sidebar details")).not.toHaveAttribute(
      "open",
      "",
    );
    expect(
      await site.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const a11y = await new AxeBuilder({ page: site }).analyze();
    expect(
      a11y.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await site.screenshot({
      path: "/tmp/openmdviewer-exported-site-mobile.png",
    });
  } finally {
    await site.close();
    await host.close();
  }
});

test.describe("website worker cancellation", () => {
  test.use({ serviceWorkers: "block" });
  test("cancels a stalled worker and retries without changing the workspace", async ({
    page,
    context,
  }) => {
    await context.route("**/site-worker.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: 'postMessage({type:"ready"});onmessage=()=>{while(true){}};',
      }),
    );
    const dialog = await openExporter(page);
    await dialog
      .getByRole("button", { name: "Generate website ZIP", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Cancel export", exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Cancel export", exact: true })
      .click();
    await expect(dialog.getByRole("status")).toContainText("canceled");
    await expect(
      dialog.getByRole("button", { name: "Download website ZIP", exact: true }),
    ).toHaveCount(0);
    await context.unroute("**/site-worker.js");
    await dialog
      .getByRole("button", { name: "Generate website ZIP", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Download website ZIP", exact: true }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await readerReady(page);
  });
});

test("exports current source edits through the document export action", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Split view", exact: true }).click();
  await page
    .locator(".cm-content")
    .fill("# Latest publication snapshot\n\nPENDING_EXPORT_CONTENT_TOKEN");
  await page
    .getByRole("button", { name: "Export document", exact: true })
    .click();
  await page.getByRole("button", { name: /^Documentation website/ }).click();
  const dialog = page.getByRole("dialog", {
    name: "Export documentation website",
    exact: true,
  });
  const { files } = await website(page, dialog);
  expect(Buffer.from(files["search-data.js"]).toString()).toContain(
    "PENDING_EXPORT_CONTENT_TOKEN",
  );
  const report = JSON.parse(
    Buffer.from(files["export-report.json"]).toString(),
  );
  const document = report.documents.find(
    (item: { title: string }) => item.title === "Latest publication snapshot",
  );
  expect(document).toBeTruthy();
  expect(Buffer.from(files[document.url]).toString()).toContain(
    "PENDING_EXPORT_CONTENT_TOKEN",
  );
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Latest publication snapshot",
      exact: true,
    }),
  ).toBeVisible();
});
