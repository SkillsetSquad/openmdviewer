import {
  graphIndex,
  graphView,
  type GraphFilter,
  type GraphIndex,
} from "../lib/graph";
import type { WorkspaceNavigation } from "../lib/references";
let index: GraphIndex | undefined;
self.onmessage = (
  event: MessageEvent<{
    navigation?: WorkspaceNavigation;
    filter: GraphFilter;
    request: number;
  }>,
) => {
  const { navigation, filter, request } = event.data;
  try {
    if (navigation) index = graphIndex(navigation);
    if (!index) throw new Error("The workspace graph is not indexed yet.");
    self.postMessage({ request, view: graphView(index, filter) });
  } catch {
    self.postMessage({
      request,
      error: "The local graph could not finish. Close it and try again.",
    });
  }
};
