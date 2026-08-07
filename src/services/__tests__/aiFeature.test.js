// The kit aiFeature wrappers (moved in C3) — the load-bearing pieces a smoke
// can't pin deterministically: the null-until-done usage semantics (callers
// surface usage to the UI and must distinguish "not reported" from zero), the
// (delta, accumulatedContent) onDelta contract, the friendly error wrapping,
// the task-registry integration (start → finish/fail → history archive), and
// — §7.4 B6 — runAiFeature's stream-under-the-hood transport with its
// automatic /run fallback (zero-frames transport errors ONLY: never an
// in-stream {error} frame, never an abort, never after frames arrived).
//
// The kit modules are imported REAL via the source alias (subpath — the
// whole-kit index.js pulls .vue files the node env can't parse); only the
// toast bridge (vue-sonner) and global fetch are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("@delebash/llm-ui/common/services/toastBridge.js", () => ({
  pushToast: vi.fn(),
  clearToasts: vi.fn(),
}));

import { pushToast } from "@delebash/llm-ui/common/services/toastBridge.js";
import { runAiFeature, runAiFeatureStream } from "@delebash/llm-ui/services/aiFeature.js";
import { useAiTasksStore } from "@delebash/llm-ui/stores/aiTasks.js";

// One-chunk SSE body: the client splits frames on \n\n, so a single read
// carrying every frame exercises the same parse path as a live stream.
function sseBody(frames) {
  const text = frames.map((f) => `data: ${typeof f === "string" ? f : JSON.stringify(f)}\n\n`).join("");
  const bytes = new TextEncoder().encode(text);
  let drained = false;
  return {
    getReader: () => ({
      read: async () => {
        if (drained) return { done: true, value: undefined };
        drained = true;
        return { done: false, value: bytes };
      },
    }),
  };
}

function streamResponse(frames) {
  return { ok: true, status: 200, body: sseBody(frames), text: async () => "" };
}

function jsonResponse(obj, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => (k.toLowerCase() === "content-type" ? "application/json" : "") },
    json: async () => obj,
    text: async () => JSON.stringify(obj),
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

// FAMILY_TASK_LINGER (2026-08-07): a settled task now LINGERS before archiving —
// completed 5 s, failed until dismissed. These tests run REAL timers, so without
// this teardown every task a test settles leaves a pending 5 s archive timeout (or
// a forever-lingering failure) firing into a store the next test already replaced.
afterEach(() => {
  const tasks = useAiTasksStore();
  for (const t of [...tasks.visibleTasks]) tasks.dismiss(t.id);
});

describe("runAiFeatureStream — usage semantics (null-until-done)", () => {
  it("returns usage: null when the stream ends without a done frame", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse([{ delta: "a" }, { delta: "b" }, "[DONE]"])));
    const out = await runAiFeatureStream({ action: "chat" });
    expect(out.content).toBe("ab");
    expect(out.usage).toBeNull();
  });

  it("returns a truthy zeros usage when a done frame arrives WITHOUT counts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse([{ delta: "x" }, { done: true }, "[DONE]"])));
    const out = await runAiFeatureStream({ action: "chat" });
    expect(out.usage).toEqual({ promptTokens: 0, completionTokens: 0, model: "", cost: 0 });
  });

  it("returns the counts + model + cost from the done frame (§7.4 — the stream carries everything /run carries)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      streamResponse([{ delta: "hi" }, { done: true, promptTokens: 5, completionTokens: 7, model: "m1", cost: 0.02 }, "[DONE]"])));
    const out = await runAiFeatureStream({ action: "chat" });
    expect(out.usage).toEqual({ promptTokens: 5, completionTokens: 7, model: "m1", cost: 0.02 });
    // The RESOLVED model from the done frame is the return's model too.
    expect(out.model).toBe("m1");
  });

  it("forwards the ask-params the one-shot wrapper takes (§7.4 — the wrappers no longer diverge)", async () => {
    const fetchMock = vi.fn(async () => streamResponse([{ done: true }, "[DONE]"]));
    vi.stubGlobal("fetch", fetchMock);
    await runAiFeatureStream({
      action: "chat", providerId: "p1", topP: 0.9, jsonMode: true,
      reasoningEffort: "high", samplers: [{ flagName: "top_k", flagValue: "40" }],
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      action: "chat", variables: {}, providerId: "p1", topP: 0.9, jsonMode: true,
      reasoningEffort: "high", samplers: [{ flagName: "top_k", flagValue: "40" }],
    });
  });
});

describe("runAiFeatureStream — onDelta + task registry", () => {
  it("fires onDelta(delta, accumulatedContent) per chunk", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse([{ delta: "a" }, { delta: "b" }, "[DONE]"])));
    const calls = [];
    await runAiFeatureStream({ action: "chat", onDelta: (d, c) => calls.push([d, c]) });
    expect(calls).toEqual([["a", "a"], ["b", "ab"]]);
  });

  it("task: true registers, streams, finishes into history — with NO toast (QC-30, the toast law)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      streamResponse([{ delta: "out" }, { done: true, promptTokens: 3, completionTokens: 7 }, "[DONE]"])));
    const tasks = useAiTasksStore();
    await runAiFeatureStream({ action: "critique", task: { label: "Critique" } });
    expect(tasks.runningCount).toBe(0);
    // FAMILY_TASK_LINGER: the settled task lingers (completed: 5 s) before archiving,
    // so it is read HERE, not in history. The QC-30 intent below is unchanged.
    expect(tasks.visibleTasks).toHaveLength(1);
    expect(tasks.visibleTasks[0]).toMatchObject({ label: "Critique", status: "done", tokensOut: 7 });
    // The strip + the panel are THE outcome surfaces; completions never toast.
    expect(pushToast).not.toHaveBeenCalled();
  });

  it("an error frame throws the friendly wrap, archives an error task, and badges durably — no failure toast (QC-37)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse([{ error: "boom 500" }])));
    const tasks = useAiTasksStore();
    await expect(runAiFeatureStream({ action: "chat", task: true }))
      .rejects.toThrow(/Couldn't reach the LLM/);
    expect(tasks.runningCount).toBe(0);
    // Failed stays visible until dismissed (FAMILY_TASK_LINGER.failed = null) —
    // the durable-error row itself, on top of the badge asserted below.
    expect(tasks.visibleTasks[0].status).toBe("error");
    expect(pushToast).not.toHaveBeenCalled();
    // Failure signals DURABLY: the titlebar chip badge holds until the panel
    // is opened (viewing acknowledges).
    expect(tasks.unseenErrors).toBe(1);
    tasks.openPanel();
    expect(tasks.unseenErrors).toBe(0);
  });

  it("togglePanel clears the durable error badge on OPEN (the chip + sidebar path — checker-caught)", async () => {
    // The titlebar chip AND the sidebar item open via togglePanel, NOT
    // openPanel — a per-place `panelOpen = true` left the red badge stuck.
    const tasks = useAiTasksStore();
    tasks.unseenErrors = 3;
    tasks.panelOpen = false;
    tasks.togglePanel();                 // opens
    expect(tasks.panelOpen).toBe(true);
    expect(tasks.unseenErrors).toBe(0);  // cleared on open, not just via openPanel
    tasks.togglePanel();                 // closes — no spurious re-clear needed
    expect(tasks.panelOpen).toBe(false);
  });

  it("a batch owner reports n/m through the handle; one cancel aborts the shared signal (QC-31)", async () => {
    const tasks = useAiTasksStore();
    const handle = tasks.start({ feature: "readerKnowledge", label: "Reader knowledge" });
    handle.setProgress(3, 13);
    expect(tasks.taskById(handle.id).progress).toEqual({ done: 3, total: 13 });
    let aborted = false;
    handle.signal.addEventListener("abort", () => { aborted = true; });
    tasks.cancel(handle.id);
    expect(aborted).toBe(true);
    expect(tasks.runningCount).toBe(0);
    expect(tasks.visibleTasks[0].status).toBe("cancelled"); // lingers 3 s before history
  });
});

// A body whose reader yields one chunk of frames, then dies with a transport
// error — the "connection dropped mid-stream" shape for the fallback matrix.
function dyingBody(frames) {
  const text = frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join("");
  const bytes = new TextEncoder().encode(text);
  let step = 0;
  return {
    getReader: () => ({
      read: async () => {
        if (step++ === 0) return { done: false, value: bytes };
        throw new TypeError("network error");
      },
    }),
  };
}

describe("runAiFeature — streams under the hood (§7.4 B6-1)", () => {
  it("POSTs /v1/ai/stream ONCE and returns the /run-shaped contract from the done frame", async () => {
    const fetchMock = vi.fn(async () => streamResponse([
      { delta: "res" }, { delta: "ult" },
      { done: true, promptTokens: 3, completionTokens: 7, model: "m1", cost: 0.01 },
      "[DONE]",
    ]));
    vi.stubGlobal("fetch", fetchMock);
    const out = await runAiFeature({ action: "critique", variables: { a: 1 } });
    // The exact pre-B6 call-site contract — every prior caller keeps working.
    expect(out).toEqual({ content: "result", model: "m1", promptTokens: 3, completionTokens: 7, cost: 0.01 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/v1/ai/stream");
    // Lab-only overrides are absent unless set — the body stays minimal.
    expect(JSON.parse(opts.body)).toEqual({ action: "critique", variables: { a: 1 } });
  });

  it("sends the FULL ask-param body to the stream endpoint", async () => {
    const fetchMock = vi.fn(async () => streamResponse([{ done: true }, "[DONE]"]));
    vi.stubGlobal("fetch", fetchMock);
    await runAiFeature({
      action: "critique", providerId: "p1", model: "m2", temperature: 0.2, topP: 0.9,
      jsonMode: true, reasoningEffort: "low", think: false, maxTokens: 512,
      samplers: [{ flagName: "top_k", flagValue: "40" }],
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      action: "critique", variables: {}, providerId: "p1", model: "m2",
      temperature: 0.2, topP: 0.9, jsonMode: true, reasoningEffort: "low",
      think: false, maxTokens: 512, samplers: [{ flagName: "top_k", flagValue: "40" }],
    });
  });

  it("falls back ONCE to /v1/ai/run on a pre-stream HTTP error (zero frames)", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, body: null, text: async () => "unavailable" })
      .mockResolvedValueOnce(jsonResponse({ content: "result", model: "m1", promptTokens: 3, completionTokens: 7, cost: 0.01 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await runAiFeature({ action: "critique" });
    expect(out).toEqual({ content: "result", model: "m1", promptTokens: 3, completionTokens: 7, cost: 0.01 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/v1/ai/stream");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/v1/ai/run");
  });

  it("falls back on a network TypeError (fetch never connected)", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse({ content: "ok", model: "m1" }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await runAiFeature({ action: "critique" });
    expect(out.content).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT fall back on an in-stream {error} frame — a provider error is identical on both paths", async () => {
    const fetchMock = vi.fn(async () => streamResponse([{ error: "boom 500" }]));
    vi.stubGlobal("fetch", fetchMock);
    await expect(runAiFeature({ action: "critique" })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT fall back on abort", async () => {
    const fetchMock = vi.fn(async () => {
      const e = new Error("The user aborted a request.");
      e.name = "AbortError";
      throw e;
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(runAiFeature({ action: "critique" })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT fall back once frames have arrived (mid-stream drop ≠ retry — tokens were already spent)", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, body: dyingBody([{ delta: "part" }]), text: async () => "" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(runAiFeature({ action: "critique" })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("wraps an HTTP failure via friendlyAiError when the fallback fails too (status hint surfaced)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ detail: "nope" }, { status: 429 })));
    await expect(runAiFeature({ action: "critique" }))
      .rejects.toThrow(/Rate-limited/);
  });
});

describe("prefill — prompt-eval progress (§7.4 B6-2)", () => {
  it("a {progress} frame reaches the task as prefill; the first delta clears it", async () => {
    const tasks = useAiTasksStore();
    const handle = tasks.start({ feature: "critique", label: "Critique" });
    handle.setPrefill(0.4);
    expect(tasks.taskById(handle.id).prefill).toBe(0.4);
    // Generation started — prefill is over.
    handle.onDelta("tok", "tok");
    expect(tasks.taskById(handle.id).prefill).toBeNull();
    // Straggler progress frames after the first token are ignored.
    handle.setPrefill(0.9);
    expect(tasks.taskById(handle.id).prefill).toBeNull();
    tasks.cancel(handle.id);
  });

  it("requestStream routes {progress} frames to onProgress, not onDelta", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse([
      { progress: 0.25 }, { progress: 1 }, { delta: "x" }, { done: true }, "[DONE]",
    ])));
    const { requestStream } = await import("@delebash/llm-ui/client.js");
    const deltas = [];
    const progresses = [];
    await requestStream("/v1/ai/stream", { action: "chat" },
      (d) => deltas.push(d), { onProgress: (p) => progresses.push(p) });
    expect(progresses).toEqual([0.25, 1]);
    expect(deltas).toEqual(["x"]);
  });
});
