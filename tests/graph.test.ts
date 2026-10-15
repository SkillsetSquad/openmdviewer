import { expect, it } from "vitest";
import {
  graphIndex,
  graphView,
  graphTagColor,
  type GraphFilter,
} from "../src/lib/graph";
import type { WorkspaceNavigation } from "../src/lib/references";
const navigation: WorkspaceNavigation = {
  summaries: ["a", "b", "c", "d", "e"].map((id) => ({
    id,
    path: `docs/${id}.md`,
    title: `Document ${id}`,
    tags: id < "c" ? ["api"] : [],
    words: 1,
  })),
  edges: [
    { from: "a", to: "b", count: 2, line: 1 },
    { from: "b", to: "a", count: 1, line: 2 },
    { from: "b", to: "c", count: 1, line: 3 },
    { from: "c", to: "d", count: 1, line: 1 },
    { from: "e", to: "e", count: 1, line: 1 },
    { from: "a", to: "missing", count: 1, line: 2 },
  ],
};
const defaults: GraphFilter = {
  query: "",
  tag: "",
  mode: "all",
  focusId: "",
  depth: "1",
};
it("builds distinct neighbor degrees while retaining directed link counts and excluding removed targets and self-links", () => {
  const index = graphIndex(navigation);
  expect(index.nodes.get("b")?.degree).toBe(2);
  expect(index.nodes.get("a")?.degree).toBe(1);
  expect(index.nodes.get("e")?.degree).toBe(0);
  expect(index.outgoing.get("a")?.[0].count).toBe(2);
  expect(index.incoming.get("a")?.[0].from).toBe("b");
  expect(index.edges).toHaveLength(4);
  const view = graphView(index, { ...defaults, tag: "api", query: "document" });
  expect(view.nodes.map((n) => n.id)).toEqual(["a", "b"]);
  expect(view.edges).toHaveLength(2);
  expect(view.isolated).toBe(1);
});
it("explores direct, two-hop, and complete connected groups without mistaking filtered neighbors for isolated documents", () => {
  const index = graphIndex(navigation);
  expect(
    graphView(index, { ...defaults, focusId: "a" }).nodes.map((n) => n.id),
  ).toEqual(["a", "b"]);
  expect(
    graphView(index, { ...defaults, focusId: "a", depth: "2" }).nodes.map(
      (n) => n.id,
    ),
  ).toEqual(["a", "b", "c"]);
  expect(
    graphView(index, { ...defaults, focusId: "a", depth: "all" }).nodes.map(
      (n) => n.id,
    ),
  ).toEqual(["a", "b", "c", "d"]);
  expect(
    graphView(index, { ...defaults, query: "a.md", mode: "isolated" }).nodes,
  ).toEqual([]);
  expect(
    graphView(index, { ...defaults, mode: "isolated" }).nodes.map((n) => n.id),
  ).toEqual(["e"]);
  expect(graphView(index, { ...defaults, focusId: "removed" }).nodes).toEqual(
    [],
  );
});
it("lays out thousands of nodes deterministically with finite, distinct positions and stable tag colors", () => {
  const input: WorkspaceNavigation = {
    summaries: Array.from({ length: 3000 }, (_, i) => ({
      id: `${i}`,
      path: `${i}.md`,
      title: `${i}`,
      tags: [],
      words: 0,
    })),
    edges: Array.from({ length: 1999 }, (_, i) => ({
      from: `${i}`,
      to: `${i + 1}`,
      count: 1,
      line: 1,
    })),
  };
  const first = graphIndex(input),
    second = graphIndex(input);
  const positions = [...first.nodes.values()].map((n) => [n.x, n.y]);
  expect(
    positions.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)),
  ).toBe(true);
  expect(new Set(positions.map((p) => JSON.stringify(p))).size).toBe(3000);
  expect(positions).toEqual([...second.nodes.values()].map((n) => [n.x, n.y]));
  expect(
    graphView(first, { ...defaults, focusId: "0", depth: "all" }).nodes,
  ).toHaveLength(2000);
  expect(graphTagColor("api")).toBe(graphTagColor("api"));
  expect(
    graphView(graphIndex({ summaries: [], edges: [] }), defaults).total,
  ).toBe(0);
});
