import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as typeof window & {
      showDirectoryPicker?: (options: {
        mode: string;
      }) => Promise<FileSystemDirectoryHandle>;
      __directoryCalls?: { active: boolean; mode: string }[];
    };
    target.__directoryCalls = [];
    target.showDirectoryPicker = async (options) => {
      target.__directoryCalls!.push({
        active: navigator.userActivation.isActive,
        mode: options.mode,
      });
      return (await navigator.storage.getDirectory()).getDirectoryHandle(
        "Docs",
        { create: true },
      );
    };
  });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
});
async function write(page: Page, path: string, content: string) {
  await page.evaluate(
    async ({ path, content }) => {
      let directory = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle("Docs", { create: true });
      const parts = path.split("/");
      for (const name of parts.slice(0, -1))
        directory = await directory.getDirectoryHandle(name, { create: true });
      const file = await directory.getFileHandle(parts.at(-1)!, {
          create: true,
        }),
        stream = await file.createWritable();
      await stream.write(content);
      await stream.close();
    },
    { path, content },
  );
}
async function controls(page: Page) {
  await page
    .getByRole("button", { name: "Local file connection", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Local folder controls…", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Local folder connection",
    exact: true,
  });
  await expect(
    dialog.getByRole("button", {
      name: /^(Choose local folder…|Import a folder copy)$/,
    }),
  ).toBeEnabled();
  return dialog;
}
async function connect(page: Page) {
  const dialog = await controls(page);
  await dialog
    .getByRole("button", { name: "Choose local folder…", exact: true })
    .click();
  await expect(
    dialog.getByText("Scan complete.", { exact: false }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Connect folder workspace", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
}
async function documents(page: Page) {
  return page.evaluate(
    () =>
      new Promise<
        { path: string; content: string; revision: number; id: string }[]
      >((resolve, reject) => {
        const request = indexedDB.open("openmdviewer");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            read = db
              .transaction("documents")
              .objectStore("documents")
              .getAll();
          read.onsuccess = () => {
            const workspace = localStorage.getItem("openmdviewer.workspace");
            resolve(read.result.filter((doc) => doc.workspaceId === workspace));
            db.close();
          };
          read.onerror = () => {
            reject(read.error);
            db.close();
          };
        };
      }),
  );
}
async function edit(page: Page, content: string) {
  await page.getByRole("button", { name: "Source view", exact: true }).click();
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(content);
  await expect
    .poll(
      async () =>
        (await documents(page)).find((doc) => doc.path === "README.md")
          ?.content,
    )
    .toBe(content);
}

test("connects nested documents and local media with real persistent handles and explicit verified child-file saves", async ({
  page,
}) => {
  await write(
    page,
    "README.md",
    "# Folder root\n\n[Guide](guide/Start.md)\n\n![Local](guide/map.svg)",
  );
  await write(page, "guide/Start.md", "# Nested guide");
  await write(
    page,
    "guide/map.svg",
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="blue"/></svg>',
  );
  await connect(page);
  await expect(
    page.getByRole("combobox", { name: "Current workspace" }),
  ).toHaveValue(/.+/);
  const docs = await documents(page);
  expect(docs.map((doc) => doc.path).sort()).toEqual([
    "README.md",
    "guide/Start.md",
  ]);
  const initial = await controls(page);
  await initial
    .getByRole("button", { name: "Scan connected folder", exact: true })
    .click();
  await expect(
    initial.getByText("Scan complete.", { exact: false }),
  ).toBeVisible();
  await initial
    .getByRole("button", { name: "Review file README.md", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "Folder root", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".markdown-body img")).toHaveAttribute(
    "src",
    /^blob:/,
  );
  await expect
    .poll(() =>
      page
        .locator(".markdown-body img")
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBe(40);
  await page.getByRole("link", { name: "Guide", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nested guide", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __directoryCalls: { active: boolean; mode: string }[];
          }
        ).__directoryCalls,
    ),
  ).toEqual([{ active: true, mode: "read" }]);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Nested guide", exact: true }),
  ).toBeVisible();
  const dialog = await controls(page);
  await expect(dialog.getByText("Connected folder:")).toBeVisible();
  await dialog
    .getByRole("button", { name: "Scan connected folder", exact: true })
    .click();
  await expect(
    dialog.getByText("Scan complete.", { exact: false }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/openmdviewer-directory-desktop.png" });
  await dialog
    .getByRole("button", { name: "Review file README.md", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Local file connection", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await edit(page, "# Saved folder root\n");
  expect(
    await page.evaluate(async () =>
      (
        await (
          await (
            await navigator.storage.getDirectory()
          ).getDirectoryHandle("Docs")
        ).getFileHandle("README.md")
      )
        .getFile()
        .then((file) => file.text()),
    ),
  ).toContain("# Folder root");
  await page
    .getByRole("button", { name: "Local file connection", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save to connected file", exact: true })
    .click();
  await expect(
    page.getByText("Saved and verified README.md on disk."),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  const updated = await controls(page);
  await updated
    .getByRole("button", { name: "Scan connected folder", exact: true })
    .click();
  await expect(
    updated.getByText("Scan complete.", { exact: false }),
  ).toBeVisible();
  const row = updated
    .getByRole("listitem")
    .filter({ has: page.locator("code", { hasText: /^README.md$/ }) });
  await expect(row.getByText("unchanged", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __directoryCalls: { active: boolean; mode: string }[];
          }
        ).__directoryCalls,
    ),
  ).toEqual([]); // Reload retains the handle without another picker.
});

test("rescans preserve browser edits and missing files, add only new paths, and review conflicts through existing file controls", async ({
  page,
}) => {
  await write(page, "README.md", "# Original");
  await write(page, "Gone.md", "# Keep cached");
  await connect(page);
  // The first document is alphabetically Gone.md; open README through the scan report.
  let dialog = await controls(page);
  await dialog
    .getByRole("button", { name: "Scan connected folder", exact: true })
    .click();
  await expect(
    dialog.getByText("Scan complete.", { exact: false }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Review file README.md", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await edit(page, "# Browser draft");
  await write(page, "README.md", "# External change");
  await write(page, "New.md", "# New file");
  await page.evaluate(async () =>
    (
      await (await navigator.storage.getDirectory()).getDirectoryHandle("Docs")
    ).removeEntry("Gone.md"),
  );
  dialog = await controls(page);
  await dialog
    .getByRole("button", { name: "Scan connected folder", exact: true })
    .click();
  await expect(dialog.getByText("both changed", { exact: true })).toBeVisible();
  await expect(dialog.getByText("missing", { exact: true })).toBeVisible();
  const before = await documents(page);
  await dialog
    .getByRole("button", { name: "Add 1 new file", exact: true })
    .click();
  await expect(
    dialog.getByText("Added 1 document and 0 media files", { exact: false }),
  ).toBeVisible();
  const after = await documents(page);
  for (const original of before)
    expect(after.find((doc) => doc.id === original.id)).toEqual(original);
  expect(after.find((doc) => doc.path === "New.md")?.content).toBe(
    "# New file",
  );
  await dialog
    .getByRole("button", { name: "Scan connected folder", exact: true })
    .click();
  await expect(dialog.getByText("both changed", { exact: true })).toBeVisible();
  await dialog
    .getByRole("button", { name: "Review file README.md", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reload from disk", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Review file versions" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", {
      name: "Browser file version",
      exact: true,
    }),
  ).toHaveValue("# Browser draft");
});

test("supports an empty connected folder, accessible mobile scans and disconnect without deleting any cached or disk files", async ({
  page,
}) => {
  await connect(page);
  await write(page, "README.md", "# Later document");
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await controls(page);
  await dialog
    .getByRole("button", { name: "Scan connected folder", exact: true })
    .click();
  await expect(
    dialog.getByText("Scan complete.", { exact: false }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .include('[role="dialog"],dialog[open]')
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/openmdviewer-directory-mobile.png" });
  await dialog
    .getByRole("button", { name: "Add 1 new file", exact: true })
    .click();
  await expect(
    dialog.getByText("Added 1 document", { exact: false }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Disconnect folder", exact: true })
    .click();
  await expect(
    dialog.getByText("Folder disconnected.", { exact: false }),
  ).toBeVisible();
  expect((await documents(page))[0].content).toBe("# Later document");
  expect(
    await page.evaluate(async () =>
      (
        await (
          await (
            await navigator.storage.getDirectory()
          ).getDirectoryHandle("Docs")
        ).getFileHandle("README.md")
      )
        .getFile()
        .then((file) => file.text()),
    ),
  ).toBe("# Later document");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Later document", exact: true }),
  ).toBeVisible();
});

test("failed and canceled scans create no partial workspace; unsupported browsers can import a folder copy", async ({
  page,
}) => {
  await write(page, "README.md", "# Valid");
  await write(page, "Invalid.md", "\0");
  const dialog = await controls(page);
  await dialog
    .getByRole("button", { name: "Choose local folder…", exact: true })
    .click();
  await expect(
    dialog.getByText("This file contains NUL bytes.", { exact: false }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", {
      name: "Connect folder workspace",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(await folderCount(page)).toBe(0);
  await page.evaluate(() => {
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: () => {
        throw new DOMException("Canceled", "AbortError");
      },
    });
  });
  await dialog
    .getByRole("button", { name: "Choose local folder…", exact: true })
    .click();
  await expect(
    dialog.getByText("Folder operation canceled.", { exact: false }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.evaluate(() =>
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: undefined,
    }),
  );
  const fallback = await controls(page);
  await expect(
    fallback.getByRole("button", { name: "Import a folder copy", exact: true }),
  ).toBeVisible();
  const chooserPromise = page.waitForEvent("filechooser");
  await fallback
    .getByRole("button", { name: "Import a folder copy", exact: true })
    .click();
  expect((await chooserPromise).isMultiple()).toBe(true);
});

async function folderCount(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open("openmdviewer");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            count = db
              .transaction("directorySources")
              .objectStore("directorySources")
              .count();
          count.onsuccess = () => {
            resolve(count.result);
            db.close();
          };
        };
      }),
  );
}
test("canceling an in-flight directory traversal retains no partial connection", async ({
  page,
}) => {
  await write(page, "README.md", "# Original");
  await page.evaluate(() => {
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: async () => {
        const root = await (
          await navigator.storage.getDirectory()
        ).getDirectoryHandle("Docs");
        const iterator = (
          root as FileSystemDirectoryHandle & {
            values: () => AsyncIterableIterator<FileSystemFileHandle>;
          }
        ).values();
        Object.defineProperty(root, "values", {
          value: async function* () {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            yield* iterator;
          },
        });
        return root;
      },
    });
  });
  const dialog = await controls(page);
  await dialog
    .getByRole("button", { name: "Choose local folder…", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Cancel scan", exact: true })
    .click();
  await expect(
    dialog.getByText("Folder operation canceled.", { exact: false }),
  ).toBeVisible();
  expect(await folderCount(page)).toBe(0);
  await expect(
    dialog.getByRole("button", {
      name: "Connect folder workspace",
      exact: true,
    }),
  ).toHaveCount(0);
});
test("retained directory handles scan and add new documents offline without another picker", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await write(page, "README.md", "# Offline folder");
  await connect(page);
  // Load the lazy folder module before the offline restart, then wait for the complete app cache.
  let dialog = await controls(page);
  await page.keyboard.press("Escape");
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
      timeout: 90000,
    })
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Offline folder", exact: true }),
  ).toBeVisible();
  await write(page, "Offline.md", "# Added offline");
  dialog = await controls(page);
  await dialog
    .getByRole("button", { name: "Scan connected folder", exact: true })
    .click();
  await expect(
    dialog.getByText("Scan complete.", { exact: false }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Add 1 new file", exact: true })
    .click();
  await expect(
    dialog.getByText("Added 1 document", { exact: false }),
  ).toBeVisible();
  expect(
    (await documents(page)).some(
      (doc) => doc.path === "Offline.md" && doc.content === "# Added offline",
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __directoryCalls: unknown[] })
          .__directoryCalls,
    ),
  ).toEqual([]);
});

test("denied directory permission preserves the cached workspace and requests read access in its click", async ({
  page,
}) => {
  await write(page, "README.md", "# Retained offline copy");
  await connect(page);
  const before = await documents(page),
    dialog = await controls(page);
  await page.evaluate(() => {
    const target = window as typeof window & {
      __directoryPermission?: { active: boolean; mode: string };
    };
    Object.defineProperty(FileSystemHandle.prototype, "requestPermission", {
      configurable: true,
      value: async (options: { mode: string }) => {
        target.__directoryPermission = {
          active: navigator.userActivation.isActive,
          mode: options.mode,
        };
        return "denied";
      },
    });
  });
  await dialog
    .getByRole("button", { name: "Scan connected folder", exact: true })
    .click();
  await expect(
    dialog.getByText("Folder read permission was not granted.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __directoryPermission: { active: boolean; mode: string };
          }
        ).__directoryPermission,
    ),
  ).toEqual({ active: true, mode: "read" });
  expect(await documents(page)).toEqual(before);
  expect(await folderCount(page)).toBe(1);
});
