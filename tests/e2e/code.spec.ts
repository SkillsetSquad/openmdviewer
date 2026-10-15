import { test, expect, type Page, type Download } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function bytes(file: Download) {
  const parts: Buffer[] = [];
  for await (const part of (await file.createReadStream())!)
    parts.push(Buffer.from(part));
  return Buffer.concat(parts);
}
async function command(page: Page, label: string) {
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search documents and commands" })
    .fill(`> ${label}`);
  await page.getByRole("option", { name: label, exact: true }).click();
}
async function load(page: Page, source: string) {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Code.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(source),
    });
  await expect(
    page.getByRole("heading", { name: "Code tools", exact: true }),
  ).toBeVisible();
}
const code =
  'const total = "Alpha(x)";\nconsole.log("alpha(x)", total);\nconst literal = "[.*]";\nwindow.__snippetExecuted = true;';
const source =
  '# Code tools\n\nInline `const inline = true` stays inline.\n\n```ts title="src/main.ts" {2} startLine=10\n' +
  code +
  '\n```\n\n```auto title="src/implicit.py"\nprint("Filename grammar")\n```\n\n```auto title="src/lib.rs"\nfn main() { println!("Local Rust"); }\n```\n\n```\nSingle unlabeled line\n```';
test("code controls preserve source, find literal text, retain state, and edit only a scratch copy offline", async ({
  page,
  context,
}) => {
  await load(page, source);
  const block = page.getByRole("group", {
    name: "Code snippet: src/main.ts",
    exact: true,
  });
  await expect(block.locator(".code-token").first()).toBeVisible();
  await expect(block.locator('[data-source-line="1"]')).toHaveAttribute(
    "data-line",
    "10",
  );
  await expect(block.locator('[data-source-line="2"]')).toHaveClass(
    /code-emphasis/,
  );
  await expect(page.locator("article p code")).toHaveText(
    "const inline = true",
  );
  await expect(
    page
      .getByRole("group", { name: "Code snippet: text", exact: true })
      .locator(".code-line-text"),
  ).toHaveText("Single unlabeled line");
  const inferred = page.getByRole("group", {
    name: "Code snippet: src/implicit.py",
    exact: true,
  });
  await expect(inferred.locator(".code-toolbar")).toContainText("python");
  await expect(inferred.locator(".code-token").first()).toBeVisible();
  await expect(
    page
      .getByRole("group", { name: "Code snippet: src/lib.rs", exact: true })
      .locator(".code-token")
      .first(),
  ).toBeVisible();
  const rust = page.getByRole("group", {
    name: "Code snippet: src/lib.rs",
    exact: true,
  });
  await expect(rust).not.toContainText("No bundled grammar");
  await expect
    .poll(() => rust.locator(".code-token").count())
    .toBeGreaterThan(1);
  await block
    .getByRole("button", { name: "Wrap code lines", exact: true })
    .click();
  await expect(block).toHaveClass(/code-wrap/);
  await block
    .getByRole("button", { name: "Show code line numbers", exact: true })
    .click();
  await expect(block).not.toHaveClass(/code-numbered/);
  await block
    .getByRole("button", { name: "Find in code", exact: true })
    .click();
  const search = block.getByRole("searchbox", { name: "Find code text" });
  await search.fill("alpha(x)");
  await expect(block.getByRole("status")).toHaveText("1 of 2 matches");
  await block
    .getByRole("button", { name: "Next code match", exact: true })
    .click();
  await expect(block.getByRole("status")).toHaveText("2 of 2 matches");
  await expect(block.locator('[data-source-line="2"]')).toHaveClass(
    /code-line-current/,
  );
  await block
    .getByRole("button", { name: "Match code case", exact: true })
    .click();
  await expect(block.getByRole("status")).toHaveText("1 of 1 matches");
  await search.fill("const total");
  await expect(block.getByRole("status")).toHaveText("1 of 1 matches");
  expect((await block.locator("mark").allTextContents()).join("")).toBe(
    "const total",
  );
  await search.fill("[.*]");
  await expect(block.getByRole("status")).toHaveText("1 of 1 matches");
  await expect(block.locator("mark")).toHaveText("[.*]");
  await page
    .getByRole("button", { name: "Toggle document details", exact: true })
    .click();
  await expect(block).toHaveClass(/code-wrap/);
  await expect(search).toHaveValue("[.*]");
  const darkColor = await block
    .locator(".code-token")
    .first()
    .evaluate((element) => getComputedStyle(element).color);
  await page
    .getByRole("button", { name: "Toggle light and dark theme", exact: true })
    .click();
  await expect
    .poll(() =>
      block
        .locator(".code-token")
        .first()
        .evaluate((element) => getComputedStyle(element).color),
    )
    .not.toBe(darkColor);
  await search.press("Escape");
  await expect(
    block.getByRole("button", { name: "Find in code", exact: true }),
  ).toBeFocused();
  await block
    .getByRole("button", { name: "Find in code", exact: true })
    .click();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await block.getByRole("button", { name: "Copy code", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
  const original = page.waitForEvent("download");
  await block
    .getByRole("button", { name: "Download code", exact: true })
    .click();
  const file = await original;
  expect(file.suggestedFilename()).toBe("main.ts");
  expect((await bytes(file)).toString()).toBe(code);
  await block
    .getByRole("button", { name: "Edit scratch copy of snippet", exact: true })
    .click();
  let editor = page.getByRole("dialog", {
    name: "Snippet scratch editor",
    exact: true,
  });
  await expect(editor.locator(".cm-content")).toContainText("const total");
  const scratch = 'const scratch = "local only";';
  await editor.locator(".cm-content").fill(scratch);
  const edited = page.waitForEvent("download");
  await editor
    .getByRole("button", { name: "Download edited snippet", exact: true })
    .click();
  expect((await bytes(await edited)).toString()).toBe(scratch);
  await editor
    .getByRole("button", { name: "Copy edited snippet", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    scratch,
  );
  await editor
    .getByRole("button", { name: "Reset scratch copy", exact: true })
    .click();
  await expect(editor.locator(".cm-content")).toContainText("const total");
  await editor.getByRole("button", { name: "Close dialog" }).click();
  const markdown = page.waitForEvent("download");
  await command(page, "Download Markdown");
  expect((await bytes(await markdown)).toString()).toBe(source);
  expect(await page.evaluate(() => "__snippetExecuted" in window)).toBe(false);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(block.locator(".code-token").first()).toBeVisible();
  await block
    .getByRole("button", { name: "Edit scratch copy of snippet", exact: true })
    .click();
  editor = page.getByRole("dialog", {
    name: "Snippet scratch editor",
    exact: true,
  });
  await expect(editor.locator(".cm-content")).toContainText("const total");
  const violations = (
    await new AxeBuilder({ page }).analyze()
  ).violations.filter((v) => ["serious", "critical"].includes(v.impact || ""));
  expect(violations).toEqual([]);
});
test("long snippets page and search all lines, wrap on mobile, and restore the full original source for print", async ({
  page,
  context,
}) => {
  const lines = Array.from({ length: 451 }, (_, i) =>
    i === 420 ? "target needle" : i === 0 ? "x".repeat(1000) : `line ${i + 1}`,
  );
  const content = lines.join("\n");
  await load(
    page,
    '# Code tools\n\n```text title="large.txt"\n' + content + "\n```",
  );
  const block = page.getByRole("group", {
    name: "Code snippet: large.txt",
    exact: true,
  });
  await expect(block.locator(".code-line")).toHaveCount(200);
  await expect(block).toContainText("Lines 1–200 of 451");
  await block.getByRole("button", { name: "Next lines", exact: true }).click();
  await expect(block).toContainText("Lines 201–400 of 451");
  await block
    .getByRole("button", { name: "Find in code", exact: true })
    .click();
  await block
    .getByRole("searchbox", { name: "Find code text" })
    .fill("target needle");
  await expect(block).toContainText("Lines 401–451 of 451");
  await expect(block.locator('[data-source-line="421"] mark')).toHaveText(
    "target needle",
  );
  await block
    .getByRole("button", { name: "Collapse code block", exact: true })
    .click();
  await expect(block.locator(".code-line")).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      window.dispatchEvent(new Event("beforeprint"));
      return document.querySelectorAll(".code-line").length;
    }),
  ).toBe(451);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(block.locator(".code-line")).toHaveCount(0);
  await block
    .getByRole("button", { name: "Expand code block", exact: true })
    .click();
  await block.getByRole("searchbox", { name: "Find code text" }).fill("line 2");
  await page.setViewportSize({ width: 390, height: 844 });
  await block
    .getByRole("button", { name: "Wrap code lines", exact: true })
    .click();
  expect(
    await block.locator("pre").evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await block.getByRole("button", { name: "Copy code", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    content,
  );
  const violations = (
    await new AxeBuilder({ page }).analyze()
  ).violations.filter((v) => ["serious", "critical"].includes(v.impact || ""));
  expect(violations).toEqual([]);
});
test("diff and untrusted metadata remain inert, unsupported grammars fall back, and clipboard refusal is honest", async ({
  page,
}) => {
  await load(
    page,
    '# Code tools\n\n```diff title="changes.patch"\n--- a/main.ts\n+++ b/main.ts\n@@ -1 +1 @@\n-old value\n+new value\n```\n\n```unknownlang title="src/<img src=x onerror=alert(1)>.txt"\n<script>window.__snippetExecuted = true</script>\n```',
  );
  const diff = page.getByRole("group", {
    name: "Code snippet: changes.patch",
    exact: true,
  });
  await expect(diff.locator(".code-diff-header")).toHaveCount(3);
  await expect(diff.locator(".code-token").first()).toBeVisible();
  await expect(diff).not.toContainText("No bundled grammar");
  await expect(diff.locator(".code-diff-added")).toHaveText("+new value");
  await expect(diff.locator(".code-diff-removed")).toHaveText("-old value");
  const unsafe = page.getByRole("group", {
    name: "Code snippet: src/<img src=x onerror=alert(1)>.txt",
    exact: true,
  });
  await expect(unsafe).toContainText("No bundled grammar for unknownlang");
  await expect(unsafe.locator("img,script")).toHaveCount(0);
  expect(await page.evaluate(() => "__snippetExecuted" in window)).toBe(false);
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
      configurable: true,
    }),
  );
  await unsafe.getByRole("button", { name: "Copy code", exact: true }).click();
  await expect(unsafe.getByRole("status")).toContainText(
    "Clipboard access was unavailable",
  );
  await expect(
    unsafe.getByRole("button", { name: "Snippet copied", exact: true }),
  ).toHaveCount(0);
});
test("very large code blocks retain all source with a bounded line view and an explicit plain-text fallback", async ({
  page,
}) => {
  const content = Array.from(
    { length: 3001 },
    (_, i) => `const value${i} = ${i};`,
  ).join("\n");
  await load(
    page,
    '# Code tools\n\n```js title="oversize.js"\n' + content + "\n```",
  );
  const block = page.getByRole("group", {
    name: "Code snippet: oversize.js",
    exact: true,
  });
  await expect(block).toContainText("Large snippet shown as plain text");
  await expect(block.locator(".code-line")).toHaveCount(200);
  await expect(block.locator(".code-token")).toHaveCount(0);
  const file = page.waitForEvent("download");
  await block
    .getByRole("button", { name: "Download code", exact: true })
    .click();
  expect((await bytes(await file)).toString()).toBe(content);
});
