// SPDX-License-Identifier: MIT
// Port of tests/test_ai_prompts.py — /v1/ai/prompts, the Lab prompt editor: list / view /
// edit / reset, all backed by the DB (the feature_prompts store).
import { getLlmRegistry, LLMResponse } from "@delebash/llm-runner/llm";
import * as seed from "@delebash/llm-runner/llm/seed";
import { expect, test } from "vitest";
import { state } from "../src/database/session.js";
import { DEFAULT_FEATURE_PROMPTS } from "../src/seed_feature_prompts.js";
import { client as makeClient, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

async function client() {
  const c = await makeClient(tmpPath());
  // The shared seeder reads JW's registered prompts.
  state.handle.tx(() => seed.seedDefaultFeaturePrompts(state.handle));
  return c;
}

test("list_returns_seeded_prompts", async () => {
  const c = await client();
  const r = await c.get("/v1/ai/prompts");
  expect(r.statusCode, r.body).toBe(200);
  const prompts = r.json().prompts;
  expect(prompts.length).toBe(Object.keys(DEFAULT_FEATURE_PROMPTS).length);
  const crit = prompts.find((p) => p.key === "critique");
  expect(crit.system.includes("fiction editor") && crit.builtIn === true).toBe(true);
  expect(crit.feature).toBe("critique");
});

test("get_single_and_unknown", async () => {
  const c = await client();
  expect((await c.get("/v1/ai/prompts/critique")).statusCode).toBe(200);
  expect((await c.get("/v1/ai/prompts/nope")).statusCode).toBe(404);
});

test("edit_then_reset_round_trips", async () => {
  const c = await client();
  // Edit the critique system prompt — persists to the DB.
  let r = await c.put("/v1/ai/prompts/critique", {
    json: { feature: "critique", system: "EDITED PROMPT", userTemplate: "{{chapter_text}}" },
  });
  expect(r.statusCode, r.body).toBe(200);
  expect(r.json().system).toBe("EDITED PROMPT");
  // Tunables are GONE from the prompt wire (2026-07-15 — they live on the preset).
  expect("temperature" in r.json()).toBe(false);
  // The edit is read back (DB is the source of truth).
  expect((await c.get("/v1/ai/prompts/critique")).json().system).toBe("EDITED PROMPT");
  // Reset restores the seeded default text + its JSON contract.
  r = await c.post("/v1/ai/prompts/critique/reset");
  expect(r.statusCode, r.body).toBe(200);
  expect(r.json().system.includes("fiction editor") && r.json().jsonMode === true).toBe(true);
});

test("edit_changes_what_run_sends", async () => {
  // Editing the prompt in the Lab changes what /v1/ai/run sends to the LLM — proves the
  // endpoint reads the (edited) DB row, not a code constant.
  const last = {};
  const fake = {
    provider_id: "p1",
    provider_type: "openai-compat",
    default_model: "m",
    async chat(_messages, { model = null, system = null } = {}) {
      last.system = system;
      return LLMResponse({ text: "{}", model: model || "m", prompt_tokens: 1, completion_tokens: 1 });
    },
    async *streamChat() {},
    async models() {
      return ["m"];
    },
    async embed() {
      return [];
    },
    async ping() {
      return true;
    },
  };

  const c = await client();
  const reg = getLlmRegistry();
  reg._adapters = new Map();
  reg.register(fake);
  state.handle.insert("settings", { key: "ai", value: JSON.stringify({ defaultLlmId: "p1", featurePins: {} }) });

  await c.put("/v1/ai/prompts/critique", { json: { system: "LAB-EDITED SYSTEM", userTemplate: "{{chapter_text}}" } });
  const r = await c.post("/v1/ai/run", { json: { action: "critique", variables: { chapter_text: "x" } } });
  expect(r.statusCode, r.body).toBe(200);
  expect(last.system).toBe("LAB-EDITED SYSTEM");
});

test("reset_unknown_default_400", async () => {
  const c = await client();
  expect((await c.post("/v1/ai/prompts/custom-thing/reset")).statusCode).toBe(400);
});

test("entity_sweep_schema_has_character_aliases_only", () => {
  // E3 (RAG build): the entitySweep json_schema proposes aliases on the CHARACTER item only
  // — locations/objects (the shared ENTITY_ITEM) must not grow an aliases field.
  const schema = JSON.parse(DEFAULT_FEATURE_PROMPTS.entitySweep.json_schema);
  const charProps = schema.properties.characters.items.properties;
  expect(charProps.aliases).toEqual({ type: "array", items: { type: "string" } });
  for (const kind of ["locations", "objects"]) {
    expect("aliases" in schema.properties[kind].items.properties).toBe(false);
  }
  // The prompt text describes the same field.
  expect(DEFAULT_FEATURE_PROMPTS.entitySweep.system).toContain("aliases");
});

// ── the AI drafting actions (2026-10-11, the AI drafting plan Task 6) ──
test("the drafting actions are seeded with their feature, their preset and a JSON contract", async () => {
  const SP = await import("../src/seed_presets.js");
  const want = {
    characterProfileDraft: "characterProfile",
    characterVoiceDraft: "characterVoice",
    characterSection: "characterProfile",
    suggestCharacters: "brainstorm",
  };
  for (const [key, feature] of Object.entries(want)) {
    const spec = DEFAULT_FEATURE_PROMPTS[key];
    expect(spec, key).toBeTruthy();
    expect(spec.feature, key).toBe(feature);
    expect(spec.json_mode, key).toBe(true);
    expect(spec.user_template, key).toBe("{{user_content}}");
    expect(SP.DEFAULT_FEATURE_PRESETS[key], key).toBe("p_creative_structured");
    expect(SP.DEFAULT_TEST_SAMPLES.some((s) => s.actions.includes(key)), `${key} has a Lab sample`).toBe(true);
  }
  // The two description drafts return Fill from book's exact shapes, so its sanitizers apply.
  expect(DEFAULT_FEATURE_PROMPTS.characterProfileDraft.system).toContain('"motivation"');
  expect(DEFAULT_FEATURE_PROMPTS.characterVoiceDraft.system).toContain('"sampleCalm"');
  expect(DEFAULT_FEATURE_PROMPTS.suggestCharacters.system).toContain('"characters"');
});
