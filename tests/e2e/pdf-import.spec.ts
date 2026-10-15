import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { unzipSync } from "fflate";
const fixture = (name: string) =>
  join(process.cwd(), "tests/fixtures/pdf", name);
const dialog = (page: Page) =>
  page.getByRole("dialog", { name: "Convert documents", exact: true });
async function choose(page: Page, name: string) {
  await page.locator('input[type="file"]').first().setInputFiles(fixture(name));
  return dialog(page);
}
async function ready(page: Page) {
  await expect(
    dialog(page).getByRole("button", {
      name: "Import converted files",
      exact: true,
    }),
  ).toBeVisible();
  return dialog(page);
}
async function apply(page: Page) {
  const modal = await ready(page);
  await modal
    .getByRole("button", { name: "Import converted files", exact: true })
    .click();
  await expect(modal).not.toBeVisible();
}
async function archive(page: Page) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: /Entire workspace/ }).click();
  const stream = await (await downloading).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return unzipSync(Buffer.concat(chunks));
}
test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
});

test("extracts actual multi-page PDF text with accurate page notices, literal Markdown safety and unchanged source bytes", async ({
  page,
}) => {
  const contacted: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("pdf-attacker.invalid"))
      contacted.push(request.url());
  });
  await choose(page, "extractable.pdf");
  const modal = await ready(page);
  await expect(modal).toContainText(
    "3 source pages · 2 with extractable text · 1 without text",
  );
  const markdown = await modal
    .getByRole("textbox", { name: "Converted Markdown preview" })
    .inputValue();
  expect(markdown).toContain("Local PDF fixture");
  expect(markdown).toContain("café, naïve, résumé, Ångström");
  expect(markdown).toContain("## Page 3");
  expect(markdown).toContain("no extractable text");
  await page.screenshot({ path: "/tmp/openmdviewer-pdf-desktop.png" });
  await apply(page);
  await expect(
    page.getByRole("heading", { name: "Page 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Page 2", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: /Literal heading marker/ }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as typeof window & { __pdfScript?: boolean }).__pdfScript,
    ),
  ).toBeUndefined();
  expect(contacted).toEqual([]);
  const zip = await archive(page);
  expect(Buffer.from(zip["Imported/_sources/extractable.pdf"])).toEqual(
    await readFile(fixture("extractable.pdf")),
  );
  expect(Buffer.from(zip["Imported/extractable.md"]).toString()).toBe(markdown);
});

test("requests PDF passwords locally, retries incorrect passwords and does not export the password", async ({
  page,
}) => {
  let modal = await choose(page, "password.pdf");
  await expect(modal.getByLabel("PDF password")).toBeVisible();
  await expect(modal.getByLabel("PDF password")).toBeFocused();
  await modal.getByLabel("PDF password").fill("wrong-fixture-password");
  await modal
    .getByRole("button", { name: "Unlock PDF locally", exact: true })
    .click();
  await expect(modal).toContainText("password was not accepted");
  await modal.getByLabel("PDF password").fill("fixture-open");
  await modal.getByLabel("PDF password").press("Enter");
  modal = await ready(page);
  await expect(modal).toContainText(
    "1 source page · 1 with extractable text · 0 without text",
  );
  await apply(page);
  await expect(page.locator(".markdown-body")).toContainText(
    "Unlocked local PDF",
  );
  const zip = await archive(page);
  expect(Buffer.from(zip["Imported/password.md"]).toString()).not.toContain(
    "fixture-open",
  );
  expect(Buffer.from(zip["Imported/_sources/password.pdf"])).toEqual(
    await readFile(fixture("password.pdf")),
  );
  await page.reload();
  await expect(page.locator(".markdown-body")).toContainText(
    "Unlocked local PDF",
  );
});

test("image-only PDFs show an explicit no-text result and preserve the original instead of claiming OCR", async ({
  page,
}) => {
  await choose(page, "scan-only.pdf");
  const modal = await ready(page);
  await expect(modal).toContainText(
    "1 source page · 0 with extractable text · 1 without text",
  );
  const markdown = await modal
    .getByRole("textbox", { name: "Converted Markdown preview" })
    .inputValue();
  expect(markdown).not.toContain("HUMAN-READABLE SCAN FIXTURE");
  expect(markdown).toContain("OCR is not included");
  await apply(page);
  await expect(page.locator(".markdown-body")).toContainText(
    "no extractable text",
  );
  await expect(
    page.getByRole("link", { name: "scan-only.pdf", exact: true }),
  ).toBeVisible();
});

test("rotated and two-column text remains available with a reading-order notice", async ({
  page,
}) => {
  await choose(page, "layout.pdf");
  const modal = await ready(page);
  const markdown = await modal
    .getByRole("textbox", { name: "Converted Markdown preview" })
    .inputValue();
  for (const text of [
    "Left column first.",
    "Left column end.",
    "Right column first.",
    "Right column end.",
    "Rotated source page",
    "日本語のテキスト",
  ])
    expect(markdown).toContain(text);
  await modal.getByText("Conversion notices", { exact: true }).click();
  await expect(modal).toContainText("review complex reading order");
});

test("PDF conversion remains accessible on mobile and the cached parser extracts text after an offline restart", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  await choose(page, "extractable.pdf");
  let modal = await ready(page);
  expect(
    (await new AxeBuilder({ page }).include("dialog[open]").analyze())
      .violations,
  ).toEqual([]);
  expect(
    await modal.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/openmdviewer-pdf-mobile.png" });
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
  await choose(page, "layout.pdf");
  modal = await ready(page);
  await expect(modal).toContainText("3 source pages");
  await apply(page);
  await expect(page.locator(".markdown-body")).toContainText(
    "日本語のテキスト",
  );
});

test.describe("PDF parser cancellation", () => {
  test.use({ serviceWorkers: "block" });
  let restore: { path: string; data: Buffer } | null = null;
  test.afterEach(async () => {
    if (restore) {
      await writeFile(restore.path, restore.data);
      restore = null;
    }
  });
  test("canceling a conversion terminates its nested parser and a retry starts fresh", async ({
    page,
    context,
    baseURL,
  }) => {
    test.skip(
      !baseURL?.startsWith("http://127.0.0.1"),
      "Uses an isolated local static-worker fixture.",
    );
    const path = join(
      process.env.STATIC_TEST_DIR || "out",
      (process.env.TEST_BASE_PATH || "").replace(/^\//, ""),
      "pdf-worker.js",
    );
    restore = { path, data: await readFile(path) };
    await writeFile(path, "while(true){}");
    const cdp = await context.newCDPSession(page);
    const parserTargets = async () =>
      (await cdp.send("Target.getTargets")).targetInfos.filter(
        (target) =>
          target.type === "worker" && target.url.endsWith("/pdf-worker.js"),
      );
    const modal = await choose(page, "extractable.pdf");
    await expect.poll(async () => (await parserTargets()).length).toBe(1);
    await modal
      .getByRole("button", { name: "Cancel conversion", exact: true })
      .click();
    await expect(modal.getByRole("status")).toContainText(
      "Conversion canceled",
    );
    await expect.poll(async () => (await parserTargets()).length).toBe(0);
    await writeFile(restore.path, restore.data);
    restore = null;
    await cdp.send("Network.clearBrowserCache");
    await modal
      .getByRole("button", { name: "Retry conversion", exact: true })
      .click();
    await ready(page);
    await expect(modal).toContainText("3 source pages");
    await expect.poll(async () => (await parserTargets()).length).toBe(0);
    await cdp.detach();
  });
});

test("malformed PDFs fail without creating a derived document or source attachment", async ({
  page,
}) => {
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "Invalid.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("This is not a PDF"),
    });
  const modal = dialog(page);
  await expect(modal.getByRole("status")).toContainText("Conversion failed");
  await expect(
    modal.getByRole("button", { name: "Import converted files", exact: true }),
  ).toHaveCount(0);
  const stored = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open("openmdviewer");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            read = db
              .transaction("workspaceAssets")
              .objectStore("workspaceAssets")
              .getAll();
          read.onsuccess = () => {
            resolve(
              read.result.filter((asset) => asset.path.includes("Invalid.pdf"))
                .length,
            );
            db.close();
          };
        };
      }),
  );
  expect(stored).toBe(0);
});

test("HTML links into PDF pages use actual heading IDs and preserve the selected input order", async ({
  page,
}) => {
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles([
      {
        name: "Index.html",
        mimeType: "text/html",
        buffer: Buffer.from(
          '<h1>PDF reading index</h1><a href="layout.pdf#page=2">Open PDF page two</a>',
        ),
      },
      {
        name: "layout.pdf",
        mimeType: "application/pdf",
        buffer: await readFile(fixture("layout.pdf")),
      },
    ]);
  const modal = await ready(page);
  await expect(
    modal.getByRole("combobox", { name: "Converted document" }),
  ).toHaveValue("0");
  expect(
    await modal
      .getByRole("textbox", { name: "Converted Markdown preview" })
      .inputValue(),
  ).toContain("layout.md#page-2-1");
  await apply(page);
  await expect(
    page.getByRole("heading", { name: "PDF reading index", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Open PDF page two", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Page 2", exact: true, level: 2 }),
  ).toHaveAttribute("id", "user-content-page-2-1");
  await expect(
    page.getByRole("heading", { name: "Page 2", exact: true, level: 2 }),
  ).toBeInViewport();
});
