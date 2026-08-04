# JustWrite AI — LLM-Work Categories & Engine Presets: implementation handoff (for Claude Code)

*2026-07-01. Grounded entirely in code (the `docs/plans/**` are stale). Routing is **feature-override → category preset → default preset**; **jobs are dead** (they survive only as recommendation tags); the **Fast/Balanced/Best dial is gone**. This doc (1) determines the correct **LLM-work** categories — not the nav groups — and (2) ships paste-ready `seed.py` code + the three small wiring edits to make them route.*

---

## 1. The mechanism (from code, so the seed is correct)

- **`EnginePreset`** (`db.engine_presets` + `engine_preset_switches` + `engine_preset_samplers`) = the source of truth for what runs, combined with a feature's prompt. Cols: `id, name, provider_id, model, temperature(nullable), top_p(nullable), max_tokens, json_mode, reasoning_effort, ngl_override, n_cpu_moe_override, position, built_in`.
- **Resolution** (`preset_resolve.resolve_feature_preset(action, category)`): per-action `FeaturePresetRef` → the action's `CategoryPreset` → the global default. Called at `prompts.py` as `resolve_feature_preset(action, category_of(feature))`, where **`category_of` currently returns the NAV category** (`install.py _category_of` → `FeatureCatalogEntry.category`).
- **THE OVERLAY RULE** (`prompts.py _effective_spec`) — decisive for the seed:
  > `temperature = preset.temperature if not None else feature.temperature` · `json_mode = preset.jsonMode` · `top_p = preset.topP` · `think = bool(preset.reasoningEffort)` · `max_tokens = preset.maxTokens or feature.max_tokens`.
  So when a preset is assigned, **the preset wins on `json_mode`/`top_p`/`think`; the feature's `temperature` is used only if the preset leaves it null.** Long-tail samplers merge separately in `_plane2_extra` (priority: request → `feature_sampler_params` → preset).
- **B3 guardrail** (`_effective_think`): `think` is forced off whenever `json_mode` is on — every JSON preset is automatically think-safe.
- **`seed_llm` seeds NO engine presets and NO category assignments.** That's the gap.

Two design rules fall out of the overlay:
- **A · Features sharing a preset must share `json_mode`.** (A JSON feature can't inherit a prose preset.) This is *why* `recap` (JSON) leaves its nav-mate `briefing` (prose) and joins the extraction preset — by its LLM work, not its nav group.
- **B · Presets set `temperature = null`; per-action temps stay on `FeaturePrompt`.** Otherwise a shared preset would flatten critique 0.4 / critiqueStructure 0.2 to one value. The preset owns model + top_p + json_mode + reasoning + samplers; temperature stays per-action (where it already lives).

---

## 2. Why the nav category is the wrong routing key

`writerAI` (nav "Writing") spans *generate new voiced prose* (Continue/Expand/Describe) **and** *faithful editing* (Rewrite/Tighten/line-edits) — different presets. "Whole book" fragments into extraction (reverseOutline/beatSheet/foreshadowing/readerKnowledge) + judgment (plotHoles/voiceDrift) + publishing-JSON (marketingPack). "Chat" splits into grounded-RAG vs in-voice. "Home" `recap` is JSON-shaped so it belongs with extraction; `briefing` is prose. The nav is UX; routing must key on the LLM **work**.

---

## 3. The correct LLM-work categories → presets

9 work-categories → 8 presets (the two chat categories share one). `json_mode` is homogeneous within every preset (rule A).

| Preset id | Categories it serves | Actions | model (floor default) | top_p | json | long-tail samplers |
|---|---|---|---|---|---|---|
| `p_prose_voiced` | `prose.generate` | `writerAI.continue/expand/describe/guided-continue` | `qwen3.6-35b-a3b-mtp` *(fast alt `qwen3.5-9b-q4_k_m`)* | 0.95 | off | `min_p=0.05, xtc_probability=0.3, xtc_threshold=0.1, dry_multiplier=0.8` |
| `p_ideation` | `ideation` | `brainstorm, brainstormPlot` | `qwen3.5-9b-q4_k_m` | 0.95 | off | `min_p=0.06, xtc_probability=0.5, xtc_threshold=0.1, dry_multiplier=0.8` |
| `p_prose_edit` | `prose.edit` | `writerAI.rewrite/tighten`, all `writerAI.rule.*` | `qwen3.5-9b-q4_k_m` *(alt `qwen3-14b-q4_k_m`)* | 0.90 | off | `min_p=0.08` |
| `p_chat` | `chat.grounded`, `chat.inVoice` | `chat, characterChat` | `qwen3.5-9b-q4_k_m` | 0.90 | off | `min_p=0.05, repeat_penalty=1.05, repeat_last_n=64` |
| `p_creative_structured` | `creative.structured` | `sensory, marketingPack, unstuck` | `qwen3.6-35b-a3b-mtp` | 0.95 | **on** | `min_p=0.05, xtc_probability=0.4` |
| `p_extract` | `extract.structured` | `entitySweep, reverseOutline, beatSheet, readerKnowledge, characterAudit, relationshipArc, foreshadowing, recap` | `qwen3.6-35b-a3b-mtp` *(alt `mistral-small-3.2-24b-q4_k_m`)* | 0.90 | **on** | `min_p=0, seed=7` |
| `p_judge` | `judge.scored` | `critique, critiqueStructure, multiReaderGenre/Literary/Agent/BookClub, plotHoles, voiceDrift` | `qwen3.6-35b-a3b-mtp` *(alt `qwen3.6-27b-mtp-q4_k_m`)* | 0.95 | **on** | `min_p=0.05, seed=7` |
| `p_digest` | `summary.grounded` | `briefing` | `qwen3.5-9b-q4_k_m` | 0.90 | off | `min_p=0.05` |

Floor logic (your 8 GB VRAM + 32 GB RAM): interactive/light work → `qwen3.5-9b-q4_k_m` (fast); quality/batch → `qwen3.6-35b-a3b-mtp` (6 GB VRAM + 32 GB RAM via `--n-cpu-moe`, ~32B-class). Every preset leaves `temperature=null`; per-action temps in §4.2. `switches=[]` → the base/moe/mtp type-presets resolve automatically. Placement note worth keeping in a comment: **`recap` sits on `p_extract` because its LLM work is "emit faithful structured JSON," which matches extraction — the clearest example of work-category ≠ nav-category.**

---

## 4. Paste-ready code

### 4.1 Shared plumbing (three files)

**`just-llm-runner/llm_runner/llm/seed.py`** — extend the per-app registry, add two seeders, wire `seed_llm`.

```python
# --- top: extend the per-app registry ---
_APP: dict = {"feature_catalog": [], "feature_jobs": [], "feature_prompts": {},
              "engine_presets": [], "category_presets": [], "feature_llm_categories": {}}

def configure_app_seed(*, feature_catalog=None, feature_jobs=None, feature_prompts=None,
                       engine_presets=None, category_presets=None, feature_llm_categories=None) -> None:
    if feature_catalog is not None: _APP["feature_catalog"] = list(feature_catalog)
    if feature_jobs is not None: _APP["feature_jobs"] = list(feature_jobs)
    if feature_prompts is not None: _APP["feature_prompts"] = dict(feature_prompts)
    if engine_presets is not None: _APP["engine_presets"] = list(engine_presets)
    if category_presets is not None: _APP["category_presets"] = list(category_presets)
    if feature_llm_categories is not None: _APP["feature_llm_categories"] = dict(feature_llm_categories)

def app_engine_presets() -> list[dict]: return _APP["engine_presets"]
def app_category_presets() -> list[dict]: return _APP["category_presets"]
def app_feature_llm_categories() -> dict: return _APP["feature_llm_categories"]


# --- seeders (model them on seed_default_switch_presets: flush parent before FK children) ---
def seed_default_engine_presets(s) -> int:
    existing = {r.id for r in s.query(db.EnginePreset.id).all()}
    added = 0
    for p in app_engine_presets():
        if p["id"] in existing:
            continue
        s.add(db.EnginePreset(
            id=p["id"], name=str(p.get("name") or ""), provider_id=str(p.get("provider_id") or ""),
            model=str(p.get("model") or ""), temperature=p.get("temperature"), top_p=p.get("top_p"),
            max_tokens=int(p.get("max_tokens") or 0), json_mode=bool(p.get("json_mode") or False),
            reasoning_effort=str(p.get("reasoning_effort") or ""),
            ngl_override=p.get("ngl_override"), n_cpu_moe_override=p.get("n_cpu_moe_override"),
            position=int(p.get("position") or 0), built_in=True))
        s.flush()  # parent in the DB before its FK children (autoflush off + FK on)
        for fname, fval in (p.get("switches") or {}).items():
            s.add(db.EnginePresetSwitch(preset_id=p["id"], flag_name=fname, flag_value=str(fval)))
        for pname, pval in (p.get("samplers") or {}).items():
            s.add(db.EnginePresetSampler(preset_id=p["id"], param_name=pname, value=str(pval)))
        added += 1
    return added

def seed_default_category_presets(s) -> int:
    existing = {r.category for r in s.query(db.CategoryPreset.category).all()}
    valid = {p["id"] for p in app_engine_presets()} | {r.id for r in s.query(db.EnginePreset.id).all()}
    added = 0
    for c in app_category_presets():
        if c["category"] in existing or c["preset_id"] not in valid:  # FK-safe
            continue
        s.add(db.CategoryPreset(category=c["category"], preset_id=c["preset_id"]))
        added += 1
    return added

# --- in seed_llm(), after seed_default_switch_presets(s): ---
    seed_default_engine_presets(s)
    seed_default_category_presets(s)
```

**`just-llm-runner/llm_runner/llm/install.py`** — accept the new per-app inputs; make `_category_of` return the WORK category.

```python
def install_llm(app, *, engine, session_factory, feature_catalog, feature_jobs, feature_prompts,
                engine_presets=None, category_presets=None, feature_llm_categories=None,
                prefer_local_features=None, runner_catalog=True):
    ...
    seed.configure_app_seed(
        feature_catalog=feature_catalog, feature_jobs=feature_jobs, feature_prompts=feature_prompts,
        engine_presets=engine_presets, category_presets=category_presets,
        feature_llm_categories=feature_llm_categories,
    )
    ...
    def _category_of(key: str) -> str:
        """action id (or feature key) -> its LLM-WORK category; falls back to nav category."""
        work = seed.app_feature_llm_categories()
        if key in work:
            return work[key]
        if key.startswith("writerAI.rule."):   # every line-edit rule is prose.edit
            return "prose.edit"
        for e in seed.app_feature_catalog():    # nav-category fallback (feature-keyed)
            if getattr(e, "key", "") == key:
                return getattr(e, "category", "") or ""
        return ""
```

**`just-llm-runner/llm_runner/llm/prompts.py`** — try the ACTION's work-category first (so the `writerAI` split resolves without per-action refs).

```python
def _resolve_preset(action: str, feature: str, category_of):
    if category_of is None:
        return None
    cat = category_of(action) or category_of(feature)   # action work-cat, then feature (nav) fallback
    return resolve_feature_preset(action, cat or "")
```

### 4.2 JW host data — a new `justwrite-app/server/justwrite_server/seed_presets.py`

```python
"""Engine presets + category assignments + the feature->LLM-work-category map.
Passed to install_llm (see app.py). The nav category on FeatureCatalogEntry is for
the UI; ROUTING keys on FEATURE_LLM_CATEGORIES (LLM work, not nav group)."""

# Presets leave temperature=None on purpose: the per-action FeaturePrompt.temperature
# owns it (preset-wins overlay would otherwise flatten per-action temps). switches=[]
# -> base/moe/mtp type-presets resolve automatically. samplers/values are strings.
DEFAULT_ENGINE_PRESETS: list[dict] = [
    {"id": "p_prose_voiced", "name": "Creative prose (voiced)", "provider_id": "local-llamacpp",
     "model": "qwen3.6-35b-a3b-mtp", "temperature": None, "top_p": 0.95, "json_mode": False, "position": 0,
     "samplers": {"min_p": "0.05", "xtc_probability": "0.3", "xtc_threshold": "0.1", "dry_multiplier": "0.8"}},
    {"id": "p_ideation", "name": "Ideation", "provider_id": "local-llamacpp",
     "model": "qwen3.5-9b-q4_k_m", "temperature": None, "top_p": 0.95, "json_mode": False, "position": 1,
     "samplers": {"min_p": "0.06", "xtc_probability": "0.5", "xtc_threshold": "0.1", "dry_multiplier": "0.8"}},
    {"id": "p_prose_edit", "name": "Prose editing", "provider_id": "local-llamacpp",
     "model": "qwen3.5-9b-q4_k_m", "temperature": None, "top_p": 0.90, "json_mode": False, "position": 2,
     "samplers": {"min_p": "0.08"}},
    {"id": "p_chat", "name": "Interactive chat", "provider_id": "local-llamacpp",
     "model": "qwen3.5-9b-q4_k_m", "temperature": None, "top_p": 0.90, "json_mode": False, "position": 3,
     "samplers": {"min_p": "0.05", "repeat_penalty": "1.05", "repeat_last_n": "64"}},
    {"id": "p_creative_structured", "name": "Structured creative", "provider_id": "local-llamacpp",
     "model": "qwen3.6-35b-a3b-mtp", "temperature": None, "top_p": 0.95, "json_mode": True, "position": 4,
     "samplers": {"min_p": "0.05", "xtc_probability": "0.4"}},
    {"id": "p_extract", "name": "Structured extraction", "provider_id": "local-llamacpp",
     "model": "qwen3.6-35b-a3b-mtp", "temperature": None, "top_p": 0.90, "json_mode": True, "position": 5,
     "samplers": {"min_p": "0", "seed": "7"}},
    {"id": "p_judge", "name": "Judgment / scoring", "provider_id": "local-llamacpp",
     "model": "qwen3.6-35b-a3b-mtp", "temperature": None, "top_p": 0.95, "json_mode": True, "position": 6,
     "samplers": {"min_p": "0.05", "seed": "7"}},
    {"id": "p_digest", "name": "Grounded digest", "provider_id": "local-llamacpp",
     "model": "qwen3.5-9b-q4_k_m", "temperature": None, "top_p": 0.90, "json_mode": False, "position": 7,
     "samplers": {"min_p": "0.05"}},
]

DEFAULT_CATEGORY_PRESETS: list[dict] = [
    {"category": "prose.generate",      "preset_id": "p_prose_voiced"},
    {"category": "ideation",            "preset_id": "p_ideation"},
    {"category": "prose.edit",          "preset_id": "p_prose_edit"},
    {"category": "chat.grounded",       "preset_id": "p_chat"},
    {"category": "chat.inVoice",        "preset_id": "p_chat"},
    {"category": "creative.structured", "preset_id": "p_creative_structured"},
    {"category": "extract.structured",  "preset_id": "p_extract"},
    {"category": "judge.scored",        "preset_id": "p_judge"},
    {"category": "summary.grounded",    "preset_id": "p_digest"},
]

# action id -> LLM-work category. writerAI splits here; every writerAI.rule.* also
# falls to prose.edit via the install.py prefix rule (listed ones are explicit).
FEATURE_LLM_CATEGORIES: dict[str, str] = {
    "writerAI.continue": "prose.generate", "writerAI.expand": "prose.generate",
    "writerAI.describe": "prose.generate", "writerAI.guided-continue": "prose.generate",
    "writerAI.rewrite": "prose.edit", "writerAI.tighten": "prose.edit",
    "writerAI.rule.show-dont-tell": "prose.edit", "writerAI.rule.passive-voice": "prose.edit",
    "writerAI.rule.filter-words": "prose.edit", "writerAI.rule.dialogue-tags": "prose.edit",
    "brainstorm": "ideation", "brainstormPlot": "ideation",
    "sensory": "creative.structured", "marketingPack": "creative.structured", "unstuck": "creative.structured",
    "entitySweep": "extract.structured", "reverseOutline": "extract.structured",
    "beatSheet": "extract.structured", "readerKnowledge": "extract.structured",
    "characterAudit": "extract.structured", "relationshipArc": "extract.structured",
    "foreshadowing": "extract.structured", "recap": "extract.structured",
    "critique": "judge.scored", "critiqueStructure": "judge.scored",
    "multiReaderGenre": "judge.scored", "multiReaderLiterary": "judge.scored",
    "multiReaderAgent": "judge.scored", "multiReaderBookClub": "judge.scored",
    "plotHoles": "judge.scored", "voiceDrift": "judge.scored",
    "chat": "chat.grounded", "characterChat": "chat.inVoice",
    "briefing": "summary.grounded",
}
```

Then in **`justwrite-app/server/justwrite_server/app.py`** (or wherever `install_llm(...)` is called), pass them:

```python
from .seed_presets import DEFAULT_ENGINE_PRESETS, DEFAULT_CATEGORY_PRESETS, FEATURE_LLM_CATEGORIES
install_llm(app, engine=..., session_factory=..., feature_catalog=FEATURE_CATALOG,
            feature_jobs=DEFAULT_FEATURE_JOBS, feature_prompts=FEATURE_PROMPTS,
            engine_presets=DEFAULT_ENGINE_PRESETS, category_presets=DEFAULT_CATEGORY_PRESETS,
            feature_llm_categories=FEATURE_LLM_CATEGORIES)
```

### 4.3 Per-action `FeaturePrompt` edits (in `seed_feature_prompts.py`)

Set **temperature** per action (presets are temp-null, so these govern). Set **`json_mode=True`** on the JSON actions too — belt-and-suspenders that also protects the legacy path if a preset is ever unassigned.

| action(s) | temperature | json_mode |
|---|---|---|
| `writerAI.continue/expand/describe/guided-continue` | 0.85 | false |
| `writerAI.rewrite` | 0.70 | false |
| `writerAI.tighten` | 0.50 | false |
| `writerAI.rule.*` | 0.60 | false |
| `brainstorm`, `brainstormPlot` | 1.00 | false |
| `unstuck` | 0.75 | **true** |
| `sensory` | 0.80 | **true** |
| `marketingPack` | 0.50 | **true** |
| `briefing` | 0.45 | false |
| `recap` | 0.20 | **true** |
| `entitySweep` | 0.15 | **true** |
| `reverseOutline`,`beatSheet`,`readerKnowledge`,`characterAudit`,`relationshipArc`,`foreshadowing` | 0.15 | **true** |
| `critique` | 0.40 | **true** |
| `critiqueStructure` | 0.20 | **true** |
| `multiReaderGenre/Literary/Agent/BookClub` | 0.55 | **true** |
| `plotHoles` | 0.30 | **true** |
| `voiceDrift` | 0.40 | **true** |
| `chat` | 0.30 | false |
| `characterChat` | 0.70 | false |

Then, for every JSON action, **upgrade `response_format` from `json_object` to a strict FLAT `json_schema`** (fields + integer ranges + enums; deep schemas break constrained decode) and delete the "Return ONLY the JSON object, no markdown fences" prompt tails — the schema enforces it. (`p_extract`/`p_creative_structured`/`p_judge` set `json_mode`, so `think` is already forced off by B3.)

---

## 5. Tests + verification
- `test_seed.py`: assert `seed_default_engine_presets` creates 8 rows + their sampler children; `seed_default_category_presets` creates 9; every `CategoryPreset.preset_id` FK resolves.
- `test_presets.py` / `test_prompts.py`: for a sample action per category, assert `resolve_feature_preset(action, category_of(action))` returns the expected preset id; assert `writerAI.continue → p_prose_voiced` and `writerAI.tighten → p_prose_edit` (the split).
- **Invariant test:** for every action, the resolved preset's `json_mode` matches the action's intended shape, and no resolved (preset-overlaid) spec has `think=True` while `json_mode=True`.
- `ruff` + full pytest + `node scripts/headless-smoke.mjs` (the AI sub-tabs + preset assignment probes).
- **Empirical (not from this doc):** these temps/samplers are *starting defaults*. Settle per-machine in the Lab tok/s tuner (#20); for prose/judgment quality run EQ-Bench `creative-writing-bench` against a *hosted* copy of the resolved model with a cloud judge (~$3, no GPU).

---

## 6. Invariants (put in a code comment)
- **Category = LLM work, not nav.** Routing keys on `FEATURE_LLM_CATEGORIES`; the nav group stays on `FeatureCatalogEntry` for the UI only.
- **A preset's members share `json_mode`** (overlay rule) — never mix prose + JSON features under one preset. `recap` lives with extraction for this reason.
- **Presets set `temperature=null`; per-action temps live on `FeaturePrompt`** (else a shared preset flattens them).
- **JSON ⇒ no think** (B3 forces it). Flat schemas only; bound integer ranges + enums.
- **De-slop = XTC, creative prose only** (`p_prose_voiced` 0.3 voiced / `p_ideation` 0.5 / `p_creative_structured` 0.4). Never on edit/chat/extraction/judgment/digest.
- **Repetition: DRY *or* presence_penalty, never both** (stacking triggers Qwen language-mixing). DRY is the family-agnostic default; on Qwen swap to `presence_penalty=1.5` + `top_p=0.8` + `top_k=20` (Lab-doc, not seeded).
- **Determinism = pinned `seed`, not temp-0** (Qwen greedy degrades; the schema bounds shape, the seed bounds variation).
- **Model per preset = floor default + Lab-swappable.** A preset pins one model; the right model is hardware-dependent — the floor default runs for everyone, bigger rigs upgrade in the Lab. (`seed.py` prose recommendations omit `qwen3.6-35b-a3b-mtp`; it's used as the prose/creative default here — reconcile the recommendation list if you want them consistent.)
