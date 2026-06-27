# Session handoff — 2026-06-27 (read this in full after a compact)

> # ⛔⛔ THE #1 OPERATING RULE — read this FIRST, every time ⛔⛔
> **NEVER act until the user literally types the word "go".** A question is ONLY a question —
> answer it in words, then STOP and WAIT. Do NOT read/grep, edit, spawn an agent, run a
> workflow, build, or commit until "go". **"It was only read-only" is NOT an excuse — do not
> start.** Approval for one step is NOT approval for the next; each new action needs its own go.
> Companion hard rules: ② show the user any agent/research prompt BEFORE sending it; ③ never
> stop a running job/agent unless the user says "stop"; ④ always confirm the plan + get the
> explicit go first; ⑤ never guess — read code line-by-line, cite file:line. *(The user has had
> to repeat #1 many times across 2026-06-27 — it is the top cause of lost trust. GET IT.)*

> ⛔ **THE ONE PLAN: `just-llm-runner/docs/plans/2026-06-27-MASTER-PLAN.md`.** It folds in
> EVERYTHING — the switch/preset architecture (Profile+Feature, the shared `<KnobGrid>`, the
> decision log, the source-verified sampler surface), the model-catalog + Fast/Balanced/Best-dial +
> attribution research, the code-verified LLM status, and the full outstanding-work backlog — into
> one detailed doc: **✅ done** (file:line) + **⬜ outstanding** (phased A–G), JustVoice-later §G,
> reference matrix/switch-sets/attribution-recipe/license-gate in Part 3, provenance in Part 4.
> **Panel-verified 2026-06-27** (3 agents, file:line + 144 runner / 77 JW tests pass); build NOT
> started, pending the user's go. Every other `docs/plans/*` doc (both repos) is bannered "⛔ NOT
> THE CURRENT PLAN" — historical/evidence only. **Only this handoff + `MORNING_RECAP.md` point to
> the master.**

This is the detailed, prose pickup record — read it whole for the **trust situation**, the
**verified what's-built-vs-not**, the **stub/bug list**, the **load-bearing decisions**, and the
**env facts**; then open the master for the plan itself. Branch for all repos:
`claude/admiring-galileo-il3q0o`.

> **Standing rules (user, 2026-06-27 — the DEFAULT, do not make them re-ask):** "save docs" ALWAYS
> includes THIS handoff + `MORNING_RECAP.md` — keep both current. Act only on the literal word
> **"go"**; **show agent/research prompts before sending** so the user can verify. Never stop a
> running job or launch an expensive run without asking. The model-catalog adds/drops are APPROVED,
> but the `seed.py` build is **pending an explicit go** (do not build until told).

## What we are doing, and the one thing that matters most (trust)

The active work is the **LLM stack + the job/feature LAB**, and nothing else right now.
**JustVoice is explicitly out of current scope** — it comes later (its "U5" adoption), and
the only JV fact that matters today is that its LLM layer is currently *broken* against the
shared job-native schema (recorded below, not to be worked on now).

This was a long, hard session and the user's trust is low for a concrete, earned reason:
across the session I repeatedly claimed things were "done" that turned out to be stubs or
just-started, handed over plans that were assembled from stale design docs instead of being
checked against the real code, forgot planned work, and at points made excuses or repeated
the same mistake. The user's standing instruction — which they had to repeat many times and
which must now be the *default*, not something they re-ask for — is: **work like a
professional. Do not skim. Do not take the quick way out. Never guess — read the code line
by line and cite file:line. Reuse existing components or make new reusable ones; never
copy-paste logic. Nothing hardcoded. Save docs as you go (it is the rule — do not ask
permission). And never mark anything "done" without the file:line that proves it is not a
stub.** When a determination is load-bearing, verify it with an independent pass (the
`rules-checker` agent, or a verification workflow) — "other yous confirm" — because my own
unverified word is what broke trust.

## The source of truth — the master (status + plan, both folded in)

The verified status (**what is actually built**, per file:line) and the plan (**what's
outstanding**) are now BOTH in **`just-llm-runner/docs/plans/2026-06-27-MASTER-PLAN.md`** — Part 1
= completed/file:line, Part 2 = outstanding (phased A–G). It absorbed the code-verified LLM
status-index (10 agents + 2 confirmers, "trustworthy"), the switch/param lab plan, and the
339-item complete-remaining audit; all three now carry the "⛔ NOT THE CURRENT PLAN" banner and are
kept as historical/evidence only. Status was panel-verified 2026-06-27 (3 agents, file:line + 144
runner / 77 JW tests pass). The detailed prose in the rest of THIS handoff (what's-built, the
stub/bug list, the decisions, the env facts) is the richer pickup context; the master is the
authoritative plan + status. Do not re-derive status from the older design docs — their asserted
✅/⏳ markers drifted from the code, which is the whole reason we kept losing track.

## What is actually built vs not, in the LLM area (prose summary; the index has the file:line)

JustWrite's LLM stack is, for the most part, genuinely built and tested. Providers work end to
end — list, add, edit, delete, and the provider-form "Test connection" — backed by the shared
stores and mounted into JustWrite by a single `install_llm` call. Routing works: jobs replaced
the old quick/accuracy roles everywhere (schema, dispatch, routing API, GUI), with a
"Routing by job" tab and a per-feature workbench, and the dispatch job-cascade is unit-tested.
The switch *backend* is real — the type/preset tables, the layered resolver
(`switch_resolve.py`), and Overrides flowing through `POST /v1/llm-runner/load` (#19). Per-action
params `top_p` (#22) and `json_mode` (#18) are wired through schema, DB, dispatch, the editor,
and tests. The streaming feature ports (writerAI, rag/chat, characterChat) run on `/v1/ai/stream`,
the old `/v1/llm` gateway is deleted, and QuickSetup was verified to be a real wizard, not a stub.

The **lab itself is not built**. `FeatureWorkbench.vue` is only the single-column precursor — it
has the model pin, prompt, params, the preset→"Use as production" lifecycle, and a test panel,
and it self-documents "SpeakerLab parity." But there is no `<ConfigColumn>` component, no Compare
view (the N-column strip), no `JobPreset` at any layer (table, store, router), and no switch-string
field. (A decode **tok/s** readout now lands in `FeatureWorkbench.vue`'s single-column test panel —
`tps = completionTokens / (ms/1000)`, prompt tokens excluded as prefill — but the N-column Compare
strip that would compare tok/s across configs is still unbuilt.) The switch *override* layers compound this: the per-job
(`JobRouteSwitch`), per-feature (`PinSwitch`), and per-hardware (`HardwareSwitch`) tables exist in
`db.py` but have **zero readers** — the schema shipped without the wiring — and the §6.6 work to
rip switch editing out of the Providers tab has not started. The bundled-runner router mode (#27)
and the residency / VRAM-budget planner (#29) are not built either; the single-model serving
baseline is solid and tested. JustVoice's LLM layer will not even import against the job-native
schema (it still references the removed `LLMRolesSettings`), but that is later/out-of-scope.

## The real stubs and bugs the verification surfaced (these are the trust payoff — keep them)

These are concrete, code-located, and (mostly) fixable in this container without a GPU. The
per-provider-row "Test" button always fails because the row issues a GET while the endpoint is a
POST (`AiModelsArea.vue:109-117` vs `api.py:56`). `extra_flags` from stored switch rows are
silently dropped (`lifecycle.py:82-92`). The Ollama and Gemini adapters drop `top_p` and
`response_format` due to wrong nesting (`ollama.py:91-92`, `gemini.py:115-116`), and Anthropic
ignores `json_mode`. **[FIXED]** The FeatureWorkbench inline "tokens" stat used to read 0 because
the JW host returned snake_case usage while the kit reads camelCase (`FeatureWorkbench.vue:422`,
the kit wire contract `client.js:92,112`); fixed by aligning both JW readers to camelCase
(`aiFeature.js:139`, `aiTasks.js:145-146`) — the only two field-level stream-usage readers in JW.
The `ProductionConfig` dispatch precedence layer is NOT dead (earlier note was wrong): it's a live,
tested shared layer (`test_llm_dispatch.py:69`) that JustVoice populates (`engines/llm/config.py:52`)
and reads for speaker_attribution (`extraction_api.py:147`). JW's `config_builder` just doesn't
populate it yet — JW's promote uses the pin+prompt path, and the richer per-feature editable-prompt
`ProductionConfig` is a planned convergence delta to bring to JW (`shared-ai-stack-plan.md:65`), not
dead code. Do NOT remove it.
**[FIXED]** Recommendations and `ModelCatalogStore` now have backend tests
(`just-llm-runner/tests/test_recommendations_catalog.py`, 10 cases). **[FIXED]** The recommendations
editor's native `confirm()` calls are now the kit's `confirmDialog` (native-dialog ban honored), and
`LuModelPicker`'s dead `showRoles` prop (+ its two inert caller attrs) is removed. The `detect-local`
and `classify-tier` endpoints are real and wired in JustVoice (`QuickSetup.vue:301`,
`RecommendCard.vue:40`, `SpeakerLabView.vue:116`) — the "no UI caller" was JW-scoped: JW's shared kit
UI doesn't call them yet. That's a JW feature gap (auto-discover a local provider; auto-suggest a tier
on Add-model) needing a UX placement decision, not a stub/bug.

## Load-bearing decisions made this session

**§6.6 (switches live in the LAB as a string, not in Providers).** Switches are edited as one
freeform string field in the lab — never per-flag boxes — and there is no switch editing in the
Providers tab. The rules-checker corrected my first draft of this against the code: switches are
a *typed, named* `Overrides` field set (`n_cpu_moe`, `ctx_len`, `flash_attn`, `spec_type`, …) plus
an `extra_flags` list escape, and `_switches_to_overrides` silently drops unknown keys. So the
string maps to the known field names and routes anything else into `extra_flags` (which needs a
one-time backend wire), and it must *surface* unknowns, never silently drop them. The user's
"add a new flag with no code change" is real but achieved via `extra_flags`, not raw CLI
spellings. #20 (a separate tuning UI in Providers) is folded into the lab.

**#33 done, #32 dropped.** Routing-by-job is now a `UiTable` grid (`RoutingByJob.vue`, rewritten
to reuse the `RecommendationsEditor` table+modal pattern; shipped, kit `37aa116`). #32 (the
LocationsView↔ObjectsView convergence) was dropped — they are parallel views that may diverge,
which is not duplicated logic; the jscpd reuse gate stays. **JobPreset** will live in the SHARED
runner (`db.py` + `stores.py` + `install.py`), mirroring `feature_presets_api.py`, not per app.

**The rules-as-checks system was unhooked** at the user's request (they decided the per-action /
per-commit friction wasn't worth it). `~/.claude/settings.json` is now `{}` so no gate fires;
a backup is at `~/.claude/settings.json.hooked.bak`, every hook script and the committed
`claude-config/` bundle are untouched, and it re-enables with `FORCE=1 bash
/home/user/justwrite-app/claude-config/install.sh`. The plain T1–T12 rules in `~/.claude/CLAUDE.md`
still govern and are followed by reading them. Practically: commits this session do not require a
rules-checker verdict.

**The Reset bug is fixed.** `data_admin._reset` now does `drop_all` + `create_all` + reseed on
both bases instead of only deleting rows — a row-delete could not recover from schema drift, which
is what caused the `no such column: feature_prompts.json_mode` 500 the user hit. Reproduced and
cleared, then committed (`677d165`).

## Environment and how-to facts (so I don't re-hunt them)

Chromium is prebuilt at `/opt/pw-browsers/chromium-<ver>/chrome-linux/chrome` — a *versioned*
directory (e.g. `chromium-1194`), NOT `/opt/pw-browsers/chromium/`. Always reuse `findChrome()`
from `scripts/headless-smoke.mjs` (or set `JW_CHROME`); never hardcode the path. The renderer
gate is run by booting `python -m justwrite_server.cli serve --port 17495` and `npm run dev:vite`
(:1420) in the background, then `node scripts/headless-smoke.mjs`; there is also a reset E2E at
`scripts/reset-ui-test.mjs`. Note that `pkill -f "justwrite_server.cli"` matches its own command
line and kills the shell — use the bracket trick `pkill -f "[j]ustwrite_server"`. Foreground
`sleep` is blocked in this harness. The SQLite DB is at `platformdirs.user_data_dir("JustWrite")`
— Linux `~/.local/share/JustWrite/justwrite.db`, Windows `%LOCALAPPDATA%\JustWrite\justwrite.db`
— and the DB policy is drop+reseed, no migrations (on a schema change, delete the DB or click
Reset, which now recreates the schema). Verification harness: pytest + ruff for both servers,
`build:vite` + headless smoke for the renderer.

## What is next (do not assume "build" — the user drives)

The user asked for the *verified plan first*, which now exists. They have **not** said "build the
lab" yet. So the next step is theirs: review the status index and the lab plan, then direct what
to build. When the lab build does start, the sequence (detail in the lab doc) is: extract a shared
`<ConfigColumn>` from the FeatureWorkbench editor pane; add the switch-string field (mapping to the
`Overrides` field names + `extra_flags`, surfacing unknowns) and a tokens/sec readout; build the
N-column Compare view; add `JobPreset` (table + store + router + promote) in the shared runner
mirroring FeaturePreset; rip switch editing out of Providers; and wire `extra_flags` through
`_switches_to_overrides`. The router mode (#27) and residency planner (#29) are buildable but
need the user's GPU / a live model to verify, so build them offline-testable and have the user run
the live check. There are also the verifiable-now stub fixes listed above, which are small and
high-value if the user wants quick wins.
