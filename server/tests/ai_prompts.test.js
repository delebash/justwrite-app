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

// ── slice 2: the prose actions know the story (2026-10-11, the AI drafting plan Task 13) ──
// The six that existed before slice 2 (healed), and the two direction actions added with Task 14.
const HEALED = ["writerAI.rewrite", "writerAI.expand", "writerAI.tighten", "writerAI.continue", "writerAI.describe", "writerAI.guided-continue"];
const PROSE = [...HEALED, "writerAI.guided-rewrite", "writerAI.dialogue"];

test("the prose actions' system ends in {{storyContext}}; the line edits' doesn't carry it", () => {
  for (const key of PROSE) expect(DEFAULT_FEATURE_PROMPTS[key].system, key).toMatch(/\{\{voiceCanon\}\}\{\{storyContext\}\}$/);
  const rules = Object.keys(DEFAULT_FEATURE_PROMPTS).filter((k) => k.startsWith("writerAI.rule."));
  expect(rules).toHaveLength(7);
  for (const key of rules) expect(DEFAULT_FEATURE_PROMPTS[key].system, key).not.toContain("storyContext");
});

test("an unedited prose prompt heals: its heal entry is the system it had, byte for byte", async () => {
  const { FEATURE_PROMPT_HEALS } = await import("../src/seed_feature_prompts.js");
  // The line edits keep the old writer system unchanged — so it IS what an existing row carries.
  const old = DEFAULT_FEATURE_PROMPTS["writerAI.rule.passive-voice"].system;
  expect(old.endsWith("Preserve dialogue formatting and proper nouns.{{voiceCanon}}")).toBe(true);
  for (const key of HEALED) expect(FEATURE_PROMPT_HEALS[key], key).toEqual([old]);
  for (const key of ["writerAI.guided-rewrite", "writerAI.dialogue"]) expect(FEATURE_PROMPT_HEALS[key], key).toBeUndefined();
});

test("Rewrite with direction and Write dialogue: the writer's direction on the prose system, and their presets", async () => {
  const SP = await import("../src/seed_presets.js");
  for (const key of ["writerAI.guided-rewrite", "writerAI.dialogue"]) {
    expect(DEFAULT_FEATURE_PROMPTS[key].feature, key).toBe("writerAI");
    expect(DEFAULT_FEATURE_PROMPTS[key].user_template, key).toContain('"{{direction}}"');
    expect(DEFAULT_FEATURE_PROMPTS[key].user_template, key).toContain("--- BEGIN PASSAGE ---\n{{passage}}\n--- END PASSAGE ---");
  }
  expect(DEFAULT_FEATURE_PROMPTS["writerAI.dialogue"].user_template).toContain("story context");
  expect(SP.DEFAULT_FEATURE_PRESETS["writerAI.guided-rewrite"]).toBe("p_prose_edit");
  expect(SP.DEFAULT_FEATURE_PRESETS["writerAI.dialogue"]).toBe("p_prose_voiced");
});

test("the voice passes ask for vocabulary as one string; an unedited stored prompt heals to it", async () => {
  const { FEATURE_PROMPT_HEALS } = await import("../src/seed_feature_prompts.js");
  const lines = {
    characterVoice: '"vocabulary":  "3-5 words or phrases only THIS character uses, drawn from their actual lines',
    characterVoiceDraft: '"vocabulary":  "3-5 words or phrases only THIS character would use',
  };
  for (const [key, line] of Object.entries(lines)) {
    const now = DEFAULT_FEATURE_PROMPTS[key].system;
    expect(now, key).toContain(`${line} — one string, the phrases separated by semicolons",`);
    const [old] = FEATURE_PROMPT_HEALS[key];
    expect(old, key).toContain(`${line}",`); // the text a database seeded before 2026-10-16 holds
    expect(old.length, key).toBe(now.length - " — one string, the phrases separated by semicolons".length);
  }
});

test("Draft from the premise keeps the book's facts; an unedited stored prompt heals to the rule", async () => {
  const { FEATURE_PROMPT_HEALS } = await import("../src/seed_feature_prompts.js");
  const now = DEFAULT_FEATURE_PROMPTS.premiseDraft.system;
  expect(now).toContain("  - Keep every fact the book gives — the characters' names, their pronouns, who is who");
  const [old] = FEATURE_PROMPT_HEALS.premiseDraft;
  expect(old).toContain("  - Never contradict the book's context.\n  - No title line");
  expect(old).not.toContain("Keep every fact");
});

// The server refuses a run whose variables lack a {{name}} its prompt uses (the kit's `render`,
// HTTP 400) — so a seeded sample missing one fails in the Lab for every user. Three writer samples
// predated {{storyContext}} / {{voiceCanon}} and did (found by `npm run eval`, 2026-10-16).
test("every seeded Lab sample carries every variable its actions' prompts use", async () => {
  const SP = await import("../src/seed_presets.js");
  const { render } = await import("@delebash/llm-runner/llm/prompts");
  const gaps = [];
  for (const sample of SP.DEFAULT_TEST_SAMPLES) {
    for (const action of sample.actions) {
      const prompt = DEFAULT_FEATURE_PROMPTS[action];
      if (!prompt) continue;
      try {
        render(`${prompt.system}${prompt.user_template}`, sample.variables);
      } catch (e) {
        gaps.push(`${action} · ${sample.label}: ${e.message}`);
      }
    }
  }
  expect(gaps).toEqual([]);
});

test("the prose actions share a story-context Lab sample, in the shape the client sends", async () => {
  const SP = await import("../src/seed_presets.js");
  const sample = SP.DEFAULT_TEST_SAMPLES.find((s) => s.label === "With story context");
  expect([...sample.actions].sort()).toEqual([...PROSE].sort());
  expect(sample.variables.storyContext.startsWith("\n\nSTORY CONTEXT\n## ")).toBe(true);
  expect(sample.variables.direction).toBeTruthy(); // guided continue's {{direction}}
});
