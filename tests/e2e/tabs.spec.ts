import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("document tabs separate close actions, support keyboard navigation, and preserve focus after closing", async ({
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
        name: "Tab A.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("# Tab A"),
      },
      {
        name: "Tab B.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("# Tab B"),
      },
    ]);
  await expect(
    page.getByRole("heading", { name: "Tab A", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tab B.md", exact: true }).click();
  const tablist = page.getByRole("tablist", {
    name: "Open documents",
    exact: true,
  });
  await expect(tablist.getByRole("button")).toHaveCount(0);
  await expect(tablist.getByRole("tab")).toHaveCount(3);
  const b = tablist.getByRole("tab", { name: "Tab B.md", exact: true });
  await b.focus();
  await b.press("Home");
  await expect(
    tablist.getByRole("tab", { name: "Configuration.md", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("End");
  await expect(b).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  const a = tablist.getByRole("tab", { name: "Tab A.md", exact: true });
  await expect(a).toBeFocused();
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "aria-labelledby",
    (await a.getAttribute("id"))!,
  );
  await page.keyboard.press("Delete");
  await expect(tablist.getByRole("tab")).toHaveCount(2);
  await expect(b).toBeFocused();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Close Tab B.md tab", exact: true })
    .click();
  await expect(tablist).toHaveCount(0);
  await expect(page.locator("#active-document-panel")).toBeFocused();
});
