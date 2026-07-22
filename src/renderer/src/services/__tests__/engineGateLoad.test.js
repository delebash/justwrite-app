// ONE workflow (2026-07-21, the user's ruling): every model load runs the engine check FIRST —
// detect → install-if-missing (reusing QuickSetup's engineInstallChannel task) → load. These pin
// retryLoad's new engine gate: present → straight to load; missing → install (awaiting it) then
// load; install failed → NO load + the shared `error` set. The kit module is imported REAL (alias);
// fetch is stubbed so the engine status / install / load POSTs are observable.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { retryLoad, useRunnerModels } from "@delebash/llm-ui/composables/useRunnerModels.js";

function jsonOk(obj) {
  return {
    ok: true, status: 200,
    headers: { get: (k) => (k.toLowerCase() === "content-type" ? "application/json" : "") },
    json: async () => obj,
    text: async () => JSON.stringify(obj),
  };
}

let engine;        // { installed, failOnInstall, errored, installError }
let loadPosts;     // modelIds the /load POST received, in order
let installPosts;  // how many /engine/install POSTs fired

beforeEach(() => {
  engine = { installed: true, failOnInstall: false, errored: false, installError: "" };
  loadPosts = [];
  installPosts = 0;
  vi.stubGlobal("fetch", vi.fn(async (url, opts = {}) => {
    const u = String(url);
    if (u.includes("/v1/llm-runner/engine/install")) {
      installPosts += 1;
      if (engine.failOnInstall) engine.errored = true; // the install fails → status turns error
      else engine.installed = true;                    // the install completes
      return jsonOk({ status: engine.errored ? "error" : "installing" });
    }
    if (u.includes("/v1/llm-runner/engine/status")) {
      return jsonOk(engine.errored
        ? { status: "error", error: engine.installError }
        : { installed: engine.installed, status: engine.installed ? "installed" : "idle" });
    }
    if (u.includes("/v1/llm-runner/load")) {
      loadPosts.push((opts.body ? JSON.parse(opts.body) : {}).modelId);
      return jsonOk({ status: "starting" });
    }
    if (u.includes("/v1/llm-runner/models")) return jsonOk({ models: [], vramMb: 8192 });
    if (u.includes("/download/status")) return jsonOk({ status: "idle" });
    if (u.includes("/v1/llm-runner/status")) return jsonOk({ status: "idle" });
    return jsonOk({});
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe("retryLoad — the engine check before every load (ONE workflow)", () => {
  it("engine present → loads straight away, no install", async () => {
    engine.installed = true;
    await retryLoad("m1");
    expect(installPosts).toBe(0);
    expect(loadPosts).toEqual(["m1"]);
  });

  it("engine missing → installs it (awaiting completion) THEN loads", async () => {
    engine.installed = false;
    await retryLoad("m1");
    expect(installPosts).toBe(1);        // it installed
    expect(loadPosts).toEqual(["m1"]);   // and only THEN loaded
  });

  it("engine install fails → NO load, the shared error surfaces the reason", async () => {
    engine.installed = false;
    engine.failOnInstall = true;
    engine.installError = "disk full";
    await retryLoad("m1");
    expect(installPosts).toBe(1);
    expect(loadPosts).toEqual([]);       // the load never fires on a failed install
    expect(useRunnerModels().error.value).toContain("disk full");
  });
});
