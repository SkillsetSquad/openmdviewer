/// <reference lib="webworker" />
import { exportDocx, type DocxExportInput } from "../lib/docx-export";
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async (event: MessageEvent<DocxExportInput>) => {
  try {
    const result = await exportDocx(event.data, (message) =>
      scope.postMessage({ type: "progress", message }),
    );
    scope.postMessage({ type: "result", result }, [
      result.bytes.buffer as ArrayBuffer,
    ]);
  } catch (error) {
    scope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "DOCX export failed.",
    });
  }
};
scope.postMessage({ type: "ready" });
