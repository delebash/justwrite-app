"""Engine presets + taskKind→preset assignments + the action→taskKind map.

Passed to `install_llm` (see app.py). ROUTING keys on the LLM-WORK **taskKind**
(FEATURE_TASK_KINDS), NOT the nav group on FeatureCatalogEntry (which is display-only,
for the UI). The cascade at dispatch is (2026-07-02 "task owns the preset"): its
taskKind's preset (TaskKindPreset) → the global default (TaskKindPreset[""]).

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
  • Sampler grounding (verified 2026-07-02 vs the knob catalog + the sampler-guide
    principles): every sampler key below is a real `knob_catalog` plane-2 key (min_p,
    xtc_probability, xtc_threshold, dry_multiplier, repeat_penalty, repeat_last_n, seed),
    and the values obey the three principles — XTC ONLY on the creative presets
    (p_prose_voiced / p_ideation / p_creative_structured); DRY *or* a repeat penalty,
    never stacked; a pinned `seed` on the deterministic JSON tasks (p_extract / p_judge).
    These are GROUNDED STARTING defaults, not tuned finals — the Tasks page (Lab) is
    where each is Run against a member feature and settled (shown there as provenance).

Model per preset = a floor default that runs for everyone (8 GB VRAM + 32 GB RAM);
bigger rigs swap the model in the Lab. Sampler values are strings (they ride the
per-call `extra`). See docs/plans/2026-07-01-llm-work-categories-presets-implementation.md
(operative spec, §4.2/§4.3) + just-llm-runner/docs/plans/2026-07-01-taskkind-routing.md.
"""

from __future__ import annotations

# Model split (2026-07-06 llamacpp tuning session — the measured record is
# docs/plans/2026-07-06-llamacpp-config-tuning-2070s.md): TWO launch configs of the
# SAME Gemma 4 26B-A4B GGUF, mirroring the user's proven hand-router sections —
# creative tasks run the low-latency writer config (ctx 8192, thinking OFF: TTFT
# 1.7 s / autocomplete 0.9 s measured), grounded/analytical tasks run the research
# config (ctx 32768, reasoning-budget 1024 as the anti-loop safety cap: 8k-corpus
# TTFT 15 s, pp 551 t/s at 28k). One GGUF on disk — the HF snapshot is shared, the
# router keeps at most one child + the embed resident (models-max 2). QuickSetup
# re-picks for other boxes and writes onto every task preset as before.
DEFAULT_ENGINE_PRESETS: list[dict] = [
    {"id": "p_prose_voiced", "name": "Creative prose (voiced)", "provider_id": "local-llamacpp",
     "model": "writing-assistant-gemma-moe-mtp", "temperature": None, "top_p": 0.95, "json_mode": False, "position": 0,
     "samplers": {"min_p": "0.05", "xtc_probability": "0.3", "xtc_threshold": "0.1", "dry_multiplier": "0.8"}},
    {"id": "p_ideation", "name": "Ideation", "provider_id": "local-llamacpp",
     "model": "writing-assistant-gemma-moe-mtp", "temperature": None, "top_p": 0.95, "json_mode": False, "position": 1,
     "samplers": {"min_p": "0.06", "xtc_probability": "0.5", "xtc_threshold": "0.1", "dry_multiplier": "0.8"}},
    {"id": "p_prose_edit", "name": "Prose editing", "provider_id": "local-llamacpp",
     "model": "writing-assistant-gemma-moe-mtp", "temperature": None, "top_p": 0.90, "json_mode": False, "position": 2,
     "samplers": {"min_p": "0.08"}},
    {"id": "p_chat", "name": "Interactive chat", "provider_id": "local-llamacpp",
     "model": "book-chat-gemma-moe-mtp", "temperature": None, "top_p": 0.90, "json_mode": False, "position": 3,
     "samplers": {"min_p": "0.05", "repeat_penalty": "1.05", "repeat_last_n": "64"}},
    {"id": "p_creative_structured", "name": "Structured creative", "provider_id": "local-llamacpp",
     "model": "writing-assistant-gemma-moe-mtp", "temperature": None, "top_p": 0.95, "json_mode": True, "position": 4,
     "samplers": {"min_p": "0.05", "xtc_probability": "0.4"}},
    {"id": "p_extract", "name": "Structured extraction", "provider_id": "local-llamacpp",
     "model": "book-chat-gemma-moe-mtp", "temperature": None, "top_p": 0.90, "json_mode": True, "position": 5,
     "samplers": {"min_p": "0", "seed": "7"}},
    {"id": "p_judge", "name": "Judgment / scoring", "provider_id": "local-llamacpp",
     "model": "book-chat-gemma-moe-mtp", "temperature": None, "top_p": 0.95, "json_mode": True, "position": 6,
     "samplers": {"min_p": "0.05", "seed": "7"}},
    {"id": "p_digest", "name": "Grounded digest", "provider_id": "local-llamacpp",
     "model": "book-chat-gemma-moe-mtp", "temperature": None, "top_p": 0.90, "json_mode": False, "position": 7,
     "samplers": {"min_p": "0.05"}},
]

# ── JW's extra model-catalog rows + this box's tune seed (install_llm inputs) ──
# The two Gemma launch configs above as catalog entries: SAME GGUF + MTP draft
# (one download), different launch tunes. Ids deliberately equal the hand
# `models.ini` section names so the router model ids stay continuous with the
# user's manual setup. Facts from the GGUF header (30 layers, 128 experts/8
# active, trained ctx 262144); min_vram reflects the CPU-expert-offload floor.
DEFAULT_MODEL_CATALOG_EXTRA: list[dict] = [
    {"id": "writing-assistant-gemma-moe-mtp", "name": "Gemma 4 26B-A4B — writing assistant (8k, no think)",
     "hf_repo": "unsloth/gemma-4-26B-A4B-it-qat-GGUF", "quant": "UD-Q4_K_XL",
     "total_params": "26B", "active_params": "4B", "mtp": True, "type": "moe",
     "mtp_draft_file": "MTP/gemma-4-26B-A4B-it-Q4_0-MTP.gguf", "mtp_draft_quant": "Q4_0",
     "trained_ctx": 262144, "min_vram_mb": 4000, "min_ram_mb": 24000,
     "tier": "low-vram-moe", "license": "Gemma", "quality_rank": 9, "position": 20,
     "description": "Gemma 4 26B-A4B QAT MoE, tuned as the low-latency in-editor writer: ctx 8192, "
                    "thinking off, MTP draft. Measured on the 8 GB floor: TTFT 1.7 s, autocomplete 0.9 s, "
                    "~31 t/s (docs/plans/2026-07-06-llamacpp-config-tuning-2070s.md)."},
    {"id": "book-chat-gemma-moe-mtp", "name": "Gemma 4 26B-A4B — book chat / research (32k, thinking)",
     "hf_repo": "unsloth/gemma-4-26B-A4B-it-qat-GGUF", "quant": "UD-Q4_K_XL",
     "total_params": "26B", "active_params": "4B", "mtp": True, "type": "moe",
     "mtp_draft_file": "MTP/gemma-4-26B-A4B-it-Q4_0-MTP.gguf", "mtp_draft_quant": "Q4_0",
     "trained_ctx": 262144, "min_vram_mb": 4000, "min_ram_mb": 24000,
     "tier": "low-vram-moe", "license": "Gemma", "quality_rank": 9, "position": 21,
     "description": "Gemma 4 26B-A4B QAT MoE, tuned for grounded research over big context: ctx 32768, "
                    "reasoning-budget 1024 (anti-loop safety cap), MTP draft. Measured: 8k-corpus TTFT 15 s, "
                    "prefill 551 t/s sustained to 28k (docs/plans/2026-07-06-llamacpp-config-tuning-2070s.md)."},
]

# This box's measured starting tunes (per-(model, machine); insert-if-missing so a
# Quick-tune Save is never clobbered, but a dev-DB reset re-creates the known-good
# values). ncmoe floors were measured WITH the CPU embed co-resident; batch/ubatch
# 512/512 was the TTFT winner (64/32 was 8.6x slower); spec_type/spec_n_max ride
# the auto-MTP switch preset — deliberately NOT duplicated here.
DEFAULT_MODEL_TUNES: list[dict] = [
    {"model_id": "writing-assistant-gemma-moe-mtp",
     "flags": {"n_gpu_layers": "99", "n_cpu_moe": "20", "ctx_len": "8192",
               "batch_size": "512", "ubatch_size": "512", "threads": "8",
               "reasoning_budget": "0"}},
    {"model_id": "book-chat-gemma-moe-mtp",
     "flags": {"n_gpu_layers": "99", "n_cpu_moe": "21", "ctx_len": "32768",
               "batch_size": "512", "ubatch_size": "512", "threads": "8",
               "reasoning_budget": "1024",
               "reasoning_budget_message": "Taking user constraints into account, I will now output the solution."}},
    # CPU embed: frees 684 MB VRAM for the chat model; query latency unchanged
    # (46 ms), bulk index builds still GPU-assisted at ngl 0 (measured 2026-07-06).
    {"model_id": "qwen3-embedding-0.6b", "flags": {"n_gpu_layers": "0"}},
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
