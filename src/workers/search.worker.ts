import { LocalSearch, type SearchDocument } from "../lib/search";
const search = new LocalSearch();
self.onmessage = (
  event: MessageEvent<{
    type: "sync" | "search";
    changes?: SearchDocument[];
    removed?: string[];
    query?: string;
    request?: number;
  }>,
) => {
  try {
    if (event.data.type === "sync")
      search.sync(event.data.changes || [], event.data.removed || []);
    else
      self.postMessage({
        request: event.data.request,
        ids: search.search(event.data.query || ""),
      });
  } catch {
    self.postMessage({ request: event.data.request, error: true });
  }
};
