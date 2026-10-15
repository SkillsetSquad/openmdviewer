import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { unzipSync } from "fflate";
import { conversionDocx, fixturePng } from "../fixtures/conversion-docx";
const html =
  '<!doctype html><html><head><title>Converted HTML title</title><style>body{display:none}</style></head><body><h1 id="original-title">Converted HTML heading</h1><p><strong>Bold</strong> <em>italic</em> and <a href="#section-anchor">Jump to section</a>.</p><table><tr><th>Key</th><th>Value</th></tr><tr><td>Local</td><td>42</td></tr></table><img alt="Related local image" src="picture.png"><img alt="Embedded local image" src="data:image/png;base64,' +
  Buffer.from(fixturePng).toString("base64") +
  '"><img alt="Remote image" src="https://conversion-attacker.invalid/image.png"><script>window.__convertedScript=true;fetch("https://conversion-attacker.invalid/secret")</script><iframe src="https://conversion-attacker.invalid/frame"></iframe><p><a href="javascript:alert(1)">Unsafe link text</a></p>' +
  "<p>Source spacing paragraph for exact anchor navigation.</p>".repeat(40) +
  '<h2 id="section-anchor">Section destination</h2><p>Source content remains local.</p></body></html>';
const chooser = (page: Page) => page.locator('input[type="file"]').first();
const conversion = (page: Page) =>
  page.getByRole("dialog", { name: "Convert documents", exact: true });
async function previewHtml(page: Page) {
  await chooser(page).setInputFiles([
    { name: "Source.html", mimeType: "text/html", buffer: Buffer.from(html) },
    {
      name: "picture.png",
      mimeType: "image/png",
      buffer: Buffer.from(fixturePng),
    },
  ]);
  const dialog = conversion(page);
  await expect(
    dialog.getByRole("button", { name: "Import converted files", exact: true }),
  ).toBeVisible();
  return dialog;
}
async function allDocs(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ id: string; path: string; content: string }[]>(
        (resolve, reject) => {
          const request = indexedDB.open("openmdviewer");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result,
              read = db
                .transaction("documents")
                .objectStore("documents")
                .getAll();
            read.onsuccess = () => {
              resolve(read.result);
              db.close();
            };
          };
        },
      ),
  );
}
async function readDownload(download: import("@playwright/test").Download) {
  const stream = await download.createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
});

test("previews HTML without network or execution, imports semantic Markdown and local images, and exports exact originals", async ({
  page,
}) => {
  const contacted: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("conversion-attacker.invalid"))
      contacted.push(request.url());
  });
  const before = await allDocs(page),
    dialog = await previewHtml(page);
  await page.screenshot({ path: "/tmp/openmdviewer-conversion-desktop.png" });
  const markdown = await dialog
    .getByRole("textbox", { name: "Converted Markdown preview" })
    .inputValue();
  expect(markdown).toContain("# Converted HTML heading");
  expect(markdown).not.toMatch(/<script|iframe|javascript:|display:none/);
  expect(await allDocs(page)).toEqual(before);
  const convertedDownload = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Download converted Markdown", exact: true })
    .click();
  expect((await readDownload(await convertedDownload)).toString()).toBe(
    markdown,
  );
  await dialog
    .getByRole("button", { name: "Import converted files", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Converted HTML heading", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".markdown-body table")).toContainText("42");
  const local = page.locator('.markdown-body img[alt="Related local image"]');
  await expect(local).toHaveAttribute("src", /^blob:/);
  await expect
    .poll(() => local.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(1);
  await expect(
    page.locator('.markdown-body img[alt="Embedded local image"]'),
  ).toHaveAttribute("src", /^blob:/);
  await page
    .getByRole("link", { name: "Jump to section", exact: true })
    .click();
  await expect(page.locator("#user-content-section-anchor")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Section destination", exact: true }),
  ).toBeInViewport();
  expect(contacted).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __convertedScript?: boolean })
          .__convertedScript,
    ),
  ).toBeUndefined();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const archiveDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /Entire workspace/ }).click();
  const sourceMime = await page.evaluate(
    () =>
      new Promise<{ type: string; blobType: string }>((resolve, reject) => {
        const request = indexedDB.open("openmdviewer");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            read = db
              .transaction("workspaceAssets")
              .objectStore("workspaceAssets")
              .get(["default", "Imported/_sources/Source.html"]);
          read.onsuccess = () => {
            resolve({
              type: read.result.type,
              blobType: read.result.blob.type,
            });
            db.close();
          };
        };
      }),
  );
  expect(sourceMime).toEqual({
    type: "application/octet-stream",
    blobType: "application/octet-stream",
  });
  const archive = unzipSync(await readDownload(await archiveDownload));
  expect(Buffer.from(archive["Imported/_sources/Source.html"]).toString()).toBe(
    html,
  );
  expect(Buffer.from(archive["Imported/Source.md"]).toString()).toBe(markdown);
});

test("converts actual DOCX bytes in the browser worker and retains the original and extracted image across reload", async ({
  page,
}) => {
  const original = conversionDocx();
  await chooser(page).setInputFiles({
    name: "Word.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(original),
  });
  const dialog = conversion(page);
  await expect(
    dialog.getByRole("button", { name: "Import converted files", exact: true }),
  ).toBeVisible();
  const markdown = await dialog
    .getByRole("textbox", { name: "Converted Markdown preview" })
    .inputValue();
  expect(markdown).toContain("# Converted Word document");
  expect(markdown).toContain("**Bold text**");
  expect(markdown).toContain("| Column");
  expect(markdown).not.toContain("javascript:");
  await dialog
    .getByRole("button", { name: "Import converted files", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Converted Word document", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".markdown-body img")
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBe(1);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Converted Word document", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".markdown-body img")).toHaveAttribute(
    "src",
    /^blob:/,
  );
  const bytes = await page.evaluate(
    () =>
      new Promise<number[]>((resolve, reject) => {
        const request = indexedDB.open("openmdviewer");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            read = db
              .transaction("workspaceAssets")
              .objectStore("workspaceAssets")
              .get(["default", "Imported/_sources/Word.docx"]);
          read.onsuccess = async () => {
            resolve(
              Array.from(new Uint8Array(await read.result.blob.arrayBuffer())),
            );
            db.close();
          };
        };
      }),
  );
  expect(new Uint8Array(bytes)).toEqual(original);
});

test("malformed inputs and output collisions import nothing; discarding a preview preserves the existing workspace", async ({
  page,
}) => {
  const before = await allDocs(page);
  await chooser(page).setInputFiles({
    name: "Broken.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from("not a ZIP"),
  });
  let dialog = conversion(page);
  await expect(dialog.getByRole("status")).toContainText("Conversion failed");
  expect(await allDocs(page)).toEqual(before);
  await page.keyboard.press("Escape");
  await chooser(page).setInputFiles([
    {
      name: "Same.html",
      mimeType: "text/html",
      buffer: Buffer.from("<h1>HTML</h1>"),
    },
    {
      name: "Same.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Markdown"),
    },
  ]);
  dialog = conversion(page);
  await expect(dialog.getByRole("status")).toContainText("conflicting paths");
  expect(await allDocs(page)).toEqual(before);
  await page.keyboard.press("Escape");
  dialog = await previewHtml(page);
  await page.locator(".workspace").evaluate((element) => {
    const data = new DataTransfer();
    data.items.add(
      new File(["<h1>Unreviewed replacement</h1>"], "Replacement.html", {
        type: "text/html",
      }),
    );
    element.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: data,
      }),
    );
  });
  await expect(
    page.getByText("Close the current dialog before importing more files.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("combobox", { name: "Converted document" }),
  ).toContainText("Source.html");
  expect(
    await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(true);
  await dialog
    .getByRole("button", { name: "Discard preview", exact: true })
    .click();
  expect(await allDocs(page)).toEqual(before);
  expect(
    await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(false);
});

test("cancel terminates a stalled conversion worker; a fresh retry succeeds without losing browser documents", async ({
  page,
}) => {
  const before = await allDocs(page);
  await page.route("**/conversion-worker.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: 'self.postMessage({type:"ready"});self.onmessage=()=>{self.postMessage({type:"progress",message:"Fixture conversion running"});while(true){}};',
    }),
  );
  await chooser(page).setInputFiles({
    name: "Cancel.html",
    mimeType: "text/html",
    buffer: Buffer.from("<h1>Fresh retry</h1>"),
  });
  const dialog = conversion(page);
  await expect(dialog.getByRole("status")).toContainText(
    "Fixture conversion running",
  );
  await dialog
    .getByRole("button", { name: "Cancel conversion", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("Conversion canceled");
  expect(await allDocs(page)).toEqual(before);
  await page.unroute("**/conversion-worker.js");
  await dialog
    .getByRole("button", { name: "Retry conversion", exact: true })
    .click();
  await expect(
    dialog.getByRole("textbox", { name: "Converted Markdown preview" }),
  ).toHaveValue("# Fresh retry\n");
});

test("conversion preview is accessible on mobile and the cached worker converts DOCX after an offline restart", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  let dialog = await previewHtml(page);
  expect(
    (await new AxeBuilder({ page }).include("dialog[open]").analyze())
      .violations,
  ).toEqual([]);
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/openmdviewer-conversion-mobile.png" });
  await page.keyboard.press("Escape");
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
      timeout: 90000,
    })
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await chooser(page).setInputFiles({
    name: "Offline.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(conversionDocx()),
  });
  dialog = conversion(page);
  await expect(
    dialog.getByRole("button", { name: "Import converted files", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Import converted files", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Converted Word document", exact: true }),
  ).toBeVisible();
});

test("externally linked DOCX images remain unfetched while readable text imports with a clear notice", async ({
  page,
}) => {
  const contacted: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("conversion-attacker.invalid"))
      contacted.push(request.url());
  });
  await chooser(page).setInputFiles({
    name: "Linked.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(conversionDocx({ externalImage: true })),
  });
  const dialog = conversion(page);
  await expect(
    dialog.getByRole("button", { name: "Import converted files", exact: true }),
  ).toBeVisible();
  await dialog.getByText("Conversion notices", { exact: true }).click();
  await expect(dialog).toContainText("Linked external images are blocked");
  await dialog
    .getByRole("button", { name: "Import converted files", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Converted Word document", exact: true }),
  ).toBeVisible();
  expect(contacted).toEqual([]);
});
