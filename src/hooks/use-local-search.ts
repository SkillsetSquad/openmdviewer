"use client";
import { useEffect, useRef, useState } from "react";
import { documentTitle, headings } from "@/lib/documents";
import type { ReaderDocument } from "@/lib/types";
export function useLocalSearch(documents: ReaderDocument[], query: string) {
  const worker = useRef<Worker | null>(null);
  const versions = useRef(new Map<string, string>());
  const sequence = useRef(0);
  const [result, setResult] = useState<{ query: string; ids: string[] } | null>(
    null,
  );
  const currentQuery = useRef(query);
  useEffect(() => {
    const instance = new Worker(
      new URL("../workers/search.worker.ts", import.meta.url),
    );
    worker.current = instance;
    const versionMap = versions.current;
    instance.onmessage = (event) => {
      if (!event.data.error && event.data.request === sequence.current)
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
      .filter(
        (d) =>
          versions.current.get(d.id) !==
          JSON.stringify([d.path, d.updatedAt, d.tags]),
      )
      .map((d) => {
        versions.current.set(
          d.id,
          JSON.stringify([d.path, d.updatedAt, d.tags]),
        );
        return {
          id: d.id,
          path: d.path,
          content: d.content,
          tags: d.tags,
          title: documentTitle(d),
          headings: headings(d.content)
            .map((h) => h.text)
            .join("\n"),
        };
      });
    removed.forEach((id) => versions.current.delete(id));
    if (changes.length || removed.length)
      worker.current?.postMessage({ type: "sync", changes, removed });
    currentQuery.current = query;
    worker.current?.postMessage({
      type: "search",
      query,
      request: ++sequence.current,
    });
  }, [documents, query]);
  return result?.query === query ? result.ids : null;
}
