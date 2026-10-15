import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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
  await page.goto("./");
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
  await page.getByRole("button", { name: "Count", exact: true }).click();
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
    .getByRole("textbox", { name: "Search documents and commands" })
    .fill("configuraton");
  await expect(
    page.getByRole("button", { name: /Configuration Guide Docs/ }),
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
  await page
    .locator(".cm-content")
    .fill("# Private project note\n\nOnly in this workspace.");
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
  await page
    .locator(".cm-content")
    .fill("# New revision\n\nAn edited version.");
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
  await page.locator(".cm-content").fill("# First tab version");
  await expect(
    page.locator(".bottom-status").getByText("Saved in this browser"),
  ).toBeVisible();
  await second.getByRole("button", { name: "Split view", exact: true }).click();
  await second.locator(".cm-content").fill("# Second tab version");
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

test("migrates an existing browser database and preserves local media", async ({
  page,
}) => {
  await page.goto("icon.svg");
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
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
          blob: new Blob([bytes], { type: "image/png" }),
          type: "image/png",
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Legacy document" }),
  ).toBeVisible();
  await expect(page.getByText("1 documents, all local")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enlarge image: Legacy image" }),
  ).toHaveAttribute("src", /^blob:/);
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
    await page
      .locator(".cm-content")
      .fill("# Preserved through update\n\nDo not lose this edit.");
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
