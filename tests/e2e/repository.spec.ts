import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { unzipSync } from "fflate";
import {
  githubResponse,
  fixtureFiles,
  gitBlob,
  commits,
  trees,
} from "../fixtures/github-repository";
async function allData(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{
        documents: {
          id: string;
          path: string;
          content: string;
          workspaceId: string;
          repositorySource?: unknown;
        }[];
        workspaces: { id: string; name: string }[];
      }>((resolve, reject) => {
        const request = indexedDB.open("openmdviewer");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction(["documents", "workspaces"]),
            docs = tx.objectStore("documents").getAll(),
            workspaces = tx.objectStore("workspaces").getAll();
          tx.oncomplete = () => {
            resolve({ documents: docs.result, workspaces: workspaces.result });
            db.close();
          };
          tx.onerror = () => {
            reject(tx.error);
            db.close();
          };
        };
      }),
  );
}
async function mock(
  context: BrowserContext,
  change?: (
    url: string,
    result: ReturnType<typeof githubResponse>,
  ) => ReturnType<typeof githubResponse>,
) {
  const calls: { url: string; authorization: string | undefined }[] = [];
  await context.route("https://api.github.com/**", async (route) => {
    const request = route.request();
    if (request.method() !== "OPTIONS")
      calls.push({
        url: request.url(),
        authorization: request.headers().authorization,
      });
    const result = githubResponse(request.url());
    await route.fulfill(
      request.method() === "OPTIONS"
        ? { status: 204, headers: result.headers }
        : change
          ? change(request.url(), result)
          : result,
    );
  });
  return calls;
}
async function open(page: Page) {
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search documents and commands" })
    .fill("> browse github repository");
  await page
    .getByRole("option", { name: "Browse GitHub repository", exact: true })
    .click();
  return page.getByRole("dialog", {
    name: "Browse GitHub repository",
    exact: true,
  });
}
async function connect(page: Page) {
  const dialog = await open(page);
  await dialog
    .getByLabel("GitHub repository", { exact: true })
    .fill("example/manual");
  await dialog
    .getByRole("button", { name: "Browse repository", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Repository README", exact: true }),
  ).toBeVisible();
  return dialog;
}
async function properties(page: Page) {
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search documents and commands" })
    .fill("> document properties");
  await page
    .getByRole("option", { name: "Document properties", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Document properties", exact: true });
}
const ready = (page: Page) =>
  expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await ready(page);
});

test("browses real provider-shaped trees, follows pinned document links and atomically imports selected files for offline reading and source export", async ({
  page,
  context,
}) => {
  test.setTimeout(150000);
  const calls = await mock(context),
    before = await allData(page),
    remote: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("repository-attacker.invalid"))
      remote.push(request.url());
  });
  const dialog = await connect(page);
  await expect(dialog).toContainText(commits.main);
  await expect(dialog).toContainText("3 other entries omitted");
  expect((await allData(page)).workspaces).toEqual(before.workspaces);
  expect(
    await page.evaluate(() => "REPOSITORY_SCRIPT_EXECUTED" in window),
  ).toBe(false);
  expect(remote).toEqual([]);
  await dialog.getByRole("link", { name: "Open guide", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "Repository guide", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.locator(".repository-preview #user-content-details"),
  ).toBeInViewport();
  await dialog
    .getByRole("button", { name: "Folder docs", exact: true })
    .click();
  await dialog
    .getByRole("checkbox", { name: "Select docs/Guide.md", exact: true })
    .check();
  await dialog
    .getByRole("checkbox", { name: "Select docs/picture.png", exact: true })
    .check();
  await dialog
    .getByRole("button", { name: "Source preview", exact: true })
    .click();
  await expect(
    dialog.getByRole("textbox", {
      name: "Repository Markdown source",
      exact: true,
    }),
  ).toHaveValue(Buffer.from(fixtureFiles["docs/Guide.md"]).toString());
  await page.screenshot({ path: "/tmp/openmdviewer-repository-desktop.png" });
  await dialog
    .getByRole("button", { name: "Import selected files locally", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Repository README", exact: true }),
  ).toBeVisible();
  const imported = await allData(page);
  expect(imported.workspaces).toHaveLength(before.workspaces.length + 1);
  expect(imported.documents.filter((d) => d.workspaceId === "default")).toEqual(
    before.documents.filter((d) => d.workspaceId === "default"),
  );
  expect(imported.documents.filter((d) => d.repositorySource)).toHaveLength(2);
  let props = await properties(page);
  await expect(
    props.getByRole("link", {
      name: "View original file on GitHub",
      exact: true,
    }),
  ).toHaveAttribute(
    "href",
    `https://github.com/example/manual/blob/${commits.main}/README.md`,
  );
  await page.keyboard.press("Escape");
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
      timeout: 90000,
    })
    .toBe(true);
  const requestCount = calls.length;
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Repository README", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open guide", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Repository guide", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Enlarge image: Local picture",
      exact: true,
    }),
  ).toHaveJSProperty("naturalWidth", 1);
  expect(calls.length).toBe(requestCount);
  props = await properties(page);
  await expect(props).toContainText(commits.main);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Export document", exact: true })
    .click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Entire workspace/ }).click();
  const stream = await (await pending).createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const zip = unzipSync(Buffer.concat(chunks)),
    metadata = JSON.parse(
      Buffer.from(zip[".openmdviewer/workspace.json"]).toString(),
    );
  expect(
    metadata.documents.find((d: { path: string }) => d.path === "docs/Guide.md")
      .repositorySource.commit,
  ).toBe(commits.main);
  expect(Buffer.from(zip["docs/picture.png"])).toEqual(
    Buffer.from(fixtureFiles["docs/picture.png"]),
  );
});

test("switches slash-containing branches and tags, keeps token memory-only and imports the chosen immutable version", async ({
  page,
  context,
}) => {
  const calls = await mock(context),
    dialog = await open(page);
  await dialog
    .getByLabel("GitHub repository", { exact: true })
    .fill("https://github.com/example/manual");
  await dialog.getByText("Optional GitHub token", { exact: true }).click();
  await dialog
    .getByLabel("Session token", { exact: true })
    .fill("test-only-token");
  await dialog
    .getByRole("button", { name: "Browse repository", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Repository README", exact: true }),
  ).toBeVisible();
  await expect(dialog.getByLabel("Session token", { exact: true })).toHaveValue(
    "",
  );
  await dialog
    .getByLabel("Branch or tag", { exact: true })
    .selectOption("branch:feature/docs");
  await expect(dialog).toContainText(`commit ${commits.feature}`);
  await expect(
    dialog.getByRole("heading", { name: "Repository README", exact: true }),
  ).toBeVisible();
  await dialog
    .getByLabel("Branch or tag", { exact: true })
    .selectOption("tag:v1.0");
  await expect(dialog).toContainText(`commit ${commits.tag}`);
  await expect(
    dialog.getByRole("heading", { name: "Repository README", exact: true }),
  ).toBeVisible();
  expect(
    calls.some((call) => call.url.includes("heads%2Ffeature%2Fdocs")),
  ).toBe(true);
  expect(
    calls.every((call) => call.authorization === "Bearer test-only-token"),
  ).toBe(true);
  expect(calls.filter((call) => call.url.includes("/git/blobs/"))).toHaveLength(
    1,
  );
  await dialog
    .getByRole("button", { name: "Import selected files locally", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const stored = await allData(page);
  expect(JSON.stringify(stored)).not.toContain("test-only-token");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "test-only-token",
  );
  const document = stored.documents.find((d) => d.repositorySource)!;
  expect(document.repositorySource).toMatchObject({
    commit: commits.tag,
    ref: { kind: "tag", name: "v1.0" },
  });
});

test("rate limits, truncated trees and mismatched blob bytes never create partial workspaces", async ({
  page,
  context,
}) => {
  let phase = "rate";
  await mock(context, (url, result) => {
    if (phase === "rate")
      return {
        ...result,
        status: 403,
        headers: {
          ...result.headers,
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "2000000000",
        },
        body: Buffer.from("{}"),
      };
    if (phase === "truncated" && url.includes("/git/trees/"))
      return {
        ...result,
        body: Buffer.from(
          JSON.stringify({
            ...JSON.parse(result.body.toString()),
            truncated: true,
          }),
        ),
      };
    if (phase === "corrupt" && url.includes("/git/blobs/")) {
      const bytes = Buffer.from(result.body);
      bytes[0] ^= 1;
      return { ...result, body: bytes };
    }
    return result;
  });
  const before = await allData(page),
    dialog = await open(page);
  await dialog
    .getByLabel("GitHub repository", { exact: true })
    .fill("example/manual");
  await dialog
    .getByRole("button", { name: "Browse repository", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("rate limit");
  expect((await allData(page)).workspaces).toEqual(before.workspaces);
  phase = "truncated";
  await dialog
    .getByRole("button", { name: "Browse repository", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("truncated");
  expect((await allData(page)).workspaces).toEqual(before.workspaces);
  phase = "corrupt";
  await dialog
    .getByRole("button", { name: "Browse repository", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("blob ID");
  await dialog
    .getByRole("button", { name: "Import selected files locally", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("blob ID");
  expect(await allData(page)).toEqual(before);
});

test("canceling a delayed read ignores its late response and a fresh retry succeeds without partial imports", async ({
  page,
  context,
}) => {
  let release: () => void = () => {},
    stall = true;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await context.route("https://api.github.com/**", async (route) => {
    const result = githubResponse(route.request().url());
    if (stall && route.request().url().includes("/git/blobs/")) await delayed;
    await route.fulfill(result).catch(() => {});
  });
  const before = await allData(page),
    dialog = await open(page);
  await dialog
    .getByLabel("GitHub repository", { exact: true })
    .fill("example/manual");
  await dialog
    .getByRole("button", { name: "Browse repository", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("Reading README.md");
  await dialog
    .getByRole("button", { name: "Cancel repository request", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("canceled");
  stall = false;
  release();
  expect((await allData(page)).workspaces).toEqual(before.workspaces);
  await expect(
    dialog.getByRole("heading", { name: "Repository README", exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Load latest snapshot", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Repository README", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await ready(page);
});

test("paginates large folders without additional requests and keeps mobile browsing accessible", async ({
  page,
  context,
}) => {
  const extra = Array.from({ length: 125 }, (_, i) => ({
    path: `File${String(i).padStart(3, "0")}.md`,
    bytes: Buffer.from(`# Extra document ${i}\n\nLocal content.`),
  }));
  const calls = await mock(context, (url, result) => {
    if (url.includes(`/git/trees/${trees.main}`)) {
      const tree = JSON.parse(result.body.toString());
      tree.tree.push(
        ...extra.map((file) => ({
          path: file.path,
          type: "blob",
          mode: "100644",
          sha: gitBlob(file.bytes),
          size: file.bytes.length,
        })),
      );
      return { ...result, body: Buffer.from(JSON.stringify(tree)) };
    }
    if (url.includes("/git/blobs/")) {
      const file = extra.find((file) => url.endsWith(gitBlob(file.bytes)));
      if (file) return { ...result, status: 200, body: file.bytes };
    }
    return result;
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await connect(page),
    count = calls.length;
  await expect(dialog.locator(".repository-files li")).toHaveCount(50);
  await dialog.getByRole("button", { name: "Next files", exact: true }).click();
  await expect(dialog).toContainText("51–100");
  expect(calls.length).toBe(count);
  await dialog
    .getByLabel("Filter this folder", { exact: true })
    .fill("File119");
  await expect(dialog.locator(".repository-files li")).toHaveCount(1);
  await dialog
    .getByRole("button", { name: "Preview File119.md", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Extra document 119", exact: true }),
  ).toBeVisible();
  const scan = await new AxeBuilder({ page }).include("dialog[open]").analyze();
  expect(scan.violations).toEqual([]);
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/openmdviewer-repository-mobile.png" });
});

test("a Git LFS image pointer fails the complete import without fetching external LFS content", async ({
  page,
  context,
}) => {
  const pointer = Buffer.from(
      "version https://git-lfs.github.com/spec/v1\noid sha256:" +
        "a".repeat(64) +
        "\nsize 999999\n",
    ),
    id = gitBlob(pointer),
    external: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("git-lfs.github.com"))
      external.push(request.url());
  });
  await mock(context, (url, result) => {
    if (url.includes(`/git/trees/${trees.docs}`)) {
      const tree = JSON.parse(result.body.toString()),
        image = tree.tree.find(
          (entry: { path: string }) => entry.path === "picture.png",
        );
      image.sha = id;
      image.size = pointer.length;
      return { ...result, body: Buffer.from(JSON.stringify(tree)) };
    }
    if (url.endsWith("/git/blobs/" + id))
      return { ...result, status: 200, body: pointer };
    return result;
  });
  const before = await allData(page),
    dialog = await connect(page);
  await dialog
    .getByRole("button", { name: "Folder docs", exact: true })
    .click();
  await dialog
    .getByRole("checkbox", { name: "Select docs/picture.png", exact: true })
    .check();
  await dialog
    .getByRole("button", { name: "Import selected files locally", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("Git LFS pointer");
  expect(await allData(page)).toEqual(before);
  expect(external).toEqual([]);
});
