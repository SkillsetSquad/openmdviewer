import { basePath } from "./types";
import type { SiteExportInput, SiteExportResult } from "./site-export";
export function exportSiteInWorker(
  input: SiteExportInput,
  signal: AbortSignal,
  progress: (message: string) => void,
) {
  return new Promise<SiteExportResult>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Website export canceled.", "AbortError"));
      return;
    }
    if (typeof Worker === "undefined") {
      reject(
        new Error("This browser cannot run the local website export worker."),
      );
      return;
    }
    const worker = new Worker(`${basePath}/site-worker.js`);
    let timer: ReturnType<typeof setTimeout>,
      started: number | null = null;
    const cleanup = () => {
      clearTimeout(timer);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      signal.removeEventListener("abort", cancel);
    };
    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cancel = () =>
      fail(new DOMException("Website export canceled.", "AbortError"));
    const timeout = () =>
      fail(
        new Error(
          "Website export exceeded its 120-second processing limit. Export a smaller workspace.",
        ),
      );
    signal.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(
      () =>
        fail(
          new Error(
            "The website export worker did not start within 10 seconds. Retry after the app finishes caching.",
          ),
        ),
      10000,
    );
    worker.onerror = () =>
      fail(
        new Error(
          "The website export worker stopped. Browser documents are unchanged.",
        ),
      );
    worker.onmessageerror = () =>
      fail(new Error("The website export result could not be read."));
    worker.onmessage = (event) => {
      if (event.data.type === "ready") {
        if (started !== null) return;
        clearTimeout(timer);
        started = performance.now();
        timer = setTimeout(timeout, 120000);
        try {
          worker.postMessage(input);
        } catch {
          fail(
            new Error(
              "The workspace could not be sent to the website exporter.",
            ),
          );
        }
      } else if (event.data.type === "progress") progress(event.data.message);
      else if (event.data.type === "error") fail(new Error(event.data.message));
      else if (event.data.type === "result") {
        if (started === null || performance.now() - started > 120000) {
          timeout();
          return;
        }
        cleanup();
        resolve(event.data.result);
      }
    };
  });
}
