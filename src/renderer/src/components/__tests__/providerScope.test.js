// @vitest-environment jsdom
//
// 2026-07-19 — LOCAL vs ONLINE ARE TABS on the provider list (user ruling), and the
// tab you stand on seeds a NEW provider's where-it-runs choice.
//
// Why a MOUNT test: both behaviors are conditional-render + prop-default logic that
// biome/build:vite never execute — only running the SFCs proves the scope actually
// switches the list, hides the built-in card, and reaches ProviderForm's WHERE control.
// Mounted with plain createApp and a stubbed fetch, matching the kit-component-tested-
// from-JW precedent next door (ProviderForm.keyReveal.test.js).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, h, nextTick } from "vue";

import AiModelsArea from "@delebash/llm-ui/views/AiModelsArea.vue";
import ProviderForm from "@delebash/llm-ui/views/ProviderForm.vue";

const BUILTIN = {
  id: "builtin", name: "Built-in provider — llama.cpp", providerType: "local-llamacpp",
  baseUrl: "http://127.0.0.1:8080", local: true, hasApiKey: false,
  defaultModel: "", embeddingModel: "", timeoutSeconds: 60,
};
const LOCAL_ROW = {
  id: "ollama", name: "My Ollama", providerType: "ollama",
  baseUrl: "http://localhost:11434", local: true, hasApiKey: false,
  defaultModel: "", embeddingModel: "", timeoutSeconds: 60,
};
const CLOUD_ROW = {
  id: "claude", name: "Claude", providerType: "anthropic",
  baseUrl: "https://api.anthropic.com", local: false, hasApiKey: true,
  defaultModel: "", embeddingModel: "", timeoutSeconds: 60,
};

let app;
let host;

function jsonOk(obj) {
  return {
    ok: true, status: 200,
    headers: { get: (k) => (k.toLowerCase() === "content-type" ? "application/json" : "") },
    json: async () => obj,
    text: async () => JSON.stringify(obj),
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    const u = String(url);
    if (u.includes("/v1/llm-providers") && !u.includes("/ping")) {
      return jsonOk({ providers: [BUILTIN, LOCAL_ROW, CLOUD_ROW] });
    }
    if (u.includes("/hardware")) return jsonOk({ os: "win", cpuCores: 8, gpus: [], runtimes: {} });
    if (u.includes("/resident")) return jsonOk({ models: [] });
    return jsonOk({});
  }));
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  app?.unmount();
  host?.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function flush(times = 24) {
  for (let i = 0; i < times; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountArea(props = {}) {
  app = createApp({ render: () => h(AiModelsArea, props) });
  app.directive("tooltip", {}); // host-registered in the real app; a no-op here
  app.mount(host);
  await flush();
}

const rowNames = () => [...document.querySelectorAll(".lu-prow .lu-prow-name b")].map((b) => b.textContent.trim());
const builtinCard = () => document.querySelector(".lu-builtin");
// v-show, not v-if — the card hides but STAYS mounted (see below).
const builtinVisible = () => {
  const el = builtinCard();
  return !!el && el.style.display !== "none";
};
const scopeButtons = () => [...document.querySelectorAll(".lu-scope button")];
const activeScope = () => scopeButtons().find((b) => b.classList.contains("active"))?.textContent || "";

describe("provider scope tabs (2026-07-19)", () => {
  it("initialProviderScope='online' starts on the ONLINE tab — cloud rows only", async () => {
    await mountArea({ initialProviderScope: "online" });
    expect(activeScope()).toContain("Online");
    expect(rowNames()).toContain("Claude");
    expect(rowNames()).not.toContain("My Ollama");
  });

  it("default mount (no prop) starts on LOCAL — local rows only", async () => {
    await mountArea();
    expect(activeScope()).toContain("Local");
    expect(rowNames()).toContain("My Ollama");
    expect(rowNames()).not.toContain("Claude");
  });

  it("the promoted built-in section shows on LOCAL and is hidden on ONLINE", async () => {
    await mountArea();
    expect(builtinVisible(), "built-in card is visible on the local tab").toBe(true);
    // click through to the online tab — the same mount, so this proves the switch,
    // not just the initial prop.
    scopeButtons().find((b) => b.textContent.includes("Online")).click();
    await flush();
    expect(builtinVisible(), "built-in card is hidden on the online tab").toBe(false);
    expect(rowNames()).toEqual(["Claude"]);
  });

  // REGRESSION (rules-checker, 2026-07-19): the scope term on the built-in card MUST
  // be v-show, not v-if. Two openers outside that block reach the wizard through
  // `qsRef` — the hardware-change toast's "Run Quick Setup" action and the
  // ?quicksetup=1 auto-open — and a v-if unmounts QuickSetup on the Online tab,
  // turning both into silent `?.()` no-ops. Asserting the wizard's markup SURVIVES
  // the hide is what proves the ref is still live.
  it("hiding the built-in card keeps QuickSetup MOUNTED (qsRef stays live off-tab)", async () => {
    await mountArea({ initialProviderScope: "online" });
    expect(builtinVisible(), "hidden on the online tab").toBe(false);
    expect(builtinCard(), "…but still in the DOM, so its QuickSetup ref survives").toBeTruthy();
    expect(document.querySelector(".lu-builtin-qs"), "the QuickSetup mount is still there").toBeTruthy();
  });
});

// ── ProviderForm: the new-provider WHERE default follows the tab ──────────────
// The WHERE control is the UiSegmented at ProviderForm.vue:256, bound to the WHERE
// options array at ProviderForm.vue:87 —
// [{ true: "Local · free" }, { false: "Online · metered" }].
function whereActive() {
  const segs = [...document.querySelectorAll(".ui-seg")];
  const where = segs.find((s) => s.textContent.includes("Local · free") && s.textContent.includes("Online · metered"));
  return [...(where?.querySelectorAll("button") || [])].find((b) => b.classList.contains("active"))?.textContent || "";
}

async function mountForm(props) {
  app = createApp({ render: () => h(ProviderForm, props) });
  app.directive("tooltip", {});
  app.mount(host);
  await flush();
}

describe("ProviderForm — a NEW provider's where-it-runs follows the tab you're on", () => {
  it(":initial-local='false' starts on Online", async () => {
    await mountForm({ initialLocal: false });
    expect(whereActive()).toContain("Online");
  });

  it(":initial-local='true' starts on Local", async () => {
    await mountForm({ initialLocal: true });
    expect(whereActive()).toContain("Local");
  });
});
