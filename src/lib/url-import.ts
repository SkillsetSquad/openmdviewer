import { supportedFile } from "./documents";
export const urlImportLimits = {
  bytes: 5 * 1024 * 1024,
  timeout: 30000,
  previewCharacters: 100000,
};
export function markdownURL(value: string) {
  const raw = value.trim();
  if (raw.length > 8192 || /[\u0000-\u0020\u007f]/.test(raw))
    throw new Error(
      "Enter a URL without spaces or control characters (up to 8,192 characters).",
    );
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Enter a complete HTTPS document URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error(
      "Use HTTPS without embedded credentials. Authenticated URLs requiring cookies or headers are unsupported.",
    );
  url.hash = "";
  return url;
}
export function urlDocumentName(url: URL) {
  let name: string;
  try {
    name = decodeURIComponent(url.pathname.split("/").pop() || "");
  } catch {
    return "Remote document.md";
  }
  return name.length <= 200 &&
    !/[\\/\u0000-\u001f\u007f]/.test(name) &&
    supportedFile(name)
    ? name
    : "Remote document.md";
}
export function urlImportPath(value: string) {
  const path = value.trim();
  if (
    !path ||
    path.length > 1000 ||
    /[\\\u0000-\u001f\u007f]/.test(path) ||
    path.split("/").some((part) => !part || part === "." || part === "..") ||
    !supportedFile(path)
  )
    throw new Error(
      "Choose a relative Markdown/text path without empty, dot or parent segments.",
    );
  return path;
}
export interface URLMarkdown {
  content: string;
  bytes: number;
  type: string;
  name: string;
  origin: string;
}
export async function fetchMarkdownURL(
  value: string,
  signal: AbortSignal,
): Promise<URLMarkdown> {
  const url = markdownURL(value);
  signal.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, urlImportLimits.timeout);
  try {
    let response: Response;
    try {
      response = await fetch(url.href, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
        headers: {
          Accept:
            "text/markdown, text/plain;q=0.9, application/octet-stream;q=0.5",
        },
      });
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new Error(
        "The document could not be fetched. The server must allow browser CORS access; redirects, mixed content and network failures may also block it. Use the final raw-document URL or import a downloaded file.",
      );
    }
    const reject = async (message: string): Promise<never> => {
      await response.body?.cancel();
      throw new Error(message);
    };
    if (!response.ok)
      return await reject(
        `The document server returned HTTP ${response.status}. Nothing was imported.`,
      );
    const type = response.headers.get("content-type") || "unavailable";
    const mime = type.split(";")[0].trim().toLowerCase();
    if (
      ![
        "text/markdown",
        "text/x-markdown",
        "text/plain",
        "application/octet-stream",
        "unavailable",
      ].includes(mime)
    )
      return await reject(
        "This response is not Markdown/plain text. Use a raw document URL; download HTML, PDF or Word files and use the local converter instead.",
      );
    const charset = type.match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1];
    if (charset && !/^utf-?8$/i.test(charset))
      return await reject(
        "URL imports require UTF-8. Download and convert a copy with a different encoding.",
      );
    const declared = response.headers.get("content-length");
    if (
      declared &&
      /^\d+$/.test(declared) &&
      Number(declared) > urlImportLimits.bytes
    )
      return await reject("The document exceeds the 5 MiB URL import limit.");
    if (!response.body)
      throw new Error("The document server returned no readable body.");
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let count = 0;
    try {
      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        count += chunk.byteLength;
        if (count > urlImportLimits.bytes) {
          await reader.cancel();
          throw new Error("The document exceeds the 5 MiB URL import limit.");
        }
        chunks.push(chunk);
      }
    } finally {
      reader.releaseLock();
    }
    controller.signal.throwIfAborted();
    const bytes = new Uint8Array(count);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    let content: string;
    try {
      content = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(bytes);
    } catch {
      throw new Error(
        "The response is not valid UTF-8 text. Nothing was imported.",
      );
    }
    if (content.includes("\0"))
      throw new Error(
        "The response contains NUL bytes and cannot be imported as Markdown text.",
      );
    if (
      /^\s*(?:<!doctype\s+html|<html(?:\s|>))/i.test(
        content.replace(/^\uFEFF/, ""),
      )
    )
      throw new Error(
        "The server returned an HTML page instead of a raw Markdown document. Use its raw-file URL or the local HTML converter.",
      );
    return {
      content,
      bytes: count,
      type,
      name: urlDocumentName(url),
      origin: url.origin,
    };
  } catch (error) {
    if (signal.aborted)
      throw new DOMException("URL request canceled.", "AbortError");
    if (timedOut)
      throw new Error(
        "The document exceeded the 30-second URL read deadline. Nothing was imported.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}
