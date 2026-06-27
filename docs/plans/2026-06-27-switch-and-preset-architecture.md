# Profile + Feature Architecture — LOCKED plan (code-verified 2026-06-27)

**Status:** LOCKED — building. Decided across the 2026-06-27 design session (full reasoning in
that session; this is the spec). Two concepts: **Profile** (the engine) and **Feature** (the
prompt). Branch: `claude/admiring-galileo-il3q0o`.

**Supersedes** the switch/preset/JobPreset sections of `2026-06-27-switch-param-lab.md` and
`2026-06-25-jobs-architecture-design.md` §6.4/§6.6, and the earlier full-bundle/engine-library
drafts of this same file.

---

## 1. The model — two concepts, two planes

| Concept | Owns | Plane | Grain | Reload to change? |
|---|---|---|---|---|
| **Profile** | model + switches (the engine) + name/description | **Plane-1** | the editable named list (~4 seeded + user) | yes — re-spawn |
| **Feature** | system + user prompt + **sampler params (the full, backend-aware set — §8)** + a **Profile pointer** | **Plane-2** | per action (~40, seeded) | no |

- **A Profile *is* today's `job` + its model + switches.** The `jobs` table is already an
  editable named list (add/rename/delete) and `job_routes` already maps job→model — so a Profile
  = that, plus switches. The set of Profiles **is** the library (no separate library concept).
- **A Feature points at a Profile** (today's `feature_jobs` map, unchanged) and carries its own
  prompt + per-call params. Most features = "just a prompt + a Profile pointer"; the few that
  need a different param (brainstorm 0.9, characterChat 0.7, voiceDrift prose) keep their own
  (params already live per-action in `feature_prompts` — verified).
- **UI name = "Profile". Internal code stays `job`** (job-native dispatch just shipped + is
  tested; a cosmetic global rename is deferred). Documented mapping: **Profile (UI) = job
  (code)**.

## 2. Locked decisions
1. **Profile = model + switches.** The loadable/router unit. The editable Profiles list = the
   library; "Save as Writer" = add/update a Profile (reuses the feature-form preset bar pattern).
2. **Feature = prompt + params + Profile pointer + a minimal test.** Params stay per-feature
   (Plane-2); seeded values are **untested starting points** (ported from the old client) — the
   feature test + the lab are how you dial them in.
3. **Freeze-flat** for a Profile's switches: stores the resolved values; editing a type-default
   later never mutates existing Profiles.
4. **Type-defaults pre-fill, they are not a load layer.** `switch_presets` (base/moe/dense/mtp)
   pre-fill a new Profile's switch string by the model's type at creation; after that the Profile
   owns its frozen switches.
5. **Model identity auto-detected from the GGUF** (`expert_count`→`type` moe/dense, arch, params)
   drives which type-default pre-fills. `mtp` detection: **verify upstream first** (current reader
   has no MTP signal — do not assume one).
6. **Per-hardware stays automatic + gets wired.** A Profile is portable; `hardware_switches` +
   the computed `-ngl` apply on top at load (today `hardware_switches` is dead — `hw_key` never
   passed, install.py:102).
7. **Switch tables:** the Profile's switches live on the per-(config,job) route child —
   **`job_route_switches` is REVIVED with readers** (it was schema-only). **Drop `model_switches`**
   (switches are per-Profile now; its seed is empty, seed.py:96) and **`pin_switches`** (features
   don't carry switches). **Keep** `switch_presets`/`preset_switches` (type-default pre-fill) +
   `hardware_switches` (wired) + `model_catalog`.
8. **Provider form = connection + catalog only.** Switch editing leaves it (`ProviderForm.vue:200`
   → `LuModelCatalog`/`LuSwitchPresets`); the type-defaults editor relocates to an advanced
   "Model-type defaults" surface.
9. **The lab is the Profile editor:** model + switches + the preset bar (Save-as → library) +
   Compare (N Profile columns) + test against a chosen Feature's prompt + **tok/s**.
10. **Load contract:** `resolve_profile_switches(job_id, hw_key)` → frozen Profile switches +
    this machine's `hardware_switches`; loaded via the existing `/v1/llm-runner/load`
    (`model_id` + `overrides`). Offline composition (Profile → exact spawn argv) is Track-A
    testable via the injectable `start_runner`; the **live** load + multi-Profile hot-swap need
    router mode (#27) = Track B.
11. **Recommendations / QuickSetup anchor on the seeded Profile ids** (`chat/prose/extraction/
    analysis`) — renaming keeps the id; a net-new Profile just starts hint-less. *(QuickSetup
    refinement is PARKED pending the user's concern.)*

## 3. Data model (what changes)
- **`job_routes`** (per config_id, job_id → provider, model): unchanged shape = the Profile's
  model. **`job_route_switches`** (config_id, job_id, flag_name, flag_value): now READ at load =
  the Profile's switches. (Add a host store + a CRUD/save API mirroring the switch-presets store.)
- **`feature_prompts`**: unchanged — system/user/temperature/think + (top_p/json_mode/max from
  #18/#22). The Feature's Plane-2.
- **`feature_jobs`** (feature → job): unchanged = the Feature→Profile pointer.
- **`jobs`** (id/label/description): unchanged = the Profile's identity; the editable list = the
  library.
- **Drop:** `model_switches` (+ `ModelSwitchStore`, `make_switches_router`, the per-model
  sub-editor, the per-model resolver branch, its test) and `pin_switches`.
- **Keep + wire:** `hardware_switches` (pass `hw_key` at load).
- DB policy = **drop + reseed, no migrations** (delete the DB / Reset, which now
  drops+recreates+reseeds — `data_admin._reset`).

## 4. Build stages

### Track A — buildable + verifiable in this container (no GPU)
- **S1. Profile switches (backend).** Read `job_route_switches` at load: a host
  `JobRouteSwitchStore` + `resolve_profile_switches(job_id, hw_key)` (frozen route switches +
  hardware) + an optional `job_id` on the load path that uses it and bypasses the per-model
  resolver. Wire `extra_flags` through `_switches_to_overrides` (lifecycle.py:82-93). Drop
  `model_switches`/`pin_switches`. `pytest` + `ruff` (offline argv composition via injectable
  `start_runner`).
- **S2. Profile CRUD + Save-as/library + promote API.** A router over the jobs+route+switches so
  the lab can list/save/duplicate/assign Profiles (mirror `feature_presets_api.py`’s factory +
  Protocol). `pytest`.
- **S3. Model identity auto-detect.** On add/download read the GGUF → set `model_catalog.type`
  from `expert_count`; pre-fill a new Profile's switches from the type-default. `pytest`
  (fixture GGUF). (`mtp`: upstream check first.)
- **S3b. Shared `<KnobGrid>` + seeded knob catalog (D15).** A generic add-a-row name/value grid
  component (kit — generalize the existing `LuSwitchPresets` grid) + a seeded, editable
  `knob_catalog` (`plane` = switch | sampler; `name` → type / range / help / backends). The grid
  renders enriched inputs for cataloged knobs, raw rows for unknowns, and exposes the per-backend
  filter. Reused by S4 (switches) and S6 (samplers). `pytest` (catalog seed + filter) + smoke.
- **S4. Lab = Profile editor (frontend).** Reuse the FeatureWorkbench preset-bar pattern; body =
  model + the **switch `<KnobGrid>`** (S3b; parses to `Overrides` names + `extra_flags`, surfaces
  unknowns) + Save-as → library + a **tok/s** readout (fix the camel/snake usage bug,
  FeatureWorkbench.vue:391-396). Smoke.
- **S5. Compare.** N Profile columns (shared `<ProfileColumn>`), Run-all against the selected
  Feature's prompt, per-column tok/s, promote the winner. Smoke.
- **S6. Feature form + Plane-2 sampler surface (§8).** *Backend:* persist the Feature's sampler
  params (lean: `feature_sampler_params` key-value rows) + **filter per adapter** (pass via
  `extra`, drop keys the routed backend rejects; fix the Ollama/Gemini drop bugs
  `ollama.py:91-92`/`gemini.py:115-116`) + upgrade `json_mode` → `json_schema`/`grammar` where
  supported. *Frontend:* strip model/switches OUT of the feature form; body = prompt + the
  **sampler `<KnobGrid>`** (S3b; catalog-driven: portable knobs always, local-only exotics behind
  "Advanced") + **Profile dropdown** + a one-button **Test** (runs on the Feature's Profile
  engine). Relabel job→Profile. `pytest` (adapter filter) + smoke.
- **S7. Rip switch editing out of the provider form**; relocate the type-defaults editor to the
  advanced surface. Smoke + `npm run dup` (the preset bar is one shared piece).

### Track B — needs your GPU / a live model to verify
- **#27 router mode** loads Profiles (named model+switches bundles) + hot-swaps; live apply of a
  Profile's switches; real tok/s; the Compare scheduler; **#29** residency/co-residence.

## 5. Verification
- `pytest` + `ruff` (runner + JW): the Profile switch store + `resolve_profile_switches` + the
  load-path `job_id` branch (offline argv) + `extra_flags` + identity-detect + the
  `model_switches`/`pin_switches` drop (update tests).
- `npm run build:vite` + `node scripts/headless-smoke.mjs` (boot `python -m
  justwrite_server.cli serve --port 17495` + `npm run dev:vite`): the lab renders a Profile
  (model+switches+tok/s), Compare renders N columns, the Feature form renders prompt+params+
  Profile dropdown+Test, provider form has no switch editor. Reuse `findChrome()`.
- `npm run dup` both repos.

## 6. Parked (raise then fold in)
- **QuickSetup** — the user has a concern; QuickSetup seeds Profiles + uses recommendations.
  Discuss before S-touching QuickSetup; the rest of Track A is independent of it.

---

## 7. Decision log — the ideas considered, not just the landing

This records the alternatives we weighed on 2026-06-27 and *why* each fork went the way it did,
so we don't re-litigate. The design was stress-tested two ways: a 3-checker rules-checker panel
(which caught the load-boundary hand-wave, the `model_switches` vagueness, and the ConfigColumn
entanglement on an earlier shape) and ~10 rounds of the user adversarially poking it. Several of
these reverse an *earlier* call in the same session — that's the point of keeping them.

**D1 — A "preset" as one full bundle, or split engine vs prompt?**
Considered: (A) one bundle = model+switches+params+prompt per unit; (B) split the engine from the
prompt. **Landed: B (split).** Verified in code that there are ~40 actions, each with a distinct
hand-crafted system prompt and its *own output contract* — `critique` returns notes-JSON,
`critiqueStructure` a scores-JSON, `entitySweep` an entities-JSON, `marketingPack` prose, `chat`
cited prose (`seed_feature_prompts.py`). Prompts can't be shared up to a job, so one
bundle-per-job can't carry 40 prompts. The engine (model+switches) *is* shareable per job; the
prompt is irreducibly per-feature.

**D2 — Per-call params (temp/top-p/json/think): on the feature, or a job default?**
Considered: (A) job-default + per-feature override; (B) purely per-feature. **Landed: B
(per-feature, Plane-2).** Empirically params vary *within* a job, sometimes essentially —
`chat` 0.3 (factual RAG) vs `characterChat` 0.7 (roleplay) on the **same** job; `brainstorm` 0.9
vs `recap` 0.4 on prose; `voiceDrift` returns prose while every other analysis feature returns
JSON (`seed.py:29-54` × `seed_feature_prompts.py`). A job-level value would flatten those. The
clincher was the user's point that the seeded temps are **untested** (ported verbatim from the
old client) — so the per-feature *test* is exactly how you replace guesses with measured values;
the params belong with the prompt where they're tested. (Extraction *is* near-uniform — the
user's "features in a group share params" intuition held there — but the exceptions force
per-feature.)

**D3 — Engine presets: a reusable library jobs point to, or no separate library?**
Considered: (A) a named engine-preset library, jobs reference one (shareable); (B) none. **First
leaned A, then reversed.** The user pointed out the "library" is not a concept to build — it's the
**Save-as-named pattern the features form already has** (`FeatureWorkbench` preset bar), applied
to engines. Saving named engine configs *is* the library, for free. A separate library layer was
over-engineering; cross-job sharing is rare and cheap to duplicate.

**D4 — Job and engine-preset: two concepts, or collapse into one "Profile"?**
Considered: (A) feature→job→engine-preset (job = generic category, engine = config); (B)
feature→Profile (Profile = the named engine = the routing target). **Landed: B (collapse).** The
separate job layer only earns its keep if one engine is shared across multiple categories (then
category ≠ engine). Since sharing is rare and the save-as pattern already yields a library, one
Profile concept suffices. The seeded Profile ids (`chat/prose/extraction/analysis`) still anchor
recommendations/QuickSetup. The user consistently pushed for fewer concepts; this honors it.

**D5 — One form, or two?**
Considered: (A) one unified form (engine-primary with a feature dropdown that loads the prompt);
(B) two surfaces — a per-feature prompt form + a per-Profile engine lab. **Landed: B.** Prompts
are per-feature (~40), engines per-Profile (~4): a single form forces opening it at the wrong
cardinality and buries prompt-editing inside an engine-primary axis. The prompt has one owner
(the feature form); the lab tests engines.

**D6 — Switch editing placement.**
Considered: (A) keep it in the Providers/model-manager tab; (B) the §6.6 "rip it out, edit in the
lab." **Landed: B**, now coherent because switches finally have a home (the Profile). Provider
form → connection + catalog only; the type-defaults editor relocates to an advanced surface.

**D7 — Switches as an arbitrary CLI string, or typed?**
Considered: (A) freeform CLI string ("any flag, no code"); (B) a string mapping to the typed
`Overrides` field names + `extra_flags` for the rest. **Landed: B.** The runner's switches are a
typed `Overrides` dataclass (`process.py:44-80`) + an `extra_flags` escape, and
`_switches_to_overrides` **silently drops unknown keys** (`lifecycle.py:82-93`). So the string
maps to known names, routes the rest to `extra_flags` (which must be wired — currently skipped),
and **surfaces unknowns** instead of dropping them. "Add a flag with no code" is real, via
`extra_flags`. **(Revised by D15:** switches are edited in the shared `<KnobGrid>` — a key-value
grid — not a freeform string; the parse-to-`Overrides`-names + `extra_flags` passthrough is
unchanged.**)**

**D8 — Freeze-flat, or store deviations from the type-default?**
Considered: (A) freeze the resolved values onto the Profile; (B) store only deviations and
re-layer at load. **Landed: A (freeze).** A tested/promoted config must not silently change when a
type-default is edited later. Type-defaults are a creation-time pre-fill, not a live layer.

**D9 — The switch override tables' fate.**
Considered: drop all three vs keep/revive. **Landed: revive `job_route_switches`** (= the
Profile's engine switches, now with readers — it was schema-only), **drop `model_switches`**
(redundant once switches are per-Profile; its seed is empty, `seed.py:96`) and **`pin_switches`**
(features don't carry switches), **keep + wire `hardware_switches`**, **keep `switch_presets`**
(the type-default pre-fill). (Note: an earlier draft said drop `job_route_switches` too — the
collapse reversed that, since the Profile *is* the job-route.)

**D10 — Model identity: detection writes switches, or writes identity?**
Considered: (A) GGUF detection writes switches directly; (B) detection writes the catalog
*identity* (`type` from `expert_count`), which drives the type-default pre-fill. **Landed: B.**
Detection feeds switches *indirectly through identity* — writing switches directly would fight the
type-default layer. Today the GGUF knows MoE-ness (`expert_count`, `gguf.py:50`) but only feeds
VRAM fit, never `model_catalog.type` — that's the wire to add. (`mtp`: no current GGUF signal —
verify upstream before assuming one.)

**D11 — Compare: a mode toggle in Features, or a separate view?**
Considered both; **landed:** Compare lives in the **lab** as N Profile columns — consistent with
the two-surface split (the lab is the engine surface, so comparing engines belongs there).

**D12 — Naming.**
Considered: Job / Preset / Profile. **Landed: "Profile" (UI); internal code stays `job`** (the
job-native dispatch just shipped and is tested) — a cosmetic global rename is deferred.

**D13 — Per-feature engine escape.**
Considered: force "new Profile" for any feature needing a different engine vs keep a per-feature
model pin. **Landed:** Profile is primary; keep the per-feature pin (`routing_pins`) as the rare
escape to avoid Profile-proliferation for one-offs. Rule of thumb: engine difference → new
Profile (or pin); param difference → the feature's own params; prompt difference → just edit the
prompt.

**D14 — Plane-2 sampler surface: the full set, not 5 (we had the research, the build missed it).**
Considered: (A) add a fixed column per sampler (~30 columns) — rejected, unscalable + backend-
specific; (B) the Feature carries a **variable, backend-aware sampler set** edited in one
section. **Landed: B**, which is exactly the #17 survey's recommendation
(`2026-06-24-sillytavern-survey.md`, source-verified vs SillyTavern's request builders) — but the
build only wired temp/top-p/json/think/max, so ~25 samplers were silently dropped. This closes
that gap. Detail + the source-verified param lists + the storage sub-decision: §8.

**D15 — One shared `<KnobGrid>` for switches AND samplers (no hardcoded per-param widgets).**
Considered: (A) a hardcoded input per known param (~30 sampler widgets + N switch widgets); (B) a
JSON blob; (C) a generic **key-value grid** + the adapter's `extra` passthrough + an optional
seeded **knob catalog** for nice UX. **Landed: C — and unified across both planes.** Profile
switches (Plane-1) and Feature samplers (Plane-2) are the same shape (named knobs → a typed field
set + a passthrough for the rest), so **ONE `<KnobGrid>` component serves both**, each pointed at
its own seeded knob catalog. Why: future-proofing — when llama.cpp adds a param (it will, as it
adds flags), a new row works with **zero code**; the catalog (label / type / range / help /
which-backends) is DATA, so even nice-UI-for-a-new-param is a seeded row, not code. `extra`
already forwards any key (`openai_compat.py:121`). This **revises D7** (switches: grid, not a
freeform string) and **resolves §8's storage** (key-value rows). (A) lost on the per-param
hardcoding the user flagged; (B) lost on no-JSON-in-SQL + worse UX. The user's framing: "when
llama.cpp adds params like they add switches, we shouldn't need to code anything new."

---

## 8. Plane-2 sampler surface (source-verified 2026-06-27)

The Feature's Plane-2 is the **full backend-aware sampler set**, not the 5 the build wired. The
#17 survey researched this against SillyTavern's request builders; here are the exact param names
re-verified against the **two backends we actually call**, today.

**llama.cpp server** (our local runner — verified from `ggml-org/llama.cpp` `tools/server/
README.md`, raw, 2026-06-27): `temperature`, `dynatemp_range`, `dynatemp_exponent`, `top_k`,
`top_p`, `min_p`, `top_n_sigma`, `typical_p`, `xtc_probability`, `xtc_threshold`,
`repeat_penalty`, `repeat_last_n`, `presence_penalty`, `frequency_penalty`, `dry_multiplier`,
`dry_base`, `dry_allowed_length`, `dry_penalty_last_n`, `mirostat`, `mirostat_tau`,
`mirostat_eta`, `n_predict`, `seed`, `stop[]`, `grammar`, `json_schema`, `samplers[]` (order),
`ignore_eos`, `logit_bias`, `n_probs`, `min_keep`, `adaptive_target`, `adaptive_decay`.

**Cloud (OpenAI-compat)**: `temperature`, `top_p`, `frequency_penalty`, `presence_penalty`,
`max_tokens`, `seed`, `stop[]`, `response_format` (JSON), `reasoning_effort`, `verbosity`.
(Anthropic / Gemini / Ollama: subsets — the survey's portability matrix is the filter.)

**Plumbing already exists:** `openai_compat.py:121-122` does `body.update(extra)` — any key in the
call's `extra` reaches the backend. So wiring = persist the Feature's sampler params → pass them
as `extra` → **filter per adapter** (drop keys the routed backend doesn't accept). The adapters'
silent-drop bugs (Ollama/Gemini drop top_p+response_format, `ollama.py:91-92`/`gemini.py:115-116`)
get fixed as part of this so the filter is correct, not lossy.

**UI = backend-aware (the survey's call):** the portable few always (`temperature`, `top_p`,
`frequency/presence_penalty`, `seed`, `stop`, max/`n_predict`, structured-output); the local-only
exotics (`top_k`, `min_p`, `typical_p`, `top_n_sigma`, `tfs`, `mirostat`, `dynatemp`, `dry_*`,
`xtc_*`, `samplers`-order, `logit_bias`, …) behind an **"Advanced (local)"** disclosure shown
only when the Feature's Profile routes to the local runner / Ollama. The seeded values are
**untested starting points** (D2) — the feature Test is how you dial them in.

**Storage + editor — RESOLVED 2026-06-27: key-value rows + a shared `<KnobGrid>` (D15).**
Sampler params persist as **key-value child rows** `feature_sampler_params(feature_key, param_name,
value)` — mirrors the switch tables (`model_switches`/`preset_switches` are `(name, value)` rows
parsed by name); **no JSON-in-SQL**; the two array params (`stop`, `samplers`) JSON-encode into
their text value. They're edited in the **shared `<KnobGrid>`** (the same component Profile
switches use) — a generic add-a-row name/value grid, so a NEW llama.cpp sampler needs **zero
code** (add a row → it flows through `extra`). A seeded, editable **knob catalog** (DATA) enriches
known params with a label / typed input / help + drives the per-backend filter; unknown params
still work as raw rows. (The rejected JSON-blob option needed a no-JSON exception and gave worse
UX; a hardcoded widget per param is the per-param coding we're avoiding.)

**Structured output upgrade:** llama.cpp takes both `grammar` (GBNF) and `json_schema`; cloud
takes `response_format`. Our #18 `json_mode` is only the weak `json_object` form — upgrade to
`json_schema`/`grammar` where the backend supports it (survey HIGH #1; 30+ JW features return
JSON, and today they only *ask* for it in the prompt). Structured-output is a sampler-surface
member, not a separate concept.
