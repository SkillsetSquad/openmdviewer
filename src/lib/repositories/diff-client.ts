import { basePath } from "../types";
import type { repositoryDiff } from "./line-diff";
export function repositoryDiffInWorker(
  before: string,
  after: string,
  signal: AbortSignal,
) {
  return new Promise<ReturnType<typeof repositoryDiff>>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Comparison canceled.", "AbortError"));
      return;
    }
    if (typeof Worker === "undefined") {
      reject(new Error("This browser cannot run the local comparison worker."));
      return;
    }
    const worker = new Worker(`${basePath}/repository-diff-worker.js`);
    const cleanup = () => {
      clearTimeout(timer);
      worker.terminate();
      signal.removeEventListener("abort", cancel);
    };
    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cancel = () =>
      fail(new DOMException("Comparison canceled.", "AbortError"));
    const timer = setTimeout(
      () =>
        fail(
          new Error(
            "The comparison worker exceeded its 10-second startup/processing limit. Retry after the app finishes caching.",
          ),
        ),
      10000,
    );
    signal.addEventListener("abort", cancel, { once: true });
    worker.onerror = () =>
      fail(
        new Error(
          "The local comparison worker stopped. Documents are unchanged.",
        ),
      );
    worker.onmessageerror = () =>
      fail(new Error("The comparison result could not be read."));
    worker.onmessage = (event) => {
      if (event.data.type === "error") fail(new Error(event.data.message));
      else if (event.data.type === "result") {
        cleanup();
        resolve(event.data.result);
      }
    };
    try {
      worker.postMessage({ before, after });
    } catch {
      fail(new Error("The source could not be sent to the comparison worker."));
    }
  });
}
