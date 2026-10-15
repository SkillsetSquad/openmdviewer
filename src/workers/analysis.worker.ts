import { analyzeWorkspace } from "../lib/health";
import type { ReaderDocument } from "../lib/types";
self.onmessage = (
  event: MessageEvent<{
    documents: ReaderDocument[];
    assetPaths: string[];
    documentId?: string;
  }>,
) => {
  try {
    const report = analyzeWorkspace(
      event.data.documents,
      event.data.assetPaths,
      Date.now(),
      {
        documentId: event.data.documentId,
        progress: (phase, done, total) =>
          self.postMessage({ type: "progress", phase, done, total }),
      },
    );
    self.postMessage({ type: "result", report });
  } catch (error) {
    self.postMessage({
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "Local analysis could not finish.",
    });
  }
};
