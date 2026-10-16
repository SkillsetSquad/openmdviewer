import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const source =
  "# Callout guide\n\n[Jump to hidden heading](#hidden-heading)\n\n> [!TIP]- **Outer** :rocket:\n>\n> Outer body with \\:smile:.\n>\n> > [!WARNING]- Inner\n> >\n> > ## Hidden heading\n> >\n> > Deep searchable passage :smile:.\n\n> [!release-plan]+ Launch checklist\n>\n> - Verify the release\n> - Keep the original source\n\n> [!NOTE]\n> A regular note.\n\n> \\[!NOTE]\n> An ordinary quotation.";
async function load(page: Page) {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Callouts.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(source),
    });
  await expect(
    page.getByRole("heading", { name: "Callout guide", exact: true }),
  ).toBeVisible();
}
test("native callouts fold with keyboard, reveal nested navigation targets, and retain state while reading", async ({
  page,
}) => {
  await load(page);
  const outer = page.locator("article details.callout-fold").first();
  const inner = outer.locator("details");
  await expect(outer).not.toHaveAttribute("open");
  await expect(inner).not.toHaveAttribute("open");
  const summary = outer.locator(":scope > summary");
  await expect(summary).toHaveText("Outer 🚀");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(outer).toHaveAttribute("open", "");
  await expect(outer).toContainText("Outer body with :smile:.");
  await summary.press("Space");
  await expect(outer).not.toHaveAttribute("open");
  await page
    .getByRole("button", { name: "Hidden heading", exact: true })
    .click();
  await expect(outer).toHaveAttribute("open", "");
  await expect(inner).toHaveAttribute("open", "");
  await expect(
    page.getByRole("heading", { name: "Hidden heading", exact: true }),
  ).toBeVisible();
  await summary.click();
  await page
    .getByRole("link", { name: "Jump to hidden heading", exact: true })
    .click();
  await expect(outer).toHaveAttribute("open", "");
  await summary.click();
  await page
    .getByRole("button", { name: "Search in document", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Find in document", exact: true })
    .fill("Deep searchable passage");
  await page
    .getByRole("textbox", { name: "Find in document", exact: true })
    .press("Enter");
  await expect(outer).toHaveAttribute("open", "");
  await page
    .getByRole("button", { name: "Toggle light and dark theme", exact: true })
    .click();
  await expect(outer).toHaveAttribute("open", "");
  await expect(
    page.locator("article blockquote.callout .callout-label"),
  ).toHaveText("NOTE");
  await expect(page.locator("article blockquote.quote")).toContainText(
    "[!NOTE]",
  );
  const custom = page.locator("article > details").last();
  await expect(custom).toHaveAttribute("open", "");
  await expect(custom.locator("summary")).toHaveText("Launch checklist");
});
test("print and HTML export include folded contents, downloads preserve source, and mobile/offline behavior stays accessible", async ({
  page,
  context,
}) => {
  await load(page);
  const outer = page.locator("article details.callout-fold").first();
  const inner = outer.locator("details");
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await expect(outer).toHaveAttribute("open", "");
  await expect(inner).toHaveAttribute("open", "");
  await page.emulateMedia({ media: "print" });
  await expect(
    page.getByRole("heading", { name: "Hidden heading", exact: true }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page }).include("article").analyze()
    ).violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(outer).not.toHaveAttribute("open");
  await expect(inner).not.toHaveAttribute("open");
  await page
    .getByRole("button", { name: "Export document", exact: true })
    .click();
  let pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /HTML document/ }).click();
  let chunks: Buffer[] = [];
  for await (const chunk of (await (await pending).createReadStream())!)
    chunks.push(Buffer.from(chunk));
  const html = Buffer.concat(chunks).toString();
  expect(html).toContain("Deep searchable passage 😄.");
  expect(html).not.toMatch(/<details|<summary|data-callout/);
  expect(html).toContain("Launch checklist");
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search documents and commands" })
    .fill("> Download Markdown");
  pending = page.waitForEvent("download");
  await page
    .getByRole("option", { name: "Download Markdown", exact: true })
    .click();
  chunks = [];
  for await (const chunk of (await (await pending).createReadStream())!)
    chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString()).toBe(source);
  await page.setViewportSize({ width: 390, height: 844 });
  await outer.locator(":scope > summary").click();
  await inner.locator("summary").click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (await new AxeBuilder({ page }).analyze()).violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Toggle light and dark theme", exact: true })
    .click();
  expect(
    (
      await new AxeBuilder({ page }).include("article").analyze()
    ).violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  const offline = page.locator("article details.callout-fold").first();
  await expect(offline).not.toHaveAttribute("open");
  await offline.locator(":scope > summary").click();
  await expect(offline).toHaveAttribute("open", "");
});

test("saved passage navigation reveals folded ancestors without moving the note", async ({
  page,
}) => {
  await load(page);
  await page
    .getByRole("button", { name: "Hidden heading", exact: true })
    .click();
  const outer = page.locator("article details.callout-fold").first();
  await page
    .locator("article p")
    .filter({ hasText: "Deep searchable passage" })
    .evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  await page
    .getByRole("button", { name: "Notes and bookmarks", exact: true })
    .first()
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Notes and bookmarks",
    exact: true,
  });
  await expect(dialog.locator(".annotation-compose blockquote")).toContainText(
    "Deep searchable passage",
  );
  await dialog
    .getByRole("textbox", { name: "Reading item title" })
    .fill("Inside the fold");
  await dialog
    .getByRole("button", { name: "Add reading item", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("Reading item saved");
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await outer.locator(":scope > summary").click();
  await expect(outer).not.toHaveAttribute("open");
  await page
    .getByRole("button", { name: "Notes and bookmarks", exact: true })
    .first()
    .click();
  dialog = page.getByRole("dialog", {
    name: "Notes and bookmarks",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Go to location", exact: true })
    .click();
  await expect(outer).toHaveAttribute("open", "");
  await expect(outer.locator("details")).toHaveAttribute("open", "");
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("Deep searchable passage 😄.");
});

test("sanitizing an active title retains a named disclosure without executing imported code", async ({
  page,
}) => {
  await load(page);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Safe-title.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        "# Safe title\n\n> [!WARNING]- <script>window.__calloutExecuted=true</script>\n> The safe body remains available.",
      ),
    });
  await expect(
    page.getByRole("heading", { name: "Safe title", exact: true }),
  ).toBeVisible();
  const summary = page.locator("article summary");
  await expect(summary).toHaveAccessibleName("WARNING");
  await expect(summary).toBeVisible();
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("article")).toContainText(
    "The safe body remains available.",
  );
  expect(await page.evaluate(() => "__calloutExecuted" in window)).toBe(false);
  await expect(page.locator("article script")).toHaveCount(0);
});

test("a passage selection spanning a closed callout cannot capture unseen body text", async ({
  page,
}) => {
  await load(page);
  await page.locator("article").evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  const outer = page.locator("article details.callout-fold").first();
  await expect(outer).not.toHaveAttribute("open");
  await expect(
    page.locator("article p").filter({ hasText: "Deep searchable passage" }),
  ).toBeHidden();
  await page
    .getByRole("button", { name: "Notes and bookmarks", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Notes and bookmarks",
    exact: true,
  });
  await expect(dialog.locator(".annotation-compose blockquote")).toHaveCount(0);
});

test("printed callouts keep a readable paper palette in every reading theme", async ({
  page,
}) => {
  await load(page);
  for (const theme of [
    "dark",
    "light",
    "sepia",
    "paper",
    "custom",
    "oled",
    "contrast",
    "system",
  ]) {
    await page
      .getByRole("button", { name: "Reading settings", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Appearance", exact: true })
      .selectOption(theme);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    await page.emulateMedia({ media: "print" });
    const violations = (
      await new AxeBuilder({ page }).include("article").analyze()
    ).violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    );
    expect(violations, `Print contrast in ${theme}`).toEqual([]);
    await page.emulateMedia({ media: "screen" });
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  }
});
