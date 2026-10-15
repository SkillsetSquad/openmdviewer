import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function load(page: Page, files: { name: string; content: string }[]) {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles(
      files.map((file) => ({
        name: file.name,
        mimeType: "text/markdown",
        buffer: Buffer.from(file.content),
      })),
    );
  await expect(
    page.getByRole("tab", { name: files[0].name, exact: true }),
  ).toHaveAttribute("aria-selected", "true");
}
async function search(page: Page, query: string) {
  await page.keyboard.press("Control+k");
  const input = page.getByRole("combobox", {
    name: "Search documents and commands",
    exact: true,
  });
  await input.fill(query);
  return page.getByRole("dialog", {
    name: "Search your workspace",
    exact: true,
  });
}
test("worker previews include distant matches, metadata and headings, then reveal the exact rendered passage offline", async ({
  page,
  context,
}) => {
  const source =
    "---\ntitle: Operations manual\nstatus: approved\ntags: [operations]\n---\n# Search manual\n\n" +
    "Background context. ".repeat(3000) +
    "\n\n> [!TIP]- Details\n>\n> ## Remote operations\n>\n> The remoteBeacon remains **local** and private.";
  await load(page, [{ name: "Search.md", content: source }]);
  let dialog = await search(page, "remoteBeacon");
  const result = dialog.getByRole("option").filter({ hasText: "Search.md" });
  await expect(result).toContainText("Operations manual");
  await expect(result).toContainText("Section: Remote operations");
  await expect(result).toContainText("approved");
  await expect(result).toContainText("operations");
  await expect(
    result.locator("mark").filter({ hasText: "remoteBeacon" }),
  ).toBeVisible();
  await result.click();
  await expect(
    page.getByRole("button", { name: "Reading view", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("article details")).toHaveAttribute("open", "");
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("remoteBeacon");
  await page.locator("article details > summary").click();
  dialog = await search(page, 'heading:"Remote operations"');
  await dialog
    .getByRole("group", { name: "Documents", exact: true })
    .getByRole("option")
    .click();
  await expect(page.locator("article details")).toHaveAttribute("open", "");
  await expect(
    page.getByRole("heading", { name: "Remote operations", exact: true }),
  ).toBeInViewport();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Search manual", exact: true }),
  ).toBeVisible();
  dialog = await search(page, "remoteBeacon");
  await expect(
    dialog.getByRole("option").filter({ hasText: "Search.md" }),
  ).toContainText("remoteBeacon");
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
});
test("literal options distinguish case and whole words while command search keeps working", async ({
  page,
}) => {
  await load(page, [
    { name: "Upper.md", content: "# Upper\n\nCaseNeedle." },
    { name: "Lower.md", content: "# Lower\n\ncaseneedle." },
    { name: "Suffix.md", content: "# Suffix\n\nCaseNeedleSuffix." },
  ]);
  const dialog = await search(page, "CaseNeedle");
  await expect(
    dialog
      .getByRole("group", { name: "Documents", exact: true })
      .getByRole("option"),
  ).toHaveCount(3);
  await dialog
    .getByRole("checkbox", { name: "Match case", exact: true })
    .check();
  await expect(
    dialog.getByRole("combobox", { name: "Document matching", exact: true }),
  ).toHaveValue("literal");
  await expect(
    dialog
      .getByRole("group", { name: "Documents", exact: true })
      .getByRole("option"),
  ).toHaveCount(2);
  await dialog
    .getByRole("checkbox", { name: "Whole words", exact: true })
    .check();
  await expect(
    dialog
      .getByRole("group", { name: "Documents", exact: true })
      .getByRole("option"),
  ).toHaveCount(1);
  await expect(
    dialog
      .getByRole("group", { name: "Documents", exact: true })
      .getByRole("option"),
  ).toContainText("Upper.md");
  await dialog
    .getByRole("combobox", {
      name: "Search documents and commands",
      exact: true,
    })
    .fill("> settings");
  await expect(
    dialog.getByRole("option", { name: "Reading settings", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("checkbox", { name: "Match case", exact: true }),
  ).toHaveCount(0);
});
test("code and frontmatter matches navigate to exact source lines and preview imported markup as inert text", async ({
  page,
}) => {
  const source =
    '---\nowner: MetaNeedle\n---\n# Source matches\n\n```js\nconst CodeNeedle = 1;\n```\n\n<div title="HtmlNeedle"><img src="https://search.example.test/pixel.png" onerror="window.__searchExecuted=true">Visible</div>';
  await page.route("https://search.example.test/**", (route) => route.abort());
  await load(page, [{ name: "Source.md", content: source }]);
  let dialog = await search(page, "CodeNeedle");
  let result = dialog.getByRole("option").filter({ hasText: "Source.md" });
  await expect(result).toContainText("Line 7 · Source");
  await result.click();
  await expect(
    page.getByRole("button", { name: "Split view", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".cm-activeLine")).toContainText(
    "const CodeNeedle = 1;",
  );
  dialog = await search(page, "MetaNeedle");
  await dialog.getByRole("option").filter({ hasText: "Source.md" }).click();
  await expect(page.locator(".cm-activeLine")).toContainText(
    "owner: MetaNeedle",
  );
  dialog = await search(page, "HtmlNeedle");
  result = dialog.getByRole("option").filter({ hasText: "Source.md" });
  await expect(result).toContainText("<img");
  await expect(dialog.locator("img")).toHaveCount(0);
  expect(await page.evaluate(() => "__searchExecuted" in window)).toBe(false);
  await result.click();
  await expect(page.locator(".cm-activeLine")).toContainText("HtmlNeedle");
  await page.keyboard.press("Meta+k");
  await page
    .getByRole("combobox", {
      name: "Search documents and commands",
      exact: true,
    })
    .fill("> Download Markdown");
  dialog = page.getByRole("dialog", {
    name: "Search your workspace",
    exact: true,
  });
  const pending = page.waitForEvent("download");
  await dialog
    .getByRole("option", { name: "Download Markdown", exact: true })
    .click();
  const chunks: Buffer[] = [];
  for await (const chunk of (await (await pending).createReadStream())!)
    chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString()).toBe(source);
});
test("all result pages are reachable with exact counts and the final page opens its actual match", async ({
  page,
}) => {
  await load(
    page,
    Array.from({ length: 125 }, (_, n) => ({
      name: `Doc-${String(n).padStart(3, "0")}.md`,
      content: `---\ntags: [paging]\n---\n# Document ${n}\n\npageMarker`,
    })),
  );
  const dialog = await search(page, "pageMarker");
  const options = dialog
    .getByRole("group", { name: "Documents", exact: true })
    .getByRole("option");
  await expect(options).toHaveCount(50);
  await expect(
    dialog.getByRole("navigation", {
      name: "Search result pages",
      exact: true,
    }),
  ).toContainText("1–50 of 125 documents");
  await dialog
    .getByRole("button", { name: "Next results", exact: true })
    .click();
  await expect(
    dialog.getByRole("navigation", {
      name: "Search result pages",
      exact: true,
    }),
  ).toContainText("51–100 of 125 documents");
  await dialog
    .getByRole("button", { name: "Next results", exact: true })
    .click();
  await expect(options).toHaveCount(25);
  await expect(
    dialog.getByRole("navigation", {
      name: "Search result pages",
      exact: true,
    }),
  ).toContainText("101–125 of 125 documents");
  await expect(
    dialog.getByRole("button", { name: "Next results", exact: true }),
  ).toBeDisabled();
  await options.first().click();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("pageMarker");
  await page.getByRole("button", { name: "paging", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Search result pages", exact: true }),
  ).toContainText("1–50 of 125 documents");
  await dialog
    .getByRole("combobox", { name: "Document matching" })
    .selectOption("regex");
  await dialog
    .getByRole("combobox", {
      name: "Search documents and commands",
      exact: true,
    })
    .fill("pageM.rker");
  await expect(options).toHaveCount(50);
  await dialog
    .getByRole("button", { name: "Next results", exact: true })
    .click();
  await expect(
    dialog.getByRole("navigation", {
      name: "Search result pages",
      exact: true,
    }),
  ).toContainText("51–100 of 125 documents");
  await dialog
    .getByRole("button", { name: "Next results", exact: true })
    .click();
  await expect(options).toHaveCount(25);
  await options.first().click();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("pageMarker");
  await page.getByRole("button", { name: "paging", exact: true }).click();
  await expect(
    dialog.getByRole("combobox", { name: "Document matching" }),
  ).toHaveValue("fuzzy");
  await expect(options).toHaveCount(50);
});

test("search history remembers explicit actions and restores options after reload without saving drafts", async ({
  page,
}) => {
  await load(page, [
    { name: "History.md", content: "# History\n\nCaseNeedle and caseneedle." },
  ]);
  let dialog = await search(page, "unexecuted private draft");
  await page.keyboard.press("Escape");
  dialog = await search(page, "CaseNeedle");
  await dialog.getByLabel("Match case", { exact: true }).check();
  await dialog.getByLabel("Whole words", { exact: true }).check();
  await dialog
    .getByRole("group", { name: "Documents", exact: true })
    .getByRole("option")
    .click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "History", exact: true }),
  ).toBeVisible();
  dialog = await search(page, "");
  await dialog.locator(".recent-searches > summary").click();
  const restore = dialog.getByRole("button", {
    name: "Restore search: CaseNeedle (Literal · Match case · Whole words)",
    exact: true,
  });
  await expect(restore).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: /Restore search: unexecuted/ }),
  ).toHaveCount(0);
  await restore.click();
  await expect(
    dialog.getByRole("combobox", {
      name: "Search documents and commands",
      exact: true,
    }),
  ).toHaveValue("CaseNeedle");
  await expect(dialog.getByLabel("Match case", { exact: true })).toBeChecked();
  await expect(dialog.getByLabel("Whole words", { exact: true })).toBeChecked();
  await expect(
    dialog.getByRole("combobox", { name: "Document matching" }),
  ).toHaveValue("literal");
  await expect(
    dialog.getByRole("button", { name: "Search remembered", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("combobox", {
      name: "Search documents and commands",
      exact: true,
    })
    .fill("no matches but remember this");
  await dialog
    .getByRole("button", { name: "Remember search", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: /^Restore search:/ }),
  ).toHaveCount(2);
  await dialog
    .getByRole("button", { name: /^Remove search: CaseNeedle/ })
    .click();
  await expect(
    dialog.getByRole("button", { name: /^Restore search:/ }),
  ).toHaveCount(1);
  await dialog
    .getByRole("button", { name: "Clear search history", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: /^Restore search:/ }),
  ).toHaveCount(0);
  await expect(
    dialog.getByText("No recent searches yet.", { exact: false }),
  ).toBeVisible();
});

test("recent searches update across tabs and stay isolated when switching workspaces", async ({
  page,
  context,
}) => {
  await load(page, [
    { name: "Private.md", content: "# Private\n\nprivateNeedle" },
  ]);
  let dialog = await search(page, "privateNeedle");
  await dialog
    .getByRole("button", { name: "Remember search", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Search remembered", exact: true }),
  ).toBeDisabled();
  const other = await context.newPage();
  await other.goto("./");
  await expect(
    other.getByRole("heading", { name: "Private", exact: true }),
  ).toBeVisible();
  const second = await search(other, "second-tab query");
  await second.locator(".recent-searches > summary").click();
  await expect(
    second.getByRole("button", { name: /^Restore search: privateNeedle/ }),
  ).toBeVisible();
  await second
    .getByRole("button", { name: "Remember search", exact: true })
    .click();
  await dialog.locator(".recent-searches > summary").click();
  await expect(
    dialog.getByRole("button", { name: /^Restore search:/ }),
  ).toHaveCount(2);
  await second
    .getByRole("button", { name: "Clear search history", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: /^Restore search:/ }),
  ).toHaveCount(0);
  await other.close();
  await dialog
    .getByRole("button", { name: "Remember search", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: /^Restore search: privateNeedle/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Manage workspaces", exact: true })
    .click();
  await page
    .getByRole("button", { name: "New workspace", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Workspace name", exact: true })
    .fill("Separate search workspace");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A little space for your words." }),
  ).toBeVisible();
  dialog = await search(page, "other-workspace query");
  await dialog.locator(".recent-searches > summary").click();
  await expect(
    dialog.getByRole("button", { name: /^Restore search:/ }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Remember search", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: /^Restore search:/ }),
  ).toHaveCount(1);
  await dialog
    .getByRole("button", { name: "Clear search history", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await page
    .getByRole("combobox", { name: "Current workspace" })
    .selectOption("default");
  await expect(
    page.getByRole("heading", { name: "Private", exact: true }),
  ).toBeVisible();
  dialog = await search(page, "");
  await dialog.locator(".recent-searches > summary").click();
  await expect(
    dialog.getByRole("button", { name: /^Restore search: privateNeedle/ }),
  ).toBeVisible();
});

test("filter suggestions use real workspace values and support keyboard selection on mobile and offline", async ({
  page,
  context,
}) => {
  await load(page, [
    {
      name: "Suggestions.md",
      content:
        '---\nstatus: approved\ntags: ["operations team", "opsec"]\n---\n# Suggestions\n\n## Authentication guide\n\nLocal reference.',
    },
    {
      name: "Other.md",
      content:
        '---\nstatus: draft\ntags: ["operations team"]\n---\n# Other\n\n## Authentication guide',
    },
  ]);
  let dialog = await search(page, "tag:op");
  const suggestions = dialog.getByRole("group", {
    name: "Filter suggestions",
    exact: true,
  });
  await expect(suggestions.getByRole("option")).toHaveCount(2);
  const first = suggestions.getByRole("option").first();
  await expect(first).toContainText("operations team");
  await expect(first).toContainText("2 workspace documents with this value");
  const input = dialog.getByRole("combobox", {
    name: "Search documents and commands",
    exact: true,
  });
  await expect(input).toHaveAttribute(
    "aria-activedescendant",
    (await first.getAttribute("id"))!,
  );
  await input.press("Enter");
  await expect(input).toHaveValue('tag:"operations team"');
  await expect(input).toBeFocused();
  await expect(
    dialog
      .getByRole("group", { name: "Documents", exact: true })
      .getByRole("option"),
  ).toHaveCount(2);
  await input.fill('heading:"Auth');
  await expect(suggestions.getByRole("option")).toHaveCount(1);
  await suggestions.getByRole("option").click();
  await expect(input).toHaveValue('heading:"Authentication guide"');
  await dialog
    .getByRole("button", { name: "Remember search", exact: true })
    .click();
  await dialog.locator(".recent-searches > summary").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await input.fill("status:a");
  await expect(suggestions.getByRole("option")).toContainText("approved");
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
  await page.keyboard.press("Escape");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Suggestions", exact: true }),
  ).toBeVisible();
  dialog = await search(page, "status:a");
  await expect(
    dialog
      .getByRole("group", { name: "Filter suggestions", exact: true })
      .getByRole("option"),
  ).toContainText("approved");
  await dialog.locator(".recent-searches > summary").click();
  await expect(
    dialog.getByRole("button", { name: /^Restore search: heading:/ }),
  ).toBeVisible();
});

test("a history storage failure is reported without blocking a document result", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = IDBDatabase.prototype.transaction;
    Object.defineProperty(IDBDatabase.prototype, "transaction", {
      configurable: true,
      value: function (
        this: IDBDatabase,
        ...args: [
          string | string[],
          IDBTransactionMode?,
          IDBTransactionOptions?,
        ]
      ) {
        const names =
          typeof args[0] === "string" ? [args[0]] : Array.from(args[0]);
        if (names.includes("searchHistory") && args[1] === "readwrite")
          throw new DOMException(
            "History write unavailable",
            "QuotaExceededError",
          );
        return Reflect.apply(original, this, args);
      },
    });
  });
  await load(page, [
    { name: "Resilient.md", content: "# Resilient search\n\nresilientNeedle" },
  ]);
  const dialog = await search(page, "resilientNeedle");
  await expect(
    dialog
      .getByRole("group", { name: "Documents", exact: true })
      .getByRole("option"),
  ).toHaveCount(1);

  await dialog
    .getByRole("group", { name: "Documents", exact: true })
    .getByRole("option")
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText(
      "Search history could not be updated in browser storage. Document search still works.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("resilientNeedle");
});

test("regex highlights actual contextual matches, selects the right repeated passage and restores its mode offline", async ({
  page,
  context,
}) => {
  const prose = "barfoo then xfoo and more.";
  await load(page, [
    {
      name: "Regex.md",
      content: `# Regex reference\n\n${prose}\n\nID-42 and ID-420.\n\n\`\`\`js\nconst secret77 = 1;\n\`\`\``,
    },
  ]);
  let dialog = await search(page, "(?<=x)foo");
  await dialog
    .getByRole("combobox", { name: "Document matching" })
    .selectOption("regex");
  let result = dialog
    .getByRole("group", { name: "Documents", exact: true })
    .getByRole("option");
  await expect(result).toHaveCount(1);
  await expect(result.locator(".search-excerpt mark")).toHaveCount(1);
  await expect(result.locator(".search-excerpt mark")).toHaveText("foo");
  await result.click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.anchorOffset))
    .toBe(prose.indexOf("xfoo") + 1);
  await expect(
    page.getByRole("button", { name: "Reading view", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  dialog = await search(page, "secret\\d+");
  result = dialog
    .getByRole("group", { name: "Documents", exact: true })
    .getByRole("option");
  await expect(result).toContainText("Line 8 · Source");
  await result.click();
  await expect(page.locator(".cm-activeLine")).toContainText(
    "const secret77 = 1;",
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Regex reference", exact: true }),
  ).toBeVisible();
  dialog = await search(page, "(?<=ID-)42(?!0)");
  await dialog
    .getByRole("combobox", { name: "Document matching" })
    .selectOption("regex");
  await expect(
    dialog
      .getByRole("group", { name: "Documents", exact: true })
      .getByRole("option")
      .locator(".search-excerpt mark"),
  ).toHaveText("42");
  await dialog.locator(".recent-searches > summary").click();
  await expect(
    dialog.getByRole("button", {
      name: "Restore search: (?<=x)foo (Regex)",
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .getByRole("button", {
      name: "Restore search: (?<=x)foo (Regex)",
      exact: true,
    })
    .click();
  await expect(
    dialog.getByRole("combobox", { name: "Document matching" }),
  ).toHaveValue("regex");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (await new AxeBuilder({ page }).analyze()).violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
});

test("invalid and zero-width regex patterns are explained and never fabricate selected text", async ({
  page,
}) => {
  await load(page, [
    {
      name: "Zero.md",
      content: "# Zero-width\n\nLocateHere remains unchanged.",
    },
  ]);
  const dialog = await search(page, "[");
  await dialog
    .getByRole("combobox", { name: "Document matching" })
    .selectOption("regex");
  await expect(dialog.getByText(/^Invalid regular expression:/)).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Retry regex search", exact: true }),
  ).toBeVisible();
  const input = dialog.getByRole("combobox", {
    name: "Search documents and commands",
    exact: true,
  });
  await input.fill("(?=LocateHere)");
  const result = dialog
    .getByRole("group", { name: "Documents", exact: true })
    .getByRole("option");
  await expect(result).toContainText("Line 3 · Source · Zero-width match");
  await expect(result.locator("mark")).toHaveCount(0);
  await result.click();
  await expect(page.locator(".cm-activeLine")).toContainText(
    "LocateHere remains unchanged.",
  );
});

test("expensive regex evaluations time out or cancel in their own worker while ordinary search and commands survive", async ({
  page,
}) => {
  await load(page, [
    {
      name: "Danger.md",
      content:
        "# Expensive patterns\n\n" + "a".repeat(60000) + "!\n\nRecoveryNeedle",
    },
  ]);
  const workers: string[] = [];
  page.on("worker", (worker) => workers.push(worker.url()));
  const dialog = await search(page, "(a+)+$");
  const matching = dialog.getByRole("combobox", { name: "Document matching" });
  await matching.selectOption("regex");
  await expect(
    dialog.getByText(
      "Regular-expression search exceeded its 1.5-second limit. Simplify the pattern or switch matching.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 10000 });
  expect(workers.some((url) => url.endsWith("/regex-worker.js"))).toBe(true);
  const next = page.waitForEvent("worker", (worker) =>
    worker.url().endsWith("/regex-worker.js"),
  );
  await dialog
    .getByRole("button", { name: "Retry regex search", exact: true })
    .click();
  const worker = await next;
  const closed = worker.waitForEvent("close");
  await dialog
    .getByRole("button", { name: "Cancel regex search", exact: true })
    .click();
  await closed;
  await expect(
    dialog.getByText("Regular-expression search cancelled.", { exact: true }),
  ).toBeVisible();
  const input = dialog.getByRole("combobox", {
    name: "Search documents and commands",
    exact: true,
  });
  const superseded = page.waitForEvent("worker", (worker) =>
    worker.url().endsWith("/regex-worker.js"),
  );
  await dialog
    .getByRole("button", { name: "Retry regex search", exact: true })
    .click();
  const oldWorker = await superseded;
  const oldClosed = oldWorker.waitForEvent("close");
  await input.fill("RecoveryNeedle");
  await oldClosed;
  await expect(
    dialog
      .getByRole("group", { name: "Documents", exact: true })
      .getByRole("option"),
  ).toHaveCount(1);
  await matching.selectOption("fuzzy");
  await expect(
    dialog
      .getByRole("group", { name: "Documents", exact: true })
      .getByRole("option"),
  ).toHaveCount(1);
  await input.fill("> settings");
  await dialog
    .getByRole("option", { name: "Reading settings", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Make yourself at home", exact: true }),
  ).toBeVisible();
});
