import type { Root } from "hast";
import { unified } from "unified";
import rehypeStringify from "rehype-stringify";
import { visit, SKIP } from "unist-util-visit";
import { toText } from "hast-util-to-text";
import { zipSync, strToU8 } from "fflate";
import { exportHTMLTree } from "./html-export";
import { frontmatter, metadataString } from "./frontmatter";
import { referenceIndex, resolveDocumentLink } from "./references";
import { fileName, resolvePath } from "./paths";
import type { ReaderDocument, ReaderAsset } from "./types";
import {
  sitePage,
  siteCSS,
  siteJS,
  siteLicense,
  escapeHTML as escape,
} from "./site-template";

export interface SiteExportInput {
  title: string;
  description: string;
  documents: Pick<ReaderDocument, "id" | "path" | "content">[];
  assets: Pick<ReaderAsset, "path" | "blob">[];
}
export interface SiteExportResult {
  bytes: Uint8Array;
  documents: number;
  assets: number;
  expandedBytes: number;
  noticeCount: number;
  notices: string[];
}
export const siteLimits = {
  documents: 10000,
  bytes: 100 * 1024 * 1024,
  documentBytes: 30 * 1024 * 1024,
};
interface PageData {
  doc: SiteExportInput["documents"][number];
  tree: Root;
  title: string;
  url: string;
  headings: { id: string; text: string; depth: number }[];
  ids: Set<string>;
}
function rasterExtension(bytes: Uint8Array) {
  const starts = (...values: number[]) =>
    values.every((value, i) => bytes[i] === value);
  if (starts(137, 80, 78, 71, 13, 10, 26, 10)) return ".png";
  if (starts(255, 216, 255)) return ".jpg";
  const header = new TextDecoder().decode(bytes.slice(0, 12));
  if (/^GIF8[79]a/.test(header)) return ".gif";
  if (header.startsWith("RIFF") && header.slice(8) === "WEBP") return ".webp";
  return "";
}
function localPath(from: string, href: string) {
  if (!href || /^[a-z][a-z\d+.-]*:|^\/\//i.test(href.trim())) return "";
  try {
    return resolvePath(from, href.split(/[?#]/)[0]);
  } catch {
    return "";
  }
}

export async function exportSite(
  input: SiteExportInput,
  progress: (message: string) => void = () => {},
): Promise<SiteExportResult> {
  if (!input.documents.length)
    throw new Error("Add a document before exporting a website.");
  if (input.documents.length > siteLimits.documents)
    throw new Error("Website export supports up to 10,000 documents.");
  let sourceBytes = 0;
  const paths = new Set<string>(),
    ids = new Set<string>();
  for (const doc of input.documents) {
    const bytes = strToU8(doc.content).length;
    if (bytes > siteLimits.documentBytes)
      throw new Error("A document exceeds the 30 MB website export limit.");
    sourceBytes += bytes;
    if (paths.has(doc.path) || ids.has(doc.id))
      throw new Error("Website export requires unique document paths and IDs.");
    paths.add(doc.path);
    ids.add(doc.id);
  }
  for (const asset of input.assets) {
    sourceBytes += asset.blob.size;
    if (paths.has(asset.path))
      throw new Error(
        "Website export contains conflicting document or asset paths.",
      );
    paths.add(asset.path);
  }
  if (sourceBytes > siteLimits.bytes)
    throw new Error("Website source exceeds the 100 MB export limit.");
  const files: Record<string, Uint8Array> = Object.create(null);
  let expandedBytes = 0;
  const add = (path: string, value: string | Uint8Array) => {
    const bytes = typeof value === "string" ? strToU8(value) : value;
    expandedBytes += bytes.length;
    if (expandedBytes > siteLimits.bytes)
      throw new Error(
        "Generated website exceeds the 100 MB expanded limit. Export a smaller workspace.",
      );
    files[path] = bytes;
  };
  let noticeCount = 0;
  const notices: string[] = [];
  const notice = (value: string) => {
    noticeCount++;
    if (notices.length < 500) notices.push(value.slice(0, 1000));
  };
  const docs = [...input.documents].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
  const pages: PageData[] = [];
  for (const [i, doc] of docs.entries()) {
    progress(`Rendering ${i + 1} of ${docs.length}: ${doc.path}`);
    const tree = await exportHTMLTree(doc.content),
      headings: PageData["headings"] = [],
      ids = new Set<string>();
    visit(tree, "element", (node) => {
      if (typeof node.properties.id === "string") {
        ids.add(node.properties.id);
        if (/^h[1-6]$/.test(node.tagName))
          headings.push({
            id: node.properties.id,
            text: toText(node),
            depth: Number(node.tagName[1]),
          });
      }
      // Imported task lists are reading-only on the published site.
      if (node.tagName === "input") node.properties.disabled = true;
    });
    const title =
      metadataString(frontmatter(doc.content).metadata, "title") ||
      headings.find((h) => h.depth === 1)?.text ||
      fileName(doc.path);
    pages.push({
      doc,
      tree,
      headings,
      ids,
      title,
      url: `document-${String(i + 1).padStart(5, "0")}.html`,
    });
  }
  const lookup = referenceIndex(docs),
    pageById = new Map(pages.map((page) => [page.doc.id, page]));
  const assets = new Map(input.assets.map((asset) => [asset.path, asset]));
  const copied = new Map<
    string,
    { url: string; image: boolean; caption: boolean }
  >();
  const assetURL = async (path: string) => {
    if (copied.has(path)) return copied.get(path)!;
    const asset = assets.get(path);
    if (!asset) return null;
    const bytes = new Uint8Array(await asset.blob.arrayBuffer()),
      extension = rasterExtension(bytes);
    let caption = false;
    if (/\.vtt$/i.test(path) && bytes.length <= 10 * 1024 * 1024) {
      try {
        caption =
          /^\uFEFF?WEBVTT(?:[ \t]|\r?\n|$)/.test(
            new TextDecoder("utf-8", { fatal: true }).decode(bytes),
          ) && !bytes.includes(0);
      } catch {}
    }
    const url = `assets/asset-${String(copied.size + 1).padStart(5, "0")}${extension || (caption ? ".vtt" : ".bin")}`;
    add(url, bytes);
    const result = { url, image: !!extension, caption };
    copied.set(path, result);
    return result;
  };
  // Prepare only referenced assets, with opaque names. HTML/SVG/PDF originals are downloads, never executable pages.
  for (const page of pages) {
    const references = new Set<string>();
    visit(page.tree, "element", (node) => {
      for (const key of ["src", "poster", "href"] as const) {
        const value = node.properties[key];
        if (typeof value === "string") {
          const path = localPath(page.doc.path, value);
          if (assets.has(path)) references.add(path);
        }
      }
    });
    for (const path of references) await assetURL(path);
  }
  const search: { title: string; path: string; url: string; text: string }[] =
    [];
  for (const [i, page] of pages.entries()) {
    progress(`Linking ${i + 1} of ${pages.length}: ${page.doc.path}`);
    const mediaReference = (value: unknown) =>
      typeof value === "string"
        ? copied.get(localPath(page.doc.path, value))
        : undefined;
    visit(page.tree, "element", (node, index, parent) => {
      delete node.properties.dataCodeMeta;
      delete node.properties.dataCodeBlock;
      // Never let imported source create browsing contexts, resource hints or form actions.
      if (["img", "audio", "video", "source", "track"].includes(node.tagName)) {
        const source = mediaReference(node.properties.src);
        if (node.tagName === "img") {
          if (source?.image) {
            node.properties = {
              src: source.url,
              alt: String(node.properties.alt || ""),
              loading: "lazy",
              decoding: "async",
            };
          } else if (parent && typeof index === "number") {
            notice(
              `${page.doc.path}: image is unavailable or not a supported raster image: ${String(node.properties.src || "missing source")}`,
            );
            const text = `Image: ${String(node.properties.alt || "image")} — ${source ? "download available" : "not embedded"}`;
            node.tagName = source ? "a" : "span";
            node.properties = source
              ? { href: source.url, download: "image" }
              : {};
            node.children = [{ type: "text", value: text }];
            return SKIP;
          }
        } else {
          if (source) node.properties.src = source.url;
          else {
            if (typeof node.properties.src === "string")
              notice(
                `${page.doc.path}: remote or missing media is not embedded: ${node.properties.src}`,
              );
            delete node.properties.src;
          }
          if (node.tagName === "audio" || node.tagName === "video") {
            node.properties.controls = true;
            node.properties.preload = "none";
            const poster = mediaReference(node.properties.poster);
            if (poster?.image) node.properties.poster = poster.url;
            else delete node.properties.poster;
          }
          if (
            node.tagName === "track" &&
            !source?.caption &&
            parent &&
            typeof index === "number"
          ) {
            notice(
              `${page.doc.path}: unavailable or invalid WebVTT caption track was omitted.`,
            );
            parent.children.splice(index, 1);
            return [SKIP, index];
          }
        }
      }
      if (node.tagName !== "a" || typeof node.properties.href !== "string")
        return;
      const href = node.properties.href;
      if (/^(https?:|mailto:|tel:|\/\/)/i.test(href)) {
        node.properties.rel = ["noopener", "noreferrer"];
        node.properties.target = "_blank";
        return;
      }
      try {
        const wiki = href.startsWith("wiki:"),
          decoded = wiki ? decodeURIComponent(href.slice(5)) : href;
        const hash = decoded.indexOf("#"),
          anchor = hash < 0 ? "" : decodeURIComponent(decoded.slice(hash + 1));
        const pathOnly = hash < 0 ? decoded : decoded.slice(0, hash);
        const result = resolveDocumentLink(
          page.doc,
          wiki ? `wiki:${encodeURIComponent(pathOnly)}` : pathOnly,
          docs,
          lookup,
        );
        const target = result.target && pageById.get(result.target.id);
        if (target) {
          const actual = target.ids.has(anchor)
            ? anchor
            : target.ids.has(`user-content-${anchor}`)
              ? `user-content-${anchor}`
              : anchor;
          if (actual && !target.ids.has(actual))
            notice(
              `${page.doc.path}: missing heading in ${target.doc.path}: ${anchor}`,
            );
          node.properties.href =
            (target === page ? "" : target.url) +
            (actual
              ? `#${encodeURIComponent(actual)}`
              : target === page
                ? "#site-main"
                : "");
          return;
        }
        const asset = copied.get(result.path);
        if (asset) {
          node.properties.href = asset.url;
          node.properties.download = fileName(result.path);
          delete node.properties.target;
          return;
        }
        notice(
          `${page.doc.path}: ${result.error === "ambiguous" ? "ambiguous" : "unresolved"} document link: ${href}`,
        );
      } catch {
        notice(`${page.doc.path}: invalid document link: ${href}`);
      }
      delete node.properties.href;
      node.properties.title = "Unavailable in this exported site";
    });
    const text = toText(page.tree);
    search.push({
      title: page.title,
      path: page.doc.path,
      url: page.url,
      text,
    });
    const body = String(unified().use(rehypeStringify).stringify(page.tree));
    const toc = page.headings.length
      ? `<ul>${page.headings.map((h) => `<li${h.depth > 2 ? ' class="nested"' : ""}><a href="#${encodeURIComponent(h.id)}">${escape(h.text)}</a></li>`).join("")}</ul>`
      : "";
    add(
      page.url,
      sitePage(
        page.title,
        input.title,
        `<div class="site-doc-heading"><p class="muted">${escape(page.doc.path)}</p></div><article aria-label="${escape(page.title)}">${body}</article>`,
        toc,
      ),
    );
  }
  const index = `<h1>${escape(input.title)}</h1><p>${escape(input.description)}</p><p>${pages.length} documents. Search titles, paths and full document text in the sidebar.</p><ul class="document-list">${pages.map((page) => `<li><a href="${page.url}">${escape(page.title)}</a><br><small class="muted">${escape(page.doc.path)}</small></li>`).join("")}</ul>`;
  add("index.html", sitePage(input.title, input.title, index, ""));
  add("site.css", siteCSS);
  add("site.js", siteJS);
  add(
    "search-data.js",
    `window.openmdSite=${JSON.stringify(search)
      .replace(/</g, "\\u003c")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029")};`,
  );
  add(
    "export-report.json",
    JSON.stringify(
      {
        format: "openmdviewer-static-site",
        version: 1,
        title: input.title,
        documents: pages.map((p) => ({
          path: p.doc.path,
          title: p.title,
          url: p.url,
        })),
        assets: [...copied].map(([path, value]) => ({ path, url: value.url })),
        noticeCount,
        notices,
      },
      null,
      2,
    ),
  );
  add(
    "README.txt",
    "OpenMDViewer static documentation export\n\nExtract this ZIP and serve the entire folder with any static HTTP server. Open index.html. All links use relative paths, so root and subpath hosting work. No Node.js application or backend is required. Pages and local assets are usable without external resources. A service worker is deliberately not installed on your host.\n\nDocuments are public to anyone who can access these files. Review every page, linked attachment and export-report.json before publishing. Search data contains the complete readable text. Personal notes, history, trash, file handles and application settings are excluded. Frontmatter is used for titles, not emitted as metadata. Source Markdown is not included.\n\nRemote media is not loaded. PNG/JPEG/GIF/WebP images render locally. Other images and original attachments download as opaque binary files; embedded PDF/SVG/HTML execution is disabled. Audio/video playback depends on browser codec support. Valid UTF-8 WebVTT captions are included; the host must serve .vtt as text/vtt. Math and Mermaid remain readable source rather than rendered graphics; syntax highlighting and editor tools are not bundled.\n\nSearch matches all entered words literally in title, path and full readable text. Results are paginated. JavaScript enables search, navigation and themes; the index and pages remain readable without it. This is an exported snapshot, not a browser-storage backup. The included OpenMDViewer MIT license covers the generated template code, not your documents.\n",
  );
  add("LICENSE-OPENMDVIEWER.txt", siteLicense);
  add(".nojekyll", "");
  progress("Packing the static website…");
  const bytes = zipSync(files, { level: 1, mtime: new Date(1980, 0, 1) });
  return {
    bytes,
    documents: pages.length,
    assets: copied.size,
    expandedBytes,
    noticeCount,
    notices,
  };
}
