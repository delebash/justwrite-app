"""Engine presets + taskKind→preset assignments + the action→taskKind map.

Passed to `install_llm` (see app.py). ROUTING keys on the LLM-WORK **taskKind**
(FEATURE_TASK_KINDS), NOT the nav group on FeatureCatalogEntry (which is display-only,
for the UI). The cascade at dispatch is: a feature's own preset override
(FeaturePresetRef) → its taskKind's preset (TaskKindPreset) → the global default.

Design invariants (2026-07-01 taskKind-routing plan; grounded in the overlay rule
`prompts._effective_spec`):
  • taskKind = LLM work, not nav group. `writerAI.continue` (prose.generate) and
    `writerAI.tighten` (prose.edit) route to DIFFERENT presets even though they share
    the "Writing" nav group — the split is the whole point of keying on taskKind.
  • A preset's members share `json_mode` (the overlay makes `json_mode = preset.jsonMode`),
    so a JSON action can't inherit a prose preset. `recap` therefore lives with
    extraction (`p_extract`), not with its Home nav-mate `briefing` (prose) — its LLM
    work is "emit faithful structured JSON," which matches extraction. Clearest example
    of work-category ≠ nav-group.
  • Presets set `temperature=None`; the per-action temperature stays on the
    FeaturePrompt (see seed_feature_prompts.py) — else a shared preset would flatten
    e.g. critique 0.40 / critiqueStructure 0.20 to one value. The preset owns model +
    top_p + json_mode + reasoning + long-tail samplers; temperature stays per-action.
  • JSON ⇒ no think (the B3 guardrail forces `think` off whenever `json_mode` is on).
  • switches=[] → the base/moe/mtp type switch-presets resolve automatically at load;
    the two hardware-fit knobs (-ngl / --n-cpu-moe) auto-compute unless overridden.

Model per preset = a floor default that runs for everyone (8 GB VRAM + 32 GB RAM);
bigger rigs swap the model in the Lab. Sampler values are strings (they ride the
per-call `extra`). See docs/plans/2026-07-01-llm-work-categories-presets-implementation.md
(operative spec, §4.2/§4.3) + just-llm-runner/docs/plans/2026-07-01-taskkind-routing.md.
"""

from __future__ import annotations

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

# taskKind → preset assignment (the routing default; the `TaskKindPreset` bulk handle).
# The two chat taskKinds share one preset. Every taskKind maps to exactly one preset.
DEFAULT_TASKKIND_PRESETS: list[dict] = [
    {"task_kind": "prose.generate",      "preset_id": "p_prose_voiced"},
    {"task_kind": "ideation",            "preset_id": "p_ideation"},
    {"task_kind": "prose.edit",          "preset_id": "p_prose_edit"},
    {"task_kind": "chat.grounded",       "preset_id": "p_chat"},
    {"task_kind": "chat.inVoice",        "preset_id": "p_chat"},
    {"task_kind": "creative.structured", "preset_id": "p_creative_structured"},
    {"task_kind": "extract.structured",  "preset_id": "p_extract"},
    {"task_kind": "judge.scored",        "preset_id": "p_judge"},
    {"task_kind": "summary.grounded",    "preset_id": "p_digest"},
]

# action id → LLM-work taskKind. writerAI splits here; every writerAI.rule.* also
# falls to prose.edit via the install.py prefix rule (the listed ones are explicit).
FEATURE_TASK_KINDS: dict[str, str] = {
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
