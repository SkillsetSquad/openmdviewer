"use client";
import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import {
  Code,
  Copy,
  Download,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import { download } from "@/lib/documents";
import { renderDiagram } from "@/lib/diagram-render";
import { diagramPNG } from "@/lib/diagram-svg";
import { useReader } from "@/lib/store";
import { Modal } from "./modal";
export default function Diagram({ source }: { source: string }) {
  const id = `diagram${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const root = useRef<HTMLElement>(null);
  const closeExpanded = () => {
    setExpanded(false);
    requestAnimationFrame(() =>
      root.current
        ?.querySelector<HTMLButtonElement>('[aria-label="Expand diagram"]')
        ?.focus(),
    );
  };
  const [fullscreenSupported] = useState(
    () => typeof document !== "undefined" && !!document.fullscreenEnabled,
  );
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const change = () =>
      setFullscreen(
        !!document.fullscreenElement &&
          !!root.current?.contains(document.fullscreenElement),
      );
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  async function toggleFullscreen() {
    try {
      const modal = root.current?.querySelector<HTMLElement>(
        ".diagram-fullscreen-surface",
      );
      if (document.fullscreenElement === modal) await document.exitFullscreen();
      else await modal?.requestFullscreen();
    } catch {
      setStatus(
        "Fullscreen was unavailable for this request. Expanded view remains available.",
      );
    }
  }
  const theme = useReader((state) => state.preferences.theme);
  const [systemDark, setSystemDark] = useState(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const change = () => setSystemDark(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const dark =
    theme === "system" ? systemDark : !["light", "sepia"].includes(theme);
  const [result, setResult] = useState<{
    source: string;
    dark: boolean;
    svg: string;
    width: number;
    height: number;
    error?: string;
  }>();
  const current =
    result?.source === source && result.dark === dark ? result : undefined;
  const [raw, setRaw] = useState(false),
    [expanded, setExpanded] = useState(false),
    [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<
    { x: number; y: number; panX: number; panY: number } | undefined
  >(undefined);
  const [status, setStatus] = useState("");
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    let canceled = false;
    renderDiagram(id, source, dark)
      .then((value) => {
        if (!canceled) setResult({ ...value, source, dark });
      })
      .catch((error) => {
        if (!canceled)
          setResult({
            source,
            dark,
            svg: "",
            width: 0,
            height: 0,
            error: error instanceof Error ? error.message : String(error),
          });
      });
    return () => {
      canceled = true;
    };
  }, [id, source, dark]);
  function start(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    setPan({
      x: drag.current.panX + event.clientX - drag.current.x,
      y: drag.current.panY + event.clientY - drag.current.y,
    });
  }
  function reset() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(source);
      setStatus("Diagram source copied.");
    } catch {
      setStatus("Clipboard unavailable. Download the diagram source instead.");
    }
  }
  async function png() {
    if (!current?.svg || exporting) return;
    setExporting(true);
    try {
      const value = await diagramPNG(
        current.svg,
        current.width,
        current.height,
        dark ? "#171d25" : "#eef1f5",
      );
      download("diagram.png", value.blob, "image/png");
      setStatus(
        `PNG download requested · ${value.width} × ${value.height} pixels.`,
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "PNG export was unavailable.",
      );
    } finally {
      setExporting(false);
    }
  }
  return (
    <section
      ref={root}
      className={`diagram enhanced-diagram ${dark ? "diagram-dark" : "diagram-light"}`}
      aria-label="Mermaid diagram"
    >
      {expanded ? (
        <Modal
          title="Expanded diagram"
          wide
          className="expanded-diagram"
          onClose={closeExpanded}
        >
          <div className="diagram-fullscreen-surface">
            <DiagramSurface
              current={current}
              raw={raw}
              source={source}
              zoom={zoom}
              pan={pan}
              onStart={start}
              onMove={move}
              onEnd={() => {
                drag.current = undefined;
              }}
              onPan={setPan}
              onZoom={setZoom}
              onReset={reset}
              onRaw={() => setRaw(!raw)}
              onCopy={() => void copy()}
              onPNG={() => void png()}
              onSVG={() =>
                current?.svg &&
                download("diagram.svg", current.svg, "image/svg+xml")
              }
              onSource={() => download("diagram.mmd", source, "text/plain")}
              exporting={exporting}
              onFullscreen={
                fullscreenSupported ? () => void toggleFullscreen() : undefined
              }
              fullscreen={fullscreen}
            />
            <p className="diagram-feedback" role="status">
              {status}
            </p>
          </div>
        </Modal>
      ) : (
        <DiagramSurface
          current={current}
          raw={raw}
          source={source}
          zoom={zoom}
          pan={pan}
          onStart={start}
          onMove={move}
          onEnd={() => {
            drag.current = undefined;
          }}
          onPan={setPan}
          onZoom={setZoom}
          onReset={reset}
          onRaw={() => setRaw(!raw)}
          onCopy={() => void copy()}
          onPNG={() => void png()}
          onSVG={() =>
            current?.svg &&
            download("diagram.svg", current.svg, "image/svg+xml")
          }
          onSource={() => download("diagram.mmd", source, "text/plain")}
          onExpand={() => setExpanded(true)}
          exporting={exporting}
        />
      )}
      {!expanded && (
        <p className="diagram-feedback" role="status">
          {status}
        </p>
      )}
    </section>
  );
}
function DiagramSurface({
  current,
  raw,
  source,
  zoom,
  pan,
  onStart,
  onMove,
  onEnd,
  onPan,
  onZoom,
  onReset,
  onRaw,
  onCopy,
  onPNG,
  onSVG,
  onSource,
  onExpand,
  exporting,
  onFullscreen,
  fullscreen,
}: {
  current?: { svg: string; width: number; height: number; error?: string };
  raw: boolean;
  source: string;
  zoom: number;
  pan: { x: number; y: number };
  onStart: (e: PointerEvent<HTMLDivElement>) => void;
  onMove: (e: PointerEvent<HTMLDivElement>) => void;
  onEnd: () => void;
  onPan: (p: { x: number; y: number }) => void;
  onZoom: (z: number) => void;
  onReset: () => void;
  onRaw: () => void;
  onCopy: () => void;
  onPNG: () => void;
  onSVG: () => void;
  onSource: () => void;
  onExpand?: () => void;
  exporting: boolean;
  onFullscreen?: () => void;
  fullscreen?: boolean;
}) {
  return (
    <>
      <div className="code-toolbar diagram-toolbar">
        <span>mermaid</span>
        <div>
          <button
            aria-label="Zoom out"
            disabled={zoom <= 0.25}
            onClick={() => onZoom(Math.max(0.25, zoom - 0.25))}
          >
            <Minus size={14} />
          </button>
          <span className="diagram-zoom" aria-label="Diagram zoom">
            {Math.round(zoom * 100)}%
          </span>
          <button
            aria-label="Zoom in"
            disabled={zoom >= 4}
            onClick={() => onZoom(Math.min(4, zoom + 0.25))}
          >
            <Plus size={14} />
          </button>
          <button aria-label="Fit diagram" onClick={onReset}>
            <RotateCcw size={14} />
          </button>
          {onExpand && (
            <button aria-label="Expand diagram" onClick={onExpand}>
              <Maximize2 size={14} />
            </button>
          )}
          {onFullscreen && (
            <button
              aria-label="Toggle diagram fullscreen"
              aria-pressed={fullscreen}
              onClick={onFullscreen}
            >
              <Maximize2 size={14} />
              Screen
            </button>
          )}
          <button
            aria-label="Toggle diagram source"
            aria-pressed={raw}
            onClick={onRaw}
          >
            <Code size={14} />
          </button>
          <button aria-label="Copy diagram source" onClick={onCopy}>
            <Copy size={14} />
          </button>
          <button aria-label="Download diagram source" onClick={onSource}>
            MMD
          </button>
          <button
            disabled={!current?.svg}
            aria-label="Download diagram as SVG"
            onClick={onSVG}
          >
            <Download size={14} />
            SVG
          </button>
          <button
            disabled={!current?.svg || exporting}
            aria-label="Download diagram as PNG"
            onClick={onPNG}
          >
            {exporting ? "Exporting…" : "PNG"}
          </button>
        </div>
      </div>
      {current?.error && (
        <p role="alert" className="diagram-error">
          Diagram could not render: {current.error}
        </p>
      )}
      {raw || current?.error ? (
        <pre
          className="diagram-source"
          tabIndex={0}
          aria-label="Diagram source"
        >
          {source}
        </pre>
      ) : (
        <div
          className="diagram-canvas"
          role="group"
          aria-label="Diagram canvas"
          tabIndex={0}
          onPointerDown={onStart}
          onPointerMove={onMove}
          onPointerUp={onEnd}
          onPointerCancel={onEnd}
          onLostPointerCapture={onEnd}
          onKeyDown={(event) => {
            if (
              ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                event.key,
              )
            ) {
              event.preventDefault();
              onPan({
                x:
                  pan.x +
                  (event.key === "ArrowLeft"
                    ? 40
                    : event.key === "ArrowRight"
                      ? -40
                      : 0),
                y:
                  pan.y +
                  (event.key === "ArrowUp"
                    ? 40
                    : event.key === "ArrowDown"
                      ? -40
                      : 0),
              });
            } else if (event.key === "+" || event.key === "=") {
              event.preventDefault();
              onZoom(Math.min(4, zoom + 0.25));
            } else if (event.key === "-") {
              event.preventDefault();
              onZoom(Math.max(0.25, zoom - 0.25));
            } else if (event.key === "0") {
              event.preventDefault();
              onReset();
            }
          }}
        >
          {current?.svg ? (
            <div
              className="diagram-art"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              }}
              dangerouslySetInnerHTML={{ __html: current.svg }}
            />
          ) : (
            <p>Rendering diagram…</p>
          )}
        </div>
      )}
    </>
  );
}
