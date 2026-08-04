# JustWrite AI — LLM-Work Categories & Engine Presets (for Claude Code)

*2026-07-01, rewritten from code (docs in `docs/plans/` are stale — treated as background only). Replaces the earlier job-organized draft. **Jobs are dead** as a routing dimension; routing is **feature-override → category preset → default preset**. The **Fast/Balanced/Best dial is gone** (its `quality` field on `JobTarget` is vestigial). This doc does the thing you asked: determine the correct **LLM-work** categories (not the nav groups), then define a concrete **engine preset** per category.*

---

## 0. The mechanism (from code, so the spec targets reality)

- **EnginePreset** (`presets_api.EnginePresetRow`) = the source of truth for what runs, combined with a feature's prompt. Fields: `providerId`, `model`, `temperature`, `topP`, `maxTokens`, `jsonMode`, `reasoningEffort`, `nglOverride`, `nCpuMoeOverride`, `switches[]` (frozen Plane-1), `samplers[]` (long-tail Plane-2, `{flagName, flagValue}`).
- **Resolution** (`preset_resolve.resolve_feature_preset(action, category)`): per-**action** override (`FeaturePresetRef`) → the action's **category** preset (`CategoryPreset`) → the global default. Called at `prompts.py:391` as `resolve_feature_preset(action, category_of(feature) or "")`.
- **`category_of(feature)` returns the NAV category** — `FeatureCatalogEntry.category` (`"Writing"`, `"Whole book"`, …), which its own docstring calls "the nav group." That's the bug you're pointing at: the routing key is a UX grouping.
- **`seed_llm` seeds NO engine presets and NO category assignments.** Confirmed by reading every seeder. So the category-preset layer is *empty* today; features fall through to the legacy job path.
- **The B3 guardrail is real** (`_effective_think`): `think` is forced OFF whenever `jsonMode` is on — so every JSON preset is automatically think-safe. `FeaturePrompt` already carries per-feature `json_mode`, `temperature`, `top_p`, `reasoning_effort`, so a feature can override the preset on those four.
- **Model catalog + knob flagNames used below are the real seeded values** (`seed.py DEFAULT_CATALOG` — 11 models; `DEFAULT_KNOBS` — the exact sampler names/defaults; `DEFAULT_SWITCH_PRESETS` — base/moe/mtp). Model recommendations are still tagged by the four words chat/prose/extraction/analysis, but those are **model-fitness tags, not routing** — I use them only to pick each preset's model.

---

## 1. Why the nav category is the wrong routing key (concrete)

| Nav category | Features in it | What the LLM actually does | Verdict |
|---|---|---|---|
| **Writing** | `writerAI` (Continue/Expand/Describe **and** Rewrite/Tighten/line-edits) | ONE feature spans *generate new voiced prose* **and** *faithfully transform existing prose* | splits across 2 work-categories |
| **Drafting tools** | `sensory`, `unstuck`, `brainstorm` | *structured-creative JSON* (sensory) + *divergent ideation* (unstuck, brainstorm) | 2 work-categories |
| **Whole book** | `plotHoles`, `reverseOutline`, `beatSheet`, `marketingPack`, `foreshadowing`, `readerKnowledge`, `voiceDrift` | *extraction* (reverseOutline/beatSheet/foreshadowing/readerKnowledge) + *judgment* (plotHoles/voiceDrift) + *publishing-prose JSON* (marketingPack) | 3 work-categories |
| **Characters** | `entitySweep`, `characterAudit`, `relationshipArc` | all *structured extraction* | 1 (coincidentally clean) |
| **Chat** | `chat`, `characterChat` | *grounded RAG* vs *in-voice roleplay* — different temp + intent | 2 work-categories |
| **Home** | `briefing`, `recap` | *grounded digest* (one prose, one JSON) | 1 work-category (mixed shape) |
| **Multi-reader panel** | `multiReader` | *judgment* (4 personas) | folds into judgment |
| **Analysis** | `critique` | *judgment* (notes + structure) | folds into judgment |

So four nav buckets fragment across work-categories, and work-categories collect features from *different* nav buckets. Routing presets by nav category would put extraction, critique, and marketing copy on the same engine config. That's the problem.

---

## 2. The correct LLM-work categories (the determination)

A feature shares a category with another **iff it wants the same engine + sampler + model treatment**. The axes that decide that: **output shape** (free prose vs strict JSON) · **creativity vs faithfulness** · **interactivity/latency** · **reasoning need** · **voice-boundedness**. Applying them yields **9 work-categories** (with stable string ids for the `category` field):

| # | category id | Definition | Actions | Shape | Model-fitness tag |
|---|---|---|---|---|---|
| 1 | `prose.generate` | Generate NEW prose in the manuscript's voice | `writerAI.continue`, `writerAI.expand`, `writerAI.describe` | prose | prose |
| 2 | `prose.edit` | Faithfully transform EXISTING prose (compress, fix) | `writerAI.rewrite`, `writerAI.tighten`, all line-edits (`filterWords`, `showDontTell`, `dialogueTags`, `activeVoice`, `sentenceVariation`, `sensoryAnchor`) | prose | prose |
| 3 | `ideation` | Divergent, disposable idea/option generation | `brainstorm`, `brainstormPlot`, `unstuck` | list / loose JSON | prose |
| 4 | `creative.structured` | Creative content emitted in a fixed JSON shape | `sensory`, `marketingPack` | JSON | prose |
| 5 | `summary.grounded` | Faithful digest of existing text, no invention | `briefing` (prose), `recap` (JSON) | mixed | chat/prose |
| 6 | `extract.structured` | Pull facts into strict FLAT JSON, near-deterministic | `entitySweep`, `reverseOutline`, `beatSheet`, `readerKnowledge`, `characterAudit`, `relationshipArc`, `foreshadowing` | JSON | extraction |
| 7 | `judge.scored` | Evaluate / score / critique (reasoning-heavy) | `critique`, `critiqueStructure`, `multiReaderGenre/Literary/Agent/BookClub`, `plotHoles`, `voiceDrift` | JSON | analysis |
| 8 | `chat.grounded` | Interactive RAG Q&A over the manuscript | `chat` | prose+citations | chat |
| 9 | `chat.inVoice` | First-person, in-character roleplay | `characterChat` | prose | chat |

Note the two things the nav can't express: `writerAI` **splits** (1 vs 2 — its actions want different presets), and `foreshadowing`/`plotHoles`/`voiceDrift` **leave** "Whole book" for extraction (6) or judgment (7) by what they emit, not where they sit.

---

## 3. Engine presets — one per category, real values

Below, each preset is an `EnginePresetRow`. `model` is the **floor default for an 8 GB-VRAM + 32 GB-RAM rig** (yours) chosen from `DEFAULT_CATALOG`; bigger rigs swap it in the Lab. `providerId="local-llamacpp"`. `switches[]` left empty → the base/moe/mtp type-presets resolve automatically. `samplers[]` uses exact `DEFAULT_KNOBS` `flagName`s. **`temperature`/`topP`/`jsonMode` set here are preset defaults; per-action deltas ride the `FeaturePrompt` (which already stores them).**

Floor model logic: interactive work → `qwen3.5-9b-q4_k_m` (fits ~7.5 GB, fast); quality/batch work → `qwen3.6-35b-a3b-mtp` (6 GB VRAM + 32 GB RAM via `--n-cpu-moe`, ~32B-class, ~17–20 t/s). This is a clean two-model floor deployment.

### P1 · Creative prose  → categories `prose.generate`, `ideation`
De-slop layer lives here (XTC is the highest-value add; it kills cliché token choices).
```
model=qwen3.6-35b-a3b-mtp   (fast alt: qwen3.5-9b-q4_k_m)   temperature=0.9  topP=0.95  jsonMode=false
samplers: min_p=0.05, xtc_probability=0.5, xtc_threshold=0.1, dry_multiplier=0.8
```
Per-action `FeaturePrompt` deltas: `continue`/`expand`/`describe` → temp **0.85** + a per-action sampler override `xtc_probability=0.3` (voice-matched: don't strip the author's word choices). `brainstorm`/`brainstormPlot` → temp **1.0**. `unstuck` → temp **0.75** + `jsonMode=true` if it emits its 5 options as JSON.
Qwen override (Lab-doc, not seeded): drop `dry_multiplier`, add `presence_penalty=1.5` (Qwen's native control — never run both), `top_p=0.8`, `top_k=20`.

### P2 · Prose editing  → category `prose.edit`
Faithfulness beats flair — no XTC (it would rewrite the author's words).
```
model=qwen3.5-9b-q4_k_m   temperature=0.6  topP=0.9  jsonMode=false
samplers: min_p=0.08
```
Per-action: `tighten` → temp **0.5**.

### P3 · Interactive chat  → categories `chat.grounded`, `chat.inVoice`
Fast local, think-off (your finding: chat = latency), no creative samplers.
```
model=qwen3.5-9b-q4_k_m   temperature=0.5  topP=0.9  jsonMode=false  reasoningEffort=""
samplers: min_p=0.05, repeat_penalty=1.05, repeat_last_n=64
```
Per-action: `chat` → temp **0.3** (factual RAG); `characterChat` → temp **0.7** (in-voice). One preset, two feature-level temps.

### P4 · Structured creative  → category `creative.structured`
Creative content, but strict JSON. `jsonMode` on → think auto-off. XTC still de-slops the string values.
```
model=qwen3.6-35b-a3b-mtp   temperature=0.7  topP=0.95  jsonMode=true
samplers: min_p=0.05, xtc_probability=0.4
```
Requires a **flat** `json_schema` per feature (sensory's 8 sense arrays; marketingPack's logline/blurbs/synopsis/pitch). Per-action: `marketingPack` → temp **0.5**, drop XTC (blurbs want convention).

### P5 · Structured extraction  → category `extract.structured`
Near-deterministic facts. `jsonMode` on → think auto-off. Pinned seed instead of temp-0 (dodges the Qwen greedy-loop while staying reproducible).
```
model=qwen3.6-35b-a3b-mtp   temperature=0.15  topP=0.9  jsonMode=true
samplers: seed=<fixed int>, min_p=0
```
Requires **flat** `json_schema` per feature (deep schemas break constrained decode). For scored fields (`relationshipArc` warmth/tension) the schema must bound the integer range + enum so an out-of-range value is structurally impossible. High-RAM upgrade: `mistral-small-3.2-24b-q4_k_m` (no thinking mode = safest JSON) or `glm-4.5-air`.

### P6 · Judgment / scoring  → category `judge.scored`
`jsonMode` on → think auto-off. The judgment-heavy ones want reasoning, so at higher effort use **reason-then-emit** (§4).
```
model=qwen3.6-35b-a3b-mtp   temperature=0.4  topP=0.95  jsonMode=true
samplers: seed=<fixed int>, min_p=0.05
```
Per-action: `critiqueStructure` → temp **0.2**; `multiReader*` → temp **0.55**. `critiqueStructure` + `multiReader*` are the reason-then-emit candidates. High-tier upgrade: `qwen3.6-27b-mtp-q4_k_m` (local analysis ceiling) / `qwen3-235b-a22b` (96 GB RAM).

### P7 · Grounded digest  → category `summary.grounded`
Faithful summary, no invention → no XTC/DRY. `jsonMode` comes from the feature (`briefing` false → prose; `recap` true → 2-field JSON).
```
model=qwen3.5-9b-q4_k_m   temperature=0.4  topP=0.9  jsonMode=false
samplers: min_p=0.05
```
Per-action: `recap` → `jsonMode=true` (via its `FeaturePrompt.json_mode`).

**Coverage check:** every action in §2 maps to exactly one of P1–P7. 9 categories → 7 presets (the two chat categories share P3; both prose-creative categories share P1).

---

## 4. Reason-then-emit (for the judgment/attribution features)

The B3 guardrail makes JSON and thinking mutually exclusive in one call, which forces a choice between *valid JSON* and *reasoning quality* for `critiqueStructure`, `multiReader*` (and JV `speaker_attribution`). Do it in two calls:
1. **Reason** — `think` on, `jsonMode` off, prompt asks for the analysis in prose.
2. **Emit** — feed pass-1 back, `jsonMode` on (think auto-off), prompt asks only to serialize to the flat schema.

Wire as a per-feature `mode:"reason_then_emit"` flag, used only at higher effort (single-pass think-off otherwise). It's the only way to get CoT-grade judgment *and* guaranteed-valid scored JSON.

---

## 5. Claude Code — implementation

The category-preset layer is empty and keyed on the nav category. Two decisions, then the tasks.

**Decision A — make the work-category real.** Add a work-category dimension so `category_of` returns the *LLM-work* category, not the nav group. Cheapest: a per-app `feature_llm_categories` seed map (`{action_key → category_id}`) parallel to `feature_jobs`, and point `category_of` at it (fall back to nav category if unset). This is the honest fix and it lets the category-preset UI group correctly. *(The nav category stays on `FeatureCatalogEntry` for the UI — the two dimensions coexist.)*

**Decision B — action-level where a feature splits.** `writerAI` spans P1 and P2, so its **actions** need different presets. `resolve_feature_preset` already takes `action` for the per-action `FeaturePresetRef` lookup — so either (i) make the work-category map action-keyed (it already is above), or (ii) seed per-action `FeaturePresetRef` rows for the split feature. Prefer (i): the map is action-keyed, so `writerAI.continue → prose.generate` and `writerAI.tighten → prose.edit` fall out naturally.

**Tasks (ordered):**
1. **Add `DEFAULT_ENGINE_PRESETS`** to `seed.py` (7 rows from §3, `EnginePresetRow` shape, `built_in=true`, stable ids `p_prose_creative`…`p_grounded_digest`) + a `seed_default_engine_presets(s)` seeder (flush parent before `switches`/`samplers` FK children, per the switch-preset seeder pattern). Add it to `seed_llm`.
2. **Add `DEFAULT_CATEGORY_PRESETS`** = `{category_id → preset_id}` for the 9 categories (two map to shared presets) + a seeder writing `CategoryPreset` rows. This is the assignment your system is missing.
3. **Add the `feature_llm_categories` map** (Decision A), action-keyed, from §2; wire `category_of` to it. Ship it via `configure_app_seed` alongside `feature_jobs`/`feature_prompts`.
4. **Set per-action `FeaturePrompt` fields** for the §3 deltas: the temperatures noted, and `json_mode=true` on every extraction/judgment/structured-creative/`recap` action (so the B3 guardrail forces think-off). Then **upgrade `response_format` from `json_object` to a strict FLAT `json_schema`** per JSON action, and delete the "Return ONLY the JSON object, no markdown fences" prompt tails (the schema enforces it).
5. **Seed per-action sampler overrides** (`feature_sampler_params`) only where an action deviates from its preset: `continue`/`expand`/`describe` → `xtc_probability=0.3`; `marketingPack` → clear XTC. (Everything else inherits the preset's `samplers[]`.)
6. **Add `reason_then_emit`** (§4) for `critiqueStructure`, `multiReader*`, JV `attribution`, gated to higher effort.
7. **Tests:** extend `test_ai_prompts.py` / `test_feature_samplers.py` / `test_presets.py` for the new seed counts, the category→preset assignments resolving, and the **invariant** that no seeded action has both `json_mode=true` and `think=true`. `ruff` + pytest.
8. **Empirical pass (not from this doc):** these temps/samplers are *starting defaults* (vendor cards + llama.cpp defaults + your knob research). Settle them in the Lab tok/s tuner (#20) and, for prose/judgment quality, an EQ-Bench `creative-writing-bench` run against a *hosted* copy of the resolved model with a cloud judge (~$3, no GPU).

---

## 6. Invariants (put in a code comment)
- **Category = LLM work, not nav.** The nav group is UX; routing keys on the work-category map.
- **JSON ⇒ no think** (enforced by `_effective_think` B3 — don't fight it). Any JSON action sets `jsonMode`; never also `think`.
- **Schemas flat.** Constrained decode breaks on nesting → one level of fields; bound integer ranges + enums.
- **De-slop = XTC, creative prose only** (P1 0.5 / voice-matched 0.3; P4 0.4). Never on edit/chat/extraction/judgment/summary.
- **Repetition: DRY *or* presence_penalty, never both** (stacking causes Qwen's language-mixing). DRY family-agnostic; presence_penalty=1.5 on Qwen.
- **Determinism = pinned seed, not temp-0** (Qwen greedy degrades; schema bounds shape, seed bounds variation).
- **Model per preset is floor-default + Lab-swappable.** A preset pins one model; the right model is hardware-dependent — the floor default runs for everyone, bigger rigs upgrade in the Lab.
- **MTP is a Plane-1, machine-dependent switch** (dense=on, MoE=measure) — already in `DEFAULT_SWITCH_PRESETS`; noted here so sampler tuning isn't blamed for MTP speed swings.
