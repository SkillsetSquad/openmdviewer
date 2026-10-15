import mammoth from "mammoth/mammoth.browser";
import { Unzip, UnzipInflate, zipSync } from "fflate";
import {
  conversionLimits,
  imageExtension,
  localAssetReference,
} from "./html-conversion";
import type { ReaderAsset } from "./types";
import { fileName } from "./paths";
/** Measure actual streamed output, not just untrusted ZIP size headers, before the DOCX parser sees it. */
export function checkDocx(bytes: Uint8Array) {
  let total = 0,
    entries = 0,
    finished = 0;
  const parts: Record<string, Uint8Array> = Object.create(null);
  const names = new Set<string>();
  const unzip = new Unzip((file) => {
    if (++entries > conversionLimits.entries)
      throw new Error("DOCX exceeds the 10,000-part limit.");
    if (
      /^(?:\/|[a-z]:)|[\\\0]|(?:^|\/)\.\.(?:\/|$)/i.test(file.name) ||
      names.has(file.name)
    )
      throw new Error("DOCX contains conflicting or unsafe archive paths.");
    names.add(file.name);
    let size = 0;
    const chunks: Uint8Array[] = [];
    const isXml = /\.(xml|rels)$/i.test(file.name);
    file.ondata = (error, data, final) => {
      if (error) throw error;
      size += data.length;
      total += data.length;
      if (size > conversionLimits.input || total > conversionLimits.expanded)
        throw new Error(
          "DOCX exceeds the 30 MB per-part or 100 MB expanded limit.",
        );
      chunks.push(data.slice());
      if (final) {
        finished++;
        const part = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          part.set(chunk, offset);
          offset += chunk.length;
        }
        chunks.length = 0;
        if (isXml) {
          const encoding =
            part[0] === 0xff && part[1] === 0xfe
              ? "utf-16le"
              : part[0] === 0xfe && part[1] === 0xff
                ? "utf-16be"
                : "utf-8";
          const text = new TextDecoder(encoding, { fatal: true }).decode(part);
          if (/<!DOCTYPE|<!ENTITY/i.test(text))
            throw new Error(
              "DOCX XML declarations with entities or document types are not supported.",
            );
          let markup = 0;
          for (
            let offset = text.indexOf("<");
            offset >= 0;
            offset = text.indexOf("<", offset + 1)
          ) {
            if (++markup > conversionLimits.nodes)
              throw new Error("DOCX XML exceeds the markup complexity limit.");
          }
        }
        parts[file.name] = part;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let offset = 0; offset < bytes.length; offset += 4096)
    unzip.push(
      bytes.subarray(offset, offset + 4096),
      offset + 4096 >= bytes.length,
    );
  if (finished !== entries) throw new Error("The DOCX archive is incomplete.");
  if (!names.has("[Content_Types].xml") || !names.has("word/document.xml"))
    throw new Error("Choose a valid, unencrypted DOCX document.");
  // Parse a fresh archive of the measured parts, so conflicting central-directory headers cannot bypass preflight.
  return zipSync(parts, { level: 0 });
}
export async function docxToHtml(bytes: ArrayBuffer, outputPath: string) {
  const canonical = checkDocx(new Uint8Array(bytes));
  const assets: ReaderAsset[] = [];
  const warnings: string[] = [];
  const base = outputPath.split("/").slice(0, -1).join("/");
  const prefix = `${base ? base + "/" : ""}_converted/${fileName(outputPath).replace(/\.md$/i, "")}`;
  let total = 0;
  const result = await mammoth.convertToHtml(
    { arrayBuffer: canonical.buffer as ArrayBuffer },
    {
      externalFileAccess: false,
      includeEmbeddedStyleMap: false,
      idPrefix: "docx-",
      convertImage: mammoth.images.imgElement(async (image) => {
        const ext = imageExtension(image.contentType);
        if (!ext) {
          warnings.push(
            `An unsupported embedded image (${image.contentType}) was omitted.`,
          );
          return { src: "" };
        }
        let data: ArrayBuffer;
        try {
          data = await image.readAsArrayBuffer();
        } catch {
          warnings.push(
            "An image could not be read and was omitted. Linked external images are blocked; the original DOCX is retained.",
          );
          return { src: "" };
        }
        total += data.byteLength;
        if (
          data.byteLength > conversionLimits.input ||
          total > conversionLimits.expanded
        )
          throw new Error("DOCX images exceed the conversion size limit.");
        const path = `${prefix}/image-${assets.length + 1}.${ext}`;
        assets.push({
          path,
          type: image.contentType,
          blob: new Blob([data], { type: image.contentType }),
        });
        return { src: localAssetReference(outputPath, path) };
      }),
    },
  );
  if (result.messages.some((message) => message.type === "error"))
    throw new Error(
      "The DOCX parser could not read part of this document. No converted copy was imported.",
    );
  warnings.push(...result.messages.map((message) => message.message));
  return { html: result.value, assets, warnings };
}
