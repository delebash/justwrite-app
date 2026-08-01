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

  // ── external feed (arm + apply) — the catalog's fed-task path (2026-07-21): the SAME machine
  //    QuickSetup self-drives, driven instead by useRunnerModels' ONE /models poll. ──
  it("arm() shows a running bar with no poll of its own; apply() advances then terminates it", () => {
    const fetch = vi.fn(async () => ({}));
    const task = mkTask({ fetch, friendly: (d) => d || "Working" });
    task.arm("Getting ready");
    expect(task.state).toBe("running");
    expect(fetch).not.toHaveBeenCalled();          // no self-poll — the singleton feeds it
    task.apply({ detail: "model weights", done: 5 * MB, total: 10 * MB, status: "downloading" });
    expect(task.done).toBe(5 * MB);
    expect(task.total).toBe(10 * MB);
    task.apply({ terminal: "done" });
    expect(task.state).toBe("done");
  });

  it("apply() no-ops once not running — a cancelled bar stays FROZEN (the moving-bar bug's fix)", async () => {
    const task = mkTask({ cancel: async () => {} });
    task.arm("Getting ready");
    task.apply({ done: 3 * MB, total: 10 * MB, status: "downloading" });
    await task.cancel();                            // → cancelled (flips state first)
    task.apply({ done: 9 * MB, total: 10 * MB, status: "downloading" }); // a late poll arrives
    expect(task.state).toBe("cancelled");
    expect(task.done).toBe(3 * MB);                 // frozen — NOT advanced to 9 MB
  });

  it("finalizing defaults false and arm/reset clear it (the Retry-during-teardown gate)", () => {
    const task = mkTask();
    expect(task.finalizing).toBe(false);            // DownloadBar reads this to disable Retry
    task.arm("Getting ready");
    task.finalizing = true;                         // the catalog sets this on a cancel it owns
    task.reset();
    expect(task.finalizing).toBe(false);            // reset (teardown complete) re-enables Retry
  });
});

// The promoted channel read-mappers (2026-07-18 — QuickSetup's inline defs became
// shared factories so LuBookSearchSetup rides the same channels; a copy is how
// drift starts). Pure mappers — pin the terminal decisions.
import {
  engineInstallChannel, modelDownloadChannel, modelLoadChannel,
  readDownloadStatus, readEngineStatus, readLoadStatus,
} from "@delebash/llm-ui/composables/useDownloadTask.js";

describe("shared channel read-mappers", () => {
  it("engine: installed → done; error → error; else progress", () => {
    expect(readEngineStatus({ installed: true }).terminal).toBe("done");
    expect(readEngineStatus({ status: "installed" }).terminal).toBe("done");
    expect(readEngineStatus({ status: "error", error: "boom" })).toEqual({ terminal: "error", error: "boom" });
    expect(readEngineStatus({ status: "downloading", downloaded: 1, total: 2 }).terminal).toBeUndefined();
  });
  it("load: running → done; engine-not-installed → friendly error", () => {
    expect(readLoadStatus({ status: "running" }).terminal).toBe("done");
    expect(readLoadStatus({ status: "error", error: "engine-not-installed" }).error).toMatch(/isn't installed/);
    expect(readLoadStatus({ status: "loading", downloaded: 5 }).terminal).toBeUndefined();
  });
  it("download: idle is the FINISHED terminal; error carries through", () => {
    expect(readDownloadStatus({ status: "idle" }).terminal).toBe("done");
    expect(readDownloadStatus({ status: "error", error: "404" })).toEqual({ terminal: "error", error: "404" });
    expect(readDownloadStatus({ status: "downloading", downloaded: 9, total: 10 }).terminal).toBeUndefined();
  });
  it("factories wire the model channels through the live getId thunk", () => {
    let id = "m1";
    const dl = modelDownloadChannel(() => id);
    const load = modelLoadChannel(() => id);
    expect(dl.statusUrl).toBe("/v1/llm-runner/download/status");
    expect(load.statusUrl).toBe("/v1/llm-runner/status");
    expect(engineInstallChannel().statusUrl).toBe("/v1/llm-runner/engine/status");
    expect(typeof dl.start).toBe("function"); // start reads `id` at CALL time (thunk)
  });

  it("modelDownloadChannel.read extracts THIS model's entry from the per-model map", () => {
    // Downloads are concurrent now: /download/status is {downloads: {modelId: {...}}}, so the
    // channel's read must pluck its own id's entry. Absent == finished == the done terminal.
    const dl = modelDownloadChannel(() => "m1");
    expect(dl.read({ downloads: { m1: { status: "downloading", downloaded: 3, total: 9 } } }))
      .toMatchObject({ done: 3, total: 9, status: "downloading" });
    expect(dl.read({ downloads: { other: { status: "downloading" } } }).terminal).toBe("done");
    expect(dl.read({ downloads: {} }).terminal).toBe("done");   // absent → idle → done
    expect(dl.read({ downloads: { m1: { status: "error", error: "boom" } } }))
      .toEqual({ terminal: "error", error: "boom" });
  });
});
