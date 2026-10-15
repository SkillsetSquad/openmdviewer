/* eslint-disable @next/next/no-img-element -- User-controlled images use native elements without a proxy. */
"use client";
import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Components } from "react-markdown";
import { markdownModel } from "@/lib/markdown-model";
import { describeImage, type ImageItem } from "@/lib/images";
import { Modal } from "./modal";
const ImageViewer = lazy(() => import("./image-viewer"));
const GalleryContext = createContext<{
  images: ImageItem[];
  allowed: Set<string>;
  allow: (id: string) => void;
  open: (id: string) => void;
} | null>(null);
export function ImageGallery({
  content,
  sourcePath,
  assets,
  children,
}: {
  content: string;
  sourcePath: string;
  assets: Record<string, string>;
  children: ReactNode;
}) {
  const images = useMemo(
    () => [
      ...new Map(
        markdownModel(content)
          .links.filter((link) => link.image)
          .map((link) => [
            link.href,
            describeImage(link.href, link.alt || "", sourcePath, assets),
          ]),
      ).values(),
    ],
    [content, sourcePath, assets],
  );
  const [allowed, setAllowed] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const index = images.findIndex((image) => image.reference === selected);
  const allow = (reference: string) =>
    setAllowed((previous) => new Set([...previous, reference]));
  return (
    <GalleryContext.Provider
      value={{ images, allowed, allow, open: setSelected }}
    >
      {children}
      {index >= 0 && (
        <Suspense
          fallback={
            <Modal
              title={images[index].alt || "Image viewer"}
              onClose={() => setSelected(null)}
            >
              <p role="status">Loading image viewer…</p>
            </Modal>
          }
        >
          <ImageViewer
            images={images}
            index={index}
            allowed={allowed}
            onAllow={allow}
            onSelect={(next) => setSelected(images[next].reference)}
            onClose={() => setSelected(null)}
          />
        </Suspense>
      )}
    </GalleryContext.Provider>
  );
}
function SafeImage({ src, alt }: { src?: string; alt?: string }) {
  const gallery = useContext(GalleryContext);
  const image = gallery?.images.find((image) => image.reference === src);
  const [failed, setFailed] = useState(false);
  if (!image?.url)
    return (
      <span className="blocked-media">
        Local image unavailable: {alt || src}. Import the image with your
        Markdown folder or ZIP.
      </span>
    );
  if (image.source === "remote" && !gallery?.allowed.has(image.reference))
    return (
      <span className="blocked-media">
        <span>
          Remote image blocked · {alt || "Image"} · {image.host}
        </span>
        <button onClick={() => gallery?.allow(image.reference)}>
          Load this image
        </button>
      </span>
    );
  if (failed)
    return (
      <span className="blocked-media">
        Image unavailable: {alt || src}.{" "}
        <button onClick={() => setFailed(false)}>Retry image</button>
      </span>
    );
  return (
    <img
      className="document-image"
      src={image.url}
      alt={alt || ""}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      onClick={() => gallery?.open(image.reference)}
      tabIndex={0}
      role="button"
      aria-label={`Enlarge image: ${alt || "image"}`}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          gallery?.open(image.reference);
        }
      }}
    />
  );
}
export const ImageRenderer: Components["img"] = ({ src, alt }) => (
  <SafeImage
    key={String(src)}
    src={typeof src === "string" ? src : undefined}
    alt={alt}
  />
);
