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

## 9. Download parallelism default 4→8 + the pypdl auto-scale gap (2026-07-21)

**What changed.** `DEFAULT_DOWNLOAD_SEGMENT_COUNT` 4→8 (`config.py:71`; the two fallback
declarations kept in step, `schema.py:147` + `runner_config_api.py:46`). **Why:** origins that
throttle PER-CONNECTION (GitHub releases → Azure blob is the confirmed exhibit — a Range probe
returned `206 Partial Content` + `Accept-Ranges: bytes`) hand back roughly N× with N connections,
so 8 beats 4 there; cost is more CDN load, no-op when the cap is per-IP or the local link.
**Verify:** no test asserts the default was 4 (`test_download.py` clamp tests use 6/200/0); a
fresh seed / "reset to defaults" now gives 8, but an EXISTING DB keeps its 4 until the user sets
it in the GUI field or reseeds. **Reverse:** set the three constants back to 4. NOT committed yet.

**Finding (grounded in our vendored pypdl 1.5.7 source — the AI-search claim, verified).** pypdl
does NOT auto-scale the segment count down under load. It drops to a SINGLE stream ONLY when the
server advertises no Range support (`producer.py:149-151`, size 0 or no `accept-ranges`). If Range
IS supported but the origin blocks / rate-limits some of the N connections, pypdl retries the
blocked segments (the `retries` knob) and then FAILS the whole file (`consumer.py:70` puts the
task on the failed queue → `download.py:161` raises `RuntimeError`) — it does not degrade to fewer
segments. So a high count is only as safe as the origin's per-IP tolerance; for a robust CDN
(GitHub/Azure blob, HF) 8 concurrent is modest and normally fine, but it is not self-healing.

**BUILT (2026-07-21, the user's go: "your rec no rules checker but you can run tests, go").**
The DEGRADE LADDER is in `stream_download` (`download.py`): a multi-segment failure retries at
HALF the segments (8→4→2→1; 1 = a plain single stream); only the exhausted ladder raises; a
cancel never degrades. Each step-down clears pypdl's segment state (`_clear_segment_state`) —
REQUIRED, because `create_segment_table` (pypdl utils.py:487) reuses the count recorded in
`<dest>.json` whenever url+etag match, which would silently pin the old count; part boundaries
also shift with the count, so stale part-files must never be reused. The clear is best-effort
with a bounded retry + a `gc.collect()` nudge (a torn-down worker's aiofiles handle can hold a
Windows lock until finalization); a straggler is logged and swept again after a degraded ladder
succeeds. Options considered: pySmartDL (dead upstream, fork is one person, still no
adaptation), aria2c (best-in-class but dormant upstream + per-OS binary + process integration),
PyFastDL (1 commit, 0 stars — someone else's unreviewed rolled-own) — receipts in the chat
research; pypdl stays, the ladder closes its one gap.

**REAL BUG FOUND BY THE LADDER'S TESTS — silent corruption on single-stream retry.** pypdl's
task-level `overwrite=False` makes the retry of a FAILED single-stream download bless the
partial `dest` the failed try just wrote as "already complete" (consumer.py:100) — a corrupt
half-file reported as success. Latent in production for ANY no-Range server (and the ladder's
final rung). The flag never bought us resume — part-file resume is governed by the
progress-file/etag match in `create_segment_table`, NOT the task flag (proven:
`test_resume_after_cancel` passes with True). Fix: `overwrite=True` (+ the existing dest-unlink
belt). Tests: `test_ladder_degrades_to_single_stream_and_completes` (asserts bytes + the logged
degrade sequence 4→2→1 + the plain GET + the honest no-litter contract),
`test_failure_after_retries_raises_runtimeerror` reshaped (plain stream fails too → the
exhausted ladder raises RuntimeError). Verified: the download file 8/8 consecutive green
(three flake modes found and fixed: pypdl-internal request-string assert → replaced with the
adapter's own contract; WinError-32 locked part-file → bounded retry + gc; post-success litter →
final sweep + logged-straggler assert); ruff clean; full runner suite 644 passed / 1
pre-existing known-bad. **Reverse:** revert download.py + test_download.py (the 4→8 default
constants revert separately).

## 11. STUCK DOWNLOAD (per-connection crawl) + UNINSTALL THAT "DID NOTHING" (2026-07-21)

**Two user reports, one session (user: "i can download the engine by cliking on link in browser
and it doesnt slow down … but with our download it gets stuck 3/4 way through … also engine
uninstall does not work"). Both root-caused from the LIVE server log
(`src-tauri/target/debug/data/logs/justwrite.log`), the user's DB read directly, and the vendored
pypdl 1.5.7 + our own source. Neither is GitHub's fault.** The user gave "go" on items 1–3; item
4 is surfaced OPEN (its stated precedent doesn't hold — see below).

### The stuck download — WHY (verified)
The cudart fetch at 13:03:42 ran ~3 MB/s then collapsed to ~430 KB/s for the last quarter (the
user's three screenshots: 79%→91% at 449→417 KB/s); the user killed it at ~91% (the log's "cannot
schedule new futures after shutdown" IS that kill, not a real fault), and the retry minutes later
ran ~1.8 MB/s end-to-end and finished — SAME server, SAME file. pypdl's ONLY defense is a
60 s TOTAL-SILENCE timeout (`sock_read=60`, vendored `pypdl/pypdl.py:152`); a connection that
trickles even a few KB/s never times out, is never restarted, and pypdl never re-issues a slow
segment. So a CDN edge that shapes one of the N connections leaves the finished segments idle,
waiting on the slowest — "stuck at 3/4." A browser click opens a FRESH connection and gets a fast
path. §9's degrade ladder does NOT cover this: the ladder fires on a hard FAILURE (a segment
pypdl gives up on → RuntimeError); a connection that stays alive-but-slow never fails, so nothing
in our stack made a fresh connection. This is the gap §9 explicitly left ("it is not
self-healing").

### Item 1 — the stall/collapse WATCHDOG (BUILT). `download.py`.
A `_DownloadWatchdog` (pure, clock-injected so its thresholds unit-test without real waits)
observes `(current_size, size)` each poll and returns a restart reason:
- **stall** — `current_size` unchanged for `STALL_SECONDS` (20 s).
- **collapse** — rolling rate (trailing `RATE_WINDOW_SECONDS`=8 s) below `COLLAPSE_FRACTION`
  (0.25) of THIS download's own best rate, sustained `COLLAPSE_SECONDS` (30 s), and only once
  best ≥ `COLLAPSE_MIN_BEST_RATE` (1 MB/s) with remaining > `COLLAPSE_MIN_REMAINING` (8 MB). The
  best-rate gate is what makes a genuinely-slow line NOT loop (its best never reaches 1 MB/s → no
  collapse; and a progressing slow line never stalls).
- Never fires while `size` is unknown or in the combine/finalize phase (`current_size >= size`).

On a fire, `_attempt` calls `dl.stop()` and raises a private `_Restart`; `stream_download` catches
it SEPARATELY from the ladder's `RuntimeError`: **same segment count, part-files KEPT (resume),
`_clear_segment_state` NOT called** — a restart resumes from `<dest>.N`+`<dest>.json` exactly like
`test_resume_after_cancel` (the ladder step-down is the ONLY path that clears, because its
boundaries shift). Cap `MAX_DOWNLOAD_RESTARTS` (5); after that ONE final attempt runs with the
watchdog OFF so a slow finish always beats an error. Each restart logs a WARNING with the reason +
byte position. Existing tests stay green untouched (a ~2 MB test completes in <1 s — 20 s/30 s
thresholds never fire).

### Item 2 — UNINSTALL rewrite (BUILT). `lifecycle.py` `uninstall_engine`.
Three real defects, all confirmed by the log/DB: (1) it removed only the ONE resolved build dir —
this morning the box had `b9993` AND `b10075`, so uninstall deleted one, status re-resolved the
other, and the UI stayed "Installed" (the user's exact "uninstall button remained, no install
button"; now only `b10076` is on disk so it removes cleanly — their "works now"). (2)
`shutil.rmtree(..., ignore_errors=True)` swallowed Windows lock failures silently (the log's
06:11:47 `WARNING: old engine build b9993 still present after cleanup (files in use?)` proves the
race). (3) it refused while `status=="installing"` with "wait for it to finish" — during a
crawling download that is never. The rewrite: signal `_engine_cancel` + JOIN the install thread
(bounded `ENGINE_INSTALL_JOIN_TIMEOUT`≈20 s, OUTSIDE `self._lock` — the installer thread takes it)
→ `self.stop()` to free exe locks → delete EVERY build dir under `llamacpp/` (keeping `logs/` +
loose `models.ini`) via `_rmtree_with_retry` (bounded retry for Windows lock-release lag) → VERIFY
what's left and return an HONEST `error` naming any still-locked dir instead of a silent success →
LOG what was removed (uninstall logged nothing before).

### Item 3 — the `{build}` placeholder guard (BUILT). `binary.py` `_fetch` + `runner_config_api.py`.
A leftover `{build}` template URL 404'd an install at 06:02 (the log). The user's DB is CLEAN now
(read directly: all 8 rows concrete `b10076`, pin `b10076`). Belt so it can never be a silent
4-retry 404 again: `_fetch` refuses any URL containing `{` with a clear message BEFORE the network;
the engine-config PUT rejects a binary `assetUrl`/`runtimeUrl` containing `{` with a 400.

### Item 4 — seed default count 4→8 on existing DBs (OPEN — NOT built; the precedent doesn't hold).
The user blessed 8 as the default (§9), but seeding is insert-if-missing (`seed.py:1047-1055`), so
the user's existing DB still reads `download_segment_count=4` (verified in the DB dump, `built_in=1`).
I proposed the `model_list_rules` built-in-refresh convention — **but that convention does NOT
translate here.** `set_model_list_rules` flips `built_in=False` on a user edit; the engine-config
PUT saves scalars via `store.set_setting()` (`runner_config_api.py:132-136`) which does NOT flip
`built_in` (`stores.py:797-807`). So a user who deliberately sets the count to 4 in the GUI leaves
the row `built_in=True`, and a built-in-keyed refresh would clobber their choice every boot.
DECISION for the user: (a) make `set_setting` flip `built_in=False` (correct + general, but changes
`built_in` semantics for every runner setting — pinned_build, models_max, … — broader than asked),
then refresh; or (b) DROP the auto-bump — the WATCHDOG (item 1) is the real fix for the stuck
download, count is secondary, and "reset to defaults" or the GUI field already give 8. Leaning (b).

### Rules-checker refinements (2026-07-21, single checker on the final diff → VERDICT PASS)
Two notes acted on (neither a contract FAIL): (i) **T3 convergence** — the pre-existing
`_run_install` stale-build sweep still used bare `shutil.rmtree(..., ignore_errors=True)` +
swallow-and-warn — the SAME silent Windows-lock race defect #2 fixes, and its "still present
after cleanup (files in use?)" warning is literally the b9993 line in the user's log. Converged it
onto `_rmtree_with_retry` (ONE source for "robustly remove a build dir"); only a genuine survivor
now warns, so the spurious lock-lag warnings stop. (ii) **Doc precision** — the "KEEPING the
part-files → resume" claim holds for a MULTI-SEGMENT restart; a single-stream rung (segments
disabled, or the fully-degraded ladder tail) has no part-files, so its rare restart re-fetches
from zero — correct, not data loss, and outside the multi-connection "stuck 3/4" case this
targets. Docstring corrected to say so.

**file:line.** `download.py` (`_DownloadWatchdog`, `_Restart`, `_attempt` watchdog wiring +
`stream_download` restart branch; module constants `STALL_SECONDS`/`COLLAPSE_*`/
`MAX_DOWNLOAD_RESTARTS`) · `lifecycle.py` (`uninstall_engine` rewrite, `_rmtree_with_retry`,
`ENGINE_INSTALL_JOIN_TIMEOUT`) · `binary.py:_fetch` (placeholder guard) ·
`runner_config_api.py` (binaries-loop `{`-reject). **Verify:** `test_download.py` — watchdog unit
cases (stall fires · collapse fires · no-fire on uniform-slow · no-fire near end · recovery resets
· finalize phase) + integration (a fired watchdog RESTARTS + resumes, `_clear_segment_state` NOT
called; MAX_RESTARTS cap → uncapped final attempt completes; cancel still propagates) ·
`test_lifecycle.py` — removes ALL builds · cancels a live install · reports a locked dir honestly ·
`test_binary.py` — `_fetch` refuses a `{`-URL. Then full runner pytest + ruff. **Reverse:** revert
`download.py` + `lifecycle.py` + `binary.py` + `runner_config_api.py` + the three test files.

## 10. ENGINE UPDATE BRICKED THE ENGINE → atomic + launch-verified install (2026-07-21)

**The bug (user report).** Clicking the built-in row's "update engine" (merged from the web
branch) left the engine unable to launch on every backend — `router failed to become healthy
(exit 3221225781)` = `0xC0000135` `STATUS_DLL_NOT_FOUND`; it SURVIVED a restart (the broken
build was on disk) and only a manual uninstall→reinstall fixed it.

**Root cause (two compounding flaws in the install path, both pre-existing; the merged update
button exposed them).** (1) `_run_install` on `force` did `shutil.rmtree(binary_dir(pin))` —
**deleting the live build BEFORE downloading the replacement** (lifecycle.py, the old
1388-1391); a download that then failed/partialled left no working engine. (2) `acquire_binary`
declared success on the exe FILE existing, never on it LAUNCHING — so a build missing a runtime
DLL (cudart, or any companion that 404'd on an unverified `latest`) passed as "installed", and
the stale-build sweep then deleted the previous working build. Result: a broken engine on disk,
permanent across restarts.

**The fix.** `acquire_binary` is now ATOMIC + VERIFIED (binary.py): it downloads + unpacks into
a sibling `.staging-<gpu>` dir, launch-verifies the unpacked exe (`_verify_exe_launches` runs
`<exe> --version`; a loader failure — Windows NTSTATUS ≥ 0xC0000000 / Unix exit 127 / OSError —
raises), and only then `_swap_into_place` atomically retires the old variant and moves the new
one in (same-volume renames, rolled back on a mid-swap failure). A `finally` discards the staging
on any failure, so the live engine is **never touched until a verified build is ready**. `force`
(threaded through, replacing the pre-delete) makes it re-fetch even when a variant exists.
`_run_install` no longer pre-deletes; the stale-build sweep still runs, but only AFTER a good
build is verified in place. So a failed/partial/DLL-missing update leaves the working engine
intact and simply reports an error.

**file:line.** `binary.py` (`_verify_exe_launches`, `_swap_into_place`, `acquire_binary`
staging/verify/swap + `force` param; +`import shutil`/`subprocess`) · `lifecycle.py:_run_install`
(force pre-delete removed, `force=force` passed). **Verify:** `test_binary.py` — verify flags a
missing DLL / passes a real launch; a failed download leaves the working engine; a
fails-to-launch build is discarded; force reinstalls via swap. `test_lifecycle.py` fakes accept
`force`. Ran: ruff clean; full runner suite **648 passed** / 1 pre-existing known-bad.
**Reverse:** revert binary.py + lifecycle.py + the two test files.

## 14. FINISH THE DOWNLOAD-BAR CONSOLIDATION + self-heal stuck "Unloading…" (2026-07-21)

**The user, furious:** *"why does every download ui look different — model, quicksetup, engine …
it is simple, reuse ui, ui has cancel/resume buttons in it, not separate cancel … we already
spent massive time on consolidation, why wasn't it done."* Correct: the 2026-07-15 ONE-DOWNLOADER
consolidation shipped `DownloadBar` (title/role · header Cancel/Retry/Ready · shared `UiProgress`
with % · size · speed · ETA) and migrated QuickSetup + the catalog strip CARDS + (this session)
the boot splash — but LEFT two surfaces hand-rolling a bare `UiProgress` + a SEPARATE Cancel: the
**Local engine panel** (`LuRunnerEngine.vue`, its own `UiProgress` + `Cancel` button) and the
**catalog model ROWS** (`LuModelCatalog.vue`, bare `UiProgress`, "Unloading…"/"failed" as text).
So the engine bar behind the QuickSetup modal was literally a different control on screen.

**What changed.**
- `DownloadBar.vue` gained a `compact` prop (inline for a table row: no card chrome, the bar +
  its Cancel/Retry on one line; a `compact` error shows the message + Retry). Full mode unchanged.
- `LuRunnerEngine.vue`: the install progress is now `<DownloadBar :task="engineTask" title="The
  engine" role="…">` (an `engineTask` computed = a task-shaped view of the `useEngine` install
  state; `progressLabel` already carries % · size · speed · ETA). Deleted the bare `UiProgress` +
  the separate Cancel button + its stale CSS + the `UiProgress` import.
- `LuModelCatalog.vue` rows: the loading/stopping/error status cell is now `<DownloadBar compact
  :task="taskFor(m.id)">` (the SAME per-model adapter the cards already use) — deleted the bare
  `UiProgress`, the "Unloading…" text span, the "install engine ↑/failed" text span, and the
  `UiProgress` import. Cancel/Retry are the bar's own.
  Now EVERY download/load surface is the one `DownloadBar`.
- **Stuck "Unloading…" (the user's screenshot: a model frozen on unload after a cancelled load).**
  Root cause in `lifecycle.py`'s status overlay (~1228): a `stopping` ledger entry FORCED the row
  to "stopping" even when the router no longer reported the model live — and the entry is only
  popped by `stop()`'s compare-and-pop, which runs AFTER `stop()` acquires `_router_lock`, a lock a
  slow/hung load holds; so a cancelled/evicted model showed "Unloading…" indefinitely. Fix
  (display-only, no concurrency change): once the router confirms the model is gone (absent, or
  listed "unloaded"), DON'T paint "stopping" — the UI clears at once; a genuinely-tearing-down
  child (router still "loaded") still shows "stopping" as before. (The permanent-stick itself was
  a downstream symptom of the broken engine hanging loads — now fixed; this makes the UI self-heal
  regardless.)

**file:line.** `ui/src/common/components/DownloadBar.vue` (compact) · `ui/src/components/
LuRunnerEngine.vue` (engineTask + DownloadBar, drop UiProgress) · `ui/src/components/
LuModelCatalog.vue` (rows → compact DownloadBar, drop UiProgress) · `llm_runner/runner/
lifecycle.py` (~1228 status self-heal). **Verify:** ruff clean; `build:vite` green; full runner
suite **650 passed** / 1 pre-existing known-bad; vitest **417 passed**; 39 stop/status tests green
(the reconciliation didn't regress). **NOT visually verified** — the user's app holds :1420/:17495
and I won't drive it; the one thing to eyeball is the compact bar's label length inside the tight
catalog STATUS column (truncates with ellipsis; widen the column or shorten the row label if
cramped). **Reverse:** revert the four files.

## 12. THE DOWNLOAD WAS SLOW BECAUSE OF **THE SEGMENT COUNT PER HOST** — ladder + watchdog REMOVED (2026-07-21)

**⚠ SUPERSEDES §9's degrade ladder and §11's stall/collapse watchdog — both DELETED.** The slow
engine download had one cause and one fix; the ladder and watchdog were band-aids for a problem I
created by using the wrong segment count.

**Measured on the user's Windows box across SEVERAL runs (no proxy; single-connection GET = the
browser). CORRECTED 2026-07-21 after a frustrated user pointed at an AI-generated pypdl demo:**
| | single stream | 8 segments |
|---|---|---|
| GitHub releases → Azure blob (**engine**) | **~21 MB/s, STEADY (every run)** | 1.6 · 4.2 · 21 · 32 MB/s — **wildly variable** |
| HuggingFace (**models**) | ~4 MB/s, steady-slow | **~31–41 MB/s, steady-fast** |
The real finding is NOT "8 is always slow" — my first number (1.6 MB/s) was skewed by CONTENTION
(the app's own 8-segment download was running during the test, so 16 parallel connections got
throttled). More runs show the true pattern: on GitHub/Azure a SINGLE stream is rock-steady ~21
MB/s (the browser's speed), while 8 segments is a GAMBLE (1.6 to 32 MB/s run to run) — the user's
original ~0.7 MB/s was a bad roll. On HuggingFace the opposite: 8 segments is reliably ~5–10×
faster (per-connection throttle). So the engine downloads single-stream for RELIABILITY, not peak;
models keep multi-segment. (The AI demo hardcodes 8 everywhere — fine on HF, a gamble on GitHub.)

**FINAL fix (2026-07-21, the user's call after pointing at the working reference).** I flip-flopped
on the segment count and the user rightly stopped it: *"did you actually think about the working
code i gave you vs the 10 times you keep trying to fix your code?"* Their reference is dead simple —
`pypdl.start(segments=8, retries=5, overwrite=False, block=False, display=False)` + a poll loop —
and it works. So we do the SAME: **both the engine and the models use plain multi-segment pypdl via
`download_kwargs`** (segment count + retries from config, default 8). No single-stream special case,
no per-host branching. The engine's original ~0.7 MB/s was a transient network/CDN slow patch (my
40 MB samples showed high variance run-to-run, not a reproducible config problem); pypdl's own
`retries` cover that class of thing, exactly as the reference relies on. **REMOVED** the whole
invented apparatus from `download.py` — `_DownloadWatchdog`, `_Restart`, `_clear_segment_state`, the
degrade-ladder loop, the `STALL_*/COLLAPSE_*/MAX_DOWNLOAD_RESTARTS/RATE_WINDOW_SECONDS` constants +
the `gc`/`deque` imports — so `stream_download` is a plain single-attempt pypdl adapter. Kept the
two REAL fixes: the `overwrite=True` corruption guard (a failed SINGLE-stream partial being blessed
as complete — a real edge, and harmless for multi-segment since we unlink dest first) and, separately
(§10), the atomic launch-verified install.

**LESSON (for me):** when the user hands over working reference code, DIFF against it FIRST and adopt
its shape — don't keep patching my own. Ten tweaks chasing a mis-measured, likely-transient slowdown
cost far more than reading 40 lines of theirs would have.

**FINAL-FINAL (2026-07-21, later the same day — the revert above was WRONG and the user's live
screen proved it).** After the revert to multi-segment, the very next real engine download crawled
again at ~1.0–1.1 MB/s (user screenshots at 53% and 87%) while a simultaneous single-connection
test ran 25.7 MB/s and pypdl-8-segments ran 3.2 MB/s — the same moment, same box. Across every
observation this session, ONE connection to GitHub/Azure was fast and steady (20–26 MB/s, six of
six runs) while 8 parallel segments were slow in five of seven (1.0/1.6/3.2/4.2 MB/s, incl. BOTH
real app downloads); the "transient network patch" story was me explaining the data away. So the
engine download is back on **`segments=1` — one connection, exactly what the browser does**
(`binary.py:_fetch`; the `download_kwargs` import dropped again), and the models keep multi-segment
8 via `download_kwargs` (HuggingFace rewards parallel; model downloads were never the complaint).
Comments in `config.py` + `download.py` state the split truthfully. **Verify:** ruff clean; the 32
binary+download tests pass; the user must RESTART the app so the sidecar reloads the code — the
in-flight 87% download finishes on the old path. **Reverse:** pass `**download_kwargs(config)` in
`binary.py:_fetch` again — but don't: two real-world engine downloads crawled on multi-segment and
none did on a single connection.

**file:line.** `download.py` (plain adapter; watchdog/ladder/per-host all gone) ·
`binary.py:_fetch` (`**download_kwargs(config)`, multi-segment like the models path) · `config.py`
(comment: both paths use multi-segment) · `test_download.py` (watchdog + ladder tests removed; core
adapter tests kept + a simplified failure test). **Verify:** ruff clean; download+binary+lifecycle =
**191 passed**; full runner suite **650** (1 pre-existing known-bad). **Reverse:** the removed
apparatus is in git history if ever needed — it should not be.

## 13. THE ACTUAL FIX — pypdl REPLACED by the industry-standard CHUNK-QUEUE downloader (2026-07-21)

**The user's rulings, verbatim:** *"create a downloader that does concurrency just like any other
downloader … it is known and coded many times and it works"* and *"you should not hardcode a
solution for github alone or hf alone — no other downloader does this."* Both applied. The single-
stream-vs-8-segment flip-flopping above (§12) chased the wrong variable: the problem was never the
CONNECTION COUNT, it was pypdl's STATIC segmentation — each connection owns a fixed 1/N slice of
the file, so ONE slow connection drags the whole download (GitHub's CDN hands out fast and slow
connections unpredictably; the user's engine downloads crawled at 0.7–1.1 MB/s twice while their
browser was fast). Professional downloaders (IDM "dynamic segmentation", aria2, Steam, hf_transfer)
use a CHUNK QUEUE instead: the file becomes many fixed-size chunks (8 MB) on a work queue and N
connections PULL chunks as they finish — a slow connection only delays the one chunk it holds, so
the aggregate is the SUM of the connections, never hostage to the slowest. That design needs no
per-host tuning, which is exactly why "any other downloader just works".

**What shipped.** `runner/download.py` REWRITTEN as that chunk-queue downloader on `requests`
(already a dependency; ~230 lines, pypdl dropped from `pyproject.toml` — no more aiohttp/aiofiles):
`stream_download` keeps its exact signature (`segments`/`retries` via `download_kwargs`, progress +
cancel callbacks, `poll_interval`; new `chunk_size` kw, default 8 MB). Range-probe (1-byte ranged
GET) → total+etag; N worker threads pull chunk indexes off a `queue.Queue`, each GETs its byte
range on its own connection and writes at its offset into a preallocated sparse `<dest>.part`;
per-chunk RETRIES on fresh connections (a stalled connection dies at the 60 s read timeout and the
chunk re-queues — stall recovery built in, no watchdog needed); completed chunks persist to
`<dest>.json` (atomic tmp+replace, etag-validated) so a cancel/crash RESUMES past them; all chunks
done → `os.replace(part, dest)`. Single-stream fallback when Range is unsupported, the size is
unknown, the file fits in one chunk, or `segments=1`. BOTH callers use the SAME config — engine
(`binary.py:_fetch` `**download_kwargs(config)`) and models (`models.acquire_model`) — no per-host
anything. Multi-FILE concurrency is unchanged (per-model threads + `download_max_concurrent` in
lifecycle.py). Stale pypdl comment mentions swept (schema/config/seed/runner_config_api/models).

**Verify (the user's box, real CDNs, our actual code, 8 connections):** GitHub 17.2 MB/s ·
HuggingFace 14.8 MB/s — fast on BOTH with the one config. ruff clean; `test_download.py` reshaped
to the chunk contract (chunked bytes-identical incl. request-count, resume-from-completed-chunks,
exhausted-chunk → RuntimeError, cancel, fallbacks, clamps) — 32 download+binary tests green; FULL
runner suite **650 passed / 1 skipped / 1 pre-existing known-bad** (`test_pci_gpus_linux_lspci_
name_match`). **Reverse:** restore pypdl in pyproject + revert download.py/test_download.py —
don't; this is the design every working downloader uses.

## 15. ONE MECHANISM for every model bar — `taskFor` projection DELETED, catalog FEEDS `createDownloadTask` (2026-07-21)

**Supersedes §14.** §14 shared the `DownloadBar` *component* but left the catalog on a SECOND
task machine — the hand-rolled `taskFor` projection inside `useRunnerModels` (states `""`/`running`/
`error` only, no `cancelled`/`done`). QuickSetup rendered a real `createDownloadTask`; the catalog
rendered the projection. Two machines → the user's report: the card said "starting…" where
QuickSetup said "Loading it into your graphics card", and the bar kept moving after Cancel (the
projection had no cancelled state, and the poller kept feeding `loadProgress`). The user's ruling
(verbatim): *"same mech, same function — delete the two mechanisms… one control, no matter size in
grid — same same same."*

**What changed (WHY · file:line · verify · reverse).**
- **`createDownloadTask` gains an external-feed pair** (`ui/src/composables/useDownloadTask.js`):
  `apply(reading)` (the poll-body EXTRACTED — no-ops unless `running`, so a cancel/terminal is
  never overwritten: the freeze-on-cancel) and `arm(phase)` (a running bar with no self-poll).
  WHY: QuickSetup DRIVES its task (`start()` self-polls); the catalog can't — a model may be
  loading because a feature run / warm-boot / another surface asked (server-driven), with no local
  `start()` to own a loop. So the singleton FEEDS the SAME machine. `_poll` now calls `apply(read(st))`
  (no logic fork). Also a `finalizing` field (below).
- **`useRunnerModels` rewritten** (`ui/src/composables/useRunnerModels.js`): the hand-rolled
  `loadProgress`/`loadRate`/`_feedLoad`/`downloadMap`/`_feedDownloads`/`cancellingIds`/`downloadingIds`/
  `cancelLoad`/`cancelDownload`/`loadErr`/`needsEngine` + the `taskFor` projection are DELETED. New:
  ONE `loadTask` = `createDownloadTask(modelLoadChannel(() => activeLoadId))` (the `/status` channel
  is single-model — one spawn-load at a time) + a per-model `downloadTasks` map =
  `createDownloadTask(modelDownloadChannel(id))` (concurrent, `/download/status` map). `_syncTasks`
  (called by `refresh`) fetches `/status` + `/download/status` and FEEDS the tasks: a "loading" model
  present in the download map is a standalone download → its `downloadTask`; else the spawn-load →
  `loadTask` (via `activeLoadId`). Followers are `arm`ed at the trigger (`retryLoad`/`download`) and
  by the poll as a safety net; a finished/absent one is reset/reaped. `taskFor(id)` returns
  `loadTask`/the `downloadTask`/`IDLE`. `loadTask.retry` is overridden to run the ONE workflow
  (`retryLoad` — engine-check-first, unchanged). `error` (shared) replaces `loadErr` for load-failure
  surfacing.
- **`DownloadBar`** (`ui/src/common/components/DownloadBar.vue`): the `compact` prop + variant
  templates/CSS are GONE — ONE look, sized by its container (the user: "same, no matter size").
- **`LuModelCatalog.vue`**: slot cards + rows render the full `DownloadBar` via `taskFor(id)`;
  `stopping` is a plain "Unloading…" pill (not the bar — an unload isn't a download); the per-row
  Cancel buttons are removed (Cancel lives in the bar); the load/download CTAs hide while loading.
- **Retry-during-teardown race → `finalizing`** (the user's follow-up: *"retry should only be enabled
  after cancel complete"*): `createDownloadTask` gains a `finalizing` field (cleared by `arm`/`reset`);
  `DownloadBar` disables Retry while `task.finalizing`; `useRunnerModels` overrides `loadTask.cancel`/
  `downloadTask.cancel` to set it the instant the user clicks, and it clears when `_syncTasks` resets
  the task (the model left loading/stopping — teardown done). So Retry can't re-race a still-tearing-
  down load. QuickSetup is untouched (its `cancel()` doesn't set `finalizing`).
- **Cancel LABEL keys on the same flag** (follow-up: *"says cancelled instead of cancelling"* — while
  Retry is disabled the teardown is still running, so the word must say so): the `label` computed in
  `useDownloadTask.js` returns **"Cancelling…"** for `state==="cancelled" && finalizing`, **"Cancelled"**
  once `finalizing` clears — off the SAME flag that gates Retry, so the word and the button can never
  disagree. (Supersedes my earlier read of "say cancelled not cancelling" — with the disabled-Retry
  in-progress state now visible, "Cancelling…" is the honest word while it's still tearing down.)

**"Getting ready" lag — ROOT CAUSE (verified, NOT changed here — the load path is load-bearing):**
`POST /load` returns instantly (a background thread — `lifecycle.py:892`) and marks the model
`downloading`/`queued`; the thread then sets `detail="preparing"` (`lifecycle.py:1686`) and calls
`_acquire_and_identify` → `_acquire_model` (`lifecycle.py:1571`), which RESOLVES the HF repo/quant file
and probes its size BEFORE the first byte — only the first download chunk flips the phase to
"model weights"/"Downloading the model" (`lifecycle.py:1671`). Both `queued`+`preparing` map to
"Getting ready" (`loadPhases.js` PHASE_WORDS), so the client faithfully shows exactly the server's
pre-byte HF resolve. It is NOT a client poll lag or a detection failure. Speeding it up = optimizing
that resolve on the server (the corrupt-download gate + MTP-draft resolve + integrity check ride it) —
left OPEN pending the user's go + a measurement of where the resolve time actually goes.

## 16. "GETTING READY" SPEEDUP — profiled to `select_files`' two serial HF calls (2026-07-21, RESEARCHED, not yet built)

**Profiled (verified in source).** The pre-byte wait is `select_files` (`models.py:85`) making TWO
**sequential** HF API round-trips before any download starts: `_revision_sha` (`models.py:99→60`,
`GET /api/models/{repo}/revision/{rev}` → commit sha) then `_tree` (`models.py:100→66`,
`GET …/tree/{rev}?recursive=true` → file list + sizes/oids). Only after both does `acquire_model`
begin streaming (`models.py:474`), which is what flips the phase to "model weights". Both key ONLY on
`revision` — neither needs the other's result.

**RESEARCH: are those calls needed for an already-downloaded model? (the user's "don't break anything")**
Traced every consumer of `select_files`'s `(commit_sha, entries)`:
- `entries` → ONLY the download decision (which files + sizes, `acquire_model:459-495`). Nothing to
  download when cached.
- `commit_sha` → ONLY the snapshot-dir path + the `refs/<rev>` pin.
- The LOAD does NOT use either: `_run_load` resolves the GGUF via `_main_gguf` (`lifecycle.py:1575→1326`)
  — a network-free `rglob` over the on-disk snapshot + the shared quant-match — and the router `.ini`
  gets that ABSOLUTE path (never the HF ref resolver). Other callers of `select_files` are the INSPECT
  path (`gguf_remote.py:62`, Add/Edit form) — unrelated to load.
- **Verdict: skipping the calls for on-disk weights is SAFE for correctness.** It costs exactly two
  things: (1) **upstream freshness** — the current re-resolve-every-load picks up a repo that pushed a
  new GGUF (changed oid → re-download); a skip uses the on-disk file (Re-download is the forced-refresh
  escape); (2) **size auto-heal** of a truncated blob — but the chunk-queue's atomic `os.replace` means a
  blob at its final path is complete, and `_verify_gguf` stays as the integrity gate.

**TWO independent pieces — piece 1 SHIPPED, piece 2 HELD:**
1. **Parallelize `select_files`' two calls — SHIPPED (2026-07-21).** A 2-worker `ThreadPoolExecutor`,
   both `.result()`-ed (`models.py:99-106` + the `concurrent.futures` import). PURE WIN, zero behavior
   change — same `(sha, files)`, same errors (a bad repo/quant still raises from `.result()`), keeps
   freshness + auto-heal — and ~halves the pre-download resolve wait. This directly addresses the
   REPORTED case (loading a NOT-downloaded model — the deleted-then-reload in the user's screenshots).
   **Verify:** ruff clean; `test_models.py` + `test_lifecycle.py` **180 passed**. **Reverse:** revert
   `select_files` to the two serial calls.
2. **Cached fast-path in `_acquire_and_identify` — SHIPPED 2026-07-21** (the user: *"do 1 and 3, do
   it right"* — the fixture surgery below got done). Full shipped detail in **§17**. The HELD note
   below is kept as the sequencing history (why it wasn't rushed into the first pass). The
   design (gate on `_model_downloaded` → `cached_gguf_path` + `_cached_draft_path`, keep `_verify_gguf`,
   return without `select_files`/download) is correct for LOADING, but building it revealed a
   test-infrastructure conflict, NOT a product bug: the `test_lifecycle.py` fixture (`_service_for:120`)
   injects a fake `acquire_model` that RETURNS the pre-seeded snapshot, and the seed at `:77-79` is BOTH
   "the cache" `cached_gguf_path` matches AND the input `_main_gguf` needs post-load. So 8 download /
   download-during-load tests seed an on-disk file yet exercise a download — the fast path (correctly)
   skips it, and they fail. Making it right = restructuring that fixture (the fake acquire should WRITE
   the file, not pre-seed) + gating the fast path to the LOAD path only (the download endpoint's job is
   to download; `_run_download:2457` keeps the full acquire). That is careful surgery on the download
   path the user asked to protect ("don't want to break anything, we just redid the downloader"), so it
   is sequenced as its OWN focused pass rather than rushed into this one. **Open decision:** do piece 2
   as a focused task (with the fixture fix) — the user's call; the freshness tradeoff (no auto-pickup of
   upstream updates; Re-download forces it) is also theirs, and acceptable for a pinned catalog.

**Verify:** `npm run build:vite` green; `npm run test:unit` **421 passed (44 files)** —
`loadTaskAdapter.test.js` rewritten for the fed-follower contract (spawn-load fed from `/status`,
standalone download fed from the map, stopping → no bar, download error → retry), `useDownloadTask.test.js`
gains arm/apply/finalizing coverage, `engineGateLoad.test.js` reads the shared `error` (was `loadErr`).
No consumer references any removed export (grep, whole tree). Renderer NOT visually verified (the
user's live app holds :1420/:17495 — never touched). **Reverse:** revert the four kit files + the
three JW test files; the projection was the second mechanism, so reverting reintroduces the drift.

**STILL OPEN (needs a clean repro before touching — NOT fixed here):** a state-desync the user hit
with a rapid *delete model → change the General dropdown (loads) → cancel* sequence — dropdown vs
card disagree, "Unloading…" stuck, a deleted model's Download path unclear. Likely CAUSED by the
retry-during-teardown race the `finalizing` fix now prevents; re-test that exact sequence before
diagnosing the delete/swap/stop lifecycle (a blind rewrite there risks worse breakage).

## 17. "do 1 and 3, do it right" — cached-skip SHIPPED + Fix C (MTP drafter loadability) (2026-07-21)

**Piece 3 (cached fast-path) — SHIPPED.** `_acquire_and_identify` gains `skip_if_cached` (default
False); `_run_load` passes True, so a LOAD whose weights are already on disk resolves the cached
GGUF (+ the draft when wanted) via the network-free `cached_gguf_path`/`_cached_draft_path`, runs
`_verify_gguf`, and returns WITHOUT `select_files` or a download — no two HF API calls, no
"Getting ready" wait for a cached load. The DOWNLOAD endpoint (`_run_download`) is unaffected
(default False → always the full acquire; "Download" means download). **Test surgery done right:**
the `test_lifecycle.py` `_service_for` fixture gained `seed_cache` + a fake `acquire_model` that now
WRITES the gguf (keyed on the repo's registered quant, never the passed arg — the MTP draft leg
passes a file path there), so a not-cached download-during-load test actually exercises the
download; four such tests pass `seed_cache=False`, and a new `test_cached_load_skips_the_hf_resolve`
pins zero-acquire on a cached load. **Verify:** ruff + full runner **651 passed, 1 skipped, 1
pre-existing lspci known-bad**. **Reverse:** drop `skip_if_cached` + the fixture's write/`seed_cache`.

**Piece 1 (Fix C — MTP drafter loadability) — dspark half SHIPPED; the tier-C auto-enable is a
DECISION, OPEN.** `_UNLOADABLE_DRAFTER_MARKERS = ("dspark",)` + `_drafter_loadable(path)`
(`models.py`) is ONE source shared by: `classify_gguf_entries` (draft rows gain `loadable`),
`_gguf_drafter_in_repo` (never returns an unloadable candidate), the wire `RepoDraftRow.loadable`
(declared — the q4OrBetter trap), and the form (`LuModelCatalog.vue`: the auto-pick skips
unloadable drafts, `onDraftPick` doesn't auto-enable MTP for one, the dropdown labels it "not
supported by the built-in engine"). So the OWN-repo dspark draft no longer auto-enables MTP.
`test_models.py`: gemma MTP draft `loadable is True`, bonsai dspark `loadable is False`,
`test_drafter_excludes_unloadable_dspark` (reverses the old dspark-pick test). Verify: ruff + full
suite green; build:vite + vitest 421.
**THE MTP-enable RULE (the user's, 2026-07-21 — RESOLVED, SHIPPED).** Excluding dspark exposed that
the form was auto-*applying* the tier-C borrow (`find_inherited_mtp_drafter`, `models.py:377`, fires
on ARCH alone) and turning MTP on with a GUESS. The user's rule: **enable MTP only when CERTAIN —
built-in prediction heads, or an own draft file the built-in engine can LOAD; if we can't verify (an
own draft the engine can't load, e.g. dspark) or it's only a base-model guess (the borrow), leave MTP
OFF and NOTE it in text — the user can paste a draft repo/file (the manual fields already exist).**
Implemented in `LuModelCatalog.vue`: `inspectLink` no longer copies `r.mtpInherited*` into the draft
fields (the borrow is never auto-applied — it only rides on `inspected` to power the note), so
`e.mtp = !!r.mtpBuiltin || !!e.mtpDraftFile` is true ONLY for built-in or an own LOADABLE draft (the
`loadRepoFiles` auto-pick already filters to loadable). `mtpFact` gains two note cases: own draft(s)
present but none loadable → "may be MTP-capable, but no draft the built-in engine can run — check MTP
below to paste your own"; a base-family drafter discovered (no own drafts) → "the base family may
support MTP — check MTP below to paste a draft repo/file". Net for Ternary Bonsai: MTP UNCHECKED + the
first note, dropdown shows its (labeled) drafts, manual paste unchanged. Verify: build:vite green;
full runner still 651/1-skip/1-known-bad (server unchanged this round — the rule is form-only over the
existing `loadable` signal). Reverse: restore the `inspectLink` borrow-apply + the old `mtpFact`
"borrows" fallback.

**FINAL form rule (iterated with the user 2026-07-21).** The borrow is pre-filled ONLY when the model
ships NO own drafts (`hasOwnDrafts` gate in `inspectLink`) — a model that ships its OWN drafts (even
ones the engine can't load, e.g. dspark) is MTP-capable "but not for our machine": MTP stays OFF, its
own drafts stay in the dropdown, and `mtpFact` reads "this model ships an MTP draft, but none the
built-in engine can load — check MTP below to paste a compatible draft." When there ARE no own drafts,
a base-family drafter is PRE-FILLED (repo/file) but never auto-enables MTP — `mtpFact` says "the base
family may support MTP — a drafter is pre-filled; check MTP below to try it or paste your own"; the
Draft-file field becomes a free-type input when a foreign draft-repo is set (its file isn't in this
repo's dropdown). MTP auto-enables ONLY for the CERTAIN cases — built-in heads or an own LOADABLE draft
(`e.mtp = !!r.mtpBuiltin || ownLoadableDraft`). **Honest scope (the user accepted "conservative guess
for now"):** loadability is a NAME heuristic (`dspark` marker), NOT verified by reading the draft's arch
— a false-conservative just leaves MTP off and the user pastes the right repo; the truly-non-hardcoded
fix (range-read the draft GGUF's `general.architecture` + check it) is logged as the real follow-up.

**RUNTIME failure IS surfaced — verified + gap closed (2026-07-21, the user's "make sure if MTP won't
load we tell them").** Chain: a draft that can't load fails the router spawn → `_run_load` sets
`status="error"` with the message → a chat/AI run's `ensure_model_ready` (`lifecycle.py:1313`) raises
`The local model "X" failed to load: <message>` → the UI shows it. For the recognized co-load-race
draft crash there was already an actionable `RuntimeError` ("turn MTP off in the model's tune, or
re-download the draft", `:2399`). GAP found + fixed: an UNKNOWN-ARCHITECTURE draft (dspark) is
*unfixable*, but the fast-fail at `:2323` was exempted for ANY `_looks_like_draft_failure`, so it either
wasted two engine restarts on the race-recovery path or fell through to a generic message with no MTP
guidance. Fix: drop the `and not _looks_like_draft_failure` exemption (the race is `invalid vector
subscript`, which is NOT unfixable, so it still gets solo-escalation) and, when a draft is configured,
the fast-fail message now names MTP — "turn MTP off for this model or set a draft the built-in engine
can load." Test: `test_unfixable_draft_arch_fails_fast_with_mtp_hint` (spawns once, no restart detour,
error carries the MTP hint). **Verify:** ruff clean; full runner **652 passed / 1 skip / 1 pre-existing
lspci known-bad**; build:vite green. **Reverse:** restore the `and not _looks_like_draft_failure` guard
+ the generic message; drop the test.

## 18. TWO-SESSION SYNC — pull the cloud session's work, re-apply this session's on top (2026-07-21)

**The situation.** A parallel cloud session pushed to the same branch while this session's work sat
uncommitted: JW got 5 commits (`1dcf82b` their Fix C docs/vitest · `85ce88d`+`d7a7257` the ornate
"book plate" boot splash · `f313b9d`+`666f280` TASKS/smoke), the runner 3 (`4408856` plan doc ·
`c4c8fce` their Fix C — arch DENY-set + `unsupportedArch` + `draftSelect.js` + autotune coverage ·
`f823c4f` the catalog rework: Bench column, sortable headers, fit-to-data width, ⋯ actions menu).
Both sessions had independently built Fix C, and both had reworked `LuModelCatalog.vue`.

**The user's rulings.** Their splash (keep ALL functionality) · their catalog table/⋯-menu is the
BASE, redo the one-mechanism against it · Fix C: their server half; the form keeps THIS session's
enable policy (their form, committed before the day's rulings, still auto-applied + auto-enabled the
tier-C borrow — the exact behavior rejected at the image-24 review) · one pass.

**What was done (verified per step).** Uncommitted work stashed (`wip-opus-session-2026-07-21`, both
repos) → `git pull --ff-only` both. Then, re-applied from the stash: every file the cloud commits did
NOT touch restored byte-exact (runner: chunk-queue `download.py` + `binary/config/schema/seed/
runner_config_api/pyproject` + `lifecycle.py` (cached fast-path · MTP fail-fast hint · stuck-unload
self-heal · uninstall/atomic-install) + the one-mechanism kit files (`useDownloadTask/useRunnerModels/
DownloadBar/LuRunnerEngine/AiModelsArea`) + my test files; JW: `warmStartup.js`, `gpu.json`,
`CLAUDE.md`, this doc, the 3 task-machine tests). DROPPED as superseded: this session's server Fix C
(`models.py` marker set, `model_catalog_api.loadable`, my Fix-C tests) — theirs is a superset.
Hand-merged: `models.py` (their Fix C + ONLY my `select_files` parallelize hunk re-applied);
`LuModelCatalog.vue` (their base: destructure→one-mechanism + `retryLoad` one-workflow restored,
status cell → the ONE `DownloadBar` (`.lu-mgrid-dlbar`), stopping→"Unloading…" pill, per-row Cancels
deleted (Cancel lives in the bar), CTAs hidden while loading, form = their `draftSelect` scaffolding +
the day's enable policy: `e.mtp = builtin || ownLoadableDraft`, borrow pre-filled ONLY when no own
drafts, `mtpFact` honest branches, free-type Draft-file when a foreign draft-repo is set);
`App.vue` (their splash + the engine-gate `DownloadBar` restored above the model bar); `TASKS.md`
(their entries + the Qwen-bench note; this session's MTP task entry NOT re-added — Fix C shipped).

**Verify:** ruff clean; full runner **654 passed / 1 skip / 1 pre-existing lspci known-bad** (their
autotune+Fix-C tests and this session's task-machine/cached-load/MTP-hint tests coexist); JW
`build:vite` green; vitest **429 passed (45 files)** incl. their `draftSelect.test.js`. **Reverse:**
the stashes still exist (`git stash list`) — the pre-merge state of either repo is recoverable from
`stash@{0}` until dropped. **Open:** the smoke's catalog sort-header assertion (their `666f280`) was
not re-run here (:1420 may be held by the live app); the redo kept the header DOM intact.
