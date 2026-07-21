# MTP verified + think A/B + human bench report — findings, decisions, and the execution plan

> **2026-07-20/21.** Born from the user's question "can we verify that MTP is actually working —
> I think until the recent download fix the MTP file wasn't on disk, so we may never have used
> it." The investigation answered that (yes, it works now; no, it mostly didn't before
> 2026-07-15/17), surfaced an engine-version bookkeeping defect, and grew — on the user's
> rulings — into this batch: MTP acceptance telemetry, a think ON/OFF A/B in the bench, a
> human-readable run report, and the web-checks. Execution: the `executor` agent (Opus).
> The user's go: "your recs go" (2026-07-20), plus the mid-turn addition "give me a nicer
> summary output that a human can make sense of".

## 1. FINDINGS (verified this session, all file:line receipts on the user's box)

**MTP is genuinely working in the app path today.** The bench run `2026-07-21_02-00-00-gpu`
loaded `gemma-4-26b-a4b-qat` through the app's own resolution (leg launch `{}`), and the
router config written at the spawn second (`<data-root>/ai-cache/llamacpp/models.ini`, mtime
22:00:13 = the spawn moment logged in `<data-root>/logs/justwrite.log:113`) carries
`model-draft = …MTP/mtp-gemma-4-26B-A4B-it-Q4_0.gguf` + `spec-type = draft-mtp` +
`spec-draft-n-max = 2` (models.ini:34-44). The engine child received exactly those argv
(router log `router-20260720-220013.log` lines 25-30), loaded both stages
(`text_model` → `spec_model`), and **all 17 requests of the bench speculated — draft
acceptance 0.47–0.91, mean accepted run length 1.94–2.83**. That also explains the measured
2×: llama-bench on the bare GGUF (no draft flags, `leg.json` llamaBench args) decodes
11.47 tok/s while the app path measures 23.5 tok/s — MTP plus the q8_0-KV/flash-attn config
delta. Data root here = `E:\Dev\Web\justwrite-app\src-tauri\target\debug\data`.

**The user's suspicion about the past was CORRECT.** `justwrite.log.2026-07-10/-11` show the
draft acquisition failing repeatedly with `FileNotFoundError: no .gguf matching quant
'MTP/gemma-4-26B-A4B-it-Q4_0-MTP.gguf'` (a wrong filename pattern — the real file is
`mtp-…Q4_0.gguf`, prefix not suffix), and separately llama-server itself reporting
`failed to load draft model` for the right path that was not on disk
(justwrite.log.2026-07-11:226). The drafter first downloaded 2026-07-17 14:07
(justwrite.log.2026-07-17:90), again 07-19 after the upstream snapshot moved. The earliest
surviving router log with an acceptance line is 2026-07-15; every earlier surviving log has
zero. So before ~07-15 MTP was configured-but-broken; after the 07-17/19 download fixes it is
real. (Caveat: older logs may have rotated away; "never before 07-15" is inferred from what
survives.)

**Qwen's MTP is built into the main GGUF — the user was right.** The
`unsloth/Qwen3.6-35B-A3B-MTP-GGUF` cache holds ONE file (no `MTP/` drafter). The 07-20 08:27
load (router log `router-20260720-075505.log:719-780`) passed `--spec-type draft-mtp` with NO
`--model-draft`; the engine accepted it, announced stages `["text_model","spec_model"]`, and
loaded `spec_model` 0→1.0 **from the main GGUF**. It was evicted ~80 s later having served no
request, so its acceptance is machinery-proven but generation-unproven (task T7 closes this).
The runner's `_wants_draft` predicate (`llm_runner/runner/lifecycle.py:295-307`) only demands
a drafter file when the catalog declares `mtp_draft_file` — so the qwen shape is by-design,
but the ini-emitter comment at `lifecycle.py:1944-1947` still calls spec-without-draft "a
broken preset", which observation disproves for built-in-MTP models (task T5 fixes the
comment).

**Engine build bookkeeping is broken.** The only engine dir is `…/ai-cache/llamacpp/b10069`,
`runner_setting.pinned_build = 'b10069'`, yet its `llama-bench.exe` self-reports
`build_number: 9993` (captured in the bench leg.json stdout), and `justwrite.log:72-73`
(07-20 12:04) shows the runner downloading the **b9993** zips; earlier the same day the 08:27
child ran from a now-gone `b10068` dir, and boot logged "engine pin healed upward to on-disk
build b10068" (justwrite.log:1). Dir name ≠ binary build; the bench env records the dir name,
so engine-drift staleness flags are poisoned. Root cause not yet diagnosed (task T4).

**Thinking is OFF everywhere today.** All 11 `engine_presets` rows have `think = 0` and empty
`reasoning_effort`; all 39 `feature_preset_refs` point at them; `default_preset_id =
p_prose_edit` (also off). The bounded-thinking guard rails ARE seeded: `reasoning_budget =
1024` exists built-in at the base bundle (`preset_switches`) AND the user's class
(`class_tunes`: `gemma-4-26b-a4b-qat @ vram8|ram32`). At the measured 23.5 tok/s the cap's
worst case is ≈ +45 s per request. The Gemma thinking-loop re-test ordered 2026-07-16 at the
b9993 pin is still pending (`just-llm-runner/docs/plans/2026-07-16-think-ab-and-loop-retest.md`,
tracked in TASKS.md "Your-box checks"); a think-on bench leg under the cap produces live
evidence toward it but does not by itself close it.

**Context shift: off everywhere, for recorded reasons.** Gemma 4's iSWA supports neither KV
shifting nor prefix reuse (llama.cpp auto-disables both with a warning) and it measured a net
loss on-box 2026-07-07 (`llm_runner/llm/seed.py:369-373`, `tests/test_switch_resolve.py:137-139`);
QC-11 (user, 2026-07-09) then removed both knobs from the catalog entirely
(`tests/test_knob_catalog.py:79-80`; DB verified: zero rows). The LoadRequest field remains
(`runner/schema.py:255`) and the emitter still honors it (`runner/process.py:183-185`), so a
transient bench A/B needs no catalog change if the web-check (T6) ever justifies one.
`seed.py:373` still says the knobs "stay … in knob_catalog" — stale since QC-11 (task T5).

**T2 CHANNEL RECEIPT (T2-STEP-0, web-confirmed 2026-07-21).** llama-server exposes model
reasoning on a separate `reasoning_content` field, on BOTH shapes:
- NON-STREAM `message.reasoning_content` — llama.cpp `tools/server/README.md`: `--reasoning-format`
  "one of: none (leaves thoughts in `message.content`), deepseek (puts thoughts in
  `message.reasoning_content`), deepseek-legacy … **(default: auto)**"; `auto` detects the
  format from the chat template.
  (https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
- STREAM `delta.reasoning_content` — DeepWiki "HTTP Server and APIs": streaming SSE deltas
  include "Reasoning (some models support reasoning content in `delta.reasoning_content`)".
  (https://deepwiki.com/jina-ai/llama.cpp/6-http-server-and-apis)

CAVEAT (honest): with `auto`, the field is populated only when the template is detected as a
reasoning template — Gemma-4-QAT with think enabled is such a case, but this is confirmed
LIVE by the T7 think-leg run (its capture must contain non-empty reasoning), never assumed.
The runner drops both today (`openai_compat.py:237-240` reads only `delta.content`;
`:158-167` only `message.content`).

## 2. DECISIONS (the user's rulings, 2026-07-20 "your recs go")

1. Think A/B ships as an **explicit second leg** in `gpu.json` (no generic variants
   mechanism).
2. **Qwen think-A/B deferred** — after the Gemma A/B and the qwen MTP proof run.
3. **Reasoning text IS captured** per run (the judge must see what the model thought).
4. **The judgment lands in `judgment.md`** inside the run folder + a pointer from this doc.
   Judging is the planner's reading task; the bench itself scores nothing (its charter,
   `scripts/bench/run.js:18`).
5. (Mid-turn addition, user verbatim:) "give me a nicer summary output that a human can make
   sense of — tests run, time to complete, etc, any data that might be useful to read so I can
   make a judgment call as well" → task T-SUM below.
6. Web-checks approved as report-only step-0s (no retest runs without a symptom + support).
7. (2026-07-20 late, "1 your rec") **Gate repair:** restore the PAYLOAD-based subagent
   bypass in `pre-action-check.py` (both copies + the pin test + a clone commit) — the
   2026-07-20 claude-config reorg regressed the 2026-07-15 payload detection and the
   executor was denied every edit. Applied by the USER'S OWN HAND via
   `scratchpad/patch-gate.py` — the auto-mode classifier (correctly) refuses to let the
   assistant edit its own enforcement hooks, and that refusal is honored, not worked
   around.
8. (2026-07-20 late, "2 a plumb it all") **T2 = option (a), the full reasoning plumb** —
   runner → kit → JW services, additive end-to-end (design in T2 below). Supersedes T2's
   original "bench hook only" envelope, which verification proved impossible: llama-server
   default `reasoning_format=auto` emits a separate `reasoning_content` delta that the
   runner DROPS today (`llm_runner/llm/openai_compat.py:237-240` stream, `:158-167`
   non-stream).

## 3. TASKS (executor: verify-first items are MANDATORY reads before touching the file;
any blocked/undecided point → STOP and report, never improvise)

**T1 — think A/B leg (JW: `scripts/bench/configs/gpu.json`).** Add leg
`gpu-gemma-26b-think` directly after the baseline: same `model`, `tunables:
{"temperature": 0.7, "think": true}`, `llamaBench: null` (raw matrix is think-independent —
don't pay 5 min twice), `features`/`repeats`/`timeoutMinutes` null (inherit), a `_why` block
naming the A/B purpose + that `reasoning_budget=1024` engages via the normal request cascade.
*Verify first:* the config loader (`scripts/bench/lib/config.js`) accepts `llamaBench: null`;
`ensureBenchPreset` (`scripts/bench/lib/server.js`) passes `think` through and the server
accepts `think: true` on the Bench preset (only `false` is exercised so far).
*Accept:* `npm run bench -- --config scripts/bench/configs/gpu.json --dry` lists both legs
with think visible; no store/report code chokes on a legacy stored baseline.

**T2 — reasoning capture, FULL PLUMB (ruling #8 — runner → kit → JW, all additive; the
original bench-hook-only envelope is dead, see ruling #8).**
**T2-STEP-0 (MANDATORY receipt before any T2 edit — rules-checker T2 FAIL, 2026-07-21):**
web/source-confirm that llama-server with `reasoning_format=auto` emits a separate
`reasoning_content` field on BOTH the `/v1/chat/completions` streaming delta AND the
non-stream message, and PASTE the cited source (llama.cpp `tools/server` README/source
line or an observed real think-on payload) into §1. The plan asserted this "verified" on
the executor's word without a receipt, and the synthetic-chunk test greens even if the
field name / endpoint / reasoning-format assumption is wrong — so the fact is pinned
FIRST, then the plumb is built to it. The runner drops it today
(`openai_compat.py:237-240` stream, `:158-167` non-stream — confirmed). Build, additively at every
layer so product output stays byte-identical (no UI consumes the new field this batch):
(1) **Runner:** `StreamDelta` gains `reasoning: str | None = None`; `LLMResponse` gains
`reasoning: str | None = None`; `openai_compat.stream_chat` reads
`delta.reasoning_content` → yields reasoning deltas; `chat` reads
`message.reasoning_content` → `LLMResponse.reasoning`; the `/v1/ai/stream` SSE emits
`{"reasoning": …}` frames alongside content frames; `/v1/ai/run` response gains
`reasoning`. Scope: the openai-compat/local path ONLY this batch — other providers'
thinking surfaces (Anthropic/Gemini native) differ and are a named follow-up, not
silently half-done.
(2) **Kit:** `runAiFeatureStream` gains an `onReasoning` callback + returns collected
`reasoning`; `runAiFeature` passes `reasoning` through.
(3) **JW services:** each service reducer that reshapes the kit result passes `reasoning`
through additively (the executor enumerated ~6 — e.g. `services/writerAI.js:133`
`{html,raw,usage}` → `+reasoning`, `services/rag/chat.js` `{answer,citations,usage}` →
`+reasoning`; verify each at edit time, touch nothing else in them).
(4) **Bench hook:** the run capture gains `reasoningText` (the collected text) +
`reasoningTokens` (from usage if the server splits it — verify; else null, honestly).
*Verify first:* the exact `StreamDelta`/`LLMResponse` definitions + the SSE frame shape in
the dispatch; the six JW reducers' current return shapes. *Accept:* runner pytest covers a
synthetic `reasoning_content` chunk (stream + non-stream); think-off behavior
byte-identical (no reasoning frames emitted when the field is absent); a think-on T7 run's
capture contains real reasoning text; vitest for any pure-JS reducer logic.

**T3 — MTP acceptance telemetry (runner).** The runner already pipes child output into
`router-*.log`; add a per-model accumulator over lines matching
`draft acceptance = F ( N accepted / M generated)` → `{requests, accepted, generated,
lastAcceptance}` exposed on the status/resident payload and the measure response; reset on
load. Bench side: record it in `legRecord.load`/`measure` + once more after the feature runs;
summary gains a `spec` column (type + acceptance %); add a per-leg flag
`spec-configured-but-never-engaged` when the ini section carries a spec-type, requests > 0,
and accepted == 0 — the exact silent failure this investigation chased, made loud forever.
*Verify first:* the child-output pipe location (`runner/process.py`), the status payload
builder (`runner/lifecycle.py`), the measure endpoint shape (`runner/api.py`). During work,
check whether this build's completion `timings` already carry draft stats — if yes, NOTE it
in the report as the cleaner future path but still ship the log-scrape (the approved rec).
*Accept:* runner pytest green incl. new parser tests (synthetic log lines); old stored bench
legs without spec fields degrade to "—" in reports.

**T4 — engine build bookkeeping (runner).** Diagnose why the b9993 zips landed in (or under
the name) `b10069` — read `runner/binary.py` (download/extract/dir naming) + the
"pin healed upward" logic in `lifecycle.py`; root-cause in the report. Fix: capture the
BINARY's actual build at install (parse `llama-server --version` or the bench's own
build_number output), store it beside the dir, expose BOTH `dirBuild` and `binaryBuild` on
engine status; the bench env then records both. **No silent auto-repair of the user's
on-disk mess** — report the repair step (likely: reinstall at the pin) for the user to bless.
*Accept:* version-parse unit-tested; status shape documented in the runner docs; nothing
deletes/re-downloads without an explicit user go.

**T5 — comment/doc fixes (both repos, small).** `lifecycle.py:1944-1947` — scope the
"broken preset" claim to declared-drafter models; built-in-MTP (no `mtp_draft_file`) with
spec-type and no model-draft is valid and observed working. `seed.py:373` — the knobs no
longer "stay in knob_catalog" (QC-11 removed them); reword. `docs/models.md` (JW) — a short
"MTP: built-in vs drafter-file" section: what each means, how the app resolves them
(`_wants_draft`), what the new acceptance telemetry shows. Bench usage doc
(`docs/bench.md`) — the A/B workflow + the judgment protocol + the new report shape.

**T-SUM — the human run report (JW: `scripts/bench/lib/results.js`).** Rework `renderSummary`
into a report a human reads first: (a) a header block — run id, date, engine dir+binary
builds, book, model(s), total wall time, per-leg wall time; (b) per-leg × per-feature rows —
feature label, ok/fail, wall s, ttft s, completion tokens, effective tok/s, thinking tokens
(think legs), acceptance % (spec legs), flags — seconds not ms, k-units, percentages, no raw
JSON; (c) an **A/B block** auto-emitted when two legs share a model and differ in tunables:
side-by-side per feature (wall · tokens · think cost · acceptance) + a one-line ~100-char
excerpt of each final answer + the two capture-file paths so the user can read the full
outputs; (d) the pp/tg matrix rows as today for legs that ran llama-bench. Same content to
console at run end. *Verify first:* current `renderSummary`/`mergeBandRows` contracts
(`lib/results.js`, `lib/store.js`) — `--report` mode and recalled legs (missing new fields)
must keep working. *Accept:* `--report` on the existing store renders cleanly; a dry-run of
the doc'd examples matches.

**T6 — web-checks (report-only, cite URLs in the report + fold results into §5 here).**
(a) llama.cpp ≥ b9993: SWA/iSWA context-shift support status (release notes / PRs / server
README). (b) qwen3.6-class hybrid (gated-delta-net) context-shift support. (c) the pinned
build's completion `timings` draft fields (source/docs at the tag) — feeds T3's note.

**T7 — runs (LAST, after T1–T-SUM are green + committed).** Port guard first: if
`http://127.0.0.1:17495/v1/health` answers, **STOP and report** — the user's app is live and
must not be touched (standing rule). Otherwise: (1) `npm run bench:gpu -- --legs
gpu-gemma-26b-think` (autostart is baked into the script; the baseline recalls from the
store); (2) the qwen MTP proof — a throwaway scratchpad script driving the bench's own client
lib: load `qwen3.6-35b-a3b-mtp`, one `measure`, read the acceptance line from the newest
router log tail, `stop`, nothing persisted; report the acceptance numbers. The think-leg
captures + the A/B report then come back for the **planner's** `judgment.md` — the executor
does NOT judge quality.

## 4. VERIFICATION CONTRACT (inline execution)

**Renderer gate (rules-checker T7 FAIL fix, 2026-07-21):** any task that edits a renderer
file under `src/renderer/` — T2 touches `services/writerAI.js`, `services/rag/chat.js`,
`services/benchHook.js`, etc. — MUST pass `node scripts/headless-smoke.js` (THE renderer
gate per CLAUDE.md; `build:vite` does NOT clear a renderer change) BEFORE those files are
committed. Boot the server + `npm run dev:vite` first (isolated data dir / non-live ports);
the smoke drives every hash route asserting zero JS errors. Alternatively, if the live T7
bench run is being used as the renderer verification, the renderer-service files' commit
moves to AFTER T7.

Standard gates by tier: JW config/bench-lib/docs → `npm run test:unit` + `build:vite` +
bench `--dry`; JW renderer services → the above PLUS the headless smoke; runner → `python
-m pytest` (from the runner repo) + ruff on touched files. Report every result verbatim
(pass/fail/skip). Known-bad on this box (do not chase): `test_pci_gpus_linux_lspci_name_match`;
`test_ensure_model_ready_raises_on_failed_load` is flaky — rerun once.

**Execution rules (inline).** Branch `claude/admiring-galileo-il3q0o` in BOTH repos
(`E:\Dev\Web\justwrite-app`, `E:\Dev\Web\just-llm-runner`). The JW tree has PRE-EXISTING
staged/modified state (claude-config/* deletions staged, `server/pyproject.toml` modified)
— **commit ONLY the files this batch touches; never sweep pre-existing state into a
commit.** Windows box: absolute paths every command (the cwd footgun), `python` not
python3, never hardcode a browser path (shared `findChrome()`), match each file's existing
style (no bulk reformats). One rules-checker on the final diff before a tier-2/3 commit
(the plan-level check already ran — see the log). Per task, record: what changed at
file:line, verify-first findings, test output verbatim, open questions. STOP conditions are
stop conditions.

## 5. EXECUTION LOG

**Stop #1 (2026-07-20 ~23:00, executor run 1 — correct stop, nothing edited).** The
executor was denied every code edit by the pre-task gate: the provisioned
`pre-action-check.py` detects a subagent only via the transcript tail's `isSidechain`
(:126-132), but the hook receives the PARENT transcript here (newest entry = the Agent
launch), so the bypass never fires — five `DENY pre-task` at pre-action.log:2320-2324,
zero BYPASS lines. The planner confirmed the regression: the 2026-07-15 hook detected via
PAYLOAD keys (`agent_id`/`isSidechain` in the hook input — log :901-966 proves both
signals firing), and the 2026-07-20 21:26 claude-config re-provisioning shipped the
tail-only variant. Repair = ruling #7 (payload-first detection ORed with the tail scan +
keys logged on every payload bypass + a 3-assert pin in `test_gates.py`), applied by the
user via `patch-gate.py` because the auto-mode classifier blocks the assistant from
editing its own enforcement hooks (and blocked a rules-checker spawn whose prompt
described the patch — both refusals honored). Standing lesson pinned by the test: the
bypass has TWO signals and the payload one is load-bearing.

**Plan rules-check (2026-07-21, inline execution).** Independent rules-checker on the full
plan: T1/T3/T4/T5/T6/T8–T12 PASS; **two FAILs, both folded in.** (a) **T2 receipt** — the
emission fact (llama-server `reasoning_format=auto` → `reasoning_content` on the chat
delta+message) was asserted verified with no cited source, and the synthetic-chunk test
greens even if the field/endpoint is wrong → T2-STEP-0 added (pin the receipt first). (b)
**T7 renderer gate** — the gate list omitted the headless smoke (THE renderer gate per
CLAUDE.md) though the batch edits renderer services → §4 now requires `headless-smoke.js`
on renderer-service edits before their commit. Useful anchors the checker confirmed:
`StreamDelta`/`LLMResponse` live in `just-llm-runner/llm_runner/llm/base.py` (additive
`reasoning` field); EVERY adapter drops reasoning-output today (`openai_sdk.py:378`,
`ollama.py:119-121`, `anthropic.py`) so there is no parallel impl to reuse/collide-with;
kit `ui/src/client.js:150-161` if/else frame parser silently ignores an unknown
`{reasoning}` frame (JustVoice-safe); `writerAI.js:133` → `{html,raw,usage}`,
`rag/chat.js:212` → `{answer,citations,usage,bibleOnly}`, `benchHook.js` adapters →
`{output,usage,extra}` spread into the capture at `run.js:395-398` (the plumb is exercised,
not dead).

**T1 DONE (2026-07-21).** Added the `gpu-gemma-26b-think` A/B leg to
`scripts/bench/configs/gpu.json` (same model/features/book as the baseline; only
`tunables.think = true`; `llamaBench: null`). Verified: config loader accepts it, think
passes through to the Bench preset, the store fingerprint gives it its own identity.
Reversal: delete the leg object. Verified by `bench --dry` (both legs listed; think leg
shows `think:true`, llamaBench skipped).

**T2-STEP-0 DONE (2026-07-21).** Web-confirmed the `reasoning_content` channel (both
shapes) — receipt pinned in §1.

**T2 RUNNER-SIDE DONE (2026-07-21).** The reasoning channel now flows runner→SSE. Edits
(all additive, product output byte-identical when reasoning absent): `llm/base.py` —
`reasoning: str = ""` on `LLMResponse` + `StreamDelta`; `llm/openai_compat.py` — `chat`
reads `message.reasoning_content`, `stream_chat` yields `StreamDelta(reasoning=…)` for
`delta.reasoning_content` (before the text delta); `llm/prompts.py` — `RunResponse.reasoning`,
`run_feature` passes `resp.reasoning`, `stream_feature` emits `data: {"reasoning": …}` SSE
frames (+ docstring). `dispatch.py` needed NO change (it passes the dataclass/delta through
untouched — verified at :297,:345). Tests: 3 new in `tests/test_adapter_extra.py`
(non-stream present, non-stream absent = "", stream deltas) + updated
`test_prompts.py::test_run_renders_prompt_and_returns_content` for the additive field.
Verified: `pytest tests/test_adapter_extra.py tests/test_prompts.py tests/test_llm_dispatch.py`
→ **85 passed**; ruff clean on all touched files. Reversal: `git checkout` the five files.
Scope note (honest): openai-compat/local path ONLY; anthropic/gemini/ollama adapters leave
`reasoning=""` (their native reasoning-output surfaces differ — a named follow-up, not
half-done here).

**T2 KIT + JW DONE (2026-07-21).** Reasoning now flows all the way to the bench capture.
Kit (`just-llm-runner/ui/src`): `client.js` `requestStream` gains an `onReasoning` cb + a
`{reasoning}` SSE frame branch (additive — a caller without the cb ignores it); `services/
aiFeature.js` both wrappers accumulate + return `reasoning` (runAiFeature's `/run` fallback
reads `json.reasoning`; a reasoning frame counts toward `framesSeen` so the fallback can't
fire mid-think). JW services: `services/writerAI.js` (all 3 `runAction` returns — shared
contract, replace_all), `services/rag/chat.js` + `services/rag/characterChat.js`
(`{answer,…,reasoning}`). Bench: `services/benchHook.js` — `writerAction` + `ragChatResult`
carry `reasoning`; the top-level capture adds `reasoning` (text) + `reasoningChars` (metric);
`scripts/bench/run.js` strips the reasoning TEXT from the leg.json metrics (lives once in the
capture file, like `output`). Verified: `build:vite` ✓, `bench --dry` ✓ (2 legs),
**vitest 415 passed** — updated 2 exact-shape assertions in `aiFeature.test.js` for the
additive field + added a `{reasoning}`-frame capture test (20/20 in that file).

**SCOPE DECISION (flagged for the user, not silently taken).** T2's item (3) named "~6 JW
service reducers." I plumbed only the ones the BENCH actually exercises with think ON —
writerAI (continue/rewrite/expand/tighten/describe) + rag chat (ask-book / character-chat).
The bench's other two features (entitySweep, critique) are JSON-contract actions that FORCE
think off (`prompts.py:416`), so they cannot produce reasoning — no plumbing needed. The
remaining analysis/* services have NO reasoning consumer this batch (no UI reads it), so
plumbing them now would be dead code (T1 right-not-fast cuts BOTH ways). They stay one-line-
ready: the kit wrapper already returns `reasoning`; a service spreads it when a UI consumer
lands. If you want the full set plumbed now regardless, say so.

**T2 FULL SET DONE (2026-07-21, user "go do it all").** Added reasoning passthrough to the
two remaining PROSE reshapers — `services/resumeBriefing.js` (briefing) + `services/
analysis/voiceDrift.js`. `services/runJson.js` needs NO change: it returns the raw
runAiFeature `result`, which already carries `reasoning`, so all 14 JSON-analysis callers
get it free — and JSON-contract actions force think off (`prompts.py:416`), so their
reasoning is structurally always "". Every reason-CAPABLE path now carries reasoning; no
reason-capable service drops it. (build:vite re-checked below with T4/T5.)

OPEN for T2: the headless smoke on the renderer edits (owed BEFORE commit).

**T3 — DESIGN FORK, needs the user's ruling (verify-first contradicted the plan).** The
plan's T3 said "the runner already PIPES child output into router-*.log; add a per-model
accumulator over the `draft acceptance` lines." **That premise is false:** the runner
REDIRECTS the child's stdout+stderr straight to the log FILE (`process.py:621`
`stdout=logf`) — there is no in-process line reader to hook, so log-scrape would need a NEW
file-tailer thread (and the rules-checker already flagged the regex as build-fragile).
Meanwhile the measure probe already POSTs `/v1/chat/completions` (`lifecycle.py:145`), whose
response `timings` carry `draft_n` + `draft_n_accepted` when speculation is active (T6c).
So the STRUCTURED path is a ~10-line change: the probe returns the two draft counts, and
`measure()` includes `draftN`/`draftNAccepted`/`draftAcceptance`; the bench reads them from
its per-leg `measure` call (leg.json already stores `measure`), and flags
`spec-configured-but-never-engaged` when spec is on but `draftN == 0`.
- **Recommended (A): structured-via-measure.** Robust (no regex), minimal, structured.
  Coverage = the measure probe per leg (one representative generation) — enough to prove
  MTP engaged + its acceptance + the never-engaged flag. Trade-off vs the user's original
  rec: covers the measure probe, NOT every feature run, and adds fields to the measure
  response (the user's log-scrape rec was "covers all traffic, no API change" — both of
  those change).
- **(B): the plan's log-scrape** — a runner file-tailer thread over router-*.log; covers
  ALL feature traffic but is the fragile/heavier path the false premise assumed.
- **(C): A now + a BENCH-side router-log tail at leg-end** (no runner change) for aggregate
  all-traffic acceptance — gets both, most work.
HELD for the ruling; T4 + T5 proceed (independent). **T-SUM** renders whatever T3 lands on,
so it's held too.

Then T4/T5/T-SUM/T7.

**T3 DONE (2026-07-21, option A).** `lifecycle.py`: `_default_measure_probe` returns a
3-tuple `(ct, ms, draft)` — `draft` = `{n, accepted}` from the completion `timings`
(`draft_n`/`draft_n_accepted`) when spec ran, else None; `measure()` adds `draftN` /
`draftNAccepted` / `draftAcceptance` when present. 3 injected test probes updated to
3-tuples + a new `test_measure_surfaces_draft_acceptance`. The bench captures it FREE via
`legRecord.measure`. Reversal: revert the two lifecycle funcs + tests.

**T4 DONE (2026-07-21).** `binary.py`: new `exe_build_number(exe)` runs `<exe> --version`,
parses `version: NNNN` → "bNNNN" — the TRUTH vs `build_of_exe`'s dir name (they diverge:
b9993 binaries in a b10069 dir). Cached by path, only successful reads cached (transient
failure retries), never raises. `engine_status` adds `binaryBuild` + `buildMismatch`
alongside `build`. Bench env (`run.js`) records `engineBinaryBuild`/`engineDirBuild`/
`engineBuildMismatch` and uses the binary build for staleness. Tests: 2 in `test_binary.py`
+ 1 engine_status mismatch test (cache-seeded to avoid a real spawn). NO auto-repair — the
mismatch is surfaced for the user to bless a reinstall. NOTE: the `version:` regex is
confirmed against injected strings; the exact on-box `--version` output is verified by the
first real read.

**T5 DONE (2026-07-21).** Code comments: `lifecycle.py` "broken preset" scoped to
declared-drafter models (built-in MTP valid); `seed.py:373` stale "stay in knob_catalog"
corrected. Docs: `docs/models.md` (MTP built-in vs drafter-file); `docs/bench.md` (the A/B
workflow + the new report shape).

**T-SUM DONE (2026-07-21).** `scripts/bench/lib/results.js`: engine line flags a build
mismatch; feature table gains a `think chars (med)` column; NEW "MTP acceptance + thinking
(per leg)" table (draft acceptance + `⚠ never engaged` + median think chars); NEW "A/B —
<model>" block for any model with 2+ legs (side-by-side wall · tokens · think chars +
capture-file pointers). Verified by `--report` against the stored leg (renders cleanly; new
sections stay hidden on pre-T2 data). Reversal: revert results.js.

**VERIFICATION (2026-07-21, all green).** Runner `python -m pytest` → 648 passed (the 1
failure `test_pci_gpus_linux_lspci_name_match` is the pre-existing Linux-path known-bad),
ruff clean on all touched files. JW `test:unit` → 415 passed, `build:vite` clean, `bench
--dry` OK, biome clean on the 6 touched renderer services.

**BLOCKED — T7 + the renderer smoke (2026-07-21).** `:17495` is LISTENING (the user's live
app, PID 22060). The standing rule forbids touching it, and T7's own port guard says STOP
when `:17495` answers. So the two remaining steps wait for the user to free the port:
- **T7 (the runs)** — the think A/B leg + the qwen MTP proof run — needs a bench that drives
  a server; with the app live it would drive the user's real server/engine. HELD.
- **The renderer headless smoke** on the T2 renderer-service edits — owed before their
  commit; needs a server + vite. Can run on an ISOLATED stack (vite :1420 is free + a
  temp-data-dir server on another port) WITHOUT touching :17495, if the user wants it now.
- **Commit** — HELD until the smoke runs + one rules-checker on the final diff (nothing is
  committed yet; the JW tree still has the pre-existing staged claude-config deletions to
  keep OUT of any commit).

**Delivered by executor run 1 despite the stop (all read-only):**
- **T6(a) — Gemma iSWA context-shift: keep OFF, now with upstream receipts.** The iSWA
  KV cache cannot shift/reposition tokens (PR #13194); llama-server gates on
  `llama_kv_self_can_shift`; a Gemma-4 SWA checkpoint-restoration regression exists
  (issue #21769). Matches the 2026-07-07 on-box verdict + the seed's off state.
- **T6(b) — qwen3.6 hybrid (gated-delta-net): same family of context-shift limitations;
  no evidence of safe support — keep OFF.**
- **T6(c) — this build's `/completion` timings DO expose `draft_n` + `draft_n_accepted`**
  (llama.cpp server README/speculative docs) — recorded in T3 as the cleaner future
  acceptance path; the log-scrape ships regardless (total coverage, no response-path
  change — the user's standing rec).
- **T1 verified ready:** `config.js:30,99-106` accepts `llamaBench:null`;
  `server.js:59-73` passes `think:!!tunables.think`; the store fingerprint
  (`store.js:35-45`) includes tunables so the think leg gets its own identity — recalled
  baselines unaffected. The leg JSON is validated and ready to drop in.
- **T2 scope defect confirmed** (independent rules-checker: T2 FAIL, all else PASS) —
  resolved by ruling #8 (full plumb).
- **T3/T5 anchors confirmed; T4 not yet root-caused** (stopped at the blocker).

## T2 REVERTED (2026-07-21, user decision — code cleanliness)

The user judged T2 (the reasoning-TEXT plumb) over-scoped: for the think A/B they only
compare the ANSWERS (already captured in `output`), and the reasoning text means little to
a human reader — so it was reverted, leaving unused plumbing out of the shared runner/kit.
**Reverted:** `base.py`, `openai_compat.py`, `prompts.py` (runner); `client.js`,
`aiFeature.js` (kit); `writerAI.js`, `rag/chat.js`, `rag/characterChat.js`,
`resumeBriefing.js`, `voiceDrift.js`, `benchHook.js` (app services) + their reasoning tests
(`test_adapter_extra.py`, `test_prompts.py`, `aiFeature.test.js`) — clean `git checkout`.
Surgical (removed the reasoning bits, kept the rest): `run.js` (the metrics strip),
`results.js` (the think-chars columns/cells; MTP-acceptance + A/B blocks kept),
`docs/bench.md` (the think-chars/reasoning-text mentions). **KEPT:** T1 (A/B think leg), T3
(MTP acceptance in measure), T4 (binary-build truth), T5 (comments + models.md), T-SUM (the
report, minus think-chars). Verified: runner 258 passed, JW 414 passed (pre-T2 baseline),
build clean, `--report` renders with no think-chars and the MTP/A-B tables intact.

## 6. THE ROBUSTNESS FIX (2026-07-21, user: "fix it" → plan → "you rec" → "go")

**Why:** the first A/B run (2026-07-21_06-45-46) could not have detected the quality
difference the user saw in a manual test: the chat question was retrieval-summary (its
answer sits in the excerpts — thinking has nothing to add), the judgment features force
think off (JSON guardrail — their identical walls across legs, 18.8/17.8s and 40.8/43.2s,
are the run-to-run noise control), thinking was capped at 1024, and n=2. The honest verdict
of that run is "no gain visible on easy prompts at the 1024 cap" — NOT "thinking doesn't
help." Latency stands regardless: TTFT ~37–43s with think on is disqualifying as the
interactive default.

**P1 — hard-question legs (`gpu.json`, user's rulings: 2 questions · high budget).** Four
chat-only legs, `repeats: 3`, llamaBench off: `gpu-gemma-26b-hq1`/`-hq1-think` and
`gpu-gemma-26b-hq2`/`-hq2-think`. Think legs carry `reasoningEffort: "high"` → the seeded
local map's 8192-token budget through the real cascade (reasoning.py:80-85 "the PRESET'S
OWN ask"; map row `local-llamacpp high = 8192`, reasoning_map_api.py:41) — zero new
mechanism. Questions authored from the FULL book text (all scenes read; the live DB book is
ch1–ch3, both bench runs report 3 chapters, so the questions use ch1–ch3 facts only).

ANSWER KEY, HQ1 ("what early signs connect the commission-token to what is inside the
Nine…"): the shop lamp was tuned to a deeper-Facet note — the fork rang near it unstruck,
"a note that leaned" (ch1 sc1); the token hums "exactly the note the lamp had leaned toward
all morning" (ch1 sc2); corroboration — a street lamp gutters as the token passes on Kettle
Lane (ch1 sc3) and the wrapped fork gives a muffled ring approaching the Nine (ch2 sc1);
IMPLICATION (the reasoning step no single scene states): the token resonates with a
deep-Facet source inside the Nine, so the "routine structural clearance" is a deep-Facet
site the Concern wants papered over — confirmed ch2 sc2 ("certify a deep-Facet wound as an
empty warehouse"). Strong = all three connections + the implication; weak = retells one scene.

ANSWER KEY, HQ2 ("why did the three earlier parties never come out, and why can Ode
remember…"): the Nine loops ~one hour — starts at seven past (Ode's stopped watch), resets
at the top (ch3 sc2); the reset pulls matter AND memory back, so anyone who can't feel the
deep Facets "forgets the whole turn and lives it fresh" (ch3 sc1); therefore the three
parties (Sedge's ledger count, ch2 sc1) never left — "they're not dead… still walking in.
Every hour. For nine years" (ch3 sc1), the third party sitting in the east gallery
believing it's arrival day (ch3 sc2); Ode remembers because deep-Facet sensitives stand
"slightly outside the loom" and are not reset (ch3 sc1) — the exemption Cael and Nettle
share. Strong = loop mechanism + forget rule + Ode's exemption; weak = "they were trapped"
with no memory-reset mechanism.

**P2 — A/B grouping (`results.js`).** Group key = model + effectiveFeatures +
effectiveFeatureArgs (an A/B is only meaningful when the ONLY difference is tunables);
single-feature chat groups get the question in the block heading. Verified: `--report`
renders, the main pair still groups, hq legs list as never-measured.

**P3 — the measure bug, root-caused + fixed (runner).** The gate trusted the INTERNAL
ledger (`_resident[mid].status == "running"`) while the ROUTER — the documented authority
(`resident()` reads the router's live `GET /models`; the bench polls the same) — was
serving every feature run fine; no load-thread error in the app log, so the entry had gone
stale/reconciled. Fix in `measure()`: when the internal entry is missing/not-running,
consult `_parse_router_models(self._router_models(...))` — loaded/sleeping → proceed (with
an info log naming the divergence), absent → refuse as before. Plus the bench now names its
model explicitly end-to-end: `api.py` measure gains `model_id`, `server.js` sends it,
`run.js` passes `leg.model` — no more `_last_id` guessing. Regression test:
`test_measure_falls_back_to_router_authority_when_ledger_stale`. (The WHY of the stale
ledger itself — which reconcile popped or froze the entry — is the known awaiting-go
ledger-reconcile item; measure no longer depends on it.)

**P4 — docs.** bench.md: the hard-question protocol (+ answer-key rule + how to add one);
this section. Verified (all green): runner measure tests 7/7 + ruff clean; `--dry` lists
6 legs; `--report` renders with correct grouping.

**The run (the user's):** `npm run bench:gpu` (full band) or
`npm run bench:gpu -- --legs gpu-gemma-26b-hq1,gpu-gemma-26b-hq1-think,gpu-gemma-26b-hq2,gpu-gemma-26b-hq2-think`
(the hard-question A/B only, ~15–25 min: think-at-8192 runs are long). Then the captures are
judged against the keys.

## 7. OPEN AFTER THIS BATCH

- The planner's first `judgment.md` on the Gemma think A/B (feature-by-feature verdict).
- Qwen think A/B (deferred by ruling #2) once the proof run lands.
- The b9993 thinking-loop re-test proper (its own doc + criteria; the A/B contributes
  evidence only).
- The engine-dir repair on the user's box (T4 reports it; the user blesses it).
- T6 results may reopen the context-shift question — only with engine support + a real
  overflow symptom.

## 8. ENGINE-BUILD: ONE SOURCE (the pin), CONCRETE URLs, REACTIVE GUI (2026-07-21)

**The bug + why the first two attempts were wrong.** The engine build lived in two DB
places: the `pinned_build` runner_setting AND a build tag baked into every stored
`runner_binary` URL. The install folder is named for the pin while the download used the
stored URL — so a b9993 binary landed in a b10075-named folder, and after the user's app
reset, changing the pin in the UI changed nothing on screen. First attempt (`_url_for_build`,
re-point at download only) was a half-measure — the stale value still sat in the DB and the
GUI. Second attempt (store `{build}` TEMPLATES + a server-side `LlamacppSpec` validator that
composed URLs) was ALSO wrong for a reason the user had stated repeatedly and I kept missing:
it put a `{build}` placeholder in the editable GUI field and composed on the SERVER. The
user's actual design (stated four times): the field shows the REAL path; changing the pin
re-derives the real path reactively (that's what Vue is FOR); the whole real URL is saved to
the DB; the server just fetches it and never composes.

**The design shipped.** The pin is the single build source. URLs are CONCRETE in the DB
(no templates, no `{build}` anywhere the user sees or the DB stores). The pin→URL
substitution lives in ONE JS helper, `applyBuildToUrl` (`ui/src/common/services/engineUrl.js`),
reused by both writers so they can't drift: (1) the Binaries panel (`LuRunnerBinaries.vue`)
holds a `watch(pinnedBuild, …)` — change the pin (even mid-typing) and every row's URL field
re-points to the real path for that build, shown live; on load it resolves once so a stale or
legacy-`{build}` DB value never displays a placeholder; Save persists the concrete URLs; (2)
the update-to-latest flow (`useEngine.js`) bumps the pin AND re-points every stored URL via
the SAME helper before PUTting, so the DB holds the real URL for the new build and the folder
(named for the pin) matches the binary. The server does NOT compose — `acquire_binary` fetches
the stored concrete `asset_url` verbatim (`binary.py`). `config.py` seeds concrete URLs at
`DEFAULT_PINNED_BUILD` (bumping it produces the concrete URLs for that build, for fresh installs
+ "reset to defaults"). The QC-25 `_heal_pin_upward` + its whole `save_pin` seam stay DELETED
(constructor param, `configure_service` pass-through, `install.py` writer): the pin is only ever
user-written; its DB-reset scenario is covered by drop+reseed+reinstall.

**file:line.** NEW `ui/src/common/services/engineUrl.js` (`applyBuildToUrl` — the one
substitution site; handles `bNNNN` tag swap, legacy `{build}` resolve, custom-URL passthrough) ·
`LuRunnerBinaries.vue` (`_resolveRowsToPin` + `watch(pinnedBuild)`; `_apply` resolves on load;
`{build}` placeholder + the resolved-preview line + help copy removed — the field IS the real
path) · `useEngine.js` `updateToLatest` (re-points stored URLs via the helper, PUTs pin+binaries) ·
runner `config.py` (concrete seed URLs + comment) · `schema.py` (validator + `url_for_build` +
`re`/`model_validator` imports removed) · `binary.py` (plain fetch; docstring/comment) ·
`lifecycle.py` (heal + save_pin deleted; engine_status comment) · `llm/install.py` (save_pin_fn
gone) · `llm/stores.py` (get_config serves the DB rows). Tests: `test_binary.py`
(`test_acquire_fetches_stored_url_into_pin_folder` — concrete, no template leak);
`test_lifecycle.py` (heal tests deleted; `test_deliberate_downgrade_survives_install` kept).

**How verified.** ruff clean; runner pytest **643 passed / 1 pre-existing known-bad**
(`test_pci_gpus_linux_lspci_name_match`); `build:vite` green; biome clean on the 3 changed
JS/Vue files; the `applyBuildToUrl` helper unit-checked out-of-band (6/6: tag swap on path
AND filename, cudart path-only, legacy `{build}` resolve, custom-URL passthrough, empty/blank).
The headless smoke ran on an ISOLATED stack (vite :1421 → server :17496, temp data dir): the
AI page + the engine panel MOUNT and fire their real `/v1/ai/engine-config` fetch with **zero
reactivity JS errors** (the only console error was a CORS network refusal, not a code throw).
**The live pin-drive in a browser (type pin → field re-points) was NOT observed** — every dev-
stack layer is hardwired to port 1420 (vite `strictPort`, `serverApi.js` origin resolver's
`devPorts:["1420"]`, the server CORS allowlist), so the isolated copy on 1421/17496 was
rejected while the user's live app held 1420. Per the user's explicit call (2026-07-21) the live
pin-drive smoke is **WON'T-DO / not owed** — the change stands on unit(6/6) + compile + biome +
clean-mount; it is not a blocker and won't be run. A throwaway 2-line `serverApi.js` patch used
to reach the isolated server was reverted before commit (tree confirmed clean). Shipped: JW
`7ef63ac`, runner `4c2c4d5`.

**What would reverse it.** Re-introducing a build tag as a second stored source, moving the
compose to the server, or any writer that edits the pin behind the user's back.

**Open.** (Live pin-drive renderer smoke: WON'T-DO, user's call — see above.) On the user's box:
restart + reinstall the engine once so the on-disk folder/binary rebuild under the pin.
