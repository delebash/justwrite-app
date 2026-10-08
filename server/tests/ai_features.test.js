// SPDX-License-Identifier: MIT
// Port of tests/test_ai_features.py — /v1/ai/run, server-side feature execution: renders the
// action's server-side prompt template and dispatches through the shared dispatch, honoring
// the user's default provider from the routing store.
import { getLlmRegistry, LLMResponse, stores } from "@delebash/llm-runner/llm";
import { StreamDelta } from "@delebash/llm-runner/llm/base";
import { RoutingConfig } from "@delebash/llm-runner/llm/routing_api";
import * as seed from "@delebash/llm-runner/llm/seed";
import { model } from "@delebash/llm-runner/platform/models";
import { expect, test } from "vitest";
import { state } from "../src/database/session.js";
import { client as makeClient, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

const last = { value: {} };

class FakeAdapter {
  constructor(id = "p1", defaultModel = "gpt-4o-mini", text = '{"notes":[]}') {
    this.provider_id = id;
    this.provider_type = "openai-compat";
    this.default_model = defaultModel;
    this.text = text;
  }
  async chat(messages, { model: mdl = null, temperature = null, system = null, think = false } = {}) {
    if (this.provider_id === "p1") last.value = { messages, system, model: mdl, temperature, think };
    return LLMResponse({ text: this.text, model: mdl || this.default_model, prompt_tokens: 5, completion_tokens: 2 });
  }
  async *streamChat(messages, { system = null } = {}) {
    last.value = { messages, system };
    yield StreamDelta({ text: "hi " });
    yield StreamDelta({ text: "there" });
    yield StreamDelta({ done: true, prompt_tokens: 4, completion_tokens: 3 });
  }
  async models() {
    return [this.default_model];
  }
  async embed() {
    return [];
  }
  async ping() {
    return true;
  }
}

async function client(defaultId = "p1") {
  const c = await makeClient(tmpPath());
  const reg = getLlmRegistry();
  reg._adapters = new Map();
  reg.register(new FakeAdapter());
  // The shared seeder reads JW's registered prompts.
  state.handle.tx(() => seed.seedDefaultFeaturePrompts(state.handle));
  // Routing lives in the shared routing store (real tables) — set the global default provider
  // the dispatch reads. Per-feature pins are gone (2026-07-15 — the action's preset owns
  // routing); no preset is seeded here, so critique takes the no-preset route.
  stores.getRoutingStore().setRouting(model(RoutingConfig, { default: { llmId: defaultId } }));
  return c;
}

test("run_critique_dispatches_server_side", async () => {
  const c = await client();
  const r = await c.post("/v1/ai/run", {
    json: { action: "critique", variables: { chapter_label: "Chapter 4 — The Map\n\n", chapter_text: "He ran." } },
  });
  expect(r.statusCode, r.body).toBe(200);
  expect(r.json().content).toBe('{"notes":[]}');
  expect(r.json().model).toBe("gpt-4o-mini");
  // The server rendered the user template + passed the server-side system prompt.
  const user = last.value.messages[0].content;
  expect(user.includes("Chapter 4 — The Map") && user.includes("BEGIN CHAPTER") && user.includes("He ran.")).toBe(true);
  expect(last.value.system || "").toContain("fiction editor");
  // No preset seeded here → the no-preset route: temperature is NOT sent (null → the adapter
  // omits it, never fabricated), think off.
  expect(last.value.think).toBe(false);
  expect(last.value.temperature ?? null).toBeNull();
});

test("run_unregistered_provider_override_501", async () => {
  // A request provider override to an unregistered provider surfaces 501 cleanly (the Lab's
  // per-call route override).
  const c = await client();
  const r = await c.post("/v1/ai/run", {
    json: { action: "critique", variables: { chapter_label: "", chapter_text: "x" }, providerId: "ghost" },
  });
  expect(r.statusCode).toBe(501);
});

test("unknown_action_404", async () => {
  const c = await client();
  expect((await c.post("/v1/ai/run", { json: { action: "nope", variables: {} } })).statusCode).toBe(404);
});

test("migrated_actions_render_and_dispatch", async () => {
  const c = await client();
  const cases = [
    ["foreshadowing", { chapter_label: "Ch 1\n\n", chapter_text: "He hid the key." }, "He hid the key."],
    ["critiqueStructure", { chapter_label: "", chapter_text: "Tense scene." }, "Tense scene."],
    ["readerKnowledge", { user_content: "READER KNOWS: x\n--- BEGIN CHAPTER ---\ny\n--- END CHAPTER ---" }, "BEGIN CHAPTER"],
    ["entitySweep", { user_content: "Already in bible: (none)\nHalvard drew his sword." }, "Halvard"],
    ["characterAudit", { user_content: "CHARACTER PROFILE\nName: Mara\nShe smiled coldly." }, "Mara"],
    ["relationshipArc", { user_content: "PROFILE A — Mara\nPROFILE B — Joss" }, "PROFILE A"],
    ["voiceDrift", { user_content: "OUTLIER — Ch 5\nlots of dialogue" }, "OUTLIER"],
    ["beatSheet", { user_content: "FRAMEWORK: Save the Cat\nCh.1 opening image" }, "FRAMEWORK"],
    ["reverseOutline", { user_content: "The book has 5 chapters.\nCh.1 inciting" }, "5 chapters"],
    ["marketingPack", { user_content: "TITLE: The Map\nGENRE: thriller" }, "TITLE"],
    ["multiReaderGenre", { chapter_label: "Ch 1\n\n", chapter_text: "A cold hook." }, "A cold hook."],
    ["multiReaderBookClub", { chapter_label: "", chapter_text: "She wept." }, "She wept."],
    ["sensory", { user_content: "Subject: a tannery at dawn" }, "tannery"],
    ["unstuck", { user_content: "BEGIN PROSE\nShe stared at the door." }, "stared at the door"],
    ["recap", { user_content: "Today: 1200 words on Chapter 4." }, "Chapter 4"],
    ["briefing", { user_content: "Gap: 3 days. Last chapter: The Map." }, "The Map"],
    ["brainstorm", { label: "Character names", user_content: "Seed: exiled queens" }, "exiled queens"],
    ["brainstormPlot", { kind: "plot twists", user_content: "Seed: detective story" }, "detective story"],
  ];
  for (const [action, variables, needle] of cases) {
    const r = await c.post("/v1/ai/run", { json: { action, variables } });
    expect(r.statusCode, `${action}: ${r.body}`).toBe(200);
    expect(last.value.messages[0].content).toContain(needle); // template rendered the variables
  }
});

test("plotholes_renders_world_rules_into_system", async () => {
  // plotHoles templates the SYSTEM prompt — the project's world-rules section is substituted
  // server-side via {{world_rules_section}}.
  const c = await client();
  const r = await c.post("/v1/ai/run", {
    json: { action: "plotHoles", variables: { user_content: "chapter digest", world_rules_section: "\n\nEXTRA: magic costs blood." } },
  });
  expect(r.statusCode, r.body).toBe(200);
  expect(last.value.system).toContain("magic costs blood");
  expect(last.value.system).toContain("plot holes"); // base prompt still present
  expect(last.value.messages[0].content).toBe("chapter digest");
});

test("stream_endpoint_emits_sse", async () => {
  const c = await client();
  const r = await c.post("/v1/ai/stream", { json: { action: "critique", variables: { chapter_label: "", chapter_text: "x" } } });
  expect(r.statusCode).toBe(200);
  const body = r.body; // inject buffers the streamed body
  expect(body.includes('{"delta": "hi "}') && body.includes('{"delta": "there"}')).toBe(true);
  expect(body.includes('"done": true') && body.includes('"completionTokens": 3')).toBe(true);
  expect(body).toContain("data: [DONE]");
});

test("stream_unknown_action_404", async () => {
  const c = await client();
  expect((await c.post("/v1/ai/stream", { json: { action: "nope", variables: {} } })).statusCode).toBe(404);
});

test("provider_override_routes_to_named_provider", async () => {
  // The Writer Lab runs one action against a specific provider/model override.
  const c = await client();
  getLlmRegistry().register(new FakeAdapter("p2", "m2", "from-p2"));
  const r = await c.post("/v1/ai/run", {
    json: { action: "critique", variables: { chapter_label: "", chapter_text: "x" }, providerId: "p2", model: "m2" },
  });
  expect(r.statusCode, r.body).toBe(200);
  expect(r.json().content === "from-p2" && r.json().model === "m2").toBe(true);
});
