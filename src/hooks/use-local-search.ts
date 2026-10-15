"use client";
import { useEffect, useRef, useState } from "react";
import { basePath } from "@/lib/types";
import type { WorkspaceNavigation } from "@/lib/references";
import type { ReaderDocument } from "@/lib/types";
export function useLocalSearch(documents: ReaderDocument[], query: string) {
  const worker = useRef<Worker | null>(null);
  const versions = useRef(
    new Map<string, { path: string; content: string; tags: string }>(),
  );
  const sequence = useRef(0);
  const indexVersion = useRef(0);
  const [navigation, setNavigation] = useState<WorkspaceNavigation>({
    edges: [],
    summaries: [],
  });
  const [indexing, setIndexing] = useState(false);
  const [result, setResult] = useState<{ query: string; ids: string[] } | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  const currentQuery = useRef(query);
  useEffect(() => {
    const instance = new Worker(`${basePath}/search-worker.js`);
    worker.current = instance;
    const versionMap = versions.current;
    instance.onerror = () => setFailed(true);
    instance.onmessage = (event) => {
      if (event.data.error) {
        setFailed(true);
        return;
      }
      if (event.data.type === "indexing") {
        if (event.data.indexVersion === indexVersion.current) setIndexing(true);
        return;
      }
      if (event.data.type === "navigation") {
        if (event.data.indexVersion === indexVersion.current) {
          setNavigation(event.data.navigation);
          setIndexing(false);
        }
        return;
      }
      if (event.data.request === sequence.current)
        setResult({ query: currentQuery.current, ids: event.data.ids });
    };
    return () => {
      instance.terminate();
      worker.current = null;
      versionMap.clear();
    };
  }, []);
  useEffect(() => {
    const existing = new Set(documents.map((d) => d.id));
    const removed = [...versions.current.keys()].filter(
      (id) => !existing.has(id),
    );
    const changes = documents
      .filter((d) => {
        const old = versions.current.get(d.id);
        return (
          !old ||
          old.content !== d.content ||
          old.path !== d.path ||
          old.tags !== JSON.stringify(d.tags)
        );
      })
      .map((d) => {
        versions.current.set(d.id, {
          path: d.path,
          content: d.content,
          tags: JSON.stringify(d.tags),
        });
        return { id: d.id, path: d.path, content: d.content, tags: d.tags };
      });
    removed.forEach((id) => versions.current.delete(id));
    if (changes.length || removed.length)
      worker.current?.postMessage({
        type: "sync",
        changes,
        removed,
        indexVersion: ++indexVersion.current,
      });
    currentQuery.current = query;
    worker.current?.postMessage({
      type: "search",
      query,
      request: ++sequence.current,
    });
  }, [documents, query]);
  return {
    ids: result?.query === query ? result.ids : null,
    failed,
    navigation,
    indexing,
  };
}
