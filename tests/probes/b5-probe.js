// B5 probe (§0 #38-#47 + §7.2, 2026-07-09) — asserts the USER'S SENTENCES live:
// #38/#40 "i am not sure if we even want a provider model selector in the app
//   besides what we have for task and feature" → the ChatPanel bottom picker is
//   GONE; the header chip is a READ-ONLY "runs on" provenance chip that shows the
//   server-resolved route (/v1/ai/resolved-route) and CLICKING it opens the Tasks
//   tab (#/ai) instead of an edit popover.
// #46 "change new thread to new chat, and we need a delete chat" → both controls,
//   and Delete chat really deletes the stored conversation (server round-trip).
// #47 "make ask the book … bolder or in color" → the nav row carries the accent
//   treatment (semibold + accent ink).
// #41 "highlight a sentence right click and choose your ai action" → the context
//   menu appears on a selection right-click (with AI actions + edit ops). QC-41
//   (option 1, user 2026-07-10) superseded the old no-selection law: the menu now
//   ALWAYS opens — selection-only items disabled + the "Highlight text first"
//   hint, and the bottom "Show browser menu" passthrough row keeps the native
//   spell-check menu reachable (deep checks live in qcbatch-probe.js).
// #42 strikethrough management → a seeded pending change counts as pending while a
//   resolved strikethrough does NOT; Accept (default keep-strikethrough) resolves
//   the original in place; read mode hides strikethroughs; "Clear all
//   strikethroughs" removes every struck original and keeps the new text.
// #43 "change the word for view to view task que … move that from a toast to the
//   scene editors bottom bar" → a stubbed writerAI run completes with NO done-
//   toast; the bottom bar shows the notice + "View task queue"; ✕ dismisses.
// The probe is a REAL round-trip on the live API + UI; every write is restored
// (book snapshot + chat thread). findChrome copied from scripts/headless-smoke.js.
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
import { findChrome } from "../lib/smoke-common.js";
const { chromium } = require("playwright");
const API = "http://127.0.0.1:17495";


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

// ── Snapshot state the probe mutates (restored at the end). ──────────────────
const projects = await api("/v1/projects");
const projectId = (projects.projects || projects || [])[0]?.id
  || (Array.isArray(projects) ? projects[0]?.id : null);
if (!projectId) { console.error("no project on this DB — cannot probe"); process.exit(1); }
const origBook = await api(`/v1/projects/${projectId}/book`);
const bookCopy = JSON.parse(JSON.stringify(origBook));

// Seed a diff-marked scene body into the FIRST chapter's first scene:
// one PENDING change (del+ins pair, chg_pending) + one RESOLVED strikethrough.
const SEED_BODY =
  '<p>Calm opening prose stays untouched.</p>' +
  '<p><del data-ai-del data-change-id="chg_pending">the old pending original</del></p>' +
  '<p><ins data-ai-ins data-change-id="chg_pending">the new pending candidate</ins></p>' +
  '<p>Middle prose. <del data-ai-del data-ai-resolved data-change-id="chg_done">kept history strike</del> after it.</p>';
// Snapshot shape: parts[].chapters[] carry metadata; scene bodies live in the
// `scenes` dict keyed by chapter id (introspected live 2026-07-09).
const ch0 = (bookCopy.parts || []).flatMap((p) => p.chapters || [])[0];
const sceneList = ch0 && (bookCopy.scenes || {})[ch0.id];
if (!sceneList?.length) { console.error("first chapter has no scenes"); process.exit(1); }
const origSceneBody = sceneList[0].body;
sceneList[0].body = SEED_BODY;
await api(`/v1/projects/${projectId}/book`, { method: "PUT", body: bookCopy });

// Seed a book-mode chat SESSION so History has a real row to delete (2026-07-20
// sessions rewrite — chat is a per-project list of sessions, not one thread).
// Make projectId the active project so the panel lists this session.
const origActive = (await api("/v1/settings").catch(() => ({})))?.activeProjectId;
const PROBE_SESSION_ID = "chat_b5probe";
await api(`/v1/chat/sessions/${PROBE_SESSION_ID}`, { method: "PUT", body: {
  projectId, mode: "book", characterId: "", title: "probe question", messages: [
    { role: "user", content: "probe question" },
    { role: "assistant", content: "probe answer", citations: [] },
  ] } });
await api("/v1/settings", { method: "PATCH", body: { activeProjectId: projectId } });

const routeTruth = await api("/v1/ai/resolved-route?feature=chat");

const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));

// The chat panel's index status strip renders only when a manuscript index
// exists — this dev DB has none, so stub the status read. The chat-session
// round-trip below still hits the REAL /v1/chat/sessions API.
// NB: the renderer (:1420) fetches the API (:17495) CROSS-ORIGIN — a fulfilled
// route must carry CORS headers or the browser silently blocks it.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type",
};
await page.route("**/v1/rag/*/status", (route) =>
  route.fulfill({ status: 200, headers: { "content-type": "application/json", ...CORS },
    body: JSON.stringify({ exists: true, count: 42, model: "probe-embed", dims: 8 }) }));

try {
  await page.goto("http://localhost:1420", { waitUntil: "networkidle" });
  await sleep(1500);
  try { await page.click('button:has-text("Got it")', { timeout: 1500 }); } catch { /* none */ }

  // ── B5-4: Ask-the-book nav prominence ──────────────────────────────────────
  // The Ask-the-book nav row is the ACCENT one (B5-4 asserts this below). Scope
  // to it — the AI-tasks nav row also carries data-panel-toggle now (the shared
  // panel-dismiss refactor), so a bare [data-panel-toggle] is ambiguous.
  const askNav = page.locator('.nav-item-accent[data-panel-toggle]');
  const navStyle = await askNav.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { weight: cs.fontWeight, accent: el.classList.contains("nav-item-accent") };
  });
  const plainStyle = await page.locator(".nav-item:not(.nav-item-accent)").first()
    .evaluate((el) => getComputedStyle(el).color);
  const askColor = await askNav.evaluate((el) => getComputedStyle(el).color);
  check("B5-4 #47: Ask-the-book nav row is accent + semibold, distinct from plain rows",
    navStyle.accent && Number(navStyle.weight) >= 600 && askColor !== plainStyle,
    JSON.stringify({ ...navStyle, askColor, plainStyle }));

  // ── B5-1 + B5-3: the chat panel ─────────────────────────────────────────────
  await askNav.click();
  await sleep(1200);
  const panel = page.locator(".chat-panel");
  check("B5-1 #38: the bottom provider/model picker row is GONE",
    (await panel.locator(".cp-model-pick").count()) === 0);

  const chip = panel.locator(".afc-chip");
  check("B5-1 chip present in the header", (await chip.count()) === 1);
  const chipText = await chip.textContent();
  // Not-configured copy = "No model set · open AI settings" (user pick "b",
  // 2026-07-10 — the local-only "run Quick Setup" push is gone).
  check("B5-1 §7.2: the chip shows the SERVER-resolved model (task preset truth)",
    routeTruth.configured ? chipText.includes(routeTruth.model) : /No model set/.test(chipText),
    `chip="${chipText.trim()}" vs route=${routeTruth.model}`);

  // 2026-07-15 one-source rewrite (T6): the ChatPanel chips are now mounted
  // :editable — the click-to-edit preset doorway is RESTORED on the one-source
  // model. So clicking the chip opens its edit popover (.afc-pop, portalled) and
  // does NOT navigate away. (This supersedes the earlier B5-1 read-only assertion
  // that the click opened the Tasks tab; other chip mounts stay read-only — see
  // chip-probe on the Analysis surface.)
  const hashBefore = await page.evaluate(() => window.location.hash);
  await chip.click();
  await sleep(700);
  const popCount = await page.locator(".afc-pop").count();
  const hashAfter = await page.evaluate(() => window.location.hash);
  check("B5-1 T6: clicking the editable ChatPanel chip opens its preset edit doorway (.afc-pop), no navigation",
    popCount === 1 && hashAfter === hashBefore, `hash=${hashAfter} pop=${popCount}`);

  // Close the doorway, then re-open the panel from the nav.
  await page.keyboard.press("Escape");
  await sleep(400);
  await page.evaluate(() => { window.location.hash = "#/"; });
  await sleep(800);
  await askNav.click();
  await sleep(1200);

  // #46: "New chat" is now a header action (moved off the status strip, 2026-07-20).
  check("B5-3 #46: 'New chat' replaces 'New thread' (header action)",
    (await panel.locator('[aria-label="New chat"]').count()) === 1
    && (await panel.locator('button:has-text("New thread")').count()) === 0);

  // #46: "Delete chat" moved to a per-row control in the History view (each saved
  // conversation is its own session now). Open History, delete the seeded row.
  await panel.locator('[aria-label="Chat history"]').first().click({ force: true });
  await panel.locator(".cp-history").waitFor({ timeout: 5000 });
  const delRow = panel.locator('.cp-hist-row:has-text("probe question") [aria-label="Delete chat"]');
  check("B5-3 #46: History rows carry a per-row Delete control", (await delRow.count()) >= 1);
  await delRow.first().click({ force: true });
  await sleep(400);
  // The confirm dialog is `.ui-modal`; the chat panel is also role="dialog", so
  // scope to .ui-modal to stay unambiguous.
  const dlgText = await page.locator(".ui-modal").textContent();
  check("B5-3 delete confirms first", /Delete this chat\?/.test(dlgText));
  await page.locator('.ui-modal button:has-text("Delete chat")').first().click();
  await sleep(900);
  const sessionsAfter = await api(`/v1/chat/sessions?projectId=${encodeURIComponent(projectId)}`);
  check("B5-3 the stored conversation is really deleted (server round-trip)",
    !(sessionsAfter || []).some((s) => s.id === PROBE_SESSION_ID));
  await page.keyboard.press("Escape");
  await sleep(400);

  // ── B5-6: strikethrough management on the seeded chapter ───────────────────
  await page.evaluate((chId) => { window.location.hash = `#/chapters/${chId}`; }, ch0.id);
  await sleep(1500);
  // Enter the first scene if the overview is showing, then WAIT for the
  // seeded marks to be in the mounted editor before asserting anything.
  async function enterSeededScene() {
    // The chapter route lands on either the scene EDITOR or the chapter
    // OVERVIEW (no scene picked) — wait for whichever renders, then enter.
    const either = page.locator(".overview-scene-card, .manuscript-inner").first();
    await either.waitFor({ timeout: 10000 });
    const card = page.locator(".overview-scene-card").first();
    if (await card.count()) { await card.click(); }
    await page.locator("del[data-ai-del]").first().waitFor({ timeout: 10000 });
    await sleep(400);
  }
  await enterSeededScene();

  const barText = await page.locator(".ai-bar").textContent().catch(() => "");
  check("B5-6 #42: ONE pending change counted — the resolved strikethrough is history, not pending",
    /1 pending change/.test(barText) && !/2 pending/.test(barText), `bar="${(barText || "").trim()}"`);

  // Accept the pending change — default setting keeps the original struck.
  await page.locator('del[data-ai-del][data-change-id="chg_pending"]').click();
  await sleep(400);
  await page.locator('button:has-text("Accept this")').click();
  await sleep(600);
  const resolvedNow = await page.locator('del[data-ai-del][data-ai-resolved][data-change-id="chg_pending"]').count();
  const barGone = (await page.locator(".ai-bar").count()) === 0
    || !/pending change/.test(await page.locator(".ai-bar").textContent());
  const insUnwrapped = (await page.locator('ins[data-ai-ins][data-change-id="chg_pending"]').count()) === 0;
  check("B5-6 #42: Accept KEEPS the original as a resolved strikethrough (default setting) and the change stops being pending",
    resolvedNow === 1 && barGone && insUnwrapped,
    JSON.stringify({ resolvedNow, barGone, insUnwrapped }));

  // Read mode hides strikethroughs entirely (both kept-history strikes).
  await page.locator('.pane-actions button:has-text("Read")').click();
  await sleep(900);
  const readText = await page.locator(".read-content").textContent();
  check("B5-6 #42: read mode shows NO struck text; the accepted new text reads clean",
    !readText.includes("the old pending original") && !readText.includes("kept history strike")
    && readText.includes("the new pending candidate"));
  await page.locator('.pane-actions button:has-text("Edit")').click();
  await sleep(900);
  await enterSeededScene();

  // Clear all strikethroughs from the AI menu.
  await page.locator(".ai-strip-trigger").click();
  await sleep(400);
  const clearItem = page.locator('.ai-strip-item:has-text("Clear all strikethroughs")');
  check("B5-6 #42: 'Clear all strikethroughs' lives on the AI menu and is enabled",
    (await clearItem.count()) === 1 && !(await clearItem.isDisabled()));
  await clearItem.click();
  await sleep(700);
  const strikesLeft = await page.locator("del[data-ai-del]").count();
  const editorText = await page.locator(".manuscript-inner").textContent();
  check("B5-6 #42: every strikethrough removed; the accepted new text remains",
    strikesLeft === 0 && editorText.includes("the new pending candidate")
    && !editorText.includes("the old pending original") && !editorText.includes("kept history strike"));

  // ── B5-5: right-click context menu ──────────────────────────────────────────
  const firstPara = page.locator(".manuscript-inner p").first();
  await firstPara.click({ clickCount: 3 }); // select the paragraph
  await sleep(300);
  await firstPara.click({ button: "right" });
  await sleep(400);
  const ctx = page.locator(".ctx-menu");
  check("B5-5 #41: right-click on a selection opens the menu with AI actions + edit ops",
    (await ctx.count()) === 1
    && (await ctx.locator('.ctx-item:has-text("Rewrite")').count()) === 1
    && (await ctx.locator('.ctx-section:has-text("Line edits")').count()) === 1
    && (await ctx.locator('.ctx-item:has-text("Copy")').count()) === 1);
  await page.keyboard.press("Escape");
  await sleep(300);
  await firstPara.click(); // collapse the selection
  await sleep(200);
  await firstPara.click({ button: "right" });
  await sleep(400);
  // QC-41 (option 1): the menu ALWAYS opens; without a selection the
  // selection-only rows are disabled with the scope hint, and the passthrough
  // row is present.
  check("B5-5/QC-41: right-click WITHOUT a selection opens the menu — selection rows disabled + hint + passthrough row",
    (await page.locator(".ctx-menu").count()) === 1
    && (await page.locator('.ctx-item:has-text("Rewrite")').isDisabled())
    && (await page.locator('.ctx-section-hint:has-text("Highlight text first")').count()) === 1
    && (await page.locator('.ctx-item:has-text("Show browser menu")').count()) === 1);
  await page.keyboard.press("Escape");
  await sleep(300);

  // ── B5-7: completion notice on the bottom bar, not a toast ─────────────────
  await page.route("**/v1/ai/stream", async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: CORS });
    }
    await sleep(600);
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", ...CORS },
      body: 'data: {"delta": "Tightened text."}\n\n'
          + 'data: {"done": true, "promptTokens": 12, "completionTokens": 34}\n\n'
          + "data: [DONE]\n\n",
    });
  });
  await firstPara.click({ clickCount: 3 });
  await sleep(200);
  await page.locator(".ai-strip-trigger").click();
  await sleep(300);
  await page.locator('.ai-strip-item', { has: page.locator('.ai-strip-label', { hasText: /^Tighten$/ }) }).click();
  await sleep(2200);
  const note = page.locator(".ai-done-note");
  const noteText = (await note.textContent().catch(() => "")) || "";
  check("B5-7 #43: the completion notice sits on the editor's bottom bar (label + duration + tokens)",
    /Writer assist · Tighten/.test(noteText) && /done in [\d.]+s/.test(noteText) && /34 tokens/.test(noteText),
    `note="${noteText.trim()}"`);
  check("B5-7 #43: the 'View task queue' action is there (the old toast word 'View' is gone)",
    (await note.locator('button:has-text("View task queue")').count()) === 1);
  const doneToasts = await page.locator('[data-sonner-toast]:has-text("done in")').count();
  check("B5-7 #43: NO completion toast fired for the editor run", doneToasts === 0);
  await note.locator(".ai-done-x").click();
  await sleep(300);
  check("B5-7 ✕ dismisses the notice", (await page.locator(".ai-done-note").count()) === 0);
} finally {
  // ── Restore the DB exactly as found. ─────────────────────────────────────────
  try {
    sceneList[0].body = origSceneBody;
    await api(`/v1/projects/${projectId}/book`, { method: "PUT", body: bookCopy });
  } catch { /* keep going */ }
  try { await api(`/v1/chat/sessions/${PROBE_SESSION_ID}`, { method: "DELETE" }); } catch { /* */ }
  if (origActive !== undefined) {
    try { await api("/v1/settings", { method: "PATCH", body: { activeProjectId: origActive } }); } catch { /* */ }
  }
  await browser.close();
}

const restored = await api(`/v1/projects/${projectId}/book`);
check("cleanup: the probe scene body is back to the original",
  ((restored.scenes || {})[ch0.id]?.[0]?.body || "") === (origSceneBody || ""));

console.log(`\npage errors: ${errors.length}`);
for (const e of errors) console.log(`  ${e}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed || errors.length ? "B5 PROBE FAILED" : "B5 PROBE PASSED");
process.exit(failed || errors.length ? 1 : 0);
