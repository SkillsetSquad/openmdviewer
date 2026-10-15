import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const source =
  "# Equations\n\nInline $x^2 + y^2$ remains in its paragraph.\n\n$$\n\\frac{1}{2} \\tag{A}\n$$\n\n```math\nE=mc^2\n```\n\n$$\n\\notARealCommand{x}\n$$";
test("equation tools copy exact LaTeX, expose accessible source and MathML, retain explicit tags, and work offline", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Math.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(source),
    });
  const inline = page.getByRole("group", {
    name: "Inline equation",
    exact: true,
  });
  const displays = page.getByRole("group", {
    name: "Display equation",
    exact: true,
  });
  await expect(inline.locator("math")).toHaveCount(1);
  await expect(displays).toHaveCount(3);
  await expect(displays.first().locator(".tag")).toContainText("(A)");
  await inline
    .getByRole("button", { name: "Copy LaTeX source", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "x^2 + y^2",
  );
  await inline
    .getByRole("button", { name: "Show LaTeX source", exact: true })
    .click();
  await expect(
    inline.getByRole("textbox", { name: "LaTeX source", exact: true }),
  ).toHaveValue("x^2 + y^2");
  await expect(inline.getByRole("textbox")).toHaveAttribute("readonly", "");
  await displays
    .first()
    .getByRole("button", { name: "Copy LaTeX source", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "\\frac{1}{2} \\tag{A}",
  );
  await expect(displays.last().locator(".math-error")).toContainText(
    "Undefined control sequence",
  );
  await displays
    .last()
    .getByRole("button", { name: "Show LaTeX source", exact: true })
    .click();
  await expect(displays.last().getByRole("textbox")).toHaveValue(
    "\\notARealCommand{x}",
  );
  const pending = page.waitForEvent("download");
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search documents and commands" })
    .fill("> Download Markdown");
  await page
    .getByRole("option", { name: "Download Markdown", exact: true })
    .click();
  const chunks: Buffer[] = [];
  for await (const chunk of (await (await pending).createReadStream())!)
    chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString()).toBe(source);
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
  await page.emulateMedia({ media: "print" });
  await expect(
    inline.getByRole("button", { name: "Copy LaTeX source", exact: true }),
  ).toBeHidden();
  await expect(inline.locator(".katex")).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("article math")).toHaveCount(3);
  await page
    .getByRole("group", { name: "Display equation", exact: true })
    .nth(1)
    .getByRole("button", { name: "Show LaTeX source", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "LaTeX source", exact: true }),
  ).toHaveValue("E=mc^2");
});
test("clipboard refusal offers selectable source and untrusted TeX never requests media", async ({
  page,
  context,
}) => {
  const requests: string[] = [];
  await context.route("https://math.example.test/**", (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Denied");
        },
      },
    });
  });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Untrusted.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        "# Untrusted\n\n$\\href{javascript:alert(1)}{Click}$\n\n$$\n\\includegraphics{https://math.example.test/pixel.png}\n$$\n\n$$\n\\def\\a{\\a}\\a\n$$",
      ),
    });
  const equations = page.locator(".reader-math");
  await expect(equations).toHaveCount(3);
  await equations
    .first()
    .getByRole("button", { name: "Copy LaTeX source", exact: true })
    .click();
  await expect(equations.first().getByRole("status")).toContainText(
    "Clipboard unavailable",
  );
  await expect(equations.first().getByRole("textbox")).toHaveValue(
    "\\href{javascript:alert(1)}{Click}",
  );
  expect(requests).toEqual([]);
  await expect(equations.locator("a,img,script,iframe")).toHaveCount(0);
});

test("oversized equations retain all source with a bounded mobile view", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  const source = "x".repeat(30001);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Large-math.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(`# Large equation\n\n$$\n${source}\n$$`),
    });
  const equation = page.getByRole("group", {
    name: "Display equation",
    exact: true,
  });
  await expect(equation).toContainText("exceeds 30,000 characters");
  await expect(equation.locator("math")).toHaveCount(0);
  await equation
    .getByRole("button", { name: "Show LaTeX source", exact: true })
    .click();
  await expect(equation.getByRole("textbox")).toHaveValue(source);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const bounds = await equation.locator(".math-rendered-limited").boundingBox();
  expect(bounds?.height).toBeLessThanOrEqual(240);
});
