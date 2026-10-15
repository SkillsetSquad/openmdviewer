import { test, expect, type Page, type Download } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function importTable(page: Page, content: string) {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Tables.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(content),
    });
  await expect(
    page.getByRole("heading", { name: "Table fixture", exact: true }),
  ).toBeVisible();
}
async function contents(download: Download) {
  const chunks: Buffer[] = [];
  for await (const chunk of (await download.createReadStream())!)
    chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString();
}

test("combines column filters, copy controls, JSON exports, and numeric summaries while preserving original Markdown", async ({
  page,
  context,
}) => {
  const source =
    "# Table fixture\n\n| Name | Count | Status |\n| --- | ---: | --- |\n| Zebra | 12 | open |\n| Alpha | 2 | closed |\n| =FORMULA() | 3 | open |";
  await importTable(page, source);
  const table = page.locator(".interactive-table");
  await table
    .getByRole("button", { name: "Column filters", exact: true })
    .click();
  await table
    .getByRole("textbox", { name: "Filter table rows", exact: true })
    .fill("open");
  await table
    .getByRole("textbox", { name: "Filter column 2 (Count)", exact: true })
    .fill("2");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table.locator("tbody tr")).toContainText("Zebra");
  const jsonEvent = page.waitForEvent("download");
  await table
    .getByRole("button", { name: "Export table as JSON", exact: true })
    .click();
  const jsonDownload = await jsonEvent;
  expect(jsonDownload.suggestedFilename()).toBe("table.json");
  expect(JSON.parse(await contents(jsonDownload))).toEqual({
    columns: ["Name", "Count", "Status"],
    rows: [["Zebra", "12", "open"]],
  });
  await table
    .getByRole("button", { name: "Reset table view", exact: true })
    .click();
  await table
    .getByRole("button", { name: "Sort by Count", exact: true })
    .click();
  await expect(table.locator("tbody tr").first()).toContainText("Alpha");
  await table
    .getByRole("button", { name: "Table statistics", exact: true })
    .click();
  const stats = table.getByRole("region", {
    name: "Table statistics",
    exact: true,
  });
  await expect(stats).toContainText("Sum 17");
  await expect(stats).toContainText("3 numeric values");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await table
    .getByRole("button", { name: "Cell and row copy controls", exact: true })
    .click();
  await table
    .getByRole("button", { name: "Copy cell row 1, column 1", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "Zebra",
  );
  await table
    .getByRole("button", { name: "Copy row 3 as CSV", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "'=FORMULA()",
  );
  await table
    .getByRole("button", { name: "Copy table as CSV", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    '"Name","Count","Status"',
  );
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations
      .filter(
        (violation) =>
          violation.impact === "serious" || violation.impact === "critical",
      )
      .map((violation) => ({
        id: violation.id,
        nodes: violation.nodes.map((node) => ({
          target: node.target,
          summary: node.failureSummary,
        })),
      })),
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/advanced-table-desktop.png",
    fullPage: true,
  });
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search documents and commands" })
    .fill("> download markdown");
  const originalEvent = page.waitForEvent("download");
  await page
    .getByRole("option", { name: "Download Markdown", exact: true })
    .click();
  expect(await contents(await originalEvent)).toBe(source);
  await table
    .getByRole("textbox", { name: "Filter table rows", exact: true })
    .fill("Zebra");
  await page
    .getByRole("button", { name: "Configuration.md", exact: true })
    .click();
  await page.getByRole("button", { name: "Tables.md", exact: true }).click();
  await expect(
    table.getByRole("textbox", { name: "Filter table rows", exact: true }),
  ).toHaveValue("");
  await expect(table.locator("tbody tr")).toHaveCount(3);
});

test("paginates large tables, resizes columns with keyboard and pointer, expands on mobile, and prints original rows", async ({
  page,
}) => {
  const source =
    "# Table fixture\n\n| Name | Value |\n| --- | ---: |\n" +
    Array.from(
      { length: 120 },
      (_, i) =>
        `| Row ${i}${i === 50 ? " verylongunbrokentextthatmustwrapwithinthecolumn" : ""} | ${i} |`,
    ).join("\n");
  await importTable(page, source);
  const table = page.locator(".interactive-table");
  await expect(table.locator("tbody tr")).toHaveCount(50);
  await table.getByRole("button", { name: "Next rows", exact: true }).click();
  await expect(table.locator("tbody tr").first()).toContainText("Row 50");
  const separator = table.getByRole("separator", {
    name: "Resize column 1 (Name)",
    exact: true,
  });
  await separator.focus();
  await separator.press("Home");
  await expect(separator).toHaveAttribute("aria-valuenow", "80");
  await expect
    .poll(() =>
      table
        .locator("tbody tr")
        .first()
        .locator("td")
        .first()
        .evaluate((cell) => cell.scrollWidth <= cell.clientWidth + 1),
    )
    .toBe(true);
  await separator.press("ArrowRight");
  const width = Number(await separator.getAttribute("aria-valuenow"));
  expect(width).toBeGreaterThan(80);
  await separator.scrollIntoViewIfNeeded();
  const box = await separator.boundingBox();
  if (!box) throw new Error("Resize control missing");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2);
  await page.mouse.up();
  await expect
    .poll(async () => Number(await separator.getAttribute("aria-valuenow")))
    .toBeGreaterThan(width);
  await table.locator(".table-scroll").evaluate((element) => {
    element.scrollTop = 250;
  });
  const scrollTop = (await table.locator(".table-scroll").boundingBox())!.y;
  await expect
    .poll(async () => (await table.locator("thead").boundingBox())!.y)
    .toBeCloseTo(scrollTop, 0);
  const jsonEvent = page.waitForEvent("download");
  await table
    .getByRole("button", { name: "Export table as JSON", exact: true })
    .click();
  expect(JSON.parse(await contents(await jsonEvent)).rows).toHaveLength(120);
  await table
    .getByRole("textbox", { name: "Filter table rows", exact: true })
    .fill("Row 119");
  await table
    .getByRole("button", { name: "Expand table", exact: true })
    .click();
  const modal = page.getByRole("dialog", {
    name: "Expanded table",
    exact: true,
  });
  await expect(modal).toBeVisible();
  await expect(page.locator("table")).toHaveCount(1);
  await expect(modal.locator("tbody tr")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      modal.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    )
    .toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const axe = await new AxeBuilder({ page }).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/expanded-table-mobile.png",
    fullPage: true,
  });
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await page.emulateMedia({ media: "print" });
  const printed = page.locator(".interactive-table > .table-scroll table");
  await expect(printed.locator("tbody tr")).toHaveCount(120);
  await expect(printed.locator("tbody tr").first()).toContainText("Row 0");
  await expect(table.locator(":scope > .table-tools")).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(modal.locator("tbody tr")).toHaveCount(1);
  await modal
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(
    table.getByRole("button", { name: "Expand table", exact: true }),
  ).toBeFocused();
});

test("preserves duplicate and empty headings in JSON, keeps header links usable, and retains merged HTML table layout", async ({
  page,
}) => {
  await importTable(
    page,
    '# Table fixture\n\n| [Key](#target) | Key | |\n| :--- | ---: | --- |\n| **Alpha** | 2 | ![Local image](missing.png) |\n\n## Target\n\n<table><thead><tr><th colspan="2">Merged heading</th></tr></thead><tbody><tr><td>First group</td><td>A</td></tr></tbody><tbody><tr><td>Second group</td><td>B</td></tr></tbody></table>',
  );
  const first = page.locator(".interactive-table").first();
  await expect(
    first.getByRole("link", { name: "Key", exact: true }),
  ).toBeVisible();
  await first.getByRole("link", { name: "Key", exact: true }).click();
  await expect(
    first.getByRole("link", { name: "Key", exact: true }),
  ).toHaveAttribute("href", "#user-content-target");
  await expect(first.locator("thead th").first()).toHaveAttribute(
    "aria-sort",
    "none",
  );
  await expect(page.locator("#user-content-target")).toBeVisible();
  const jsonEvent = page.waitForEvent("download");
  await first
    .getByRole("button", { name: "Export table as JSON", exact: true })
    .click();
  expect(JSON.parse(await contents(await jsonEvent))).toEqual({
    columns: ["Key", "Key", ""],
    rows: [["Alpha", "2", "Local image"]],
  });
  const merged = page.locator(".interactive-table").nth(1);
  await expect(merged).toContainText("original layout");
  await expect(merged.locator("th[colspan='2']")).toHaveText("Merged heading");
  await expect(merged.locator("tbody")).toHaveCount(2);
  await expect(merged).toContainText("Second group");
  await expect(
    merged.getByRole("button", { name: "Column filters", exact: true }),
  ).toHaveCount(0);
});
