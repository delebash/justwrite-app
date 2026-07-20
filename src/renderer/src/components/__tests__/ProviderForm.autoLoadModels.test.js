// @vitest-environment jsdom
//
// QC (2026-07-20): THE ONLINE PROVIDER MODEL DROPDOWN AUTO-POPULATES ON EDIT-OPEN.
//
// Before: opening a saved provider's Edit form left the model dropdown empty until you
// clicked Fetch. Fix (a)+(b), stale-while-revalidate via the shared useProviderModels
// cache: on open of a saved provider that can be queried (a key set, or a local server),
// background-refresh its list (GET /v1/llm-providers/{id}/models) so the dropdown is
// populated without a manual Fetch — instant from cache on repeat opens, self-healing on
// each open. A manual Fetch still runs the DRAFT probe (current form URL/key) and its
// result overrides the cache, so an edited key's models win. Keyless online rows (nothing
// to query with) and brand-new providers (no id) do NOT auto-fetch.
//
// Why a MOUNT test: the trigger runs at setup ("open") and the source is a computed over a
// module-scoped cache — only mounting the real component exercises it. jsdom + createApp,
// same pattern as ProviderForm.keyReveal.test.js. Distinct provider ids per case because
// the useProviderModels cache is module-scoped (persists across a file's tests).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, h, nextTick } from "vue";

import ProviderForm from "@delebash/llm-ui/views/ProviderForm.vue";

let modelGets;   // provider ids whose GET /{id}/models fired
let probePosts;  // count of draft-probe POSTs
let modelsById;  // id → the models the /{id}/models GET returns
let probeModels; // what the draft probe POST returns
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
  modelGets = [];
  probePosts = 0;
  modelsById = {};
  probeModels = [];
  vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => {
    const u = String(url);
    const method = (init.method || "GET").toUpperCase();
    if (u.includes("/key/reveal")) return jsonOk({ apiKey: "sk-real" });
    if (u.includes("/v1/llm-providers/probe-models") && method === "POST") {
      probePosts++;
      return jsonOk({ models: probeModels });
    }
    const m = u.match(/\/v1\/llm-providers\/([^/]+)\/models(?:\?|$)/);
    if (m && method === "GET") {
      const id = decodeURIComponent(m[1]);
      modelGets.push(id);
      return jsonOk({ models: modelsById[id] || [] });
    }
    return jsonOk({});
  }));
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  app?.unmount();
  host?.remove();
  vi.unstubAllGlobals();
});

async function flush(times = 24) {
  for (let i = 0; i < times; i++) { await nextTick(); await Promise.resolve(); }
}

async function mount(provider) {
  app = createApp({ render: () => h(ProviderForm, { provider }) });
  app.directive("tooltip", {});
  app.mount(host);
  await flush();
}

// Open the chat combobox (LuCombobox [0]) and read its rendered option labels. The list
// is v-if="open" so it needs a tick to render after the focus event.
async function chatOptionsAfterFocus() {
  const input = document.querySelectorAll(".lu-cb-in")[0];
  input.dispatchEvent(new Event("focus"));
  await flush();
  return [...document.querySelectorAll(".lu-cb-list div")]
    .map((d) => d.textContent.trim())
    .filter((t) => t && !t.startsWith("No "));
}
function fetchBtn() {
  return [...document.querySelectorAll("button")].find((b) => /Fetch|Refresh/.test(b.textContent));
}

const base = (over) => ({
  id: "p", name: "P", providerType: "openai", baseUrl: "https://api.openai.com/v1",
  hasApiKey: false, local: false, defaultModel: "", embeddingModel: "", timeoutSeconds: 60, ...over,
});

describe("ProviderForm — the model dropdown auto-populates on open (stale-while-revalidate)", () => {
  it("KEYED online provider: auto-fetches on open and fills the chat dropdown WITHOUT a Fetch click", async () => {
    modelsById["prov-keyed"] = ["gpt-a", "gpt-b", "text-embedding-3"];
    await mount(base({ id: "prov-keyed", hasApiKey: true }));
    expect(modelGets, "GET /{id}/models fired on open").toContain("prov-keyed");
    expect(probePosts, "no draft probe — the cache endpoint is used").toBe(0);
    const opts = await chatOptionsAfterFocus();
    expect(opts).toContain("gpt-a");
    expect(opts).toContain("gpt-b");
    expect(opts, "embedding ids are filtered out of the chat list").not.toContain("text-embedding-3");
  });

  it("KEYLESS online provider: does NOT auto-fetch on open (nothing to query with)", async () => {
    await mount(base({ id: "prov-keyless", hasApiKey: false, local: false }));
    expect(modelGets, "no key → no auto-fetch").not.toContain("prov-keyless");
  });

  it("LOCAL provider (no key): auto-fetches on open", async () => {
    modelsById["prov-local"] = ["llama-x"];
    await mount(base({ id: "prov-local", hasApiKey: false, local: true, providerType: "ollama", baseUrl: "http://localhost:11434" }));
    expect(modelGets, "a local server is queryable without a key").toContain("prov-local");
  });

  it("a manual Fetch (draft probe) OVERRIDES the cached list", async () => {
    modelsById["prov-ovr"] = ["cached-a", "cached-b"];
    probeModels = ["probe-x", "probe-y"];
    await mount(base({ id: "prov-ovr", hasApiKey: true }));
    expect(await chatOptionsAfterFocus()).toContain("cached-a"); // cache first
    document.querySelectorAll(".lu-cb-in")[0].dispatchEvent(new Event("blur"));
    fetchBtn().click(); // draft probe
    await flush();
    const opts = await chatOptionsAfterFocus();
    expect(probePosts).toBe(1);
    expect(opts, "the probe result now wins").toContain("probe-x");
    expect(opts, "the cache list is superseded").not.toContain("cached-a");
  });
});
