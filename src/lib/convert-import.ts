import { unicodePrefix } from "./search-results";
import { readLocalFiles, attachmentType } from "./import";
import { newDocument } from "./documents";
import { safePath, fileName } from "./paths";
import { htmlToMarkdown, conversionLimits } from "./html-conversion";
import { docxToHtml } from "./docx-conversion";
import {
  convertibleFile,
  type ConversionInput,
  type ConversionResult,
} from "./conversion-types";
export async function convertImport(
  inputs: ConversionInput[],
  progress: (message: string) => void = () => {},
): Promise<ConversionResult> {
  if (inputs.length > 10000)
    throw new Error("Choose up to 10,000 input files.");
  if (
    inputs.some((input) => input.file.size > conversionLimits.input) ||
    inputs.reduce((sum, input) => sum + input.file.size, 0) >
      conversionLimits.expanded
  )
    throw new Error("Input exceeds the 30 MB per-file or 100 MB batch limit.");
  const conversions = inputs.filter((input) => convertibleFile(input.path));
  const plain = inputs.filter((input) => !convertibleFile(input.path));
  const result: ConversionResult = {
    ...(await readLocalFiles(
      plain.map((input) => input.file),
      plain.map((input) => input.path),
    )),
    reports: [],
  };
  const mappedPaths = new Map(
    conversions.map((input) => [
      safePath(input.path),
      safePath(input.path).replace(/\.(html?|docx)$/i, ".md"),
    ]),
  );
  for (const input of conversions) {
    progress(`Converting ${input.path}…`);
    const sourcePath = safePath(input.path),
      path = mappedPaths.get(sourcePath)!,
      format = /\.docx$/i.test(sourcePath) ? "DOCX" : "HTML";
    const bytes = await input.file.arrayBuffer();
    let html: string;
    const warnings: string[] = [];
    let embedded: import("./types").ReaderAsset[] = [];
    if (format === "DOCX") {
      const converted = await docxToHtml(bytes, path);
      html = converted.html;
      embedded = converted.assets;
      warnings.push(...converted.warnings);
    } else {
      try {
        html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new Error(
          `${input.path} is not valid UTF-8 HTML. Convert a copy to UTF-8 first.`,
        );
      }
    }
    const converted = await htmlToMarkdown(html, path, mappedPaths, embedded);
    warnings.push(...converted.warnings);
    const doc = newDocument(path, converted.markdown);
    result.documents.push(doc);
    const directory = sourcePath.split("/").slice(0, -1).join("/");
    result.assets.push(...converted.assets, {
      path: `${directory ? directory + "/" : ""}_sources/${fileName(sourcePath)}`,
      blob: new Blob([input.file], { type: attachmentType(sourcePath) }),
      type: attachmentType(sourcePath),
    });
    result.reports.push({
      sourcePath,
      path,
      documentId: doc.id,
      format,
      images: converted.assets.length,
      warnings: [...new Set(warnings)]
        .slice(0, 50)
        .map((message) => unicodePrefix(message, 2000)),
      warningCount: warnings.length,
    });
  }
  const paths = new Set<string>();
  let total = 0;
  for (const item of [...result.documents, ...result.assets]) {
    if (paths.has(item.path))
      throw new Error(
        `Conversion produces conflicting paths: ${item.path}. Rename a source file before importing this batch.`,
      );
    paths.add(item.path);
    total +=
      "content" in item
        ? new TextEncoder().encode(item.content).length
        : item.blob.size;
  }
  if (total > conversionLimits.expanded)
    throw new Error(
      "Converted documents, images and originals exceed the 100 MB batch limit.",
    );
  return result;
}
