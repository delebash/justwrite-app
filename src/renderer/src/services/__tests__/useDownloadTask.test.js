// The KIT createDownloadTask (2026-07-15, the ONE-DOWNLOADER consolidation) — the ONE
// download-task orchestrator behind QuickSetup's three bars + the engine/model bars. Pure
// state machine: the channel's start/cancel/fetch are injected (no network), so these pin the
// transitions the checker demanded — done / error / cancel(flips-first) / retry / the running
// poll feeding the shared progressCaption label. Imported REAL via the source alias.
import { describe, expect, it, vi } from "vitest";
import { watch } from "vue";

import { createDownloadTask } from "@delebash/llm-ui/composables/useDownloadTask.js";

const MB = 1024 * 1024;
const noop = async () => {};

function mkTask(overrides = {}) {
  return createDownloadTask({
    start: noop,
    statusUrl: "x",
    read: () => ({}),
    cancel: noop,
    fetch: async () => ({}),
    ...overrides,
  });
}

describe("createDownloadTask", () => {
  it("reaches done on a terminal:done read", async () => {
    const task = mkTask({ read: () => ({ terminal: "done" }) });
    await task.start();
    expect(task.state).toBe("done");
    expect(task.phase).toBe("Ready");
  });

  it("surfaces the server error on a terminal:error read", async () => {
    const task = mkTask({ read: () => ({ terminal: "error", error: "the model failed" }) });
    await task.start();
    expect(task.state).toBe("error");
    expect(task.error).toBe("the model failed");
  });

  it("errors when start() throws (before any poll)", async () => {
    const task = mkTask({
      start: async () => { throw new Error("could not POST"); },
      read: () => ({ terminal: "done" }),
    });
    await task.start();
    expect(task.state).toBe("error");
    expect(task.error).toBe("could not POST");
  });

  it("cancel() flips state to cancelled FIRST, then calls the server cancel", async () => {
    const cancelSpy = vi.fn(async () => {});
    // A read that never terminates → the task stays running until cancelled.
    const task = mkTask({
      read: () => ({ detail: "model weights", done: 1, total: 10, status: "downloading" }),
      cancel: cancelSpy,
      pollMs: 5,
    });
    const running = task.start(); // _arm sets state="running" synchronously
    await task.cancel();
    expect(task.state).toBe("cancelled");
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    await running; // the poll loop exits at its next state check
    expect(task.state).toBe("cancelled");
  });

  it("cancel() is a no-op when the task is not running", async () => {
    const cancelSpy = vi.fn(async () => {});
    const task = mkTask({ read: () => ({ terminal: "done" }), cancel: cancelSpy });
    await task.start(); // → done
    await task.cancel();
    expect(cancelSpy).not.toHaveBeenCalled();
    expect(task.state).toBe("done");
  });

  it("retry() re-runs start — an error then a success reaches done", async () => {
    let attempt = 0;
    const task = mkTask({ read: () => (attempt++ === 0 ? { terminal: "error", error: "boom" } : { terminal: "done" }) });
    await task.start();
    expect(task.state).toBe("error");
    await task.retry();
    expect(task.state).toBe("done");
  });

  it("feeds a running poll's bytes into the shared progressCaption label, then reaches done", async () => {
    let i = 0;
    const fetch = async () => (i++ === 0
      ? { status: "downloading", downloaded: 50 * MB, total: 100 * MB, detail: "model weights" }
      : { status: "running" });
    const labels = [];
    const task = mkTask({
      read: (st) => (st.status === "running"
        ? { terminal: "done" }
        : { detail: st.detail, done: st.downloaded, total: st.total, status: st.status }),
      fetch,
      pollMs: 5,
      friendly: (d) => d || "Working",
    });
    watch(() => task.label, (v) => labels.push(v), { flush: "sync" });
    await task.start();
    expect(task.state).toBe("done");
    expect(labels.some((l) => l.includes("50 MB / 100 MB"))).toBe(true);
  });

  it("waiting() shows a held, indeterminate running state without polling", () => {
    const fetch = vi.fn(async () => ({}));
    const task = mkTask({ fetch });
    task.waiting("Waiting for the engine…");
    expect(task.state).toBe("running");
    expect(task.phase).toBe("Waiting for the engine…");
    expect(task.total).toBe(0); // indeterminate bar
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fail() sets an error display without a start attempt", () => {
    const startSpy = vi.fn(noop);
    const task = mkTask({ start: startSpy });
    task.fail("needs the engine");
    expect(task.state).toBe("error");
    expect(task.error).toBe("needs the engine");
    expect(startSpy).not.toHaveBeenCalled();
  });

  it("reset() returns the task to idle", async () => {
    const task = mkTask({ read: () => ({ terminal: "done" }) });
    await task.start();
    expect(task.state).toBe("done");
    task.reset();
    expect(task.state).toBe("");
    expect(task.done).toBe(0);
    expect(task.error).toBe("");
  });
});
