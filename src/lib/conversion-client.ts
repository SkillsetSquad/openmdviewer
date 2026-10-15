import { basePath } from "./types";
import type { ConversionInput, ConversionResult } from "./conversion-types";
export function convertInWorker(
  inputs: ConversionInput[],
  signal: AbortSignal,
  progress: (message: string) => void,
) {
  return new Promise<ConversionResult>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Conversion canceled.", "AbortError"));
      return;
    }
    if (typeof Worker === "undefined") {
      reject(
        new Error(
          "This browser cannot run document conversion workers. Import Markdown/text instead.",
        ),
      );
      return;
    }
    const worker = new Worker(`${basePath}/conversion-worker.js`);
    let timer: ReturnType<typeof setTimeout>;
    let startedAt = 0;
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
      fail(new DOMException("Conversion canceled.", "AbortError"));
    signal.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(
      () =>
        fail(
          new Error(
            "The converter could not start within 10 seconds. Try again after the app finishes caching.",
          ),
        ),
      10000,
    );
    worker.onerror = () =>
      fail(
        new Error(
          "The conversion worker stopped. The source files and browser documents are unchanged.",
        ),
      );
    worker.onmessageerror = () =>
      fail(
        new Error(
          "The conversion result could not be read. Try a smaller document.",
        ),
      );
    worker.onmessage = (event) => {
      if (event.data.type === "ready") {
        clearTimeout(timer);
        startedAt = performance.now();
        timer = setTimeout(
          () =>
            fail(
              new Error(
                "Conversion exceeded its 45-second processing limit. Try a smaller document.",
              ),
            ),
          45000,
        );
        try {
          worker.postMessage({ inputs });
        } catch {
          fail(
            new Error("The selected files could not be sent to the converter."),
          );
        }
      } else if (event.data.type === "progress") progress(event.data.message);
      else if (event.data.type === "result") {
        if (performance.now() - startedAt > 45000) {
          fail(
            new Error(
              "Conversion exceeded its 45-second processing limit. Try a smaller document.",
            ),
          );
          return;
        }
        cleanup();
        resolve(event.data.result);
      } else if (event.data.type === "error")
        fail(new Error(event.data.message));
    };
  });
}
