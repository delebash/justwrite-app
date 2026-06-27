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

## Deep audit of the master (2026-06-27) — option A (full inline verify) COMPLETE

The user pushed for a complete, fresh, no-skim verification of the master against the actual code
AND the old plan docs — run as a slow grind, not a fast pass — because a prior "looks fine" 3-agent
panel had still missed real gaps. It was done **inline** (me, full session context, reading sources
IN FULL and re-deriving every claim from code), in multiple passes, checkpointing to a durable log
(`scratchpad/audit-findings.md`) and folding every confirmed finding straight into the master.

**Coverage:** 12 old docs read IN FULL + cross-checked — `switch-param-lab`,
`switch-and-preset-architecture`, `jobs-architecture-design` (1175 ln), `shared-ai-stack-plan`
(1006 ln, Decisions 1-23), `server-model-management-brief`, `serving-architecture-research`,
`shared-component-architecture`, `shared-platform-settings`, `llm-shared-move-cascade-audit`,
`llamacpp-switches` (566, backs Part 3.2), `speaker-attribution-llm-research` (Part 3.3),
`small-vram-multimodel-research` (Part 3.1). The completed-sub-project history docs (06-18
server-migration/storage/audio/backend, gateway-retirement, cutover/convergence/deep-audit,
feature-prompts-db-seed, local-model-recommendations, sillytavern-survey, quicksetup-redesign) were
spot-verified = shipped, no buried outstanding plan. Done-vs-not-done was checked against code across
Part 1 + the Part 2 F-items; Part 3 against its evidence docs; the runner suite re-run (144 pass +
ruff clean; `test_plane2_params` isolation failure confirmed).

**The headline finding: exactly ONE design-level contradiction — D9.** The master's old Phase-D1
said "build the PinSwitch store/resolver/reader," but the LOCKED `switch-and-preset-architecture`
decision **D9** says DROP `pin_switches` AND `model_switches` and make `job_route_switches` the
Profile's switches. The master had been built from the code state + the older lab doc and never had
D9 folded in — so it would have had us build a table the design says to delete. **The user ruled D9
is correct;** D1 was rewritten to it (drop `model_switches` [UI already gone, backend pending] +
`pin_switches` [inert, trivial]; `job_route_switches` is the survivor, load-reader pending; keep
`switch_presets` + `hardware_switches`; fold in freeze-flat D8, Default-as-Profile D16, Profile=job
naming D12, the model+hardware switch axis D17). This is the lesson the user named — a decision made
in a design doc MUST be propagated into the master or we get confused later.

**Beyond D9, status-staleness fixed against file:line:** #11 QuickSetup is actually built +
job-native (not "to build"); U4 Updates/Changelog is partial (shared `UpdatesPanel.vue` exists but
unmounted; JW `WhatsNewModal.vue` live); the whole "Streaming feature ports" F-item was DONE
(writerAI/rag-chat/characterChat/voiceFingerprint/resumeBriefing/all analysis features on
`/v1/ai/stream`, gateway gone, VariationsModal 3-alt built); dup-counts undercounted (htmlToText ~19
not 9; tailWords ~7 not 4); A3 overstated (RAM already threaded — only the `coarse_fit` GPU-branch
check remains); #31 `routingBackend.js` citation stale (`:15,93,94`); `PROVIDER_DEFAULTS` is a
hardcoded duplicate of the seeded providers; `tiers.py` carries hardcoded model→tier maps; plus a
couple of self-introduced citation imprecisions caught on reverify.

**Confirmed accurate (no change):** D1 switch wiring (`resolve_model_switches` live at load;
`resolve_profile_switches` uncalled-by-design; `PinSwitch` genuinely zero-reader); `extra_flags`
wired; the master's other citations; #23/#27/#29/#34/Cache/Hardware-panel/shared-LLM-UI-views all
genuinely not-built; Part 3 faithfully reflects its evidence docs.

**Verdict (after A):** the master was faithful + code-accurate except D9; every A finding folded
into the master (Parts 1/2/3 + Part 4).

## Option B (independent fresh-context panel, 63 agents) — DONE, and it was worth it

8 fresh auditors (blind to A's findings) + 8 challengers of A's conclusions + a verify pass; then I
**re-verified every high-value B finding against code myself** (agents can be wrong too). It caught
**1 A-error** and **~8 real misses A made**, including a live bug:
- **A-error: U4.** A said the shared `UpdatesPanel` is "not mounted"; it IS imported + mounted in JW
  `SettingsView.vue:7,1216` (A only checked the kit). **Reverted** → U4 is built.
- ⛔ **DATA-LOSS BUG (A missed entirely) — FIXED 2026-06-27.** `routingBackend.js putRoutingPrefs`
  used to send no `jobs` field; the server `set_routing` (`stores.py:132`) deletes every `JobRoute`
  then re-adds from the empty `cfg.jobs` → **every JW default-LLM / embedding / feature-pin save WIPED
  all per-job model routes** (same hole for untracked action-keyed pins). **Fixed:** `routingBackend.js`
  rewritten to round-trip the full `{default, jobs, pins}` — cached `jobs` + untracked `pins` carried
  through verbatim, only the store's tracked feature pins overlaid (set on pin / delete on inherit),
  dead role/quick/accuracy removed (mirrors the kit's own `useRouting.js:55`/`FeatureWorkbench.vue:274`
  writers). Verified vs all consumers + build:vite + headless smoke (0 JS errors). Master #31 →
  "DATA-LOSS BUG FIXED ✅".
- **GGUF auto-detect is an UNWIRED ORPHAN** (`detect_and_store_model_type` has zero production callers)
  — §1.2 demoted from "shipped".
- `pricing.py MODEL_PRICING` hardcodes USD rates (not in DB); **`model_catalog` has NO `license`
  column** though A2 seeds license + §F renders it; **Part 3.2 "all typed" was false**
  (`--cpu-moe`/RoPE/YaRN/`-sm/-ts/-mg`/`--jinja` ride `extra_flags`); the **DECIDED §6.6 "freeform
  string"** contradicted the shipped **D15 KnobGrid**; the **F#23 `ProviderRow` dup** doesn't exist;
  `test_prompts.py` also fails in isolation; a stale Quick/Accuracy docstring in shared
  `routing_api.py`; a dead JW `components/QuickSetup.vue` fork.
- **B corroborated A** on D9, #23, #27/#29, #34, Cache/Hardware, shared-views, PROVIDER_DEFAULTS,
  tiers.py, A7, A3. Of A's 8 challenged conclusions: 3 held (#11, A3, D1), 5 adjusted, 1 (U4) refuted.

All folded into the master (Parts 1/2/3 + the **Part-4 "Option B"** record). Full B output:
session `tasks/w5kt79rge.output`. **Net: A made the master faithful on design; B caught the
implementation-reality gaps (a live bug + an orphan + missing schema) A's claim-vs-doc pass didn't.**

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

## What is next — BUILD IN PROGRESS (user said go, 2026-06-27)

The user gave the go: **"fix data loss bug and do phase a-e without stopping unless necessary for a
decision."** So this is now a continuous build run, not a wait-for-direction state. Sequence:
**✅ data-loss fix** (slice 1) → **✅ Phase A COMPLETE** (catalog rebuild + license column + fit
RAM-gate + `runner-manifest.json`→DB + GGUF-orphan wiring; 148 runner + 77 server tests pass) →
**✅ Phase B COMPLETE** (Fast/Balanced/Best dial: `quality.py` resolve_quality + `/v1/ai/job-quality`
+ UiSegmented dial in Routing-by-job + think-off-under-JSON guardrail; 155 runner + smoke) →
**▶ Phase C** (KnobGrid tuning UI) → D (the LAB: drop model/pin
switches per D9, wire job_route_switches reader, Compare/ConfigColumn, JobPreset, move LuSwitchPresets
out of Providers) → E (extraction scaffolds + sampling set). Each slice is verified (pytest+ruff for
the runner; build:vite + headless smoke for JW) and committed; pause only for a genuine user-only
decision (the gated 🔒 items — router-vs-spawn etc. — stay deferred).

Historical note (pre-go): when the lab build does start, the sequence (detail in the lab doc) was: review the status index and the lab plan, then direct what
to build. When the lab build does start, the sequence (detail in the lab doc) is: extract a shared
`<ConfigColumn>` from the FeatureWorkbench editor pane; add the switch-string field (mapping to the
`Overrides` field names + `extra_flags`, surfacing unknowns) and a tokens/sec readout; build the
N-column Compare view; add `JobPreset` (table + store + router + promote) in the shared runner
mirroring FeaturePreset; rip switch editing out of Providers; and wire `extra_flags` through
`_switches_to_overrides`. The router mode (#27) and residency planner (#29) are buildable but
need the user's GPU / a live model to verify, so build them offline-testable and have the user run
the live check. There are also the verifiable-now stub fixes listed above, which are small and
high-value if the user wants quick wins.
