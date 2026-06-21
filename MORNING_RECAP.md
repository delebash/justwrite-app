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
- C 🔄 shared `@delebash/llm-ui`: **PromptLab done**; still to build — provider
  form (from JW `SettingsProviderForm`), model picker, provider list, Features
  routing, Usage view.
- D ⬜ shared top-level "AI / Models" menu area (Decision 2).
- E ⬜ JW streaming features (writerAI / rag / characterChat) → `/v1/ai/stream`,
  then delete the old `/v1/llm/...` gateway (`api/llm.py`).

## Active plan docs
- `docs/plans/2026-06-20-shared-ai-stack-plan.md` — **authoritative** AI-stack plan (20 decisions).
- `docs/plans/2026-06-21-feature-prompts-db-seed.md` — feature-prompts-in-DB design (headless-first).
- `docs/plans/2026-06-20-engines-llmui-cutover-boundary.md` — per-surface cutover tables (kept for reference).
- `docs/plans/2026-06-20-cross-app-convergence.md` — structural convergence (DONE).
- `docs/plans/2026-06-18-jw-server-migration.md` — JW Python-server migration (DONE).
- `docs/plans/2026-06-18-unified-storage-no-idb.md` — storage rewrite, no IndexedDB (DONE).
- `docs/plans/2026-06-18-server-side-llm-architecture.md` — ⚠️ superseded by the 2026-06-20 shared-ai-stack plan.

## Future / backlog
- Finish C (provider form / model picker / provider list / Features / Usage), then D, then E.
- After JW proves the shared GUI: **JustVoice adopts the identical `@delebash/llm-ui` views, then layers TTS** (the one JV-only difference).

## Where detail lives
- Deep per-task detail → `docs/plans/*`. Architecture + rules → `CLAUDE.md` +
  global `~/.claude/CLAUDE.md`. The JustWrite↔JustVoice HTTP boundary →
  `CONTRACT.md` in the JustVoice repo.
