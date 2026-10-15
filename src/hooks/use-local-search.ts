"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  defaultSearchOptions,
  hasSearchQuery,
  regexSearchTimeout,
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
  const [attempt, setAttempt] = useState(0);
  const queryKey = JSON.stringify([query, options, offset, attempt]);
  const runRegex = useRef<
    | ((message: {
        query: string;
        options: SearchOptions;
        offset: number;
        request: number;
      }) => void)
    | null
  >(null);
  const regexWorker = useRef<Worker | null>(null);
  const regexTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRegex = useCallback(() => {
    regexWorker.current?.terminate();
    regexWorker.current = null;
    if (regexTimer.current) clearTimeout(regexTimer.current);
    regexTimer.current = null;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = null;
  }, []);
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
    const regexError = (request: number, error: string) => {
      if (request !== sequence.current) return;
      stopRegex();
      setResult({
        key: currentQuery.current || "",
        page: { hits: [], total: 0, offset: 0, error },
      });
    };
    runRegex.current = (message) => {
      const request = message.request;
      if (request !== sequence.current) return;
      stopRegex();
      try {
        const isolated = new Worker(`${basePath}/regex-worker.js`);
        regexWorker.current = isolated;
        regexTimer.current = setTimeout(
          () =>
            regexError(
              request,
              "Regular-expression search could not start. Retry or switch matching.",
            ),
          10000,
        );
        isolated.onerror = () =>
          regexError(
            request,
            "Regular-expression search is unavailable. Retry or switch matching.",
          );
        isolated.onmessage = (answer) => {
          if (request !== sequence.current || regexWorker.current !== isolated)
            return;
          if (answer.data.type === "ready") {
            if (regexTimer.current) clearTimeout(regexTimer.current);
            regexTimer.current = setTimeout(
              () =>
                regexError(
                  request,
                  "Regular-expression search exceeded its 1.5-second limit. Simplify the pattern or switch matching.",
                ),
              regexSearchTimeout,
            );
            return;
          }
          if (answer.data.elapsed > regexSearchTimeout) {
            regexError(
              request,
              "Regular-expression search exceeded its 1.5-second limit. Simplify the pattern or switch matching.",
            );
            return;
          }
          const page = answer.data.page;
          if (
            !page ||
            !Array.isArray(page.hits) ||
            typeof page.total !== "number"
          ) {
            regexError(
              request,
              "Regular-expression search returned an invalid result. Retry or switch matching.",
            );
            return;
          }
          stopRegex();
          setResult({ key: currentQuery.current || "", page });
        };
        const channel = new MessageChannel();
        isolated.postMessage({ port: channel.port2 }, [channel.port2]);
        instance.postMessage(
          { ...message, type: "regex-input", port: channel.port1 },
          [channel.port1],
        );
      } catch {
        regexError(
          request,
          "Regular-expression search is unavailable. Retry or switch matching.",
        );
      }
    };
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
      runRegex.current = null;
      stopRegex();
      instance.terminate();
      worker.current = null;
      versionMap.clear();
    };
  }, [stopRegex]);
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
    stopRegex();
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
    const request = ++sequence.current;
    const message = {
      type:
        options.regex && hasSearchQuery(query, options)
          ? "regex-input"
          : "search",
      query,
      options,
      offset,
      request,
    };
    if (message.type === "regex-input")
      debounce.current = setTimeout(() => runRegex.current?.(message), 150);
    else worker.current?.postMessage(message);
  }, [documents, query, options, offset, queryKey, stopRegex]);
  return {
    ids:
      result?.key === queryKey ? result.page.hits.map((hit) => hit.id) : null,
    page: result?.key === queryKey ? result.page : null,
    failed,
    cancel: () => {
      if (!options.regex) return;
      ++sequence.current;
      stopRegex();
      setResult({
        key: queryKey,
        page: {
          hits: [],
          total: 0,
          offset: 0,
          error: "Regular-expression search cancelled.",
        },
      });
    },
    retry: () => setAttempt((value) => value + 1),
    navigation,
    indexing,
  };
}
