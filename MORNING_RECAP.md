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

1. ✅ **DONE** — manifest now carries 6 user-provided GGUF models (`runner-manifest.json`):
   Qwen3.5 9B (Q4_K_S/Q4_K_M), Qwen3 14B (Q3_K_M/Q4_K_M), Qwen3.6 27B-MTP (Q4_K_M),
   + the seed 35B-A3B MoE. VRAM/RAM are coarse Fit estimates. To add more: paste
   `hf download hf://org/repo/file.gguf` lines (I parse repo+quant) — HF is still
   bot-blocked for my tooling, so **never fabricate IDs (RULE #4)**; the user
   provides them or opens HF egress for a fresh session.
2. ✅ **DONE** — shared **Quick Setup** (Fit-based) shipped in `@delebash/llm-ui`
   (`ui/src/views/QuickSetup.vue`), mounted atop AiModelsArea's Providers tab; on
   Apply it sets default+Quick+Accuracy roles via `/v1/ai/routing` and loads the
   Quick model. JW's Ollama-pull subsystem (QuickSetup.vue + HardwarePresetsCard.vue
   + ollamaAdmin/quickSetupPresets/hardwarePresets) was **deleted** (commit
   `46adb65`). Known dead-code follow-up: `stores/ai.js` still has unused
   `applyQuickSetupPreset` + `quickSetupTiers` (no broken imports) — remove in a
   core-store pass.
3. ⬜ **Hardware presets → shared (NEW feature, not a port).** The retired JW one
   was Ollama tier-recipes; the shared one (Decision 18) is a **manual routing
   override**: save/apply/edit/delete named routing configs (default + roles +
   pins) for a specific rig, as a fallback to auto-Fit. Needs a NEW shared presets
   store + endpoint (host-store pattern, like `/v1/ai/routing`) + UI in
   AiModelsArea. Build fresh.
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
