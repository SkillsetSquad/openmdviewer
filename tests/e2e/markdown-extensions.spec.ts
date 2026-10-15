import { test, expect, type Page, type Download } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function bytes(file: Download) {
  const chunks: Buffer[] = [];
  for await (const chunk of (await file.createReadStream())!)
    chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
async function load(page: Page, source: string) {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles([
      {
        name: "Glossary.md",
        mimeType: "text/markdown",
        buffer: Buffer.from(source),
      },
      {
        name: "Guide.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("# Linked guide\n\nA local reference."),
      },
    ]);
  await expect(
    page.getByRole("heading", { name: "Reader 🚀", exact: true }),
  ).toBeVisible();
}
async function command(page: Page, label: string) {
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search documents and commands" })
    .fill(`> ${label}`);
  await page.getByRole("option", { name: label, exact: true }).click();
}
const source = [
  "# Reader :rocket:",
  "",
  "Workspace :sparkles:",
  ":   A **local** definition :+1: with [Guide](Guide.md).",
  ":   Another meaning :smile:.",
  "",
  "Long term",
  ":   First paragraph.",
  "",
  "    Second paragraph with inline `:smile:`.",
  "",
  "    - A nested item :rocket:",
  "",
  "Escaped \\:smile: and :rocket\\: stay literal; :unknown_xyz: stays unknown.",
  "",
  "> [!NOTE]",
  "> \\:smile: :rocket:",
  "",
  "[[Guide|\\:smile: and :rocket:]]",
  "",
  "<https://example.test/:smile:>",
  "",
  "## Details :sparkles:",
  "",
  "```text",
  ":smile: :rocket:",
  "```",
].join("\n");
test("definition lists and emoji share reader/search/navigation semantics and preserve original source offline", async ({
  page,
  context,
}) => {
  await load(page, source);
  const article = page.locator("article");
  await expect(article.locator("dt")).toHaveText(["Workspace ✨", "Long term"]);
  await expect(article.locator("dd")).toHaveCount(3);
  await expect(article.locator("dd").first()).toContainText(
    "A local definition 👍",
  );
  await expect(article.locator("dd").last().locator("li")).toHaveText(
    "A nested item 🚀",
  );
  await expect(article).toContainText(
    "Escaped :smile: and :rocket: stay literal; :unknown_xyz: stays unknown.",
  );
  await expect(article.locator("blockquote")).toContainText(":smile: 🚀");
  await expect(
    article.getByRole("link", { name: ":smile: and 🚀", exact: true }),
  ).toHaveAttribute("href", "wiki:Guide");
  await expect(
    article.getByRole("link", {
      name: "https://example.test/:smile:",
      exact: true,
    }),
  ).toHaveAttribute("href", "https://example.test/:smile:");
  await expect(article.locator(".code-line-text")).toHaveText(
    ":smile: :rocket:",
  );
  await page.getByRole("button", { name: "Details ✨", exact: true }).click();
  const heading = article.getByRole("heading", {
    name: "Details ✨",
    exact: true,
  });
  await expect(heading).toHaveAttribute("id", "user-content-details-");
  const markdown = page.waitForEvent("download");
  await command(page, "Download Markdown");
  expect((await bytes(await markdown)).toString()).toBe(source);
  await article
    .getByRole("link", { name: ":smile: and 🚀", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Linked guide", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Glossary.md", exact: true }).click();
  await page.keyboard.press("Control+k");
  const search = page.getByRole("combobox", {
    name: "Search documents and commands",
  });
  await search.fill("Workspace");
  await expect(
    page.getByRole("option").filter({ hasText: "Glossary.md" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const violations = (
    await new AxeBuilder({ page }).analyze()
  ).violations.filter((v) => ["serious", "critical"].includes(v.impact || ""));
  expect(violations).toEqual([]);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Reader 🚀", exact: true }),
  ).toBeVisible();
  await expect(page.locator("article dt").first()).toHaveText("Workspace ✨");
  await expect(page.locator("article blockquote")).toContainText(":smile: 🚀");
});
test("HTML export includes semantic definitions and Unicode, repairs anchors, and keeps every media resource passive", async ({
  page,
  context,
}) => {
  const requests: string[] = [];
  await context.route("https://media.example.test/**", (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  const original =
    source +
    '\n\n[Details](#details-)\n\n![Image :smile:](https://media.example.test/image.png)\n\n<audio src="https://media.example.test/audio.mp3"></audio>\n\n<table><tr><th>Native</th></tr><tr><td>Safe cell</td></tr></table>\n\n<script>window.__exportExecuted=true</script>';
  await load(page, original);
  await page
    .getByRole("button", { name: "Export document", exact: true })
    .click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /HTML document/ }).click();
  const html = (await bytes(await pending)).toString();
  expect(html).toContain("<dl>");
  expect(html).toContain("<dt>Workspace ✨</dt>");
  expect(html).toContain("Reader 🚀");
  expect(html).toContain("<code>:smile:</code>");
  expect(html).not.toMatch(/<img|<audio|<video|<script/);
  expect(html).toContain(
    "Image :smile: — https://media.example.test/image.png",
  );
  expect(html).toContain("Media: audio — https://media.example.test/audio.mp3");
  expect(html).toContain("NOTE");
  expect(html).toContain("Safe cell");
  expect(html).toContain('href="#user-content-details-"');
  const exported = await context.newPage();
  await exported.setContent(html);
  await expect(
    exported.getByRole("heading", { name: "Reader 🚀", exact: true }),
  ).toBeVisible();
  await expect(exported.locator("dl dd")).toHaveCount(3);
  expect(await exported.evaluate(() => "__exportExecuted" in window)).toBe(
    false,
  );
  expect(requests).toEqual([]);
  await exported.close();
});
