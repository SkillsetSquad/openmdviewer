import { unicodePrefix } from "./search-results";
import { readLocalFiles, attachmentType } from "./import";
import { newDocument } from "./documents";
import { safePath, fileName } from "./paths";
import { htmlToMarkdown, conversionLimits } from "./html-conversion";
import { docxToHtml } from "./docx-conversion";
import {
  shouldConvertInput,
  type ConversionInput,
  type ConversionResult,
  type PdfConversionDetails,
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
  const conversions = inputs.filter(shouldConvertInput);
  const plain = inputs.filter((input) => !shouldConvertInput(input));
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
      safePath(input.path).replace(/\.(html?|docx|pdf)$/i, ".md"),
    ]),
  );
  const plannedPaths = new Set(
    [...result.documents, ...result.assets].map((item) => item.path),
  );
  for (const input of conversions) {
    const source = safePath(input.path),
      target = mappedPaths.get(source)!;
    const folder = source.split("/").slice(0, -1).join("/");
    const original = `${folder ? folder + "/" : ""}_sources/${fileName(source)}`;
    for (const path of [target, original]) {
      if (plannedPaths.has(path))
        throw new Error(
          `Conversion produces conflicting paths: ${path}. Rename a source file before importing this batch.`,
        );
      plannedPaths.add(path);
    }
  }
  const pdfPages = new Map<string, Record<number, string>>();
  const plainDocumentCount = result.documents.length;
  const inputOrder = new Map(
    conversions.map((input, index) => [
      mappedPaths.get(safePath(input.path))!,
      index,
    ]),
  );
  // Decode PDF metadata/page anchors first, while preserving the user's report/document order below.
  const processingOrder = [...conversions].sort(
    (a, b) => Number(/\.pdf$/i.test(b.path)) - Number(/\.pdf$/i.test(a.path)),
  );
  for (const input of processingOrder) {
    progress(`Converting ${input.path}…`);
    const sourcePath = safePath(input.path),
      path = mappedPaths.get(sourcePath)!,
      format = /\.pdf$/i.test(sourcePath)
        ? "PDF"
        : /\.docx$/i.test(sourcePath)
          ? "DOCX"
          : "HTML";
    const bytes = await input.file.arrayBuffer();
    let html = "";
    let pdf: PdfConversionDetails | undefined;
    let converted: Awaited<ReturnType<typeof htmlToMarkdown>>;
    const warnings: string[] = [];
    let embedded: import("./types").ReaderAsset[] = [];
    if (format === "PDF") {
      const { pdfToMarkdown } = await import("./pdf-conversion");
      const extracted = await pdfToMarkdown(
        bytes,
        sourcePath,
        path,
        input.password,
        progress,
      );
      converted = extracted;
      pdf = extracted.details;
      pdfPages.set(path, pdf.pageAnchors);
    } else {
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
      converted = await htmlToMarkdown(
        html,
        path,
        mappedPaths,
        embedded,
        pdfPages,
      );
    }
    warnings.push(...converted.warnings);
    const doc = newDocument(path, converted.markdown);
    result.documents.push(doc);
    const directory = sourcePath.split("/").slice(0, -1).join("/");
    const retainedPath = `${directory ? directory + "/" : ""}_sources/${fileName(sourcePath)}`;
    result.assets.push(...converted.assets, {
      path: retainedPath,
      blob: new Blob([input.file], { type: attachmentType(retainedPath) }),
      type: attachmentType(retainedPath),
    });
    result.reports.push({
      sourcePath,
      path,
      documentId: doc.id,
      format,
      pdf,
      images: converted.assets.length,
      warnings: [...new Set(warnings)]
        .slice(0, 50)
        .map((message) => unicodePrefix(message, 2000)),
      warningCount: warnings.length,
    });
  }
  result.documents = [
    ...result.documents.slice(0, plainDocumentCount),
    ...result.documents
      .slice(plainDocumentCount)
      .sort((a, b) => inputOrder.get(a.path)! - inputOrder.get(b.path)!),
  ];
  result.reports.sort(
    (a, b) => inputOrder.get(a.path)! - inputOrder.get(b.path)!,
  );
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
