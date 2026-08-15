# Architecture

> **⚠️ Historical note (2026-06-18):** JustWrite is now writing-only — all audio (Audio Studio, TTS, audiobook render, M4B, Speaker Lab / quote attribution, smart-cast) has moved to the separate **JustVoice** app, which JustWrite drives over an HTTP contract. Sections below that describe an in-app audio / TTS / Speaker-Lab subsystem are retained as project history and no longer reflect the shipping app.

> **⚠️ Second banner (docs campaign, 2026-08-04):** the phase narrative and "known
> limits" below are a BUILD-ERA record; several present-tense claims predate later
> rebuilds (usage → `/v1/ai-usage` server-side · RAG → server SQLite, no IndexedDB ·
> auto-rebuild + BM25 hybrid since shipped · Writer-Lab routes removed · CI/lint/test
> runner all exist now). All six named offenders are corrected inline with dated
> notes (2026-08-04 second pass — chat sessions, image carry-through, SQLite RAG,
> pooled sweep, removed Writer-Lab routes, display-only UpdatesPanel); where this
> file and `ai-features-roadmap.md` disagree, code sides with the roadmap.

The *why* behind major substrates and design decisions. Pairs with
[`CLAUDE.md`](../../CLAUDE.md) (the *what's where* primer) and
[`AGENTS.md`](../../AGENTS.md) (the *how we do things* conventions). This file
captures the architectural notes that aren't visible from reading code alone
— in-flight design explorations, deliberate trade-offs, lessons baked into
the substrate.

User-facing documentation lives in the other files under `docs/`. This page
is for contributors.

---

## Headless operation — why there is a Python server

**JustWrite must run headless: `justwrite-server serve` plus a browser gives the
whole app with no Tauri shell.** This is a product requirement, not a dev
convenience, and it is the reason JustWrite has a Python backend at all.

Headless means there is no webview to hold state, so every durable operation —
the book, projects, RAG, settings, AI — has to be served by a long-lived process
that runs with no renderer present. That process is the FastAPI + SQLite server
in `server/justwrite_server/`.

The pieces that implement it, so a reader can verify rather than trust this page:

- **`app.py`** — after every `/v1/*` router is mounted, `_locate_ui_dir()` finds
  the Vite build and `app.mount("/", StaticFiles(..., html=True))` serves it. The
  static mount is LAST so API routes always win. `JUSTWRITE_UI_DIR` overrides the
  search; without a `dist/` the server logs a warning and the API still runs.
  The renderer reaches it because the base URL is origin-aware — it targets
  `window.location.origin`, so the same bundle works under Tauri and under the
  server's own origin unchanged. That resolution is the KIT's since 2026-08-15
  (`installLlmUi({ devPorts, fallbackBase })`); the app-local
  `services/serverApi.js` is deleted, because three apps had three shapes for one
  job and docgen's — let the installer do it — was the right one.
- **`cli.py`** — `serve --host/--port/--data-dir`, defaulting to
  `127.0.0.1:17495`, with `JUSTWRITE_HOST` / `JUSTWRITE_PORT` /
  `JUSTWRITE_DATA_DIR` env overrides. A configurable bind is the tell: a
  loopback-only sidecar would hardcode it.
- **`auth.py`** — bearer-token middleware for running exposed. Off when no
  tokens are set; loopback bypasses unless `requireForLoopback`. Gates `/v1`
  only, so the UI and its assets always load and a browser can reach the app.
  Surfaced in **Settings → Server** (`SettingsView.vue`; the section was keyed
  "general" until the 2026-08-06 parity batch), documented for users
  in [`docs/headless-access.md`](../headless-access.md).
- **`csrf.py`** — same-origin mutations are allowed precisely because the
  self-hosted UI is a first-class mode. This was a real 403 found on 2026-07-15
  driving the server-hosted UI; the smoke missed it by running against the dev
  origin.

### Storage policy — drop and reseed, no migrations (the live ruling)

Decided with the user 2026-06-18, still the standing pre-release policy `CLAUDE.md`
enforces: every datum is a real SQL resource behind a typed `/v1/*` API — no
IndexedDB, no localStorage shim, no generic blob store. Schema changes ship by
DROP-AND-RESEED, never migrations; additive-only changes need no reset because
`create_all` picks up new tables on boot. (The migration-era plan that produced
this ruling is history: `docs/plans/archive/2026-06-18-unified-storage-no-idb.md`.)

### What this rules out

- **The Tauri SQL plugin cannot replace the server.** It lives inside the Tauri
  app — no app, no database — so it cannot serve a headless client by
  construction. It is recorded as a "no backend process" option in
  `docs/plans/archive/2026-06-18-cross-app-runner-and-jw-backend-decision.md`; headless
  is what closed that door.
- **`llm_runner` staying Python is downstream of this.** JustWrite has a
  long-lived Python process because of headless, and JustVoice has one for its
  DSP stack (scipy / pyloudnorm / python-stretch). The shared runner mounts
  in-process in both, so its language costs neither app an extra process. Any
  "port the runner to Rust" proposal has to start by re-deciding headless.

The 2026-06-18 decision doc reached this outcome but recorded the trigger as
Android-readiness, with Android still a "maybe". Headless is the actual and much
stronger justification; that doc is history, this is the current statement.

---

## What's shipped

A multi-phase build closed out late May / early June 2026, designed against
the reference app at [github.com/DoktorDaveJoos/manuscript](https://github.com/DoktorDaveJoos/manuscript).
Phases were locked up front; built and shipped in order.

- **Phase 1 — Import + lean audiobook path.** DOCX / EPUB / ODT / TXT parsers
  (`services/import/`), multilingual chapter detection, text normalization
  (smart quotes / dashes / ellipses / NFC), import wizard with three intents
  (resume editing / new book / narrate). `splitChapterAtScene` store action
  + RichEditor "Split here" command.
- **Phase 2 — Editor AI + diff machinery.** `services/writerAI.js`
  (rewrite/expand/tighten/continue + 6 prose-pass rules), `services/aiDiff.js`
  (`AiInsMark` + `AiDelMark` + accept/reject commands), `stores/ai.js`
  `usageLog` + `usageTotals` + `recordUsage()` with a per-model pricing
  table. Selection bubble menu in RichEditor.
- **Phase 3 — Analysis layer.** `services/analysis/styleMetrics.js`
  (deterministic per-chapter metrics — words / sentences / dialogue ratio /
  filter words / adverbs / passive / POV), `critique.js` (notes + structural
  analysis), `entityExtraction.js`, `entitySweep.js` (whole-book sweep — since
  rebuilt as a bounded-concurrency provider-aware pool with a crash-safe resume
  draft; the build-era sequential shape is history).
  `AnalysisView` gets the writing-year heatmap, milestones, style table.
  `chapter.critique` persists per chapter.
- **Phase 4 — Named versions + diff viewer.** `services/versionDiff.js` —
  LCS over paragraphs with del+ins pair detection promoting to word-level
  inline `mod` paragraphs. `VersionHistoryModal` adds compare-with-current
  and pick-two flows.
- **Phase 5 — Plot board.** `views/PlotBoardView.vue` — strands as rows,
  chapters as columns. `services/plotTemplates.js` ships Three-Act /
  Five-Act / Save the Cat / Hero's Journey / Story Circle. Drag-drop beats
  between cells; cross-strand drag preserves beat id via `project.moveBeat`.
- **Phase 6 — RAG.** `services/rag/` (chunker / vectorStore / indexer /
  chat). `OpenAICompatClient.embed()` works with OpenAI shape and Ollama
  native. `IndexBuildModal` for the indexing flow; `ChatPanel.vue` slide-in
  (⌘J) with citation chips that route back to chapters. Per-scene SHA
  dirty-detection. *(2026-08-04: the build-era "per-project IndexedDB store"
  became server SQLite — see `rag-design.md`.)*
- **Cross-cutting polish.** Command palette (⌘P), global find & replace
  (⌘⇧F), Writer Lab (its `/writer-lab` + `/debug/writer-lab` routes were later
  removed from the router — build-era note),
  Settings → AI usage dashboard, auto-save indicator, AI marks stripped from
  read / export / TTS / search / analysis, per-change diff stepper.

### Known limits / deferred

- ~~Multi-turn RAG chat~~ *Shipped since (2026-08-04 correction):* `rag/chat.js`
  carries the last 8 messages with a stated truncation policy, and chat SESSIONS
  persist server-side (`api/chat_api.py`) — list/rename/delete, auto-titled.
- ~~**Auto-rebuild RAG index.**~~ *Shipped since (2026-08-04 correction):*
  `services/rag/autoIndex.js` silently re-embeds a minute after the last edit,
  gated on the `ai.autoRebuildRagIndex` setting — the "burning tokens silently"
  concern became an opt-in.
- ~~**Hybrid keyword + semantic RAG.**~~ *Shipped since (2026-08-04 correction):*
  BM25 rides beside cosine (`rag/{chunker,vectorStore,cards,chat}.js` +
  `server …/api/rag_api.py`); exact-string queries no longer depend on the embedding
  preserving surface form.
- ~~EPUB/ODT import strips images~~ *Corrected 2026-08-04:* `rewriteImageSrcs`
  (`services/import/index.js`) carries images into `imageStore` now. The old
  limitation as recorded: only paragraph text came through, with
  a warning; real image carry-through needed to thread bytes into
  `imageStore` and rewrite `<img>` `src`.
- **Scene-move detection in version diff.** ID-preserving moves work fine
  (matched by id). When ids change between versions (rare) it shows as full
  del + full ins. Would need fuzzy content matching.
- **Whole-book entity sweep is sequential.** One LLM call per chapter — for
  a 60-chapter book on a slow local model this can take a while. Could
  parallelize with a concurrency limit.
- **Layout sanity at narrow widths.** Not visually QA'd at <1100px; some
  grids assume desktop.

---

## AI task panel

The global task queue is the KIT's (`@delebash/llm-ui`: `stores/aiTasks.js`,
`AiStatusButton`, `AiStatusPanel`, `AiTaskStrip` — this section described them as
app files long after C3 moved them; a 2026-08-07 audit found four stale claims
here, all fixed below). The header chip shows running count + pulsing dot;
clicking opens the panel: Running (full diagnostics — elapsed, first-token
latency, tokens, tok/s, freshness, expandable preview, cancel), Recent
(just-finished rows lingering per `FAMILY_TASK_LINGER` — completed 5 s ·
cancelled 3 s · failed until dismissed, error text + Retry on the row), then a
50-entry history.

**Why this exists:**

1. Users wanted feedback on every AI call, not just modal-housed ones.
2. Calls should keep running when you navigate away.
3. Explicit cancel everywhere.
4. Visibility into "is this stuck or still processing?" for long-running
   calls (smart-cast, script analysis) that used to be opaque.

Audio Studio's smart-assign + re-analyze were the worst offenders — no progress,
no cancel, and a stuck-on-"Analyzing…" bug from local refs not resetting.

**How any AI feature plugs in:** pass `task: { label, meta }` (or
`task: true`) to the kit's `runAiFeature` / `runAiFeatureStream` (the name
`runAiStream` this paragraph used to cite no longer exists). The wrapper
registers the task, threads its `AbortSignal` automatically, and
finishes/fails it at the end. Caller `signals` and `onDelta` still work —
they're chained, not replaced.

**Per-call loading state** should derive from
`aiTasks.runningTasks.find(t => t.feature === 'X' && t.meta?.kind === scope)`
rather than local refs — that's what fixes the stuck-button bug and lets
state survive remounts.

Inline progress strip: the kit's `AiTaskStrip`, mounted per surface — never
copied. (`StudioTaskStrip.vue`, which this line used to point at, no longer
exists; "copy that pattern" was the exact anti-pattern the kit-first rule
exists to stop.)

**Discriminator convention for task lookups.** Concurrent calls of the same
feature (e.g. critique notes + structure, three `VariationsModal` columns)
get distinct `meta.kind` / `meta.variationRunId` / `meta.writerLabRunId` so
each surface finds its own task.

**Terminal-state surfaces** (Writer Lab, Variations) snapshot final
tokens/elapsed into a local `lastRun` ref on completion — tasks leave
`runningTasks` at finish but the diagnostic footer still needs the numbers.

**Stalled detection** (computed live off `tasks.now` ticking every 500 ms):
the shared `streamFreshness.js` classifier, RATE-RELATIVE since 2026-07-17 —
it calibrates to the stream's own mean inter-token gap (generous absolute
floors, then K× the measured pace), because the absolute 3 s/10 s thresholds
this section used to list mislabelled a healthy slow local model as
"stalling" for its entire run.

**Status (2026-06-05):** all 21 AI surfaces go through the global store +
`AiTaskStrip`. The older `useAiProgress` + `AiProgressBar` are DELETED.

---

## Quote Attribution (Speaker Lab)

Quote Attribution determines speaker per chapter for the audiobook render.
Bad attributions cascade: dialogue tags like "she said" get read in a
character voice instead of the narrator's, and ambiguous turns get assigned
with high confidence. This is an active design exploration — when a task
references quote attribution, speaker detection, dialogue tags, or the
Speaker Lab, prototype alternatives and compare, not "fix one line."

### The tier system is GONE (2026-08-07)

The renderer tier machinery this section used to document — the
`services/modelMeta.js` classifier mirror, the `ai.modelTiers` per-model
overrides, `resolveTier`/`tierSource`, and their tests — was deleted in the
family-wide tier-debris cleanup (decision text in
`../../../JustVioce/docs/dev/TASKS.md`). It was dead code with zero UI
consumers: attribution moved to JustVoice long ago (its Auto routes by
size there), and thinking/routing are preset-owned server-side (the
per-feature engine presets — "Routing by feature"). Nothing in JW resolves
tiers anymore.

### Ollama routing (load-bearing)

Two-layer architecture:

1. **Provider routing.** `OpenAICompatClient.chat()` / `chatStream()` branch
   on `detectRunner(provider)`. Ollama → `/api/chat` (NDJSON, top-level
   `think` field honored). Everything else → `/v1/chat/completions`.
   Runner auto-detected from baseUrl (`:11434` or `ollama` in URL) or
   explicit `provider.runner` field in Settings → AI providers.
2. **Call-site opt-in.** `think: false` is passed explicitly at each
   structured-output call site rather than auto-injected. Future creative
   features (writer's block, brainstorming) will omit `think` and benefit
   from reasoning.

**Why both:** Ollama's `/v1/chat/completions` silently ignores `think: false`
and moves reasoning into `message.reasoning`. The SSE stream only delivers
`delta.content`, so reasoning models hang for minutes before any output.
Verified via direct curl. The call-site opt-in shapes the task; routing
makes the toggle actually work.

**`num_ctx` default = 8192** in `_buildOllamaBody`. Ollama's runtime default
is 4096 regardless of model capability — silently truncates inputs
server-side (caught when Mistral-Small:24b only saw 10/12 dialogue tags).
Callers can override via `extra.options.num_ctx`.

### Model class defaults

- **Reasoning-first** (Qwen3.5, DeepSeek-R1, QwQ, GPT-OSS, magistral,
  glm-z\*) → `think: false` for JSON output. Otherwise `<think>` blocks
  bloat output and stall streams.
- **Hybrid** (Qwen3 14B+) → `think: true` measurably helps compositional
  tasks. The implicit CoT carries dialogue-tag → speaker resolution across
  the `, she said,` boundary that direct-answer mode trips on. 17/17 (think
  on) → 4 silent wrongs (think off) → 17/17 (think on) confirmed
  empirically.
- **Non-reasoning** (Llama 3.x, Phi-4, Mistral-Nemo, Mistral-Small 3, Gemma,
  Qwen 2.5) → `think` is a no-op. Leave default.
- **Tiny hybrids** (Qwen3:8b) — implicit reasoning isn't substantive at 8B;
  `think: false` is neutral.

### Three implementations in play

1. **Production** — `StudioView` Script tab. One LLM call per chapter,
   paragraph-granular attribution via `services/llm.js → detectSpeakers`.
2. **Speaker Lab → Audio Studio mode** (`/#/debug/speaker-lab`) — exact mirror of
   production with prompt/model/temperature knobs and A/B columns. Use this
   to evaluate prompt/model changes against current behavior before
   touching production.
3. **Speaker Lab → Inline-tag mode** — candidate replacement.
   Deterministically splits paragraphs by `"` into alternating narration /
   dialogue segments. Narration auto-attributed to narrator. Only dialogue
   spans go to the LLM, tagged `[D1]…[/D1]` etc., zipped back by index.

Speaker Lab also has a **Lab mode** — 2-stage entity extraction → quote
attribution with `{{text}}` / `{{cast}}` template vars + `localStorage`
presets. Research playground, not on the path to production.

### Open work

1. **Production prompt promotion.** `SPEAKER_SYSTEM` in `services/llm.js`
   still uses the old paragraph-granular prompt. Promotion to inline-tag
   style is pending user go-ahead.
2. **D4-style over-conservatism on contextual reply patterns.** "I am" in
   response to "Are you June Asari?" demotes to Unknown 40% because the
   strengthened rule reads strictly. Accepted as recoverable via review;
   could add a surgical positive example if common.
3. **Inline-tag promotion path.** Whether it becomes production, runs
   alongside as toggle, or stays debug-only.

### Closed dead ends (don't re-investigate)

- **LM Studio per-quant variant loading.** LM Studio exposes `variants` and
  `selected_variant` in `/api/v1/models` but has no API/CLI path to switch
  which variant is loaded. UI-only. Use Ollama for quant A/B work (each
  quant is a distinct model tag like `qwen3:8b-q4_K_M`).
- **Qwen3.5 family.** Qwen3.5 ≠ Qwen3+. Different training mix optimized
  for math/code/multilingual. Qwen3:8b Guided beats Qwen3.5:9b on Sample
  Ch.3 (9/9 vs 8/9).

### Measured reference points (historical — the tier-era attribution runs)

- **Routine attribution:** Qwen3:8b Guided. ~18s, ~87% on real chapters.
- **Pre-render audit:** Qwen3:14B with thinking on (the era's "Reasoned"
  config). ~2 min, 12/12 with calibrated variable confidence (70–100%).
- **Faster audit alternative:** Mistral-Small:24b Direct. ~1:28, strictly
  better error profile than Guided.

---

## Marketing site & docs flow

There is a separate Astro marketing website at `../justwrite-website/` —
NOT inside this repo. Stack: Astro 6.x, plain JS, dark default with light
toggle, deploys to GitHub Pages.

**Structure:** three destinations, top nav in `Base.astro` with active-link
detection.

- `/` Overview — Hero · Yours · Sketches · Colophon · Find it
- `/features` Features — Features · Inside · FAQ
- `/docs/` Docs — built from `justwrite-app/docs/*.md` via
  `scripts/sync-docs.js` at prebuild

### Docs flow

User documentation lives in `justwrite-app/docs/*.md` and is the **source
of truth**. Two consumers:

1. **The app itself** — bundles docs at build time via
   `services/helpDocs.js` and renders them in-app via `HelpView.vue` (route
   `/help/:slug?`). The in-app "Open on the web" button jumps to the
   marketing-site copy. `HELP_WEB_BASE` in `services/helpDocs.js` is the
   in-app link target.
2. **The marketing site** — publishes the **latest released version's**
   docs at `https://delebash.github.io/justwrite-website/docs/<slug>`
   (mirrors the app's `/help/<slug>` route). The site's `prebuild` step
   downloads `docs.tar.gz` from the app's latest GitHub release; only
   released docs ever go live.

When editing docs: edit them in `docs/` only — the marketing site mirrors
from there, never duplicate. Screenshots come from the
[E2E harness](#e2e-harness), not invented mockups.

---

## Release system

The app has a manual release pipeline. **Never** triggers on push, PR, or
tag — only via `npm run release` (which calls
`gh workflow run release.yml`). This is intentional.

**Why manual:** cross-platform Tauri build is expensive (~9 min cold, three
runners in parallel), so kicking it manually keeps cost and noise minimal.
Docs sync to the marketing site is the only "automatic" step, and it only
fires after a release completes.

### Walkthrough

1. `npm run bump <ver>` — bumps `package.json` and `src-tauri/tauri.conf.json`.
2. Manual commit + tag + push.
3. `npm run release` — dispatches the workflow against the tag.
   - Optional `--platform <windows|macos|linux>` (or `npm run
     release:windows` etc.) for single-platform iteration.
   - Re-running with a different platform later adds binaries to the same
     Release rather than replacing it.

### Workflow pipeline

`build` (per-platform installers) → `attach-docs` (`tar -czf docs.tar.gz
docs/` + `gh release upload`) → `notify-website` (POSTs `docs-updated`
repository\_dispatch to `delebash/justwrite-website` so its CI rebuilds).

### One-time setup (DONE 2026-06-04)

- `gh` CLI installed via `winget install GitHub.cli --scope=user`.
- Fine-grained PAT `WEBSITE_DISPATCH_TOKEN` set as a repo secret on
  `justwrite-app`. Scoped to `justwrite-website` with
  `Contents: read and write`.
- `justwrite-app` made public via `gh repo edit ... --visibility public` —
  the anonymous `/releases/latest` GitHub API returns 404 for private repos,
  which made `sync-docs.js` silently no-op even when releases existed.

### Skipped intentionally

- Code signing (macOS Gatekeeper + Windows SmartScreen warnings expected;
  cost of certs not yet justified)
- Auto-update — *still true as of 2026-08-04, with a nuance: Settings mounts the
  kit `UpdatesPanel`, which is DISPLAY-ONLY (current version + release notes from
  whats-new.md); there is no check/download/install machinery in Rust or JS.*
- Per-push CI checks — *stale as written (2026-08-04 correction): the repo now has
  `.github/workflows/release.yml`, biome (`biome.json`), and a 55-file vitest suite
  (`npm run test:unit`); what remains true is that none of it is per-push CI — the
  gates are run-by-hand (`npm run test:fast`).*

### Docs-only refresh without a full release

If you need to push doc updates to the live site without rebuilding
installers: `tar -czf docs.tar.gz docs/` → `gh release upload <latest-tag>
docs.tar.gz --clobber` → `gh api -X POST
repos/delebash/justwrite-website/dispatches -f event_type=docs-updated -f
'client_payload[tag]=<latest-tag>'`. The marketing site rebuilds in ~2-3
min. v0.1.1 was the first end-to-end smoke that validated this flow.

---

## E2E harness

JustWrite has a working WebDriver-driven test and screenshot harness at
`e2e/`.

**Stack:** `tauri-driver` (cargo-installed, `cargo install --locked
tauri-driver`) + a bundled `msedgedriver.exe` matched to the **WebView2
runtime** version — NOT Edge's (`e2e/scripts/fetch-driver.js`; the two
diverge and the mismatch bites). Talks raw W3C WebDriver HTTP from Node —
**no WebdriverIO** (the wdio deps were dropped in `f345de6`; v9 failed with
`UND_ERR_INVALID_ARG` on session create, v8 hung at session handshake).
Wrapper is `e2e/lib/driver.js` (~150 lines); tests via Node's built-in
`node --test`.

**Why this matters:** earlier attempts to capture views by driving the
renderer in browser-mode (`npm run dev:vite` + Playwright + IDB injection)
succeeded for Home / Analysis / Plot board but failed silently for Audio Studio /
Settings / Worldbuilding / Timeline — lazy-loaded views error at mount when
run in vanilla browser. The Tauri harness gets all of them.

### How to use it

- `cd e2e && npm run capture` — drives the production binary at
  `src-tauri/target/release/justwrite.exe` through routes listed in
  `capture-direct.js:TARGETS` and saves PNGs to
  `../../justwrite-website/public/screenshots/`. Add routes by appending to
  the array.
- `cd e2e && npm test` — runs `tests/*.test.js` against the same binary.
  7 passing smoke tests, 1 skipped (theme switcher — needs `data-testid` on
  the reka-ui appearance cards before it can drive that widget).
- The production binary is whatever was last built. If source has drifted,
  run `npm run build` from the app root first.
- Don't run with your own JustWrite open during a capture/test — both share
  AppData and IDB; autosave will race.

This is THE pipeline for getting visuals into the marketing site — never
invent mockups.

---

## Curated tag vocabulary

The curated tag vocabulary feature was shipped 2026-06-04. Four design
decisions, made deliberately:

- **Scope: per-kind.** Characters / locations / objects / worldbuilding
  each have their own curated set. Mirrors how the typeahead pool already
  works (derived per-kind in each view).
- **Defaults: empty.** No starter vocabulary ships. Tags are opinionated by
  genre/style; defaults would be irrelevant for most projects.
- **Storage: per-project.** Lives in `project.tagVocabularies` (state slice
  + `HISTORY_SLICES`). Sci-fi novel's vocab differs from a memoir's;
  project-scoped fits that.
- **Visual: distinct.** Curated chips and suggestions get a subtle
  `var(--accent)` dot via `::before` (rather than `border-color`, which
  fights theme changes). Curated entries appear first in the typeahead
  dropdown.

**Canonicalization rule.** When committing a tag, `TagEditor`
case-insensitively matches the typed value against curated labels. A match
stores the canonical curated form — typing "Antagonist" with curated
"antagonist" stores "antagonist". This is the splinter-prevention
mechanism. Ad-hoc tags (no curated match) store as typed.

If someone proposes "global tags shared across projects" or "ship a starter
tag set", flag it as a reversal of an explicit decision and confirm before
implementing.
