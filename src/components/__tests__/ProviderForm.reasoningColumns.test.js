// @vitest-environment jsdom
//
// #15 C4 D5 — THE REASONING-LEVELS EDITOR RENDERS THE RIGHT SHAPE PER PROVIDER TYPE.
//
// D5 ruling: deepseek/xai/mistral run thinking at the MODEL's own default — the adapter
// emits no effort param (openai_sdk.EMIT_EFFORT_TYPES excludes them), so the editor must
// show NO columns, just the line "runs thinking at the model's own default". A user must
// never edit a value nothing sends. deepseek moved OUT of WORD_ONLY into MODEL_DEFAULT_TYPES
// with the pivot (its dead cloud reasoning_effort branch was removed). Builder 2 shipped the
// source (ProviderForm.vue MODEL_DEFAULT_TYPES + the popup branch) but it was never rendered;
// this executes it. Contrast: a NUMBER_ONLY type (gemini) still renders a Tokens column.
//
// Why a mount: the reconcile is a computed→v-if in the SFC; only running it proves which
// branch paints. Mounted with plain createApp; fetch stubbed. (Kit components are tested in
// JW's harness — the LuFeatureChip.save.test.js / ProviderForm.keyReveal.test.js precedent.)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, h, nextTick } from "vue";

import ProviderForm from "@delebash/llm-ui/views/ProviderForm.vue";

const REASON_ROWS = [
  { level: "low", word: "", tokens: 1024 }, { level: "medium", word: "", tokens: 4096 },
  { level: "high", word: "", tokens: 8192 }, { level: "xhigh", word: "", tokens: 16384 },
  { level: "max", word: "", tokens: 32768 },
];

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
    if (u.includes("/key/reveal")) return jsonOk({ apiKey: "" });
    if (u.includes("/v1/ai/reasoning-map/")) return jsonOk({ provider: "p", rows: REASON_ROWS });
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

async function openReasoning(providerType) {
  const provider = {
    id: "p", name: "P", providerType, baseUrl: "https://x", hasApiKey: false, local: false,
    defaultModel: "", embeddingModel: "", timeoutSeconds: 60,
  };
  app = createApp({ render: () => h(ProviderForm, { provider }) });
  app.directive("tooltip", {});
  app.mount(host);
  await flush();
  const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Reasoning levels"));
  expect(btn, "the saved provider shows the Reasoning levels… button").toBeTruthy();
  btn.click();
  await flush();
}

function bodyText() {
  return document.body.textContent || "";
}

describe("ProviderForm — the reasoning-levels editor renders per D5 (#15 C4)", () => {
  it("deepseek (MODEL_DEFAULT_TYPES): the model-default line, NO columns", async () => {
    await openReasoning("deepseek");
    expect(bodyText()).toContain("runs thinking at the model's own default");
    // No editable rows / column headers when it runs the model default.
    expect(document.querySelector(".lu-rt-row"), "no reasoning-map column rows render").toBeFalsy();
  });

  it("xai + mistral also show the model-default line, no columns", async () => {
    await openReasoning("xai");
    expect(bodyText()).toContain("runs thinking at the model's own default");
    expect(document.querySelector(".lu-rt-row")).toBeFalsy();
    app.unmount(); host.remove();
    host = document.createElement("div"); document.body.appendChild(host);
    await openReasoning("mistral");
    expect(bodyText()).toContain("runs thinking at the model's own default");
    expect(document.querySelector(".lu-rt-row")).toBeFalsy();
  });

  it("gemini (NUMBER_ONLY_TYPES) DOES render a Tokens column and the map rows — the contrast", async () => {
    await openReasoning("gemini");
    // Not the model-default branch.
    expect(bodyText()).not.toContain("runs thinking at the model's own default");
    // The column table renders with rows; the Tokens header is present, Word is hidden.
    expect(document.querySelectorAll(".lu-rt-row").length).toBeGreaterThan(1);
    expect(bodyText()).toContain("Tokens");
  });
});
