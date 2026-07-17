// @vitest-environment jsdom
//
// THE ONE TEST THAT EXECUTES THE CHIP'S THINKING SAVE (2026-07-16, preset tier).
//
// Why a mount test: this write path shipped two bugs past a fully green build + tests +
// biome earlier the same day, because nothing executed the SFC (`build:vite` compiles
// without resolving script identifiers; biome doesn't check .vue identifiers; the smoke
// only mounts routes). The path has since been REDESIGNED — "feature is the end of the
// line": the thinking control is three-state (Off / Model default / a level) and the
// save is ONE preset PUT, identical to the Lab's update. The chip must NEVER write a
// layer row (class-tunes / model-tunes) — the hardware class default stays product
// data; your applied config stays what Apply wrote. These pin that contract, plus the
// follow-state regression (think on + empty level must load as "Model default", never
// collapse to Off — the collapse wrote think=false back on the next save).
//
// Mounted with plain `createApp` (no @vue/test-utils dep); fetch is stubbed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, h, nextTick } from "vue";

import LuFeatureChip from "@delebash/llm-ui/components/LuFeatureChip.vue";

const CLASS_KEY = "vram8|ram32";
const LOCAL_ROUTE = {
  feature: "critique", action: "", providerId: "local-llamacpp", model: "gemma",
  presetId: "p1", presetName: "Judgment", presetSource: "assigned",
  think: true, level: "", reasoningWord: "", value: 1024, valueSource: "class",
  configured: true,
};
// A grid-typed value matching NO level — the display-only Custom state (B ruling).
const CUSTOM_ROUTE = { ...LOCAL_ROUTE, value: 3000 };

let puts;
let app;
let host;
let activeRoute = LOCAL_ROUTE;

function jsonOk(obj) {
  return {
    ok: true, status: 200,
    headers: { get: (k) => (k.toLowerCase() === "content-type" ? "application/json" : "") },
    json: async () => obj,
    text: async () => JSON.stringify(obj),
  };
}

beforeEach(() => {
  puts = [];
  vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => {
    const u = String(url);
    const method = (init.method || "GET").toUpperCase();
    if (method !== "GET") puts.push({ url: u, method, body: JSON.parse(init.body || "{}") });
    if (u.includes("/v1/llm-providers")) {
      return jsonOk({ providers: [{ id: "local-llamacpp", name: "Built-in runner", local: true }] });
    }
    if (u.includes("/v1/ai/engine-presets")) {
      // think ON with an EMPTY level — the follow state, the seeded default of p_chat.
      return jsonOk({ presets: [{ id: "p1", name: "Judgment", providerId: "local-llamacpp", model: "gemma", think: true, reasoningEffort: "", temperature: 0.7 }] });
    }
    if (u.includes("/v1/ai/preset-assignments")) return jsonOk({ features: { critique: "p1" } });
    if (u.includes("/v1/ai/reasoning-map/")) {
      return jsonOk({ provider: "local-llamacpp", rows: [
        { level: "low", word: "", tokens: 1024 }, { level: "medium", word: "", tokens: 4096 },
        { level: "high", word: "", tokens: 8192 }, { level: "xhigh", word: "", tokens: 16384 },
        { level: "max", word: "", tokens: 32768 },
      ] });
    }
    if (u.includes("/v1/ai/class-tunes")) {
      return jsonOk({ classKey: CLASS_KEY, tunes: [] });
    }
    if (u.includes("/v1/ai/resolved-route")) return jsonOk(activeRoute);
    if (u.includes("/v1/ai/model-tunes")) return jsonOk({ rows: [] });
    return jsonOk({});
  }));
  activeRoute = LOCAL_ROUTE;
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  app?.unmount();
  host?.remove();
  vi.unstubAllGlobals();
});

async function flush(times = 12) {
  for (let i = 0; i < times; i++) { await nextTick(); await Promise.resolve(); }
}

function thinkingSelect() {
  // The local Thinking select is the one listing levels with their map numbers.
  return [...document.querySelectorAll("select")].find((s) =>
    [...s.options].some((o) => o.textContent.includes("(8192)")));
}

async function openPopover(route = LOCAL_ROUTE) {
  activeRoute = route;
  app = createApp({
    render: () => h(LuFeatureChip, {
      feature: "critique", label: "Critique", editable: true, route,
      resolvedProviderName: "Built-in runner", resolvedModel: "gemma",
    }),
  });
  app.directive("tooltip", {}); // host-registered in the real apps; a no-op here
  app.mount(host);
  await flush();
  document.querySelector(".afc-chip").click();
  await flush();
}

async function pickAndSave(value) {
  const select = thinkingSelect();
  expect(select, "the Thinking select should list levels with their map numbers").toBeTruthy();
  select.value = value;
  select.dispatchEvent(new Event("change"));
  await flush();
  const save = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Save");
  expect(save, "the popover should render a Save button").toBeTruthy();
  save.click();
  await flush(30);
}

function layerWrites() {
  return puts.filter((p) =>
    (p.url.includes("/v1/ai/class-tunes") || p.url.includes("/v1/ai/model-tunes")) && p.method !== "GET");
}

describe("LuFeatureChip — the thinking save is ONE preset write", () => {
  it("seeds from the RESOLVED value: a matched level shows as that level (the B ruling)", async () => {
    await openPopover();
    // Stored: think=true + level="" (follow), resolving to 1024 ⇒ the control reads
    // "low" — the level whose map number matches what will actually run. NEVER Off
    // (the collapse regression), never an uninformative "Model default".
    expect(thinkingSelect().value).toBe("low");
  });

  it("a resolved value matching no level shows as display-only Custom, and save preserves the stored pair", async () => {
    await openPopover(CUSTOM_ROUTE); // 3000 — typed in a grid, no level matches
    expect(thinkingSelect().value).toBe("__custom");
    const custom = [...thinkingSelect().options].find((o) => o.value === "__custom");
    expect(custom.textContent).toContain("Custom (3000)");
    await pickAndSave("__custom");
    const presetPut = puts.find((p) => p.url.includes("/v1/ai/engine-presets/p1"));
    // Custom is not a level — the stored pair rides through UNTOUCHED.
    expect(presetPut.body.think).toBe(true);
    expect(presetPut.body.reasoningEffort).toBe("");
    expect(layerWrites()).toEqual([]);
  });

  it("a picked level saves to the preset as its own ask — and touches NO layer row", async () => {
    await openPopover();
    await pickAndSave("high");
    const presetPut = puts.find((p) => p.url.includes("/v1/ai/engine-presets/p1"));
    expect(presetPut, "the save is the same preset PUT the Lab's update does").toBeTruthy();
    expect(presetPut.body.think).toBe(true);
    expect(presetPut.body.reasoningEffort).toBe("high");
    // The preset's other tunables ride through untouched.
    expect(presetPut.body.temperature).toBe(0.7);
    // THE CONTRACT: the chip never writes the hardware class default or your applied
    // config — the budget number never lands anywhere but the resolver's map lookup.
    expect(layerWrites()).toEqual([]);
    expect(JSON.stringify(presetPut.body)).not.toContain("reasoning_budget");
  });


  it("Off saves think false and writes nothing else", async () => {
    await openPopover();
    await pickAndSave("");
    const presetPut = puts.find((p) => p.url.includes("/v1/ai/engine-presets/p1"));
    expect(presetPut.body.think).toBe(false);
    expect(presetPut.body.reasoningEffort).toBe("");
    expect(layerWrites()).toEqual([]);
    // A clean save closes the popover and leaves no error on screen.
    expect(document.querySelector(".afc-pop-err")?.textContent || "").toBe("");
  });
});
