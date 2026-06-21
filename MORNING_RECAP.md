# Morning Recap — JustWrite

> The in-repo session-pickup doc — **current + future tasks and the live list of
> active plan docs.** Read this right after the global `~/.claude/CLAUDE.md` and
> this repo's `CLAUDE.md`. Stable architecture + rules live in `CLAUDE.md`, NOT
> here; deep per-task detail lives in `docs/plans/*`.

---

## ⮕ ACTIVE WORK — read first (2026-06-21)

**Current thread: the shared AI/LLM stack convergence.** JustWrite is the
**focus app** — build the shared GUI in service of JW first; JustVoice adopts the
identical result after. Branch: `claude/admiring-galileo-il3q0o` (all repos).
Authoritative plan: `docs/plans/2026-06-20-shared-ai-stack-plan.md` (20 settled
decisions + a reconciliation — read it before any AI work; do NOT re-litigate it).

Goal: JustWrite and JustVoice run the SAME AI stack — `just-llm-runner` (Python)
+ `@delebash/llm-ui` (plain-JS Vue) — differing ONLY in TTS (JV) and each app's
feature catalog.

**Done + pushed:**
- `just-llm-runner` split into `runner/` (local llama.cpp) + `llm/` (cloud
  providers + dispatch + prompts, incl. `make_prompt_router`/`make_feature_router`).
- `@delebash/llm-ui` is plain JS, self-contained (own `client.js` + `lu-*`
  `styles.css` + `Lu*` primitives + `PromptLab.vue`); the old `ProviderBackend`
  adapter is deleted (the UI calls the same endpoints both apps mount).
- JW server adopted the shared prompt subsystem (its per-app duplicates deleted);
  feature prompts are DB-seeded + Lab-editable via `/v1/ai/prompts` + `/v1/ai/run`
  + `/v1/ai/stream`.
- `PromptLab` mounted at JW `/ai-prompts` — screenshot-verified, native render.

**The A–F plan (JustWrite):**
- A ✅ shared prompt subsystem → `llm_runner`. B ✅ JW server adopts it.
- C 🔄 shared `@delebash/llm-ui`: **done** — PromptLab, ProviderForm (presets ·
  where-it-runs · model comboboxes via probe-models · test/save/delete),
  provider list (local/cloud rows), Usage stats, the bundled-runner model
  catalog (`GET /v1/llm-runner/models` + `LuModelCatalog.vue`: Model · Params ·
  Fit · Status · Load/Unload/Download, scoped to `local-llamacpp`), **and the
  Features routing table** (`/v1/ai/routing` + `FeaturesRouting.vue`: default
  LLM/embedding + Quick/Accuracy roles + per-feature provider▸model pins; wired
  so saved routing drives dispatch). Still to build — Quick Setup wizard,
  hardware presets, and the routing table's named-config / inline tune editor.
- D ✅ shared top-level **"AI"** menu area (`/ai` → `AiView` host chrome
  [PaneHeader + `.pane-card`] wrapping the naked `AiModelsArea`); sidebar entry.
- E ⬜ JW streaming features (writerAI / rag / characterChat) → `/v1/ai/stream`,
  then delete the old `/v1/llm/...` gateway (`api/llm.py`).

**Model-catalog deferrals** (built but honest gaps — no backend/data yet, NOT
skipped): numeric Fit score (needs the downloaded GGUF — `compute_fit`), per-
model delete-from-disk (no runner endpoint), free-form download-by-`repo:quant`
(manifest `/load` is id-only), and inline model-management for Ollama/LM-Studio
(they expose no per-model VRAM to score Fit; they keep the Fetch combobox).

**Features-routing deferrals / cleanup:** named production-configs (the table's
"Active config" column), the inline tune editor's max-tokens + Lab-compare, and
the 3-alternative-drafting toggle. **Cleanup owed (RULE #8):** JW's old
`SettingsView.vue` AI-features section now duplicates the shared Features tab
(both read/write the same `ai` settings blob) — remove that section + the
renderer's `AI_FEATURES` once the shared tab is accepted. The server feature
catalog (`feature_catalog.py`) is the single source; `DEFAULT_FEATURE_ROLES`
derives from it.

## Active plan docs
- `docs/plans/2026-06-20-shared-ai-stack-plan.md` — **authoritative** AI-stack plan (20 decisions).
- `docs/plans/2026-06-21-feature-prompts-db-seed.md` — feature-prompts-in-DB design (headless-first).
- `docs/plans/2026-06-20-engines-llmui-cutover-boundary.md` — per-surface cutover tables (kept for reference).
- `docs/plans/2026-06-20-cross-app-convergence.md` — structural convergence (DONE).
- `docs/plans/2026-06-18-jw-server-migration.md` — JW Python-server migration (DONE).
- `docs/plans/2026-06-18-unified-storage-no-idb.md` — storage rewrite, no IndexedDB (DONE).
- `docs/plans/2026-06-18-server-side-llm-architecture.md` — ⚠️ superseded by the 2026-06-20 shared-ai-stack plan.

## Next up — agreed plan + live constraints (2026-06-21 cont.)

Remaining roadmap, in dependency order. **Core principle (user, reaffirmed): no
per-app duplication — anything both apps need lives in the SHARED stack.**

1. **Manifest expansion** — the runner catalog has ONE model, so the model
   catalog + Fit + Quick Setup are thin. Add real GGUF models across VRAM tiers
   (cpu/low/mid/high) to `llm_runner/runner/runner-manifest.json`.
   ⚠️ **Blocked in-container:** HF is unreachable from tooling — Bash (even
   unsandboxed) → "Host not in allowlist: huggingface.co"; WebFetch reaches HF
   but gets HF's `403` bot-block. Fix: restart the env so a fresh container
   picks up the network policy, OR user pastes `org/repo:quant` IDs. **Never
   fabricate model IDs (RULE #4).**
2. **Quick Setup → shared** + **3. Hardware presets → shared.** These exist
   today ONLY as JW *client* components (`components/QuickSetup.vue` — an
   Ollama-pull wizard via `services/ollamaAdmin.js` + `services/quickSetupPresets.js`
   + `stores/hardwarePresets.js`; `components/HardwarePresetsCard.vue`). That IS
   the duplication to remove — they belong in `@delebash/llm-ui`, built on the
   shared runner endpoints already shipped (`/v1/llm-runner/hardware|models|load`
   + `/v1/ai/routing`), both apps mounting them. QuickSetup's bundled-runner
   Fit-recommendation is gated on #1's richer manifest; the Ollama-pull wizard is
   retired (Ollama stays addable via the shared provider form).
4. ✅ **DONE (conservative)** — commit `3e4ea83`. Removed the provably-duplicated
   parts from `SettingsView.vue`'s `id="audio"` section (provider list,
   Default-LLM/embedding pickers, Feature-routing table, Quick-setup-tips) + all
   the dead script behind them + the orphaned `SettingsProviderForm.vue`. KEPT
   the writing-specific knobs (Quick setup [trigger re-homed to a slim "Local
   model setup" card], Hardware presets, embeddings/RAG toggle, 3-alt streaming,
   Voice canon); added an "Open AI menu" pointer; renamed the section "AI
   engines" → "Writing AI". Deferred tidy: the now-unused `settings.audio.*`
   i18n keys across locale files (harmless; remove in an i18n sweep). Moving
   QuickSetup + HardwarePresets fully INTO `/ai` is still #2/#3 (gated on #1).
5. **E — streaming + drop the gateway.** Migrate `writerAI/chat/rag/characterChat`
   off the client `services/openai-compat.js`→`/v1/llm/...` gateway onto
   `/v1/ai/stream` (shared `requestStream`), then delete `server/.../api/llm.py`.

After JW proves the shared GUI: **JustVoice adopts the identical `@delebash/llm-ui`
views + layers TTS**; JV also still has per-app duplicate prompt/provider
machinery to lift to the shared package (same Keystone treatment JW got).

## Where detail lives
- Deep per-task detail → `docs/plans/*`. Architecture + rules → `CLAUDE.md` +
  global `~/.claude/CLAUDE.md`. The JustWrite↔JustVoice HTTP boundary →
  `CONTRACT.md` in the JustVoice repo.
