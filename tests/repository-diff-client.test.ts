import { afterEach, expect, it, vi } from "vitest";
import { repositoryDiffInWorker } from "../src/lib/repositories/diff-client";
class LocalWorker {
  static latest: LocalWorker;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor(readonly url: string) {
    LocalWorker.latest = this;
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("uses the self-hosted worker and terminates it after a result", async () => {
  vi.stubGlobal("Worker", LocalWorker);
  const result = { rows: [], added: 0, removed: 0, identical: true };
  const pending = repositoryDiffInWorker(
    "same",
    "same",
    new AbortController().signal,
  );
  const worker = LocalWorker.latest;
  expect(worker.url).toMatch(/\/repository-diff-worker.js$/);
  expect(worker.postMessage).toHaveBeenCalledWith({
    before: "same",
    after: "same",
  });
  worker.onmessage?.({ data: { type: "result", result } });
  await expect(pending).resolves.toEqual(result);
  expect(worker.terminate).toHaveBeenCalledOnce();
});
it("terminates canceled and timed-out work without returning a diff", async () => {
  vi.stubGlobal("Worker", LocalWorker);
  const controller = new AbortController();
  const canceled = repositoryDiffInWorker("old", "new", controller.signal);
  controller.abort();
  await expect(canceled).rejects.toMatchObject({ name: "AbortError" });
  expect(LocalWorker.latest.terminate).toHaveBeenCalledOnce();
  vi.useFakeTimers();
  const timed = repositoryDiffInWorker(
    "old",
    "new",
    new AbortController().signal,
  );
  const assertion = expect(timed).rejects.toThrow(/10-second/);
  await vi.advanceTimersByTimeAsync(10000);
  await assertion;
  expect(LocalWorker.latest.terminate).toHaveBeenCalledOnce();
});
it("reports worker errors and rejects pre-canceled calls before creating work", async () => {
  vi.stubGlobal("Worker", LocalWorker);
  const pending = repositoryDiffInWorker(
    "a",
    "b",
    new AbortController().signal,
  );
  LocalWorker.latest.onerror?.();
  await expect(pending).rejects.toThrow(/stopped/);
  const controller = new AbortController();
  controller.abort();
  await expect(
    repositoryDiffInWorker("a", "b", controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
});
