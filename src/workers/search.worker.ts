import { LocalSearch, type SearchDocument } from "../lib/search";
const search = new LocalSearch();
self.onmessage = (
  event: MessageEvent<{
    type: "sync" | "search";
    changes?: SearchDocument[];
    removed?: string[];
    query?: string;
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
        ids: search.search(event.data.query || ""),
      });
  } catch {
    self.postMessage({ request: event.data.request, error: true });
  }
};
