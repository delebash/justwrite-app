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

# ONE launch profile (2026-07-06 one-profile lock — executed by the model-per-hardware
# plan, just-llm-runner/docs/plans/2026-07-06-model-per-hardware-plan.md Phase 1): a
# single Gemma catalog row + launch config serves every task. Measured basis (on-box
# A/B, docs/plans/2026-07-06-onbox-profile-ab-test.md RESULTS): the 32k/rb-1024 config
# with per-request thinking OFF serves writer traffic at writer speed (TTFT 1.52 s vs
# the dedicated 8k writer section's 1.68 s, cache-busted), so the writer-vs-chat
# difference lives at the REQUEST layer — feature_prompts.think per action (dispatch
# sends chat_template_kwargs.enable_thinking both ways to the builtin runner) — not in
# separate launch identities. reasoning-budget 1024 rides the runner's BASE switch
# bundle (the universal anti-loop cap), no longer a per-model tune. One GGUF on disk;
# the router keeps the chat model + the embed resident (models-max 2). QuickSetup
# re-picks for other boxes and writes onto every task preset (D4-1 protection: Phase 2).
DEFAULT_ENGINE_PRESETS: list[dict] = [
    {"id": "p_prose_voiced", "name": "Creative prose (voiced)", "provider_id": "local-llamacpp",
     "model": "gemma-4-26b-a4b-qat", "temperature": None, "top_p": 0.95, "json_mode": False, "position": 0,
     "samplers": {"min_p": "0.05", "xtc_probability": "0.3", "xtc_threshold": "0.1", "dry_multiplier": "0.8"}},
    {"id": "p_ideation", "name": "Ideation", "provider_id": "local-llamacpp",
     "model": "gemma-4-26b-a4b-qat", "temperature": None, "top_p": 0.95, "json_mode": False, "position": 1,
     "samplers": {"min_p": "0.06", "xtc_probability": "0.5", "xtc_threshold": "0.1", "dry_multiplier": "0.8"}},
    {"id": "p_prose_edit", "name": "Prose editing", "provider_id": "local-llamacpp",
     "model": "gemma-4-26b-a4b-qat", "temperature": None, "top_p": 0.90, "json_mode": False, "position": 2,
     "samplers": {"min_p": "0.08"}},
    {"id": "p_chat", "name": "Interactive chat", "provider_id": "local-llamacpp",
     "model": "gemma-4-26b-a4b-qat", "temperature": None, "top_p": 0.90, "json_mode": False, "position": 3,
     "samplers": {"min_p": "0.05", "repeat_penalty": "1.05", "repeat_last_n": "64"}},
    {"id": "p_creative_structured", "name": "Structured creative", "provider_id": "local-llamacpp",
     "model": "gemma-4-26b-a4b-qat", "temperature": None, "top_p": 0.95, "json_mode": True, "position": 4,
     "samplers": {"min_p": "0.05", "xtc_probability": "0.4"}},
    {"id": "p_extract", "name": "Structured extraction", "provider_id": "local-llamacpp",
     "model": "gemma-4-26b-a4b-qat", "temperature": None, "top_p": 0.90, "json_mode": True, "position": 5,
     "samplers": {"min_p": "0", "seed": "7"}},
    {"id": "p_judge", "name": "Judgment / scoring", "provider_id": "local-llamacpp",
     "model": "gemma-4-26b-a4b-qat", "temperature": None, "top_p": 0.95, "json_mode": True, "position": 6,
     "samplers": {"min_p": "0.05", "seed": "7"}},
    {"id": "p_digest", "name": "Grounded digest", "provider_id": "local-llamacpp",
     "model": "gemma-4-26b-a4b-qat", "temperature": None, "top_p": 0.90, "json_mode": False, "position": 7,
     "samplers": {"min_p": "0.05"}},
]

# ── JW's extra model-catalog row + this box's tune seed (install_llm inputs) ──
# ONE Gemma row (the 2026-07-06 consolidation; the former writing-assistant/book-chat
# id pair is gone — per-task think flags replaced the split). Facts from the GGUF
# header (30 layers, 128 experts/8 active, trained ctx 262144); min_vram reflects the
# CPU-expert-offload floor.
# License provenance (plan amendment A4): Gemma 4 is Apache-2.0 — verified via the HF
# API 2026-07-06 on GOOGLE'S OWN repos (api/models/google/gemma-4-26B-A4B-it and
# api/models/google/gemma-4-26B-A4B-it-qat-q4_0-unquantized — the GGUF's declared
# base_model — both license:apache-2.0) AND on the repackager
# (api/models/unsloth/gemma-4-26B-A4B-it-qat-GGUF). Google moved Gemma to Apache-2.0
# at Gemma 4; EARLIER Gemma generations remain Gemma-Terms (use-limited) — the
# seed-time license keyword gate in llm_runner/llm/seed.py stays intact for those.
# quality_rank 5 (2026-07-06 lineup decision): the owner-tested writing best on the
# target hardware — the curated-for-writing order's top; instrument evidence still
# pending a Lab A/B (ledger C9).
DEFAULT_MODEL_CATALOG_EXTRA: list[dict] = [
    {"id": "gemma-4-26b-a4b-qat", "name": "Gemma 4 26B-A4B (QAT)",
     "hf_repo": "unsloth/gemma-4-26B-A4B-it-qat-GGUF", "quant": "UD-Q4_K_XL",
     "total_params": "26B", "active_params": "4B", "mtp": True, "type": "moe",
     "mtp_draft_file": "MTP/gemma-4-26B-A4B-it-Q4_0-MTP.gguf", "mtp_draft_quant": "Q4_0",
     "trained_ctx": 262144, "min_vram_mb": 4000, "min_ram_mb": 24000,
     "tier": "low-vram-moe", "license": "Apache-2.0", "quality_rank": 5, "position": 20,
     "description": "Gemma 4 26B-A4B QAT MoE with an MTP draft — one config serves writing AND "
                    "research/chat: 32k context, thinking toggled per task at request time, reasoning "
                    "capped engine-side. Measured on the 8 GB floor: writer TTFT 1.5-1.7 s at ~31 t/s; "
                    "8k-corpus chat TTFT 15 s, prefill 551 t/s sustained to 28k."},
]

# TUNE ROWS ARE NOT SEEDED (user decision 2026-07-06: "i agree it should not be a
# defualt seed for everyone"). Tunes are MEASUREMENTS, owned by each (model, machine)
# pair — the wizard's auto-sweep or a Tune-modal Save writes them. The former dev rows
# (the author box's gemma values + the CPU-embed row) live in
# just-llm-runner/scripts/dev-seed-tunes.py — run it on the author's box after a reset
# to restore them (the server keys the PUT to the machine that runs it). Discovery that
# forced this: the old seeder stamped the rows with WHATEVER machine ran the seeding,
# so "inert on other boxes" was false — an 8 GB tune would have applied on a 24 GB card.
# The user's sweep-parity test (quick-tune vs the hand-tune, their box) decides whether
# hardware-class starting values ever return — with evidence either way.

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
