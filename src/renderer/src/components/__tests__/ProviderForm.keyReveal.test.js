// @vitest-environment jsdom
//
// #12 C6 — THE SAVED API KEY IS A MASKED, REVEALABLE, EDITABLE FIELD.
//
// The bug: the key was write-only, so ProviderForm's field always init'd "" and showed
// a ••• placeholder; Fetch/Test then built a KEYLESS draft-probe (empty key) and every
// connected-cloud probe failed. The fix reveals the stored key into the (masked) field
// on open so Fetch/Test carry it, and swaps the plain input for the kit's UiSecretInput
// (eye toggle). The subtle contract is the KEY-WIPE GUARD: an empty field must clear the
// key ONLY when the reveal succeeded (the user saw the real key and erased it) — never
// when the reveal never loaded (a brand-new provider, or a reveal that FAILED), which
// must keep the stored key ("" preserves, server-side).
//
// Why a MOUNT test: this is a credential path — biome/build:vite never execute the SFC,
// and the guard is behavioral (which sentinel Save sends), so only running it proves the
// guard FIRES. The kit has no harness of its own; JW's is where kit components get tested
// (the LuFeatureChip.save.test.js precedent next door). Mounted with plain createApp;
// fetch is stubbed and every PATCH body captured.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, h, nextTick } from "vue";

import ProviderForm from "@delebash/llm-ui/views/ProviderForm.vue";

const SAVED = {
  id: "claude", name: "Claude", providerType: "anthropic",
  baseUrl: "https://api.anthropic.com", hasApiKey: true, local: false,
  defaultModel: "", embeddingModel: "", timeoutSeconds: 60,
};

let patches;
let revealOk;
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
function fail(status) {
  return { ok: false, status, headers: { get: () => "" }, json: async () => ({}), text: async () => "" };
}

beforeEach(() => {
  patches = [];
  vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => {
    const u = String(url);
    const method = (init.method || "GET").toUpperCase();
    if (u.includes("/key/reveal")) {
      return revealOk ? jsonOk({ apiKey: "sk-real" }) : fail(500);
    }
    if (u.includes("/v1/llm-providers/claude") && method === "PATCH") {
      patches.push(JSON.parse(init.body || "{}"));
      return jsonOk({ ...SAVED });
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

async function flush(times = 16) {
  for (let i = 0; i < times; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountForm() {
  app = createApp({ render: () => h(ProviderForm, { provider: SAVED }) });
  app.directive("tooltip", {}); // host-registered in the real app; a no-op here
  app.mount(host);
  await flush();
}

function keyInput() {
  // UiSecretInput wraps UiInput in a `.ui-secret` container — the only masked field.
  return document.querySelector(".ui-secret input");
}
function saveBtn() {
  return [...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("Save provider"));
}
function keptHint() {
  return [...document.querySelectorAll(".lu-fh")].find((el) => el.textContent.includes("An API key is saved"));
}

describe("ProviderForm — the saved key reveals into a masked, editable field (#12 C6)", () => {
  it("mounts a UiSecretInput (masked by default) for the key, not a bare input", async () => {
    revealOk = true;
    await mountForm();
    const inp = keyInput();
    expect(inp, "the key field is a UiSecretInput (.ui-secret input)").toBeTruthy();
    expect(inp.type).toBe("password"); // masked until the eye toggles it
    // the eye toggle is present
    expect(document.querySelector(".ui-secret__toggle")).toBeTruthy();
  });

  it("on open, the stored key is revealed into the field and the 'leave blank to keep' hint is GONE", async () => {
    revealOk = true;
    await mountForm();
    expect(keyInput().value).toBe("sk-real"); // pre-filled from POST /key/reveal
    expect(keptHint(), "no write-only fallback hint once the real key is loaded").toBeFalsy();
  });

  it("KEY-WIPE GUARD, reveal-OK path: clearing the revealed key + Save sends apiKey null (clear)", async () => {
    revealOk = true;
    await mountForm();
    const inp = keyInput();
    expect(inp.value).toBe("sk-real");
    inp.value = "";
    inp.dispatchEvent(new Event("input")); // user erases the revealed key
    await flush();
    saveBtn().click();
    await flush(24);
    expect(patches.length).toBe(1);
    expect(patches[0].apiKey).toBeNull(); // empty AFTER a successful reveal = deliberate clear
  });

  it("KEY-WIPE GUARD, reveal-FAILED path: untouched Save sends apiKey '' (keep the stored key)", async () => {
    revealOk = false; // the reveal POST 500s → revealLoaded never set
    await mountForm();
    expect(keyInput().value).toBe(""); // nothing revealed
    expect(keptHint(), "the write-only fallback hint returns when reveal failed").toBeTruthy();
    saveBtn().click();
    await flush(24);
    expect(patches.length).toBe(1);
    expect(patches[0].apiKey).toBe(""); // never wipe a key the user never saw
  });
});
