/* eslint-disable @next/next/no-img-element -- Raster and SVG images stay in native, non-executing image contexts. */
"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Info,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import { Modal } from "./modal";
import { Button } from "@/components/ui/button";
import { download } from "@/lib/documents";
import { imageFileName, type ImageItem } from "@/lib/images";
type ImageInfo = {
  width?: number;
  height?: number;
  bytes?: number;
  type?: string;
  failed?: boolean;
};
type View = { key: string; zoom: number; x: number; y: number };
export default function ImageViewer({
  images,
  index,
  allowed,
  onAllow,
  onSelect,
  onClose,
}: {
  images: ImageItem[];
  index: number;
  allowed: Set<string>;
  onAllow: (reference: string) => void;
  onSelect: (index: number) => void;
  onClose: () => void;
}) {
  const image = images[index],
    key = image.url || image.reference;
  const usable =
    !!image.url && (image.source !== "remote" || allowed.has(image.reference));
  const [metadata, setMetadata] = useState<Record<string, ImageInfo>>({});
  const info = metadata[key] || {};
  const [storedView, setView] = useState<View>({ key, zoom: 1, x: 0, y: 0 });
  const view =
    storedView.key === key ? storedView : { key, zoom: 1, x: 0, y: 0 };
  const [size, setSize] = useState({ width: 600, height: 400 });
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const blob = useRef<{ url: string; value: Blob } | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const hint = useId();
  const updateInfo = (url: string, patch: ImageInfo) =>
    setMetadata((previous) => ({
      ...previous,
      [url]: { ...previous[url], ...patch },
    }));
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(element);
    const frame = requestAnimationFrame(() => element.focus());
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    if (!image.url || image.source === "remote" || !usable) return;
    const controller = new AbortController();
    const url = image.url;
    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.blob();
      })
      .then((value) => {
        if (controller.signal.aborted) return;
        blob.current = { url, value };
        setMetadata((previous) => ({
          ...previous,
          [url]: {
            ...previous[url],
            bytes: value.size,
            type: value.type || undefined,
          },
        }));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [image.url, image.source, usable]);
  const zoom = (factor: number, x = 0, y = 0) =>
    setView((previous) => {
      const old =
        previous.key === key ? previous : { key, zoom: 1, x: 0, y: 0 };
      const next = Math.max(0.25, Math.min(16, old.zoom * factor)),
        ratio = next / old.zoom;
      return {
        key,
        zoom: next,
        x: x - (x - old.x) * ratio,
        y: y - (y - old.y) * ratio,
      };
    });
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (!usable || info.failed) return;
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      const x = event.clientX - bounds.left - bounds.width / 2,
        y = event.clientY - bounds.top - bounds.height / 2;
      const factor = Math.exp(
        -Math.max(-100, Math.min(100, event.deltaY)) * 0.006,
      );
      setView((previous) => {
        const old =
          previous.key === key ? previous : { key, zoom: 1, x: 0, y: 0 };
        const next = Math.max(0.25, Math.min(16, old.zoom * factor)),
          ratio = next / old.zoom;
        return {
          key,
          zoom: next,
          x: x - (x - old.x) * ratio,
          y: y - (y - old.y) * ratio,
        };
      });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [key, usable, info.failed]);
  const getBlob = async () => {
    if (!usable || !image.url)
      throw new Error("Load this image before using file controls.");
    if (blob.current?.url === image.url) return blob.current.value;
    const response = await fetch(image.url, {
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    }).catch(() => {
      throw new Error(
        image.source === "remote"
          ? "Image bytes could not be read under this browser or server policy. Copy the image URL; no proxy is used."
          : "Image bytes are unavailable.",
      );
    });
    if (!response.ok) throw new Error("Image bytes are unavailable.");
    const value = await response.blob();
    blob.current = { url: image.url, value };
    updateInfo(key, { bytes: value.size, type: value.type || undefined });
    return value;
  };
  const operation = async (action: "download" | "copy" | "metadata") => {
    if (busy) return;
    setBusy(true);
    setStatus("");
    try {
      if (action !== "copy") {
        const value = await getBlob();
        if (action === "download") {
          download(imageFileName(image, value.type), value, value.type);
          setStatus("Original image download requested.");
        }
        if (action === "metadata")
          setStatus("File type and size read from image bytes.");
      } else {
        if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
          throw new Error(
            "Image copying is unavailable in this browser. Download the image instead.",
          );
        const png = (async () => {
          const value = await getBlob();
          const url = URL.createObjectURL(value);
          try {
            const decoded = new Image();
            decoded.src = url;
            await decoded.decode();
            if (
              !decoded.naturalWidth ||
              !decoded.naturalHeight ||
              decoded.naturalWidth * decoded.naturalHeight > 16000000
            )
              throw new Error(
                "Image copying supports up to 16 million pixels. Download the original instead.",
              );
            const canvas = document.createElement("canvas");
            canvas.width = decoded.naturalWidth;
            canvas.height = decoded.naturalHeight;
            const context = canvas.getContext("2d");
            if (!context)
              throw new Error("Could not prepare the image clipboard.");
            context.drawImage(decoded, 0, 0);
            return await new Promise<Blob>((resolve, reject) =>
              canvas.toBlob(
                (result) =>
                  result
                    ? resolve(result)
                    : reject(new Error("Could not prepare PNG data.")),
                "image/png",
              ),
            );
          } finally {
            URL.revokeObjectURL(url);
          }
        })();
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": png }),
        ]);
        setStatus("Image copied as PNG. The original file is unchanged.");
      }
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not finish this image action.",
      );
    } finally {
      setBusy(false);
    }
  };
  const fit =
    info.width && info.height
      ? Math.min(
          Math.max(1, size.width - 32) / info.width,
          Math.max(1, size.height - 32) / info.height,
        )
      : 1;
  return (
    <Modal
      title={image.alt || "Image viewer"}
      wide
      className="image-viewer-dialog"
      onClose={onClose}
    >
      <div
        className="image-viewer-content"
        onKeyDown={(event) => {
          if (
            event.ctrlKey ||
            event.metaKey ||
            (event.target instanceof HTMLElement &&
              event.target.matches(
                "input,textarea,select,[contenteditable=true]",
              ))
          )
            return;
          if (
            ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
              event.key,
            ) &&
            event.shiftKey
          ) {
            event.preventDefault();
            setView({
              ...view,
              x:
                view.x +
                (event.key === "ArrowLeft"
                  ? -40
                  : event.key === "ArrowRight"
                    ? 40
                    : 0),
              y:
                view.y +
                (event.key === "ArrowUp"
                  ? -40
                  : event.key === "ArrowDown"
                    ? 40
                    : 0),
            });
          } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            onSelect(
              Math.max(
                0,
                Math.min(
                  images.length - 1,
                  index + (event.key === "ArrowRight" ? 1 : -1),
                ),
              ),
            );
          } else if (["+", "=", "-", "0"].includes(event.key)) {
            event.preventDefault();
            if (event.key === "0") setView({ key, zoom: 1, x: 0, y: 0 });
            else zoom(event.key === "-" ? 1 / 1.4 : 1.4);
          }
        }}
      >
        <div className="image-viewer-toolbar">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous image"
            disabled={index === 0}
            onClick={() => onSelect(index - 1)}
          >
            <ChevronLeft size={16} />
          </Button>
          <span>
            {index + 1} of {images.length} image references
          </span>
          <select
            aria-label="Choose image"
            value={index}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (images[next]) onSelect(next);
            }}
          >
            {images.map((entry, i) => (
              <option key={entry.reference} value={i}>
                {i + 1}. {entry.alt || "Image"}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next image"
            disabled={index === images.length - 1}
            onClick={() => onSelect(index + 1)}
          >
            <ChevronRight size={16} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Zoom image out"
            disabled={!usable}
            onClick={() => zoom(1 / 1.4)}
          >
            <Minus size={15} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Zoom image in"
            disabled={!usable}
            onClick={() => zoom(1.4)}
          >
            <Plus size={15} />
          </Button>
          <Button
            variant="outline"
            onClick={() => setView({ key, zoom: 1, x: 0, y: 0 })}
          >
            <RotateCcw size={14} />
            Fit image
          </Button>
          <output aria-label="Image zoom">
            {Math.round(view.zoom * 100)}% of fit
          </output>
        </div>
        <div
          ref={stage}
          className="image-viewer-stage"
          role="group"
          aria-label="Image canvas"
          aria-describedby={hint}
          tabIndex={0}
          onPointerDown={(event) => {
            if (
              event.button !== 0 ||
              !usable ||
              (event.target instanceof Element &&
                event.target.closest("button"))
            )
              return;
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            const dx = event.clientX - drag.current.x,
              dy = event.clientY - drag.current.y;
            drag.current = { x: event.clientX, y: event.clientY };
            setView((previous) => {
              const old =
                previous.key === key ? previous : { key, zoom: 1, x: 0, y: 0 };
              return { ...old, x: old.x + dx, y: old.y + dy };
            });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          {!image.url ? (
            <p>
              This image is not available locally. Import its file with the
              Markdown folder or ZIP.
            </p>
          ) : !usable ? (
            <div className="image-viewer-blocked">
              <p>Remote image blocked · {image.host}</p>
              <Button onClick={() => onAllow(image.reference)}>
                Load this image
              </Button>
            </div>
          ) : info.failed ? (
            <div>
              <p>This image could not be displayed.</p>
              <Button
                variant="outline"
                onClick={() => {
                  updateInfo(key, { failed: false });
                  setRetry((value) => value + 1);
                }}
              >
                Retry image
              </Button>
            </div>
          ) : (
            <img
              key={`${key}:${retry}`}
              src={image.url}
              alt={image.alt}
              draggable={false}
              referrerPolicy="no-referrer"
              onLoad={(event) =>
                updateInfo(key, {
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                  failed: false,
                })
              }
              onError={() => updateInfo(key, { failed: true })}
              style={{
                width: info.width ? info.width * fit * view.zoom : "100%",
                height: info.height ? info.height * fit * view.zoom : "100%",
                transform: `translate(${view.x}px, ${view.y}px)`,
                objectFit: "contain",
              }}
            />
          )}
        </div>
        <p id={hint} className="image-viewer-hint">
          Drag to pan · scroll or + / − to zoom · 0 to fit · Left/Right for
          gallery · Shift + arrows to pan. Zoom is relative to the fitted image.
        </p>
        <div className="image-viewer-actions">
          <Button
            variant="outline"
            disabled={!usable || busy}
            onClick={() => void operation("download")}
          >
            <Download size={14} />
            Download image
          </Button>
          <Button
            variant="outline"
            disabled={
              !usable || busy || !!info.failed || !info.width || !info.height
            }
            onClick={() => void operation("copy")}
          >
            <Copy size={14} />
            Copy image
          </Button>
          <Button
            variant="outline"
            disabled={!image.url}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(image.url!);
                setStatus(
                  image.source === "imported"
                    ? "Browser-local image URL copied. It lasts only for this workspace session."
                    : "Image URL copied.",
                );
              } catch {
                setStatus("Clipboard access is unavailable.");
              }
            }}
          >
            <Copy size={14} />
            Copy image URL
          </Button>
          {image.source === "remote" && (
            <Button
              variant="outline"
              disabled={!usable || busy}
              onClick={() => void operation("metadata")}
            >
              <Info size={14} />
              Read file metadata
            </Button>
          )}
        </div>
        <dl className="image-viewer-metadata">
          <div>
            <dt>Source</dt>
            <dd>{image.reference}</dd>
          </div>
          <div>
            <dt>Storage</dt>
            <dd>
              {image.source === "remote"
                ? "Remote URL"
                : image.source === "unavailable"
                  ? "Not imported"
                  : "Local"}
            </dd>
          </div>
          <div>
            <dt>Dimensions</dt>
            <dd>
              {usable && info.width && info.height
                ? `${info.width} × ${info.height} pixels`
                : "Unavailable"}
            </dd>
          </div>
          <div>
            <dt>File type</dt>
            <dd>{info.type || "Unavailable"}</dd>
          </div>
          <div>
            <dt>File size</dt>
            <dd>
              {info.bytes === undefined
                ? "Unavailable"
                : `${info.bytes.toLocaleString()} bytes`}
            </dd>
          </div>
        </dl>
        <p className="image-viewer-status" role="status" aria-live="polite">
          {busy ? "Preparing image…" : status}
        </p>
      </div>
    </Modal>
  );
}
