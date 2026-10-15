import { findRegex, type RegexDocument } from "../lib/regex-search";
import type { SearchOptions } from "../lib/search-results";
function evaluate(
  event: MessageEvent<{
    documents: RegexDocument[];
    query: string;
    options: SearchOptions;
    offset: number;
    error?: boolean;
  }>,
) {
  self.postMessage({ type: "ready" });
  const started = performance.now();
  try {
    if (event.data.error) throw new Error("Regex input unavailable");
    self.postMessage({
      page: findRegex(
        event.data.documents,
        event.data.query,
        event.data.options,
        event.data.offset,
      ),
      elapsed: performance.now() - started,
    });
  } catch {
    self.postMessage({
      page: {
        hits: [],
        total: 0,
        offset: 0,
        error:
          "Regular-expression search failed. Simplify the pattern or switch matching.",
      },
    });
  }
}
self.onmessage = (event: MessageEvent<{ port: MessagePort }>) => {
  const port = event.data.port;
  port.onmessage = (source) => {
    port.close();
    evaluate(source);
  };
};
