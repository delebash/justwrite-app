// @vitest-environment jsdom
//
// QC (2026-07-20): CHANGING THE DEFAULT MODEL IN AN ONLINE PROVIDER'S DROPDOWN MUST
// REPOINT ROUTING ON SAVE — but ONLY when that provider is the live default provider.
//
// The bug: the online provider form's model combobox only wrote the provider's
// `defaultModel` field; the task presets (what runs) kept pointing at the old model, so
// "changing the dropdown did nothing — you had to click Default again". The local path
// never had this (its dropdown calls setAsDefault directly). The fix: on save, if the
// edited provider IS the current default provider and its chat/embedding model changed,
// also run setAsDefault / setAsEmbedding so routing follows. A NON-default provider's
// dropdown stays a stored preference until the Default button promotes it.
//
// Why a MOUNT test: the kit has no harness of its own (JW's is where kit components get
// tested — the ProviderForm.keyReveal.test.js precedent next door), and the gate is
// behavioral (WHICH saves emit an engine-preset/routing repoint), so only running save()
// proves it fires. The routing move shows up as a PUT /v1/ai/engine-presets/{id} (chat)
// or PUT /v1/ai/routing (embedding); the provider PATCH always fires.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, h, nextTick } from "vue";

import ProviderForm from "@delebash/llm-ui/views/ProviderForm.vue";

const SAVED = {
  id: "gemini", name: "Gemini", providerType: "gemini",
  baseUrl: "https://generativelanguage.googleapis.com", hasApiKey: false, local: false,
  defaultModel: "gemini-old", embeddingModel: "gemini-embedding-001", timeoutSeconds: 60,
};

let patches;        // PATCH /v1/llm-providers/gemini bodies
let presetPuts;     // PUT /v1/ai/engine-presets/{id} bodies (the chat routing repoint)
let routingPuts;    // PUT /v1/ai/routing bodies (the embedding repoint)
let dominantProviderId; // which provider the task preset points at → the current default
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
  patches = [];
  presetPuts = [];
  routingPuts = [];
  dominantProviderId = "gemini";
  vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => {
    const u = String(url);
    const method = (init.method || "GET").toUpperCase();
    if (u.includes("/v1/ai/preset-assignments")) {
      return jsonOk({ features: { chat: "p1" }, defaultPresetId: "p1" });
    }
    if (u.includes("/v1/ai/engine-presets/") && method === "PUT") {
      presetPuts.push(JSON.parse(init.body || "{}"));
      return jsonOk({});
    }
    if (u.includes("/v1/ai/engine-presets")) {
      // One task preset — its providerId is what makes gemini (or not) the default.
      return jsonOk({ presets: [{ id: "p1", name: "P1", model: "gemini-old", providerId: dominantProviderId, position: 0 }] });
    }
    if (u.includes("/v1/ai/routing") && method === "PUT") {
      routingPuts.push(JSON.parse(init.body || "{}"));
      return jsonOk({ default: { embeddingId: "", embeddingModel: "" } });
    }
    if (u.includes("/v1/ai/routing")) {
      return jsonOk({ default: { embeddingId: "", embeddingModel: "", llmId: "", model: "" }, features: [] });
    }
    if (u.includes("/v1/llm-providers/gemini") && method === "PATCH") {
      patches.push(JSON.parse(init.body || "{}"));
      return jsonOk({ ...SAVED });
    }
    if (u.includes("/v1/llm-providers")) {
      return jsonOk({ providers: [{ ...SAVED }] });
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

async function mountForm() {
  app = createApp({ render: () => h(ProviderForm, { provider: SAVED }) });
  app.directive("tooltip", {}); // host-registered in the real app; a no-op here
  app.mount(host);
  await flush();
}

// The two model comboboxes (LuCombobox free-text inputs) — [0] chat, [1] embedding.
function cbInputs() {
  return [...document.querySelectorAll(".lu-cb-in")];
}
function typeModel(index, value) {
  const inp = cbInputs()[index];
  inp.value = value;
  inp.dispatchEvent(new Event("input")); // onInput → emit update:modelValue (free text)
}
function saveBtn() {
  return [...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("Save provider"));
}

describe("ProviderForm — changing the default model on save repoints routing (only when it's the default provider)", () => {
  it("DEFAULT provider + chat model changed → PATCH provider AND repoints the task preset", async () => {
    dominantProviderId = "gemini"; // gemini IS the default
    await mountForm();
    typeModel(0, "gemini-new");
    await flush();
    saveBtn().click();
    await flush(40);
    expect(patches.length, "the provider field is saved").toBe(1);
    expect(patches[0].defaultModel).toBe("gemini-new");
    expect(presetPuts.length, "routing repointed via setAsDefault").toBe(1);
    expect(presetPuts[0].model).toBe("gemini-new");
    expect(presetPuts[0].providerId).toBe("gemini");
  });

  it("NOT the default provider → PATCH provider but NEVER touches routing", async () => {
    dominantProviderId = "openai"; // a different provider is the default
    await mountForm();
    typeModel(0, "gemini-new");
    await flush();
    saveBtn().click();
    await flush(40);
    expect(patches.length).toBe(1);
    expect(patches[0].defaultModel).toBe("gemini-new"); // the field still saves
    expect(presetPuts.length, "a non-default provider stays a stored preference").toBe(0);
    expect(routingPuts.length).toBe(0);
  });

  it("DEFAULT provider but model UNCHANGED → no routing write (the changed-only gate)", async () => {
    dominantProviderId = "gemini";
    await mountForm();
    // do NOT touch the combobox — draft.defaultModel stays "gemini-old"
    saveBtn().click();
    await flush(40);
    expect(patches.length).toBe(1);
    expect(presetPuts.length, "an unchanged model must not repoint routing").toBe(0);
    expect(routingPuts.length).toBe(0);
  });

  it("DEFAULT provider + embedding model changed → repoints the routing embedding", async () => {
    dominantProviderId = "gemini";
    await mountForm();
    typeModel(1, "gemini-embedding-new"); // the embedding combobox
    await flush();
    saveBtn().click();
    await flush(40);
    expect(patches.length).toBe(1);
    expect(patches[0].embeddingModel).toBe("gemini-embedding-new");
    expect(routingPuts.length, "embedding repointed via setAsEmbedding").toBe(1);
    expect(presetPuts.length, "chat unchanged → no chat repoint").toBe(0);
  });
});
