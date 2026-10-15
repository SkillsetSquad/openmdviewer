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
});
