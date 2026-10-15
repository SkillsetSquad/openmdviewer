import { repositoryDiff } from "../lib/repositories/line-diff";
self.onmessage = (event: MessageEvent<{ before: string; after: string }>) => {
  try {
    if (
      typeof event.data.before !== "string" ||
      typeof event.data.after !== "string"
    )
      throw new Error("Invalid comparison input.");
    self.postMessage({
      type: "result",
      result: repositoryDiff(event.data.before, event.data.after),
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Comparison failed.",
    });
  }
};
