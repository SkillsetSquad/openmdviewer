import { LocalSearch, type SearchDocument } from "../lib/search";
import type { SearchOptions } from "../lib/search-results";
const search = new LocalSearch();
self.onmessage = (
  event: MessageEvent<{
    type: "sync" | "search" | "regex-input";
    changes?: SearchDocument[];
    removed?: string[];
    query?: string;
    options?: SearchOptions;
    offset?: number;
    request?: number;
    indexVersion?: number;
    port?: MessagePort;
  }>,
) => {
  try {
    if (event.data.type === "sync") {
      self.postMessage({
        type: "indexing",
        indexVersion: event.data.indexVersion,
      });
      search.sync(event.data.changes || [], event.data.removed || []);
      self.postMessage({
        type: "navigation",
        indexVersion: event.data.indexVersion,
        navigation: search.navigation(),
      });
    } else if (event.data.type === "regex-input") {
      if (!event.data.port) return;
      event.data.port.postMessage({
        request: event.data.request,
        documents: search.regexDocuments(),
        query: event.data.query,
        options: event.data.options,
        offset: event.data.offset,
      });
      event.data.port.close();
    } else
      self.postMessage({
        request: event.data.request,
        page: {
          ...search.find(
            event.data.query || "",
            event.data.options,
            event.data.offset,
          ),
          suggestions: search.suggest(event.data.query || ""),
        },
      });
  } catch {
    if (event.data.port) {
      event.data.port.postMessage({ error: true });
      event.data.port.close();
    } else self.postMessage({ request: event.data.request, error: true });
  }
};
