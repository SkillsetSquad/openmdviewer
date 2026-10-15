import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { exportDocxInWorker } from "../src/lib/docx-export-client";
class WorkerStub {
  static latest: WorkerStub;
  onmessage: ((event: { data: Record<string, unknown> }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    WorkerStub.latest = this;
  }
  emit(data: Record<string, unknown>) {
    this.onmessage?.({ data });
  }
}
const input = {
  path: "Doc.md",
  content: "# Doc",
  assets: [],
  options: {
    pageSize: "a4" as const,
    images: true,
    contents: false,
    pageNumbers: false,
  },
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("Worker", WorkerStub);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("terminates canceled DOCX work and does not return a stale DOCX", async () => {
  const abort = new AbortController(),
    result = exportDocxInWorker(input, abort.signal, () => {}),
    worker = WorkerStub.latest;
  worker.emit({ type: "ready" });
  expect(worker.postMessage).toHaveBeenCalledWith(input);
  abort.abort();
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(worker.onmessage).toBeNull();
});
it("bounds worker startup and processing, including delayed timeout delivery", async () => {
  const startup = exportDocxInWorker(
      input,
      new AbortController().signal,
      () => {},
    ),
    worker = WorkerStub.latest;
  const rejected = expect(startup).rejects.toThrow("10 seconds");
  await vi.advanceTimersByTimeAsync(10000);
  await rejected;
  expect(worker.terminate).toHaveBeenCalledOnce();
  vi.spyOn(performance, "now").mockReturnValue(0);
  const running = exportDocxInWorker(
      input,
      new AbortController().signal,
      () => {},
    ),
    second = WorkerStub.latest;
  second.emit({ type: "ready" });
  vi.mocked(performance.now).mockReturnValue(121000);
  second.emit({ type: "result", result: { bytes: new Uint8Array() } });
  await expect(running).rejects.toThrow("120-second");
  expect(second.terminate).toHaveBeenCalledOnce();
});
