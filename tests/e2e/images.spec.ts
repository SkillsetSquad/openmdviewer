import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  "base64",
);
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#2589e8"/><text x="8" y="42" fill="white">Local SVG</text><image href="https://svg.example.test/hidden.png" width="1" height="1"/><script>window.__svgExecuted=true</script></svg>';
test("local gallery shows measured metadata, zooms and pans, copies PNG, downloads original SVG, and works on mobile", async ({
  page,
  context,
}) => {
  const embeddedRequests: string[] = [];
  await page.route("https://svg.example.test/**", (route) => {
    embeddedRequests.push(route.request().url());
    return route.abort();
  });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles([
      {
        name: "Gallery.md",
        mimeType: "text/markdown",
        buffer: Buffer.from(
          "# Image fixture\n\n![Pixel](pixel.png)\n\n![Vector](vector.svg)\n\n![Missing](missing.png)",
        ),
      },
      { name: "pixel.png", mimeType: "image/png", buffer: pixel },
      {
        name: "vector.svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from(svg),
      },
    ]);
  await page
    .getByRole("button", { name: "Enlarge image: Pixel", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "Pixel", exact: true });
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("1 × 1 pixels");
  await expect(modal).toContainText(`${pixel.length} bytes`);
  const zoom = modal.getByRole("status", { name: "Image zoom" });
  await modal
    .getByRole("button", { name: "Zoom image in", exact: true })
    .click();
  await expect(zoom).toHaveText("140% of fit");
  const stage = modal.getByRole("group", { name: "Image canvas", exact: true });
  const before = await stage.locator("img").getAttribute("style");
  const box = await stage.boundingBox();
  if (!box) throw new Error("Image stage missing");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 40,
    box.y + box.height / 2 + 20,
  );
  await page.mouse.up();
  await expect(stage.locator("img")).not.toHaveAttribute("style", before!);
  await modal.getByRole("button", { name: "Fit image", exact: true }).click();
  await expect(zoom).toHaveText("100% of fit");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await modal.getByRole("button", { name: "Copy image", exact: true }).click();
  await expect(modal).toContainText("Image copied as PNG");
  expect(
    await page.evaluate(
      async () => (await navigator.clipboard.read())[0].types,
    ),
  ).toContain("image/png");
  await modal
    .getByRole("button", { name: "Copy image URL", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
    /^blob:/,
  );
  await stage.focus();
  await page.keyboard.press("ArrowRight");
  const vector = page.getByRole("dialog", { name: "Vector", exact: true });
  await expect(vector).toContainText("120 × 80 pixels");
  await expect(vector).toContainText("image/svg+xml");
  await vector.getByRole("button", { name: "Copy image", exact: true }).click();
  await expect(vector).toContainText("Image copied as PNG");
  expect(
    await page.evaluate(async () => {
      const value = await (
        await navigator.clipboard.read()
      )[0].getType("image/png");
      const bitmap = await createImageBitmap(value);
      const dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dimensions;
    }),
  ).toEqual({ width: 120, height: 80 });
  const download = page.waitForEvent("download");
  await vector
    .getByRole("button", { name: "Download image", exact: true })
    .click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe("vector.svg");
  const chunks: Buffer[] = [];
  for await (const part of (await saved.createReadStream())!)
    chunks.push(Buffer.from(part));
  expect(Buffer.concat(chunks).toString()).toBe(svg);
  expect(
    await page.evaluate(
      () => (window as Window & { __svgExecuted?: boolean }).__svgExecuted,
    ),
  ).toBeUndefined();
  expect(embeddedRequests).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(vector).toBeVisible();
  await expect
    .poll(() =>
      vector.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    )
    .toBe(true);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/image-viewer-mobile.png",
    fullPage: true,
  });
  await vector.getByRole("button", { name: "Next image", exact: true }).click();
  const missing = page.getByRole("dialog", { name: "Missing", exact: true });
  await expect(missing).toContainText("not available locally");
  await expect(
    missing.getByRole("button", { name: "Download image", exact: true }),
  ).toBeDisabled();
});

test("gallery navigation does not fetch remote images until each is allowed and reports unavailable byte reads", async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route("https://images.example.test/**", async (route) => {
    requests.push(route.request().url());
    if (route.request().resourceType() === "image")
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: pixel,
      });
    else await route.abort();
  });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles([
      {
        name: "Remote.md",
        mimeType: "text/markdown",
        buffer: Buffer.from(
          "# Remote fixture\n\n![Local](pixel.png)\n\n![Remote one](https://images.example.test/one.png)\n\n![Remote two](https://images.example.test/two.png)",
        ),
      },
      { name: "pixel.png", mimeType: "image/png", buffer: pixel },
    ]);
  await page
    .getByRole("button", { name: "Enlarge image: Local", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Next image", exact: true })
    .click();
  const remote = page.getByRole("dialog", { name: "Remote one", exact: true });
  await expect(remote).toContainText("Remote image blocked");
  expect(requests).toEqual([]);
  await remote
    .getByRole("button", { name: "Load this image", exact: true })
    .click();
  await expect(remote).toContainText("1 × 1 pixels");
  expect(requests.every((url) => url.endsWith("/one.png"))).toBe(true);
  await remote
    .getByRole("button", { name: "Read file metadata", exact: true })
    .click();
  await expect(remote).toContainText("browser or server policy");
  await remote.getByRole("button", { name: "Next image", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Remote two", exact: true }),
  ).toContainText("Remote image blocked");
  expect(requests.some((url) => url.endsWith("/two.png"))).toBe(false);
});
