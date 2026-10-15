import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function openPalette(page: Page) {
  await page.keyboard.press("Control+k");
  const input = page.getByRole("combobox", {
    name: "Search documents and commands",
  });
  await expect(input).toBeFocused();
  return input;
}
async function command(page: Page, query: string, label: string) {
  const input = await openPalette(page);
  await input.fill(`> ${query}`);
  await page.getByRole("option", { name: label, exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
});

test("fuzzy commands support virtual keyboard focus, wrapping, Enter, and Escape", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const trigger = page.getByRole("button", { name: /^Search files/ });
  await trigger.click();
  const input = page.getByRole("combobox", {
    name: "Search documents and commands",
  });
  await expect(input).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(input).toBeFocused();
  await input.fill(">");
  await expect(
    page
      .getByRole("listbox", { name: "Documents and commands" })
      .getByRole("option"),
  ).toHaveCount(24);
  await expect(page.locator(".search-result")).toHaveCount(0);
  await expect(
    page.getByRole("option", { name: "Open files", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await input.press("ArrowUp");
  const last = page.getByRole("option", {
    name: "Toggle presentation mode",
    exact: true,
  });
  await expect(last).toHaveAttribute("aria-selected", "true");
  await expect(input).toHaveAttribute(
    "aria-activedescendant",
    (await last.getAttribute("id"))!,
  );
  await expect(input).toBeFocused();
  await input.press("ArrowDown");
  await expect(
    page.getByRole("option", { name: "Open files", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await input.fill("settngs");
  await expect(
    page.getByRole("option", { name: "Reading settings", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("command search remains accessible with virtual selection", async ({
  page,
}) => {
  const input = await openPalette(page);
  await input.fill("settngs");
  await expect(
    page.getByRole("option", { name: "Reading settings", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  const axe = await new AxeBuilder({ page }).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/command-palette.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
});

test("command dialogs close before search reopens and restores its trigger focus", async ({
  page,
}) => {
  const trigger = page.getByRole("button", { name: /^Search files/ });
  await trigger.click();
  const input = page.getByRole("combobox", {
    name: "Search documents and commands",
    exact: true,
  });
  await expect(input).toBeFocused();
  await input.fill("settngs");
  await expect(
    page.getByRole("option", { name: "Reading settings", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await input.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Make yourself at home" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Make yourself at home" }),
  ).not.toBeVisible();
  const search = await openPalette(page);
  await search.fill("grph");
  await expect(
    page.getByRole("option", { name: "Show workspace graph", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await search.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Workspace graph" }).locator("canvas"),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Workspace graph" }),
  ).not.toBeVisible();
  await trigger.click();
  await expect(
    page.getByRole("combobox", { name: "Search documents and commands" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("command routes open existing tools and change reading modes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const [query, label, title] of [
    ["workspaces", "Manage workspaces", "Your local workspaces"],
    ["properties", "Document properties", "Document properties"],
    ["history", "Version history", "Document history"],
    ["analyze document", "Analyze document", "Document health"],
    ["workspace health", "Analyze workspace health", "Workspace health"],
    ["trash", "Open workspace trash", "Workspace trash"],
    ["help", "Help and shortcuts", "A quieter place for Markdown"],
    ["create document", "Create document", "A fresh page"],
  ]) {
    await command(page, query, label);
    const dialog = page.getByRole("dialog", { name: title, exact: true });
    await expect(dialog).toBeVisible();
    if (label === "Create document") {
      await dialog
        .getByRole("textbox", { name: "File path", exact: true })
        .fill("Notes/Unsubmitted.md");
      await page.keyboard.press("Control+k");
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole("textbox", { name: "File path", exact: true }),
      ).toHaveValue("Notes/Unsubmitted.md");
    }
    await dialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
  }
  await command(page, "source", "Source view");
  await expect(page.locator(".cm-content")).toContainText(
    "Configuration Guide",
  );
  await command(page, "split", "Split view");
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await command(page, "reading view", "Reading view");
  await expect(page.locator(".cm-content")).toHaveCount(0);
  await command(page, "theme", "Toggle light and dark theme");
  await expect(page.locator(".workspace")).toHaveClass(/theme-light/);
  await command(page, "focus", "Toggle focus mode");
  await expect(page.locator(".workspace")).toHaveClass(/focus-mode/);
  await openPalette(page);
  await page.keyboard.press("Escape");
  await expect(page.locator(".workspace")).toHaveClass(/focus-mode/);
  await page.keyboard.press("Escape");
  await command(page, "presentation", "Toggle presentation mode");
  await expect(page.locator(".workspace")).toHaveClass(/presentation-mode/);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("palette invokes file import, Markdown and ZIP downloads, clipboard, and printing the rendered document", async ({
  page,
  context,
}) => {
  const chooser = page.waitForEvent("filechooser");
  await command(page, "open files", "Open files");
  await (
    await chooser
  ).setFiles({
    name: "Palette.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Palette import\n\nLocal source only."),
  });
  await expect(
    page.getByRole("heading", { name: "Palette import", exact: true }),
  ).toBeVisible();
  const markdown = page.waitForEvent("download");
  await command(page, "download markdown", "Download Markdown");
  expect((await markdown).suggestedFilename()).toBe("Palette.md");
  const archive = page.waitForEvent("download");
  await command(page, "workspace zip", "Export workspace ZIP");
  expect((await archive).suggestedFilename()).toBe(
    "openmdviewer-workspace.zip",
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await command(page, "clipboard", "Copy Markdown");
  await expect(
    page.getByText("Markdown copied.", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "# Palette import\n\nLocal source only.",
  );
  await command(page, "source view", "Source view");
  await expect(page.locator(".cm-content")).toContainText("Palette import");
  await page.evaluate(() => {
    const target = window as Window & {
      __printed?: { hasDialog: boolean; hasDocument: boolean };
    };
    window.print = () => {
      target.__printed = {
        hasDialog: !!document.querySelector("dialog[open]"),
        hasDocument: !!document.querySelector("article h1"),
      };
    };
  });
  await command(page, "export pdf", "Print or save as PDF");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { __printed?: unknown }).__printed,
      ),
    )
    .toEqual({ hasDialog: false, hasDocument: true });
});

test.describe("without a document search worker", () => {
  // A service-worker cache must not satisfy the intentionally aborted request.
  test.use({ serviceWorkers: "block" });
  test("commands remain usable without a document index and document-only actions stay hidden in an empty workspace", async ({
    page,
  }) => {
    await page.route("**/search-worker.js", (route) => route.abort());
    await page.reload();
    const input = await openPalette(page);
    await input.fill("configuraton");
    await expect(
      page.getByText(/Document search is unavailable/),
    ).toBeVisible();
    await input.fill("> settings");
    await page
      .getByRole("option", { name: "Reading settings", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Make yourself at home" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await command(page, "workspaces", "Manage workspaces");
    await page
      .getByRole("button", { name: "New workspace", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Workspace name", exact: true })
      .fill("Empty palette fixture");
    await page
      .getByRole("button", { name: "Create workspace", exact: true })
      .click();
    await expect(page.getByText("0 documents, all local")).toBeVisible();
    const empty = await openPalette(page);
    await empty.fill(">");
    await expect(
      page.getByRole("option", { name: "Copy Markdown", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("option", { name: "Source view", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("option", { name: "Create document", exact: true }),
    ).toBeVisible();
    await empty.fill("> zzzz-unavailable-command");
    await expect(page.getByText(/No matching commands/)).toBeVisible();
    await empty.press("Enter");
    await expect(
      page.getByRole("dialog", { name: "Search your workspace", exact: true }),
    ).toBeVisible();
  });
});

test("mobile commands reveal backlinks and keyboard search still opens a document", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("complementary", { name: "Document details" }),
  ).toHaveCount(0);
  await command(page, "incoming", "Show backlinks");
  const details = page.getByRole("complementary", { name: "Document details" });
  await expect(details).toBeVisible();
  await expect(details.getByRole("tab", { name: /Backlinks/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const input = await openPalette(page);
  await input.fill("Markdown Showcase");
  const result = page.getByRole("option", { name: /Markdown Showcase Docs/ });
  await expect(result).toHaveAttribute("aria-selected", "true");
  await input.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Markdown Showcase", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
