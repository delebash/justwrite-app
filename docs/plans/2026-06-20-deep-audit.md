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

### A7 — 🟡 [JV] `SettingsView.vue:907` persists a setting to `localStorage` "for now"
Violates the project's no-client-persistence rule (should be `/v1/settings`). Small, contained fix.

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
