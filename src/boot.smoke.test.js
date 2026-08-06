// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// THE BOOT SMOKE (parity batch slice 11) — imports the REAL main.js and lets the
// REAL boot chain run against a stubbed transport (checkServer → bootSettings →
// hydrateProjects → providers/routing → sessions → warm → mount). This is the
// gate that kills the TDZ-crash class: build:vite compiles the module graph
// without executing it and biome doesn't check .vue identifiers, so a "used
// before initialization" anywhere in the graph ships past a green build (JV's
// did, live, 2026-08-05). An import-time throw, a boot-chain throw, or a mount
// that renders nothing all fail here.
import { beforeAll, expect, it, vi } from "vitest";

beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const url = String(typeof input === "string" ? input : input?.url || "");
      let body = {};
      if (url.includes("/v1/health")) body = { status: "ok", product: "justwrite" };
      else if (url.includes("/v1/settings")) body = { settings: {} };
      else if (url.includes("/v1/projects")) body = { projects: [], registry: [] };
      else if (url.includes("/v1/sessions")) body = { sessions: [] };
      else if (url.includes("/v1/llm-providers")) body = { providers: [] };
      else if (url.includes("/v1/ai/routing")) body = { features: [] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    })),
  );
  // Node ships an EXPERIMENTAL localStorage global that is undefined without
  // --localstorage-file and shadows jsdom's — give the app a working one.
  const store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("EventSource", class {
    constructor() { this.readyState = 0; }
    addEventListener() {}
    close() {}
  });
  window.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
});

it("the app boots to a mounted shell (TDZ / boot-crash smoke)", async () => {
  document.body.innerHTML = '<div id="app-boot"></div><div id="app"></div>';
  await import("./main.js");
  const el = document.getElementById("app");
  await vi.waitFor(() => {
    expect(el.childElementCount).toBeGreaterThan(0);
    // main.js's DEV tail dynamically imports the bench hook AFTER mount —
    // wait for its marker so the async import can't race the environment
    // teardown (import.meta.env.DEV is true under vitest).
    expect(window.__jwBench).toBeTruthy();
  }, { timeout: 8000, interval: 100 });
}, 15000);
