import { supportedFile } from "./documents";
import type { LocalFileHandle } from "./local-file-types";
export const localFileLimit = 30 * 1024 * 1024;
export interface DiskFile {
  name: string;
  content: string;
  hash: string;
  size: number;
  bom: boolean;
  lineEnding: "crlf" | "lf" | "mixed";
}
export interface FilePickerWindow extends Window {
  showOpenFilePicker?: (options: {
    multiple: boolean;
    excludeAcceptAllOption: boolean;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<LocalFileHandle[]>;
  showSaveFilePicker?: (options: {
    suggestedName: string;
    excludeAcceptAllOption: boolean;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<LocalFileHandle>;
}
export const markdownPickerTypes = [
  {
    description: "Markdown and text",
    accept: {
      "text/plain": [".md", ".markdown", ".mdown", ".mkd", ".mdx", ".txt"],
    },
  },
];
export async function bytesHash(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes as Uint8Array<ArrayBuffer>,
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export const contentHash = (content: string) =>
  bytesHash(new TextEncoder().encode(content));
export async function readDiskFile(
  handle: FileSystemFileHandle,
): Promise<DiskFile> {
  const file = await handle.getFile();
  if (!supportedFile(file.name))
    throw new Error("Choose a supported Markdown or text file.");
  if (file.size > localFileLimit)
    throw new Error("Local files support up to 30 MB per document.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(
      "This file is not valid UTF-8. Convert a copy to UTF-8 before connecting it.",
    );
  }
  if (content.includes("\0"))
    throw new Error(
      "This file contains NUL bytes. Connect a UTF-8 Markdown or text file.",
    );
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const crlf = content.includes("\r\n");
  const bareLF = /(^|[^\r])\n/.test(content),
    bareCR = /\r(?!\n)/.test(content);
  return {
    name: file.name,
    content,
    hash: await bytesHash(bytes),
    size: bytes.length,
    bom,
    lineEnding:
      crlf && !bareLF && !bareCR ? "crlf" : !crlf && !bareCR ? "lf" : "mixed",
  };
}
export function encodeDiskContent(
  content: string,
  format: Pick<DiskFile, "bom" | "lineEnding">,
) {
  if (content.includes("\0"))
    throw new Error(
      "The browser document contains NUL characters. Remove them before saving a UTF-8 text file.",
    );
  if (format.lineEnding === "crlf")
    content = content.replace(/\r\n?|\n/g, "\n").replace(/\n/g, "\r\n");
  // A literal leading U+FEFF needs its own encoding marker so decoding does not consume the text character.
  const encodedText =
    (format.bom || content.startsWith("\ufeff") ? "\ufeff" : "") + content;
  const bytes = new TextEncoder().encode(encodedText);
  if (bytes.length > localFileLimit)
    throw new Error("Local files support up to 30 MB per document.");
  if (
    new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes) !== encodedText
  )
    throw new Error(
      "The browser document contains an incomplete Unicode character. Finish editing or replace it before saving.",
    );
  return bytes;
}
export class DiskFileConflict extends Error {
  constructor(public disk: DiskFile) {
    super("The file changed on disk. Review both versions before saving.");
    this.name = "DiskFileConflict";
  }
}
/** Writes only a reviewed version. Closing commits the staged stream; abort leaves its target intact. */
export async function writeDiskFile(
  handle: FileSystemFileHandle,
  content: string,
  expectedHash: string,
  guard: () => Promise<void>,
) {
  const original = await readDiskFile(handle);
  if (original.hash !== expectedHash) throw new DiskFileConflict(original);
  const bytes = encodeDiskContent(content, original),
    hash = await bytesHash(bytes);
  await guard();
  if (hash === original.hash) return { disk: original, changed: false };
  const writer = await handle.createWritable({
    keepExistingData: false,
    mode: "exclusive",
  } as FileSystemCreateWritableOptions);
  let closed = false;
  try {
    const opened = await readDiskFile(handle);
    if (opened.hash !== expectedHash) throw new DiskFileConflict(opened);
    await writer.write(new Blob([bytes as BlobPart]));
    const staged = await readDiskFile(handle);
    if (staged.hash !== expectedHash) throw new DiskFileConflict(staged);
    await guard();
    await writer.close();
    closed = true;
    const disk = await readDiskFile(handle);
    if (disk.hash !== hash)
      throw new Error(
        "The saved file could not be verified. Check the file before saving again; your browser copy is preserved.",
      );
    return { disk, changed: true };
  } catch (error) {
    if (!closed) await writer.abort().catch(() => {});
    throw error;
  }
}
/** Preserve user activation while turning synchronous native picker/permission errors into handled rejections. */
export function beginFileRequest<T>(request: () => Promise<T>): Promise<T> {
  try {
    return request();
  } catch (error) {
    return Promise.reject(error);
  }
}
export function filePermission(
  handle: LocalFileHandle,
  mode: "read" | "readwrite",
) {
  // Invoke directly in the click handler, before hashing, storage reads, or other awaits consume activation.
  if (typeof handle.requestPermission !== "function")
    return Promise.reject(
      new Error(
        "File permissions are unavailable in this browser. Download a copy instead.",
      ),
    );
  return beginFileRequest(() => handle.requestPermission({ mode }));
}
export function withLocalFileLock<T>(work: () => Promise<T>) {
  if (!navigator.locks)
    return Promise.reject(
      new Error(
        "This browser cannot coordinate local file writes. Download a copy instead.",
      ),
    );
  return navigator.locks.request(
    "openmdviewer:local-file-operations",
    { mode: "exclusive" },
    work,
  );
}
