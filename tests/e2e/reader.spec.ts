import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function replaceEditor(page: Page, content: string) {
  // Replace the selection immediately, rather than autosaving an empty clear.
  // Native Enter events preserve line breaks in Firefox's input protocol too.
  await page.bringToFront();
  const editor = page.locator(".cm-content");
  await editor.click();
  await editor.press("ControlOrMeta+a");
  const lines = content.split("\n");
  if (!content) await editor.press("Backspace");
  else
    for (const [index, line] of lines.entries()) {
      if (index) await editor.press("Enter");
      if (line) await page.keyboard.insertText(line);
    }
  await expect(editor.locator(".cm-line")).toHaveText(lines);
}

test("reference layout renders locally, navigates, and changes themes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
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
  await page.goto("./");
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
  await replaceEditor(page, "# Edited locally\n\nThis is my local document.");
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
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search documents and commands" })
    .fill("Markdown Showcase");
  await page.getByRole("option", { name: /Markdown Showcase Docs/ }).click();
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
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open file navigation" }).click();
  await expect(page.getByText("15 documents, all local")).toBeVisible();
  await page.getByRole("button", { name: "Close file navigation" }).click();
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Toggle document details" }).click();
  await expect(
    page.getByRole("complementary", { name: "Document details" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Toggle document details" }).click();
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
  await page.goto("./");
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
  await page.goto("./");
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
  await page.locator(".document-image").first().click();
  const imageViewer = page.getByRole("dialog");
  await expect(
    imageViewer
      .getByRole("group", { name: "Image canvas", exact: true })
      .locator("img"),
  ).toBeVisible();
  await expect(imageViewer).toContainText("image/jpeg");
  await imageViewer
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search documents and commands" })
    .fill("Markdown Showcase");
  await page.getByRole("option", { name: /Markdown Showcase Docs/ }).click();
  await expect(page.locator(".diagram-canvas svg")).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Split view", exact: true }).click();
  await expect(page.locator(".cm-content")).toBeVisible();
  await page
    .getByRole("button", { name: "Workspace graph", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Workspace graph" }).locator("canvas"),
  ).toBeVisible();
  await expect(page.locator(".workspace-graph-summary")).toContainText(
    "15 of 15 documents",
  );
});

test("sorts and filters tables without changing Markdown and exports safe CSV", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Table.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        "# Table fixture\n\n| Name | Count |\n| --- | --- |\n| Zebra | 12 |\n| Alpha | 2 |\n| =FORMULA() | 3 |",
      ),
    });
  await expect(
    page.getByRole("heading", { name: "Table fixture" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sort by Count", exact: true })
    .click();
  await expect(page.locator("tbody tr").first()).toContainText("Alpha");
  await page.getByRole("textbox", { name: "Filter table rows" }).fill("Zebra");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("textbox", { name: "Filter table rows" }).fill("");
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export table as CSV", exact: true })
    .click();
  const downloaded = await event;
  expect(downloaded.suggestedFilename()).toBe("table.csv");
  const stream = await downloaded.createReadStream();
  const parts: Buffer[] = [];
  for await (const part of stream!) parts.push(Buffer.from(part));
  expect(Buffer.concat(parts).toString()).toContain("'=");
  await page.getByRole("button", { name: "Source view", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("| Zebra | 12 |");
  const source = await page.locator(".cm-content").innerText();
  expect(source.indexOf("Zebra")).toBeLessThan(source.indexOf("Alpha"));
});

test("keeps imported images local, restores them, and includes assets in ZIP backups", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles([
      {
        name: "Photo.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("# A local image\n\n![Local pixel](pixel.png)"),
      },
      {
        name: "pixel.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
          "base64",
        ),
      },
    ]);
  await expect(
    page.getByRole("heading", { name: "A local image" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enlarge image: Local pixel" }),
  ).toHaveAttribute("src", /^blob:/);
  await page
    .getByRole("button", { name: "Enlarge image: Local pixel" })
    .click();
  await expect(page.getByRole("dialog", { name: "Local pixel" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Enlarge image: Local pixel" }),
  ).toHaveAttribute("src", /^blob:/);
  await page
    .getByRole("button", { name: "Export document", exact: true })
    .click();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: /Entire workspace/ }).click();
  const downloaded = await event;
  const stream = await downloaded.createReadStream();
  const parts: Buffer[] = [];
  for await (const part of stream!) parts.push(Buffer.from(part));
  const { unzipSync } = await import("fflate");
  const archive = unzipSync(Buffer.concat(parts));
  expect(Object.keys(archive)).toContain("Imported/pixel.png");
  expect(Object.keys(archive)).toContain("Imported/Photo.md");
});

test("uses a compiled worker for fuzzy search instead of silently falling back", async ({
  page,
}) => {
  const workerEvent = page.waitForEvent("worker");
  await page.goto("./");
  const worker = await workerEvent;
  expect(worker.url()).toContain("search-worker.js");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search documents and commands" })
    .fill("configuraton");
  await expect(
    page.getByRole("option", { name: /Configuration Guide Docs/ }),
  ).toBeVisible();
});

test("creates independent workspaces and remembers the selected project", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Manage workspaces", exact: true })
    .click();
  await page
    .getByRole("button", { name: "New workspace", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Workspace name", exact: true })
    .fill("Private project");
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("A separate collection");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A little space for your words." }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Current workspace" }),
  ).toContainText("Private project");
  await page
    .getByRole("button", { name: "Create document", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "File path", exact: true })
    .fill("Project.md");
  await page
    .getByRole("button", { name: "Create document", exact: true })
    .last()
    .click();
  await expect(page.locator(".cm-content")).toBeVisible();
  await replaceEditor(
    page,
    "# Private project note\n\nOnly in this workspace.",
  );
  await expect(
    page.locator(".bottom-status").getByText("Saved in this browser"),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Current workspace" })
    .selectOption("default");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Project.md", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Current workspace" })
    .selectOption({ label: "📁 Private project" });
  await expect(
    page.getByRole("heading", { name: "Private project note", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Private project note", exact: true }),
  ).toBeVisible();
});

test("restores a revision and recovers deleted documents from trash", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Recovery.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Original revision\n\nKeep me safe."),
    });
  await page.getByRole("button", { name: "Split view", exact: true }).click();
  await replaceEditor(page, "# New revision\n\nAn edited version.");
  await expect(
    page.getByRole("heading", { name: "New revision", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".bottom-status").getByText("Saved in this browser"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Version history", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Previous revision" })
    .selectOption({ index: 1 });
  await expect(page.getByLabel("Revision comparison")).toContainText(
    "Original revision",
  );
  await page
    .getByRole("button", { name: "Restore this revision", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Original revision", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Move to trash", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Original revision", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Workspace trash", exact: true })
    .click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Workspace trash" })
      .getByText("No deleted documents."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Recovery.md", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Original revision", exact: true }),
  ).toBeVisible();
});

test("detects edits from another tab and preserves both versions on request", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Conflict.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Shared original"),
    });
  await expect(
    page.getByRole("heading", { name: "Shared original" }),
  ).toBeVisible();
  const second = await context.newPage();
  await second.goto("./");
  await expect(
    second.getByRole("heading", { name: "Shared original" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Split view", exact: true }).click();
  await replaceEditor(page, "# First tab version");
  await expect(
    page.locator(".bottom-status").getByText("Saved in this browser"),
  ).toBeVisible();
  await second.getByRole("button", { name: "Split view", exact: true }).click();
  await replaceEditor(second, "# Second tab version");
  await expect(
    second.getByRole("dialog", {
      name: "This document changed in another tab",
    }),
  ).toBeVisible();
  await second
    .getByRole("button", { name: "Keep both versions", exact: true })
    .click();
  await expect(
    second.getByRole("dialog", {
      name: "This document changed in another tab",
    }),
  ).toHaveCount(0);
  await expect(
    second.getByRole("heading", { name: "Second tab version", exact: true }),
  ).toBeVisible();
  await second
    .getByRole("button", { name: "Conflict.md", exact: true })
    .click();
  await expect(
    second.getByRole("heading", { name: "First tab version", exact: true }),
  ).toBeVisible();
  await second.close();
});

for (const format of ["blob", "bytes"] as const)
  test(`migrates an existing browser database and preserves local media (${format})`, async ({
    page,
  }, testInfo) => {
    await page.goto("icon.svg");
    const setup = await page.evaluate(async (format) => {
      return new Promise<{ error?: string }>((resolve, reject) => {
        const request = indexedDB.open("openmdviewer", 20);
        request.onupgradeneeded = () => {
          const db = request.result;
          const docs = db.createObjectStore("documents", { keyPath: "id" });
          for (const index of ["path", "updatedAt", "favorite"])
            docs.createIndex(index, index);
          db.createObjectStore("assets", { keyPath: "path" });
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(["documents", "assets"], "readwrite");
          tx.objectStore("documents").put({
            id: "legacy",
            path: "Docs/Legacy.md",
            content: "# Legacy document\n\n![Legacy image](photo.png)",
            tags: ["legacy"],
            favorite: true,
            scroll: 0,
            createdAt: 1,
            updatedAt: 1,
          });
          const bytes = Uint8Array.from(
            atob(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
            ),
            (c) => c.charCodeAt(0),
          );
          tx.objectStore("assets").put({
            path: "Docs/photo.png",
            blob:
              format === "blob"
                ? new Blob([bytes], { type: "image/png" })
                : bytes.buffer,
            type: "image/png",
          });
          tx.oncomplete = () => {
            db.close();
            resolve({});
          };
          tx.onerror = (event) => {
            const error =
              (event.target as IDBRequest).error?.message ||
              tx.error?.message ||
              "Legacy fixture write failed.";
            try {
              tx.abort();
            } catch {}
            db.close();
            resolve({ error });
          };
          tx.onabort = () => {
            const error =
              tx.error?.message || "Legacy fixture transaction aborted.";
            db.close();
            resolve({ error });
          };
        };
      });
    }, format);
    if (setup.error) {
      const nativeBlobUnavailable =
        format === "blob" &&
        setup.error.includes(
          "Error preparing Blob/File data to be stored in object store",
        );
      testInfo.annotations.push({
        type: "legacy-fixture-error",
        description: setup.error,
      });
      test.skip(
        nativeBlobUnavailable,
        "This engine cannot seed native Blob records; the separate byte-format migration case remains required.",
      );
      throw new Error(setup.error);
    }
    await page.goto("./");
    await expect(
      page.getByRole("heading", { name: "Legacy document" }),
    ).toBeVisible();
    await expect(page.getByText("1 documents, all local")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Enlarge image: Legacy image" }),
    ).toHaveAttribute("src", /^blob:/);
    const mediaBytes = await page
      .getByRole("button", { name: "Enlarge image: Legacy image" })
      .evaluate(async (element) =>
        Array.from(
          new Uint8Array(
            await (
              await fetch((element as HTMLImageElement).src)
            ).arrayBuffer(),
          ),
        ),
      );
    expect(Buffer.from(mediaBytes).toString("base64")).toBe(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
    );
    await page.getByRole("button", { name: "Favorites", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Legacy.md", exact: true }),
    ).toBeVisible();
  });

test("applies an application update after preserving pending edits", async ({
  page,
}) => {
  const { readFile, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const root = process.env.STATIC_TEST_DIR || "out";
  const script = join(
    root,
    process.env.TEST_BASE_PATH ? "openmdviewer" : "",
    "sw.js",
  );
  const original = await readFile(script, "utf8");
  try {
    await page.goto("./");
    await expect(
      page.getByRole("heading", { name: "Configuration Guide", exact: true }),
    ).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles({
        name: "Update.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("# Before the update"),
      });
    await page.getByRole("button", { name: "Split view", exact: true }).click();
    await writeFile(
      script,
      original.replace(
        /const CACHE="([^"]+)";/,
        `const CACHE="$1-test-update";`,
      ),
    );
    await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      await r?.update();
    });
    await expect(
      page.getByRole("button", {
        name: "Apply application update",
        exact: true,
      }),
    ).toBeVisible({ timeout: 30000 });
    await replaceEditor(
      page,
      "# Preserved through update\n\nDo not lose this edit.",
    );
    await Promise.all([
      page.waitForEvent("load"),
      page
        .getByRole("button", { name: "Apply application update", exact: true })
        .click(),
    ]);
    await expect(
      page.getByRole("heading", {
        name: "Preserved through update",
        exact: true,
      }),
    ).toBeVisible({ timeout: 30000 });
    expect(
      await page.evaluate(async () =>
        (await caches.keys()).some((key) => key.endsWith("-test-update")),
      ),
    ).toBe(true);
  } finally {
    await writeFile(script, original);
  }
});

test("finishes a slow import in its original workspace after switching projects", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Manage workspaces", exact: true })
    .click();
  await page
    .getByRole("button", { name: "New workspace", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Workspace name", exact: true })
    .fill("Other project");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A little space for your words." }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Current workspace" })
    .selectOption("default");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      if (this.name === "Slow.md")
        await new Promise((resolve) => setTimeout(resolve, 1000));
      return original.call(this);
    };
  });
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Slow.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Imported into the original project"),
    });
  await page
    .getByRole("combobox", { name: "Current workspace" })
    .selectOption({ label: "📁 Other project" });
  await expect(
    page.getByText(
      "Import completed in the previous workspace. Switch back to view it.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A little space for your words." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Slow.md", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Current workspace" })
    .selectOption("default");
  await page.getByRole("button", { name: "Slow.md", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Imported into the original project" }),
  ).toBeVisible();
});

test("uses frontmatter metadata in local search and navigates wiki and reference links", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles([
      {
        name: "A.md",
        mimeType: "text/markdown",
        buffer: Buffer.from(
          "---\ntitle: Operations manual\nstatus: approved\nowner: Morgan\ntags: [operations]\n---\n# Start here\n\n[[B#destination|Wiki destination]]\n\n[Reference destination][target]\n\n[target]: B.md#destination",
        ),
      },
      {
        name: "B.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("# B\n\n## Destination\n\nA linked document."),
      },
    ]);
  await expect(
    page.getByRole("heading", { name: "Start here", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "operations", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Wiki destination", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Destination", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Backlinks", exact: false }).click();
  await expect(
    page.locator(".backlinks-panel").getByRole("button", { name: /A.md/ }),
  ).toBeVisible();
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search documents and commands" })
    .fill("status:approved tag:operations Morgan");
  await page
    .getByRole("option", { name: /Operations manual Imported/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Start here", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Reference destination", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Destination", exact: true }),
  ).toBeVisible();
});

test("preserves footnote navigation and prefixes imported heading and HTML IDs", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Anchors.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        "# constructor\n\nText with a footnote.[^one]\n\n" +
          "A paragraph for scrolling.\n\n".repeat(35) +
          '[^one]: Footnote content.\n\n<p id="location">A safe custom anchor.</p>\n\n[Custom anchor](#location)',
      ),
    });
  await expect(
    page.getByRole("heading", { name: "constructor", exact: true }),
  ).toHaveAttribute("id", "user-content-constructor");
  expect(
    await page.evaluate(
      () =>
        document.getElementById("constructor") === null &&
        window.location instanceof Location,
    ),
  ).toBe(true);
  await page.locator("sup a").click();
  await expect(page.locator("section[data-footnotes] li")).toBeInViewport();
  await page.getByRole("link", { name: "Custom anchor", exact: true }).click();
  await expect(page.locator("#user-content-location")).toBeInViewport();
});

test("runs transparent local health checks, exports findings, and opens the affected source line", async ({
  page,
}) => {
  let externalRequests = 0;
  await page.route("https://example.com/**", (route) => {
    externalRequests++;
    return route.abort();
  });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Health.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        "---\nowner: Morgan\nlast_reviewed: 2000-01-01\ncustom: {retention: 30}\n---\n# Health fixture\n\n#### Skipped\n\n[Missing](Missing.md)\n\n[External](https://example.com/private)",
      ),
    });
  await page
    .getByRole("button", { name: "Analyze document", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Document health" }).getByRole("button", {
      name: /Missing local document or attachment: Imported\/Missing.md/,
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Scoring rules", exact: true }).click();
  await expect(
    page.getByText("These are deterministic checks, not AI judgments.", {
      exact: false,
    }),
  ).toBeVisible();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const file = await event;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const part of stream!) chunks.push(Buffer.from(part));
  const report = JSON.parse(Buffer.concat(chunks).toString());
  expect(report.scope).toBe("document");
  expect(report.documents).toHaveLength(1);
  expect(report.documents[0].score).toBe(
    Math.max(
      0,
      100 -
        report.documents[0].issues.reduce(
          (n: number, i: { penalty: number }) => n + i.penalty,
          0,
        ),
    ),
  );
  expect(externalRequests).toBe(0);
  await page.getByRole("tab", { name: "Findings", exact: true }).click();
  await page
    .getByRole("button", {
      name: /Missing local document or attachment: Imported\/Missing.md/,
    })
    .click();
  await expect(page.locator(".cm-activeLine")).toHaveText(
    "[Missing](Missing.md)",
  );
  await page
    .getByRole("button", { name: "Document properties", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Document properties" }),
  ).toContainText("Morgan");
  await expect(page.locator(".metadata-fields")).toContainText("retention");
});

test("opens whole-workspace health and downloads imported attachments locally", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles([
      {
        name: "Attachment.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("# Attachments\n\n[Download PDF](guide.pdf)"),
      },
      {
        name: "guide.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.0\nlocal fixture"),
      },
    ]);
  const event = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download PDF", exact: true }).click();
  expect((await event).suggestedFilename()).toBe("guide.pdf");
  await page
    .getByRole("button", { name: "Workspace health", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "Workspace health" })
      .getByText("Rule-based health"),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Documents", exact: true }).click();
  await expect(page.locator(".health-documents")).toContainText(
    "Imported/Attachment.md",
  );
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
});

test("retains multiple queued conflicts until both documents have been recovered", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles([
      {
        name: "Queue A.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("# Original A"),
      },
      {
        name: "Queue B.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("# Original B"),
      },
    ]);
  const second = await context.newPage();
  await second.goto("./");
  await expect(
    second.getByRole("heading", { name: "Original A", exact: true }),
  ).toBeVisible();
  await second.getByRole("button", { name: "Split view", exact: true }).click();
  await page.evaluate(() => {
    const marker = window as Window & {
      __saveLock?: boolean;
      __saveLockDone?: boolean;
      __saveLockRelease?: boolean;
    };
    const request = indexedDB.open("openmdviewer");
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("documents", "readwrite");
      const store = tx.objectStore("documents");
      const all = store.getAll();
      all.onsuccess = () => {
        for (const doc of all.result) {
          if (
            doc.path === "Imported/Queue A.md" ||
            doc.path === "Imported/Queue B.md"
          )
            store.put({
              ...doc,
              content: doc.path.endsWith("A.md") ? "# First A" : "# First B",
              revision: (doc.revision || 0) + 1,
            });
        }
        const until = performance.now() + 10000;
        const hold = () => {
          const pending = store.get("__keep_transaction_active__");
          pending.onsuccess = () => {
            if (!marker.__saveLockRelease && performance.now() < until) hold();
          };
        };
        marker.__saveLock = true;
        hold();
      };
      tx.oncomplete = () => {
        db.close();
        marker.__saveLockDone = true;
      };
    };
  });
  await page.waitForFunction(
    () => (window as Window & { __saveLock?: boolean }).__saveLock === true,
  );
  await expect(second.locator(".cm-content")).toHaveText("# Original A");
  await second.locator(".cm-content").click();
  await second.keyboard.press("ControlOrMeta+a");
  await second.keyboard.insertText("# Second A");
  await expect(second.locator(".cm-content")).toHaveText("# Second A");
  await second.getByRole("button", { name: "Queue B.md", exact: true }).click();
  await expect(second.locator(".cm-content")).toHaveText("# Original B");
  await second.locator(".cm-content").click();
  await second.keyboard.press("ControlOrMeta+a");
  await second.keyboard.insertText("# Second B");
  await expect(second.locator(".cm-content")).toHaveText("# Second B");
  await page.evaluate(() => {
    (window as Window & { __saveLockRelease?: boolean }).__saveLockRelease =
      true;
  });
  await page.waitForFunction(
    () =>
      (window as Window & { __saveLockDone?: boolean }).__saveLockDone === true,
  );
  const modal = second.getByRole("dialog", {
    name: "This document changed in another tab",
  });
  await expect(modal).toContainText("Queue A.md");
  await second
    .getByRole("button", { name: "Keep both versions", exact: true })
    .click();
  await expect(modal).toContainText("Queue B.md");
  await second
    .getByRole("button", { name: "Keep both versions", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  await second.reload();
  await second
    .getByRole("button", { name: "Queue A (conflict copy 1).md", exact: true })
    .click();
  await expect(
    second.getByRole("heading", { name: "Second A", exact: true }),
  ).toBeVisible();
  await second
    .getByRole("button", { name: "Queue B (conflict copy 1).md", exact: true })
    .click();
  await expect(
    second.getByRole("heading", { name: "Second B", exact: true }),
  ).toBeVisible();
  await second.getByRole("button", { name: "Queue A.md", exact: true }).click();
  await expect(
    second.getByRole("heading", { name: "First A", exact: true }),
  ).toBeVisible();
  await second.close();
});

test("explores the whole workspace graph with filters, directed links, canvas controls, and keyboard navigation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles([
      {
        name: "ConstellationA.md",
        mimeType: "text/markdown",
        buffer: Buffer.from(
          "---\ntags: [api]\n---\n# Atlas Hub\n[B](ConstellationB.md) and [B again](ConstellationB.md)",
        ),
      },
      {
        name: "ConstellationB.md",
        mimeType: "text/markdown",
        buffer: Buffer.from(
          "---\ntags: [api]\n---\n# Beacon\n[C](ConstellationC.md)",
        ),
      },
      {
        name: "ConstellationC.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("# Comet\n[D](ConstellationD.md)"),
      },
      {
        name: "ConstellationD.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("# Drift"),
      },
      {
        name: "ConstellationE.md",
        mimeType: "text/markdown",
        buffer: Buffer.from(
          "# Empty Island\n[Self](#empty-island) [Missing](missing.md)",
        ),
      },
    ]);
  await page
    .getByRole("button", { name: "Workspace graph", exact: true })
    .click();
  const modal = page.getByRole("dialog", {
    name: "Workspace graph",
    exact: true,
  });
  const list = modal.getByRole("region", { name: "Graph document list" });
  const details = modal.getByRole("region", {
    name: "Selected graph document",
  });
  await expect(
    modal.getByRole("img", { name: /Workspace document graph/ }),
  ).toBeVisible();
  await modal
    .getByRole("textbox", { name: "Search graph documents" })
    .fill("Constellation");
  await expect(list.locator(".workspace-graph-list button")).toHaveCount(5);
  await expect(modal.locator(".workspace-graph-summary")).toContainText(
    "3 directed connections shown",
  );
  await list.getByRole("button", { name: /Atlas Hub/ }).focus();
  await page.keyboard.press("Enter");
  await expect(details).toContainText("2 links");
  await details
    .getByRole("button", { name: "Explore connections", exact: true })
    .click();
  await expect(list.locator(".workspace-graph-list button")).toHaveCount(2);
  await modal
    .getByRole("combobox", { name: "Connection distance" })
    .selectOption("2");
  await expect(list.locator(".workspace-graph-list button")).toHaveCount(3);
  await modal
    .getByRole("combobox", { name: "Connection distance" })
    .selectOption("all");
  await expect(list.locator(".workspace-graph-list button")).toHaveCount(4);
  const canvas = modal.locator("canvas");
  const zoom = modal.getByRole("status", { name: "Graph zoom" });
  await modal
    .getByRole("button", { name: "Center selected", exact: true })
    .click();
  await list.getByRole("button", { name: /Beacon/ }).click();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Graph canvas is not visible");
  await canvas.click({
    position: { x: bounds.width / 2, y: bounds.height / 2 },
  });
  await expect(details.locator(":scope > strong")).toHaveText("Atlas Hub");
  const beforeWheel = await zoom.textContent();
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.wheel(0, -100);
  await expect(zoom).not.toHaveText(beforeWheel!);
  const before = await zoom.textContent();
  await modal
    .getByRole("button", { name: "Zoom graph in", exact: true })
    .click();
  await expect(zoom).not.toHaveText(before!);
  await canvas.focus();
  await page.keyboard.press("+");
  await page.keyboard.press("ArrowLeft");
  await modal.getByRole("button", { name: "Fit graph", exact: true }).click();
  await modal
    .getByRole("button", { name: "Show whole workspace", exact: true })
    .click();
  await modal
    .getByRole("textbox", { name: "Search graph documents" })
    .fill("Constellation");
  await modal
    .getByRole("combobox", { name: "Filter graph connections" })
    .selectOption("isolated");
  await expect(list.locator(".workspace-graph-list button")).toHaveCount(1);
  await expect(list).toContainText("Empty Island");
  await modal
    .getByRole("combobox", { name: "Filter graph connections" })
    .selectOption("all");
  await modal
    .getByRole("combobox", { name: "Filter graph by tag" })
    .selectOption("api");
  await expect(list.locator(".workspace-graph-list button")).toHaveCount(2);
  await list.getByRole("button", { name: /Beacon/ }).click();
  await details
    .getByRole("combobox", { name: "Link direction" })
    .selectOption("incoming");
  await expect(details).toContainText("Atlas Hub");
  await expect(details).toContainText("2 links");
  const axe = await new AxeBuilder({ page }).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/workspace-graph-desktop.png",
    fullPage: true,
  });
  await modal
    .getByRole("button", { name: "Center selected", exact: true })
    .click();
  await canvas.scrollIntoViewIfNeeded();
  const openBounds = await canvas.boundingBox();
  if (!openBounds) throw new Error("Graph canvas is not visible");
  await canvas.dblclick({
    position: { x: openBounds.width / 2, y: openBounds.height / 2 },
  });
  await expect(modal).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Beacon", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("keeps the graph usable on mobile and paginates large document lists", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles(
      Array.from({ length: 60 }, (_, i) => ({
        name: `Orbit${String(i).padStart(2, "0")}.md`,
        mimeType: "text/markdown",
        buffer: Buffer.from(`# Orbit ${i}`),
      })),
    );
  await expect(
    page.getByText(
      "Imported 60 documents and 0 media files. Kept on this device.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Close file navigation", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open file navigation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Workspace graph", exact: true })
    .click();
  const modal = page.getByRole("dialog", {
    name: "Workspace graph",
    exact: true,
  });
  const list = modal.getByRole("region", { name: "Graph document list" });
  await modal
    .getByRole("textbox", { name: "Search graph documents" })
    .fill("Orbit");
  await expect(list.locator(".workspace-graph-list button")).toHaveCount(40);
  await list
    .getByRole("button", { name: "Next documents", exact: true })
    .click();
  await expect(list.locator(".workspace-graph-list button")).toHaveCount(20);
  await list.getByRole("button", { name: /Orbit 59/ }).click();
  await expect(
    modal.getByRole("region", { name: "Selected graph document" }),
  ).toContainText("Orbit59.md");
  await expect
    .poll(() =>
      modal.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/workspace-graph-mobile.png",
    fullPage: true,
  });
  await modal
    .getByRole("button", { name: "Open document", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Orbit 59", exact: true }),
  ).toBeVisible();
});

test("indexes and explores a thousand-document workspace without creating a thousand DOM rows", async ({
  page,
}, testInfo) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("openmdviewer");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(["documents", "workspaces"], "readwrite");
        const now = Date.now();
        tx.objectStore("workspaces").put({
          id: "graph-fixture",
          name: "Graph fixture",
          description: "Synthetic browser test",
          icon: "🧪",
          initialized: true,
          createdAt: now,
        });
        for (let i = 0; i < 1200; i++) {
          tx.objectStore("documents").put({
            id: `graph-${i}`,
            workspaceId: "graph-fixture",
            path: `Scale/Node${String(i).padStart(4, "0")}.md`,
            content: `# Scale node ${i}\n\n${i < 1199 ? `[Next](Node${String(i + 1).padStart(4, "0")}.md)` : "End of chain."}`,
            tags: [`group-${i % 5}`],
            favorite: false,
            scroll: 0,
            createdAt: now,
            updatedAt: now,
            revision: 0,
          });
        }
        tx.oncomplete = () => {
          db.close();
          localStorage.setItem("openmdviewer.workspace", "graph-fixture");
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  const started = Date.now();
  await page.reload();
  await expect(page.getByText("1200 documents, all local")).toBeVisible();
  await page
    .getByRole("button", { name: "Workspace graph", exact: true })
    .click();
  const modal = page.getByRole("dialog", {
    name: "Workspace graph",
    exact: true,
  });
  await expect(modal.locator(".workspace-graph-summary")).toHaveText(
    "1200 of 1200 documents · 1199 directed connections shown · 0 isolated in workspace",
  );
  const readyMs = Date.now() - started;
  await expect(modal.locator("canvas")).toBeVisible();
  await expect(modal.locator(".workspace-graph-list button")).toHaveCount(40);
  await expect
    .poll(() =>
      modal.locator("canvas").evaluate((node: HTMLCanvasElement) => {
        const ctx = node.getContext("2d");
        if (!ctx) return 0;
        const data = ctx.getImageData(0, 0, node.width, node.height).data;
        let pixels = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i]) pixels++;
        return pixels;
      }),
    )
    .toBeGreaterThan(1000);
  await page.screenshot({
    path: "test-results/workspace-graph-scale.png",
    fullPage: true,
  });
  await modal
    .getByRole("textbox", { name: "Search graph documents" })
    .fill("Node1199.md");
  await expect(modal.locator(".workspace-graph-list button")).toHaveCount(1);
  await modal.locator(".workspace-graph-list button").click();
  await modal
    .getByRole("button", { name: "Explore connections", exact: true })
    .click();
  await expect(modal.locator(".workspace-graph-list button")).toHaveCount(2);
  await modal
    .getByRole("button", { name: "Open document", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Scale node 1199", exact: true }),
  ).toBeVisible();
  await testInfo.attach("synthetic-graph-observation", {
    body: JSON.stringify({
      documents: 1200,
      directedConnections: 1199,
      visibleListRows: 40,
      reloadIndexAndGraphReadyMs: readyMs,
      browser: "Chromium",
      scope:
        "One synthetic chain fixture on this runner; not a universal latency guarantee.",
    }),
    contentType: "application/json",
  });
});
