import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function ready(page: Page) {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
}
async function settings(page: Page) {
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search documents and commands" })
    .fill("> settings");
  await page
    .getByRole("option", { name: "Reading settings", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Make yourself at home" });
}
test("paper, independent fonts and spacing persist without changing Markdown", async ({
  page,
}) => {
  await ready(page);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Typography.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        "# Typography fixture\n\nLead paragraph.\n\n## Layout\n\nBody paragraph.\n\n```javascript\nconst ready = true;\n```\n",
      ),
    });
  await expect(
    page.getByRole("heading", { name: "Typography fixture", exact: true }),
  ).toBeVisible();
  const content = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const request = indexedDB.open("openmdviewer");
        request.onsuccess = () => {
          const db = request.result;
          const read = db
            .transaction("documents")
            .objectStore("documents")
            .getAll();
          read.onsuccess = () => {
            resolve(JSON.stringify(read.result));
            db.close();
          };
        };
      }),
  );
  const dialog = await settings(page);
  await dialog
    .getByRole("combobox", { name: "Appearance", exact: true })
    .selectOption("paper");
  await dialog
    .getByRole("combobox", { name: "Body font", exact: true })
    .selectOption("serif");
  await dialog
    .getByRole("combobox", { name: "Heading font", exact: true })
    .selectOption("mono");
  await dialog
    .getByRole("combobox", { name: "Code font", exact: true })
    .selectOption("courier");
  await dialog.getByLabel("Paragraph spacing").press("Home");
  for (let n = 0; n < 9; n++)
    await dialog.getByLabel("Paragraph spacing").press("ArrowRight");
  await dialog.getByLabel("Document padding").press("End");
  for (let n = 0; n < 8; n++)
    await dialog.getByLabel("Document padding").press("ArrowLeft");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".workspace")).toHaveClass(/theme-paper/);
  await expect(page.locator("article h1")).toHaveCSS(
    "font-family",
    /Geist.*Mono/i,
  );
  await expect(page.locator("article")).toHaveCSS("font-family", /Georgia/);
  await expect(page.locator("article pre").first()).toHaveCSS(
    "font-family",
    /Courier New/,
  );
  await expect(page.locator(".reading-surface")).toHaveCSS(
    "padding-left",
    "48px",
  );
  await expect(page.locator("article p").nth(1)).toHaveCSS(
    "margin-top",
    "18px",
  );
  await page.reload();
  await expect(page.locator(".workspace")).toHaveClass(/theme-paper/);
  await expect(page.locator("article pre").first()).toHaveCSS(
    "font-family",
    /Courier New/,
  );
  expect(
    await page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const request = indexedDB.open("openmdviewer");
          request.onsuccess = () => {
            const db = request.result;
            const read = db
              .transaction("documents")
              .objectStore("documents")
              .getAll();
            read.onsuccess = () => {
              resolve(JSON.stringify(read.result));
              db.close();
            };
          };
        }),
    ),
  ).toBe(content);
  const again = await settings(page);
  await again.getByRole("button", { name: "Reset defaults" }).click();
  await again.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".workspace")).toHaveClass(/theme-dark/);
  await expect(page.locator(".reading-surface")).toHaveCSS(
    "padding-left",
    "28px",
  );
});
test("custom palette validates contrast, persists, selects light syntax and prints neutrally", async ({
  page,
  context,
}) => {
  test.setTimeout(150000);
  await ready(page);
  const dialog = await settings(page);
  await dialog
    .getByRole("combobox", { name: "Appearance", exact: true })
    .selectOption("custom");
  await dialog.getByLabel("Background color", { exact: true }).fill("#ffffff");
  await expect(
    dialog.getByRole("button", { name: "Apply custom colors" }),
  ).toBeDisabled();
  await expect(dialog.getByRole("status")).toContainText("at least 4.5:1");
  await expect(page.locator(".workspace")).toHaveCSS(
    "background-color",
    "rgb(16, 20, 25)",
  );
  await dialog.getByLabel("Text color", { exact: true }).fill("#111111");
  await dialog.getByLabel("Accent color", { exact: true }).fill("#245ea1");
  await dialog.getByRole("button", { name: "Apply custom colors" }).click();
  await expect(page.locator(".workspace")).toHaveClass(/custom-light/);
  await expect(page.locator(".workspace")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(
    dialog.getByRole("button", { name: "Apply custom colors" }),
  ).toHaveCSS("color", "rgb(17, 17, 17)");
  const violations = (
    await new AxeBuilder({ page }).include("dialog").analyze()
  ).violations.filter((v) => ["serious", "critical"].includes(v.impact || ""));
  expect(violations).toEqual([]);
  const done = dialog.getByRole("button", { name: "Done", exact: true });
  await done.hover();
  await expect(done).toHaveCSS("color", "rgb(255, 255, 255)");
  await done.click();
  await expect(page.locator("article h1")).toHaveCSS(
    "color",
    "rgb(17, 17, 17)",
  );
  const token = page.locator(".code-token").first();
  await expect(token).toBeVisible();
  expect(await token.evaluate((el) => getComputedStyle(el).color)).toBe(
    await token.evaluate((el) => {
      const s = getComputedStyle(el);
      const c = document.createElement("span");
      c.style.color = s.getPropertyValue("--shiki-light");
      document.body.append(c);
      const color = getComputedStyle(c).color;
      c.remove();
      return color;
    }),
  );
  await page.reload();
  await expect(page.locator(".workspace")).toHaveClass(/custom-light/);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".workspace")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator("article h1")).toHaveCSS(
    "color",
    "rgb(17, 17, 17)",
  );
  await page.emulateMedia({ media: "screen" });
  const again = await settings(page);
  await again.getByLabel("Background color", { exact: true }).fill("#24183b");
  await again.getByLabel("Text color", { exact: true }).fill("#f5eaff");
  await again.getByLabel("Accent color", { exact: true }).fill("#e2b8ff");
  await again.getByRole("button", { name: "Apply custom colors" }).click();
  const darkDone = again.getByRole("button", { name: "Done", exact: true });
  await darkDone.hover();
  await expect(darkDone).toHaveCSS("color", "rgb(36, 24, 59)");
  await expect(darkDone).toHaveCSS("background-color", "rgb(245, 234, 255)");
  await darkDone.click();
  await expect(page.locator(".workspace")).toHaveClass(/custom-dark/);
  await expect(page.locator(".workspace")).toHaveCSS(
    "background-color",
    "rgb(36, 24, 59)",
  );
  await expect(
    page.getByRole("button", { name: "Reading settings", exact: true }),
  ).toHaveCSS("color", "rgb(245, 234, 255)");
  const readerViolations = (
    await new AxeBuilder({ page }).include(".workspace").analyze()
  ).violations.filter((v) => ["serious", "critical"].includes(v.impact || ""));
  expect(readerViolations).toEqual([]);
  await page.screenshot({
    path: "test-results/custom-dark-reader.png",
    animations: "disabled",
  });
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".workspace")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator("article h1")).toHaveCSS(
    "color",
    "rgb(17, 17, 17)",
  );
  await page.emulateMedia({ media: "screen" });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
      timeout: 90000,
    })
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".workspace")).toHaveClass(/custom-dark/);
  const offline = await settings(page);
  await expect(
    offline.getByLabel("Background color", { exact: true }),
  ).toHaveValue("#24183b");
  await offline.getByRole("button", { name: "Done", exact: true }).click();
});
test("mobile custom settings stay accessible and malformed saved styles cannot load external resources", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "openmdviewer.preferences",
      JSON.stringify({
        theme: "custom",
        customPalette: {
          background: "url(https://theme-attacker.invalid/track)",
          text: "#000000",
          accent: "#000000",
        },
        codeFont: "url(https://theme-attacker.invalid/font)",
        documentPadding: 999999,
        fontSize: NaN,
      }),
    ),
  );
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("theme-attacker")) requests.push(r.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const dialog = await settings(page);
  await expect(dialog.getByLabel("Document padding")).toHaveValue("64");
  const violations = (
    await new AxeBuilder({ page }).include("dialog").analyze()
  ).violations.filter((v) => ["serious", "critical"].includes(v.impact || ""));
  expect(violations).toEqual([]);
  await dialog
    .getByRole("combobox", { name: "Appearance", exact: true })
    .selectOption("paper");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(requests).toEqual([]);
  await page.screenshot({ path: "test-results/paper-mobile-reader.png" });
});
