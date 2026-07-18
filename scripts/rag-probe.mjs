// RAG story-bible acceptance probe (the 2026-07-11 build —
// docs/plans/2026-07-11-rag-story-bible-build.md §T7). Proves the shipped
// behavior end-to-end in the real renderer against the live server:
//
//   1. E1+E3 — the entity sweep's accept path keeps its receipts: the review
//      modal shows editable aliases (E3) and accepting creates the entities
//      AND links them to their origin chapters' scenes (E1).
//   2. E2 — the "Link scenes" backfill modal proposes missing links for
//      existing bible entities over the whole book and applies the ticked ones.
//   3. Move 0 — the embeddings requests carry the model's task templates:
//      every index-build input is "search_document: …", the ask-time query is
//      "search_query: …". The assert runs against the SEEDED catalog model id
//      (nomic-embed-text) so a template row exists — an arbitrary model id
//      would pass through and the assertion could never fire (panel note).
//   4. Move 1+2 — "Who is <character>?" pins the story-bible card as [1]
//      (citation shows "pinned" + the kind-aware label) and the prompt the
//      LLM received contains the card excerpt.
//   5. Move 3 — scene excerpts in the prompt carry their links line.
//   6. A card citation click-through lands on the entity's page.
//   7. An un-named-entity question ("who runs the customs house") still
//      surfaces a story-bible card.
//
// Determinism: NO real models. A stub OpenAI-compat server (in-process)
// serves embeddings as normalized bag-of-words hash vectors (lexical overlap
// ≈ cosine similarity — rankings are stable) and chat completions as canned
// frames; the entity-extraction responses are keyed on unique demo-book
// prose so exactly two chapters propose entities. The demo book (The
// Cartographer's Daughter) is created fresh and every write is restored:
// presets/routing/settings back from snapshots, the stub provider deleted,
// the demo's rag index + chat thread cleared, the demo book itself deleted
// (and re-created pristine when it pre-existed). findChrome copied from
// scripts/headless-smoke.mjs per JW CLAUDE.md — never hardcode the path.
//
// Run: JW server :17495 + vite :1420 up, then `node scripts/rag-probe.mjs`.

import { createServer } from "node:http";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.JW_BASE || "http://localhost:1420";
const API = process.env.JW_API || "http://127.0.0.1:17495";
const STUB_PORT = 8977;
// ⛔ CONTENT-COUPLED FIXTURE (re-authored 2026-07-18 to "The Ninth Facet" —
// the documented follow-up of the 2026-07-12 sample swap): the stub extraction
// responses, scene-title matchers, and expected entities are keyed to prose the
// author wrote but never made bible entries — verified unique at re-authoring:
//   "lantern and a ledger"  → ch2 "The road to the Nine" ONLY (Old Sedge's origin)
//   "waiting to be chosen"  → ch1 "The slate board" ONLY (the Slate board's origin)
//   "Old Sedge"             → ch2 road + ch4 "What they carried out" (E2's backfill)
//   "Sedge" (alias)         → also ch2 "The candle that un-burns" (alias-driven E1 link)
// If the sample's prose changes again, re-verify those four with a grep over
// samples/the-ninth-facet/book.json before touching any assertion.
const DEMO_ID = "prj_sample_ninth_facet";
const EMBED_MODEL = "nomic-embed-text"; // seeded catalog id — its template row must fire

function findChrome() {
  if (process.env.JW_CHROME && existsSync(process.env.JW_CHROME)) return process.env.JW_CHROME;
  for (const root of ["/opt/pw-browsers", `${process.env.HOME || ""}/.cache/ms-playwright`]) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      if (!dir.startsWith("chromium") || dir.includes("headless_shell")) continue;
      const exe = `${root}/${dir}/chrome-linux/chrome`;
      if (existsSync(exe)) return exe;
    }
  }
  return undefined;
}

const results = [];
const check = (name, ok, note = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (path, opts = {}) => {
  const r = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!r.ok && r.status !== 204) throw new Error(`${path} → ${r.status}`);
  try { return await r.json(); } catch { return {}; }
};

// ── The stub OpenAI-compat provider ───────────────────────────────────────
// Bag-of-words hash embedding: cosine similarity ≈ token overlap, fully
// deterministic. 96 dims is plenty for a 40-chunk book.
function bowVector(text) {
  const dims = 96;
  const v = new Array(dims).fill(0);
  for (const tok of String(text).toLowerCase().match(/[a-z0-9']+/g) || []) {
    let h = 0;
    for (let i = 0; i < tok.length; i++) h = (h * 31 + tok.charCodeAt(i)) >>> 0;
    v[h % dims] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

// Extraction responses keyed on unique demo prose (see the ⛔ banner above):
// "waiting to be chosen" is only in Ch1's "The slate board"; "lantern and a
// ledger" only in Ch2's "The road to the Nine". Every other chapter proposes
// nothing. Both proposed names exist VERBATIM in the sample's prose (E1 links
// by scanning origin-chapter scenes for name/alias mentions).
const SLATE_JSON = JSON.stringify({
  characters: [], locations: [],
  objects: [{ name: "Slate board", kind: "Guild fixture", note: "Where the Hall's commissions go up." }],
});
const SEDGE_JSON = JSON.stringify({
  characters: [{ name: "Old Sedge", role: "Watchman at the Nine", oneLiner: "Keeps the ledger of who goes in — and who comes out.", aliases: ["Sedge"] }],
  locations: [], objects: [],
});
const EMPTY_JSON = JSON.stringify({ characters: [], locations: [], objects: [] });

const stubState = { embedInputs: [], chatBodies: [] };

function sseFrames(res, content) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

const stub = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    const url = req.url || "";
    if (url.startsWith("/models")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "rag-probe-chat" }, { id: EMBED_MODEL }] }));
      return;
    }
    let body = {};
    try { body = JSON.parse(raw || "{}"); } catch { /* keep {} */ }
    if (url.startsWith("/embeddings")) {
      const inputs = Array.isArray(body.input) ? body.input : [body.input];
      stubState.embedInputs.push(...inputs.map(String));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: inputs.map((t) => ({ embedding: bowVector(t) })), model: body.model }));
      return;
    }
    if (url.startsWith("/chat/completions")) {
      stubState.chatBodies.push(body);
      const text = JSON.stringify(body.messages || []);
      let content;
      if (body.response_format) {
        content = text.includes("waiting to be chosen") ? SLATE_JSON
          : text.includes("lantern and a ledger") ? SEDGE_JSON
          : EMPTY_JSON;
      } else {
        content = "Grounded answer from the excerpts. [1]";
      }
      if (body.stream) { sseFrames(res, content); return; }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        model: body.model, choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }));
      return;
    }
    res.writeHead(404); res.end("{}");
  });
});
await new Promise((r) => stub.listen(STUB_PORT, "127.0.0.1", r));

// ── Snapshots (everything the probe writes is restored at the end) ────────
const origSettings = await api("/v1/settings").catch(() => ({}));
const origRouting = await api("/v1/ai/routing");
const origPresets = (await api("/v1/ai/engine-presets")).presets || [];
const origAssignments = await api("/v1/ai/preset-assignments");
const demoWasPresent = ((await api("/v1/projects")) || []).some((p) => p.id === DEMO_ID);

// The presets the cascade can resolve to (a feature's ref or the default). 2026-07-15
// one-source: the assignment map is `features` (action→presetId); the task tier is gone.
const assignedIds = new Set(Object.values(origAssignments.features || {}).filter(Boolean));
if (origAssignments.defaultPresetId) assignedIds.add(origAssignments.defaultPresetId);

// ── Setup: stub provider + routing + presets + a fresh demo book ──────────
const temp = await api("/v1/llm-providers", {
  method: "POST",
  body: { name: "RAG Probe", providerType: "openai-compat", baseUrl: `http://127.0.0.1:${STUB_PORT}`,
          local: true, defaultModel: "rag-probe-chat", embeddingModel: EMBED_MODEL },
});
for (const p of origPresets) {
  if (!assignedIds.has(p.id)) continue;
  await api(`/v1/ai/engine-presets/${p.id}`, { method: "PUT", body: { ...p, providerId: temp.id, model: "rag-probe-chat" } });
}
await api("/v1/ai/routing", {
  method: "PUT",
  body: { default: { ...(origRouting.default || {}), embeddingId: temp.id, embeddingModel: EMBED_MODEL },
          pins: origRouting.pins || {} },
});
if (demoWasPresent) await api(`/v1/projects/${DEMO_ID}`, { method: "DELETE" });
await api(`/v1/rag/${DEMO_ID}`, { method: "DELETE" }).catch(() => {});
await api("/v1/projects/demo", { method: "POST" });
await api("/v1/settings", { method: "PATCH", body: { activeProjectId: DEMO_ID } });

// Book helpers — the demo's scenes map is keyed by chapter id; resolve
// scenes/entities by their seeded titles/names so the probe never hardcodes ids.
async function book() { return api(`/v1/projects/${DEMO_ID}/book`); }
function sceneByTitle(bk, title) {
  for (const [chId, scenes] of Object.entries(bk.scenes || {})) {
    const s = (scenes || []).find((x) => x.title === title);
    if (s) return { chId, scene: s };
  }
  return null;
}
const entityByName = (list, name) => (list || []).find((e) => e.name === name);

const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 200)));

try {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await sleep(1800);
  try { await page.click('button:has-text("Got it")', { timeout: 1200 }); } catch { /* none */ }

  // ── Leg 1: E1 + E3 — the sweep keeps its receipts ────────────────────────
  await page.evaluate(() => { window.location.hash = "#/analysis"; });
  await sleep(900);
  await page.locator('button:has-text("Entity sweep")').click();
  await sleep(500);
  await page.locator('button:has-text("Scan the manuscript")').click();
  await page.locator(".er-section").first().waitFor({ timeout: 60000 });
  await sleep(300);

  // Proposal names live in <input> VALUES (not text nodes), so :has-text can't
  // see them — read the name inputs' values instead. Exactly one character row
  // (Margaret) exists, so its section's single alias input is unambiguous.
  const proposedNames = await page.locator(".er-row .er-name").evaluateAll((els) => els.map((e) => e.value));
  check("sweep: both canned proposals arrived (Old Sedge + Slate board)",
    proposedNames.includes("Old Sedge") && proposedNames.includes("Slate board"),
    JSON.stringify(proposedNames));
  const aliasVal = await page.locator('input[placeholder="aliases (comma-separated)"]')
    .first().inputValue().catch(() => "");
  check("E3: the review modal shows the proposed aliases, editable, on the character row",
    aliasVal === "Sedge", aliasVal);

  await page.locator('.ui-modal button:has-text("to story bible")').click();
  await sleep(900);

  let bk = await book();
  const slate = entityByName(bk.objects, "Slate board");
  const sedge = entityByName(bk.characters, "Old Sedge");
  check("E1: accepted entities exist in the bible with aliases kept",
    !!slate && !!sedge && (sedge.aliases || []).includes("Sedge"));
  const ch1s2 = sceneByTitle(bk, "The slate board");
  const ch2s1 = sceneByTitle(bk, "The road to the Nine");
  const ch2s3 = sceneByTitle(bk, "The candle that un-burns");
  check("E1: accept LINKED each entity to its origin chapter's mentioning scenes (alias-driven link included)",
    !!slate && !!sedge
    && (ch1s2?.scene.objects || []).includes(slate.id)
    && (ch2s1?.scene.characters || []).includes(sedge.id)
    && (ch2s3?.scene.characters || []).includes(sedge.id), // "Sedge said three went in" — the ALIAS hit
    JSON.stringify({ ch1s2: ch1s2?.scene.objects, ch2s1: ch2s1?.scene.characters, ch2s3: ch2s3?.scene.characters }));

  // ── Leg 2: E2 — the Link-scenes backfill modal ───────────────────────────
  // "Old Sedge" is also in Ch4 "What they carried out" — a scene E1's origin
  // scope (ch2 only) did NOT touch. The whole-book pass proposes it.
  await page.locator('button:has-text("Link scenes")').click();
  await page.locator(".lb-group").first().waitFor({ timeout: 15000 });
  check("E2: the backfill modal groups proposals per entity (Old Sedge group present)",
    (await page.locator('.lb-group:has-text("Old Sedge")').count()) === 1);
  check("E2: the group lists the unlinked mentioning scene (Ch4 'What they carried out')",
    (await page.locator('.lb-group:has-text("Old Sedge") .lb-row:has-text("What they carried out")').count()) === 1);
  await page.locator('.ui-modal button:has-text("Link ")').click();
  await sleep(900);
  bk = await book();
  const ch4s3 = sceneByTitle(bk, "What they carried out");
  check("E2: applying set the proposed link on the scene record",
    (ch4s3?.scene.characters || []).includes(sedge.id), JSON.stringify(ch4s3?.scene.characters));

  // ── Leg 3: index build — document-side template + cards in the index ─────
  await page.evaluate(() => { window.location.hash = "#/chapters"; });
  await sleep(700);
  await page.locator('[data-chat-toggle]:has-text("Ask the book")').first().click();
  await sleep(600);
  await page.locator('.chat-panel button:has-text("Build index")').click();
  await page.locator('[role="dialog"] button:has-text("Done")').waitFor({ timeout: 120000 });
  await page.locator('[role="dialog"] button:has-text("Done")').click();
  await sleep(600);

  const docInputs = stubState.embedInputs;
  check("Move 0 (document side): every index-build embed input carries the nomic prefix",
    docInputs.length > 0 && docInputs.every((t) => t.startsWith("search_document: ")),
    `${docInputs.length} inputs`);
  const sceneCount = Object.values(bk.scenes || {}).reduce((n, arr) => n + (arr || []).length, 0);
  const indexed = Number(await page.locator(".cp-status b").first().textContent());
  check("Move 1: the index holds scenes + story-bible cards (entryCount > scene count)",
    indexed > sceneCount, `${indexed} entries vs ${sceneCount} scenes`);

  // Ask helper: settle on citations OR surface the panel's error text so a
  // failed run diagnoses itself instead of dying on a blind timeout.
  async function askAndSettle(q) {
    await page.fill(".chat-panel textarea", q);
    await page.locator('.cp-input-actions button:has-text("Ask")').click();
    try {
      await page.locator(".cp-cite, .cp-error").first().waitFor({ timeout: 30000 });
    } catch (e) {
      // Self-diagnose instead of dying blind: panel + stub state at timeout.
      const state = await page.evaluate(() => ({
        msgs: [...document.querySelectorAll(".cp-msg")].map((m) => m.textContent.trim().slice(0, 60)),
        taValue: document.querySelector(".chat-panel textarea")?.value ?? "(no textarea)",
        askDisabled: [...document.querySelectorAll(".cp-input-actions button")].map((b) => b.disabled),
        strip: document.querySelector(".chat-panel .ui-taskstrip, .chat-panel [class*=strip]")?.textContent?.trim().slice(0, 80) || "",
      })).catch(() => ({}));
      console.log(`  TIMEOUT diag for "${q}": ${JSON.stringify(state)}`);
      console.log(`  stub: chats=${stubState.chatBodies.length} lastEmbeds=${JSON.stringify(stubState.embedInputs.slice(-2).map((t) => t.slice(0, 40)))}`);
      // The task ledger tells pending-vs-settled-vs-failed apart (this is how
      // the raw-object reactivity bug was pinned down when this probe was born).
      const tasks = await page.evaluate(async () => {
        try {
          const kit = await import("/@id/@delebash/llm-ui");
          const s = kit.useAiTasksStore();
          return {
            running: s.order.map((id) => ({ f: s.tasks[id]?.feature, st: s.tasks[id]?.status })),
            history: s.history.slice(0, 6).map((t) => ({ f: t.feature, st: t.status, err: String(t.error || "").slice(0, 160) })),
          };
        } catch (err) { return { importFailed: String(err).slice(0, 160) }; }
      }).catch((err) => ({ evaluateFailed: String(err).slice(0, 160) }));
      console.log(`  aiTasks: ${JSON.stringify(tasks)} pageErrors: ${JSON.stringify(pageErrors.slice(-4))}`);
      throw e;
    }
    await sleep(400);
    const err = await page.locator(".cp-error").last().textContent().catch(() => "");
    if (err?.trim()) console.log(`  panel error after "${q}": ${err.trim()}`);
    return err?.trim() || "";
  }

  // ── Leg 4: "Who is X?" — deterministic pin as [1] ────────────────────────
  // Odeline Marran on purpose: her card is small enough to stay UNSPLIT (the
  // 2026-07-18 card splitting), so the citation label is the plain entity name.
  const embedsBefore = stubState.embedInputs.length;
  const askErr = await askAndSettle("Who is Odeline Marran?");
  check("ask: the question settled with citations (no panel error)", !askErr, askErr);

  const firstCite = page.locator(".cp-cite").first();
  check("Move 2: the named character's bible card is pinned as [1]",
    (await firstCite.locator(".cp-cite-score").textContent())?.trim() === "pinned"
    && (await firstCite.locator(".cp-cite-meta").textContent())?.trim() === "Story Bible — Character: Odeline Marran");

  const queryInputs = stubState.embedInputs.slice(embedsBefore);
  check("Move 0 (query side): the ask-time embed input carries the query prefix",
    queryInputs.length > 0 && queryInputs.every((t) => t.startsWith("search_query: "))
    && queryInputs.some((t) => t.includes("Who is Odeline Marran?")));

  const lastChat = [...stubState.chatBodies].reverse().find((b) => !b.response_format);
  const promptText = JSON.stringify(lastChat?.messages || []);
  check("Move 1: the LLM prompt carried the card excerpt under its Story-Bible header",
    promptText.includes("Story Bible — Character: Odeline Marran"));
  // (Move 3 is asserted on leg 6's prompt below: a NAME query's top hits are all
  // bible cards since the 2026-07-18 card splitting, so this prompt legitimately
  // may carry no scene excerpt at all.)

  // ── Leg 5: card citation click-through → the entity page ────────────────
  const ode = entityByName(bk.characters, "Odeline Marran");
  await firstCite.click();
  await sleep(700);
  const hash = await page.evaluate(() => window.location.hash);
  check("Move 1: clicking the card citation lands on the entity's page",
    !!ode && hash === `#/characters/${ode.id}`, hash);

  // ── Leg 6: an entity-free question still surfaces bible cards ────────────
  // Since the corpus fallback (2026-07-18) a no-name question ALWAYS pins the
  // premise + main-cast roster, so this leg now proves pins + retrieval + the
  // citation pipeline together (it can no longer distinguish which surfaced it).
  await page.locator('[data-chat-toggle]:has-text("Ask the book")').first().click();
  await sleep(600);
  const askErr2 = await askAndSettle("who signed the ledger at the watch-hut");
  check("ask: the follow-up question settled (no panel error)", !askErr2, askErr2);
  const lastLabels = await page.locator(".cp-msg-assistant:last-of-type .cp-cite-meta").allTextContents();
  check("entity-free question: story-bible cards are among the citations (premise/roster pins + retrieval)",
    lastLabels.some((t) => t.trim().startsWith("Story Bible —")), JSON.stringify(lastLabels.slice(0, 3)));
  // Move 3 on THIS prompt: "signed/ledger/watch-hut" are road-scene PROSE words
  // (bow-hash retrieval is lexical), so that linked scene is in the top-k and
  // its entity-links line rides under its excerpt header.
  const lastChat2 = [...stubState.chatBodies].reverse().find((b) => !b.response_format);
  const promptText2 = JSON.stringify(lastChat2?.messages || []);
  check("Move 3: a scene excerpt in the prompt carried its links line",
    promptText2.includes("(Characters: "));
} finally {
  // ── Restore the DB exactly as found ──────────────────────────────────────
  try {
    for (const p of origPresets) {
      if (!assignedIds.has(p.id)) continue;
      await api(`/v1/ai/engine-presets/${p.id}`, { method: "PUT", body: p }).catch(() => {});
    }
    await api("/v1/ai/routing", { method: "PUT", body: { default: origRouting.default, pins: origRouting.pins || {} } }).catch(() => {});
    await api(`/v1/chat?projectId=${DEMO_ID}&mode=book&characterId=`, { method: "DELETE" }).catch(() => {});
    await api(`/v1/rag/${DEMO_ID}`, { method: "DELETE" }).catch(() => {});
    await api(`/v1/projects/${DEMO_ID}`, { method: "DELETE" }).catch(() => {});
    if (demoWasPresent) await api("/v1/projects/demo", { method: "POST" }).catch(() => {});
    if (origSettings?.activeProjectId !== undefined) {
      await api("/v1/settings", { method: "PATCH", body: { activeProjectId: origSettings.activeProjectId } }).catch(() => {});
    }
    await api(`/v1/llm-providers/${encodeURIComponent(temp.id)}`, { method: "DELETE" }).catch(() => {});
  } catch { /* best effort — the checks below verify */ }
  await browser.close();
  stub.close();
}

// Restore verification — the probe fails if it left state behind.
const endPresets = (await api("/v1/ai/engine-presets")).presets || [];
const presetsBack = origPresets.filter((p) => assignedIds.has(p.id)).every((p) => {
  const n = endPresets.find((x) => x.id === p.id);
  return n && (n.providerId || "") === (p.providerId || "") && n.model === p.model;
});
const endRouting = await api("/v1/ai/routing");
const routingBack = JSON.stringify(endRouting.default || {}) === JSON.stringify(origRouting.default || {});
const provGone = !((await api("/v1/llm-providers")).providers || []).some((p) => p.id === temp.id);
const demoBack = ((await api("/v1/projects")) || []).some((p) => p.id === DEMO_ID) === demoWasPresent;
check("cleanup: presets + routing + settings restored, stub provider deleted, demo as found",
  presetsBack && routingBack && provGone && demoBack,
  JSON.stringify({ presetsBack, routingBack, provGone, demoBack }));

console.log(`\npage errors: ${pageErrors.length}`);
for (const e of pageErrors) console.log(`  ${e}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed || pageErrors.length ? "RAG PROBE FAILED" : "RAG PROBE PASSED");
process.exit(failed || pageErrors.length ? 1 : 0);
