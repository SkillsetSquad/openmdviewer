import type {
  DocumentEdge,
  DocumentSummary,
  WorkspaceNavigation,
} from "./references";

export interface GraphNode extends DocumentSummary {
  x: number;
  y: number;
  degree: number;
}
export interface GraphIndex {
  nodes: Map<string, GraphNode>;
  neighbors: Map<string, Set<string>>;
  incoming: Map<string, DocumentEdge[]>;
  outgoing: Map<string, DocumentEdge[]>;
  edges: DocumentEdge[];
  tags: string[];
}
export interface GraphFilter {
  query: string;
  tag: string;
  mode: "all" | "connected" | "isolated";
  focusId: string;
  depth: "1" | "2" | "all";
}
export interface GraphView {
  nodes: GraphNode[];
  edges: DocumentEdge[];
  total: number;
  isolated: number;
  tags: string[];
}

// Deterministic component clusters: O(V + E), plus stable path sorting. No force
// simulation or pairwise repulsion; all preparation/filtering runs in a worker.
export function graphIndex(navigation: WorkspaceNavigation): GraphIndex {
  const nodes = new Map<string, GraphNode>();
  const neighbors = new Map<string, Set<string>>();
  const incoming = new Map<string, DocumentEdge[]>();
  const outgoing = new Map<string, DocumentEdge[]>();
  for (const summary of [...navigation.summaries].sort((a, b) =>
    a.path.localeCompare(b.path),
  )) {
    nodes.set(summary.id, { ...summary, x: 0, y: 0, degree: 0 });
    neighbors.set(summary.id, new Set());
    incoming.set(summary.id, []);
    outgoing.set(summary.id, []);
  }
  const edges = navigation.edges.filter(
    (e) => e.from !== e.to && nodes.has(e.from) && nodes.has(e.to),
  );
  for (const edge of edges) {
    neighbors.get(edge.from)!.add(edge.to);
    neighbors.get(edge.to)!.add(edge.from);
    outgoing.get(edge.from)!.push(edge);
    incoming.get(edge.to)!.push(edge);
  }
  for (const node of nodes.values()) node.degree = neighbors.get(node.id)!.size;
  const seen = new Set<string>();
  const components: GraphNode[][] = [];
  for (const node of nodes.values()) {
    if (seen.has(node.id)) continue;
    const ids = [node.id];
    seen.add(node.id);
    for (let i = 0; i < ids.length; i++) {
      for (const id of neighbors.get(ids[i])!) {
        if (!seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      }
    }
    // Put highly connected documents toward the center of each cluster.
    components.push(
      ids
        .map((id) => nodes.get(id)!)
        .sort((a, b) => b.degree - a.degree || a.path.localeCompare(b.path)),
    );
  }
  components.sort(
    (a, b) => b.length - a.length || a[0].path.localeCompare(b[0].path),
  );
  const radii = components.map((group) =>
    Math.max(26, Math.sqrt(group.length) * 24),
  );
  const width = Math.max(
    1,
    Math.sqrt(radii.reduce((sum, r) => sum + (r * 2 + 48) ** 2, 0)) * 1.3,
  );
  let x = 0,
    y = 0,
    rowHeight = 0;
  components.forEach((group, i) => {
    const r = radii[i],
      size = r * 2 + 48;
    if (x && x + size > width) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    group.forEach((node, j) => {
      const distance = j ? Math.sqrt(j / group.length) * r : 0;
      const angle = j * Math.PI * (3 - Math.sqrt(5));
      node.x = x + r + 24 + Math.cos(angle) * distance;
      node.y = y + r + 24 + Math.sin(angle) * distance;
    });
    x += size;
    rowHeight = Math.max(rowHeight, size);
  });
  return {
    nodes,
    neighbors,
    incoming,
    outgoing,
    edges,
    tags: [...new Set([...nodes.values()].flatMap((n) => n.tags))].sort(),
  };
}

export function graphView(index: GraphIndex, filter: GraphFilter): GraphView {
  let neighborhood: Set<string> | undefined;
  if (filter.focusId) {
    neighborhood = new Set();
    if (index.nodes.has(filter.focusId)) {
      const queue = [{ id: filter.focusId, depth: 0 }];
      neighborhood.add(filter.focusId);
      const limit = filter.depth === "all" ? Infinity : Number(filter.depth);
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        if (item.depth >= limit) continue;
        for (const id of index.neighbors.get(item.id)!) {
          if (!neighborhood.has(id)) {
            neighborhood.add(id);
            queue.push({ id, depth: item.depth + 1 });
          }
        }
      }
    }
  }
  const terms = filter.query
    .toLocaleLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const nodes = [...index.nodes.values()].filter((node) => {
    if (neighborhood && !neighborhood.has(node.id)) return false;
    if (filter.tag && !node.tags.includes(filter.tag)) return false;
    if (filter.mode === "isolated" && node.degree) return false;
    if (filter.mode === "connected" && !node.degree) return false;
    const text =
      `${node.title} ${node.path} ${node.tags.join(" ")}`.toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
  const ids = new Set(nodes.map((n) => n.id));
  return {
    nodes,
    edges: index.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
    total: index.nodes.size,
    isolated: [...index.nodes.values()].filter((n) => !n.degree).length,
    tags: index.tags,
  };
}

const colors = [
  "#6fa8ff",
  "#d898fa",
  "#66d5b5",
  "#ffbb70",
  "#f58fa9",
  "#b3c97b",
  "#77cddd",
  "#afa0ff",
];
export function graphTagColor(tag: string) {
  if (!tag) return "#8c9aaf";
  let hash = 0;
  for (let i = 0; i < tag.length; i++)
    hash = (Math.imul(hash, 31) + tag.charCodeAt(i)) | 0;
  return colors[(hash >>> 0) % colors.length];
}
