import { test, expect, type Page, type Download } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
const manifest = ".openmdviewer/workspace.json";
async function bytes(download: Download) {
  return readFile((await download.path())!);
}
async function exportZip(page: Page) {
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search documents and commands" })
    .fill("> export workspace zip");
  const download = page.waitForEvent("download");
  await page
    .getByRole("option", { name: "Export workspace ZIP", exact: true })
    .click();
  return bytes(await download);
}
async function records(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{
        documents: {
          id: string;
          path: string;
          content: string;
          workspaceId: string;
        }[];
        collections: {
          id: string;
          workspaceId: string;
          name: string;
          kind: string;
          documentIds?: string[];
        }[];
      }>((resolve, reject) => {
        const request = indexedDB.open("openmdviewer");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(["documents", "collections"]);
          const docs = tx.objectStore("documents").getAll(),
            collections = tx.objectStore("collections").getAll();
          tx.oncomplete = () => {
            resolve({
              documents: docs.result,
              collections: collections.result,
            });
            db.close();
          };
          tx.onerror = () => {
            reject(tx.error);
            db.close();
          };
        };
      }),
  );
}
test("workspace ZIP backups restore scoped collection criteria and stable memberships under path collisions", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  const source = "# Collection source\r\n\r\nPreserve original Markdown.\r\n";
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Collection.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(source),
    });
  await expect(
    page.getByRole("heading", { name: "Collection source", exact: true }),
  ).toBeVisible();
  const original = (await records(page)).documents.find(
    (doc) => doc.content === source,
  )!;
  await page.evaluate(
    (doc) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("openmdviewer");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(["workspaces", "collections"], "readwrite"),
            table = tx.objectStore("collections");
          const common = {
            workspaceId: "default",
            revision: 0,
            createdAt: 1,
            updatedAt: 1,
          };
          table.add({
            ...common,
            id: "manual-fixture",
            name: "Reading",
            kind: "manual",
            documentIds: [doc.id],
          });
          table.add({
            ...common,
            id: "tag-fixture",
            name: "Tagged API",
            kind: "tag",
            tag: "api",
          });
          table.add({
            ...common,
            id: "search-fixture",
            name: "Saved query",
            kind: "search",
            query: 'heading:configuration "local"',
            options: { literal: true, caseSensitive: false, wholeWord: false },
          });
          tx.objectStore("workspaces").add({
            id: "outside",
            name: "Other",
            icon: "📁",
            description: "",
            createdAt: 1,
            initialized: true,
          });
          table.add({
            ...common,
            id: "outside-fixture",
            workspaceId: "outside",
            name: "Outside private query",
            kind: "search",
            query: "private-marker-do-not-export",
            options: { literal: false, caseSensitive: false, wholeWord: false },
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            reject(tx.error);
            db.close();
          };
        };
      }),
    original,
  );
  const before = await records(page);
  const archive = await exportZip(page);
  const files = unzipSync(archive);
  const metadata = JSON.parse(strFromU8(files[manifest]));
  expect(metadata.collections).toHaveLength(3);
  expect(metadata.collections).toEqual(
    expect.arrayContaining([
      { name: "Reading", kind: "manual", documentPaths: [original.path] },
      { name: "Tagged API", kind: "tag", tag: "api" },
      {
        name: "Saved query",
        kind: "search",
        query: 'heading:configuration "local"',
        options: { literal: true, caseSensitive: false, wholeWord: false },
      },
    ]),
  );
  expect(strFromU8(files[manifest])).not.toContain("private-marker");
  expect(strFromU8(files[manifest])).not.toContain(original.id);
  await page.locator("input[type=file]").first().setInputFiles({
    name: "backup.zip",
    mimeType: "application/zip",
    buffer: archive,
  });
  await expect(
    page.getByText("32 documents, all local", { exact: true }),
  ).toBeVisible();
  const after = await records(page);
  const imported = after.collections.find(
    (c) => c.name === "Reading (imported 2)",
  )!;
  expect(imported.id).not.toBe("manual-fixture");
  expect(imported.documentIds).toHaveLength(1);
  expect(imported.documentIds).not.toContain(original.id);
  const member = after.documents.find(
    (doc) => doc.id === imported.documentIds![0],
  )!;
  expect(member.path).toBe(`Imports/Batch 2/${original.path}`);
  expect(member.content).toBe(source);
  expect(after.documents.find((d) => d.id === original.id)).toEqual(
    before.documents.find((d) => d.id === original.id),
  );
  await page.reload();
  await expect(
    page.getByText("32 documents, all local", { exact: true }),
  ).toBeVisible();
  expect((await records(page)).collections).toEqual(after.collections);
  const restored = JSON.parse(
    strFromU8(unzipSync(await exportZip(page))[manifest]),
  );
  expect(
    restored.collections.find((c: { name: string }) => c.name === imported.name)
      .documentPaths,
  ).toEqual([member.path]);
  // Corrupted definitions reject the complete archive before anything is persisted.
  metadata.collections.find(
    (item: { kind: string }) => item.kind === "manual",
  ).documentPaths = ["missing.md"];
  files[manifest] = strToU8(JSON.stringify(metadata));
  const unchanged = await records(page);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "invalid.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zipSync(files)),
    });
  await expect(page.locator(".toast")).toContainText(
    "missing from this archive",
  );
  expect(await records(page)).toEqual(unchanged);
});

import AxeBuilder from "@axe-core/playwright";
async function library(page: Page) {
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search documents and commands" })
    .fill("> collections");
  await page
    .getByRole("option", { name: "Browse collections", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Collections", exact: true });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "New collection", exact: true }),
  ).toBeEnabled();
  return dialog;
}
async function fixtures(page: Page) {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles([
      {
        name: "Alpha.md",
        mimeType: "text/markdown",
        buffer: Buffer.from(
          "---\ntags: [api]\nowner: Tests\n---\n\n# Alpha article\n\n## Recovery\n\nnebula_keep is the recovery marker. [Missing](Missing.md).\n",
        ),
      },
      {
        name: "Beta.md",
        mimeType: "text/markdown",
        buffer: Buffer.from(
          "---\ntags: [ops]\nowner: Tests\nlast_reviewed: 2026-10-01\nnext_review: 2099-01-01\n---\n\n# Beta article\n\nA separate healthy article.\n",
        ),
      },
    ]);
  await expect(
    page.getByRole("heading", { name: "Alpha article", exact: true }),
  ).toBeVisible();
}
async function createManual(page: Page, name: string) {
  const dialog = await library(page);
  await dialog
    .getByRole("button", { name: "New collection", exact: true })
    .click();
  await dialog.getByLabel("Collection name", { exact: true }).fill(name);
  await dialog.getByRole("checkbox", { name: /Alpha/ }).check();
  await dialog
    .getByRole("button", { name: "Save collection", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name, exact: true }),
  ).toBeVisible();
  return dialog;
}
test("manual groups create, edit, rename and delete without changing source or crossing workspaces", async ({
  page,
}) => {
  await fixtures(page);
  const before = await records(page);
  const dialog = await createManual(page, "Reading list");
  const view = dialog.getByRole("region", { name: "Collection documents" });
  await expect(view.getByRole("button", { name: /Alpha/ })).toBeVisible();
  await expect(view.getByRole("button", { name: /Beta/ })).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Edit collection", exact: true })
    .click();
  await dialog
    .getByLabel("Collection name", { exact: true })
    .fill("Keep reading");
  await dialog.getByRole("checkbox", { name: /Beta/ }).check();
  await dialog
    .getByRole("button", { name: "Save collection", exact: true })
    .click();
  await expect(
    view.getByRole("heading", { name: "Keep reading", exact: true }),
  ).toBeVisible();
  await expect(view.getByRole("button", { name: /Beta/ })).toBeVisible();
  expect((await records(page)).documents).toEqual(before.documents);
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "Delete Keep reading?" }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Delete collection", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "Open collection: Keep reading",
      exact: true,
    }),
  ).toHaveCount(0);
  expect((await records(page)).documents).toEqual(before.documents);
  await dialog
    .getByRole("button", { name: "New collection", exact: true })
    .click();
  await dialog
    .getByLabel("Collection name", { exact: true })
    .fill("Scoped group");
  await dialog
    .getByRole("button", { name: "Save collection", exact: true })
    .click();
  await expect(
    view.getByRole("heading", { name: "Scoped group", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Manage workspaces", exact: true })
    .click();
  const manager = page.getByRole("dialog", { name: "Your local workspaces" });
  await manager
    .getByRole("button", { name: "New workspace", exact: true })
    .click();
  await manager
    .getByLabel("Workspace name", { exact: true })
    .fill("Another collection workspace");
  await manager
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(manager).toHaveCount(0);
  const other = await library(page);
  await expect(
    other.getByRole("button", {
      name: "Open collection: Scoped group",
      exact: true,
    }),
  ).toHaveCount(0);
});
test("tag and saved-search groups use live local metadata and open actual matching passages", async ({
  page,
}) => {
  await fixtures(page);
  const dialog = await library(page);
  await dialog
    .getByRole("button", { name: "New collection", exact: true })
    .click();
  await dialog.getByLabel("Collection name", { exact: true }).fill("API group");
  await dialog
    .getByRole("combobox", { name: "Collection type", exact: true })
    .selectOption("tag");
  await dialog.getByLabel("Tag", { exact: true }).fill("API");
  await dialog
    .getByRole("button", { name: "Save collection", exact: true })
    .click();
  const view = dialog.getByRole("region", { name: "Collection documents" });
  await expect(view.getByRole("button", { name: /Alpha/ })).toBeVisible();
  await expect(view.getByRole("button", { name: /Beta/ })).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "New collection", exact: true })
    .click();
  await dialog
    .getByLabel("Collection name", { exact: true })
    .fill("Recovery query");
  await dialog
    .getByRole("combobox", { name: "Collection type", exact: true })
    .selectOption("search");
  await dialog
    .getByLabel("Saved query", { exact: true })
    .fill('heading:Recovery "nebula_keep"');
  await dialog
    .getByRole("combobox", { name: "Search matching", exact: true })
    .selectOption("literal");
  await dialog
    .getByRole("button", { name: "Save collection", exact: true })
    .click();
  await expect(view.getByRole("button", { name: /Alpha/ })).toBeVisible();
  await expect(view.getByRole("button", { name: /Beta/ })).toHaveCount(0);
  await view.getByRole("button", { name: /Alpha/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Recovery", exact: true }),
  ).toBeVisible();
  const again = await library(page);
  await again
    .getByRole("button", {
      name: "Open collection: Recovery query",
      exact: true,
    })
    .click();
  await expect(
    again
      .getByRole("region", { name: "Collection documents" })
      .getByRole("button", { name: /Alpha/ }),
  ).toBeVisible();
  await again
    .getByRole("button", { name: "Edit collection", exact: true })
    .click();
  await again.getByLabel("Saved query", { exact: true }).fill("[");
  await again
    .getByRole("combobox", { name: "Search matching", exact: true })
    .selectOption("regex");
  await again
    .getByRole("button", { name: "Save collection", exact: true })
    .click();
  await expect(again.getByRole("alert")).toContainText(
    /regular expression|regular-expression|Invalid/i,
  );
});
test("two tabs retain collection drafts and reject stale edits and deletions", async ({
  page,
  context,
}) => {
  await fixtures(page);
  const first = await createManual(page, "Original group");
  await first
    .getByRole("button", { name: "Edit collection", exact: true })
    .click();
  await first
    .getByLabel("Collection name", { exact: true })
    .fill("First draft");
  const second = await context.newPage();
  await second.goto("./");
  await expect(
    second.getByRole("heading", { name: "Alpha article", exact: true }),
  ).toBeVisible();
  const other = await library(second);
  await other
    .getByRole("button", {
      name: "Open collection: Original group",
      exact: true,
    })
    .click();
  await other
    .getByRole("button", { name: "Edit collection", exact: true })
    .click();
  await other
    .getByLabel("Collection name", { exact: true })
    .fill("Second saved");
  await other
    .getByRole("button", { name: "Save collection", exact: true })
    .click();
  await expect(
    other.getByRole("heading", { name: "Second saved", exact: true }),
  ).toBeVisible();
  await page.bringToFront();
  await first
    .getByRole("button", { name: "Save collection", exact: true })
    .click();
  await expect(first.getByRole("alert")).toContainText(
    "changed in another tab",
  );
  await expect(
    first.getByLabel("Collection name", { exact: true }),
  ).toHaveValue("First draft");
  await expect(
    first.getByRole("button", { name: "Save collection", exact: true }),
  ).toBeDisabled();
  await first
    .getByRole("button", { name: "Save draft as new collection", exact: true })
    .click();
  await expect(
    first.getByRole("heading", { name: "First draft", exact: true }),
  ).toBeVisible();
  await first
    .getByRole("button", { name: "Open collection: Second saved", exact: true })
    .click();
  await first.getByRole("button", { name: "Delete", exact: true }).click();
  await second.bringToFront();
  await other
    .getByRole("button", { name: "Edit collection", exact: true })
    .click();
  await other
    .getByLabel("Collection name", { exact: true })
    .fill("Newer saved");
  await other
    .getByRole("button", { name: "Save collection", exact: true })
    .click();
  await expect(
    other.getByRole("heading", { name: "Newer saved", exact: true }),
  ).toBeVisible();
  await page.bringToFront();
  await first
    .getByRole("button", { name: "Delete collection", exact: true })
    .click();
  await expect(first.getByRole("alert")).toContainText(
    "changed in another tab",
  );
  expect((await records(page)).collections.map((c) => c.name).sort()).toEqual([
    "First draft",
    "Newer saved",
  ]);
  await second.close();
});
test("built-in reading, review and issue views report local evidence and remain accessible on mobile", async ({
  page,
}) => {
  await fixtures(page);
  await page
    .getByRole("button", { name: "Add to favorites", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await library(page);
  const view = dialog.getByRole("region", { name: "Collection documents" });
  await expect(view.getByRole("button", { name: /Alpha/ })).toBeVisible();
  await expect(view.getByRole("button", { name: /Beta/ })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Favorites", exact: true }).click();
  await expect(view.getByRole("button", { name: /Alpha/ })).toBeVisible();
  await expect(view.getByRole("button", { name: /Beta/ })).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Needs review", exact: true })
    .click();
  await expect(view.getByRole("button", { name: /Alpha/ })).toBeVisible();
  await expect(view.getByRole("button", { name: /Beta/ })).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Documentation issues", exact: true })
    .click();
  await expect(view.getByRole("button", { name: /Alpha/ })).toBeVisible();
  const violations = (
    await new AxeBuilder({ page }).include("dialog").analyze()
  ).violations.filter((v) => ["serious", "critical"].includes(v.impact || ""));
  expect(violations).toEqual([]);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: "test-results/collections-mobile.png",
    animations: "disabled",
  });
  await dialog
    .getByRole("button", { name: "New collection", exact: true })
    .click();
  await dialog
    .getByLabel("Collection name", { exact: true })
    .fill("<img src=x onerror=alert(1)>");
  await dialog
    .getByRole("button", { name: "Save collection", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", {
      name: "<img src=x onerror=alert(1)>",
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialog.locator("img,script")).toHaveCount(0);
});
test("manual selection and saved searches paginate the complete generated collection", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  const generated: Record<string, Uint8Array> = {};
  for (let n = 0; n < 125; n++)
    generated[`Bench/Article_${String(n).padStart(3, "0")}.md`] = strToU8(
      `# Generated article ${n}\n\ncollection_marker_all\n`,
    );
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "generated.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zipSync(generated)),
    });
  await expect(
    page.getByText("140 documents, all local", { exact: true }),
  ).toBeVisible();
  const dialog = await library(page);
  await dialog
    .getByRole("button", { name: "New collection", exact: true })
    .click();
  await dialog
    .getByLabel("Collection name", { exact: true })
    .fill("Generated library");
  await dialog
    .getByLabel("Filter collection documents", { exact: true })
    .fill("Bench/");
  await expect(dialog.getByRole("checkbox")).toHaveCount(50);
  await dialog
    .getByRole("button", { name: "Select matches", exact: true })
    .click();
  await expect(
    dialog.getByText("125 selected.", { exact: false }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Next documents", exact: true })
    .click();
  await expect(dialog.getByRole("checkbox")).toHaveCount(50);
  await dialog
    .getByRole("button", { name: "Next documents", exact: true })
    .click();
  await expect(dialog.getByRole("checkbox")).toHaveCount(25);
  await dialog
    .getByRole("button", { name: "Save collection", exact: true })
    .click();
  const view = dialog.getByRole("region", { name: "Collection documents" });
  await expect(view.locator(".collection-documents li")).toHaveCount(50);
  expect(
    (await records(page)).collections.find(
      (c) => c.name === "Generated library",
    )?.documentIds,
  ).toHaveLength(125);
  await dialog
    .getByRole("button", { name: "New collection", exact: true })
    .click();
  await dialog
    .getByLabel("Collection name", { exact: true })
    .fill("Generated search");
  await dialog
    .getByRole("combobox", { name: "Collection type", exact: true })
    .selectOption("search");
  await dialog
    .getByLabel("Saved query", { exact: true })
    .fill("collection_marker_all");
  await dialog
    .getByRole("combobox", { name: "Search matching", exact: true })
    .selectOption("literal");
  await dialog
    .getByRole("button", { name: "Save collection", exact: true })
    .click();
  await expect(view.locator(".collection-documents li")).toHaveCount(50);
  await expect(view.getByRole("status")).toContainText("125 matching");
  await view.getByRole("button", { name: "Next results", exact: true }).click();
  await expect(view.getByRole("status")).toContainText("51–100");
  await view.getByRole("button", { name: "Next results", exact: true }).click();
  await expect(view.locator(".collection-documents li")).toHaveCount(25);
  await expect(
    view.getByRole("button", { name: "Next results", exact: true }),
  ).toBeDisabled();
  const desktopViolations = (
    await new AxeBuilder({ page }).include("dialog").analyze()
  ).violations.filter((v) => ["serious", "critical"].includes(v.impact || ""));
  expect(desktopViolations).toEqual([]);
  await page.screenshot({
    path: "test-results/collections-desktop.png",
    animations: "disabled",
  });
});
