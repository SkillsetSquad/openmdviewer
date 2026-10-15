import { resolvePath, fileName } from "./paths";
import { basePath } from "./types";
export interface ImageItem {
  reference: string;
  alt: string;
  url?: string;
  path?: string;
  host?: string;
  source: "imported" | "bundled" | "remote" | "unavailable";
}
export function describeImage(
  reference: string,
  alt: string,
  sourcePath: string,
  assets: Record<string, string>,
): ImageItem {
  const item: ImageItem = { reference, alt, source: "unavailable" };
  if (reference === "asset:alpine-lake")
    return {
      ...item,
      source: "bundled",
      path: "alpine-lake.jpg",
      url: `${basePath}/images/alpine-lake.jpg`,
    };
  if (/^(https?:\/\/|\/\/)/i.test(reference)) {
    try {
      const url = new URL(
        reference.startsWith("//") ? `https:${reference}` : reference,
      );
      if (
        !url.username &&
        !url.password &&
        ["http:", "https:"].includes(url.protocol)
      )
        return {
          ...item,
          source: "remote",
          url: url.href,
          host: url.host,
          path: url.pathname,
        };
    } catch {}
    return item;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(reference)) return item;
  try {
    const path = resolvePath(sourcePath, reference.split(/[?#]/)[0]);
    const url = assets[path];
    if (url?.startsWith("blob:"))
      return {
        ...item,
        source: "imported",
        path,
        url:
          url +
          (reference.includes("#")
            ? reference.slice(reference.indexOf("#"))
            : ""),
      };
    return { ...item, path };
  } catch {
    return item;
  }
}
export function imageFileName(image: ImageItem, type = "") {
  let name = fileName(image.path || "image");
  try {
    name = decodeURIComponent(name);
  } catch {}
  name = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 180) || "image";
  if (!/\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i.test(name)) {
    const extension = (
      {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/gif": "gif",
        "image/webp": "webp",
        "image/avif": "avif",
        "image/svg+xml": "svg",
      } as Record<string, string>
    )[type];
    if (extension) name += `.${extension}`;
  }
  return name;
}
