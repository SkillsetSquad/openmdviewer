import {
  getDocument,
  PDFWorker,
  Util,
  VerbosityLevel,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import type {
  PDFDocumentLoadingTask,
  TextItem,
} from "pdfjs-dist/types/src/display/api";
import GithubSlugger from "github-slugger";
import { unified } from "unified";
import remarkStringify from "remark-stringify";
import { stringify as yamlStringify } from "yaml";
import type { Root, RootContent } from "mdast";
import { fileName } from "./paths";
import { conversionLimits, localAssetReference } from "./html-conversion";
import { PdfResourceFactory } from "./pdf-resources";
import { PdfTextBuilder, pdfLimits } from "./pdf-text";
import {
  ConversionPasswordError,
  type PdfConversionDetails,
} from "./conversion-types";

export async function pdfToMarkdown(
  bytes: ArrayBuffer,
  sourcePath: string,
  outputPath: string,
  password: string | undefined,
  progress: (message: string) => void,
) {
  // Supply the public port API explicitly: the caller itself runs in a worker, without a Window or DOM.
  const workerUrl = new URL("./pdf-worker.js", self.location.href);
  const port = new Worker(workerUrl, {
    type: "module",
    name: "openmdviewer-pdf-parser",
  });
  const worker = PDFWorker.create({ port, verbosity: VerbosityLevel.ERRORS });
  let task: PDFDocumentLoadingTask | null = null;
  const failure = new Promise<never>((_, reject) => {
    port.addEventListener(
      "error",
      () =>
        reject(
          new Error(
            "The local PDF parser could not start. Reload the app after offline caching completes.",
          ),
        ),
      { once: true },
    );
  });
  // A handler is attached immediately even if the native worker fails before the first await.
  void failure.catch(() => {});
  try {
    task = getDocument({
      data: new Uint8Array(bytes),
      password,
      worker,
      verbosity: VerbosityLevel.ERRORS,
      cMapPacked: true,
      BinaryDataFactory: PdfResourceFactory,
      useWorkerFetch: false,
      useSystemFonts: false,
      disableFontFace: true,
      enableXfa: false,
      useWasm: false,
      isOffscreenCanvasSupported: false,
      isImageDecoderSupported: false,
      maxImageSize: 0,
      stopAtErrors: true,
    });
    const document = await Promise.race([task.promise, failure]);
    if (document.numPages > pdfLimits.pages)
      throw new Error("PDF import supports up to 500 pages per document.");
    const details: PdfConversionDetails = {
      pages: document.numPages,
      textPages: 0,
      emptyPages: [],
      pageAnchors: {},
    };
    let title = fileName(sourcePath).replace(/\.pdf$/i, "");
    const warnings = [
      "PDF import extracts the text layer only. Images, interactive forms, annotations and page layout are not converted; review complex reading order.",
    ];
    try {
      const metadata = await Promise.race([document.getMetadata(), failure]);
      const value = (metadata.info as { Title?: unknown })?.Title;
      if (typeof value === "string" && value.trim())
        title = value.trim().replace(/\s+/g, " ").slice(0, 1000);
    } catch {
      warnings.push(
        "PDF title metadata could not be read; the source filename is used.",
      );
    }
    const directory = sourcePath.split("/").slice(0, -1).join("/");
    const originalPath = `${directory ? directory + "/" : ""}_sources/${fileName(sourcePath)}`;
    const children: RootContent[] = [
      { type: "heading", depth: 1, children: [{ type: "text", value: title }] },
      {
        type: "paragraph",
        children: [
          { type: "text", value: "Source PDF: " },
          {
            type: "link",
            url: localAssetReference(outputPath, originalPath),
            children: [{ type: "text", value: fileName(sourcePath) }],
          },
        ],
      },
    ];
    const pageSlugs = new GithubSlugger();
    pageSlugs.slug(title);
    let totalBytes = 0,
      totalItems = 0;
    for (let number = 1; number <= document.numPages; number++) {
      progress(
        `Extracting ${sourcePath}: page ${number} of ${document.numPages}…`,
      );
      const page = await Promise.race([document.getPage(number), failure]);
      const viewport = page.getViewport({ scale: 1 }),
        builder = new PdfTextBuilder();
      const reader = page
        .streamTextContent({
          includeMarkedContent: false,
          disableNormalization: false,
        })
        .getReader();
      try {
        for (;;) {
          const { value, done } = await Promise.race([reader.read(), failure]);
          if (done) break;
          for (const entry of value.items) {
            if (!("str" in entry)) continue;
            const item = entry as TextItem;
            builder.add({
              ...item,
              transform: Util.transform(viewport.transform, item.transform),
            });
            if (++totalItems > pdfLimits.items)
              throw new Error("PDF exceeds the 1,000,000 text-item limit.");
          }
          if (totalBytes + builder.bytes > pdfLimits.textBytes)
            throw new Error("PDF text exceeds the 10 MB extraction limit.");
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
        page.cleanup();
      }
      totalBytes += builder.bytes;
      details.pageAnchors[number] = pageSlugs.slug(`Page ${number}`);
      children.push({
        type: "heading",
        depth: 2,
        children: [{ type: "text", value: `Page ${number}` }],
      });
      const text = builder.text();
      if (text) {
        details.textPages++;
        for (const paragraph of text.split(/\n{2,}/))
          children.push({
            type: "paragraph",
            children: [{ type: "text", value: paragraph }],
          });
      } else {
        details.emptyPages.push(number);
        children.push({
          type: "blockquote",
          children: [
            {
              type: "paragraph",
              children: [
                {
                  type: "text",
                  value:
                    "Extraction note: no extractable text on this page. It may be blank or image-only; OCR is not included.",
                },
              ],
            },
          ],
        });
      }
      if (builder.replacedControls)
        warnings.push(
          `Page ${number}: NUL characters in the text layer were replaced with replacement characters.`,
        );
    }
    if (details.emptyPages.length)
      warnings.push(
        `${details.emptyPages.length} of ${details.pages} pages have no extractable text (${details.emptyPages.slice(0, 20).join(", ")}${details.emptyPages.length > 20 ? ", …" : ""}). Blank pages and scans cannot be distinguished from the text layer alone. OCR is not included.`,
      );
    const tree: Root = { type: "root", children };
    const markdown = `---\n${yamlStringify({ title, sourceFormat: "PDF", sourcePages: details.pages })}---\n\n${unified().use(remarkStringify, { bullet: "-", fences: true }).stringify(tree)}`;
    if (new TextEncoder().encode(markdown).length > conversionLimits.output)
      throw new Error("Converted Markdown exceeds the 10 MB output limit.");
    return { markdown, assets: [], warnings, details };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "PasswordException"
    )
      throw new ConversionPasswordError(
        sourcePath,
        "code" in error && error.code === 2,
      );
    throw error;
  } finally {
    const cleanup = task?.destroy().catch(() => {});
    if (cleanup) {
      let timer: ReturnType<typeof setTimeout>;
      await Promise.race([
        cleanup,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 500);
        }),
      ]);
      clearTimeout(timer!);
    }
    worker.destroy();
    port.terminate();
  }
}
