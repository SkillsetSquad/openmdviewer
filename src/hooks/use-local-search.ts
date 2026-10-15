"use client";
import { useEffect, useRef, useState } from "react";
import {
  defaultSearchOptions,
  type SearchOptions,
  type SearchPage,
} from "@/lib/search-results";
import { basePath } from "@/lib/types";
import type { WorkspaceNavigation } from "@/lib/references";
import type { ReaderDocument } from "@/lib/types";
export function useLocalSearch(
  documents: ReaderDocument[],
  query: string,
  options: SearchOptions = defaultSearchOptions,
  offset = 0,
) {
  const queryKey = JSON.stringify([query, options, offset]);
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
  const [result, setResult] = useState<{
    key: string;
    page: SearchPage;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const currentQuery = useRef<string | null>(null);
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
      if (event.data.request === sequence.current) {
        if (
          !event.data.page ||
          !Array.isArray(event.data.page.hits) ||
          typeof event.data.page.total !== "number"
        ) {
          setFailed(true);
          return;
        }
        setResult({ key: currentQuery.current || "", page: event.data.page });
      }
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
    if (!changes.length && !removed.length && currentQuery.current === queryKey)
      return;
    if (changes.length || removed.length) {
      setResult(null);
      worker.current?.postMessage({
        type: "sync",
        changes,
        removed,
        indexVersion: ++indexVersion.current,
      });
    }
    currentQuery.current = queryKey;
    worker.current?.postMessage({
      type: "search",
      query,
      options,
      offset,
      request: ++sequence.current,
    });
  }, [documents, query, options, offset, queryKey]);
  return {
    ids:
      result?.key === queryKey ? result.page.hits.map((hit) => hit.id) : null,
    page: result?.key === queryKey ? result.page : null,
    failed,
    navigation,
    indexing,
  };
}
