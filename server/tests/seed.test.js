// SPDX-License-Identifier: MIT
// Port of tests/test_seed.py — workspace seeding: the default LLM providers the server
// creates on a fresh install, and the ON-DEMAND sample book (QC-40, user 2026-07-10: not
// seeded at boot — a fresh install has NO projects and the renderer lands on its welcome
// screen; "Try tutorial project" creates the sample via POST /v1/projects/demo).
//
// The sample is DATA-DRIVEN (2026-07-12): its content is a bundled book folder
// (`samples/<name>/book.json`). So these tests assert the MECHANISM and the STRUCTURE — the
// sample loads, creates a normal editable project, and round-trips — not the specific book.
//
// seedWorkspace() uses the open database, which createApp(tmp) opened — so constructing a
// client first points the seeders at the test's tmp database. Python read the class-tune
// rows through the SQLAlchemy model; here with SQL from the same table.
import { stores } from "@delebash/llm-runner/llm";
import { DEFAULT_PROVIDERS, seedDefaultProviders } from "@delebash/llm-runner/llm/seed";
import { expect, test } from "vitest";
import * as bookIo from "../src/book_io.js";
import { DEMO_PROJECT_ID, demoBookSnapshot, listSamples } from "../src/database/demo_seed.js";
import { seedWorkspace } from "../src/database/seed.js";
import { state } from "../src/database/session.js";
import * as SP from "../src/seed_presets.js";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

const c_ = () => client(tmpPath());

test("seed_creates_providers_but_no_demo", async () => {
  const c = await c_();
  // Nothing until seeded — createApp stays pure so the rest of the suite starts empty.
  expect((await c.get("/v1/projects")).json()).toEqual([]);

  seedWorkspace();

  // QC-40: no demo project, no active pointer — the fresh workspace is EMPTY (the renderer
  // shows the welcome screen; zero projects is a valid state).
  expect((await c.get("/v1/projects")).json()).toEqual([]);
  const settings = (await c.get("/v1/settings")).json();
  expect("activeProjectId" in settings).toBe(false);
  expect("demoSeeded" in settings).toBe(false);

  const providers = (await c.get("/v1/llm-providers")).json().providers;
  expect(providers.length).toBe(DEFAULT_PROVIDERS.length);
  const byId = Object.fromEntries(providers.map((p) => [p.id, p]));
  for (const id of ["local-llamacpp", "openai", "claude", "openrouter"]) expect(id in byId).toBe(true);
  // The shared response shape carries providerType. Native SDK adapters back
  // claude/gemini/ollama (#15 C1), so the seed rows carry the real types.
  expect(byId.openai.providerType).toBe("openai");
  expect(byId.claude.providerType).toBe("anthropic");
  expect(byId["local-llamacpp"].providerType).toBe("local-llamacpp");
  // Seeded providers are registered into the shared adapter registry at boot.
  expect(providers.every((p) => p.registered)).toBe(true);
});

test("demo_created_on_demand", async () => {
  const c = await c_();
  seedWorkspace();

  // The tutorial button's endpoint creates the sample project with its fixed id, carrying
  // whatever title/author the bundled sample declares (content-agnostic)…
  const r = (await c.post("/v1/projects/demo")).json();
  expect(r.id === DEMO_PROJECT_ID && r.created === true).toBe(true);
  expect(typeof r.title === "string" && r.title).toBeTruthy();
  expect("author" in r).toBe(true);
  expect((await c.get("/v1/projects")).json().map((p) => p.id)).toEqual([DEMO_PROJECT_ID]);
  // …a second click returns the SAME project (never a duplicate)…
  const r2 = (await c.post("/v1/projects/demo")).json();
  expect(r2.created === false && r2.id === DEMO_PROJECT_ID).toBe(true);
  expect((await c.get("/v1/projects")).json().length).toBe(1);
  // …and after the user deletes it, the button can bring it back.
  expect((await c.delete(`/v1/projects/${DEMO_PROJECT_ID}`)).statusCode).toBe(204);
  expect((await c.post("/v1/projects/demo")).json().created).toBe(true);
  expect((await c.get("/v1/projects")).json().map((p) => p.id)).toEqual([DEMO_PROJECT_ID]);
  // It never touches the active pointer — the renderer switches itself.
  expect("activeProjectId" in (await c.get("/v1/settings")).json()).toBe(false);
});

test("sample_round_trips_as_an_editable_project", async () => {
  // The bundled sample decomposes into a project and assembles back — a valid, editable
  // book. Checks are SHAPE-only (content-agnostic).
  await c_();
  const h = state.handle;
  bookIo.decompose(h, DEMO_PROJECT_ID, demoBookSnapshot());
  const snap = bookIo.assemble(h, DEMO_PROJECT_ID);

  // Non-empty core structure.
  expect(snap.project.title).toBeTruthy();
  expect(snap.parts.length > 0 && snap.parts.reduce((n, p) => n + p.chapters.length, 0) >= 1).toBe(true);
  expect(snap.characters.length).toBeGreaterThan(0);
  const allSceneIds = new Set(Object.values(snap.scenes).flatMap((ch) => ch.map((s) => s.id)));
  expect(allSceneIds.size).toBeGreaterThan(0); // at least one scene

  // Scene ids are minted scn_{chId}_{i+1}.
  for (const [chId, scenes] of Object.entries(snap.scenes)) {
    for (const [i, s] of scenes.entries()) expect(s.id).toBe(`scn_${chId}_${i + 1}`);
  }

  // Character extras only exist for real characters.
  const charIds = new Set(snap.characters.map((ch) => ch.id));
  for (const k of Object.keys(snap.characterExtras)) expect(charIds.has(k)).toBe(true);

  // Every strand beat that names a scene points at a scene that exists.
  for (const strand of snap.strands) {
    for (const beat of strand.beats || []) {
      if (beat.sceneId) expect(allSceneIds.has(beat.sceneId), `dangling beat ${beat.id}`).toBe(true);
    }
  }
});

test("a_sample_is_bundled", () => {
  // A bundled sample folder exists (samples/<name>/book.json) and the default one loads as a
  // valid snapshot with the exact keys book_io consumes.
  expect(listSamples().length, "no bundled sample folders found under samples/").toBeGreaterThan(0);
  const snap = demoBookSnapshot();
  expect(new Set(Object.keys(snap))).toEqual(
    new Set([
      "project", "parts", "scenes", "characters", "characterExtras", "locations",
      "objects", "groups", "strands", "notes", "architecture", "worldbuilding",
      "worldbuildingCategories", "tagVocabularies", "statuses", "images", "events",
      "trash", "dailyRecaps", "reverseOutline", "beatSheets", "plotHoles",
      "voiceCanonChapterIds", "relationshipArcs", "marketingPack", "worldRules",
    ]),
  );
});

test("seed_is_idempotent", async () => {
  const c = await c_();
  seedWorkspace();
  seedWorkspace(); // second boot
  // Still no projects (QC-40); providers not duplicated.
  expect((await c.get("/v1/projects")).json()).toEqual([]);
  expect((await c.get("/v1/llm-providers")).json().providers.length).toBe(DEFAULT_PROVIDERS.length);
});

test("boot_never_resurrects_a_deleted_demo", async () => {
  const c = await c_();
  seedWorkspace();
  await c.post("/v1/projects/demo");
  expect((await c.delete(`/v1/projects/${DEMO_PROJECT_ID}`)).statusCode).toBe(204);
  seedWorkspace(); // next boot seeds nothing (QC-40) — the deletion stands
  expect((await c.get("/v1/projects")).json()).toEqual([]);
});

test("providers_merge_missing_without_clobbering", async () => {
  const c = await c_();
  // A user-customized list: one built-in id with an edited key, plus a custom row — added
  // through the per-provider router.
  expect((await c.post("/v1/llm-providers", { json: { id: "openai", name: "OpenAI", providerType: "openai", apiKey: "sk-user" } })).statusCode).toBe(201);
  expect((await c.post("/v1/llm-providers", { json: { id: "my-ollama", name: "My box", providerType: "openai-compat" } })).statusCode).toBe(201);

  const h = state.handle;
  const added = h.tx(() => seedDefaultProviders(h));

  expect(added).toBe(DEFAULT_PROVIDERS.length - 1); // every built-in except the present "openai"
  const providers = Object.fromEntries((await c.get("/v1/llm-providers")).json().providers.map((p) => [p.id, p]));
  // Missing built-ins added; the user's edit + custom row preserved.
  expect("claude" in providers && "local-llamacpp" in providers).toBe(true);
  expect(providers.openai.hasApiKey).toBe(true); // the user's key survived the merge
  expect(providers["my-ollama"].name).toBe("My box");
});

test("reset_reseeds_workspace", async () => {
  const c = await c_();
  seedWorkspace();
  // Add some user data on top of the seed.
  await c.put("/v1/projects/prj_user", { json: { project: { title: "Mine" } } });
  await c.patch("/v1/settings", { json: { ui: { x: 1 } } });

  expect((await c.post("/v1/data/reset")).statusCode).toBe(200);

  // User project gone; reset behaves like first run — an EMPTY workspace (QC-40), providers
  // back.
  expect((await c.get("/v1/projects")).json()).toEqual([]);
  const settings = (await c.get("/v1/settings")).json();
  expect("ui" in settings).toBe(false);
  expect("demoSeeded" in settings).toBe(false);
  expect((await c.get("/v1/llm-providers")).json().providers.length).toBe(DEFAULT_PROVIDERS.length);
});

test("seed_presets_refs_and_samples", async () => {
  // The 2026-07-15 one-source mint: 10 built-in presets, the per-action refs, the catch-all
  // default, and one test-sample row per (action, blob). Every count is DERIVED from the seed
  // source, never hardcoded.
  await c_();
  seedWorkspace();

  const presets = stores.getEnginePresetStore().list();
  const refs = stores.getFeaturePresetRefStore().list();
  const samples = stores.getTestSampleStore().listForAction();

  // 10 built-in presets, exactly the mint ids.
  expect(new Set(presets.map((p) => p.id))).toEqual(new Set(SP.DEFAULT_ENGINE_PRESETS.map((d) => d.id)));
  expect(presets.length === SP.DEFAULT_ENGINE_PRESETS.length && presets.length === 10).toBe(true);
  // every preset carries its OWN temperature (no null abstains any more).
  expect(presets.every((p) => p.temperature !== null && p.temperature !== undefined)).toBe(true);

  // the per-action refs, exactly the mint map; each points at a real preset.
  expect(refs).toEqual(SP.DEFAULT_FEATURE_PRESETS);
  expect(Object.keys(refs).length).toBe(39);
  const ids = new Set(presets.map((p) => p.id));
  expect(Object.values(refs).every((pid) => ids.has(pid))).toBe(true);

  // the catch-all default preset (⚑3).
  expect(stores.getDefaultPresetId() === SP.DEFAULT_PRESET_ID && SP.DEFAULT_PRESET_ID === "p_prose_edit").toBe(true);

  // test samples: ONE row per (action, blob) — the count is derived from the list, and every
  // seeded action has at least one sample (the author-once fan-out).
  const expected = SP.DEFAULT_TEST_SAMPLES.reduce((n, r) => n + r.actions.length, 0);
  expect(samples.length).toBe(expected);
  expect(new Set(samples.map((r) => r.action))).toEqual(new Set(Object.keys(refs)));
});

test("curated_catalog_and_measured_knowledge_are_jw_data_now", async () => {
  // Decision ④ (family parity batch 2026-08-05): the writing-curated catalog + its measured
  // class tunes + the embed task templates moved from the kit's shared seed into JW's own —
  // ids unchanged, so existing DBs keep everything. This guards the moved data end-to-end:
  // it must SERVE through the app, and the embed ladder's rank facts hold here now.
  const c = await c_();
  seedWorkspace();

  // The whole catalog = the daily driver + the moved curated ladder, exact ids.
  const rows = Object.fromEntries(stores.getModelCatalogStore().list().map((r) => [r.id, r]));
  const expectIds = new Set([...SP.DEFAULT_MODEL_CATALOG_EXTRA.map((d) => d.id), ...SP.JW_CURATED_CATALOG.map((d) => d.id)]);
  expect(new Set(Object.keys(rows))).toEqual(expectIds);
  expect(SP.JW_CURATED_CATALOG.length).toBe(10);

  // The embed ladder facts (moved with the rows): proven 8B outranks the untested KaLM
  // contender ON PURPOSE; the 4B is the always-eligible CPU band.
  const ranks = Object.fromEntries(SP.JW_CURATED_CATALOG.filter((d) => d.embedding).map((d) => [d.id, d.quality_rank]));
  expect(ranks["qwen3-embedding-8b"]).toBeLessThan(ranks["kalm-embedding-gemma3-12b"]);
  expect(ranks["kalm-embedding-gemma3-12b"]).toBeLessThan(ranks["qwen3-embedding-4b"]);
  expect(rows["qwen3-embedding-4b"].tier).toBe("cpu");

  // The instruct-side embed templates seed for all three rows.
  const st = stores.getEmbedTemplateStore();
  for (const tpl of SP.JW_EMBED_TEMPLATES) {
    const row = st.get(tpl.id);
    expect(row !== null && row.queryTemplate.startsWith("Instruct: ")).toBe(true);
  }

  // The 13 measured class-tune rows (incl. the author's 8 GB/32 GB n_cpu_moe 21) seed under
  // their measured ids.
  const h = state.handle;
  const pairs = new Set(h.all("SELECT * FROM class_tunes").map((r) => `${r.model_id}|${r.class_key}`));
  const got = Object.fromEntries(
    h
      .all("SELECT * FROM class_tunes WHERE model_id = ? AND class_key = ?", ["gemma-4-26b-a4b-qat", "dgpu-vram8|ram32"])
      .map((r) => [r.flag_name, r.flag_value]),
  );
  for (const t of SP.JW_CLASS_TUNES) expect(pairs.has(`${t.model_id}|${t.class_key}`)).toBe(true);
  expect(SP.JW_CLASS_TUNES.length).toBe(13);
  expect(got.n_cpu_moe === "21" && got.ctx_len === "32768").toBe(true);

  // And the moved rows actually SERVE — the catalog endpoint carries the ladder.
  const served = new Set((await c.get("/v1/ai/model-catalog")).json().rows.map((r) => r.id));
  for (const id of expectIds) expect(served.has(id)).toBe(true);
});
