# Deep audit — JustVoice + JustWrite (2026-06-20)

Cross-app audit for refactoring / performance / sloppy code. Same file committed
in both repos. Findings are **cited (file:line or jscpd/grep counts)**; this is a
backlog, ordered by value/effort. "Ruled out" lists things that look sloppy but
were checked and are fine.

## Method (what was swept)
- Sloppy/patch markers (TODO/FIXME/HACK/workaround/"for now") — both renderers + servers.
- Debug cruft (console.log/debug) — both renderers.
- Duplication — `jscpd` on both renderers + `grep` on shared helpers.
- File size (god-files).
- Perf patterns (setInterval/polling, JSON deep-clone, deep watchers).
- **Boot network** — real Playwright capture of every request on load (prod for JV via /ui/, dev for JW).

---

## A. Confirmed findings

### A1 — 🔴 [JW] Helper copy-paste across `services/` (jscpd: 167 clones, 3.0% tokens)
Private helpers pasted verbatim:
- `htmlToText` — **19 files** (all `services/analysis/*` + `resumeBriefing`, `sessionRecap`, `stuckDiagnostic`, `voiceFingerprint`, `versionDiff`, `writerAI`)
- `parseJsonLoose` — **14 files** · `tailWords` — 7 · `firstParagraph` — 4 · `stripHtml` — 4
**Fix:** one `services/analysis/_shared.js` (or `services/llmText.js`); import. ~300–400 lines removed. Mechanical, safe. *Refactor → per-file plan before applying (RULE #5).*

### A2 — 🟠 [JW] Analysis LLM-call scaffold duplication
Bodies cloned beyond the helpers: `characterAudit.js ↔ marketingPack.js` (100 lines), `↔ reverseOutline.js` (100), `multiReaderCritique ↔ readerKnowledge/plotHoleScan/threadExtraction` (~46 each). `characterAudit.js` is in 14 clones. **Fix:** shared `runJsonAnalysis({ html, system, schema, … })`.

### A3 — 🟠 [JW] Large CSS clones
`WriterLabDebugView ↔ WriterLabView` (**164 lines**), `PlotBoardView ↔ WriterLabView` (98), plus `CharactersView`, `BeatSheetModal`. **Fix:** promote shared rules to `styles.css`.

### A4 — 🟡 [JW] Entity-view JS duplication
`LocationsView ↔ ObjectsView` (41 lines). **Fix:** shared composable (`useEntityCrudView`).

### A5 — 🔴 [JV+JW] Help docs eagerly loaded at boot  ← the "concepts.md" the user saw
`services/helpDocs.js` (JV `:18-20`, JW `:12-14`):
```js
import.meta.glob("../../../../docs/*.md", { eager: true, query: "?raw" })
```
`eager: true` pulls **every** `docs/*.md` at boot — separate module requests in dev (`concepts.md`, `core-concepts.md`, …), bundled into the boot JS in prod — even if the user never opens Help. **Fix:** `eager: false`; load a doc on Help-drawer open (`getDoc` → async, await in `JvHelpDrawer` `watch(slug)`). Removes all help prose from the boot path.

### A6 — 🔴 [JV] Duplicate boot API calls (Playwright-captured)
On load the same endpoints are fetched by multiple independent callers, uncoordinated:
- `/v1/settings` ×3 · `/v1/health` ×3 · `/v1/engines` ×2 (**7.4 KB each**) · `/v1/projects` ×2 · `/v1/system/info` ×2
Sources incl. `stores/onboarding.js:39` (settings), `stores/engines.js:24` + `components/RecommendCard.vue:36` (engines), `App.vue:267` + `services/connection.js` (health). **Done (partial):** in-flight GET dedupe added to JV `services/serverApi.js` `request()` — collapsed the *concurrent* dups (`/v1/engines` ×2→×1 incl. the 7.4 KB body, `/v1/system/info` ×2→×1). **Remaining (deferred):** sequential dups across boot phases — `/v1/health` ×3 (`connection.js` gate + `App.vue:267` + `OverviewView:116`), `/v1/settings` ×2 (`onboarding.js:39` re-reads the whole doc for `.app` + boot), `/v1/projects` ×2 (activeProject store + `prefs.js:76`). ~2.6 KB; needs a shared boot-hydrate (fetch-once-distribute), per-caller — NOT a TTL cache (the masking anti-pattern the project rules forbid).

### A7 — 🟠 [JV] Capture/dictation settings: dead localStorage + client/server model mismatch
`SettingsView.vue:907-921` loads a `capture` ref from `localStorage`
(`justvoice:capture_settings`) that **nothing ever writes** (no `setItem`) — so
the settings never persist. Worse, the client shape doesn't match the server's:
client `capture` (singular, camelCase: `sttModel:"turbo"`, `llmModel:"1.7B"`,
`refinementMode:"smart-cleanup"`, `allowAutoPaste`, `defaultPlaybackVoice`) vs
server `settings.captures` (`CapturesSettings`, snake_case: `stt_model:"whisper-turbo"`,
`llm_model:"qwen3-llm-0.6b"`, separate `smart_cleanup`/`self_correction`/
`preserve_technical` bools, `allow_auto_paste`, `default_playback_voice`).
**Fix (deferred — model reconciliation, not a persistence swap):** align the UI
option values to the server's variant ids, split `refinementMode` into the
server's booleans, bind controls to `settings.captures.*` + `@change="saveDebounced"`
(the established pattern, e.g. `SettingsView.vue:1797`), drop the dead localStorage.
Rushing it would ship capture options that don't match real engine variants.

### A8 — 🟡 [JV+JW] God-files (design refactor — needs seam agreement)
JV: `StudioView.vue` 2690 · `SettingsView.vue` 2600 · `EnginesView.vue` 1467 · `ChapterView.vue` 1439 · `GenerateView.vue` 1278 · `VoicesView.vue` 1227.
JW: `SettingsView.vue` 2476 · `RichEditor.vue` 2146 · `ChaptersView.vue` 1949 · `AnalysisView.vue` 1317 · `Sidebar.vue` 1218. (`project.js` 2099 = sanctioned monolith, leave.)
**Fix:** split into sub-components/composables — but agree the seams first, per view.

---

## B. Ruled out (checked — NOT issues)
- **JW "plugin stuff" in network:** 160 dev requests = normal vite-dev unbundled ESM (127 app modules + vendor); @tiptap extensions are pre-bundled by vite (4 requests). Prod bundles to a few chunks. Not a code issue.
- **Debug cruft:** 1 guarded `console.debug` (`AudioKeepAlive.vue:63`). Clean.
- **Perf timers:** JV `renderTasks.js:48` 10Hz tick is gated to active tasks; `App.vue:313` health poll stops on connect; `Sidebar` nowTick 15s. None unbounded.
- **`JSON.parse(JSON.stringify())`** clones are on user-action paths, not hot loops.
- **Markers:** ~no real TODO/HACK debt; hits were tooltips/tempfiles/AI-prompt prose.

---

## C. Recommended order
1. **A5** eager→lazy help docs (both apps) — small, high-impact on boot. *(done?)*
2. **A6** JV boot-API dedupe — high-impact on boot.
3. **A7** JV localStorage→/v1/settings — quick correctness.
4. **A1** JW helper dedup — biggest sloppy-code win (per-file plan first).
5. **A2/A3/A4** JW scaffold + CSS + entity-view dedup.
6. **A8** god-file splits — per-view, seams agreed first.

## D. Per-file logic audit (deeper pass) — IN PROGRESS
Beyond the mechanical sweep above, a per-file read of each view for logic-level
issues (the RULE #5 strict-diff). Done incrementally, a batch at a time. Batches
recorded here as completed.

### Batch 1 — JV `App.vue` (boot/nav orchestrator, ~480 ln) — read in full
Mostly clean (routing, kind-driven nav filter, i18n fallback, first-run wiring all correct;
`resolveInitialTab` properly fired by the `hydrated` watch at :287). Findings:
- 🟡 **Dead `HELP_SLUG_BY_VIEW` keys** (`App.vue:150-155`): `train`/`compare`/`cache`/`audio`/`channels`/`webhooks` are no longer route names (they became Labs/Advanced sub-tabs) — `currentHelpSlug` lookups by `route.name` can never hit them. Harmless dead entries; drop or remap to `labs`/`settings`.
- 🔵 **Root listeners never removed** (`App.vue:129` mousedown, :328 visibilitychange, :333/:335 window events): acceptable for the root component (lives for the app's lifetime), but the switcher-close `mousedown` is registered at setup top-level while the rest are in `onMounted` — inconsistent; move it into `onMounted` for consistency.
- (boot `/v1/health` fetch here is part of A6's remaining sequential dups.)


### Batch 2 — JW `services/` LLM-text helpers, read & compared variant-by-variant
The mechanical sweep counted these as "clones"; reading the *divergence* found a real bug.
- 🔴 **BUG — `analysis/entityExtraction.js` `parseJsonLoose` is the lone weak variant.** 13 of 14
  `parseJsonLoose` defs strip `<think>…</think>` and use `extractBalanced` (brace-matching);
  entityExtraction alone strips neither and uses a greedy `match(/\{[\s\S]*\}/)`. On reasoning
  models (deepseek-reasoner, qwen3-thinking — supported) the `{` inside `<think>` reasoning is
  swallowed → `JSON.parse` fails → **entity extraction silently returns null** while every other
  analysis feature works. Verified: grep of all 14 defs shows `entityExtraction = think0/balanced0/regex1`,
  the rest `think1/balanced1`. Fix: replace with the robust shared `parseJsonLoose` (the A1 reconciliation).
- 🟡 **`htmlToText` scene-mark inconsistency.** 4 files (`critique`, `entityExtraction`, `readerKnowledge`,
  `threadExtraction`) strip `.ai-del`/`.ai-ins` but not `.scene-mark`; 9 others strip all three. Minor
  (scene-break dividers are near-empty), but inconsistent prompt input across features on the same chapter.
- ✅ **Checked, NOT bugs:** `marker-mark` is a TipTap Mark wrapping *real prose* (note lives in
  data-attrs) → keeping its text is correct. `htmlToText`'s `.ai-del`/`.ai-ins` class selectors work
  (`aiDiff.js:32,43` renders the class alongside the data-attr). All `.map(async)` are `Promise.all`-wrapped.
- **Reframes A1:** the dedup is NOT a mechanical lift — it's a *reconciliation to the robust versions*
  (`parseJsonLoose` w/ `<think>`-strip + `extractBalanced`; `htmlToText` full-strip), which FIXES the
  entityExtraction bug + the scene-mark drift as a side effect. `htmlToText` has 9 variants, `stripHtml` 4,
  `tailWords` 4 — each needs the canonical pick chosen deliberately, not auto-merged.

