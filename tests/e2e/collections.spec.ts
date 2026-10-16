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
