/// <reference lib="webworker" />
import { exportSite, type SiteExportInput } from "../lib/site-export";
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async (event: MessageEvent<SiteExportInput>) => {
  try {
    const result = await exportSite(event.data, (message) =>
      scope.postMessage({ type: "progress", message }),
    );
    scope.postMessage({ type: "result", result }, [
      result.bytes.buffer as ArrayBuffer,
    ]);
  } catch (error) {
    scope.postMessage({
      type: "error",
      message:
        error instanceof Error ? error.message : "Website export failed.",
    });
  }
};
scope.postMessage({ type: "ready" });
