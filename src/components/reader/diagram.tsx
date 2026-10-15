"use client";
import { useEffect, useId, useState } from "react";
import { Code, Download, Minus, Plus } from "lucide-react";
import { download } from "@/lib/documents";
export default function Diagram({ source }: { source: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [raw, setRaw] = useState(false);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    let canceled = false;
    import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "neutral",
          suppressErrorRendering: true,
        });
        const { svg: rendered } = await mermaid.render(`diagram${id}`, source);
        if (!canceled) {
          setSvg(rendered);
          setError("");
        }
      })
      .catch((e) => {
        if (!canceled) setError(String(e));
      });
    return () => {
      canceled = true;
    };
  }, [source, id]);
  return (
    <div className="diagram">
      <div className="code-toolbar">
        <span>mermaid</span>
        <div>
          <button
            aria-label="Zoom out"
            onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
          >
            <Minus size={14} />
          </button>
          <button
            aria-label="Zoom in"
            onClick={() => setZoom(Math.min(3, zoom + 0.25))}
          >
            <Plus size={14} />
          </button>
          <button
            aria-label="Toggle diagram source"
            onClick={() => setRaw(!raw)}
          >
            <Code size={14} />
          </button>
          <button
            disabled={!svg}
            aria-label="Download diagram as SVG"
            onClick={() => download("diagram.svg", svg, "image/svg+xml")}
          >
            <Download size={14} />
          </button>
        </div>
      </div>
      {error ? (
        <pre role="alert">Diagram syntax error: {error}</pre>
      ) : raw ? (
        <pre>{source}</pre>
      ) : (
        <div className="diagram-canvas">
          <div
            style={{ width: `${zoom * 100}%` }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          {!svg && <p>Rendering diagram…</p>}
        </div>
      )}
    </div>
  );
}
