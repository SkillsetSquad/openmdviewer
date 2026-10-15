import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as typeof window & {
      __pickerName?: string;
      __pickerCalls?: { kind: string; active: boolean; suggested?: string }[];
      showOpenFilePicker: (options: unknown) => Promise<FileSystemFileHandle[]>;
      showSaveFilePicker: (options: {
        suggestedName: string;
      }) => Promise<FileSystemFileHandle>;
    };
    target.__pickerName = "Original.md";
    target.__pickerCalls = [];
    target.showOpenFilePicker = async () => {
      target.__pickerCalls!.push({
        kind: "open",
        active: navigator.userActivation.isActive,
      });
      return [
        await (
          await navigator.storage.getDirectory()
        ).getFileHandle(target.__pickerName!, { create: true }),
      ];
    };
    target.showSaveFilePicker = async (options) => {
      target.__pickerCalls!.push({
        kind: "save",
        active: navigator.userActivation.isActive,
        suggested: options.suggestedName,
      });
      return (await navigator.storage.getDirectory()).getFileHandle(
        target.__pickerName!,
        { create: true },
      );
    };
  });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
});
async function diskWrite(page: Page, name: string, content: string) {
  await page.evaluate(
    async ({ name, content }) => {
      const root = await navigator.storage.getDirectory(),
        file = await root.getFileHandle(name, { create: true }),
        writer = await file.createWritable();
      await writer.write(content);
      await writer.close();
    },
    { name, content },
  );
}
async function diskRead(page: Page, name = "Original.md") {
  return page.evaluate(async (name) => {
    const file = await (
      await navigator.storage.getDirectory()
    ).getFileHandle(name);
    return (await file.getFile()).text();
  }, name);
}
async function pickerName(page: Page, name: string) {
  await page.evaluate((name) => {
    (window as typeof window & { __pickerName: string }).__pickerName = name;
  }, name);
}
async function controls(page: Page) {
  await page
    .getByRole("button", { name: "Local file connection", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Local file connection",
    exact: true,
  });
  await expect(
    dialog.getByText("Browser autosave stays in this browser.", {
      exact: false,
    }),
  ).toBeVisible();
  return dialog;
}
async function openConnected(page: Page, content: string) {
  await diskWrite(page, "Original.md", content);
  const dialog = await controls(page);
  await dialog
    .getByRole("button", { name: "Open connected file…", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
}
async function edit(page: Page, content: string) {
  await page.getByRole("button", { name: "Source view", exact: true }).click();
  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(content);
  await expect.poll(() => savedContent(page)).toBe(content);
}
async function savedContent(page: Page) {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open("openmdviewer");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            read = db
              .transaction("documents")
              .objectStore("documents")
              .getAll();
          read.onsuccess = () => {
            const docs = read.result as {
              path: string;
              content: string;
              workspaceId?: string;
            }[];
            resolve(
              docs.find(
                (doc) =>
                  doc.path.startsWith("Connected/") &&
                  (doc.workspaceId || "default") ===
                    (localStorage.getItem("openmdviewer.workspace") ||
                      "default"),
              )?.content || "",
            );
            db.close();
          };
          read.onerror = () => reject(read.error);
        };
      }),
  );
}

test("native file handles persist, browser autosave does not write disk, and explicit Save preserves BOM/CRLF and verifies the result", async ({
  page,
}) => {
  const original = "\ufeff# Original\r\n\r\nOriginal bytes.\r\n";
  await openConnected(page, original);
  await expect(
    page.getByRole("heading", { name: "Original", exact: true }),
  ).toBeVisible();
  const edited = "# Updated file\n\nAn explicit save.\n";
  await edit(page, edited);
  expect(await diskRead(page)).toBe(original.slice(1));
  let dialog = await controls(page);
  await expect(dialog).toContainText("Original.md");
  await dialog
    .getByRole("button", { name: "Save to connected file", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toHaveText(
    "Saved and verified Original.md on disk.",
  );
  expect(await diskRead(page)).toBe(
    "# Updated file\r\n\r\nAn explicit save.\r\n",
  );
  expect(
    await page.evaluate(async () =>
      Array.from(
        new Uint8Array(
          await (
            await (
              await (
                await navigator.storage.getDirectory()
              ).getFileHandle("Original.md")
            ).getFile()
          ).arrayBuffer(),
        ).slice(0, 3),
      ),
    ),
  ).toEqual([239, 187, 191]);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Updated file", exact: true }),
  ).toBeVisible();
  dialog = await controls(page);
  await expect(dialog).toContainText("Original.md");
  await dialog
    .getByRole("button", { name: "Save to connected file", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "No disk write was needed",
  );
  await dialog
    .getByRole("button", { name: "Disconnect file", exact: true })
    .click();
  await expect(dialog).toContainText("None · browser copy only");
  expect(await diskRead(page)).toContain("An explicit save.");
  expect(await savedContent(page)).toBe(edited);
});

test("external changes require review, loading preserves a browser snapshot, and a second external edit cannot be overwritten by an old review", async ({
  page,
}) => {
  await openConnected(page, "# Shared\n\nDisk base.\n");
  const local = "# Browser edits\n\nRetain this version.\n";
  await edit(page, local);
  await diskWrite(page, "Original.md", "# External\n\nAnother application.\n");
  let dialog = await controls(page);
  await dialog
    .getByRole("button", { name: "Save to connected file", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", {
      name: "Review disk replacement",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("textbox", { name: "Disk file version", exact: true }),
  ).toHaveValue("# External\n\nAnother application.\n");
  expect(await diskRead(page)).toContain("Another application.");
  await dialog
    .getByRole("button", { name: "Keep browser copy", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Reload from disk", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", {
      name: "Review loading disk contents",
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Load reviewed disk version", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "Loaded Original.md from disk",
  );
  expect(await savedContent(page)).toContain("Another application.");
  const snapshots = await page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const request = indexedDB.open("openmdviewer");
        request.onsuccess = () => {
          const db = request.result,
            read = db
              .transaction("snapshots")
              .objectStore("snapshots")
              .getAll();
          read.onsuccess = () => {
            resolve(
              read.result.map(
                (row: { document: { content: string } }) =>
                  row.document.content,
              ),
            );
            db.close();
          };
          read.onerror = () => reject(read.error);
        };
      }),
  );
  expect(snapshots).toContain(local);
  await page.keyboard.press("Escape");
  await edit(page, "# Browser final\n\nKeep final.\n");
  await diskWrite(page, "Original.md", "# External two\n");
  dialog = await controls(page);
  await dialog
    .getByRole("button", { name: "Save to connected file", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", {
      name: "Review disk replacement",
      exact: true,
    }),
  ).toBeVisible();
  await diskWrite(page, "Original.md", "# External three\n");
  await dialog
    .getByRole("button", { name: "Replace reviewed disk version", exact: true })
    .click();
  await expect(
    dialog.getByRole("textbox", { name: "Disk file version", exact: true }),
  ).toHaveValue("# External three\n");
  expect(await diskRead(page)).toBe("# External three\n");
  await dialog
    .getByRole("button", { name: "Replace reviewed disk version", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("Saved and verified");
  expect(await diskRead(page)).toBe("# Browser final\n\nKeep final.\n");
});

test("Save As reviews existing data, permission denial preserves it, and unsupported pickers offer working imports/downloads", async ({
  page,
}) => {
  await diskWrite(
    page,
    "Target.md",
    "# Existing target\n\n<script>window.__fileExecuted=true</script>",
  );
  await pickerName(page, "Target.md");
  let dialog = await controls(page);
  await dialog.getByRole("button", { name: "Save As…", exact: true }).click();
  await expect(
    dialog.getByRole("heading", {
      name: "Review disk replacement",
      exact: true,
    }),
  ).toBeVisible();
  expect(await diskRead(page, "Target.md")).toContain("Existing target");
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __fileExecuted?: boolean }).__fileExecuted,
    ),
  ).toBeUndefined();
  await page.setViewportSize({ width: 390, height: 844 });
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
  await dialog
    .getByRole("button", { name: "Replace reviewed disk version", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "Saved and verified Target.md",
  );
  const saved = await diskRead(page, "Target.md");
  expect(saved).toContain("Configuration Guide");
  const calls = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __pickerCalls: {
            kind: string;
            active: boolean;
            suggested?: string;
          }[];
        }
      ).__pickerCalls,
  );
  expect(calls[0]).toMatchObject({
    kind: "save",
    active: true,
    suggested: "Configuration.md",
  });
  await page.evaluate(() => {
    Object.defineProperty(FileSystemHandle.prototype, "requestPermission", {
      configurable: true,
      value: async () => "denied",
    });
  });
  await dialog
    .getByRole("button", { name: "Save to connected file", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "Write permission was not granted",
  );
  expect(await diskRead(page, "Target.md")).toBe(saved);
  await dialog
    .getByRole("button", { name: "Disconnect file", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("File disconnected.");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(window, "showOpenFilePicker", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: undefined,
    });
  });
  dialog = await controls(page);
  await expect(dialog).toContainText("Native file pickers are unavailable");
  await expect(
    dialog.getByRole("button", { name: "Save As…", exact: true }),
  ).toHaveCount(0);
  const download = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Download Markdown copy", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("Configuration.md");
  const chooser = page.waitForEvent("filechooser");
  await dialog
    .getByRole("button", { name: "Import files", exact: true })
    .click();
  await (
    await chooser
  ).setFiles({
    name: "Fallback.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Fallback import"),
  });
  await expect(
    page.getByRole("heading", { name: "Fallback import", exact: true }),
  ).toBeVisible();
});

test("file connections stay workspace-scoped and a stale tab cannot write a newer browser document", async ({
  page,
  context,
}) => {
  await openConnected(page, "# Shared file\n\nOriginal disk contents.\n");
  const second = await context.newPage();
  await second.goto("./");
  await expect(
    second.getByRole("heading", { name: "Shared file", exact: true }),
  ).toBeVisible();
  await edit(second, "# New browser version\n\nChanged in another tab.\n");
  let dialog = await controls(page);
  await dialog
    .getByRole("button", { name: "Save to connected file", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "changed in another tab",
  );
  expect(await diskRead(page)).toBe(
    "# Shared file\n\nOriginal disk contents.\n",
  );
  await second.close();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "New browser version", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Manage workspaces", exact: true })
    .click();
  await page
    .getByRole("button", { name: "New workspace", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Workspace name", exact: true })
    .fill("Separate connected files");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A little space for your words." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Local file connection", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Local file connection",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Open connected file…", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await edit(page, "# Other workspace\n\nAn explicit file save.\n");
  dialog = await controls(page);
  await dialog
    .getByRole("button", { name: "Save to connected file", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("Saved and verified");
  await page.keyboard.press("Escape");
  await page
    .getByRole("combobox", { name: "Current workspace" })
    .selectOption("default");
  await expect(
    page.getByRole("heading", { name: "New browser version", exact: true }),
  ).toBeVisible();
  dialog = await controls(page);
  await dialog
    .getByRole("button", { name: "Save to connected file", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", {
      name: "Review disk replacement",
      exact: true,
    }),
  ).toBeVisible();
  expect(await diskRead(page)).toBe(
    "# Other workspace\n\nAn explicit file save.\n",
  );
});

test("saved handles and explicit writes work offline, and canceling a native picker preserves the connection", async ({
  page,
  context,
}) => {
  await openConnected(page, "# Offline file\n\nLocal source.\n");
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
      timeout: 15000,
    })
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Offline file", exact: true }),
  ).toBeVisible();
  await edit(page, "# Offline edit\n\nWritten explicitly.\n");
  const dialog = await controls(page);
  await dialog
    .getByRole("button", { name: "Save to connected file", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "Saved and verified Original.md",
  );
  expect(await diskRead(page)).toBe("# Offline edit\n\nWritten explicitly.\n");
  await page.evaluate(() => {
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: () => {
        throw new DOMException("Picker closed", "AbortError");
      },
    });
  });
  await dialog.getByRole("button", { name: "Save As…", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    "File operation canceled.",
  );
  await expect(dialog).toContainText("Original.md");
  expect(await diskRead(page)).toContain("Written explicitly.");
});

test("a pending file permission participates in unload warnings and blocks update reloads until its verified save finishes", async ({
  page,
}) => {
  await openConnected(page, "# Pending file\n\nOriginal bytes.\n");
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
      timeout: 15000,
    })
    .toBe(true);
  await edit(page, "# Pending edit\n\nWait for explicit permission.\n");
  const dialog = await controls(page);
  await page.evaluate(() => {
    Object.defineProperty(FileSystemHandle.prototype, "requestPermission", {
      configurable: true,
      value: () =>
        new Promise<PermissionState>((resolve) => {
          (
            window as typeof window & {
              __finishFilePermission: (state: PermissionState) => void;
            }
          ).__finishFilePermission = resolve;
        }),
    });
  });
  await dialog
    .getByRole("button", { name: "Save to connected file", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toHaveText(
    "Working with the chosen file…",
  );
  expect(
    await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(true);
  let navigations = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  await page.evaluate(() =>
    navigator.serviceWorker.dispatchEvent(new Event("controllerchange")),
  );
  await expect(
    page.getByText(
      "An update is ready. Finish local file operations and resolve pending browser changes before reloading.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(navigations).toBe(0);
  expect(await diskRead(page)).toBe("# Pending file\n\nOriginal bytes.\n");
  await page.evaluate(() =>
    (
      window as typeof window & {
        __finishFilePermission: (state: PermissionState) => void;
      }
    ).__finishFilePermission("granted"),
  );
  await expect(dialog.getByRole("status")).toHaveText(
    "Saved and verified Original.md on disk.",
  );
  expect(await diskRead(page)).toBe(
    "# Pending edit\n\nWait for explicit permission.\n",
  );
});

test("invalid browser text cannot overwrite a chosen file and literal BOM characters remain stable across repeat saves", async ({
  page,
}) => {
  await diskWrite(page, "Target.md", "# Preserve existing disk bytes\n");
  await pickerName(page, "Target.md");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Nul.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Invalid\n\nNUL\0text"),
    });
  await expect(
    page.getByRole("tab", { name: "Nul.md", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  let dialog = await controls(page);
  await dialog.getByRole("button", { name: "Save As…", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText(
    "contains NUL characters",
  );
  expect(await diskRead(page, "Target.md")).toBe(
    "# Preserve existing disk bytes\n",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await pickerName(page, "Literal-target.md");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Literal.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("\ufeff\ufeff# Literal leading character\n"),
    });
  await expect(
    page.getByRole("tab", { name: "Literal.md", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  dialog = await controls(page);
  await dialog.getByRole("button", { name: "Save As…", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText(
    "Saved and verified Literal-target.md",
  );
  const first = await page.evaluate(async () =>
    Array.from(
      new Uint8Array(
        await (
          await (
            await (
              await navigator.storage.getDirectory()
            ).getFileHandle("Literal-target.md")
          ).getFile()
        ).arrayBuffer(),
      ),
    ),
  );
  expect(first.slice(0, 6)).toEqual([239, 187, 191, 239, 187, 191]);
  await dialog
    .getByRole("button", { name: "Save to connected file", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "No disk write was needed",
  );
  const second = await page.evaluate(async () =>
    Array.from(
      new Uint8Array(
        await (
          await (
            await (
              await navigator.storage.getDirectory()
            ).getFileHandle("Literal-target.md")
          ).getFile()
        ).arrayBuffer(),
      ),
    ),
  );
  expect(second).toEqual(first);
});
