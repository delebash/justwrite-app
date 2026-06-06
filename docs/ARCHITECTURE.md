# Architecture

The *why* behind major substrates and design decisions. Pairs with
[`CLAUDE.md`](../CLAUDE.md) (the *what's where* primer) and
[`AGENTS.md`](../AGENTS.md) (the *how we do things* conventions). This file
captures the architectural notes that aren't visible from reading code alone
— in-flight design explorations, deliberate trade-offs, lessons baked into
the substrate.

User-facing documentation lives in the other files under `docs/`. This page
is for contributors.

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
  analysis), `entityExtraction.js`, `entitySweep.js` (whole-book sweep).
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
  (⌘J) with citation chips that route back to chapters. Per-project
  IndexedDB store with per-scene SHA dirty-detection.
- **Cross-cutting polish.** Command palette (⌘P), global find & replace
  (⌘⇧F), Writer Lab (user `/writer-lab` + debug `/debug/writer-lab`),
  Settings → AI usage dashboard, auto-save indicator, AI marks stripped from
  read / export / TTS / search / analysis, per-change diff stepper.

### Known limits / deferred

- **Multi-turn RAG chat.** `rag/chat.js` is single-turn (Q → A, reset on
  next Q). Multi-turn would need a thread store + truncation policy.
- **Auto-rebuild RAG index.** Incremental SHA-diff is implemented but never
  auto-fires; user must hit "Update" in the chat panel. Burning local-LLM
  tokens silently on every save felt wrong.
- **Hybrid keyword + semantic RAG.** Pure cosine only. Exact-string queries
  ("find every mention of the brass key") miss when the embedding model
  doesn't preserve surface form.
- **EPUB/ODT import strips images.** Only paragraph text comes through, with
  a warning. Real image carry-through would need to thread bytes into
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

A global `useAiTasksStore` (`stores/aiTasks.js`) tracks in-flight AI
chat-stream calls so they survive the component that started them. The
header chip (`AiStatusButton.vue` in `TitleBar`) shows running count +
pulsing dot. Clicking opens `AiStatusPanel.vue` (right-side slide-in)
listing each running task with full diagnostics — elapsed, first-token
latency, tokens, tokens/s, last-token freshness, expandable preview, cancel
— plus a 30-entry history of completed/cancelled/errored calls.

**Why this exists:**

1. Users wanted feedback on every AI call, not just modal-housed ones.
2. Calls should keep running when you navigate away.
3. Explicit cancel everywhere.
4. Visibility into "is this stuck or still processing?" for long-running
   calls (smart-cast, script analysis) that used to be opaque.

Audio Studio's smart-assign + re-analyze were the worst offenders — no progress,
no cancel, and a stuck-on-"Analyzing…" bug from local refs not resetting.

**How any AI feature plugs in:** pass `task: { label, meta }` (or
`task: true`) to `runAiStream`. The wrapper registers the task, threads its
`AbortSignal` automatically, and finishes/fails it at the end. Caller
`signals` and `onDelta` still work — they're chained, not replaced.

**Per-call loading state** should derive from
`aiTasks.runningTasks.find(t => t.feature === 'X' && t.meta?.kind === scope)`
rather than local refs — that's what fixes the stuck-button bug and lets
state survive remounts.

Inline progress strip (a slim version of the panel rows) lives in
`StudioTaskStrip.vue` — copy that pattern for other views.

**Discriminator convention for task lookups.** Concurrent calls of the same
feature (e.g. critique notes + structure, three `VariationsModal` columns)
get distinct `meta.kind` / `meta.variationRunId` / `meta.writerLabRunId` so
each surface finds its own task.

**Terminal-state surfaces** (Writer Lab, Variations) snapshot final
tokens/elapsed into a local `lastRun` ref on completion — tasks leave
`runningTasks` at finish but the diagnostic footer still needs the numbers.

**Stalled detection rules** (computed live off `tasks.now` ticking every
500ms):

- `< 3s` since last token → "live" (green)
- `3–10s` → "stalling" (yellow, pulsing)
- `> 10s` → "stuck" (red, pulsing) — strong signal the user should cancel

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

### Three-tier system

Replaces the older 8B/14B+ profile naming with a capability-axis tier model
that scales from laptops to RTX 5090 + 70B reasoning models.

**Tier registry** (`services/modelMeta.js`):

| Tier | Prompt body | think | floor | Targets |
|---|---|---|---|---|
| **Guided** | `INLINE_SPEAKER_SYSTEM_GUIDED` (strict rules + 4 worked examples) | false | 0.7 | Sub-12B; safe fallback for unknown models |
| **Direct** | `INLINE_SPEAKER_SYSTEM_DIRECT` (strict rules only) | false | 0.5 | 12B-class non-reasoning (Mistral-Small 24B, Phi-4-14B, Llama 70B) |
| **Reasoned** | `INLINE_SPEAKER_SYSTEM_DIRECT` | true | 0.5 | 14B+ hybrid (Qwen3:14B+) + reasoning-first models |

Direct and Reasoned share prompt body — only `think` differs.

**Resolution order:**

1. **Heuristic** — `getModelTier(modelId)` in `services/modelMeta.js`.
   Reasoning-first families (qwen3.5\*, DeepSeek-R1, QwQ, GPT-OSS,
   magistral, glm-z\*, \*-thinking) → reasoned. Qwen3 14B/30B/32B/72B
   hybrids → reasoned. Mistral-small/large, phi-4, Llama 3.x 70B/405B,
   gemma3:12B/27B → direct. Sub-12B/unknown → guided.
2. **User pin (override)** — `ai.modelTiers[modelId]`. Set via
   `ai.setModelTier(id, tier)`; cleared via `clearModelTier(id)`.
   Persisted.
3. **Resolution** — `ai.resolveTier(modelId)` returns the full tier object.
   `ai.tierSource(modelId)` returns `"pinned"` or `"auto"` for UI badges.

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

### Current daily drivers (reference points)

- **Routine attribution:** Qwen3:8b Guided. ~18s, ~87% on real chapters.
- **Pre-render audit (gold standard):** Qwen3:14B Reasoned. ~2 min, 12/12
  with calibrated variable confidence (70–100%).
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
  `scripts/sync-docs.mjs` at prebuild

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
  which made `sync-docs.mjs` silently no-op even when releases existed.

### Skipped intentionally

- Code signing (macOS Gatekeeper + Windows SmartScreen warnings expected;
  cost of certs not yet justified)
- Auto-update
- Per-push CI checks (no `check.yml`, no lint, no test runner — consistent
  with the existing "no test runner" project rule)

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
tauri-driver`) + a bundled `msedgedriver.exe` matched to the local Edge
version (downloaded from `https://msedgedriver.microsoft.com/<version>/
edgedriver_win64.zip`). Talks raw W3C WebDriver HTTP from Node — **no
WebdriverIO** (v9 fails with `UND_ERR_INVALID_ARG` on session create; v8
hangs at session handshake with no diagnostic). Wrapper is
`lib/driver.mjs` (~150 lines); tests via Node's built-in `node --test`.

**Why this matters:** earlier attempts to capture views by driving the
renderer in browser-mode (`npm run dev:vite` + Playwright + IDB injection)
succeeded for Home / Analysis / Plot board but failed silently for Audio Studio /
Settings / Worldbuilding / Timeline — lazy-loaded views error at mount when
run in vanilla browser. The Tauri harness gets all of them.

### How to use it

- `cd e2e && npm run capture` — drives the production binary at
  `src-tauri/target/release/justwrite.exe` through routes listed in
  `capture-direct.mjs:TARGETS` and saves PNGs to
  `../../justwrite-website/public/screenshots/`. Add routes by appending to
  the array.
- `cd e2e && npm test` — runs `tests/*.test.mjs` against the same binary.
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
