import { afterEach, expect, it, vi } from "vitest";
import {
  fetchMarkdownURL,
  markdownURL,
  urlDocumentName,
  urlImportLimits,
  urlImportPath,
} from "../src/lib/url-import";
const signal = () => new AbortController().signal;
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function response(
  body: BodyInit,
  headers: Record<string, string> = {
    "content-type": "text/markdown; charset=utf-8",
  },
  status = 200,
) {
  const fetch = vi.fn(async () => new Response(body, { headers, status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
it("accepts explicit HTTPS URLs, strips only fragments and rejects executable protocols and URL credentials", () => {
  expect(markdownURL(" https://example.com/a.md?version=1#intro ").href).toBe(
    "https://example.com/a.md?version=1",
  );
  for (const url of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "data:text/plain,a",
    "http://example.com/a.md",
    "https://user:password@example.com/a.md",
    "https://example.com/a\nb.md",
    "https://example.com/a b.md",
    "https://example.com/" + "a".repeat(8192),
  ])
    expect(() => markdownURL(url)).toThrow();
  expect(
    urlDocumentName(markdownURL("https://example.com/My%20notes.markdown")),
  ).toBe("My notes.markdown");
  for (const url of [
    "https://example.com/docs/",
    "https://example.com/file.html",
    "https://example.com/a%2Fb.md",
  ])
    expect(urlDocumentName(markdownURL(url))).toBe("Remote document.md");
  expect(urlImportPath("Docs/Remote.md")).toBe("Docs/Remote.md");
  for (const path of [
    "../a.md",
    "/a.md",
    "a//b.md",
    "a/./b.md",
    "a\\b.md",
    "a.html",
    "bad\0.md",
  ])
    expect(() => urlImportPath(path)).toThrow();
});
it("preserves exact UTF-8 text including BOM/CRLF and fetches without cookies, referrer, redirects or caching", async () => {
  const content = "\uFEFF# Unicode नमस्ते\r\n\r\n<script>inert</script>\r\n";
  const fetch = response(content);
  const result = await fetchMarkdownURL(
    "https://example.com/note.md?temporary=private#heading",
    signal(),
  );
  expect(result).toEqual({
    content,
    bytes: new TextEncoder().encode(content).length,
    type: "text/markdown; charset=utf-8",
    name: "note.md",
    origin: "https://example.com",
  });
  expect(fetch).toHaveBeenCalledWith(
    "https://example.com/note.md?temporary=private",
    expect.objectContaining({
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      mode: "cors",
      redirect: "error",
      referrerPolicy: "no-referrer",
    }),
  );
  expect(JSON.stringify(result)).not.toContain("temporary");
});
it("rejects HTTP failures, unsupported MIME/encoding, disguised HTML and malformed/binary UTF-8", async () => {
  response("missing", {}, 404);
  await expect(
    fetchMarkdownURL("https://example.com/a.md", signal()),
  ).rejects.toThrow(/HTTP 404/);
  response("<h1>page</h1>", { "content-type": "text/html" });
  await expect(
    fetchMarkdownURL("https://example.com/a.md", signal()),
  ).rejects.toThrow(/not Markdown/);
  response("text", { "content-type": "text/plain; charset=iso-8859-1" });
  await expect(
    fetchMarkdownURL("https://example.com/a.md", signal()),
  ).rejects.toThrow(/UTF-8/);
  response("<!DOCTYPE html><html>page</html>", {
    "content-type": "text/plain",
  });
  await expect(
    fetchMarkdownURL("https://example.com/a.md", signal()),
  ).rejects.toThrow(/HTML page/);
  response(new Uint8Array([0xff]));
  await expect(
    fetchMarkdownURL("https://example.com/a.md", signal()),
  ).rejects.toThrow(/valid UTF-8/);
  response("text\0binary");
  await expect(
    fetchMarkdownURL("https://example.com/a.md", signal()),
  ).rejects.toThrow(/NUL/);
});
it("bounds both advertised and streamed bodies and reports browser networking failures without echoing private URL data", async () => {
  response("small", { "content-length": String(urlImportLimits.bytes + 1) });
  await expect(
    fetchMarkdownURL("https://example.com/a.md", signal()),
  ).rejects.toThrow(/5 MiB/);
  const canceled = vi.fn();
  response(
    new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(urlImportLimits.bytes + 1));
      },
      cancel: canceled,
    }),
  );
  await expect(
    fetchMarkdownURL("https://example.com/a.md", signal()),
  ).rejects.toThrow(/5 MiB/);
  expect(canceled).toHaveBeenCalled();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("secret query");
    }),
  );
  await expect(
    fetchMarkdownURL("https://example.com/a.md?secret=query", signal()),
  ).rejects.toThrow(/CORS/);
});
it("cancels in-flight reads, enforces the deadline and rejects already canceled reads without fetching", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    ),
  );
  const controller = new AbortController();
  const pending = fetchMarkdownURL(
    "https://example.com/a.md",
    controller.signal,
  );
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  vi.useFakeTimers();
  const timed = fetchMarkdownURL("https://example.com/a.md", signal());
  const assertion = expect(timed).rejects.toThrow(/30-second/);
  await vi.advanceTimersByTimeAsync(30000);
  await assertion;
  const fetch = response("valid");
  await expect(
    fetchMarkdownURL("https://example.com/a.md", controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(fetch).not.toHaveBeenCalled();
});
