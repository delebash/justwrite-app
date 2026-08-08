// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// THE BOOT SMOKE (parity batch slice 11) — the skeleton (stub environment +
// mount assertion + why this gate exists) is the kit's registerBootSmoke; this
// file keeps JustWrite's parts: the fetch route map and the bench-hook probe.
import { expect } from "vitest";
import { registerBootSmoke } from "@delebash/llm-ui/test/bootSmoke.js";

registerBootSmoke({
  boot: () => import("./main.js"),
  routes: {
    "/v1/health": { status: "ok", product: "justwrite" },
    "/v1/settings": { settings: {} },
    "/v1/projects": { projects: [], registry: [] },
    "/v1/sessions": { sessions: [] },
    "/v1/llm-providers": { providers: [] },
    "/v1/ai/routing": { features: [] },
  },
  // main.js's DEV tail dynamically imports the bench hook AFTER mount — wait
  // for its marker so the async import can't race the environment teardown
  // (import.meta.env.DEV is true under vitest).
  ready: () => {
    expect(window.__jwBench).toBeTruthy();
  },
});
