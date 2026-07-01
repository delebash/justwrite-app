# Morning Recap — JustWrite

> # ⛔⛔ THE #1 OPERATING RULE — read this FIRST, every time ⛔⛔
> **NEVER act until the user literally types the word "go".** A question is ONLY a question —
> answer it in words, then STOP and WAIT. Do NOT read/grep, edit, spawn an agent, run a
> workflow, build, or commit until "go". **"It was only read-only" is NOT an excuse — do not
> start.** Approval for one step is NOT approval for the next; each new action needs its own go.
> Companion hard rules: ② show the user any agent/research prompt BEFORE sending it; ③ never
> stop a running job/agent unless the user says "stop"; ④ always confirm the plan + get the
> explicit go first; ⑤ never guess — read code line-by-line, cite file:line. *(The user has had
> to repeat #1 many times across 2026-06-27 — it is the top cause of lost trust. GET IT.)*

> The in-repo session-pickup **MAP** — current state + backlog + an index into the
> deep docs. Read it after the global `~/.claude/CLAUDE.md` and this repo's
> `CLAUDE.md`. **This is a map, not a log:** stable architecture + rules live in
> `CLAUDE.md`; deep per-task detail lives in `docs/plans/*` — this file POINTS to
> them, it does not duplicate them (a copy drifts).

**Branch (all repos):** `claude/admiring-galileo-il3q0o`.

---

## Current state (2026-06-29) — AI **Lab + Preset** model: redesign of routing/tuning (in progress)

> **The one current design doc for the AI config model is `just-llm-runner/docs/plans/2026-06-29-ai-lab-preset-model.md`.**
> Its ENTITIES + CASCADE are LOCKED and SUPERSEDE the job-centric routing in the 2026-06-28 master plan (AREA 1/2, the
> C1/C2/C3/C5 lab/switch resolutions, and the whole "Routing by job" engine screen). The master stays authoritative only
> for the model catalog / Fit / licensing / model research, which this redesign does not touch. The AI **screen structure**
> (which tabs, where assignment/tuning live) is being iterated by TRIAL-AND-ERROR (user, 2026-06-29 — "locking sorta of …
> trial and error testing different designs until we get it correct"), so the doc's **Trial iteration log** is the live
> authority for the current tabs/layout; the prose below records the stable model, not each trial. Its "LIVE TRACKER"
> status block is the single source of truth for where the build stands — read it before resuming AI work.

The redesign was worked out with the user over 2026-06-28/29 and replaces the job-centric model. The core idea: **the Lab
(the Tuning tab) is the single source of truth.** You build and TEST a complete engine config in the Lab and SAVE it as a
**preset** (a preset = model + frozen switches + params, with the two hardware fit-knobs `-ngl`/`--n-cpu-moe` auto-computed
at load, shown in the Lab, and user-overridable). A **feature** is then just a prompt that points at a preset. Presets are
assigned in bulk by **category** (the visible feature grouping already in the nav), with a global Default underneath and a
per-feature override on top — the cascade at call time is feature-override → category preset → global Default. The
Fast/Balanced/Best dial was dropped and the "job" concept was demoted (task-type survives only as the recommendation key);
there is no model-per-job routing layer anymore. The reasons, the entities, and the screen list are all written out in full
in the design doc; do not re-litigate them here.

**What is committed and verified (branch `claude/admiring-galileo-il3q0o`, in `just-llm-runner`).** The entire backend is
done, tested (178 runner pytest + ruff), and pushed: the data model (`engine_presets` plus the `engine_preset_switches` /
`engine_preset_samplers` children, plus `category_presets` and `feature_preset_refs`) in `llm_runner/llm/db.py`; the preset
API (`presets_api.py` — CRUD on `/v1/ai/engine-presets` and the default/category/feature assignment layers on
`/v1/ai/preset-assignments`); the stores (`stores.py`); the cascade resolver (`preset_resolve.py`); and the dispatch wiring
in `prompts.py`, where `run_feature`/`stream_feature` resolve the preset, overlay it onto the action's spec as an "effective
spec", and fall back to the legacy job/pin routing when no preset is assigned so nothing breaks mid-migration. The UI rework
is also committed: Routing-by-feature was slimmed to just the feature's prompt + an engine-preset picker (`ecc9e87`); the
wrong standalone preset popup (`EnginePresets.vue`) was deleted; and the Lab (Tuning tab) became the preset editor — each
`ConfigColumn` is a full engine config you Run and then "Save as preset", with `ConfigColumn.vue` + `CompareStrip.vue`
reworked to speak engine-presets (`74f7819`). Commit chain: `f18e80b` (doc) · `b11f6b5` (data) · `deacca0` (API+resolver) ·
`7acb78d` (dispatch) · `5d309be` (first preset UI) · `ecc9e87` (slim routing-by-feature + drop popup) · `74f7819` (Lab is
the editor).

**Current screen + walk-through state (Trial 4, 2026-06-29 — the full blow-by-blow + complete commit chain are in
the design doc's Trial iteration log).** The earlier "Routing by category" SEPARATE tab (Trial 2) was SUPERSEDED — the
whole AI area is now ONE page. The **Routing by feature** tab holds everything: the LEFT list is the feature nav with a
per-category **set-all preset dropdown** (+ a **Reset** that re-inherits) on each category heading; the RIGHT pane is the
selected feature's **prompt** (the "testing prompt" — it lives in the column, NOT duplicated above) plus the **Tune
presets** column workbench (one column = full width, "+ Add column" to compare, "Save as preset"). The Tuning and
Routing-by-category tabs are GONE; the AI sub-nav is now: Providers & models · Routing by feature · Recommendations ·
Usage · (host app tab). The global Default row was removed (user: "use your recommendation"); the per-category dropdown
was kept (user: the left nav is otherwise correct).

The user then walked the build on their own machine (Windows / RTX 2070 SUPER 8 GB) and drove FIVE fixes:
1. **Page must not scroll — only the nav + content — DONE.** Flex chain (the first `height:100%` attempt FAILED —
   %-height doesn't resolve through a flex item, so the page still scrolled): `AiView` wraps the area in a flex-fill
   `.ai-fill` instead of the scrolling `.scrollarea`; `.lu-area` / `.lu-tab-fill` / `.lu-fw` are `flex:1`; panes
   `overflow-y:auto`. Verified programmatically `pageOverflow 0`. (runner `81d9875`, JW `5877090`.)
2. **Remove the per-feature engine-preset dropdown — DONE** (runner `1302f88`).
3. **"Use in production" — DONE.** Always-visible button in the column preset bar; sets the feature's preset
   (`FeaturePresetRef`); the column preselects + loads the feature's in-production preset on open; reads
   "✓ In production" when it is the live one. (`1302f88` + `81d9875`.)
4. **Preset dropdown was full-width — FIX JUST APPLIED (uncommitted-or-just-committed at compaction; needs visual
   re-check).** Root cause: a `class=` on `<UiSelect>` falls through to its `SelectRoot` wrapper, NOT the visible
   `SelectTrigger`, so `max-width` did nothing — the cap is the UiSelect **`width` prop** (`ui-w-{token}`:
   token 110 / id 180 / name 280 / …). Set `width="name"` (280px) + moved "Use in production" next to the dropdown.
5. **Samplers + switches grid rework — DONE (2026-06-29; full prose in the design doc's Trial-4 #5 entry).** The
   add-a-blank-row sampler/switch editors in `ConfigColumn` are now a **prefilled checklist** from `knob_catalog`. The
   shared `KnobGrid` got an opt-in `checklist` mode (props `checklist`/`catalogList`/`exclude`/`scrollMax`); the existing
   add-row UI is the byte-unchanged `v-else`, so the other live consumers (`LuModelCatalog`, `RoutingByJob`) + JustVoice
   are untouched. Each row = enable/disable checkbox + kind-aware value (enum→select, int/float→number, bool→checkbox
   only at `"true"`), a per-row ↺ reset-to-default, an `＋ Add custom` row, a footer **Reset to defaults**, in a
   fixed-height scroll; rows are common-first (the catalog API already returns them ordered). NO backend change (the
   catalog already has `kind`/`default`/order; the UI reads the RAW rows — wire field is `default`). **⚠ One judgment
   call made while the user slept (flagged to reverse in seconds):** two `:exclude` lists prevent a double-edit bug —
   samplers hide `temperature`+`top_p` (already in the params row), switches hide `n_cpu_moe` (the Hardware-fit knob).
   An excluded knob already set in a preset is NOT dropped — it shows in a raw "Other keys" section. Verified:
   `build:vite` 0, headless smoke 0 JS errors (Routing-by-feature + LuModelCatalog's legacy grid both render), a
   dedicated Playwright check green (prefill, order, both excludes, toggle enables the value), ruff + pytest clean. A
   2-checker rules panel ran on the plan BEFORE coding; findings folded in. Files: `KnobGrid.vue`, `ConfigColumn.vue`,
   `CompareStrip.vue`, `FeatureWorkbench.vue` (all in `just-llm-runner/ui/src`).

**Knob-catalog expansion + Common/Advanced tiers — DONE (2026-06-29; full plan +
`just-llm-runner/docs/plans/2026-06-29-knob-catalog-expansion.md`).** After researching llama.cpp's full
sampler/hardware surface (current `tools/server/README.md` + smcleod guide + llama-param-pal) the user chose
"full set + Common/Advanced split" + "add the free hardware switches + better help." Added a `tier`
(common|advanced) column to `knob_catalog`; seeded **15 new rows** — 11 samplers (repeat_last_n, mirostat
tau/eta, dry base/allowed_length/penalty_last_n, xtc_threshold, dynatemp range/exponent, top_n_sigma,
min_keep) + 4 already-plumbed switches (ubatch_size, threads_batch, cache_reuse, cont_batching) — all with
README-cited defaults; clearer novice help on existing switches. The checklist now shows **Common** rows +
an **"▸ Advanced (N)"** expander (anti-overwhelm). Also fixed a real gap: bool switches now render an
**On/Off select** (not checkbox-only) so default-on flags (cont_batching, mlock) can be set OFF. NO runner
code (samplers ride `extra`; the 4 switches are typed `Overrides` fields). **Schema bump → existing installs
Reset workspace** (drop+reseed policy). Verified: ruff + 179 pytest + build:vite + headless smoke (0 errors,
LuModelCatalog intact) + a 10/10 Playwright check. Run BEFORE coding: a rules-checker on the plan (caught:
cite defaults per-value, ship the upgrade story, include bool in reset, write the doc first).

**LLM-runner engine decision + snappy-edit defaults (2026-06-29; full detail in
`just-llm-runner/docs/plans/2026-06-29-knob-catalog-expansion.md` §DECISION).** After fact-checking a hard
KoboldCpp/TabbyAPI/Aphrodite pitch (most claims outdated/wrong vs current llama.cpp — KV-quant, grammar,
per-request samplers + sampler ORDER, context-shift, cache-reuse are all already in stock llama.cpp; verified,
incl. an empirical test that `/v1/chat/completions` honors a per-request `samplers` order), the user CONFIRMED:
**stay on stock `ggml-org/llama.cpp` + spawn-per-model; router mode deferred** (low-VRAM trap + 1-model common
case); Kobold/Tabby (EXL2 = GPU-only no-offload, NVIDIA-only)/Aphrodite rejected. **Task #27 resolved.** The
three 2026-06-24 router-leaning docs are bannered with this. SHIPPED the snappy-edit defaults: a new
`context_shift` Plane-1 switch (bool, default on) + `cache_reuse` 256, both default-ON via the `base` switch
preset (applied at model load), wired through Overrides/_parse_switch/_apply (--context-shift / --no-context-shift);
SWA-safe (llama.cpp auto-disables on Gemma, no crash) + spawn-tested; ruff + 180 pytest + build + smoke clean.
**Part 3 — sampler dispatch WIRED (2026-06-29; runner `407612b` code + tests, `433b9d1` doc).** The verified gap
(samplers didn't reach production dispatch) is FIXED. `_plane2_extra(spec, body, preset)` in
`just-llm-runner/llm_runner/llm/prompts.py` now applies the resolved PRESET's long-tail samplers as the
lowest-precedence layer (full precedence: per-call `body.samplers` → stored `feature_sampler_params` → the preset's
`engine_preset_samplers`, each guarded by `not in extra`), and BOTH dispatch call sites (`run_feature` +
`stream_feature`) pass the resolved `preset` (which `_resolve_preset`/`resolve_feature_preset` already returns as an
`EnginePresetRow` with `.samplers`). So **every knob from the catalog expansion (top_k, min_p, mirostat, dry, xtc,
…) now actually takes effect in production**, not just in the in-lab Run test. The reserved **`samplers` key is the
per-feature sampler ORDER** — a comma-joined name list (`"dry,top_k,min_p,temperature"`) that `_plane2_extra` splits
into an array for the engine (post-process after all three sampler layers merge). Persistence + load ride the
PRESET (Save-as-preset → `engine_preset_samplers`; `applyPreset`/`presetToConfig` loads them back into the column),
so no separate feature-samplers PUT was needed; the per-feature `feature_sampler_params` store still dispatches as
an override layer. Verified: `ruff` clean + **182 pytest** (2 new: `test_run_applies_preset_samplers_and_order` —
preset samplers reach `extra` + the order → list; `test_run_body_samplers_override_preset` — body overrides preset);
empirically confirmed earlier this session that `/v1/chat/completions` honors a per-request `samplers` order
(garbage↔clean discriminator on stock llama-server). Rules-checked the dispatch diff → PASS. **A per-feature
sampler ORDER is dispatchable TODAY** via the "Add custom sampler" escape (name `samplers`, value
`dry,top_k,min_p,temperature`).

**Sampler-order REORDER UI — DONE (2026-06-29; runner `a07f995` UI + `db21518` doc).** A "Custom sampler order"
control in `ConfigColumn.vue`'s Samplers section: a `UiCheckbox` toggle (off = engine default order), then the
default chain (`dry · top_k · typ_p · top_p · min_p · xtc · temperature`) as a list with ▲▼ `UiButton`s + Reset; it
reads/writes the single reserved `{name:"samplers", value:"<comma names>"}` row in the column's `samplers` array via
the existing `patch('samplers', …)`, so it persists via the preset + dispatches through the backend comma→array
split. `KnobGrid` got a `reservedKeys` prop so the order key is hidden from the checklist's "Other keys" (managed by
this control, not double-shown). Verified: build:vite 0 + headless smoke 0 JS errors + a Playwright check 5/5
(control present; hidden until enabled; default 7-name order; ▼ reorders; `samplers` not in Other keys);
rules-checked → PASS. **Part 3 fully complete (dispatch + order + reorder UI).**

**Samplers UI → flat 3-column grid — DONE (2026-06-30, user decision superseding the Common/Advanced sampler
split).** The user, after living with the tiered samplers checklist: *"why don't we just not have the extra
advanced — anyone who is going to change these params is already at advanced … all in one list … split it into 3
columns, add[s] one to [the] next column and so on."* So the samplers checklist (`ConfigColumn` → `KnobGrid
:columns="3"`) now shows all ~21 samplers in one flat 3-column grid, flowing row-major (each successive/added knob
lands in the next column), no Advanced expander. Built as a reusable `KnobGrid` `columns` prop (`>1` → flat
multi-column grid, no inner scroll); the `tier` field stays (it still orders the list common-first) and the **Engine
switches** editor keeps its single-column tiered expander (only samplers went flat — switches weren't in scope).
⚠️ **This was BELIEVED to also fix the reported layout shift but did NOT** — the scrollbar root-cause described next was
later DISPROVEN by measurement (2026-06-30 cont., correction entry below). Recorded for history, the disproven theory was:
clicking a sampler checkbox visibly shifted the layout, worse in
Advanced: enabling rows / expanding Advanced overflowed the inner `max-height:260px` scroll, and on Windows/WebView2
(classic space-taking scrollbars; headless Chromium uses overlay scrollbars, so it never reproduced in the gate
despite many attempts) the scrollbar's appearance reflowed the column. The 3-column grid removes the inner scroll
(all knobs fit; the column becomes the single scroller — honoring "one scroller per area"), and `scrollbar-gutter:
stable` on `.ui-kg-scroll` + `.lu-fw-edit` reserves scrollbar space as a backstop. Files (all shared kit, runner):
`KnobGrid.vue` (columns prop + flat multi-col grid + scrollbar-gutter + CSS), `ConfigColumn.vue` (`:columns="3"`),
`FeatureWorkbench.vue` (`.lu-fw-edit` scrollbar-gutter). Verified: `build:vite` 0 + `node scripts/headless-smoke.mjs`
PASSED (all routes + AI sub-tabs + the committed `sampler-order` probe still green, 0 JS errors) + screenshot
confirmed the grid; user confirmed the look. Honest caveat: the WebView2 scrollbar shift itself can't be rendered in
headless — the structural fix removes the overflow regardless. *Tracked follow-up (non-blocking, rules-checker
flagged):* the grid is `repeat(3, minmax(0,1fr))` with a fixed 84px value cell — kept at 3 per the user's explicit
ask; at narrow `ConfigColumn` widths (Compare mode ×N columns) the labels squeeze (they ellipse → no break/JS error).
If it ever bites, switch `.ui-kg-check.is-cols` to `repeat(auto-fit, minmax(~180px, 1fr))` for a responsive 3→2→1
fallback (`KnobGrid.vue` ~`.ui-kg-check.is-cols .ui-kg-scroll`).

**Samplers grid stability + persistence investigation — IN PROGRESS (2026-06-30 cont.).** The user reported, after
the 3-column landed, that: (1) clicking a checkbox STILL visibly shifts the layout (worse in Advanced) and the reorder
control "has the same css problem" so it can't be tested; (2) at narrow widths the columns "kept shrinking" instead of
staying their size and scrolling ("code smell in your css design"); (3) the samplers should be "scrollable after a
certain height"; (4) "adding custom samplers doesn't persist to presets." The user re-stated the 8 standing rules
(never guess; verify line-by-line; reuse components; plan is the live SSOT tracker; don't override design docs —
notify; docs always full-detail). A live task tracker was created (#67 shift root-cause, #68 persistence, #69
scroll/shrink, #70 reorder CSS, #71 verify+docs). Findings + actions, each VERIFIED in code (no guessing):

— **#67 (the shift): my earlier scrollbar root-cause is DISPROVEN.** A scroll-chain probe (walking every ancestor of
`.cc`) shows the ONLY scroller in the AI feature area is `.lu-fw-edit`; it is ALWAYS scrolling (content ~1492px > the
~712px viewport) with `scrollbar-gutter: stable` already applied; the page itself never scrolls; toggling a sampler
checkbox changes nothing (no element moves, no scrollbar toggles); the order-reveal only grows height while the
scrollbar was already present. So the scrollbar never appears/disappears — it cannot be the shift, and
`scrollbar-gutter` was already on the right (and only) scroller. Net: I cannot reproduce the horizontal shift in
headless Chromium (it uses overlay scrollbars; even forcing `::-webkit-scrollbar` width did not make it take space),
which strongly implies the shift is specific to the user's Windows/WebView2 rendering in a way headless does not
replicate. I did NOT ship a third guess — instead the user narrowed it on their WebView2 machine (removing the
`ui-checkbox-input` class made the shift vanish; re-adding it brought it back), which UNBLOCKED #67.

— **✅ #67 RESOLVED (2026-07-01, runner `171e0e8`).** The cause was a FOCUS-SCROLL on the visually-hidden
`.ui-checkbox` native input — NOT scrollbars. My earlier headless probes missed it because they toggled the box
PROGRAMMATICALLY (`input.checked = …` + a `change` event), which never FOCUSES the input, so the focus path never
ran (that was the missing ingredient). Corrected probe (a real `.focus()` / label click) proved it: `.ui-checkbox-input`
is `position:absolute` (`just-llm-runner/ui/src/common/styles.css:115`) but its label `.ui-checkbox` was NOT
`position:relative` (`:114`), so the absolute input anchored to a distant ancestor. When the samplers/switches list is
scrolled to reach a checkbox, the VISIBLE box scrolls but the hidden input stays STRANDED — measured **1271px** below
its own box. Clicking the label focuses that stranded input and the browser runs `scrollIntoView` to reveal it, lurching
the `.lu-fw-edit` / `.pane-card` scroller by **~1263px** — the shift the user saw ("worse in Advanced" = more expanded
content strands the input further). A pure `input.focus()` (no toggle) scrolling `.pane-card` `0 → 1352` isolated the
mechanism cleanly. **Fix (one line, shared kit):** add `position: relative` to `.ui-checkbox` so the hidden input is
anchored to its own label and tracks the visible box (offset 1271px → 8px). Head-to-head candidate test: the one-line
fix ALONE drops `boxMovedBy` from −1263 to **0** (belt-and-suspenders `+ top:0;left:0` → 3px, input-overlay → 0px were
measured but unnecessary, so the minimal change shipped). Verified vs the REAL served CSS (no injected style): all 8
checkboxes across the samplers grid AND the switches Advanced section show `boxMovedBy: 0` with
`computedPosition=relative`; full `node scripts/headless-smoke.mjs` PASSED (every route + 5 AI sub-tabs +
sampler-order/model-manager/recs probes, 0 JS errors). It's a SHARED `@delebash/llm-ui` primitive → the fix also lands
in JustVoice (pure robustness win; JV not re-verified per the user's "not now"). A code comment on `.ui-checkbox` records
WHY the `position:relative` must stay (it looks deletable). Sibling class-of-bug swept: `UiToggle` is safe (a
`<button role="switch">`, focus on the visible button, `.ui-toggle` already `position:relative`); the
`.ui-table-pager-size-label` is a non-focusable sr-only `<label>`; the legacy **`.lu-checkbox`**
(`just-llm-runner/ui/src/styles.css:50–68`) has the identical unanchored pattern BUT is DEAD CSS (zero refs across
`*.{js,ts,jsx,tsx,vue,html,mjs}` under `/home/user`) — a pre-`Ui*`-convergence duplicate of `.ui-checkbox`, flagged
for deletion in a dedup/cleanup pass (T3), not a live bug.

— **#69 (scroll cap + no column shrink): FIXED + verified.** Restored a stable capped vertical scroll on the
multi-column samplers grid (was `maxHeight:none` in cols mode → now uses the `scrollMax` cap, 260px, with the
existing `overflow-y:auto` + `scrollbar-gutter:stable`) so it is "scrollable after a certain height" without shifting.
Changed the grid from `repeat(3, minmax(0,1fr))` (which let columns collapse to ~112px in a 360px Compare column) to
`repeat(var(--kg-cols,3), minmax(210px,1fr))` + `overflow-x:auto`, so columns KEEP a usable min width and the grid
SCROLLS horizontally instead of shrinking (matching the user's "it is off scrollable" — not shrink-to-fit). Verified
by measurement: single wide column → 3 tracks at 351px each, vertical scroll on, no horizontal scroll; a 366px Compare
column → 3 tracks HOLD 210px each (no squeeze) with horizontal scroll on. Reused the shared `KnobGrid` `columns` prop
(no fork). Files: `KnobGrid.vue` (`.ui-kg-scroll` maxHeight now always `scrollMax`; `.ui-kg-check.is-cols .ui-kg-scroll`
→ `minmax(210px,1fr)` + `overflow-x:auto`).

— **#68 (custom sampler persistence): VERIFIED WORKING — not a save bug.** Empirical end-to-end test (Rule 4): in the
real UI, "+ Add custom sampler" → typed `zcustomknob=7` → "Save as preset" (inline `.cc-name-in` name field + Enter)
→ `GET /v1/ai/engine-presets` returns the preset with `samplers:[{flagName:"zcustomknob",flagValue:"7"}]`. So a named
custom sampler DOES persist through Save-as-preset (backend also independently confirmed via a direct POST/GET curl).
My first test wrongly reported a failure — it had SELECTOR bugs (the UiInput ROOT element carries the `.ui-kg-name` /
`.ui-kg-val` class, i.e. it IS the `<input>`; `.ui-kg-name input` matches nothing) and looked for a save DIALOG when
the flow uses an inline name field. The remaining gap is by DESIGN, not a bug: per-feature sampler edits do NOT
auto-persist — persistence rides PRESETS (Save-as-preset → `engine_preset_samplers`), there is no per-feature
`/feature-samplers` PUT (knob-catalog doc §Reorder records this). So if the user added a custom sampler and expected it
to stick WITHOUT saving a preset, it won't. Whether to add per-feature auto-persist is a DESIGN change → raised with
the user, who **DECIDED (2026-07-01): KEEP Save-as-preset, do NOT add per-feature auto-persist** — the
`/feature-samplers` PUT idea is dropped (never built). Per-feature edits are intentionally ephemeral until saved into a
preset.

— **Smoke test correctness fix:** the committed `sampler-order` probe's `no-dup` assertion used the same wrong
`.ui-kg-extra .ui-kg-name input` selector, so it was vacuously always-true. Corrected to query `.ui-kg-name`
directly (the input). Full `headless-smoke.mjs` still PASSES (all routes + AI sub-tabs + sampler-order probe green).

— **#70 (reorder control): RESOLVED by the #67 fix (2026-07-01).** It already rendered cleanly after #69 (7 rows,
names `dry · top_k · typ_p · top_p · min_p · xtc · temperature`, no JS errors) with rows that don't shrink (left-aligned
`minmax(140px,200px)` grid); its only remaining issue was the #67 shift on reveal — and its toggle is the SAME
`UiCheckbox`, so the `position:relative` anchor fixes it too. The smoke's `sampler-order` probe (`reorder=true`,
`no-dup=true`) stays green. **#72** (the reorder control's DEFAULT chain — 7 names vs llama.cpp's 9) is now ALSO
FIXED (runner `fc090b0`) — see the ✅ block below.

— **✅ ALL RESOLVED — nothing is awaiting user input now (2026-07-01).** **#68** — user chose **"keep"**: KEEP
Save-as-preset as the samplers persistence path; do NOT add per-feature auto-persist. No code change — custom samplers
already persist correctly through Save-as-preset → `engine_preset_samplers` (verified end-to-end); the `/feature-samplers`
PUT idea is dropped (never built), per-feature edits stay ephemeral until saved into a preset. **#67** (checkbox-click
shift) + **#70** (reorder control) — both RESOLVED above via the `.ui-checkbox` focus-scroll fix (runner `171e0e8`).
**#72** (reorder DEFAULT chain 7→9 names) is now ALSO FIXED (runner `fc090b0`, see the ✅ block below). The only
remaining OPEN item is the separate top_k/min_p prefill (a UX call, the user's decision), noted in the #72 block.

— **✅ #72 FIXED (2026-07-01, runner `fc090b0`): the reorder control's DEFAULT order now matches llama.cpp's real
9-name chain.** Was `ConfigColumn.vue` `DEFAULT_SAMPLER_ORDER = ["dry","top_k","typ_p","top_p","min_p","xtc","temperature"]`
(7 names). Because the `samplers` request field is an ordered name list where OMITTED names are DROPPED from the chain,
enabling "Custom sampler order" with the 7-name default silently DISABLED `penalties` (the combined
repeat/presence/frequency stage) and `top_n_sigma`. **Source-verified (the server README is self-CONTRADICTORY** — its
request-`samplers` doc shows a 7-name default + "these are all the available values", while its CLI `--samplers` shows
9; the authoritative source resolves it): `common/common.h` `common_params_sampling.samplers` default = the 9-name
vector `PENALTIES, DRY, TOP_N_SIGMA, TOP_K, TYPICAL_P, TOP_P, MIN_P, XTC, TEMPERATURE`, and `common/sampling.cpp`
`common_sampler_types_from_names()` explicitly accepts `"penalties"` and `"top_n_sigma"` as valid request names. So
`DEFAULT_SAMPLER_ORDER` is now `["penalties","dry","top_n_sigma","top_k","typ_p","top_p","min_p","xtc","temperature"]`
(the code comment cites common.h/sampling.cpp so it can't drift). The committed smoke `sampler-order` probe
(`justwrite-app/scripts/headless-smoke.mjs`) was updated to assert the 9-name chain (length 9, penalties→temperature,
▼ swaps penalties↔dry). Verified: `build:vite` 0 + full `node scripts/headless-smoke.mjs` PASSED
(`default-chain=true reorder=true no-dup=true errors=0`). **Still OPEN (a separate UX call, NOT fixed — the user's
decision):** llama.cpp documents `top_k=40`, `min_p=0.05`, `top_p=0.95`, `temperature=0.80` defaults but our seed
leaves top_k/min_p blank (enabling gives an empty box that is dropped at dispatch = engine default); prefilling the
real defaults is a UX choice not yet raised/decided — left as-is.

— **✅ #73 Stop sequences ADDED (2026-07-01, runner `6a01e92`).** After the user surveyed KoboldCpp Lite's
Samplers + Tokens tabs and asked "do we need any of these," the survey found we already cover llama.cpp's full
sampler set; the ONE genuine gap was **Stop Sequences** (Tokens tab). User: "yes add it go." Built with **NO DB
schema change / no workspace reset** by REUSING the sampler-ORDER reserved-key pattern: a reserved `stop` row rides
the samplers array (`feature_sampler_params` per-feature + `engine_preset_samplers` per-preset), so it persists +
round-trips through the existing preset machinery. **UI:** a dedicated one-per-line `<textarea class="cc-stops-ta">`
in the Samplers section of `ConfigColumn.vue` (`stopText`/`writeStop`); `stop` added to the KnobGrid `reservedKeys`
so it is NOT double-shown in the checklist "Other keys". **Dispatch:** `_plane2_extra` (`prompts.py`) normalizes the
reserved `stop` value → a string ARRAY (newline-split, robust to `_parse_sampler_value`'s numeric coercion — a
numeric-looking stop like "42" stays "42"). **Adapter mapping, verified from source:** openai-compat + local
llama.cpp take `stop` natively; Gemini already mapped `stop→stopSequences`; Ollama routes it to `options.stop`;
Anthropic needed the one adapter change — a new `_map_extra` renames `stop→stop_sequences` (Claude's field) in both
`chat` + `stream_chat`. **Verified:** ruff + **186 runner pytest** (4 new in `test_plane2_params.py` — split,
numeric-kept-as-string, blank-dropped, anthropic-rename) + `build:vite` + `node scripts/headless-smoke.mjs`
(`stop=true` folded into the sampler-order probe) + a Playwright round-trip probe (type multi-line stops →
Save-as-preset → `GET /v1/ai/engine-presets` returns `{flagName:"stop", flagValue:"END\nUSER:"}`, persisted).
Shared kit → JustVoice gets the field too (not re-verified per "not now"). *(Everything else Kobold shows is
already covered or Kobold-only — not in stock llama.cpp; recorded in the survey answer, not a task.)*

— **✅ #74 License flag → DB (2026-07-01, runner `35d964c`; approved from the ai-state-grid audit of my unapproved
"nothing-hardcoded" calls).** The hardcoded license-warn regex (`LuModelCatalog.vue`
`/community|research|non-commercial|llama|gemma|cc-by-nc/i`) is GONE. Added a per-model **`use_limited`** boolean to
`model_catalog` (`db.py`), threaded through the wire (`CatalogRow.useLimited`), the store both directions
(`_catalog_to_wire` + upsert), and seeded from the license by a one-time helper `_use_limited()` — the keyword match
runs ONCE at seed time to populate the flag, which is then DB-stored + editable, so there is NO hardcoded runtime rule.
The UI reads `m.useLimited` for the ⚠ badge; the add/edit model form gained a **License** input + a **Use-limited**
checkbox (the form had no license field at all before — a real gap filled). Verified: ruff + **186 pytest** +
`build:vite` + full `headless-smoke.mjs` (model-manager green, 0 errors) + a live check (after DB reset,
`GET /v1/ai/model-catalog` returns all 11 rows carrying `useLimited`, ONLY `llama-4-scout` (Llama-Community) flagged —
correct). **Schema change → existing installs Reset workspace** (drop+reseed policy). Resolves ai-state-grid open item
#6.

— **✅ #75 Cloud pricing → DB (2026-07-01, runner `91b6285` backend + UI commit next; approved from the same audit).**
The hardcoded `pricing.py MODEL_PRICING` dict is no longer the runtime source. Added a seeded **`model_pricing`** table
(`db.py`: model_id / input_per_m / output_per_m); `pricing.price_for` now reads the **live DB** via a lazy store call
(`_live_pricing()`), with the renamed `DEFAULT_PRICING` dict kept ONLY as the seed source + a no-DB fallback (bare
tests / pre-seed boot). New `PricingStore` (`stores.py`) + CRUD router **`/v1/ai/pricing`** (GET/PUT/DELETE,
`pricing_api.py`), wired in `install.py`; `seed_default_pricing` seeds from the dict (merge-by-id). **UI:** a
**Cloud pricing** editor (`ui/src/views/PricingEditor.vue`) — an inline-editable table (model id · input $/1M ·
output $/1M · Save/Delete/Add) — mounted in the **Usage** AI sub-tab (`AiModelsArea.vue`). Verified: ruff + **189
pytest** (3 new in `test_pricing.py` — reads-DB, edits-take-effect+delete, case-insensitive) + `build:vite` + full
`headless-smoke.mjs` (`ai-tab Usage errors=0`) + a live API round-trip (`GET` seeds 14 rows, `PUT gpt-5 → 1.11/2.22`,
`GET` reflects it) + a UI round-trip probe (set gpt-5 input in the editor → Save → `GET /v1/ai/pricing` returns 7.77).
**Schema change → existing installs Reset workspace** (drop+reseed). Resolves ai-state-grid open item #7. **Both
approved hardcoded-value fixes (#74 license, #75 pricing) are now done.**

— **✅ Budget guard (grid item 8 / my audit's #3) DONE (2026-07-01, runner `9e43cbd`; user took the recommendation).**
Kept SOFT (never a hard block) but killed the silent hardcoded 8192: the budget window now derives from the column's
OWN `-c` (`ctx_len`) switch — the exact launch value — falling back to the parent's loaded-model ctx, then a **labeled
"(assumed)"** 8192 the user can still override. The window field shows its source (`(-c)` / `(loaded)` / `(assumed)` /
`(set)`) so it's honest. Files: `ConfigColumn.vue` (`ctxFromSwitches` / `winOverride` / `windowSource` / `window`).
Verified: `build:vite` + `headless-smoke` (0 errors) + a probe (no ctx_len → `window (assumed)` 8192; enable ctx_len →
`window (-c)` 4096). Resolves ai-state-grid item 8. **Think-off = KEEP** (user confirmed the B3 JSON-mode reasoning
guard stays; no change). **NEXT: json_schema upgrade (O3)** — the user asked to upgrade structured output beyond the
weak `json_object`; being scoped/built (a per-action JSON schema → `response_format:{type:"json_schema"}` for
llama.cpp/OpenAI, `responseSchema` for Gemini, best-effort Anthropic).

**Durable coverage for the reorder control — DONE (2026-06-30).** The 5/5 reorder assertions had lived only in an
ephemeral scratchpad script; the user asked to "make it durable," so the check was promoted into the committed
renderer gate as a new probe block inside `scripts/headless-smoke.mjs`. That file already hosts the sibling AI-area
interaction probes (model-manager, recs-job-dropdown, the ai-tab sweep), so the reorder check is one more assertion in
the same single-boot AI-probe sequence — it shares the one browser launch + error-capture already running, and the
standard renderer gate now covers it with nothing extra to run. *(Rationale corrected after a rules-checker FAIL:
an earlier draft justified this as "avoiding duplicated boot scaffolding that the smoke's jscpd/REUSE gate
discourages" — that was wrong on two counts, verified: `.jscpd.json` only scans `src/renderer/src/**`, NOT `scripts/`,
so jscpd never polices smoke files; and the repo's standalone pattern `scripts/book-smoke.mjs` deliberately re-copies
`findChrome`/`waitReady` per the `CLAUDE.md` "copy findChrome()" convention — i.e. duplicated boot scaffolding in a
standalone smoke file is the accepted norm here, not something discouraged. The genuine reason to co-locate is the
shared boot session beside the other AI probes; `book-smoke.mjs` is standalone because it's a self-contained
end-to-end book round-trip, whereas the sampler-order check is just one AI-area assertion.)* The probe navigates
Routing-by-feature ▸ a feature ▸ Samplers, forces the `<details>` open (a collapsed `<details>` `display:none`-hides
its children so the checkbox isn't actionable), normalizes the toggle to OFF (so the invariant is deterministic
regardless of any persisted order — `toggleOrder(true)` always re-seeds DEFAULT), then asserts: the control renders,
the order list is hidden until enabled, enabling shows the engine-default chain (`dry…temperature`), ▼ reorders it
(dry → position 2), and the reserved `samplers` key is not double-shown as an "Other key". The same pass also fixed a
latent probe-hygiene bug it surfaced: the model-manager probe opened the Add-model `AppModal` and never closed it,
leaving a Reka overlay that blocked later probes' actionability (locator) clicks — it now presses Esc to dismiss
(closable AppModal → Esc clears it), and the sampler-order probe defensively does the same on entry. Verified: full
`node scripts/headless-smoke.mjs` PASSED — all routes + every AI sub-tab + model-manager + recs-job-dropdown +
`sampler-order present=true hidden-until-on=true default-chain=true reorder=true no-dup=true errors=0`, with the
jscpd + shared-picker REUSE gates green. A pure-`node:test` unit of the extracted helpers remains an option but is
now redundant for regression-catching — the committed probe exercises the real control end-to-end.

**⛔ Hard rule the user reaffirmed forcefully this session: ZERO decisions on my own — do EXACTLY what's asked, nothing
adjacent; a question is a question (answer it, do not act); stop and ask on anything ambiguous.** Most of this session's
churn came from me removing things off a *question* + inventing a prompt-persistence "bubble" — do not repeat that.

**JV note:** the scroll fix touches the SHARED kit, so JustVoice's AI host needs the same flex-fill wrapper as `AiView`
(it degrades gracefully — scrolls as before — until then). I have the JV repo in scope and CAN verify it; the user said
NOT to for now.

**Remaining for this redesign (in order):** (1) the user's visual re-check of BOTH the preset-dropdown width fix (#4)
and the new samplers/switches checklist (#5) — including whether `temperature`/`top_p`/`n_cpu_moe` should be shown IN
the grid (delete the matching `:exclude` on the `<KnobGrid>` in `ConfigColumn.vue` to do so); (2) the JustVoice AI host
flex-fill wrapper; (3) QuickSetup auto-generating a ready-made preset per task at first run; (4) the download "use it
for ‹task›?" offer + Retune/Retune-all + the load-time fits/doesn't-fit warning; (5) deleting the now-unmounted
`RoutingByJob.vue` + the job switch-editor.

---

## Current state (2026-06-28) — plan rebuilt (truncation fixed) + the big deviation rebuilt + verified

> **The trust reset (2026-06-28):** the prior `2026-06-27-MASTER-PLAN.md` was a TRUNCATED summary that
> *claimed* full detail — and the Compare lab had been built from it at ~40% of the decided design. Fixed:
> - **Plan rebuilt** → `2026-06-28-MASTER-PLAN.md` CARRIES the full detail, folded verbatim from the ~12
>   curated docs, with a COMPLETENESS check (not the accuracy check that missed the truncation 4×): 7
>   condensations restored, the long folds 0-gap. Conflicts **C1–C7** recorded. Old master bannered
>   superseded; all pointers repointed. (runner `0d85b0e`, JW `27854e4`)
> - **Compare/ConfigColumn rebuilt to Decision 23** (C1): ONE full `<ConfigColumn>` (model + Plane-1 switch
>   KnobGrid + prompt + Plane-2 params + presets/Promote + preview + budget-guard + Run/result w/ cost),
>   rendered **×1** in Routing-by-feature and **×N** in a Compare **MODE** (`CompareStrip`: 2-up +
>   horizontal-scroll + collapse-nav, cloud-parallel/local-serial Run-all, promote-the-winner). The separate
>   Compare tab + `Compare.vue` were removed. (runner `820e597`)
> - **Independent code-vs-plan audit** (NOT trusting the test suite): A–E all match the plan at file:line
>   except ONE gap — FeaturePreset dropped `maxTokens`+`jsonMode` on round-trip — now **fixed**
>   (runner `5541fd4`).
> - **Verified:** 174 runner pytest + ruff · build:vite · headless smoke (6 AI sub-tabs, 0 JS errors) ·
>   interaction 19/19. Both repos pushed on `claude/admiring-galileo-il3q0o`.
>
> **Remaining = the plan's Part 2 outstanding (NOT deviations):** GPU-gated — #27 router / #29 residency /
> real tok/s / live per-job switch-apply; research — #28 measured benchmarks; and the [IC] backlog F-items
> (#23 shared AI task queue, license-flag UI, QuickSetup enhancements, shared-LLM-UI views, cleanup/dedup).
> **Router-vs-spawn = DECIDED: router** (R1; build GPU-gated) — NOT "the user's call" (that framing was stale).
>
> **⛔ THE MASTER IS NOW THE LIVE TASK TRACKER + SINGLE SOURCE OF TRUTH.** Its top section **"LIVE TASK TRACKER"**
> is the ONLY status authority — **every commit is backed by a task row** (T1–T13 done; T20–T50 remaining). Body
> ✅/⬜ markers are detail/history. **§1** = doc-conflicts C1–C7 · **§1b** = decision-state R1–R7 (resolved) +
> O1–O3 (genuinely open) · **§1c** = the A1–16 implementation decisions (each annotated vs the docs). Source docs
> kept as the verbatim backstop. **WORKFLOW RULE (user): a task row in the plan BEFORE any code; mark it ✅ + its
> commit sha on push — keep the tracker live; never synthesize status from elsewhere.**
>
> **2026-06-28 commits (branch `claude/admiring-galileo-il3q0o`):** runner `0d85b0e` plan-rebuild · `820e597`
> Compare/ConfigColumn · `5541fd4` FeaturePreset · `e7315f2` audit · `24b6f93` license · `638f6c5` test-iso ·
> `ce40c1b` no-hardcoding · `b7a57d8` decision-state · `9c3aa3f`+`e7371ff` live-tracker+§1c. JW `27854e4`
> repoint · `5a7469e` dead-fork · `60d0172` recap/handoff.
>
> **RESUME:** read the master's LIVE TASK TRACKER → next in-container item = **T20 QuickSetup enhancements** (my
> rec). GPU-gated: T40 #27 router build · T41 #29 residency. Open: O1/O2/O3.

## Current state (2026-06-27) — DESIGN DONE; build pending the user's go

> ⛔ **THE ONE PLAN: `just-llm-runner/docs/plans/2026-06-28-MASTER-PLAN.md`.**
> Everything is in there, in full detail — **✅ what's completed** (file:line) and **⬜ what's
> outstanding** (phased A–G + the open decisions + JustVoice-later §G), plus the reference
> per-job×per-tier matrix / switch sets / attribution recipe / license gate (Part 3) and the
> provenance (Part 4). It is detailed enough to **restart and code from after a compaction.**
>
> **Every other doc in `docs/plans/` (both repos) is historical / evidence — each is bannered
> "⛔ NOT THE CURRENT PLAN" at its top. Do not plan from them; plan from the master.** This
> recap + `docs/plans/2026-06-27-session-handoff.md` are the ONLY two things that point to the
> master. Status was **panel-verified 2026-06-27** (3 Opus agents, file:line + 144 runner / 77 JW
> tests pass); the build is **NOT started — pending the user's go.**

**Deep audit of the master — option A (full inline verify) COMPLETE (2026-06-27).** The user pushed
for a no-skim verification of the master against actual code AND the old docs, read in full. Done
inline across multiple passes (per-finding log: `just-llm-runner` scratchpad `audit-findings.md`).
**12 old docs read in full** (the decision-dense + Part-3-backing set) + completed-history
spot-verified. **Verdict: the master is FAITHFUL — the ONE design contradiction was D9** (the master
said "build PinSwitch"; the LOCKED design says DROP `pin_switches`+`model_switches`, `job_route_switches`
is the Profile's switches — **user ruled D9; folded into D1**). Status-staleness also fixed against
file:line: **#11 QuickSetup is built+job-native** (not "to build"), **U4 partial** (UpdatesPanel
exists unmounted), **Streaming feature ports = DONE** (all on `/v1/ai/stream`, gateway gone),
dup-counts (~19/~7), A3 narrowed, #31 cite, PROVIDER_DEFAULTS dup, tiers.py maps. Confirmed
accurate: D1 wiring, extra_flags, citations, #23/#27/#29/#34/Cache/Hardware/shared-views (not-built),
Part 3 vs evidence, suite (144+ruff). Full detail in the handoff §"Deep audit" + master Part 4.

**Option B (independent fresh-context panel, 63 agents) — DONE; caught what A missed.** Fresh
auditors (blind to A) + challengers of A's conclusions; I re-verified each high-value B finding vs
code. **1 A-error caught (U4: `UpdatesPanel` IS mounted — `SettingsView.vue:7,1216` — reverted)** +
real A-misses incl. a ⛔ **live DATA-LOSS bug [FIXED 2026-06-27]**: `routingBackend.js` (#31, stale
role-shape) sent no `jobs` on save → `set_routing` (`stores.py:132`) wiped ALL `job_routes` on each
default/embedding/pin save (#31 elevated to a bug-fix). **Now fixed** — `putRoutingPrefs` carries the
cached `jobs` + untracked (action-keyed) `pins` through verbatim, overlays only the store's tracked
feature pins, drops dead role/quick/accuracy; verified build:vite + smoke. Also: **GGUF auto-detect =
unwired orphan** (§1.2 demoted),
`pricing.py` hardcoded USD, `model_catalog` has no `license` column (A2 needs it), Part 3.2 "all
typed" false, DECIDED §6.6 "freeform string" vs shipped D15 KnobGrid, F#23 ProviderRow doesn't exist,
`test_prompts` also fails isolation, stale `routing_api` docstring, dead JW QuickSetup fork. B
corroborated A on D9/#23/#27/#29/#34/Cache-Hardware/shared-views/PROVIDER_DEFAULTS/tiers/A7/A3. All
folded into the master (Parts 1/2/3 + Part-4 "Option B"). Full B output: `tasks/w5kt79rge.output`.

The model-catalog + Fast/Balanced/Best-dial + speaker-attribution research (two `/deep-research`
runs + reviewer panels) and the resulting decisions are **folded into the master** (Part 1.3 = what
was decided + why, Part 3 = the per-job×per-tier matrix / per-model-type switch sets / attribution
recipe, Part 4 = the sources). Headlines that survive: catalog spans the FULL hardware range
(**floor = CPU 32 GB RAM / GPU 8 GB+32 GB, NO upper cap**); **add** Mistral-Small-3.2-24B + Gemma-4-12B
+ GLM-4.5-Air (MIT) / Qwen3-235B (Apache) / Llama-4-Scout, **drop** 2 redundant quants, fix the
35B-A3B to a 32 GB-RAM floor; one **Fast/Balanced/Best dial** per job resolving to (model, think),
fit-filtered. Adds/drops APPROVED; the `seed.py` build is **pending the user's go**.

Scope right now is **the LLM stack + the job/feature LAB only — JustVoice is out of scope
(later)**. The shared-LLM job-native move shipped earlier (job replaced role end-to-end; all
LLM code lives in `just-llm-runner`; JW is a thin `install_llm` consumer) and JustWrite's LLM
stack is largely built + tested. BUT the **LAB is NOT built** (no ConfigColumn / Compare /
JobPreset / switch-string field / tok-s; `FeatureWorkbench.vue` is only the single-column
precursor), the per-job/per-feature/per-hardware **switch-override tables have ZERO readers**
(schema shipped, wiring didn't), the §6.6 "switches are a string in the lab, not in Providers"
rip-out is not started, and router mode (#27) + residency planner (#29) are unbuilt (the
single-model baseline is solid). Real stubs/bugs were found (per-row Test always fails;
Ollama/Gemini drop params; token stat reads 0) — see the index. (The "dead ProductionConfig
layer" entry was re-examined and found MISLABELED: it's a live, tested shared layer consumed by
JV's speaker_attribution; JW's config_builder just doesn't populate it yet — a planned convergence
delta, not dead code. Do NOT remove it.)

**Working bar (the user's standing rule — this is the DEFAULT, do not make them re-ask):** be
professional, no skim, no quick way out, NEVER guess — read the code line-by-line and cite
file:line, reuse or make reusable components (never copy-paste logic), nothing hardcoded,
**save docs without asking** (it's the rule), never mark "done" without the file:line proving
it isn't a stub, and verify load-bearing calls with an independent pass (the `rules-checker`
agent or a verification workflow — "other yous confirm").

**Rules-as-checks gates are UNHOOKED** (user's call, 2026-06-26): `~/.claude/settings.json` =
`{}` so no gate fires (backup at `settings.json.hooked.bak`; re-enable with `FORCE=1 bash
claude-config/install.sh`). The plain T1–T12 in `~/.claude/CLAUDE.md` still govern, followed by
reading them. So commits need no rules-checker verdict right now. The Reset bug was fixed
(`data_admin._reset` drops+recreates+reseeds, not row-delete — commit `677d165`).

## Two plan tracks (the work splits in two; approve + build + review EACH, in sequence)
The user split the active work into two separate plans (2026-06-26), handled one at a
time: present a plan → user approves → I build → user reviews → next plan.
- **PLAN 1 — Dev-process / rules-as-checks** (global; governs every repo).
  → `claude-config/RULES-AS-CHECKS-V2-PLAN.md`. **v2 SHIPPED (commit `b43411e`)** + **v3
  SHIPPED (this turn): the AGENT is the judge at commit.** v2 = one shared registry
  (`hooks/_rules.py`) + verify-gate / pre-action / task-gate refactored onto it +
  `commit-gate.py` + committed `hooks/test_gates.py` + gate-stats imports the ids. **v3 =
  the COMMIT boundary now requires a GENUINE independent rules-checker AGENT all-pass
  verdict** — `agent_pass()` reads PASS/FAIL only from the agent's OWN harness-authored
  result (a `tool_result` tied to an Agent call, or a `<task-notification>`), NOT from
  self-typed text — closing the self-certification hole the user found (a typed
  "VERDICT: PASS" no longer clears a code commit). **The LIVE `~/.claude` is v3**
  (`FORCE=1 install.sh` applied). Live-system docs: `claude-config/README.md` +
  `claude-config/EFFECTIVENESS.md`; the rules: `~/.claude/CLAUDE.md` (slim T1–T12) +
  `rules-detail.md`. The "why the rules fail" rationale belongs to THIS track.
- **PLAN 2 — App (JustWrite / JustVoice)** — the product work.
  → the **master plan's Part 2** (all outstanding work, phased A–G: #27/#29 router/residency,
  #20/#21 lab, #23/#31/#32/#33/#34…) + **§G** (JustVoice-later). The jobs/switches design
  history lives in `docs/plans/2026-06-25-jobs-architecture-design.md` (bannered historical).

## Standing rules (load-bearing — do not re-litigate)
- **NOTHING hardcoded:** every value/threshold/name/mapping/flag/preset lives in the
  **DB**, seeded + user-editable. No `manifest.json` config, no files on disk. Code is
  only the engine (hardware detect · the VRAM fit formula · the flag merge · process spawn).
- **NO JSON blobs in SQL:** relational/fixed-schema data = real columns/rows. JSON only
  for genuinely freeform data with a cited reason (vectors→packed binary; snapshots/
  tombstones like `chapter_versions.scenes`/`trash.payload`; variable AI artifacts; the
  heterogeneous settings `ui` doc) — and flagged.
- **Operating mode (zero-trust):** grounded recommendations (receipt + counter-case),
  the USER decides; don't barrel (stop after units, surface decisions); audit the full
  cascade file-by-file before a big refactor; think 4×; verify line-by-line; build the
  clean shared component (don't optimize "JV-safe").
- **DB policy:** drop + reseed, no migrations (pre-release; `docs/plans/2026-06-18-unified-storage-no-idb.md`).
- **Hard gates** — now the **rules-as-checks system** (built 2026-06-26, provisioned from
  `claude-config/`; full detail in `claude-config/README.md`). The rules are the slim
  **rule-tests T1–T12** (`~/.claude/CLAUDE.md`) + full WHY/incidents in `rules-detail.md`,
  read on demand. Enforcement at mechanical events: **Stop gate** `verify-gate.py` Blocks
  0–5 (0 = re-read rules/recap/project-CLAUDE after a compact/clear, NOT resume; 1 = code
  claim w/ zero reads; 2 = arch reco w/o precedent; 3 = "done"+code w/o a doc; 4 =
  plan/decision w/o a rules-pass; 5 = code-edit w/o a rules-pass) + a **PreToolUse hook**
  `pre-action-check.py` (pre-task DENY on the first edit w/o a rules-pass · per-edit nudge ·
  ExitPlanMode → run the checker panel) + a **commit gate** `commit-gate.py` (PreToolUse Bash:
  a code `git commit` is HARD-DENIED until docs **+** a GENUINE rules-checker AGENT all-pass
  verdict — read from the agent's OWN result, not self-typed; v3, closes the self-cert hole) +
  the **rules-checker subagent** (Opus; a 2–3 panel
  for load-bearing design). Effectiveness tracked in `claude-config/EFFECTIVENESS.md`
  (catches/false-positives/misses). All fail-open. **Real plan = Plan mode + detailed Task
  entries** (not a chat plan) — that's what fires the plan/task events.

## Recently shipped (newest first — detail in the linked doc)
- **Phase E2-b1 DONE — prompt-preview + token-count → E2 COMPLETE → PHASES A–E ALL DONE** (this session):
  `ConfigColumn` gained a "Preview & tokens" panel — the **assembled prompt** (system + user template with
  `{{vars}}` filled; `ui/src/tokens.js` `assemblePrompt` mirrors the server `render()`) + a **token count**:
  instant heuristic (`estimateTokens` ~chars/3.5) live, upgradable to **exact** on demand via the loaded
  model's own tokenizer — new `POST /v1/llm-runner/tokenize` (`RunnerService.tokenize` proxies llama-server
  `/tokenize`; graceful `{ok:false}` with no model → UI keeps the heuristic). Wired in FW + Compare.
  Verified: 174 runner tests (2 new) + ruff + build:vite + smoke (0 errors) + interaction 12/12. Deferred
  (honest): a hard context-budget guard needs per-model context-window data we don't have; exact count is
  local-only. **With this, the entire A–E plan tail is shipped — only Phase F backlog + the 🔒 GPU-gated +
  🔬 research items remain (see master).**
- **Phase E2-a1 DONE — reasoning-effort enum, all providers** (this session): a per-action
  **Off/Low/Med/High** select mapped to EACH provider's NATIVE reasoning (Anthropic `thinking.budget_tokens`,
  Gemini `thinkingConfig.thinkingBudget`, OpenAI-compat cloud `reasoning_effort` / local llama.cpp
  `chat_template_kwargs.enable_thinking`, Ollama bool|level) — **web-verified 2026-06-28, not recalled.**
  Fixed the latent bug: `think` was honored ONLY by Ollama; the other 3 adapters accept-and-dropped it.
  Threading kept `dispatch.py` + the base Protocol UNCHANGED (minimal blast on the critical path) — the
  level rides `extra["reasoning_effort"]` via a shared `base.pop_reasoning_effort` helper + each adapter's
  `_apply_reasoning`. Data field threaded like `top_p` incl. **feature-presets** (which also fixed a
  pre-existing top_p-dropped-in-presets bug). UI: one `UiSelect` in ConfigColumn (FW + Compare). B3
  guardrail preserved (reasoning off under JSON mode). Verified: 172 runner tests (6 new) + ruff +
  build:vite + headless smoke (0 errors) + curl round-trips + rules-checker (2 findings fixed: docs +
  preset fidelity). **Tail left: E2-b1 (token-count/preview/budget guard).**
- **Phase D4 DONE → Phase D COMPLETE** (this session): `LuSwitchPresets` (the base/moe/mtp engine
  type-preset editor) moved OUT of the Providers tab (`LuModelCatalog.vue`) INTO **Routing-by-job** as a
  collapsed "Advanced · engine type presets" section — the last switch-editing UI is now out of Providers
  (§6.6 satisfied). Conscious placement: it pre-fills the per-Profile switches, so it lives with them (not
  in Compare, which the handoff had suggested). Verified: build:vite + smoke (0 JS errors). **Tail left:
  E2 (a1+b1) — decisions resolved, building next.**
- **Phase D2 Compare + ConfigColumn DONE** (this session): the multi-column **Compare lab**.
  New shared `ui/src/components/ConfigColumn.vue` = one runnable config (model + params + Plane-2
  sampler KnobGrid + Run + tok/s readout), owning the run + decode-tok/s math ONCE. New
  `Compare.vue` (a "Compare" AI sub-tab) renders N ConfigColumns for one action with a SHARED
  input + ranks by tok/s (sequential — local co-residency is GPU-gated). **FeatureWorkbench was
  refactored to CONSUME ConfigColumn ×1** (a `columnConfig` computed bridges its draft/samplers/pin;
  the old inline editor + run logic deleted — T3-clean, both import the same unit). Backend:
  `/v1/ai/run` now returns token usage + accepts ad-hoc per-call `samplers` (same `_plane2_extra`
  path; also fixed FW's old non-stream tokens:0). Verified: 165 runner tests + ruff + build:vite +
  headless smoke (0 JS errors) + a Playwright interaction test (10/10) + rules-checker PASS. Real
  cross-model tok/s 🔒 GPU. **Remaining tail: D4 → E2 (a1+b1).**
- **Phase C2 UI DONE** (this session): the model-card **"Tune & measure"** in the kit
  `LuModelCatalog.vue` — a `Tune` action (disk/loaded rows) opens a modal with a Plane-1
  `KnobGrid` (`:catalog` from `/v1/ai/knob-catalog`, mirrors Routing-by-job), **pre-filled
  from the model's resolved switches** via a new read-only `GET /v1/ai/model-catalog/switches`
  (reuses `resolve_model_switches`). "Load & measure" → `POST /v1/llm-runner/load` with an
  ad-hoc **`switches` dict** (new `LoadRequest.switches`, converted by the EXISTING
  `_switches_to_overrides`+`_merge_overrides` — no client-side flag mapping) → poll `/status`
  → `POST /measure` → tok/s + VRAM/RAM. **Measure-only** (per D9 switches live on a Profile,
  not per-model; the modal points to Routing-by-job to persist). Verified: 164 runner tests +
  ruff + build:vite + headless smoke (0 JS errors) + live-endpoint curl. Real tok/s 🔒 GPU.
  **Remaining tail: D2 Compare → D4 → E2 (a1+b1, building now).**
- **Soundness pass + D3 + C2-backend + E2-wins** (this session, after the user
  flagged E1 slipping 4 passes). **SOUNDNESS PASS (3 agents)** — the dimension the 4
  fidelity-passes missed (does each item contradict an app's CLAUDE.md / duplicate
  shipped work / rest on a stale premise): found 5 unsound items, **all in the
  UNBUILT tail — nothing unsound was built**; built phases confirmed clean. All folded
  into the master (Part 4 "SOUNDNESS pass"). **D3 JobPreset** — per-job presets +
  promote (writes live job_route + switches); DELETED the dead config-grain
  routing-presets (T3). **C2 measure backend** — `POST /v1/llm-runner/measure`
  (probe → tok/s + VRAM/RAM; injectable). **E2 sampler wiring** — extended plane-2
  knob_catalog + wired the Workbench sampler KnobGrid `:catalog`. **+ E1 dropped for
  JW** (JV-stuff ruling). Verified: 162 runner + 77 server tests + build:vite + smoke,
  all pushed. **Remaining tail (gated):** C2 UI + D2 Compare + D4 (frontend-scale);
  E2 reasoning-effort/token-guard (open cloud-adapter + tokenizer decisions); real
  tok/s (🔒 GPU). See master Phase C/D/E + the handoff.
- **Phase D1 DONE** (this session): the **D9 switch-table cleanup** (user "do it all,
  drop included"). DROPPED `model_switches` (table + `ModelSwitchStore` + the
  `/v1/ai/model-switches` router + the per-model resolver branch + seed + exports +
  test) and `pin_switches` (inert table). `job_route_switches` is the survivor;
  `resolve_profile_switches` (was an orphan) is now wired as the **load-path reader**
  — `LoadRequest.jobId` → `RunnerService.load(job_id)` → injected
  `profile_switches_fn` applies the Profile's frozen-flat switches over the model
  base. Verified: 159 runner + 77 JW server tests + ruff. *(Per-job live apply at
  scale stays router-mode #27. Schema change → reset existing DBs.)*
- **Phase C1 DONE** (this session): the **knob_catalog** — `knob_catalog` +
  `knob_option` DB tables (seeded `DEFAULT_KNOBS`: Plane-1 switches + key Plane-2
  samplers, with enum options relational), `GET /v1/ai/knob-catalog`, and the
  Routing-by-job switch KnobGrid wired to render labelled/typed/enum-select inputs.
  Verified: 158 runner tests + build:vite + smoke. **C2 (per-model Tune & measure,
  #20) remains — its real tok/s readout is GPU-gated.** NOTE: the new schema
  (`job_routes.quality` + knob/runner tables) needs a **DB reset** on an existing
  install (`POST /v1/data/reset`) — the standing drop+reseed-on-schema-change policy.
- **Phase B COMPLETE** (this session): the **Fast/Balanced/Best dial**. Per job, a
  3-stop `UiSegmented` dial in Routing-by-job resolves a concrete model for the
  detected hardware — `resolve_quality(job, quality, hardware)` fit-filters the
  job's recommendations then walks a size ladder (Fast=smallest, Best=largest,
  Balanced=median), reproducing the Part-3 matrix; persisted as the job's
  `{model, quality}`; the explicit picker stays as the advanced/cloud override.
  Backend `quality.py` + `GET /v1/ai/job-quality` + a think guardrail (force think
  OFF under json_mode, `prompts._effective_think`). Verified: 155 runner tests +
  build:vite + smoke. (Master Phase B → COMPLETE.)
- **Phase A COMPLETE** (this session, `just-llm-runner`): the model catalog + fit
  + the last config-file, all DB-backed. **A1–A6:** `DEFAULT_CATALOG` rebuilt to 11
  rows across the full hardware range (Qwen · Gemma 4 · Mistral · GLM · Llama),
  repo ids + licenses web-verified (Gemma 4 = Apache, GLM-Air = MIT, Llama-4 =
  Community→flag); `license` column added through the stack; cited per-job
  recommendations; `coarse_fit` GPU branch now RAM-gates (no 64 GB-MoE offered to a
  16 GB box). **A7:** `runner-manifest.json` + its loader DELETED — binaries/pin/
  margin moved to DB tables (`runner_binary`/`runner_setting`, seeded built_in from
  `runner/config.py` constants), `RunnerConfig` replaces `RunnerManifest`, flag
  presets come only from the DB `switch_presets` (no duplication), endpoint
  `/v1/llm-runner/manifest`→`/config`. **GGUF orphan WIRED** (auto-detect type on
  load). Verified: 148 runner + 77 JW server tests pass + ruff clean; fresh JW
  server serves the 11-model catalog + DB-backed config. (Master Phase A → COMPLETE.)
- **#31 DATA-LOSS BUG FIXED** (this session, JW `routingBackend.js` rewrite): a JW default-LLM /
  embedding / feature-pin save no longer wipes the per-job model routes. The client now sends the
  full `{default, jobs, pins}` shape — cached `jobs` + untracked action-keyed `pins` carried through
  verbatim, only the store's tracked feature pins overlaid (set on pin / delete on inherit); dead
  `role`/`quick`/`accuracy` removed. Verified build:vite + headless smoke (0 JS errors). Master #31
  → "DATA-LOSS BUG FIXED ✅"; this is the first slice of the continuous data-loss + Phase A–E run.
- **#33 — Routing-by-job is a grid** (kit `RoutingByJob.vue`, this session): jobs render as a
  `UiTable` (job · model picker · Used-for · Edit/Delete) with add/edit via `AppModal`, reusing
  the `RecommendationsEditor` table+modal pattern (not a copy). All prior behavior kept (Defaults,
  per-job model, add/rename/delete/reset, `chat` un-deletable). Verified: build:vite + headless
  smoke (Routing-by-job tab renders, 0 JS errors) + kit jscpd 0.88% < 1.5%.
- **Rules-as-checks v3 — the AGENT is the judge at commit** (claude-config `cfb4924`; obs
  note `ac80912`; LIVE): closed the self-certification hole the user found — a CODE `git
  commit` now requires a GENUINE independent rules-checker AGENT all-pass verdict
  (`_rules.agent_pass()` reads PASS/FAIL from the agent's OWN harness result — a tool_result
  tied to an Agent call, or a `<task-notification>` — NOT from self-typed text). Dogfood: the
  live gate's first run returned FAIL + caught this recap + the plan doc stale → fixed →
  re-run PASS. **On TRIAL ("live with it"); friction tracked in `EFFECTIVENESS.md`** (first
  finding: a chained `git add && git commit` is conservatively gated — stage docs separately).
- **Rules-as-checks v2 — one shared registry + commit boundary + anti-skim** (claude-config
  `b43411e`, doc fix `8349e19`): regexes/turn-scan/rule-list moved into ONE `hooks/_rules.py`
  (killed the triplication; rule id == gate-stats key); verify-gate/pre-action/task-gate
  refactored onto it; NEW `commit-gate.py`; narrowed the pre-task deny (.md/trivial exempt +
  task-notification turn-window fix); committed `hooks/test_gates.py` harness. Panel found +
  fixed 2 commit-classifier bugs pre-ship.
- **Rules-as-checks v1 — the system** (claude-config `d5e9d52`/`8c36a48`/`ad9a4f9`; activated
  live): the global rules reworked from ~50k of prose into 12 checkable tests
  (T1–T12) enforced at mechanical events — PreToolUse (pre-task DENY + per-edit nudge),
  Stop (Blocks 0–5), `TaskCreated`/`TaskCompleted` gates — plus an Opus **rules-checker**
  subagent (a 2–3 **panel** for load-bearing design) and an effectiveness ledger.
  Dogfooded: the panel found + fixed **8 issues in the system itself** (incl. a
  narration-bypass of the blocking gates). → `claude-config/README.md` +
  `claude-config/EFFECTIVENESS.md`; the meta-rationale is design §17.4.
- **Recommendations dropdown fix + the reuse gate** (runner `658936e` / JW `ed3b3e6`,
  smoke-verified): the hardcoded `SUGGESTED_JOBS` became the shared **`LuJobSelect`**
  (live `/v1/ai/jobs`), converged across `RecommendationsEditor` + `FeatureWorkbench`;
  plus **jscpd** as a copy-paste gate + `check-shared-pickers`. → design §17. (Jobs-as-grid
  is **#33**; the old **#32** view-convergence was DROPPED — see backlog.)
- **Switch editors + per-action Plane-2** (runner `edeae9a`/`43a40e7`/`900e20c`):
  the **model manager** (#30 — LuModelCatalog +Add/Edit `type`+per-model switches/
  Delete/Reset), the **`switch_presets` editor** (base/moe/mtp bundles editable), and
  **per-action JSON output (#18) + top-p (#22)** threaded end-to-end (Plane-2, via the
  adapter's `extra`). Verified: 115 runner + 77 JW pytest, build, smoke, CRUD curls.
- **§9 jobs GUI** (runner `28d3d6e`): "Routing by job" tab (Defaults + job→model cards
  + job-list editor) + "Features"→"Routing by feature" rename + `useRouting` composable.
- **Switches phase — server foundation** (runner `42f4057` data model + `9133c67`
  type presets + layered resolver). `model_catalog.type` + `switch_presets`/
  `preset_switches` + `job_route_switches`/`pin_switches`/`hardware_switches` tables;
  `switch_resolve.resolve_model_switches` layers base→type→mtp(not-if-moe)→per-model→
  per-hardware, wired into the runner `switches_fn` — the **MoE `spec:none` rule lives
  ONCE on the `moe` preset** (per-model copies removed). 107 runner + 77 JW pytest.
  ⏳ Remaining: the per-job/feature runtime apply (GPU-gated **step 4 / #27**), the
  manifest-`flagPresets` removal, and the switch **editor routers + GUI**. →
  `docs/plans/2026-06-25-jobs-architecture-design.md` §11-step-3 STATUS.
- **Shared-LLM job move** — see *Current state*.
- **Catalog / switches / recommendations → DB** (runner `490e7a5` / JW `c70d44c`): the
  downloadable model catalog left `runner-manifest.json` for `model_catalog` +
  `model_switches` + `model_recommendations` tables. → `docs/plans/2026-06-25-llm-catalog-db-cutover.md`.
- **Platform settings shared** (U1–U4): AI consolidation, the usage ledger, Data
  backup/restore/reset, Server/Logs/Updates/Appearance. → `docs/plans/2026-06-24-shared-platform-settings.md`.
- **`/v1/llm` gateway retired** (all phases) — JW LLM + embeddings run through the shared
  dispatch (`/v1/ai/run|stream|embeddings`). → `docs/plans/2026-06-22-jw-gateway-retirement.md`.
- **AI ▸ Features UX pass** — `FeatureWorkbench` is the ONE AI config+test surface
  (per-action prompts/presets/test; Writer Lab + `/ai-prompts` deleted); category-grouped
  nav; point-of-use names. → `docs/plans/2026-06-20-shared-ai-stack-plan.md`.
- **Hardware presets + Fit engine shared** (runner `b77341c`/`9737af5`) — the oobabooga
  GGUF VRAM formula (cited; ~19.5k measurements) replaced the hand-rolled fit.
- **#19 `Overrides` through `/v1/llm-runner/load`** (`e5cecef`) — the switch-tuning foundation.

## Backlog (everything is in the master — this is just the pointer)
The full outstanding-work list — **every # item, phased (A–G), with what · why · file:line ·
acceptance · verify · gate** — is the master's **Part 2**. JustVoice-later work is the master's
**§G**. The load-bearing "why" technical facts (MoE `--n-cpu-moe`, MTP spec-decode helps dense /
machine-dependent on the A3B MoE, the two config planes, router mode) are the master's **Part 3.2**.
Do not maintain a second backlog here — add/triage items in the master.

## Active plan docs (the index) — there is now exactly ONE
**`just-llm-runner/docs/plans/2026-06-28-MASTER-PLAN.md` is the only current plan.** It folded in
everything that used to be split across the LLM status-index, the switch/preset architecture, the
switch-param lab, the 339-item complete-remaining audit, the jobs-architecture design, the
model-catalog research, the shared-AI-stack plan, the catalog-cutover / gateway-retirement /
platform-settings / cascade-audit docs, and the runner serving/switches/quicksetup research. **All
of those still exist in `docs/plans/` (both repos) as historical/evidence and are bannered "⛔ NOT
THE CURRENT PLAN" — read them for background only.** The two exceptions that are NOT plan docs and
stay live: `claude-config/README.md` + `EFFECTIVENESS.md` + `RULES-AS-CHECKS-V2-PLAN.md` (the
separate rules-as-checks track, Plan 1 — unhooked but documented).

## Where detail lives
**The plan detail lives in the ONE master** (`just-llm-runner/docs/plans/2026-06-28-MASTER-PLAN.md`).
Architecture + rules → this repo's `CLAUDE.md` + the global `~/.claude/CLAUDE.md`. The
JustWrite↔JustVoice HTTP boundary → `CONTRACT.md` in the JustVoice repo. Other `docs/plans/*` files
(both repos) are historical background only.
