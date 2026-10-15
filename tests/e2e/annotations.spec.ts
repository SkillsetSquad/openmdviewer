import { test, expect, type Page, type Download } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { unzipSync, strFromU8 } from "fflate";
const source =
  "# Reading notebook\n\nA private **selected passage** with useful context.\n\n## Return here\n\nAnother paragraph for later.";
async function command(page: Page, label: string) {
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search documents and commands" })
    .fill(`> ${label}`);
  await page.getByRole("option", { name: label, exact: true }).click();
}
async function bytes(file: Download) {
  const parts: Buffer[] = [];
  for await (const part of (await file.createReadStream())!)
    parts.push(Buffer.from(part));
  return Buffer.concat(parts);
}
async function load(page: Page) {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Notes.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(source),
    });
  await expect(
    page.getByRole("heading", { name: "Reading notebook", exact: true }),
  ).toBeVisible();
}
async function selectPassage(page: Page) {
  await page.locator("article strong").evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
}
async function openNotes(page: Page) {
  await page
    .getByRole("button", { name: "Notes and bookmarks", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Notes and bookmarks",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  return dialog;
}
test("saves highlights, notes and section bookmarks, exports original source and portable reading data, and works offline", async ({
  page,
  context,
}) => {
  await load(page);
  await selectPassage(page);
  let dialog = await openNotes(page);
  await expect(dialog.locator(".annotation-compose blockquote")).toHaveText(
    "selected passage",
  );
  await dialog
    .getByRole("textbox", { name: "Reading item title" })
    .fill("Important passage");
  await dialog
    .getByRole("textbox", { name: "Personal note" })
    .fill("<img src=x onerror=alert(1)> Keep this thought.");
  await dialog
    .getByRole("button", { name: "Add reading item", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toHaveText(
    "Reading item saved in this browser.",
  );
  await expect(
    dialog.getByRole("list", { name: "Saved reading items" }).locator("li"),
  ).toHaveCount(1);
  expect(await dialog.locator(".annotation-list img").count()).toBe(0);
  await dialog
    .getByRole("textbox", { name: "Reading item title" })
    .fill("Reading thought");
  await dialog
    .getByRole("textbox", { name: "Personal note" })
    .fill("Come back after lunch.");
  await dialog
    .getByRole("button", { name: "Add reading item", exact: true })
    .click();
  await expect(dialog.locator(".annotation-list li")).toHaveCount(2);
  await dialog
    .getByRole("combobox", { name: "Reading item type" })
    .selectOption("bookmark");
  await dialog
    .getByRole("combobox", { name: "Bookmark section" })
    .selectOption("user-content-return-here");
  await dialog
    .getByRole("button", { name: "Add reading item", exact: true })
    .click();
  await expect(dialog.locator(".annotation-list li")).toHaveCount(3);
  const pendingJSON = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Export JSON", exact: true })
    .click();
  const data = JSON.parse((await bytes(await pendingJSON)).toString());
  expect(data.format).toBe("openmdviewer-annotations");
  expect(
    data.documents[0].annotations.map((a: { kind: string }) => a.kind).sort(),
  ).toEqual(["bookmark", "highlight", "note"]);
  expect(data.documents[0].content).toBeUndefined();
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect
    .poll(() => page.evaluate(() => CSS.highlights.get("reader-notes")?.size))
    .toBe(1);
  const original = page.waitForEvent("download");
  await command(page, "Download Markdown");
  expect((await bytes(await original)).toString()).toBe(source);
  const zip = page.waitForEvent("download");
  await command(page, "Export workspace ZIP");
  const archive = await bytes(await zip);
  const entries = unzipSync(archive);
  expect(strFromU8(entries["Imported/Notes.md"])).toBe(source);
  const metadata = JSON.parse(
    strFromU8(entries[".openmdviewer/workspace.json"]),
  );
  expect(
    metadata.documents.find(
      (d: { path: string }) => d.path === "Imported/Notes.md",
    ).annotations,
  ).toHaveLength(3);
  await page.locator("input[type=file]").first().setInputFiles({
    name: "backup.zip",
    mimeType: "application/zip",
    buffer: archive,
  });
  await expect(page.locator(".toast")).toContainText("Imported");
  await command(page, "Notes and bookmarks");
  dialog = page.getByRole("dialog", { name: "Notes and bookmarks" });
  await dialog
    .getByRole("combobox", { name: "Reading items scope" })
    .selectOption("workspace");
  await expect(dialog.locator(".annotation-list li")).toHaveCount(6);
  await dialog
    .getByRole("searchbox", { name: "Find reading items" })
    .fill("Important passage");
  await expect(dialog.locator(".annotation-list li")).toHaveCount(2);
  await dialog
    .locator(".annotation-list li")
    .filter({ hasText: "Imports/Batch 2/Imported/Notes.md" })
    .getByRole("button", { name: "Go to location" })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("selected passage");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Reading notebook", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => CSS.highlights.get("reader-notes")?.size))
    .toBe(1);
  dialog = await openNotes(page);
  await expect(dialog.locator(".annotation-list li")).toHaveCount(3);
  const bookmark = dialog
    .locator(".annotation-list li")
    .filter({ hasText: "Return here" });
  await bookmark.getByRole("button", { name: "Go to location" }).click();
  await expect(page.locator("article")).toBeFocused();
});
test("edits and removes notes, reports lost locations after source edits, and keeps metadata across reload", async ({
  page,
}) => {
  await load(page);
  await selectPassage(page);
  let dialog = await openNotes(page);
  await dialog
    .getByRole("textbox", { name: "Reading item title" })
    .fill("Keep my quote");
  await dialog
    .getByRole("button", { name: "Add reading item", exact: true })
    .click();
  await expect(dialog.locator(".annotation-list li")).toHaveCount(1);
  await dialog
    .locator(".annotation-list")
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await dialog
    .getByRole("textbox", { name: "Personal note" })
    .fill("An updated comment");
  await dialog
    .getByRole("button", { name: "Save reading item", exact: true })
    .click();
  await expect(dialog.locator(".annotation-note")).toHaveText(
    "An updated comment",
  );
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Split view", exact: true }).click();
  await page
    .locator(".cm-content")
    .fill(source.replace("selected passage", "replacement content"));
  await expect(page.locator("article")).toContainText("replacement content");
  await expect(page.locator(".bottom-status")).toContainText(
    "Saved in this browser",
  );
  dialog = await openNotes(page);
  await expect(dialog.locator(".annotation-list li")).toContainText(
    "Location no longer found",
  );
  await expect(dialog.locator(".annotation-list blockquote")).toHaveText(
    "selected passage",
  );
  await dialog.getByRole("button", { name: "Go to location" }).click();
  await expect(page.locator(".toast")).toContainText("no longer found");
  await page.reload();
  dialog = await openNotes(page);
  await expect(dialog.locator(".annotation-list li")).toContainText(
    "An updated comment",
  );
  await dialog.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(dialog.locator(".annotation-list li")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect
    .poll(() => page.evaluate(() => CSS.highlights.has("reader-notes")))
    .toBe(false);
});
test("notes dialog works on mobile and degrades without CSS Highlights", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "Highlight", {
      value: undefined,
      configurable: true,
    });
  });
  await load(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator("article p")
    .first()
    .evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  const dialog = await openNotes(page);
  await expect(dialog).toContainText(
    "This browser cannot paint saved highlights",
  );
  await dialog
    .getByRole("button", { name: "Add reading item", exact: true })
    .click();
  await expect(dialog.locator(".annotation-list li")).toHaveCount(1);
  const violations = (
    await new AxeBuilder({ page }).analyze()
  ).violations.filter((v) => ["serious", "critical"].includes(v.impact || ""));
  expect(violations).toEqual([]);
  expect(await dialog.evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(
    true,
  );
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("workspace reading data stays isolated and stale-tab notes cannot overwrite newer document content", async ({
  page,
  context,
}) => {
  await load(page);
  let dialog = await openNotes(page);
  await dialog
    .getByRole("textbox", { name: "Personal note" })
    .fill("Only in this workspace");
  await dialog
    .getByRole("button", { name: "Add reading item", exact: true })
    .click();
  await expect(dialog.locator(".annotation-list li")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  const other = await context.newPage();
  await other.goto("./");
  await expect(
    other.getByRole("heading", { name: "Reading notebook", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Split view", exact: true }).click();
  await page
    .locator(".cm-content")
    .fill(source + "\n\nNewer content from the first tab.");
  await expect(page.locator(".bottom-status")).toContainText(
    "Saved in this browser",
  );
  dialog = await openNotes(other);
  await dialog
    .getByRole("textbox", { name: "Personal note" })
    .fill("Draft from the stale tab");
  await dialog
    .getByRole("button", { name: "Add reading item", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("Could not save");
  await expect(
    dialog.getByRole("textbox", { name: "Personal note" }),
  ).toHaveValue("Draft from the stale tab");
  await page.reload();
  await expect(page.locator("article")).toContainText(
    "Newer content from the first tab.",
  );
  const pendingReadingData = other.waitForEvent("download");
  await other
    .getByRole("button", { name: "Download pending reading data", exact: true })
    .click();
  const recoveredJSON = JSON.parse(
    (await bytes(await pendingReadingData)).toString(),
  );
  expect(recoveredJSON.documents[0].annotations).toHaveLength(2);
  await other
    .getByRole("button", { name: "Keep both versions", exact: true })
    .click();
  const recoveredNotes = other.getByRole("dialog", {
    name: "Notes and bookmarks",
    exact: true,
  });
  await expect(recoveredNotes.locator(".annotation-list li")).toHaveCount(2);
  await expect(recoveredNotes.locator(".annotation-list")).toContainText(
    "Draft from the stale tab",
  );
  await other.close();
  await page
    .getByRole("button", { name: "Manage workspaces", exact: true })
    .click();
  await page
    .getByRole("button", { name: "New workspace", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Workspace name", exact: true })
    .fill("Separate reading");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "A little space for your words.",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Notes.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(source),
    });
  dialog = await openNotes(page);
  await dialog
    .getByRole("combobox", { name: "Reading items scope" })
    .selectOption("workspace");
  await expect(dialog.locator(".annotation-list li")).toHaveCount(0);
});

test("paginates workspace reading items and searches across pages", async ({
  page,
}) => {
  const annotations: Record<string, unknown>[] = Array.from(
    { length: 51 },
    (_, index) => ({
      id: `note-${index}`,
      kind: "note",
      title: `Item ${index}`,
      note: `Private thought ${index}`,
      createdAt: 1000 + index,
      updatedAt: 1000 + index,
    }),
  );
  annotations.push({
    id: "far-bookmark",
    kind: "bookmark",
    title: "Far bookmark",
    note: "",
    heading: "user-content-far-target",
    createdAt: 10000,
    updatedAt: 10000,
  });
  const { zipSync, strToU8 } = await import("fflate");
  const archive = zipSync({
    "Many.md": strToU8(
      "# Many reading items\n\n" +
        "A paragraph that gives the document meaningful scroll depth.\n\n".repeat(
          60,
        ) +
        "## Far target\n\nReturn to this section.",
    ),
    ".openmdviewer/workspace.json": strToU8(
      JSON.stringify({
        format: "openmdviewer",
        version: 1,
        documents: [{ path: "Many.md", annotations }],
      }),
    ),
  });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "notes.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(archive),
    });
  const dialog = await openNotes(page);
  await expect(dialog.locator(".annotation-list li")).toHaveCount(50);
  await dialog.getByRole("button", { name: "Next items", exact: true }).click();
  await expect(dialog.locator(".annotation-list li")).toHaveCount(2);
  await dialog
    .getByRole("searchbox", { name: "Find reading items" })
    .fill("Item 50");
  await expect(dialog.locator(".annotation-list li")).toHaveCount(1);
  await expect(dialog.locator(".annotation-list li")).toContainText("Item 50");
  await expect(
    dialog.getByRole("navigation", { name: "Reading items pages" }),
  ).toHaveCount(0);
  await dialog
    .getByRole("searchbox", { name: "Find reading items" })
    .fill("Far bookmark");
  await dialog
    .getByRole("button", { name: "Go to location", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator(".document-viewport")
        .evaluate((element) => element.scrollTop),
    )
    .toBeGreaterThan(1000);
  await expect(
    page.getByRole("heading", { name: "Far target", exact: true }),
  ).toBeInViewport();
});
