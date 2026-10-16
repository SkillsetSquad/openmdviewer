import type { CollectionDraft } from "./collections";
import {
  workspaceMetadataPath,
  applyWorkspaceMetadata,
} from "./workspace-archive";
import { newDocument, safePath, supportedFile } from "./documents";
import type { ReaderAsset, ReaderDocument } from "./types";
const mediaTypes: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  opus: "audio/ogg",
  ogv: "video/ogg",
  vtt: "text/vtt",
  wav: "audio/wav",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
  pdf: "application/pdf",
};
export const mediaType = (name: string) =>
  mediaTypes[name.split(".").pop()?.toLowerCase() || ""];
// Source attachments must download as bytes rather than becoming executable same-origin HTML blobs.
export const sourceAssetType = (name: string) =>
  /\.(html?|docx)$/i.test(name) || /(?:^|\/)_sources\/[^/]+\.pdf$/i.test(name)
    ? "application/octet-stream"
    : "";
export const attachmentType = (name: string) =>
  sourceAssetType(name) || mediaType(name);
export function isolateImport(
  documents: ReaderDocument[],
  assets: ReaderAsset[],
  existing: Set<string>,
) {
  if (![...documents, ...assets].some((item) => existing.has(item.path)))
    return;
  let n = 2;
  let prefix = "";
  do {
    prefix = `Imports/Batch ${n++}/`;
  } while (
    [...documents, ...assets].some((item) => existing.has(prefix + item.path))
  );
  for (const item of [...documents, ...assets]) item.path = prefix + item.path;
}
export async function readLocalFiles(files: File[], paths?: string[]) {
  const documents: ReaderDocument[] = [];
  const assets: ReaderAsset[] = [];
  const collections: CollectionDraft[] = [];
  let total = 0;
  const add = (path: string, bytes: Uint8Array) => {
    if (bytes.length > 30 * 1024 * 1024)
      throw new Error(`${path} exceeds the 30 MB per-file import limit.`);
    total += bytes.length;
    if (total > 100 * 1024 * 1024)
      throw new Error("Import exceeds the 100 MB expanded limit.");
    if (supportedFile(path))
      documents.push(
        newDocument(safePath(path), new TextDecoder().decode(bytes)),
      );
    else if (attachmentType(path))
      assets.push({
        path: safePath(path),
        blob: new Blob([bytes as BlobPart], { type: attachmentType(path) }),
        type: attachmentType(path),
      });
  };
  for (const [index, file] of files.entries()) {
    if (file.size > 30 * 1024 * 1024)
      throw new Error(`${file.name} exceeds the 30 MB per-file import limit.`);
    if (/\.zip$/i.test(file.name)) {
      const { unzipSync } = await import("fflate");
      let expanded = 0;
      const content = unzipSync(new Uint8Array(await file.arrayBuffer()), {
        filter: (entry) => {
          if (
            !supportedFile(entry.name) &&
            !attachmentType(entry.name) &&
            entry.name !== workspaceMetadataPath
          )
            return false;
          expanded += entry.originalSize;
          if (
            entry.originalSize > 30 * 1024 * 1024 ||
            expanded > 100 * 1024 * 1024
          )
            throw new Error("Archive exceeds the expanded import limit.");
          return true;
        },
      });
      const first = documents.length;
      for (const [path, bytes] of Object.entries(content)) add(path, bytes);
      if (content[workspaceMetadataPath])
        collections.push(
          ...applyWorkspaceMetadata(
            documents.slice(first),
            new TextDecoder().decode(content[workspaceMetadataPath]),
          ),
        );
    } else if (supportedFile(file.name) || attachmentType(file.name))
      add(
        paths?.[index] || file.webkitRelativePath || `Imported/${file.name}`,
        new Uint8Array(await file.arrayBuffer()),
      );
  }
  const seen = new Set<string>();
  for (const item of [...documents, ...assets]) {
    if (seen.has(item.path))
      throw new Error(`Import contains conflicting paths: ${item.path}`);
    seen.add(item.path);
  }
  return { documents, assets, collections };
}
