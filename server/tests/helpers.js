// SPDX-License-Identifier: MIT
// Test helpers shared by JustWrite's server suites (Python's per-file `_c(tmp_path)` fixtures).
//
// HERMETICITY: createApp boots the whole kit, which mutates process singletons — the runner
// service, the seed registration, the usage ledger — and the JS installLlm also awaits
// hardware detection and registers this app's cache in the family registry.
// `useHermeticKit()` snapshots and restores those, answers detection with a fake box (no
// nvidia-smi), answers the RAM-bandwidth probe "unmeasurable", and points JUST_AI_HOME and
// the user cache at a temp folder — nothing reads or writes the real family registry.
// (Python's suite read the REAL registry; that is why one of its tests fails on this box —
// test_health's header.)
//
// `client(dataDir)` stands in for `TestClient(create_app(tmp_path))`: requests come from a
// non-loopback address (TestClient's "testclient" host — so the auth gate bites) with
// `Host: testserver` (so a same-origin `Origin: http://testserver` is the server's own).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getLlmRegistry } from "@delebash/llm-runner/llm";
import * as seed from "@delebash/llm-runner/llm/seed";
import { getLedger, setLedger } from "@delebash/llm-runner/llm/usage";
import { model } from "@delebash/llm-runner/platform/models";
import * as bandwidth from "@delebash/llm-runner/runner/bandwidth";
import * as hardware from "@delebash/llm-runner/runner/hardware";
import * as lifecycle from "@delebash/llm-runner/runner/lifecycle";
import { HardwareInfo } from "@delebash/llm-runner/runner/schema";
import { afterEach, beforeEach, vi } from "vitest";
import { createApp } from "../src/app.js";

/** pytest's `tmp_path`: a fresh temp folder. */
export const tmpPath = (prefix = "jw-test-") => mkdtempSync(join(tmpdir(), prefix));

export const fakeHw = () =>
  model(HardwareInfo, {
    os: "windows",
    platform: "windows",
    cpuCores: 8,
    ramMb: 32000,
    gpus: [{ vendor: "NVIDIA", name: "Test", vramMb: 8192 }],
    runtimes: { cuda: true },
  });

/** Register beforeEach/afterEach that keep the kit's singletons per-test. */
export function useHermeticKit() {
  let saved;
  beforeEach(() => {
    saved = {
      service: lifecycle.state.service,
      app: seed.cfg._APP,
      ledger: getLedger(),
      hw: hardware.memo.hw,
    };
    lifecycle.state.service = null;
    seed.cfg._APP = { ...seed.cfg._APP };
    const t = tmpPath("jw-kit-");
    vi.stubEnv("JUST_AI_HOME", join(t, "family"));
    vi.stubEnv("LLM_RUNNER_CACHE", join(t, "user-cache"));
    const box = fakeHw();
    hardware.setDetected(box);
    vi.spyOn(hardware, "detect").mockImplementation(async () => box);
    vi.spyOn(bandwidth, "probeRamCopyGbps").mockResolvedValue(null);
  });
  afterEach(() => {
    lifecycle.state.service = saved.service;
    seed.cfg._APP = saved.app;
    setLedger(saved.ledger);
    hardware.memo.hw = saved.hw;
  });
}

/** Starlette's TestClient over `app.inject`. Each verb takes (url, {json, params, headers}). */
export function testClient(app) {
  const call =
    (method) =>
    (url, { json, params, headers, payload } = {}) => {
      const qs = params ? `?${new URLSearchParams(params)}` : "";
      return app.inject({
        method,
        url: url + qs,
        headers: { host: "testserver", ...(headers || {}) },
        remoteAddress: "192.0.2.10",
        ...(json !== undefined ? { payload: json } : {}),
        ...(payload !== undefined ? { payload } : {}),
      });
    };
  return {
    app,
    get: call("GET"),
    post: call("POST"),
    put: call("PUT"),
    patch: call("PATCH"),
    delete: call("DELETE"),
    options: call("OPTIONS"),
    request: (method, url, opts) => call(method)(url, opts),
  };
}

/** `TestClient(create_app(tmp_path))`. */
export async function client(dataDir) {
  return testClient(await createApp(dataDir));
}

/** `get_llm_registry()._adapters = {}` — the registry is a process singleton. */
export function clearRegistry() {
  getLlmRegistry()._adapters = new Map();
}
