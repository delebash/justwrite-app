# Feature prompts → DB-seeded; server-side assembly; one generic endpoint (2026-06-21)

**Same file committed in both repos** (JustWrite + JustVoice). **Supersedes the
earlier draft of this file** (which proposed a shared `PromptStore` package +
deleting the endpoint — both wrong; see "The decision").

## The decision (2026-06-21, user directive — headless-first)

A headless/external caller can't run renderer code, so **everything that produces
the LLM call + result is server-side.** The caller — GUI or headless — sends
`{feature, data/ids}` and gets back a **structured result**. One contract for both.

1. **Prompt text lives in the DB.** Each feature's **system prompt** and
   **user-prompt template** are DB rows, **seeded by the seed file** (exactly like
   `DEFAULT_PROVIDERS`), **Lab-editable**. App code holds **no hardcoded prompt
   text and no runtime code fallback** — the seed file is the only place defaults
   live, and its only job is to populate the DB.
2. **One generic feature endpoint** — `POST /v1/ai/run` (+ `/v1/ai/stream`). Body
   `{feature, …data/ids}` → returns the feature's **structured result**. Same for
   GUI and headless.
3. **The server does it all:** load the feature's prompt from the DB → run the
   feature's **assembly** → call the LLM (via the gateway, key injected) →
   **parse** into the structured result.
4. **`features.py` = the per-feature assembly layer** — **logic, not prompt
   text**: each feature declares its **input contract**, **gathers context from
   the project DB** (heavy: strands/markers/characters), **fills the DB template**,
   and **shapes the result**.
5. **The caller supplies only the inputs it owns** — live/unsaved editor text, or
   ids. All gathering of *stored* project data is server-side (so headless works).
6. **The gateway** (`/v1/llm/{provider}/…`) stays underneath as key-injection +
   proxy.

**"Is a feature endpoint justified?" test:** it does real server work beyond
passing the prompt (assembly / gathering / parse). Headless-first, every feature
qualifies — the caller can't run renderer code.

**Why the earlier draft was wrong:** it (a) kept prompts hardcoded, then in
conversation I over-corrected to "delete the endpoint; the client builds
everything + gateway" — which breaks headless (the client can't be the only place
that knows the prompt/assembly). The synthesis above keeps the endpoint, moves
prompts to the DB, and moves assembly server-side. (Also: **no shared
`PromptStore` package** — the feature catalog + assembly + prompt storage are the
legitimate per-app pieces; only the endpoint *shape* is identical across apps, and
may be lifted to shared later if it earns it.)

## Current state (verified file-by-file 2026-06-21)

- **JW** — prompts hardcoded in `server/justwrite_server/llm/features.py`
  (`_CRITIQUE_SYSTEM`, `_CHAPTER_USER`, the `FEATURES` dict), read by
  `api/ai_features.py` (`/v1/ai/run` renders `spec["system"]` /
  `spec["user_template"]`). 17 features already POST `/v1/ai/run` with data (the
  endpoint *shape* is right). Heavy features still gather context **in the
  renderer** (`services/resumeBriefing.js:buildBriefingContext`,
  `sessionRecap.js:buildRecapContext`, the plotHoles digest) → headless can't run
  them. Streaming features (writerAI/rag/characterChat) build prompts in client
  code + call the gateway. No Lab prompt editing.
- **JV** — prompts hardcoded across `extraction/prompts.py`
  (`DIRECT_SYSTEM`/`GUIDED_SYSTEM`/`USER_TEMPLATE`), `api/preset_suggest_api.py:44`
  (`SYSTEM_PROMPT`), `smart_assign_api.py`, `personas_api.py`, `projects_api.py`
  (`SHOW_NOTES_SYSTEM`), `extraction/identify.py`. `ProductionConfig` (settings
  DB) can *override* a prompt (`extraction_api.py:157`) but the **default is in
  code**; most features have no DB path.
- **Shared `just-llm-runner`** — providers/registry/adapters/dispatch/usage + the
  gateway + provider-CRUD router (JW `6c2b951`/`985b577`) are converged + correct →
  **keep**.

## Target (mirrors the provider pattern: seed list → DB → read/edit)

- **Storage:** JW → a `feature_prompts` table; JV → rows under `settings.engines`
  (where JV keeps providers + configs). Row = `{key, feature, system,
  user_template, temperature, think}`.
- **Seed:** the prompt text (today's `features.py` / `prompts.py` constants)
  becomes seed data in the **seed module**, written to the DB on boot/reset
  (merge-missing-by-key, never clobber edits) — like `seed_default_providers`.
- **Store:** `get(key)` → DB row (**404 if missing; no code fallback**), `list`,
  `upsert`, `reset` (revert to the seeded default).
- **`/v1/ai/run`** reads the prompt via the store.
- **`features.py`** → per-feature assembly (input contract + project-DB gathering +
  template-fill + result-parse).
- **Lab:** per-feature prompt editing (read/write the rows); shows each feature's
  available `{{variables}}`.

**Key granularity:** JW keys by **action** (`critique`, `critiqueStructure` →
feature `critique`). JV keys by **feature**, except `speaker_attribution` which has
tier-specific system prompts → `speaker_attribution.guided` / `.direct` (shared
user template). The row `key` is a free string; the `feature` field carries the
routing key for pins/roles/usage.

## Sequence (per unit; verify each — RULE #2/#5)

1. **DB prompts foundation (JW first):** `FeaturePrompt` table + seed module
   (prompt text out of `features.py` → seed → DB) + store + `/v1/ai/run` reads from
   the store. pytest + headless smoke.
2. **`features.py` → assembly** + move heavy context-gathering server-side
   (briefing/recap/plotHoles); client sends ids. pytest + smoke.
3. **Lab** per-feature prompt editing (DB rows). smoke.
4. **Streaming** features (writerAI/rag/characterChat) → DB prompts, same model
   via `/v1/ai/stream`.
5. **JV** — same: prompts → DB, endpoints read from the store; `ProductionConfig`
   keeps its routing role, prompt fields superseded by the store.
6. Verify: grep shows no hardcoded prompt constant read at request time; Lab edits
   land in the DB.

## Progress — night of 2026-06-21 (autonomous run)

**Done + tested + pushed (server-side, high bar):**
- **JW** — `feature_prompts` table + `seed_feature_prompts.py` (prompt text moved
  out of `features.py`) + `llm/prompt_store.py` + `/v1/ai/run` reads from the DB +
  `/v1/ai/prompts` editor API (list/get/edit/reset). Commits `3fcd432`, `524ee44`.
  ruff clean; 86 + 5 server tests pass.
- **JV** — `FeaturePrompt` table + `engines/llm/prompt_store.py` +
  `seed_feature_prompts` (boot + workspace reset) + `/v1/ai/prompts` editor API +
  `smart_assign` & `render_preset_suggest` read from the DB (constants removed,
  **verbatim-verified** byte-identical). Commit `81304d4`. ruff clean; 280 tests
  pass (4 pre-existing failures = missing `fastmcp` optional dep, unrelated).
- **Docs** — this plan + the CLAUDE.md convergence sections, both repos
  (`9156e10` / `f2389a4`).

**Remaining (not yet done):**
- **JV one-shot features still on code prompts:** `refine`/`compose`/`voice_gender`
  (`refinement.py` — `refine` builds its prompt dynamically via
  `build_refinement_prompt(flags)`: that's assembly-logic + a base prompt, NOT a
  flat constant), `show_notes` (`projects_api.py`), `persona_rewrite`
  (`personas_api.py`), `identify` (`extraction/identify.py`).
- **JV extraction pipeline (`speaker_attribution`):** tier-specific guided/direct +
  `USER_TEMPLATE` still in `extraction/prompts.py`; the pipeline +
  `/v1/extraction/config` still read the constants. Migrate to
  `speaker_attribution.guided`/`.direct` rows (gate: `test_extraction_config`).
- **JW heavy features** (briefing/recap/plotHoles) still gather context
  client-side — move server-side for headless.
- **Lab prompt-editor GUI** (JW + JV): the `/v1/ai/prompts` API exists; the editor
  view is not built yet.
- **Streaming** (writerAI/rag/characterChat) → `/v1/ai/stream`.
- **Shared provider GUI (`@delebash/llm-ui`) + JV TTS editor** — the largest
  remaining track (`2026-06-20-engines-llmui-cutover-boundary.md`); needs visual QC.

**Autonomous-limit note:** server-side prompt convergence is tested to a high bar.
The GUI tracks can only be **smoke-verified** autonomously (routes render + zero JS
errors, NOT visual correctness) — flagged for QC.
