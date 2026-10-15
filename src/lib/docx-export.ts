import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Tab,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  ExternalHyperlink,
  InternalHyperlink,
  Bookmark,
  HeadingLevel,
  LevelFormat,
  AlignmentType,
  WidthType,
  TableLayoutType,
  Footer,
  PageNumber,
  type ParagraphChild,
  type IRunOptions,
  type IParagraphOptions,
  type INumberingOptions,
} from "docx";
import { visit } from "unist-util-visit";
import { toText } from "hast-util-to-text";
import type { Element, RootContent } from "hast";
import { exportHTMLTree } from "./html-export";
import { frontmatter, metadataString } from "./frontmatter";
import { fileName, resolvePath } from "./paths";
import type { ReaderAsset } from "./types";
export interface DocxExportInput {
  path: string;
  content: string;
  assets: Pick<ReaderAsset, "path" | "blob">[];
  options: {
    pageSize: "a4" | "letter";
    images: boolean;
    contents: boolean;
    pageNumbers: boolean;
  };
}
export interface DocxExportResult {
  bytes: Uint8Array;
  images: number;
  tables: number;
  noticeCount: number;
  notices: string[];
}
export const docxLimits = {
  source: 30 * 1024 * 1024,
  assets: 100 * 1024 * 1024,
  output: 50 * 1024 * 1024,
  nodes: 200000,
  images: 1000,
};
export function docxImageSize(
  bytes: Uint8Array,
): { type: "png" | "jpg" | "gif"; width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let result: ReturnType<typeof docxImageSize> = null;
  if (
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
  )
    result = {
      type: "png",
      width: view.getUint32(16),
      height: view.getUint32(20),
    };
  else if (
    bytes.length >= 10 &&
    /^GIF8[79]a/.test(new TextDecoder().decode(bytes.slice(0, 6)))
  )
    result = {
      type: "gif",
      width: view.getUint16(6, true),
      height: view.getUint16(8, true),
    };
  else if (bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        length >= 7
      ) {
        result = {
          type: "jpg",
          height: view.getUint16(offset + 3),
          width: view.getUint16(offset + 5),
        };
        break;
      }
      offset += length;
    }
  }
  return result &&
    result.width > 0 &&
    result.height > 0 &&
    result.width <= 16384 &&
    result.height <= 16384 &&
    result.width * result.height <= 40000000
    ? result
    : null;
}
export async function exportDocx(
  input: DocxExportInput,
  progress: (message: string) => void = () => {},
): Promise<DocxExportResult> {
  if (new TextEncoder().encode(input.content).length > docxLimits.source)
    throw new Error("DOCX export exceeds the 30 MB source limit.");
  if (input.assets.reduce((sum, a) => sum + a.blob.size, 0) > docxLimits.assets)
    throw new Error("DOCX export exceeds the 100 MB local-asset limit.");
  if (!["a4", "letter"].includes(input.options.pageSize))
    throw new Error("Choose A4 or Letter paper.");
  progress("Preparing sanitized document content…");
  const cleanContent = input.content
    .toWellFormed()
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "\uFFFD");
  const tree = await exportHTMLTree(cleanContent),
    assets = new Map(input.assets.map((a) => [a.path, a.blob]));
  const bookmarks = new Map<string, string>();
  let nodes = 0,
    images = 0,
    tables = 0,
    noticeCount = 0;
  const notices: string[] = [];
  const notice = (message: string) => {
    noticeCount++;
    if (notices.length < 200) notices.push(message.slice(0, 1000));
  };
  if (cleanContent !== input.content)
    notice(
      "Characters unsupported by Word XML were replaced with replacement characters.",
    );
  visit(tree, (node) => {
    if (++nodes > docxLimits.nodes)
      throw new Error("DOCX export exceeds the 200,000-node limit.");
    if (
      node.type === "element" &&
      typeof node.properties.id === "string" &&
      !bookmarks.has(node.properties.id)
    )
      bookmarks.set(node.properties.id, `OMD_${bookmarks.size + 1}`);
  });
  const width = input.options.pageSize === "a4" ? 11906 : 12240,
    height = input.options.pageSize === "a4" ? 16838 : 15840,
    bodyWidth = width - 2160;
  const numbering: INumberingOptions["config"][number][] = [];
  const imageCache = new Map<
    string,
    {
      bytes: Uint8Array;
      size: NonNullable<ReturnType<typeof docxImageSize>>;
    } | null
  >();
  const wordText = (value: string) => {
    const safe = value
      .toWellFormed()
      .replace(
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,
        "\uFFFD",
      );
    if (safe !== value)
      notice(
        "Characters unsupported by Word XML were replaced with replacement characters.",
      );
    return safe;
  };
  const textRuns = (text: string, style: IRunOptions = {}): ParagraphChild[] =>
    wordText(text)
      .replace(/\r\n?/g, "\n")
      .split(/([\n\t])/)
      .map((part) =>
        part === "\n"
          ? new TextRun({ ...style, break: 1 })
          : part === "\t"
            ? new TextRun({ ...style, children: [new Tab()] })
            : new TextRun({ ...style, text: part }),
      );
  const wrapBookmark = (node: Element, children: ParagraphChild[]) => {
    const name =
      typeof node.properties.id === "string" &&
      bookmarks.get(node.properties.id);
    return name ? [new Bookmark({ id: name, children })] : children;
  };
  function anchorFor(href: string) {
    try {
      const id = decodeURIComponent(href.slice(1));
      return bookmarks.get(id) || bookmarks.get(`user-content-${id}`);
    } catch {
      return undefined;
    }
  }
  async function inline(
    children: RootContent[],
    style: IRunOptions = {},
    available = bodyWidth,
  ): Promise<ParagraphChild[]> {
    const result: ParagraphChild[] = [];
    for (const child of children) {
      if (child.type === "text") {
        result.push(
          ...textRuns(child.value.replace(/[ \t\r\n]+/g, " "), style),
        );
        continue;
      }
      if (child.type !== "element") continue;
      const tag = child.tagName;
      if (tag === "br") {
        result.push(new TextRun({ ...style, break: 1 }));
        continue;
      }
      if (tag === "img") {
        const src = String(child.properties.src || ""),
          alt = wordText(String(child.properties.alt || "image"));
        let image: null | {
          bytes: Uint8Array;
          size: NonNullable<ReturnType<typeof docxImageSize>>;
        } = null;
        if (
          input.options.images &&
          src &&
          !/^[a-z][a-z\d+.-]*:|^\/\//i.test(src)
        ) {
          try {
            const path = resolvePath(input.path, src.split(/[?#]/)[0]);
            if (!imageCache.has(path)) {
              const blob = assets.get(path);
              let value: {
                bytes: Uint8Array;
                size: NonNullable<ReturnType<typeof docxImageSize>>;
              } | null = null;
              if (blob && blob.size <= 10 * 1024 * 1024) {
                const bytes = new Uint8Array(await blob.arrayBuffer()),
                  size = docxImageSize(bytes);
                if (size) value = { bytes, size };
              }
              imageCache.set(path, value);
            }
            image = imageCache.get(path) || null;
          } catch {}
        }
        if (image) {
          if (++images > docxLimits.images)
            throw new Error("DOCX export exceeds the 1,000-image limit.");
          const ratio = Math.min(
            1,
            available / 15 / image.size.width,
            640 / image.size.height,
          );
          result.push(
            new ImageRun({
              type: image.size.type,
              data: image.bytes,
              transformation: {
                width: Math.max(1, Math.round(image.size.width * ratio)),
                height: Math.max(1, Math.round(image.size.height * ratio)),
              },
              altText: { name: alt, title: alt, description: alt },
            }),
          );
        } else {
          notice(
            `Image not embedded: ${src || alt}. ${input.options.images ? "Only available local PNG/JPEG/GIF images within the export limits are supported." : "Image embedding was turned off."}`,
          );
          result.push(
            ...textRuns(`[Image: ${alt}${src ? ` — ${src}` : ""}]`, style),
          );
        }
        continue;
      }
      if (["audio", "video"].includes(tag)) {
        const sources = [
          child.properties.src,
          ...child.children.flatMap((n) =>
            n.type === "element" ? [n.properties.src] : [],
          ),
        ].filter((v): v is string => typeof v === "string");
        notice(
          `${tag} remains a text reference in DOCX: ${sources.join(", ") || "no source"}`,
        );
        result.push(
          ...textRuns(
            `[${tag}: ${sources.join(", ") || "not embedded"}]`,
            style,
          ),
        );
        continue;
      }
      if (tag === "input") {
        result.push(
          ...textRuns(child.properties.checked ? "[x] " : "[ ] ", style),
        );
        continue;
      }
      const next = {
        ...style,
        ...(["strong", "b", "dt", "summary"].includes(tag)
          ? { bold: true }
          : {}),
        ...(["em", "i"].includes(tag) ? { italics: true } : {}),
        ...(["del", "s"].includes(tag) ? { strike: true } : {}),
        ...(tag === "code" ? { font: "Courier New", size: 19 } : {}),
        ...(tag === "a" &&
        typeof child.properties.href === "string" &&
        (/^(https?:|mailto:|tel:|\/\/)/i.test(child.properties.href) ||
          (child.properties.href.startsWith("#") &&
            anchorFor(child.properties.href)))
          ? { style: "Hyperlink" }
          : {}),
        ...(tag === "sup" ? { superScript: true } : {}),
        ...(tag === "sub" ? { subScript: true } : {}),
      };
      let runs = await inline(child.children, next, available);
      if (tag === "a" && typeof child.properties.href === "string") {
        const href = child.properties.href;
        if (/^https?:|^mailto:|^tel:|^\/\//i.test(href))
          runs = [
            new ExternalHyperlink({
              link: wordText(href.startsWith("//") ? `https:${href}` : href),
              children: runs,
            }),
          ];
        else if (href.startsWith("#")) {
          let name: string | undefined;
          try {
            const id = decodeURIComponent(href.slice(1));
            name = bookmarks.get(id) || bookmarks.get(`user-content-${id}`);
          } catch {}
          if (name)
            runs = [new InternalHyperlink({ anchor: name, children: runs })];
          else notice(`Missing internal heading: ${href}`);
        } else {
          notice(
            `Workspace or attachment link is a text reference in DOCX: ${href}`,
          );
          runs.push(
            ...textRuns(
              ` (${href.startsWith("wiki:") ? decodeWiki(href) : href})`,
              style,
            ),
          );
        }
      }
      result.push(...wrapBookmark(child, runs));
    }
    return result;
  }
  let usedTitle = false;
  const headings: { text: string; anchor: string; depth: number }[] = [];
  visit(tree, "element", (node) => {
    if (/^h[1-6]$/.test(node.tagName)) {
      const anchor = bookmarks.get(String(node.properties.id));
      if (anchor)
        headings.push({
          text: toText(node),
          anchor,
          depth: Number(node.tagName[1]),
        });
    }
  });
  if (
    input.options.contents &&
    (!headings.some((h) => h.depth === 1) || headings.length < 2)
  )
    notice(
      "Linked contents need a level-one title and at least one additional heading.",
    );
  type Context = {
    indent: number;
    quote: boolean;
    width: number;
    bold?: boolean;
    list?: { reference: string; used: boolean };
  };
  const base: Context = { indent: 0, quote: false, width: bodyWidth };
  function paragraph(
    children: ParagraphChild[],
    context: Context,
    extra: IParagraphOptions = {},
  ) {
    const numbering =
      context.list && !context.list.used
        ? { reference: context.list.reference, level: 0 }
        : undefined;
    if (context.list) context.list.used = true;
    return new Paragraph({
      children,
      ...(numbering ? { numbering } : {}),
      spacing: { after: 140, line: 280 },
      ...(context.indent ? { indent: { left: context.indent } } : {}),
      ...(context.quote ? { shading: { fill: "F3F5F7" } } : {}),
      ...extra,
    });
  }
  async function blocks(
    children: RootContent[],
    context: Context = base,
  ): Promise<(Paragraph | Table)[]> {
    const result: (Paragraph | Table)[] = [];
    let pending: RootContent[] = [];
    const flush = async () => {
      if (pending.some((n) => n.type !== "text" || n.value.trim()))
        result.push(
          paragraph(
            await inline(
              pending,
              context.bold ? { bold: true } : {},
              context.width,
            ),
            context,
          ),
        );
      pending = [];
    };
    for (const child of children) {
      if (child.type !== "element") {
        pending.push(child);
        continue;
      }
      const tag = child.tagName;
      if (
        ![
          "p",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "pre",
          "ul",
          "ol",
          "table",
          "blockquote",
          "div",
          "section",
          "details",
          "summary",
          "dl",
          "dt",
          "dd",
          "hr",
        ].includes(tag)
      ) {
        pending.push(child);
        continue;
      }
      await flush();
      if (
        ![
          "p",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "pre",
          "summary",
          "dt",
        ].includes(tag) &&
        child.properties.id &&
        bookmarks.has(String(child.properties.id))
      )
        result.push(
          new Paragraph({
            children: wrapBookmark(child, [new TextRun({ text: "", size: 2 })]),
            spacing: { before: 0, after: 0, line: 20 },
          }),
        );
      if (tag === "table") {
        const rows: Element[] = [];
        const collect = (node: Element) => {
          if (node.tagName === "tr") rows.push(node);
          else
            for (const n of node.children)
              if (
                n.type === "element" &&
                ["thead", "tbody", "tfoot", "tr"].includes(n.tagName)
              )
                collect(n);
        };
        collect(child);
        if (rows.length > 2000)
          throw new Error("DOCX tables support up to 2,000 rows each.");
        const cellRows = rows.map((row) =>
          row.children.filter(
            (n): n is Element =>
              n.type === "element" && ["td", "th"].includes(n.tagName),
          ),
        );
        const span = (cell: Element) =>
          Math.max(1, Math.min(20, Number(cell.properties.colSpan) || 1));
        const columns = Math.max(
          1,
          ...cellRows.map((row) => row.reduce((sum, c) => sum + span(c), 0)),
        );
        if (columns > 20)
          throw new Error("DOCX tables support up to 20 columns.");
        const tableRows: TableRow[] = [];
        for (const row of cellRows) {
          const cells: TableCell[] = [];
          let used = 0;
          for (const cell of row) {
            if (Number(cell.properties.rowSpan) > 1)
              notice(
                "A table row span was flattened; review the affected table.",
              );
            const columnSpan = span(cell),
              cellWidth = Math.floor(context.width / columns) * columnSpan;
            const content = await blocks(cell.children, {
              ...context,
              indent: 0,
              width: Math.max(240, cellWidth - 160),
              bold: cell.tagName === "th",
              list: undefined,
            });
            if (!content.length || content.at(-1) instanceof Table)
              content.push(new Paragraph(""));
            cells.push(
              new TableCell({
                children: content,
                columnSpan,
                width: { size: cellWidth, type: WidthType.DXA },
                margins: { top: 90, bottom: 90, left: 100, right: 100 },
                ...(cell.tagName === "th"
                  ? { shading: { fill: "EAF0F6" } }
                  : {}),
              }),
            );
            used += columnSpan;
          }
          while (used++ < columns)
            cells.push(new TableCell({ children: [new Paragraph("")] }));
          tableRows.push(
            new TableRow({
              children: cells,
              tableHeader: row.every((c) => c.tagName === "th"),
            }),
          );
        }
        if (tableRows.length) {
          tables++;
          result.push(
            new Table({
              rows: tableRows,
              width: { size: context.width, type: WidthType.DXA },
              columnWidths: Array.from({ length: columns }, () =>
                Math.floor(context.width / columns),
              ),
              layout: TableLayoutType.FIXED,
            }),
          );
          result.push(new Paragraph({ text: "", spacing: { after: 80 } }));
        }
      } else if (tag === "ul" || tag === "ol") {
        const reference = `list_${numbering.length + 1}`,
          ordered = tag === "ol",
          start = Number(child.properties.start) || 1;
        numbering.push({
          reference,
          levels: [
            {
              level: 0,
              format: ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
              text: ordered ? "%1." : "•",
              start,
              style: {
                paragraph: {
                  indent: { left: context.indent + 360, hanging: 240 },
                },
                run: { font: "Arial" },
              },
            },
          ],
        });
        for (const item of child.children.filter(
          (n): n is Element => n.type === "element" && n.tagName === "li",
        )) {
          const nested = item.children.filter(
              (n) => n.type === "element" && ["ul", "ol"].includes(n.tagName),
            ),
            own = item.children.filter((n) => !nested.includes(n));
          const list = { reference, used: false };
          const content = await blocks(own, {
            ...context,
            indent: context.indent + 360,
            list,
          });
          if (!list.used) content.unshift(paragraph([], { ...context, list }));
          if (item.properties.id && bookmarks.has(String(item.properties.id)))
            result.push(
              new Paragraph({
                children: wrapBookmark(item, [
                  new TextRun({ text: "", size: 2 }),
                ]),
                spacing: { before: 0, after: 0, line: 20 },
              }),
            );
          result.push(...content);
          result.push(
            ...(await blocks(nested, {
              ...context,
              indent: context.indent + 360,
              width: Math.max(600, context.width - 360),
            })),
          );
        }
      } else if (/^h[1-6]$/.test(tag)) {
        const first = tag === "h1" && !usedTitle;
        usedTitle ||= tag === "h1";
        const levels = [
          HeadingLevel.HEADING_1,
          HeadingLevel.HEADING_2,
          HeadingLevel.HEADING_3,
          HeadingLevel.HEADING_4,
          HeadingLevel.HEADING_5,
          HeadingLevel.HEADING_6,
        ];
        result.push(
          paragraph(
            wrapBookmark(
              child,
              await inline(child.children, {}, context.width),
            ),
            context,
            {
              heading: first ? HeadingLevel.TITLE : levels[Number(tag[1]) - 1],
              keepNext: true,
              spacing: { before: first ? 0 : 260, after: 160 },
            },
          ),
        );
        if (first && input.options.contents && headings.length > 1) {
          result.push(
            new Paragraph({
              text: "Contents",
              heading: HeadingLevel.HEADING_2,
              keepNext: true,
            }),
          );
          for (const heading of headings.slice(1))
            result.push(
              new Paragraph({
                children: [
                  new InternalHyperlink({
                    anchor: heading.anchor,
                    children: [
                      new TextRun({
                        text: wordText(heading.text),
                        style: "Hyperlink",
                      }),
                    ],
                  }),
                ],
                indent: { left: Math.max(0, heading.depth - 2) * 180 },
                spacing: { after: 70 },
              }),
            );
        }
      } else if (tag === "pre") {
        const code = toText(child);
        if (
          child.children.some(
            (n) =>
              n.type === "element" &&
              Array.isArray(n.properties.className) &&
              n.properties.className.some((c) =>
                /mermaid|math/.test(String(c)),
              ),
          )
        )
          notice("Diagram or math source is retained as editable text.");
        result.push(
          paragraph(
            wrapBookmark(
              child,
              textRuns(code, { font: "Courier New", size: 18 }),
            ),
            context,
            {
              shading: { fill: "F3F5F7" },
              spacing: { before: 100, after: 160, line: 240 },
            },
          ),
        );
      } else if (tag === "p" || tag === "summary" || tag === "dt")
        result.push(
          paragraph(
            wrapBookmark(
              child,
              await inline(
                child.children,
                tag === "p" && !context.bold ? {} : { bold: true },
                context.width,
              ),
            ),
            context,
          ),
        );
      else if (tag === "hr") result.push(paragraph(textRuns("* * *"), context));
      else
        result.push(
          ...(await blocks(child.children, {
            ...context,
            ...(tag === "blockquote"
              ? {
                  quote: true,
                  indent: context.indent + 360,
                  width: context.width - 360,
                }
              : {}),
            ...(tag === "dd" ? { indent: context.indent + 360 } : {}),
          })),
        );
    }
    await flush();
    return result;
  }
  progress("Building editable Word paragraphs and tables…");
  const children = await blocks(tree.children);
  if (!children.length) children.push(new Paragraph(""));
  const title =
    metadataString(frontmatter(input.content).metadata, "title") ||
    headings.find((h) => h.depth === 1)?.text ||
    fileName(input.path);
  const headingStyle = (size: number) => ({
    run: { font: "Arial", size, bold: true, color: "172335" },
    paragraph: { keepNext: true },
  });
  const document = new Document({
    creator: "",
    lastModifiedBy: "",
    title: wordText(title),
    description: "",
    subject: "",
    keywords: "",
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 22, color: "172335" },
          paragraph: { spacing: { after: 140, line: 280 } },
        },
        title: {
          run: { font: "Arial", size: 44, bold: true, color: "000000" },
          paragraph: { spacing: { after: 220 }, keepNext: true },
        },
        heading1: headingStyle(34),
        heading2: headingStyle(28),
        heading3: headingStyle(24),
        heading4: headingStyle(22),
        heading5: headingStyle(22),
        heading6: headingStyle(22),
      },
    },
    numbering: { config: numbering },
    sections: [
      {
        properties: {
          page: {
            size: { width, height },
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
          },
        },
        ...(input.options.pageNumbers
          ? {
              footers: {
                default: new Footer({
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.RIGHT,
                      children: [
                        new TextRun({
                          children: [PageNumber.CURRENT],
                          size: 18,
                          color: "687487",
                        }),
                      ],
                    }),
                  ],
                }),
              },
            }
          : {}),
        children,
      },
    ],
  });
  progress("Packing the DOCX file…");
  const bytes = new Uint8Array(await Packer.toArrayBuffer(document));
  if (bytes.length > docxLimits.output)
    throw new Error("DOCX output exceeds the 50 MB limit.");
  return { bytes, images, tables, noticeCount, notices };
}
function decodeWiki(value: string) {
  try {
    return decodeURIComponent(value.slice(5));
  } catch {
    return value;
  }
}
