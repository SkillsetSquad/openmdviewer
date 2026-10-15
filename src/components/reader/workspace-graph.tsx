"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Network, Search } from "lucide-react";
import { GraphCanvas } from "./graph-canvas";
import { Modal } from "./modal";
import { Button } from "@/components/ui/button";
import { basePath } from "@/lib/types";
import type { WorkspaceNavigation } from "@/lib/references";
import { graphTagColor, type GraphFilter, type GraphView } from "@/lib/graph";

const pageSize = 40;
export default function WorkspaceGraph({
  navigation,
  activeId,
  indexing,
  failed,
  onOpen,
  onClose,
}: {
  navigation: WorkspaceNavigation;
  activeId: string;
  indexing: boolean;
  failed: boolean;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<GraphFilter>({
    query: "",
    tag: "",
    mode: "all",
    focusId: "",
    depth: "1",
  });
  const [selectedId, setSelectedId] = useState(activeId);
  const [page, setPage] = useState(0);
  const [relations, setRelations] = useState<"incoming" | "outgoing">(
    "outgoing",
  );
  const [relationPage, setRelationPage] = useState(0);
  const worker = useRef<Worker | null>(null);
  const previousNavigation = useRef<WorkspaceNavigation | null>(null);
  const sequence = useRef(0);
  const key = JSON.stringify(filter);
  const current = useRef({ navigation, key });
  const [result, setResult] = useState<{
    navigation: WorkspaceNavigation;
    key: string;
    view?: GraphView;
    error?: string;
  } | null>(null);
  useEffect(() => {
    const instance = new Worker(`${basePath}/graph-worker.js`);
    worker.current = instance;
    instance.onmessage = (event) => {
      if (event.data.request === sequence.current)
        setResult({
          ...current.current,
          view: event.data.view,
          error: event.data.error,
        });
    };
    instance.onerror = () =>
      setResult({
        ...current.current,
        error:
          "The local graph worker could not run. Close the graph and try again.",
      });
    return () => {
      instance.terminate();
      worker.current = null;
      previousNavigation.current = null;
    };
  }, []);
  useEffect(() => {
    current.current = { navigation, key };
    worker.current?.postMessage({
      navigation:
        previousNavigation.current === navigation ? undefined : navigation,
      filter,
      request: ++sequence.current,
    });
    previousNavigation.current = navigation;
  }, [navigation, filter, key]);
  const view = result?.view;
  const loading =
    !result || result.navigation !== navigation || result.key !== key;
  const summaries = useMemo(
    () => new Map(navigation.summaries.map((n) => [n.id, n])),
    [navigation],
  );
  const selected = summaries.get(selectedId);
  const related = useMemo(
    () =>
      navigation.edges
        .filter((e) =>
          relations === "incoming"
            ? e.to === selectedId
            : e.from === selectedId,
        )
        .map((edge) => ({
          edge,
          node: summaries.get(relations === "incoming" ? edge.from : edge.to),
        }))
        .filter((item) => !!item.node)
        .sort((a, b) => a.node!.path.localeCompare(b.node!.path)),
    [navigation, summaries, selectedId, relations],
  );
  const focus = summaries.get(filter.focusId);
  const updateFilter = (value: Partial<GraphFilter>) => {
    setFilter((old) => ({ ...old, ...value }));
    setPage(0);
  };
  const select = (id: string) => {
    setSelectedId(id);
    setRelationPage(0);
  };
  const displayedPage = Math.min(
    page,
    Math.max(0, Math.ceil((view?.nodes.length || 0) / pageSize) - 1),
  );
  const displayedRelationPage = Math.min(
    relationPage,
    Math.max(0, Math.ceil(related.length / pageSize) - 1),
  );
  return (
    <Modal
      title="Workspace graph"
      wide
      className="workspace-graph-dialog"
      onClose={onClose}
    >
      <div className="workspace-graph-content">
        <p className="dialog-description">
          Local Markdown links connect documents. Colors use each document’s
          first alphabetical tag; untagged documents are gray. Arrows and link
          counts are listed in the selected document’s details.
        </p>
        <div className="workspace-graph-filters">
          <label className="workspace-graph-search">
            <Search size={15} />
            <span className="sr-only">Search graph documents</span>
            <input
              autoFocus
              aria-label="Search graph documents"
              placeholder="Find a title, path, or tag…"
              value={filter.query}
              onChange={(e) => updateFilter({ query: e.target.value })}
            />
          </label>
          <label>
            Tag
            <select
              aria-label="Filter graph by tag"
              value={filter.tag}
              onChange={(e) => updateFilter({ tag: e.target.value })}
            >
              <option value="">All tags</option>
              {(view?.tags || []).map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
          <label>
            Connections
            <select
              aria-label="Filter graph connections"
              value={filter.mode}
              onChange={(e) =>
                updateFilter({ mode: e.target.value as GraphFilter["mode"] })
              }
            >
              <option value="all">All documents</option>
              <option value="connected">Connected documents</option>
              <option value="isolated">Isolated documents</option>
            </select>
          </label>
        </div>
        {filter.focusId && (
          <div className="workspace-graph-focus">
            <Network size={14} />
            <span>Exploring {focus?.title || "a removed document"}</span>
            <select
              aria-label="Connection distance"
              value={filter.depth}
              onChange={(e) =>
                updateFilter({ depth: e.target.value as GraphFilter["depth"] })
              }
            >
              <option value="1">Direct neighbors</option>
              <option value="2">Within two links</option>
              <option value="all">Entire connected group</option>
            </select>
            <Button
              variant="outline"
              onClick={() => updateFilter({ focusId: "" })}
            >
              Show whole workspace
            </Button>
          </div>
        )}
        <p className="workspace-graph-summary" role="status">
          {failed || result?.error
            ? "Graph unavailable"
            : indexing
              ? "Updating workspace links…"
              : loading
                ? "Preparing local graph…"
                : `${view?.nodes.length || 0} of ${view?.total || 0} documents · ${view?.edges.length || 0} directed connections shown · ${view?.isolated || 0} isolated in workspace`}
        </p>
        {failed || result?.error ? (
          <p role="alert" className="frontmatter-error">
            {result?.error ||
              "The search index is unavailable. Reload the app to rebuild workspace links."}
          </p>
        ) : (
          view && (
            <>
              <GraphCanvas
                nodes={view.nodes}
                edges={view.edges}
                selectedId={selectedId}
                onSelect={select}
                onOpen={onOpen}
              />
              <p className="workspace-graph-hint">
                Drag to pan · scroll or + / − to zoom · Home to fit. Select a
                node or use the document list. Double-click a node to open it.
                Links to missing files and self-links are excluded. Isolation
                uses all workspace links, regardless of filters.
              </p>
              <div className="workspace-graph-bottom">
                <section
                  className="workspace-graph-documents"
                  aria-label="Graph document list"
                >
                  <h3>
                    Documents <small>{view.nodes.length}</small>
                  </h3>
                  <div className="workspace-graph-list">
                    {view.nodes
                      .slice(
                        displayedPage * pageSize,
                        (displayedPage + 1) * pageSize,
                      )
                      .map((node) => (
                        <button
                          key={node.id}
                          aria-pressed={node.id === selectedId}
                          className={node.id === selectedId ? "selected" : ""}
                          onClick={() => select(node.id)}
                        >
                          <i
                            style={{
                              background: graphTagColor(
                                [...node.tags].sort()[0] || "",
                              ),
                            }}
                          />
                          <span>
                            <strong>{node.title}</strong>
                            <small>{node.path}</small>
                          </span>
                          <small>
                            {node.degree
                              ? `${node.degree} ${node.degree === 1 ? "neighbor" : "neighbors"}`
                              : "Isolated"}
                          </small>
                        </button>
                      ))}
                  </div>
                  {!view.nodes.length && (
                    <p className="empty-panel">
                      No matches. Clear the search or choose different filters.
                    </p>
                  )}
                  {view.nodes.length > pageSize && (
                    <div className="workspace-graph-pagination">
                      <Button
                        variant="outline"
                        disabled={!displayedPage}
                        onClick={() => setPage(displayedPage - 1)}
                      >
                        Previous documents
                      </Button>
                      <span>
                        Page {displayedPage + 1} of{" "}
                        {Math.ceil(view.nodes.length / pageSize)}
                      </span>
                      <Button
                        variant="outline"
                        disabled={
                          (displayedPage + 1) * pageSize >= view.nodes.length
                        }
                        onClick={() => setPage(displayedPage + 1)}
                      >
                        Next documents
                      </Button>
                    </div>
                  )}
                </section>
                <section
                  className="workspace-graph-details"
                  aria-label="Selected graph document"
                >
                  <h3>Selected document</h3>
                  {selected ? (
                    <>
                      <strong>{selected.title}</strong>
                      <p className="workspace-graph-path">{selected.path}</p>
                      <div className="workspace-graph-tags">
                        {selected.tags.length ? (
                          selected.tags.map((tag) => (
                            <button
                              key={tag}
                              onClick={() => updateFilter({ tag })}
                            >
                              <i style={{ background: graphTagColor(tag) }} />
                              {tag}
                            </button>
                          ))
                        ) : (
                          <span>Untagged</span>
                        )}
                      </div>
                      <div className="workspace-graph-detail-actions">
                        <Button onClick={() => onOpen(selected.id)}>
                          Open document
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() =>
                            updateFilter({
                              focusId: selected.id,
                              query: "",
                              tag: "",
                              mode: "all",
                            })
                          }
                        >
                          Explore connections
                        </Button>
                      </div>
                      <label className="workspace-graph-relation-label">
                        Linked documents
                        <select
                          aria-label="Link direction"
                          value={relations}
                          onChange={(e) => {
                            setRelations(e.target.value as typeof relations);
                            setRelationPage(0);
                          }}
                        >
                          <option value="outgoing">Outgoing links</option>
                          <option value="incoming">Incoming links</option>
                        </select>
                      </label>
                      <p className="workspace-graph-hint">
                        {related.length}{" "}
                        {relations === "incoming"
                          ? "documents link here"
                          : "linked documents"}
                        . Select one to explore its connections.
                      </p>
                      <div className="workspace-graph-related">
                        {related
                          .slice(
                            displayedRelationPage * pageSize,
                            (displayedRelationPage + 1) * pageSize,
                          )
                          .map(({ node, edge }) => (
                            <button
                              key={node!.id}
                              onClick={() => select(node!.id)}
                            >
                              <span>
                                {relations === "incoming" ? "←" : "→"}{" "}
                                {node!.title}
                                <small>{node!.path}</small>
                              </span>
                              <small>
                                {edge.count}{" "}
                                {edge.count === 1 ? "link" : "links"}
                              </small>
                            </button>
                          ))}
                      </div>
                      {related.length > pageSize && (
                        <div className="workspace-graph-pagination">
                          <Button
                            variant="outline"
                            disabled={!displayedRelationPage}
                            onClick={() =>
                              setRelationPage(displayedRelationPage - 1)
                            }
                          >
                            Previous links
                          </Button>
                          <span>
                            {displayedRelationPage + 1} /{" "}
                            {Math.ceil(related.length / pageSize)}
                          </span>
                          <Button
                            variant="outline"
                            disabled={
                              (displayedRelationPage + 1) * pageSize >=
                              related.length
                            }
                            onClick={() =>
                              setRelationPage(displayedRelationPage + 1)
                            }
                          >
                            Next links
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="empty-panel">
                      Select a document from the graph or list to see incoming
                      and outgoing links.
                    </p>
                  )}
                </section>
              </div>
            </>
          )
        )}
      </div>
    </Modal>
  );
}
