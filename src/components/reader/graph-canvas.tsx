"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, Maximize2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { graphTagColor, type GraphNode, type GraphView } from "@/lib/graph";

type Transform = { x: number; y: number; scale: number };
function fit(nodes: GraphNode[], width: number, height: number): Transform {
  if (!nodes.length) return { x: width / 2, y: height / 2, scale: 1 };
  let left = Infinity,
    right = -Infinity,
    top = Infinity,
    bottom = -Infinity;
  for (const n of nodes) {
    left = Math.min(left, n.x);
    right = Math.max(right, n.x);
    top = Math.min(top, n.y);
    bottom = Math.max(bottom, n.y);
  }
  const scale = Math.min(
    2,
    Math.max(
      0.015,
      Math.min(
        (width - 80) / Math.max(right - left, 40),
        (height - 80) / Math.max(bottom - top, 40),
      ),
    ),
  );
  return {
    scale,
    x: width / 2 - ((left + right) / 2) * scale,
    y: height / 2 - ((top + bottom) / 2) * scale,
  };
}
export function GraphCanvas({
  nodes,
  edges,
  selectedId,
  onSelect,
  onOpen,
}: {
  nodes: GraphNode[];
  edges: GraphView["edges"];
  selectedId: string;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height: 400 });
  const [transform, setTransform] = useState<Transform>({
    x: 0,
    y: 0,
    scale: 1,
  });
  const drag = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const hitTest = (x: number, y: number) => {
    let nearest: GraphNode | undefined,
      distance = 16;
    for (const node of nodes) {
      const d = Math.hypot(
        node.x * transform.scale + transform.x - x,
        node.y * transform.scale + transform.y - y,
      );
      if (d < distance) {
        nearest = node;
        distance = d;
      }
    }
    return nearest;
  };
  const reset = useCallback(
    () => setTransform(fit(nodes, size.width, size.height)),
    [nodes, size],
  );
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(reset);
    return () => cancelAnimationFrame(frame);
  }, [reset]);
  const zoomAt = useCallback(
    (factor: number, x = size.width / 2, y = size.height / 2) => {
      setTransform((old) => {
        const scale = Math.max(0.015, Math.min(4, old.scale * factor));
        const ratio = scale / old.scale;
        return {
          scale,
          x: x - (x - old.x) * ratio,
          y: y - (y - old.y) * ratio,
        };
      });
    },
    [size],
  );
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      zoomAt(
        Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.006),
        event.clientX - bounds.left,
        event.clientY - bounds.top,
      );
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [zoomAt]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const frame = requestAnimationFrame(() => {
      const ctx = element.getContext("2d");
      if (!ctx) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.max(1, Math.round(size.width * ratio));
      element.height = Math.max(1, Math.round(size.height * ratio));
      ctx.scale(ratio, ratio);
      ctx.clearRect(0, 0, size.width, size.height);
      const theme = getComputedStyle(element);
      const textColor =
        theme.getPropertyValue("--foreground").trim() || theme.color;
      const edgeColor =
        theme.getPropertyValue("--muted-foreground").trim() || "#8591a3";
      const project = (node: GraphNode) => ({
        x: node.x * transform.scale + transform.x,
        y: node.y * transform.scale + transform.y,
      });
      const connected = new Set<string>();
      ctx.lineWidth = 1;
      ctx.strokeStyle = edgeColor;
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      for (const edge of edges) {
        const a = byId.get(edge.from),
          b = byId.get(edge.to);
        if (!a || !b) continue;
        if (edge.from === selectedId || edge.to === selectedId) {
          connected.add(edge.from);
          connected.add(edge.to);
          continue;
        }
        const start = project(a),
          end = project(b);
        if (
          (start.x < 0 && end.x < 0) ||
          (start.y < 0 && end.y < 0) ||
          (start.x > size.width && end.x > size.width) ||
          (start.y > size.height && end.y > size.height)
        )
          continue;
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
      }
      ctx.stroke();
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = "#6fa8ff";
      ctx.beginPath();
      for (const edge of edges) {
        if (edge.from !== selectedId && edge.to !== selectedId) continue;
        const a = byId.get(edge.from),
          b = byId.get(edge.to);
        if (!a || !b) continue;
        const start = project(a),
          end = project(b);
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.font = "11px system-ui, sans-serif";
      const labels: { node: GraphNode; x: number; y: number }[] = [];
      for (const node of nodes) {
        const { x, y } = project(node);
        if (x < -30 || y < -30 || x > size.width + 30 || y > size.height + 30)
          continue;
        const selected = node.id === selectedId;
        const r = selected
          ? 7
          : Math.max(3, Math.min(6, 3 + Math.sqrt(node.degree) * 0.5));
        ctx.fillStyle = graphTagColor([...node.tags].sort()[0] || "");
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        if (selected) {
          ctx.strokeStyle = textColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, r + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (
          selected ||
          ((nodes.length <= 80 || transform.scale >= 0.85) &&
            (labels.length < 100 || connected.has(node.id)))
        )
          labels.push({ node, x, y });
      }
      // Paint labels last so neighboring points cannot cover the text.
      for (const { node, x, y } of labels) {
        const label =
          node.title.length > 35 ? `${node.title.slice(0, 32)}…` : node.title;
        ctx.lineWidth = 4;
        ctx.strokeStyle =
          theme.getPropertyValue("--app-bg").trim() || "#14191f";
        ctx.strokeText(label, x + 12, y + 4);
        ctx.fillStyle = textColor;
        ctx.fillText(label, x + 12, y + 4);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [nodes, edges, byId, selectedId, size, transform]);
  return (
    <div className="workspace-graph-stage" ref={container}>
      <canvas
        ref={canvas}
        tabIndex={0}
        role="img"
        aria-label="Workspace document graph. Drag to pan, use plus and minus to zoom, arrow keys to pan, and Home to fit. Select documents with the list below."
        onKeyDown={(event) => {
          if (
            [
              "+",
              "=",
              "-",
              "Home",
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
            ].includes(event.key)
          )
            event.preventDefault();
          if (event.key === "+" || event.key === "=") zoomAt(1.3);
          if (event.key === "-") zoomAt(1 / 1.3);
          if (event.key === "Home") reset();
          if (event.key.startsWith("Arrow"))
            setTransform((old) => ({
              ...old,
              x:
                old.x +
                (event.key === "ArrowLeft"
                  ? 50
                  : event.key === "ArrowRight"
                    ? -50
                    : 0),
              y:
                old.y +
                (event.key === "ArrowUp"
                  ? 50
                  : event.key === "ArrowDown"
                    ? -50
                    : 0),
            }));
        }}
        onDoubleClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const node = hitTest(
            event.clientX - rect.left,
            event.clientY - rect.top,
          );
          if (node) onOpen(node.id);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            startX: event.clientX,
            startY: event.clientY,
            moved: false,
          };
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current) return;
          const dx = event.clientX - current.x,
            dy = event.clientY - current.y;
          if (
            Math.hypot(
              event.clientX - current.startX,
              event.clientY - current.startY,
            ) > 4
          )
            current.moved = true;
          current.x = event.clientX;
          current.y = event.clientY;
          if (current.moved)
            setTransform((old) => ({ ...old, x: old.x + dx, y: old.y + dy }));
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onPointerUp={(event) => {
          const current = drag.current;
          drag.current = null;
          if (!current || current.moved) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left,
            y = event.clientY - rect.top;
          const nearest = hitTest(x, y);
          if (nearest) onSelect(nearest.id);
        }}
      />
      {!nodes.length && (
        <p className="workspace-graph-empty">
          No documents match these filters.
        </p>
      )}
      <div className="workspace-graph-tools" aria-label="Graph view controls">
        <Button
          variant="outline"
          size="icon"
          title="Zoom in"
          aria-label="Zoom graph in"
          onClick={() => zoomAt(1.3)}
        >
          <Plus size={15} />
        </Button>
        <Button
          variant="outline"
          size="icon"
          title="Zoom out"
          aria-label="Zoom graph out"
          onClick={() => zoomAt(1 / 1.3)}
        >
          <Minus size={15} />
        </Button>
        <Button
          variant="outline"
          title="Fit visible documents"
          aria-label="Fit graph"
          onClick={reset}
        >
          <Maximize2 size={14} />
          Fit
        </Button>
        <Button
          variant="outline"
          disabled={!byId.has(selectedId)}
          onClick={() => {
            const node = byId.get(selectedId);
            if (node)
              setTransform({
                scale: 1.5,
                x: size.width / 2 - node.x * 1.5,
                y: size.height / 2 - node.y * 1.5,
              });
          }}
        >
          <LocateFixed size={14} />
          Center selected
        </Button>
        <output aria-label="Graph zoom">
          {Math.round(transform.scale * 100)}%
        </output>
      </div>
    </div>
  );
}
