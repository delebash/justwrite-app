"""Engine presets + the per-ACTION preset refs (the ONE-SOURCE model, 2026-07-15).

Passed to `install_llm` (see app.py). The ACTION is the base; its preset is the truth
— `DEFAULT_FEATURE_PRESETS` maps each action -> its preset id, and `DEFAULT_PRESET_ID`
is the catch-all for an unassigned action. There is NO task tier: an action points
straight at a preset (the shared runner resolves ref -> default at dispatch).

The PRESET owns the model + EVERY tunable — provider/model, temperature, top_p,
max_tokens, samplers, think + reasoning level. The JSON CONTRACT (`json_mode`/
`json_schema`) stays on the ACTION (seed_feature_prompts.py) because the app's parsers
are per-action; presets carry NO json field. NOTHING else stores a tunable.

  • The action is display-shelved under a nav group (FeatureCatalogEntry.group), but
    routing is the action's own ref — `writerAI.continue` -> p_prose_voiced and
    `writerAI.tighten` -> p_prose_edit even though both live under "Writing".
  • Every preset carries ITS OWN temperature (2026-07-15 — presets are the one source;
    no None-temperature abstains any more). Members of a preset run at ITS temperature.
  • Sampler grounding (real `knob_catalog` plane-2 keys: min_p, xtc_*, dry_multiplier,
    repeat_penalty, repeat_last_n, seed): XTC only on the creative presets; DRY *or* a
    repeat penalty, never stacked; a pinned `seed` on the deterministic JSON presets.
  • Reasoning: "Grounded chat" (p_chat) think=on/medium (2026-07-14); all others off.

Model per preset ships EMPTY ("" — QuickSetup/manual fills it, user 2026-07-06); a
bigger rig swaps it in the Lab. Sampler values are strings (they ride the per-call
`extra`). See just-llm-runner/docs/plans/2026-07-15-preset-one-source-rewrite.md.
"""

from __future__ import annotations

# ONE launch profile (2026-07-06 one-profile lock — executed by the model-per-hardware
# plan, just-llm-runner/docs/plans/2026-07-06-model-per-hardware-plan.md Phase 1): a
# single Gemma catalog row + launch config serves every task. Measured basis (on-box
# A/B, docs/plans/2026-07-06-onbox-profile-ab-test.md RESULTS): the 32k/rb-1024 config
# with per-request thinking OFF serves writer traffic at writer speed (TTFT 1.52 s vs
# the dedicated 8k writer section's 1.68 s, cache-busted), so the writer-vs-chat
# difference lives at the REQUEST layer — the task PRESET's think (U2-T3, 2026-07-14:
# moved off feature_prompts.think onto p_chat; dispatch sends chat_template_kwargs.
# enable_thinking both ways to the builtin runner) — not in separate launch identities.
# The Gemma-class reasoning_budget 1024 is the reasoning RESOLVER's per-request CAP now
# (U2-T4: read as DATA, no longer a launch flag). One GGUF on disk; the router keeps the
# chat model + the embed resident (models-max 2). QuickSetup re-picks for other boxes
# and writes onto every task preset (D4-1 protection: Phase 2).
DEFAULT_ENGINE_PRESETS: list[dict] = [
    {"id": "p_prose_voiced", "name": "Generate prose", "name_was": "Creative prose (voiced)", "provider_id": "local-llamacpp",
     "model": "", "temperature": 0.85, "top_p": 0.95, "position": 0,
     "samplers": {"min_p": "0.05", "xtc_probability": "0.3", "xtc_threshold": "0.1", "dry_multiplier": "0.8"}},
    {"id": "p_prose_edit", "name": "Edit prose", "name_was": "Prose editing", "provider_id": "local-llamacpp",
     "model": "", "temperature": 0.6, "top_p": 0.90, "position": 1,
     "samplers": {"min_p": "0.08"}},
    {"id": "p_ideation", "name": "Ideation", "provider_id": "local-llamacpp",
     "model": "", "temperature": 1.0, "top_p": 0.95, "position": 2,
     "samplers": {"min_p": "0.06", "xtc_probability": "0.5", "xtc_threshold": "0.1", "dry_multiplier": "0.8"}},
    # p_chat is the ONE thinking preset: grounded book-chat's reasoning intent lives HERE —
    # think ON with an EMPTY level = FOLLOW (2026-07-16 preset tier, "feature is the end
    # of the line"): the run resolves the thinking budget from the SELECTED MODEL's layers
    # (your applied config → hardware class default → global launch defaults) live, nothing
    # copied — so a fresh box thinks at its class's tested value (1024 on 8 GB), exactly the
    # user's stated expectation. A level here would be the preset's OWN ask (the map's
    # number locally / word on cloud), overriding every layer — seeded empty on purpose;
    # the old "medium" seed would have asked 4096 on every fresh box, 4× the tested value.
    # p_character_chat stays think-off (fast in-voice dialogue).
    {"id": "p_chat", "name": "Grounded chat", "name_was": "Interactive chat", "provider_id": "local-llamacpp",
     "model": "", "temperature": 0.3, "top_p": 0.90, "position": 3,
     "think": True, "reasoning_effort": "",
     "samplers": {"min_p": "0.05", "repeat_penalty": "1.05", "repeat_last_n": "64"}},
    {"id": "p_character_chat", "name": "Character chat", "provider_id": "local-llamacpp",
     "model": "", "temperature": 0.7, "top_p": 0.90, "position": 4,
     "samplers": {"min_p": "0.05", "repeat_penalty": "1.05", "repeat_last_n": "64"}},
    {"id": "p_digest", "name": "Grounded summary", "name_was": "Grounded digest", "provider_id": "local-llamacpp",
     "model": "", "temperature": 0.45, "top_p": 0.90, "position": 5,
     "samplers": {"min_p": "0.05"}},
    {"id": "p_extract", "name": "Structured extraction", "provider_id": "local-llamacpp",
     "model": "", "temperature": 0.15, "top_p": 0.90, "position": 6,
     "samplers": {"min_p": "0", "seed": "7"}},
    {"id": "p_creative_structured", "name": "Structured creative", "provider_id": "local-llamacpp",
     "model": "", "temperature": 0.75, "top_p": 0.95, "position": 7,
     "samplers": {"min_p": "0.05", "xtc_probability": "0.4"}},
    {"id": "p_judge", "name": "Judgment & scoring", "name_was": "Judgment / scoring", "provider_id": "local-llamacpp",
     "model": "", "temperature": 0.3, "top_p": 0.95, "position": 8,
     "samplers": {"min_p": "0.05", "seed": "7"}},
    {"id": "p_reader_panels", "name": "Reader panels", "provider_id": "local-llamacpp",
     "model": "", "temperature": 0.55, "top_p": 0.95, "position": 9,
     "samplers": {"min_p": "0.05", "seed": "7"}},
]

# PRESET MODEL SLOTS SHIP EMPTY (user, 2026-07-06: catalog full, selections empty —
# "no model is automatically set as default … this is all quick setup or manual").
# Every per-task SETTING below still seeds (temps, samplers, json, think); only the
# model choice is the user's/wizard's. Dispatch guards the pre-setup state with a
# run-Quick-Setup message instead of a raw provider error.
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
     "total_params": "26B", "active_params": "4B", "mtp": True, "size_bytes": 14249045120, "size_label": "128x2.6B", "est_vram_mb": 17713, "type": "moe",
     "mtp_draft_file": "MTP/mtp-gemma-4-26B-A4B-it-Q4_0.gguf", "mtp_draft_quant": "Q4_0",
     # samplers = the file's own recommended set (live header read 2026-07-07 — the
     # read-from-link parity item: the seed ships exactly what Read-from-link detects).
     "samplers": {"top_k": "64", "top_p": "0.95", "temperature": "1"},
     "trained_ctx": 262144, "min_vram_mb": 4000, "min_ram_mb": 24000,
     "tier": "low-vram-moe", "license": "Apache-2.0", "quality_rank": 5, "position": 20,
     "architecture": "gemma4", "experts": 128,
     # description = the file-facts compose (the 2026-07-07 decree: Read-from-link owns
     # it); the owner's measured numbers live in `notes` — user-owned, never auto-written.
     "description": "26B mixture-of-experts model · 256k context · MTP draft for faster generation · UD-Q4_K_XL (QAT)",
     "notes": "One config serves writing AND research/chat: 32k launch context, thinking toggled "
              "per task at request time, reasoning capped engine-side. Measured on the 8 GB floor: "
              "writer TTFT 1.5-1.7 s at ~31 t/s; 8k-corpus chat TTFT 15 s, prefill 551 t/s sustained to 28k."},
]

# TUNE ROWS ARE NOT SEEDED (user, 2026-07-06: "i agree it should not be a defualt
# seed for everyone"). Tunes are MEASUREMENTS, owned by each (model, machine) pair —
# they enter through the visible paths (the wizard's optimize sweep, a Tune-modal
# Save) or, on the author's own box, by MANUALLY running
# just-llm-runner/scripts/dev-seed-tunes.py (user: "keep it in seed i can run
# manually" — it never runs automatically; nothing happens behind the scenes). The
# author's measured 8GB/32GB gemma values, for the sweep-parity test: n_gpu_layers 99
# · n_cpu_moe 21 · ctx_len 32768 · batch/ubatch 512/512 · threads 8 (+ the 0.6B embed
# at ngl 0).

# ── the per-ACTION preset refs (action -> preset_id — the ONE source of what an action
# runs) + the catch-all default. writerAI splits here (continue -> Generate prose,
# tighten -> Edit prose); every writerAI.rule.* is listed EXPLICITLY (no prefix magic).
# 37 refs across the 10 presets. ──
DEFAULT_FEATURE_PRESETS: dict[str, str] = {
    # Generate prose
    "writerAI.continue": "p_prose_voiced",
    "writerAI.expand": "p_prose_voiced",
    "writerAI.describe": "p_prose_voiced",
    "writerAI.guided-continue": "p_prose_voiced",
    # Edit prose (rewrite + tighten + the 7 line-edit rules)
    "writerAI.rewrite": "p_prose_edit",
    "writerAI.tighten": "p_prose_edit",
    "writerAI.rule.show-dont-tell": "p_prose_edit",
    "writerAI.rule.passive-voice": "p_prose_edit",
    "writerAI.rule.filter-words": "p_prose_edit",
    "writerAI.rule.dialogue-tags": "p_prose_edit",
    "writerAI.rule.sensory-grounding": "p_prose_edit",
    "writerAI.rule.sentence-variety": "p_prose_edit",
    "writerAI.rule.prose-tightening": "p_prose_edit",
    # Ideation
    "brainstorm": "p_ideation",
    "brainstormPlot": "p_ideation",
    # Grounded chat (the one thinking preset) / Character chat
    "chat": "p_chat",
    "characterChat": "p_character_chat",
    # Grounded summary
    "briefing": "p_digest",
    # Structured extraction
    "entitySweep": "p_extract",
    "reverseOutline": "p_extract",
    "beatSheet": "p_extract",
    "readerKnowledge": "p_extract",
    "characterAudit": "p_extract",
    "relationshipArc": "p_extract",
    "foreshadowing": "p_extract",
    "recap": "p_extract",
    # Structured creative
    "unstuck": "p_creative_structured",
    "sensory": "p_creative_structured",
    "marketingPack": "p_creative_structured",
    # Judgment & scoring
    "plotHoles": "p_judge",
    "critique": "p_judge",
    "voiceDrift": "p_judge",
    "critiqueStructure": "p_judge",
    # Reader panels
    "multiReaderGenre": "p_reader_panels",
    "multiReaderLiterary": "p_reader_panels",
    "multiReaderAgent": "p_reader_panels",
    "multiReaderBookClub": "p_reader_panels",
}

# The catch-all default preset for an action with no ref (custom actions before
# assignment; every seeded action above ships a ref). Plan mint ⚑3: "Edit prose".
DEFAULT_PRESET_ID: str = "p_prose_edit"


# §7.3 Lab test samples (2026-07-08; REAUTHORED per the QC-35 SAMPLE LAW,
# 2026-07-09 — the user's order: "for the sample read the prompt to figure out
# what it is looking for so you create correct sample"). Every row below is
# authored against its action's own prompt contract (the "You will be given:"
# block in seed_feature_prompts.py) and shaped exactly like what that feature's
# COMPOSER sends at a real run. Rows are SYNTHESIZED (never real manuscript
# text). Each blob is authored ONCE below with an `actions` list — the seeder fans
# it to every action that shares the shape (mirrors the renderer's labTestData.js
# LAB_TEST_ACTIONS map). Fill-if-empty per (action, label): a user's edit sticks; NEW
# labels reach existing DBs additively; superseded mis-shaped rows are dropped
# from this list (they linger inert on live DBs — no declaration references
# them — and fresh DBs never get them).
_SAMPLE_CHAPTER_PROSE = (
    "Mira spread the torn page on the cannery desk. The columns were her "
    "father's hand until the ink changed, mid-entry, to a script she had seen "
    "once before — on the harbor-master's warning nailed to the gate the "
    "winter the boats stayed out. She copied the three legible words into her "
    "notebook and locked the page in the drawer with the brass key. Below the "
    "floorboards the tide turned, and somewhere along the quay a door she "
    "could not place clicked shut."
)
_SAMPLE_CHAPTER_PROSE_2 = (
    "Renn waited under the cannery awning while the bell counted the hour. "
    "'You knew before the funeral,' he said when Mira reached him. 'The page "
    "told you.' She did not deny it; she asked instead who else could read "
    "the older script. Renn looked at the water a long time before he "
    "answered, and the answer was a name neither of them had said aloud "
    "since the boats stayed out: Old Harbek."
)

DEFAULT_TEST_SAMPLES: list[dict] = [
    # ── prose.generate (writerAI continue/expand/describe/guided-continue:
    # {{passage}} at selection grain + {{voiceCanon}}; guided-continue adds
    # the typed {{direction}} — the sample provides one) ──
    {"actions": ['writerAI.expand', 'writerAI.continue', 'writerAI.describe', 'writerAI.guided-continue'], "label": "Storm at the lighthouse",
     "variables": {"passage": "The lighthouse keeper counted the storm's breaths between "
                              "each sweep of the lamp. The supply boat's light appeared "
                              "where no boat should be.",
                   "voiceCanon": "Close third person, past tense; spare coastal imagery.",
                   "direction": "Continue the scene as the light draws closer; keep the dread quiet."}},
    {"actions": ['writerAI.expand', 'writerAI.continue', 'writerAI.describe', 'writerAI.guided-continue'], "label": "Guided continuation",
     "variables": {"passage": "The tide had taken the last of the light when Mira reached "
                              "the cannery office. The brass key turned, but the door was "
                              "already unlatched.",
                   "direction": "Continue the scene: someone has been here first; keep it quiet and close.",
                   "voiceCanon": "Close third person, past tense; spare coastal imagery."}},
    # ── prose.edit (writerAI rewrite/tighten + the 7 line-edit rules:
    # {{passage}} + {{voiceCanon}}) ──
    {"actions": ['writerAI.rewrite', 'writerAI.tighten', 'writerAI.rule.show-dont-tell', 'writerAI.rule.passive-voice', 'writerAI.rule.filter-words', 'writerAI.rule.dialogue-tags', 'writerAI.rule.sensory-grounding', 'writerAI.rule.sentence-variety', 'writerAI.rule.prose-tightening'], "label": "Flabby paragraph",
     "variables": {"passage": "It was very really quite windy that day, and the wind, which "
                              "was blowing hard, made the trees move back and forth a lot in "
                              "the wind, which she could see happening as she watched it."}},
    # ── ideation (brainstorm/brainstormPlot: {{user_content}} is the
    # BrainstormView buildUserPrompt shape — Category/Seed + the output line;
    # {{label}}/{{kind}} are the client-filled SYSTEM variables) ──
    {"actions": ['brainstorm', 'brainstormPlot'], "label": "Brainstorm seed",
     "variables": {"user_content": "Category: Character names\n"
                                   "Seed: coastal-archivist family names — weathered, bookish, "
                                   "northern harbor town\n\n"
                                   "Output 15–20 fresh suggestions, one per line.",
                   "label": "character name",
                   "kind": "next plot beats — possible moves, escalations, or scene-level developments"}},
    # ── judge.scored ──
    # critique / critiqueStructure / multiReader×4: {{chapter_label}} renders
    # directly before "--- BEGIN CHAPTER ---", so the label carries the run
    # header's trailing blank line ("Chapter N — Title\n\n").
    {"actions": ['critique', 'critiqueStructure', 'multiReaderGenre', 'multiReaderLiterary', 'multiReaderAgent', 'multiReaderBookClub'], "label": "Chapter for critique",
     "variables": {"chapter_label": "Chapter 3 — The Ledger\n\n",
                   "chapter_text": _SAMPLE_CHAPTER_PROSE}},
    # plotHoles: the composePlotHolesInput shape — book line + per-chapter
    # "=== Chapter N ===" blocks with Summary + prose Tail; the system
    # prompt's optional {{world_rules_section}} ships with one rule set.
    {"actions": ['plotHoles'], "label": "Book digest (plot holes)",
     "variables": {"user_content": "The book has 3 chapters totalling 2,700 words.\n"
                                   "\n"
                                   "=== Chapter 1 — The Harbor Gate (900 words) ===\n"
                                   "Summary: Mira returns for her father's funeral and finds the harbor sealed at dusk.\n"
                                   "Tail (last ~300 words of prose):\n"
                                   "Mira signed the harbor ledger with the date the ferryman gave her — the ninth of "
                                   "March — and walked up through the fog to a house that no longer smelled of her "
                                   "father. His coat still hung on the door. In its pocket, a torn page.\n"
                                   "\n"
                                   "=== Chapter 2 — The Ledger (900 words) ===\n"
                                   "Summary: The torn page shows a second handwriting; Mira locks it in the cannery office.\n"
                                   "Tail (last ~300 words of prose):\n"
                                   "The columns were her father's hand until the ink changed mid-entry. Mira locked the "
                                   "page in the drawer with the brass key and pocketed the key on its red cord. It was "
                                   "the tenth of March; the funeral was in the morning.\n"
                                   "\n"
                                   "=== Chapter 3 — Before the Funeral (900 words) ===\n"
                                   "Summary: Renn admits he knew about the page before the funeral; they plan to open the office.\n"
                                   "Tail (last ~300 words of prose):\n"
                                   "'You knew before the funeral,' Renn said — though the funeral was a week past now, "
                                   "and Mira could not remember giving the brass key back to Old Harbek, who wore it "
                                   "on his belt when he passed them at the gate.\n",
                   "world_rules_section": "\n\nEXTRA: WORLD RULES TO ENFORCE.\n\n"
                                          "The writer has explicitly stated the following rules this world enforces. "
                                          "When you scan the manuscript, ALSO check whether any chapter violates these "
                                          "rules without an on-page explanation.\n\nWorld rules (verbatim from the "
                                          "writer):\n\"\"\"\nOnly one brass key to the cannery office exists.\n\"\"\"\n\n"
                                          "End of world rules."}},
    # voiceDrift: the composeVoiceDriftBody shape — OUTLIER block, BASELINE
    # block(s), then the divergent-metric lines.
    {"actions": ['voiceDrift'], "label": "Voice drift comparison",
     "variables": {"user_content": "OUTLIER — Chapter 4 — \"The Inquest\"\n"
                                   "The inquest was convened on the eleventh. Testimony was taken from the ferryman "
                                   "and from the harbor-master. It was determined that the ledger had been altered. "
                                   "It was noted that the key had not been recovered. The proceedings were adjourned.\n"
                                   "\n"
                                   "BASELINE — Chapter 2 — \"The Ledger\"\n"
                                   f"{_SAMPLE_CHAPTER_PROSE}\n"
                                   "\n"
                                   "BASELINE — Chapter 3 — \"Before the Funeral\"\n"
                                   f"{_SAMPLE_CHAPTER_PROSE_2}\n"
                                   "\n"
                                   "Metrics that differ:\n"
                                   "- Passive / 1k: higher (outlier 41.2; baseline ~6.5)\n"
                                   "- Avg sentence length: lower (outlier 9.8; baseline ~17.4)\n"
                                   "- Dialogue ratio: lower (outlier 0%; baseline ~28%)"}},
    # ── extract.structured ──
    # foreshadowing: {{chapter_label}} (with the run header's "\n\n") + prose.
    {"actions": ['foreshadowing'], "label": "Chapter for foreshadowing",
     "variables": {"chapter_label": "Chapter 5 — Before the Funeral\n\n",
                   "chapter_text": _SAMPLE_CHAPTER_PROSE_2}},
    # entitySweep: the composeEntitySweepInput shape — the bible block, then
    # the framed chapter.
    {"actions": ['entitySweep'], "label": "Chapter for entity sweep",
     "variables": {"user_content": "Already in the story bible — DO NOT re-propose:\n"
                                   "Characters: Mira, Renn\n"
                                   "Locations: (none)\n"
                                   "Objects: (none)\n"
                                   "\n"
                                   "Chapter 5 — Before the Funeral\n\n"
                                   "--- BEGIN CHAPTER ---\n"
                                   f"{_SAMPLE_CHAPTER_PROSE_2}\n"
                                   "--- END CHAPTER ---"}},
    # readerKnowledge: the composeReaderKnowledgeInput shape — the two
    # going-in fact lists, then the framed chapter.
    {"actions": ['readerKnowledge'], "label": "Reader knowledge chapter",
     "variables": {"user_content": "READER ALREADY KNOWS (going in):\n"
                                   "- The ledger's torn page carries a second, older handwriting.\n"
                                   "- Old Harbek wears a brass key on his belt.\n"
                                   "\n"
                                   "POV CHARACTER ALREADY KNOWS (going in):\n"
                                   "- The ledger's torn page carries a second, older handwriting.\n"
                                   "\n"
                                   "Chapter 5 — Before the Funeral\n\n"
                                   "--- BEGIN CHAPTER ---\n"
                                   f"{_SAMPLE_CHAPTER_PROSE_2}\n"
                                   "--- END CHAPTER ---"}},
    # characterAudit: the composeCharacterAuditInput shape — profile block +
    # the scene digest with per-scene chapter headers.
    {"actions": ['characterAudit'], "label": "Character audit scenes",
     "variables": {"user_content": "CHARACTER PROFILE\n"
                                   "Name: Mira\n"
                                   "Role: Harbor archivist\n"
                                   "Age: 34\n"
                                   "One-liner: Guarded and dry-witted; keeps grief private.\n"
                                   "Motivation: Find who altered her father's ledger.\n"
                                   "\n"
                                   "SCENES FEATURING THIS CHARACTER (2 total)\n"
                                   "\n"
                                   "--- Chapter 3 — The Ledger · Scene 1 ---\n"
                                   f"{_SAMPLE_CHAPTER_PROSE}\n"
                                   "\n"
                                   "--- Chapter 5 — Before the Funeral · Scene 1 ---\n"
                                   f"{_SAMPLE_CHAPTER_PROSE_2}"}},
    # relationshipArc (sample + type ONLY, the user's word): the
    # analyseRelationship shape — two profiles + the shared-chapter blocks.
    {"actions": ['relationshipArc'], "label": "Relationship arc pair",
     "variables": {"user_content": "PROFILE A — Mira\n"
                                   "Mira\n"
                                   "Role: Harbor archivist\n"
                                   "One-liner: Guarded and dry-witted; keeps grief private.\n"
                                   "Wants: To find who altered her father's ledger.\n"
                                   "\n"
                                   "PROFILE B — Renn\n"
                                   "Renn\n"
                                   "Role: Ferryman's son\n"
                                   "One-liner: Loyal, watchful; says less than he knows.\n"
                                   "Wants: To keep Mira from asking Old Harbek directly.\n"
                                   "\n"
                                   "SHARED CHAPTERS (2 total):\n"
                                   "\n"
                                   "=== Ch. 3 — The Ledger (1 shared scene) ===\n"
                                   f"{_SAMPLE_CHAPTER_PROSE}\n"
                                   "\n"
                                   "=== Ch. 5 — Before the Funeral (1 shared scene) ===\n"
                                   f"{_SAMPLE_CHAPTER_PROSE_2}\n"}},
    # beatSheet: the composeBeatSheetInput shape — FRAMEWORK + BEATS + digest
    # (the 7-point framework keeps the sample compact; any of the three ships).
    {"actions": ['beatSheet'], "label": "Beat sheet framework",
     "variables": {"user_content": "FRAMEWORK: 7-Point Story Structure\n"
                                   "Dan Wells's compressed framework. Easy to apply, especially good for short novels and series planning.\n"
                                   "\n"
                                   "BEATS (in canonical order):\n"
                                   "- \"hook\" — Hook: The protagonist's starting state — the inverse of their ending state.\n"
                                   "- \"plot-turn-1\" — Plot Turn 1: The event that calls the protagonist out of the ordinary world.\n"
                                   "- \"pinch-1\" — Pinch 1: First major pressure from the antagonistic force. Often raises stakes.\n"
                                   "- \"midpoint\" — Midpoint: The protagonist shifts from reactive to active.\n"
                                   "- \"pinch-2\" — Pinch 2: Second major pressure. The plan falls apart; the mentor often dies here.\n"
                                   "- \"plot-turn-2\" — Plot Turn 2: The protagonist gets what they need to resolve the story.\n"
                                   "- \"resolution\" — Resolution: The protagonist executes; the story's questions are answered.\n"
                                   "\n"
                                   "CHAPTER DIGEST (3 chapters):\n"
                                   "Ch. 1 — The Harbor Gate (900 words)\n"
                                   "Mira returns for her father's funeral and finds the harbor sealed at dusk.\n"
                                   "\n"
                                   "Ch. 2 — The Ledger (900 words)\n"
                                   "The torn page shows a second handwriting; Mira locks it in the cannery office.\n"
                                   "\n"
                                   "Ch. 3 — Before the Funeral (900 words)\n"
                                   "Renn admits he knew about the page; they plan to open the office together."}},
    # reverseOutline: the composeReverseOutlineInput shape — book line +
    # "Chapter digest:" with the tension/pacing/ending metadata parentheses.
    {"actions": ['reverseOutline'], "label": "Reverse outline digest",
     "variables": {"user_content": "The book has 3 chapters totalling 2,700 words.\n"
                                   "\n"
                                   "Chapter digest:\n"
                                   "Ch. 1 — The Harbor Gate (900 words · tension 4/10, balanced pacing, soft ending)\n"
                                   "Mira returns for her father's funeral and finds the harbor sealed at dusk.\n"
                                   "\n"
                                   "Ch. 2 — The Ledger (900 words · tension 6/10, slow pacing, cliffhanger ending)\n"
                                   "The torn page shows a second handwriting; Mira locks it in the cannery office.\n"
                                   "\n"
                                   "Ch. 3 — Before the Funeral (900 words · tension 7/10, balanced pacing, soft ending)\n"
                                   "Renn admits he knew about the page; they plan to open the office together.\n"}},
    # recap (extraction-preset member): the buildRecapContext shape — project
    # line, today's words, the chapter tail, cast + strands.
    {"actions": ['recap'], "label": "Session recap context",
     "variables": {"user_content": "Novel: The Salt Ledger (Mystery)\n"
                                   "Premise: A harbor archivist unpicks who altered her dead father's ledger.\n"
                                   "\n"
                                   "Today the writer added roughly 1,200 words to this manuscript.\n"
                                   "The chapter they touched most recently: Chapter 5 — \"Before the Funeral\" (now 2,400 words total).\n"
                                   "\n"
                                   "Current state of that chapter (last ~1200 words — most likely overlaps with what they wrote today):\n"
                                   f"{_SAMPLE_CHAPTER_PROSE_2}\n"
                                   "\n"
                                   "Active characters in/around this chapter:\n"
                                   "- Mira: Harbor archivist — she/her — Guarded and dry-witted; keeps grief private.\n"
                                   "- Renn: Ferryman's son — he/him — Loyal, watchful; says less than he knows.\n"
                                   "\n"
                                   "Open narrative strands:\n"
                                   "- The older script: who else can read it, and why it appears in the ledger.\n"}},
    # ── creative.structured ──
    # sensory: the generateSensoryPack shape — "Subject:" + optional context.
    {"actions": ['sensory'], "label": "Sensory subject",
     "variables": {"user_content": "Subject: the cannery office at dusk — brass key cold in the palm, "
                                   "tide turning below the floorboards, rope and old paper\n"
                                   "\n"
                                   "Broader setting / world context:\n"
                                   "A remote northern fishing town, 1920s; kerosene light, tarred timber, "
                                   "everything owned by the harbor cooperative."}},
    # marketingPack: the composeMarketingPackInput shape — TITLE/GENRE/PREMISE
    # + the chapter digest.
    {"actions": ['marketingPack'], "label": "Marketing pack digest",
     "variables": {"user_content": "TITLE: The Salt Ledger\n"
                                   "GENRE: Mystery\n"
                                   "PREMISE: A harbor archivist unpicks who altered her dead father's ledger.\n"
                                   "\n"
                                   "CHAPTER DIGEST (3 chapters):\n"
                                   "\n"
                                   "Ch. 1 — The Harbor Gate (900 words)\n"
                                   "Mira returns for her father's funeral and finds the harbor sealed at dusk.\n"
                                   "\n"
                                   "Ch. 2 — The Ledger (900 words)\n"
                                   "The torn page shows a second handwriting; Mira locks it in the cannery office.\n"
                                   "\n"
                                   "Ch. 3 — Before the Funeral (900 words)\n"
                                   "Renn admits he knew about the page; they plan to open the office together.\n"}},
    # unstuck: the composeUnstuckInput shape — header + the BEGIN/END PROSE frame.
    {"actions": ['unstuck'], "label": "Stuck prose",
     "variables": {"user_content": "Chapter 5 — Before the Funeral\n\n"
                                   "--- BEGIN PROSE (writer is stuck at the end of this) ---\n"
                                   f"{_SAMPLE_CHAPTER_PROSE_2}\n"
                                   "--- END PROSE ---"}},
    # ── summary.grounded (briefing): the buildBriefingContext shape — gap
    # line, last chapter, the tail passage, cast, strands, pins. ──
    {"actions": ['briefing'], "label": "Resume briefing context",
     "variables": {"user_content": "Novel: The Salt Ledger (Mystery)\n"
                                   "Premise: A harbor archivist unpicks who altered her dead father's ledger.\n"
                                   "\n"
                                   "The writer last worked on this manuscript 3 days ago.\n"
                                   "Last chapter touched: Chapter 5 — \"Before the Funeral\" (2,400 words).\n"
                                   "\n"
                                   "Final passage of that chapter (tail):\n"
                                   f"{_SAMPLE_CHAPTER_PROSE_2}\n"
                                   "\n"
                                   "Active characters in or near this chapter:\n"
                                   "- Mira: Harbor archivist — she/her — Guarded and dry-witted; keeps grief private.\n"
                                   "- Renn: Ferryman's son — he/him — Loyal, watchful; says less than he knows.\n"
                                   "\n"
                                   "Open narrative strands:\n"
                                   "- The older script: who else can read it, and why it appears in the ledger.\n"
                                   "\n"
                                   "Open threads & TODOs from nearby chapters (writer's own pins):\n"
                                   "- (Ch.5) Loose thread: who else can read the older script\n"
                                   "- (Ch.4) TODO: establish when Old Harbek got a key\n"}},
    # ── chat.grounded: {{question}} + {{excerpts}} in the run formatter's
    # cited [1]/[2] byte-shape (rag/excerpts.js). ──
    {"actions": ['chat'], "label": "Cited excerpts question",
     "variables": {"question": "When did Mira first learn about the ledger, and who told her?",
                   "excerpts": "[1] Ch. 3 \"The Ledger\", scene \"The Torn Page\":\n"
                               f"{_SAMPLE_CHAPTER_PROSE}\n"
                               "\n"
                               "[2] Ch. 5 \"Before the Funeral\", scene 1:\n"
                               f"{_SAMPLE_CHAPTER_PROSE_2}"}},
    # ── chat.inVoice: the two chat variables plus {{characterName}} +
    # {{characterProfile}} in the buildCharacterProfile line shape (leading
    # newline; "Role:"/"Self-image" rows — what a real run sends). ──
    {"actions": ['characterChat'], "label": "Ask Mira in character (cited)",
     "variables": {"question": "What did you feel when you first saw the ledger's torn page?",
                   "excerpts": "[1] Ch. 3 \"The Ledger\", scene \"The Torn Page\":\n"
                               f"{_SAMPLE_CHAPTER_PROSE}\n"
                               "\n"
                               "[2] Ch. 5 \"Before the Funeral\", scene 1:\n"
                               f"{_SAMPLE_CHAPTER_PROSE_2}",
                   "characterName": "Mira",
                   "characterProfile": "\nRole: Harbor archivist\n"
                                       "Pronouns: she/her\n"
                                       "Age: 34\n"
                                       "Self-image (one line): Guarded and dry-witted; keeps grief private.\n"
                                       "What you want: To find who altered your father's ledger.\n"
                                       "The lie you believe: That grief is a private ledger no one else may read."}},
]
