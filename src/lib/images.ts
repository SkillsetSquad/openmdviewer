import { fileName } from "./paths";
import { basePath } from "./types";
import { describeResource, type LocalResource } from "./local-resources";
export interface ImageItem extends Omit<LocalResource, "source"> {
  alt: string;
  source: LocalResource["source"] | "bundled";
}
export function describeImage(
  reference: string,
  alt: string,
  sourcePath: string,
  assets: Record<string, string>,
): ImageItem {
  if (reference === "asset:alpine-lake")
    return {
      reference,
      alt,
      source: "bundled",
      path: "alpine-lake.jpg",
      url: `${basePath}/images/alpine-lake.jpg`,
    };
  return { ...describeResource(reference, sourcePath, assets), alt };
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
