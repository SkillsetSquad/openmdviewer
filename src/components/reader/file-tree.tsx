"use client";
import { ChevronRight, FileText, Folder, FolderOpen, Star } from "lucide-react";
import { fileName } from "@/lib/documents";
import type { ReaderDocument } from "@/lib/types";
interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  doc?: ReaderDocument;
}
function buildTree(documents: ReaderDocument[]) {
  const root: TreeNode = { name: "", path: "", children: [] };
  for (const doc of documents) {
    let current = root;
    const parts = doc.path.split("/");
    parts.forEach((name, i) => {
      const path = parts.slice(0, i + 1).join("/");
      let node = current.children.find((n) => n.path === path);
      if (!node) {
        node = { name, path, children: [] };
        current.children.push(node);
      }
      if (i === parts.length - 1) node.doc = doc;
      current = node;
    });
  }
  return root.children;
}
export function FileTree({
  documents,
  activeId,
  onOpen,
}: {
  documents: ReaderDocument[];
  activeId: string;
  onOpen: (id: string) => void;
}) {
  const count = (node: TreeNode): number =>
    node.doc ? 1 : node.children.reduce((n, c) => n + count(c), 0);
  function nodeView(node: TreeNode, depth: number) {
    if (node.doc)
      return (
        <button
          key={node.path}
          className={`file-row ${node.doc.id === activeId ? "selected" : ""}`}
          style={{ paddingLeft: 18 + depth * 17 }}
          onClick={() => onOpen(node.doc!.id)}
          title={node.doc.path}
          aria-current={node.doc.id === activeId ? "page" : undefined}
        >
          <FileText size={16} />
          <span>{fileName(node.doc.path)}</span>
          {node.doc.favorite && <Star size={11} className="favorite-star" />}
        </button>
      );
    return (
      <details
        className={`folder depth-${depth}`}
        key={node.path}
        open={
          depth === 0
            ? node.name !== "Archive"
            : node.name === "Getting Started"
        }
      >
        <summary style={{ paddingLeft: 8 + depth * 17 }}>
          <ChevronRight size={14} className="folder-chevron" />
          {depth === 0 ? (
            <FolderOpen
              size={16}
              className={
                node.name === "Docs" || node.name === "Notes" ? "blue" : ""
              }
            />
          ) : (
            <Folder size={15} />
          )}
          <span>{node.name}</span>
          <small>{count(node)}</small>
        </summary>
        {node.children.map((child) => nodeView(child, depth + 1))}
      </details>
    );
  }
  return (
    <nav aria-label="Workspace documents" className="file-tree">
      {buildTree(documents).map((node) => nodeView(node, 0))}
    </nav>
  );
}
