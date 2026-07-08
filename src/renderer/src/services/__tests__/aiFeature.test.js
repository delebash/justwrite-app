// The kit aiFeature wrappers (moved in C3) — the load-bearing pieces a smoke
// can't pin deterministically: the null-until-done usage semantics (callers
// surface usage to the UI and must distinguish "not reported" from zero), the
// (delta, accumulatedContent) onDelta contract, the friendly error wrapping,
// and the task-registry integration (start → finish/fail → history archive).
//
// The kit modules are imported REAL via the source alias (subpath — the
// whole-kit index.js pulls .vue files the node env can't parse); only the
// toast bridge (vue-sonner) and global fetch are mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";
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
    expect(out.usage).toEqual({ promptTokens: 0, completionTokens: 0 });
  });

  it("returns the real counts from the done frame", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      streamResponse([{ delta: "hi" }, { done: true, promptTokens: 5, completionTokens: 7 }, "[DONE]"])));
    const out = await runAiFeatureStream({ action: "chat" });
    expect(out.usage).toEqual({ promptTokens: 5, completionTokens: 7 });
  });
});

describe("runAiFeatureStream — onDelta + task registry", () => {
  it("fires onDelta(delta, accumulatedContent) per chunk", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse([{ delta: "a" }, { delta: "b" }, "[DONE]"])));
    const calls = [];
    await runAiFeatureStream({ action: "chat", onDelta: (d, c) => calls.push([d, c]) });
    expect(calls).toEqual([["a", "a"], ["b", "ab"]]);
  });

  it("task: true registers, streams, finishes into history with tokens + a toast", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      streamResponse([{ delta: "out" }, { done: true, promptTokens: 3, completionTokens: 7 }, "[DONE]"])));
    const tasks = useAiTasksStore();
    await runAiFeatureStream({ action: "critique", task: { label: "Critique" } });
    expect(tasks.runningCount).toBe(0);
    expect(tasks.history).toHaveLength(1);
    expect(tasks.history[0]).toMatchObject({ label: "Critique", status: "done", tokensOut: 7 });
    expect(pushToast).toHaveBeenCalledTimes(1);
    expect(pushToast.mock.calls[0][0].message).toMatch(/Critique — done in/);
  });

  it("an error frame throws the friendly wrap and archives an error task", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse([{ error: "boom 500" }])));
    const tasks = useAiTasksStore();
    await expect(runAiFeatureStream({ action: "chat", task: true }))
      .rejects.toThrow(/Couldn't reach the LLM/);
    expect(tasks.runningCount).toBe(0);
    expect(tasks.history[0].status).toBe("error");
  });
});

describe("runAiFeature (non-stream)", () => {
  it("POSTs /v1/ai/run and returns { content, model } + usage passthrough", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ content: "result", model: "m1", promptTokens: 3, completionTokens: 7, cost: 0.01 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await runAiFeature({ action: "critique", variables: { a: 1 } });
    // Usage/cost ride along for callers that display them (the Lab readout, #36);
    // { content, model } destructuring keeps working for every prior caller.
    expect(out).toEqual({ content: "result", model: "m1", promptTokens: 3, completionTokens: 7, cost: 0.01 });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/v1/ai/run");
    // Lab-only overrides are absent unless set — the body stays minimal.
    expect(JSON.parse(opts.body)).toEqual({ action: "critique", variables: { a: 1 } });
  });

  it("wraps an HTTP failure via friendlyAiError (status hint surfaced)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ detail: "nope" }, { status: 429 })));
    await expect(runAiFeature({ action: "critique" }))
      .rejects.toThrow(/Rate-limited/);
  });
});
