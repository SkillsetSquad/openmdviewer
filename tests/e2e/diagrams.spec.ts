import { test, expect, type Page, type Download } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function bytes(file: Download) {
  const parts: Buffer[] = [];
  for await (const part of (await file.createReadStream())!)
    parts.push(Buffer.from(part));
  return Buffer.concat(parts);
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
      name: "Diagrams.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(source),
    });
}
const graph =
  "flowchart LR\nA[Local files] --> B[Markdown reader]\nB --> C[Offline workspace]";
const source = "# Diagram tools\n\n```mermaid\n" + graph + "\n```";
test("diagram viewer pans, zooms, expands, copies source and exports actual SVG/PNG while preserving Markdown", async ({
  page,
  context,
}) => {
  await load(page, source);
  let diagram = page.getByRole("region", {
    name: "Mermaid diagram",
    exact: true,
  });
  await expect(diagram.locator(".diagram-art > svg")).toBeVisible();
  await expect(diagram.locator(".diagram-art > svg")).toContainText(
    "Local files",
  );
  await diagram.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(diagram.getByLabel("Diagram zoom", { exact: true })).toHaveText(
    "125%",
  );
  const canvas = diagram.getByRole("group", {
    name: "Diagram canvas",
    exact: true,
  });
  const art = canvas.locator(".diagram-art");
  const before = await art.getAttribute("style");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas missing");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 35,
    box.y + box.height / 2 + 20,
  );
  await page.mouse.up();
  await expect(art).not.toHaveAttribute("style", before!);
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await expect(art).toHaveAttribute("style", /translate\(-5px, 20px\)/);
  await page.keyboard.press("0");
  await expect(art).toHaveAttribute(
    "style",
    /translate\(0px, 0px\) scale\(1\)/,
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await diagram
    .getByRole("button", { name: "Copy diagram source", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(graph);
  const svgEvent = page.waitForEvent("download");
  await diagram
    .getByRole("button", { name: "Download diagram as SVG", exact: true })
    .click();
  const svg = (await bytes(await svgEvent)).toString();
  expect(
    await page.evaluate(
      (value) =>
        new DOMParser().parseFromString(value, "image/svg+xml").documentElement
          .textContent,
      svg,
    ),
  ).toContain("Local files");
  expect(svg).not.toMatch(/foreignObject|<script|<image/);
  const pngEvent = page.waitForEvent("download");
  await diagram
    .getByRole("button", { name: "Download diagram as PNG", exact: true })
    .click();
  const png = await bytes(await pngEvent);
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(png.readUInt32BE(16)).toBeGreaterThan(30);
  expect(png.readUInt32BE(20)).toBeGreaterThan(30);
  expect(
    await page.evaluate(async (data) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(data)], { type: "image/png" }),
      );
      const c = document.createElement("canvas");
      c.width = bitmap.width;
      c.height = bitmap.height;
      const x = c.getContext("2d")!;
      x.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = x.getImageData(0, 0, c.width, c.height).data;
      const colors = new Set<string>();
      for (let i = 0; i < pixels.length; i += 4) {
        colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
        if (colors.size > 5) break;
      }
      return colors.size;
    }, Array.from(png)),
  ).toBeGreaterThan(5);
  const mmdEvent = page.waitForEvent("download");
  await diagram
    .getByRole("button", { name: "Download diagram source", exact: true })
    .click();
  expect((await bytes(await mmdEvent)).toString()).toBe(graph);
  await diagram
    .getByRole("button", { name: "Expand diagram", exact: true })
    .click();
  const modal = page.getByRole("dialog", {
    name: "Expanded diagram",
    exact: true,
  });
  await expect(modal).toBeVisible();
  const fullscreen = modal.getByRole("button", {
    name: "Toggle diagram fullscreen",
    exact: true,
  });
  await expect(fullscreen).toHaveCount(
    (await page.evaluate(() => document.fullscreenEnabled)) ? 1 : 0,
  );
  if (await fullscreen.count()) {
    await fullscreen.click();
    await expect
      .poll(() => page.evaluate(() => document.fullscreenElement?.tagName))
      .toBe("DIV");
    await expect(fullscreen).toHaveAttribute("aria-pressed", "true");
    await fullscreen.click();
    await expect
      .poll(() => page.evaluate(() => document.fullscreenElement === null))
      .toBe(true);
  }

  await expect(modal.locator(".diagram-art > svg")).toContainText(
    "Offline workspace",
  );
  const violations = (
    await new AxeBuilder({ page }).analyze()
  ).violations.filter((v) => ["serious", "critical"].includes(v.impact || ""));
  expect(violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(
    diagram.getByRole("button", { name: "Expand diagram", exact: true }),
  ).toBeFocused();
  const old = await diagram
    .locator(".diagram-art .node rect")
    .first()
    .evaluate((element) => getComputedStyle(element).fill);
  await page
    .getByRole("button", { name: "Toggle light and dark theme", exact: true })
    .click();
  await expect(diagram).toHaveClass(/diagram-light/);
  await expect(diagram.locator(".diagram-art > svg")).toBeVisible();
  await expect
    .poll(() =>
      diagram
        .locator(".diagram-art .node rect")
        .first()
        .evaluate((element) => getComputedStyle(element).fill),
    )
    .not.toBe(old);
  await page.setViewportSize({ width: 390, height: 844 });
  await diagram
    .getByRole("button", { name: "Expand diagram", exact: true })
    .click();
  expect(await modal.evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(
    true,
  );
  await modal
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  diagram = page.getByRole("region", { name: "Mermaid diagram", exact: true });
  await expect(diagram.locator(".diagram-art > svg")).toContainText(
    "Offline workspace",
  );
});
test("diagrams render multiple Mermaid types and clear stale output on errors", async ({
  page,
}) => {
  const fixtures = [
    ["sequenceDiagram\nAlice->>Bob: Local message", "Local message"],
    ["classDiagram\nAnimal <|-- Duck", "Animal"],
    ['pie title Local counts\n"One" : 1\n"Two" : 2', "One"],
    ["stateDiagram-v2\n[*] --> Ready\nReady --> [*]", "Ready"],
    ["erDiagram\nUSER ||--o{ BOOK : owns", "USER"],
    [
      "gantt\ntitle Plan\ndateFormat YYYY-MM-DD\nsection Work\nTask :a1, 2026-01-01, 1d",
      "Task",
    ],
    ["gitGraph\ncommit\nbranch develop\ncheckout develop\ncommit", "develop"],
    ["timeline\ntitle Work\n2026 : Launch", "Launch"],
    ["mindmap\n  root((Workspace))\n    Notes\n    Files", "Workspace"],
    ["journey\ntitle Reading\nsection Browse\nOpen file: 5: Reader", "Reader"],
    [
      "quadrantChart\ntitle Work\nx-axis Low --> High\ny-axis Low --> High\nTask: [0.3,0.6]",
      "Task",
    ],
  ];
  await load(
    page,
    "# Diagram tools\n\n" +
      fixtures
        .map(([diagram]) => "```mermaid\n" + diagram + "\n```")
        .join("\n\n"),
  );
  await expect(page.locator(".diagram-art > svg")).toHaveCount(fixtures.length);
  for (let index = 0; index < fixtures.length; index++)
    await expect(page.locator(".diagram-art > svg").nth(index)).toContainText(
      fixtures[index][1],
    );
  await page.getByRole("button", { name: "Split view", exact: true }).click();
  await page
    .locator(".cm-content")
    .fill("# Diagram tools\n\n```mermaid\nflowchart LR\nA -->\n```");
  const diagram = page.getByRole("region", {
    name: "Mermaid diagram",
    exact: true,
  });
  await expect(diagram.getByRole("alert")).toContainText(
    "Diagram could not render",
  );
  await expect(diagram.locator(".diagram-art > svg")).toHaveCount(0);
  await expect(
    diagram.getByRole("button", {
      name: "Download diagram as SVG",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(diagram.locator(".diagram-source")).toContainText("A -->");
});
test("external and encoded active diagram resources are rejected before rendering or network requests", async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route("https://diagram.example.test/**", (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  const fixtures = [
    'flowchart LR\nA@{ img: "https://diagram.example.test/pixel.png" }',
    "flowchart LR\nA[Text]\nclassDef bad fill:u\\72l(https://diagram.example.test/fill.svg);\nclass A bad",
    '%%{init: {"securityLevel":"loose","themeCSS":"@import url(https://diagram.example.test/theme.css)"}}%%\nflowchart LR\nA --> B',
  ];
  await load(
    page,
    "# Diagram tools\n\n" +
      fixtures.map((s) => "```mermaid\n" + s + "\n```").join("\n\n"),
  );
  await expect(page.locator(".diagram [role=alert]")).toHaveCount(3);
  await expect(page.locator(".diagram-art > svg")).toHaveCount(0);
  expect(requests).toEqual([]);
});
