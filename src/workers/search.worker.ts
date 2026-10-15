import { LocalSearch, type SearchDocument } from "../lib/search";
import type { SearchOptions } from "../lib/search-results";
const search = new LocalSearch();
self.onmessage = (
  event: MessageEvent<{
    type: "sync" | "search";
    changes?: SearchDocument[];
    removed?: string[];
    query?: string;
    options?: SearchOptions;
    offset?: number;
    request?: number;
    indexVersion?: number;
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
    self.postMessage({ request: event.data.request, error: true });
  }
};
