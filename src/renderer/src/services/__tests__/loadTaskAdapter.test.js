// T3 (2026-07-17 approved plan) — the ONE load/unload/download control's data layer.
//
// taskFor(modelId) is the per-model task-shaped projection over the useRunnerModels
// singleton that DownloadBar renders on the catalog's slot cards and drives the rows'
// compact bars. These pin its contract: per-model gating from the model's OWN row
// status (the first plan's killer was gating on the single-channel loadingId), channel
// choice (standalone download ↔ spawn-load), the friendly vocabulary, the
// stopping-has-no-cancel rule (DownloadBar's Cancel renders only when task.cancel
// exists), and the no-local-PHASE_WORDS source pin on QuickSetup.
//
// The kit modules are imported REAL (subpath alias); fetch is stubbed so refresh()
// populates the singleton with a crafted /v1/llm-runner/models body.
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  refresh, taskFor, loadProgress,
} from "@delebash/llm-ui/composables/useRunnerModels.js";
import { PHASE_WORDS, friendlyPhase } from "@delebash/llm-ui/common/services/loadPhases.js";

function jsonOk(obj) {
  return {
    ok: true, status: 200,
    headers: { get: (k) => (k.toLowerCase() === "content-type" ? "application/json" : "") },
    json: async () => obj,
    text: async () => JSON.stringify(obj),
  };
}

let modelsBody;
let statusBody;

beforeEach(() => {
  modelsBody = { models: [], vramMb: 8192 };
  statusBody = { status: "idle" };
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    const u = String(url);
    if (u.includes("/v1/llm-runner/models")) return jsonOk(modelsBody);
    if (u.includes("/v1/llm-runner/download/status")) return jsonOk({ status: "idle" });
    if (u.includes("/v1/llm-runner/status")) return jsonOk(statusBody);
    return jsonOk({});
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const row = (id, status) => ({ id, name: id, tier: "mid", fit: "ok", status, downloaded: true });

describe("taskFor — the per-model task projection", () => {
  it("is idle (state '') for loaded/disk models — the card shows its pill, no bar", async () => {
    modelsBody.models = [row("a", "loaded"), row("b", "disk")];
    await refresh();
    expect(taskFor("a").state).toBe("");
    expect(taskFor("b").state).toBe("");
  });

  it("a LOADING model is running with the load channel's bytes + friendly words, cancel wired", async () => {
    modelsBody.models = [row("a", "loading"), row("b", "disk")];
    statusBody = { status: "downloading", modelId: "a", detail: "model weights", downloaded: 512, total: 2048 };
    await refresh();
    const t = taskFor("a");
    expect(t.state).toBe("running");
    expect(t.done).toBe(512);
    expect(t.total).toBe(2048);
    expect(t.label).toContain("Downloading the model");   // QuickSetup's words, not "model weights"
    expect(typeof t.cancel).toBe("function");
    // Per-model gating: the OTHER model shows nothing (the loadingId-gating bug's pin).
    expect(taskFor("b").state).toBe("");
  });

  it("T1's neutral phase reads 'Getting ready', never a download announcement", async () => {
    modelsBody.models = [row("a", "loading")];
    statusBody = { status: "downloading", modelId: "a", detail: "preparing", downloaded: 0, total: 0 };
    await refresh();
    expect(taskFor("a").label).toContain("Getting ready");
    expect(taskFor("a").label).not.toContain("Downloading the model");
  });

  it("a STOPPING model is running with 'Unloading…' and NO cancel (an unload isn't cancellable)", async () => {
    modelsBody.models = [row("a", "stopping")];
    await refresh();
    const t = taskFor("a");
    expect(t.state).toBe("running");
    expect(t.label).toBe("Unloading…");
    expect(t.cancel).toBeUndefined();   // DownloadBar's Cancel gates on task.cancel
  });

  it("an ERROR row is state error with a retry", async () => {
    modelsBody.models = [row("a", "error")];
    statusBody = { status: "error", modelId: "a", error: "spawn refused" };
    await refresh();
    const t = taskFor("a");
    expect(t.state).toBe("error");
    expect(typeof t.retry).toBe("function");
  });
});

describe("the ONE vocabulary (loadPhases.js)", () => {
  it("maps every runner detail to the QuickSetup wording, and statuses fall through", () => {
    expect(friendlyPhase("model weights")).toBe("Downloading the model");
    expect(friendlyPhase("loading into VRAM")).toBe("Loading it into your graphics card");
    expect(friendlyPhase("preparing")).toBe("Getting ready");
    expect(friendlyPhase("", "stopping")).toBe("Unloading…");   // T2b: empty detail + status
    expect(friendlyPhase("", "starting")).toBe("Starting the engine");
    expect(PHASE_WORDS.stopping).toBe("Unloading…");
  });

  it("SOURCE PIN: QuickSetup rides the shared vocabulary — no local copy regrows", () => {
    // The chipPopoverStacking.test.js precedent: read the kit source, assert the shape.
    // Since the channel-factory promotion (2026-07-18) QuickSetup consumes the
    // vocabulary INDIRECTLY: it imports the factories from useDownloadTask.js,
    // which is the one module that imports loadPhases.js.
    const HERE = dirname(fileURLToPath(import.meta.url));
    const KIT = resolve(HERE, "../../../../../../just-llm-runner/ui/src");
    const qs = readFileSync(resolve(KIT, "views/QuickSetup.vue"), "utf8");
    expect(qs).not.toMatch(/const\s+PHASE_WORDS/);
    expect(qs).not.toMatch(/function\s+friendlyPhase/);
    expect(qs).toContain('from "../composables/useDownloadTask.js"');
    const dt = readFileSync(resolve(KIT, "composables/useDownloadTask.js"), "utf8");
    expect(dt).toContain('from "../common/services/loadPhases.js"');
  });
});
