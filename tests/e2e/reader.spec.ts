import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("reference layout renders locally, navigates, and changes themes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("15 documents, all local")).toBeVisible();
  await expect(page.locator(".document-image")).toBeVisible();
  await page.screenshot({
    path: "test-results/desktop-reader.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Toggle light and dark theme" })
    .click();
  await expect(page.locator(".workspace")).toHaveClass(/theme-light/);
  await page.reload();
  await expect(page.locator(".workspace")).toHaveClass(/theme-light/);
  await page
    .getByRole("button", { name: "Introduction.md", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome to OpenMDViewer" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("imports untrusted Markdown safely, persists edits, and exports", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Security.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        '# Private test\n\n<script>window.pwned=true</script>\n<img src="https://example.com/tracker.png" onerror="window.pwned=true">\n\n[bad](javascript:alert(1))\n\n| A | B |\n| - | - |\n| One | Two |',
      ),
    });
  await expect(
    page.getByRole("heading", { name: "Private test" }),
  ).toBeVisible();
  await expect(page.getByText("Remote image blocked")).toBeVisible();
  expect(await page.evaluate(() => "pwned" in window)).toBe(false);
  await expect(page.locator("article script")).toHaveCount(0);
  await page.getByRole("button", { name: "Split view", exact: true }).click();
  await expect(page.locator(".cm-content")).toBeVisible();
  await page
    .locator(".cm-content")
    .fill("# Edited locally\n\nThis is my local document.");
  await expect(
    page.getByRole("heading", { name: "Edited locally" }),
  ).toBeVisible();
  await expect(
    page.locator(".bottom-status").getByText("Saved in this browser"),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Edited locally" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Export document", exact: true })
    .click();
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Markdown The original, editable source" })
    .click();
  const file = await event;
  expect(file.suggestedFilename()).toBe("Security.md");
});

test("searches, renders math and Mermaid, and supports focus", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+k");
  await page
    .getByRole("textbox", { name: "Search documents and commands" })
    .fill("Markdown Showcase");
  await page.getByRole("button", { name: /Markdown Showcase Docs/ }).click();
  await expect(page.locator(".katex").first()).toBeVisible();
  await expect(page.locator(".diagram-canvas svg")).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Toggle focus mode" }).click();
  await expect(
    page.getByRole("complementary", { name: "File navigation" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("complementary", { name: "File navigation" }),
  ).toBeVisible();
});

test("mobile reader opens files without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("15 documents, all local")).toBeVisible();
  await page.getByRole("button", { name: "Close file navigation" }).click();
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-reader.png",
    fullPage: true,
  });
});

test("reader has no serious or critical accessibility violations", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
});

test("starts offline and opens lazy rendering modules from the application cache", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) throw new Error("Service worker not active");
  });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+k");
  await page
    .getByRole("textbox", { name: "Search documents and commands" })
    .fill("Markdown Showcase");
  await page.getByRole("button", { name: /Markdown Showcase Docs/ }).click();
  await expect(page.locator(".diagram-canvas svg")).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Split view", exact: true }).click();
  await expect(page.locator(".cm-content")).toBeVisible();
});
