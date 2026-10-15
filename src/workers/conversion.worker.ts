/// <reference lib="webworker" />
import { convertImport } from "../lib/convert-import";
import {
  ConversionPasswordError,
  type ConversionInput,
} from "../lib/conversion-types";
const scope = self as unknown as DedicatedWorkerGlobalScope;
// One isolated worker per preview; the client terminates it on cancel, timeout or completion.
scope.onmessage = async (
  event: MessageEvent<{ inputs: ConversionInput[] }>,
) => {
  try {
    scope.postMessage({
      type: "result",
      result: await convertImport(event.data.inputs, (message) =>
        scope.postMessage({ type: "progress", message }),
      ),
    });
  } catch (error) {
    if (error instanceof ConversionPasswordError) {
      scope.postMessage({
        type: "password",
        sourcePath: error.sourcePath,
        incorrect: error.incorrect,
      });
      return;
    }
    scope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Conversion failed.",
    });
  }
};
scope.postMessage({ type: "ready" });
