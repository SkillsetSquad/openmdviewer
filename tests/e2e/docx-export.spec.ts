import { test, expect, type Page, type Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { unzipSync } from "fflate";
import { readFile, writeFile } from "node:fs/promises";
const source = `---
title: Editable Word fixture
private: PRIVATE_WORD_FRONTMATTER_TOKEN
---
# Editable Word fixture

This document demonstrates editable Word export with paragraphs and real local images.

## Formatting and navigation

**Bold prose**, *italic prose*, ~~deleted prose~~, inline \`const local = true\` and Unicode résumé café.

[Jump to the data](#data) and [External documentation](https://example.org/docs).

3. Ordered first
4. Ordered second
   - Nested bullet

- [x] Completed task
- [ ] Outstanding task

> A quoted paragraph remains separate from ordinary prose.

## Data

| Item | Status | Count |
| --- | --- | --- |
| Local files | Available | 42 |
| Editable tables | Included | 2 |

## Local image

![Alpine lake photograph](lake.jpg)

## Code source

\`\`\`typescript
const first = 1;
const second = 2;
\tconsole.log(first + second);
\`\`\`

## References and unsupported media

![Remote image](https://word-attacker.invalid/image.png)

[Another document](Other.md) and math $a^2+b^2=c^2$ retain readable source.

<script>window.WORD_SOURCE_EXECUTED=true</script>
`;
async function open(page: Page) {
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search documents and commands" })
    .fill("> export word document");
  await page
    .getByRole("option", { name: "Export Word document", exact: true })
    .click();
  return page.getByRole("dialog", {
    name: "Export Word document",
    exact: true,
  });
}
async function generate(page: Page, dialog?: Locator) {
  const modal = dialog || (await open(page));
  await modal
    .getByRole("button", { name: "Generate Word document", exact: true })
    .click();
  await expect(
    modal.getByRole("button", { name: "Download Word document", exact: true }),
  ).toBeVisible();
  return modal;
}
async function download(page: Page, modal: Locator) {
  const event = page.waitForEvent("download");
  await modal
    .getByRole("button", { name: "Download Word document", exact: true })
    .click();
  const result = await event,
    stream = await result.createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return { bytes: Buffer.concat(chunks), name: result.suggestedFilename() };
}
async function fixture(page: Page) {
  const image = await readFile("public/images/alpine-lake.jpg");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles([
      {
        name: "Word fixture.md",
        mimeType: "text/markdown",
        buffer: Buffer.from(source),
      },
      { name: "lake.jpg", mimeType: "image/jpeg", buffer: image },
    ]);
  await expect(
    page.getByRole("heading", { name: "Editable Word fixture", exact: true }),
  ).toBeVisible();
  return image;
}
const ready = (page: Page) =>
  expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await ready(page);
});

test("creates actual editable Word content with embedded originals and safe links, then reimports its DOCX bytes", async ({
  page,
}) => {
  const contacted: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("word-attacker.invalid"))
      contacted.push(request.url());
  });
  const image = await fixture(page),
    modal = await open(page);
  await modal
    .getByRole("checkbox", {
      name: "Add linked contents after the title",
      exact: true,
    })
    .check();
  await modal
    .getByRole("checkbox", { name: "Add page numbers", exact: true })
    .check();
  await generate(page, modal);
  await expect(modal).toContainText("1 embedded image");
  await expect(modal).toContainText("1 editable table");
  const result = await download(page, modal);
  expect(result.name).toBe("Word fixture.docx");
  const parts = unzipSync(result.bytes),
    body = Buffer.from(parts["word/document.xml"]).toString();
  expect(body).toContain("<w:tbl>");
  expect(body).toContain("<w:numPr>");
  expect(body).toContain('w:pStyle w:val="Title"');
  expect(body).toContain("<w:tab/>");
  expect(body).toContain('w:anchor="OMD_');
  const media = Object.keys(parts).filter(
    (name) => name.startsWith("word/media/") && parts[name].length,
  );
  expect(media).toHaveLength(1);
  expect(Buffer.from(parts[media[0]])).toEqual(image);
  expect(
    Buffer.from(parts["word/_rels/document.xml.rels"]).toString(),
  ).not.toContain("word-attacker.invalid");
  expect(
    Object.values(parts)
      .map((bytes) => Buffer.from(bytes).toString())
      .join(""),
  ).not.toMatch(/PRIVATE_WORD_FRONTMATTER_TOKEN|WORD_SOURCE_EXECUTED/);
  expect(contacted).toEqual([]);
  await writeFile("/tmp/openmdviewer-docx-export-qa.docx", result.bytes);
  await page.screenshot({ path: "/tmp/openmdviewer-docx-export-desktop.png" });
  await modal.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator("input[type=file]").first().setInputFiles({
    name: result.name,
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: result.bytes,
  });
  const preview = page.getByRole("dialog", {
    name: "Convert documents",
    exact: true,
  });
  await expect(
    preview.getByRole("button", {
      name: "Import converted files",
      exact: true,
    }),
  ).toBeVisible();
  const text = await preview
    .getByRole("textbox", { name: "Converted Markdown preview", exact: true })
    .inputValue();
  expect(text).toContain("Editable Word fixture");
  expect(text).toContain("| **Item**");
  expect(text).toContain("const first = 1;");
  expect(text).toContain("console.log");
});

test("exports latest editor content using Letter layout and explicit image settings through the export menu", async ({
  page,
}) => {
  await fixture(page);
  await page.getByRole("button", { name: "Split view", exact: true }).click();
  await page
    .locator(".cm-content")
    .fill(
      "# Latest Word copy\n\nCURRENT_WORD_EXPORT_TOKEN\n\n![Local](lake.jpg)",
    );
  await page
    .getByRole("button", { name: "Export document", exact: true })
    .click();
  await page.getByRole("button", { name: /^Word document/ }).click();
  const modal = page.getByRole("dialog", {
    name: "Export Word document",
    exact: true,
  });
  await modal.getByLabel("Paper size", { exact: true }).selectOption("letter");
  await modal
    .getByRole("checkbox", {
      name: "Embed local PNG JPEG GIF images",
      exact: true,
    })
    .uncheck();
  await generate(page, modal);
  const { bytes } = await download(page, modal),
    parts = unzipSync(bytes),
    body = Buffer.from(parts["word/document.xml"]).toString();
  expect(body).toContain("CURRENT_WORD_EXPORT_TOKEN");
  expect(body).toContain('w:w="12240"');
  expect(body).toContain('w:h="15840"');
  expect(
    Object.keys(parts).filter(
      (name) => name.startsWith("word/media/") && parts[name].length,
    ),
  ).toHaveLength(0);
  await modal.getByLabel("Paper size", { exact: true }).selectOption("a4");
  await expect(
    modal.getByRole("button", { name: "Download Word document", exact: true }),
  ).toHaveCount(0);
  await modal.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Latest Word copy", exact: true }),
  ).toBeVisible();
});

test("exports offline after restart and keeps options, notices and downloads accessible on mobile", async ({
  page,
  context,
}) => {
  test.setTimeout(150000);
  await fixture(page);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
      timeout: 90000,
    })
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Editable Word fixture", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const modal = await generate(page);
  const scan = await new AxeBuilder({ page }).include("dialog[open]").analyze();
  expect(scan.violations).toEqual([]);
  expect(
    await modal.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  expect((await download(page, modal)).bytes.length).toBeGreaterThan(1000);
  await page.screenshot({ path: "/tmp/openmdviewer-docx-export-mobile.png" });
});

test.describe("DOCX worker cancellation", () => {
  test.use({ serviceWorkers: "block" });
  test("terminates canceled work and retries without changing the selected source", async ({
    page,
    context,
  }) => {
    await context.route("**/docx-export-worker.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: 'postMessage({type:"ready"});onmessage=()=>{while(true){}};',
      }),
    );
    const modal = await open(page);
    await modal
      .getByRole("button", { name: "Generate Word document", exact: true })
      .click();
    await modal
      .getByRole("button", { name: "Cancel DOCX export", exact: true })
      .click();
    await expect(modal.getByRole("status")).toContainText("canceled");
    await expect(
      modal.getByRole("button", {
        name: "Download Word document",
        exact: true,
      }),
    ).toHaveCount(0);
    await context.unroute("**/docx-export-worker.js");
    await generate(page, modal);
    await modal.getByRole("button", { name: "Close", exact: true }).click();
    await ready(page);
  });
});
