import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convertInWorker } from "../src/lib/conversion-client";
class ControlledWorker {
  static latest: ControlledWorker;
  onmessage: ((event: { data: Record<string, unknown> }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    ControlledWorker.latest = this;
  }
  emit(data: Record<string, unknown>) {
    this.onmessage?.({ data });
  }
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("Worker", ControlledWorker);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("cancels an active conversion and terminates its worker without resolving a preview", async () => {
  const abort = new AbortController(),
    result = convertInWorker([], abort.signal, () => {});
  const worker = ControlledWorker.latest;
  worker.emit({ type: "ready" });
  abort.abort();
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(worker.onmessage).toBeNull();
});
it("ends workers that fail to start or exceed their processing budget", async () => {
  const startup = convertInWorker([], new AbortController().signal, () => {}),
    worker = ControlledWorker.latest;
  const rejected = expect(startup).rejects.toThrow("could not start");
  await vi.advanceTimersByTimeAsync(10000);
  await rejected;
  expect(worker.terminate).toHaveBeenCalledOnce();
  const running = convertInWorker([], new AbortController().signal, () => {}),
    second = ControlledWorker.latest;
  second.emit({ type: "ready" });
  const expired = expect(running).rejects.toThrow("45-second");
  await vi.advanceTimersByTimeAsync(45000);
  await expired;
  expect(second.terminate).toHaveBeenCalledOnce();
});
it("rejects a late result even before a throttled timeout callback executes", async () => {
  vi.spyOn(performance, "now").mockReturnValue(0);
  const result = convertInWorker([], new AbortController().signal, () => {}),
    worker = ControlledWorker.latest;
  worker.emit({ type: "ready" });
  vi.mocked(performance.now).mockReturnValue(46000);
  worker.emit({
    type: "result",
    result: { documents: [], assets: [], reports: [] },
  });
  await expect(result).rejects.toThrow("45-second");
  expect(worker.terminate).toHaveBeenCalledOnce();
});
