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
  • Reasoning: every preset ships think=off (p_chat flipped 2026-07-18 — the on-box
    A/B: 45 s vs 10 s to first token for no accuracy gain on grounded chat). Turning
    think ON keeps the EMPTY level = FOLLOW the model's layered budget (2026-07-16
    preset tier).

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
    # p_chat ships think OFF (user decision 2026-07-18, reversing the 2026-07-16 think-on
    # seed, on a ground-truthed on-box A/B over an indexed test book: thinking-low cost
    # 45 s to first token vs 10 s off on the 8 GB floor, and did NOT change grounded-chat
    # accuracy — the one real error both modes shared (misnamed protagonist) was a
    # RETRIEVAL gap, fixed by the corpus-fallback pin in rag/entityMatcher.js. Interactive
    # chat is latency-bound; reasoning stays a per-user opt-in.) Flipping think ON in the
    # Lab re-enters FOLLOW (empty level = the model's layered budget: your applied config
    # → hardware class default → global launch defaults — 1024 on the tested 8 GB class);
    # a level would be the preset's OWN ask, overriding every layer — still seeded empty
    # on purpose. NOTE: the preset seeder is insert-if-missing, so this flip reaches
    # FRESH DBs only; an existing install flips the toggle in the Lab.
    # p_character_chat stays think-off (fast in-voice dialogue).
    {"id": "p_chat", "name": "Grounded chat", "name_was": "Interactive chat", "provider_id": "local-llamacpp",
     "model": "", "temperature": 0.3, "top_p": 0.90, "position": 3,
     "think": False, "reasoning_effort": "",
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
     # Floors are BINARY MB of a REAL memory size (2026-07-27, the user's ruling "vram
     # and ram usually only come in even sizes and certainly not 8.5"): 4 GB = 4096,
     # 24 GB = 24576, never 4000/24000 — the catalog UI divides by 1024, so a decimal
     # value renders as "3.9 GB"/"23 GB". Same snap as the runner seed's chat rows; the
     # convention lives in llm_runner/llm/seed.py's DEFAULT_CATALOG header.
     "trained_ctx": 262144, "min_vram_mb": 4096, "min_ram_mb": 24576,
     "tier": "low-vram-moe", "license": "Apache-2.0", "quality_rank": 5, "position": 20,
     "architecture": "gemma4", "experts": 128,
     # description = the file-facts compose (the 2026-07-07 decree: Read-from-link owns
     # it). notes are USER-FACING seeded text ("Your notes", editable) — the user's ruling
     # 2026-07-25: box-independent plain words only, no author-box measurements, no
     # internal jargon (the old text shipped the author's TTFT/prefill numbers, which
     # read as nonsense on any other machine; those live in the plan docs + bench results).
     "description": "26B mixture-of-experts model · 256k context · MTP draft for faster generation · UD-Q4_K_XL (QAT)",
     "notes": "The recommended all-rounder — one setup covers writing, chat, and research. "
              "Runs on 8 GB graphics cards and up; thinking is managed per task automatically."},
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
    "characterProfile": "p_extract",
    "characterVoice": "p_extract",
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
    # characterAudit + characterProfile: BOTH ride composeCharacterAuditInput —
    # profile block + the scene digest with per-scene chapter headers — so the
    # one blob fans to both (the authored-once sample law).
    {"actions": ['characterAudit', 'characterProfile', 'characterVoice'], "label": "Character audit scenes",
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

# ═════════════════════════════════════════════════════════════════════════════
# THE CURATED WRITING CATALOG + ITS MEASURED KNOWLEDGE — moved here VERBATIM
# from the shared kit's seed (llm_runner/llm/seed.py) under the family parity
# batch, decision ④ (2026-08-05): "the shared DEFAULT_CATALOG empties (mechanism
# only, no app's data); the writing rows move into JW's own seed; the class-tune
# seed moves per-app with it." Ids are IDENTICAL to what the kit used to seed, so
# an existing JW DB keeps every row untouched (insert-if-missing) — only the
# OWNER of the data changed. The inner comments are the original decision trail
# and travel with the rows. app.py passes these through install_llm
# (model_catalog_extra / class_tunes_seed / class_tune_identity /
# embed_templates); the daily-driver 26B row above rides the same catalog list.
# ═════════════════════════════════════════════════════════════════════════════

# The downloadable catalog — a SMALL curated hardware ladder (reconciled 2026-07-05 for the
# model-surface build; see the inline section comments below). Every repo + quant + license
# web-verified via the HF API. `min_ram_mb` = the RAM floor (dense: weights-in-RAM +
# overhead, e.g. 8B→~10 GB / 14B→14 GB; MoE: the FULL model in RAM since experts offload to
# RAM). `min_vram_mb` = the load-time VRAM band (MoE = active-path + KV, much smaller than
# total). The tuning UI (#20) measures real. `use_limited` is auto-derived from `license`
# (a use-limited model — e.g. the Llama Community license — is carried as a FLAG, never an
# auto-default). `embedding` marks an embed model; `pooling` is intrinsic per embed model.
# FLOORS ARE BINARY MB OF A REAL MEMORY SIZE — 8 GB is 8192, never 8000 (the UI divides by
# 1024, so a decimal-thousands value renders as "7.8 GB"/"23 GB", the exact odd numbers the
# user banned 2026-07-27: "vram and ram usually only come in even sizes and certainly not 8.5").
# The three judgment calls in that 2026-07-27 snap, so nobody re-derives them by arithmetic:
# the 12B's VRAM 8500→8192 (the user's own bench — 39.1 tok/s at ngl 99 on their 8 GB card;
# it is the vram8|ram16 band pick, so a floor ABOVE 8 GB contradicted that ruling); the 70B's
# VRAM 46000→49152 (48 GB is a real workstation card, 46 GB is nothing); the 27B's VRAM
# 20000→20480 (20 GB cards exist — RTX 4000 Ada, RX 7900 XT). GLM's RAM floor was normalized
# 64000→65536 only; whether it should be 96 GB is an open user call, not settled here.
# EMBED rows keep their decimal floors deliberately: they are never displayed on a row
# (LuModelCatalog gates the Needs-line with !embeddingOf(m)) and they steer wizard placement,
# so changing them is behavior risk for zero display gain.
JW_CURATED_CATALOG: list[dict] = [
    # ── Curated hardware ladder — GEMMA-FIRST for writing (user decision 2026-07-06 night:
    # "make the gemma lineup instead of qwen" + "add gryphe and ye" + "add auhauCS/Gemma4-26B",
    # research + decision trail in docs/plans/2026-07-06-providers-surface-redesign.md).
    # Basis: the user's MEASURED on-box result (Gemma 4 better prose in the actual app at the
    # same speed class) outranks a 0.4-point published tie; Qwen3.6-35B-A3B stays as the one
    # alternative MoE. A SMALL verified set — the Smart Add flow lets a user add ANY HF GGUF
    # repo, so this is a starting ladder, not a lock. Every repo + quant + license re-verified
    # via the HF API 2026-07-06 (the seed-facts audit runs on every seed change).
    # Dense (VRAM, fully on GPU) → MoE (system RAM, expert offload) → embeddings. use_limited is
    # auto-derived from `license`; pooling is intrinsic per embed; quality_rank LOWER = better
    # (curated-for-writing order, owner-tested basis — community tunes deliberately rank BELOW
    # the trusted auto-pick set until a Lab A/B earns them a real rank).
    # `size_label`/`size_bytes` (#12b, harvested 2026-07-08): read from each pinned quant's live
    # GGUF header via identity.inspect_model_from_link — the SAME path Read-from-link uses, so
    # seed == detection (size_bytes = summed-shard download size; size_label = the file's
    # general.size_label). QUANT-SPECIFIC: changing a row's quant clears them for re-inspect.
    # ── Dense (runs fully on the GPU — fast) ──────────────────────────────────────────────
    {"id": "gemma-4-12b-qat", "name": "Gemma 4 12B (QAT)",
     "hf_repo": "unsloth/gemma-4-12B-it-qat-GGUF", "quant": "UD-Q4_K_XL", "total_params": "12B",
     "mtp": True, "est_vram_mb": 10721, "mtp_draft_file": "MTP/mtp-gemma-4-12B-it-Q4_0.gguf", "mtp_draft_quant": "Q4_0",
     "trained_ctx": 262144, "samplers": {"top_k": "64", "top_p": "0.95", "temperature": "1"},
     "min_ram_mb": 12288, "min_vram_mb": 8192, "tier": "mid", "license": "Apache-2.0", "position": 0,
     "quality_rank": 22, "architecture": "gemma4", "experts": 0,
     "size_label": "12B", "size_bytes": 6716355328,
     "description": "12B model · 256k context · MTP draft for faster generation · UD-Q4_K_XL (QAT)",
     "notes": "The lighter, faster pick — runs fully on a 10-12 GB graphics card (tight on 8 GB) and needs little system RAM."},
    # ── The E-series small rung (added 2026-07-25 on the user's go; E2B was added the
    # same morning and REMOVED the same evening in the user's catalog trim — see the
    # note below). E4B is the DECIDED model for the 16 GB integrated-GPU box (user,
    # 2026-07-24: "16 GB Iris Xe = E4B"); its (E4B, igpu-mem16) class tune seeded from
    # that laptop's own kit run. Shares position 0 with the 12B rung (order within a
    # position is by id; renumbering the ladder would disturb the JW extras' relative
    # order at position 20). Header-derived facts (size/arch/ctx/mtp/drafter) filled by
    # scripts/refresh-seed-facts.py — seed == file, same code path as Read-from-link.
    # min_vram/min_ram floors follow the 12B row's file-size ratios.
    # DRAFTER RECORDED BUT OFF (`mtp: False` — the ONE deliberate divergence from what
    # Read-from-link would configure, which is borrow + enable): unsloth's E-repo ships
    # no MTP head, so the tier-C probe finds only a THIRD-PARTY assistant head
    # (AtomicChat), never loaded against these weights. Flip mtp True only after a
    # verified load on a real box; a future refresh-seed-facts --write will mechanically
    # propose `mtp: True` again — do NOT accept that without the load (the script
    # reports before it writes; this comment is the stop sign).
    # (E2B REMOVED 2026-07-25, the user's same-day trim: every served box has ≥16 GB
    # RAM and runs E4B — the CPU-only band E2B might have served was already ruled
    # "not viable for interactive book-chat". Its kit measurements survive under
    # justwrite-app bench/results/; the speed-kit still benches it as test infra.)
    {"id": "gemma-4-e4b-qat", "mtp": False, "mtp_draft_quant": "Q4_K_S", "mtp_draft_file": "gemma-4-E4B-it-assistant.Q4_K_S.gguf", "mtp_draft_repo": "AtomicChat/gemma-4-E4B-it-assistant-GGUF", "est_vram_mb": 5411, "size_bytes": 4215695776, "size_label": "7.5B", "trained_ctx": 131072, "name": "Gemma 4 E4B (QAT)",
     "hf_repo": "unsloth/gemma-4-E4B-it-qat-GGUF", "quant": "UD-Q4_K_XL", "total_params": "E4B",
     "samplers": {"top_k": "64", "top_p": "0.95", "temperature": "1"},
     "min_ram_mb": 8192, "min_vram_mb": 6144, "tier": "mid", "license": "Apache-2.0", "position": 0,
     "quality_rank": 23, "architecture": "gemma4", "experts": 0,
     "description": "E4B model · 128k context · UD-Q4_K_XL (QAT)",
     "notes": "Made for laptops with integrated graphics, where the GPU shares system memory. Small and quick, and holds its quality well for the size."},
    # (gemma-4-31b-qat REMOVED 2026-07-26, the user's "your rec" on the full-catalog
    # campaign — bench doc §34 recommendation 1. It was TESTED, not assumed: across six hq
    # captures its quality TIED the flagship on both §7 hard keys and it missed the one
    # inference StyleTune found; the prose edge was small and confined to `continue`. At
    # 24 GB the flagship is also fully resident AND far faster (MoE ~4B active vs a dense
    # 31B touching every weight), and the band already holds the flagship (recommended)
    # plus the tier-native 27B (availability, seeded 2026-07-25). Being the same family as
    # the flagship with no measured advantage, it could not lean on the availability keep
    # that covers the 70B/GLM rows. NOTE: the catalog seeder is insert/fill-only — it does
    # NOT prune — so this removes the row from FRESH installs only; a DB that already
    # carries it keeps it until deleted in the catalog UI.)
    {"id": "llama-3.3-70b-q4_k_m", "est_vram_mb": 45768, "name": "Llama 3.3 70B Instruct · Q4_K_M",
     "hf_repo": "unsloth/Llama-3.3-70B-Instruct-GGUF", "quant": "Q4_K_M", "total_params": "70B",
     "trained_ctx": 131072,
     "min_ram_mb": 49152, "min_vram_mb": 49152, "tier": "high-ram", "license": "Llama-Community", "position": 2,
     "quality_rank": 11, "architecture": "llama", "experts": 0,
     "size_label": "70B", "size_bytes": 42520398432,
     "description": "70B model · 128k context · Q4_K_M",
     "notes": "The heavyweight for a big rig (48 GB+ memory) — excellent all-round writing. Its Llama license limits some uses, so it is never selected automatically."},
    # ── MoE (experts offload to system RAM — higher quality, slower, needs RAM) ────────────
    # (Qwen3.6-35B-A3B REMOVED 2026-07-25, the user's catalog trim: its "smart
    # all-round alternative" job no longer existed — on the author's 8 GB box it
    # measured uniformly ~2x slower than the flagship (chat 23.4s vs 12.7s, entity
    # sweep 100.9s vs 39.4s, decode 6.9 vs 13.4 tok/s — stored campaign legs), it was
    # the model the stall-detector was built around, and the dense 27B below now
    # covers the Qwen-family slot for 24 GB rigs. The C2 rank note that lived here —
    # the 35B's published evals beating GLM-4.5-Air's on every shared instrument,
    # evidence in docs/plans/2026-07-06-a-to-e-execution.md §C2 — is why GLM still
    # ranks 10 despite its size.)
    {"id": "glm-4.5-air", "name": "GLM-4.5-Air (106B-A12B MoE)",
     "hf_repo": "unsloth/GLM-4.5-Air-GGUF", "quant": "UD-Q4_K_XL",
     "total_params": "106B", "active_params": "12B", "type": "moe",
     # mtp True: the GGUF header carries nextn_predict_layers (live header read 2026-07-07
     # — the seed said False; the strict-diff caught it). Built-in MTP, no external draft.
     "mtp": True, "est_vram_mb": 71354, "mtp_builtin": True, "trained_ctx": 131072,
     "min_vram_mb": 12288, "min_ram_mb": 65536, "tier": "high-ram", "license": "MIT", "position": 4,
     "quality_rank": 10, "architecture": "glm4moe", "experts": 128,
     "size_label": "128x9.4B", "size_bytes": 67721071872,
     "description": "106B mixture-of-experts model · 128k context · MTP for faster generation · UD-Q4_K_XL",
     "notes": "A very large model for high-memory machines (64 GB+ RAM). Strong at structured analysis and long documents."},
    # The 24 GB-band tier-native option (2026-07-25, the user's ruling: "the goal is to
    # have a model available to download for the users hardware" — the 70B/GLM precedent:
    # research-grounded rows for hardware we don't own, so bigger boxes have something to
    # download). Dense 27B, Apache-2.0, 262K ctx, MTP trained in; fully resident on a
    # 24 GB card at this quant. HONEST CAVEAT baked into rank + notes: Qwen markets it on
    # coding/agentic work and its PROSE is untested here — it ranks at the bottom of the
    # chat rows until a real writing trial moves it; the 24-band class recommendation
    # stays with the flagship (our best-rated writer) meanwhile.
    # hf_repo is the -MTP- variant DELIBERATELY (the shape the since-removed 35B row used): unsloth
    # ships the 27B twice, and the plain repo made the tier-C probe "borrow" a 15 GB
    # full-model IQ4_XS from the MTP sibling as a "draft" — absurd (a draft the size of
    # the model; caught before commit). The MTP repo bakes the nextn layers in →
    # mtp_builtin, no external draft, ~1.5-2x decode per its card.
    {"id": "qwen3.6-27b", "mtp": True, "mtp_builtin": True, "est_vram_mb": 19594, "size_bytes": 17909097600, "size_label": "27B", "trained_ctx": 262144, "name": "Qwen3.6 27B (MTP)",
     "hf_repo": "unsloth/Qwen3.6-27B-MTP-GGUF", "quant": "UD-Q4_K_XL",
     "total_params": "27B",
     "samplers": {"top_k": "20", "top_p": "0.95", "temperature": "1"},
     "min_vram_mb": 20480, "min_ram_mb": 24576, "tier": "high", "license": "Apache-2.0", "position": 3,
     "quality_rank": 14, "architecture": "qwen35", "experts": 0,
     "description": "27B model · 256k context · MTP for faster generation · UD-Q4_K_XL",
     "notes": "Built for 24 GB graphics cards — runs fully on one. A strong general model; its fiction writing is untried in this app, so compare it with the default before switching. Never selected automatically."},
    # ── Community writing tunes (user-added 2026-07-06; NEVER auto-picked — ranked below the
    # trusted set until a Lab A/B; each row license-verified through its base_model chain) ──
    # DRAFTER REPOINTED 2026-07-25 (measured, 2070S / b10107). This row seeded
    # Radamanthys11's `gemma-4-26B-A4B-it-assistant-Q8_0.gguf`, and that made the model
    # UNLOADABLE FOR EVERY USER: the engine exited status 1 ("exiting due to model
    # loading error"), which is why the row had never once been benched since it was
    # added on 2026-07-06. It now borrows unsloth's `mtp-…-Q4_0.gguf` head — the exact
    # file `gemma-4-26b-a4b-uncensored-ez` already borrows at 60.5% acceptance — which
    # loads cleanly against these weights. The borrow stays ENABLED so the tier-C
    # mechanism (and its tests) behave as designed.
    # Honest note on the value, so nobody re-measures it: for THIS model the draft earns
    # ~nothing — same prompt/seed/-ngl/--fit off, 10.77 tok/s with it vs 10.56 without
    # (2%, noise), because an MTP head predicts its BASE model's tokens and StyleTune's
    # finetune moved the weights too far (the ez row, a much lighter merge, is the
    # contrast). On an 8 GB card, where this model fits only 8/30 layers, a 0.23 GB draft
    # is probably net-negative — but that is a PER-HARDWARE call and belongs in a
    # class tune, not in a global seed that also serves 24 GB boxes.
    {"id": "gryphe-styletune-v2", "mtp": True, "mtp_draft_quant": "Q4_0", "mtp_draft_file": "MTP/mtp-gemma-4-26B-A4B-it-Q4_0.gguf", "mtp_draft_repo": "unsloth/gemma-4-26B-A4B-it-qat-GGUF", "est_vram_mb": 20771, "name": "Gemma 4 26B-A4B StyleTune V2 (Gryphe)",
     "hf_repo": "mradermacher/Gemma-4-26B-A4B-StyleTune-V2-GGUF", "quant": "Q4_K_M",
     "total_params": "26B", "active_params": "4B", "type": "moe",
     "trained_ctx": 262144, "samplers": {"top_k": "64", "top_p": "0.95", "temperature": "1"},
     "min_vram_mb": 4096, "min_ram_mb": 24576, "tier": "low-vram-moe", "license": "Apache-2.0", "position": 5,
     "quality_rank": 12, "architecture": "gemma4", "experts": 128,
     "size_label": "26B-A4B", "size_bytes": 17211252288,
     "description": "26B mixture-of-experts model · 256k context · Q4_K_M",
     "notes": "A community re-tune of the standard 26B aimed at richer, more stylized prose. Same hardware needs as the default, a little slower. Try it when you want a different voice."},
    # The user's use-policy word, verbatim (2026-07-06): "i want uncensored as option for
    # fiction i dont want writers blocked when they have gory or fantasy sex scenes" — an
    # OPTION, chosen deliberately; never a default.
    # A/B SETTLED 2026-07-25 ("test both, keep the winner", ruled 2026-07-24): this
    # EZForever row is KEPT and the HauhauCS row was REMOVED the same day (the user's
    # word; fresh-DB policy — no tombstone for existing DBs). EZForever won every axis
    # measured: faster on all six features, marginally better prose on a side-by-side
    # read, and the ONLY arm that actually behaves as uncensored — on the violence probe
    # HauhauCS deflected exactly like stock QAT (cut the ROPE, not the act) while
    # EZForever wrote the act. Evidence: bench run 2026-07-25_12-12-36-gpu + the
    # DO-NOT-ADD note above `looksRefused` (justwrite-app services/benchHook.js).
    # EZForever's UD-merge grafts llmfan46's heretic-abliterated tensors onto unsloth's
    # own QAT GGUF — the SAME base repo the JW flagship rides — Apache-2.0 end to end
    # (HF API read 2026-07-24), with PUBLISHED deltas vs base (card table read
    # 2026-07-24 — Q4_K_XXL: KL-divergence 0.0291, MMLU-val 81.06%, refusal 16% vs the
    # BF16 base's own 17%). XXL keeps abliterated tensors at Q8_0; the XL variant's 33%
    # refusal defeats the row's purpose, so XXL is the pinned quant. Drafter: unsloth's
    # own MTP file per the card's instruction — identical to the flagship's.
    # size_label/est_vram_mb deliberately unseeded: download-time inspect fills them
    # from the real file (the fill-empty path).
    {"id": "gemma-4-26b-a4b-uncensored-ez", "name": "Gemma 4 26B-A4B Uncensored (EZForever heretic)",
     "hf_repo": "EZForever/gemma-4-26B-A4B-it-qat-uncensored-heretic-UDmerge-GGUF", "quant": "Q4_K_XXL",
     "total_params": "26B", "active_params": "4B", "type": "moe",
     "mtp": True, "mtp_draft_repo": "unsloth/gemma-4-26B-A4B-it-qat-GGUF",
     "mtp_draft_file": "MTP/mtp-gemma-4-26B-A4B-it-Q4_0.gguf", "mtp_draft_quant": "Q4_0",
     "trained_ctx": 262144, "samplers": {"top_k": "64", "top_p": "0.95", "temperature": "1"},
     "min_vram_mb": 4096, "min_ram_mb": 24576, "tier": "low-vram-moe", "license": "Apache-2.0", "position": 6,
     "quality_rank": 13, "architecture": "gemma4", "experts": 128,
     "size_bytes": 14329791488,
     "description": "26B mixture-of-experts model · 256k context · MTP draft for faster generation · Q4_K_XXL (QAT, refusal-ablated)",
     "notes": "The uncensored option — for fiction whose dark, violent, or adult scenes hit refusals on the standard models. Quality stays close to the standard 26B. Never selected automatically; you choose it."},
    # ── Embeddings (build the RAG / semantic-search index — CPU-fine) ──────────────────────
    # (The tiny CPU pipeline-test model is deliberately NOT in this seed — user, 2026-07-06:
    # "real seed should not have it". Dev containers/CI add it via the user-facing catalog
    # CRUD with scripts/dev-seed-test-model.py.)
    # (EMBED TRIM 2026-07-25, the user's ruling after the fresh survey: nomic v1.5,
    # the 0.6B, and BGE-M3 REMOVED. Every served class has ≥16 GB RAM and runs the 4B —
    # which beat the 0.6B in the 2026-07-12 on-box A/B; nomic is a 2024-generation
    # 137M floor for boxes the app does not serve; the Qwen3 family is itself top-tier
    # multilingual, so BGE-M3 added nothing. Two rows + the 2026 contender below
    # replace the old five.)
    # The DEFAULT local embed for a capable box (2026-07-12, reversing #274's "should be
    # 0.6B"): near-8B retrieval quality at ~2.5 GB — the 2026-07-12 on-box A/B beat the
    # (since-removed) 0.6B on thematic retrieval, which is what made this THE default.
    # tier "cpu" — an embed runs on CPU by policy (the GPU stays for the chat model), so
    # it is judged on RAM (8 GB floor), NOT the VRAM leftover; that makes it
    # ALWAYS-eligible in the embed pick, and it wins Quick Setup on every served box
    # (all classes carry ≥16 GB RAM; a big GPU whose leftover covers the 8B gets the 8B).
    # min_vram 4500 stays the honest GPU-fit figure (the FIT badge only — eligibility comes
    # from the tier, placement forces CPU via lifecycle._apply_embed_placement).
    {"id": "qwen3-embedding-4b", "est_vram_mb": 4636, "name": "Qwen3 Embedding 4B",
     "hf_repo": "Qwen/Qwen3-Embedding-4B-GGUF", "quant": "Q4_K_M", "total_params": "4B",
     "trained_ctx": 40960,
     "min_vram_mb": 4500, "min_ram_mb": 8000, "tier": "cpu", "license": "Apache-2.0", "position": 10,
     "embedding": True, "pooling": "last",
     "quality_rank": 55, "architecture": "qwen3", "experts": 0,
     "size_label": "4B", "size_bytes": 2496703776,
     "description": "4B embedding model · 40k context · Q4_K_M",
     "notes": "The recommended embedding model — strong search quality at a small size. Runs on the CPU, so it never competes with your writing model."},
    {"id": "qwen3-embedding-8b", "est_vram_mb": 6874, "name": "Qwen3 Embedding 8B",
     "hf_repo": "Qwen/Qwen3-Embedding-8B-GGUF", "quant": "Q4_K_M", "total_params": "8B",
     "trained_ctx": 40960,
     "min_vram_mb": 7000, "min_ram_mb": 10000, "tier": "high", "license": "Apache-2.0", "position": 11,
     "embedding": True, "pooling": "last",
     "quality_rank": 50, "architecture": "qwen3", "experts": 0,
     "size_label": "8B", "size_bytes": 4676804928,
     "description": "8B embedding model · 40k context · Q4_K_M",
     "notes": "The bigger embedding option for powerful machines — the best of its family. Runs on the CPU."},
    # The 2026 CONTENDER row (added 2026-07-25, the user's availability ruling — the
    # 27B-chat-row precedent: research-grounded availability for capable hardware,
    # recommendation only after a trial). Tencent's KaLM-Embedding-Gemma3-12B-2511 tops
    # the May-2026 MMTEB v2 snapshot; card facts verified 2026-07-25: last-token
    # pooling, instruct-style query prompt (the same shape as the Qwen3 rows),
    # Matryoshka dims to 64; the HEADER says ctx 131072 and arch `gemma-embedding` —
    # a dedicated embed arch, so llama.cpp support is first-class, not incidental.
    # GGUF is mradermacher's static quant (the user found it;
    # an Ollama listing proves llama.cpp-land serving). rank 52 — deliberately BELOW
    # the proven 8B (50) so the pick rule never auto-recommends an untested model;
    # available to download, "try it against the 8B". license: Gemma terms propagate
    # from the google/gemma-3-12b-pt base. Embeds run CPU by placement policy — a 12B
    # embedder means SLOW index builds; for strong boxes, deliberately chosen.
    {"id": "kalm-embedding-gemma3-12b", "est_vram_mb": 9700, "size_bytes": 7300777920, "size_label": "12B", "name": "KaLM Embedding Gemma3 12B",
     "hf_repo": "mradermacher/KaLM-Embedding-Gemma3-12B-2511-GGUF", "quant": "Q4_K_M", "total_params": "12B",
     "trained_ctx": 131072,
     "min_vram_mb": 10000, "min_ram_mb": 12000, "tier": "high", "license": "Gemma", "position": 12,
     "license_reviewed": "base is google/gemma-3-12b-pt — Gemma terms propagate to the finetune; checked 2026-07-25",
     "embedding": True, "pooling": "last",
     "quality_rank": 52, "architecture": "gemma-embedding", "experts": 0,
     "description": "12B embedding model · 128k context · Q4_K_M",
     "notes": "A newer, larger embedding model that currently leads public quality rankings. Untried in this app, and index building is slow on most machines — for powerful PCs and the curious. Never selected automatically."},
]

# ── Embedding task templates (Move 0, RAG build 2026-07-11) ────────────────────
# The task instruction each embed model REQUIRES around its input — a model
# FACT, per its card (all verified on the web, cites in
# justwrite-app/docs/plans/2026-07-10-rag-story-bible-research.md §9.1/§11.1):
#   * nomic-embed-text v1.5 — REQUIRES `search_document:` / `search_query:`
#     prefixes on both sides ("without prefixes, embedding quality degrades").
#   * Qwen3-Embedding (0.6B + 4B + 8B) — instruction-aware on the QUERY side only
#     ("Instruct: {task}\nQuery: {q}"; ~+22% retrieval relevance); documents
#     encode plain. The task sentence is seed wording, user-editable (flag F2).
#   * BGE-M3 — needs none → no row.
# `{text}` is the input slot; a model with no row (or an empty side) passes
# through unchanged — online/BYO embed models are automatically untouched.
_QWEN3_EMBED_QUERY = (
    "Instruct: Given a question about a novel, retrieve passages and story "
    "bible entries that answer it\nQuery: {text}"
)
JW_EMBED_TEMPLATES: list[dict] = [
    {"id": "qwen3-embedding-4b", "document": "", "query": _QWEN3_EMBED_QUERY},
    {"id": "qwen3-embedding-8b", "document": "", "query": _QWEN3_EMBED_QUERY},
    # KaLM is instruction-aware on the query side in the SAME "Instruct: …\nQuery:"
    # format as Qwen3-Embedding (its card's own default prompt, verified 2026-07-25),
    # so it shares the house novel-task instruction; documents encode plain.
    {"id": "kalm-embedding-gemma3-12b", "document": "", "query": _QWEN3_EMBED_QUERY},
]

# The seeded + EDITABLE hardware-CLASS tune library (2026-07-07) — a measured launch
# config keyed by (model_id, class_key = `vram<GB>|ram<GB>`), portable to every box of
# that class (the user's argument: re-tune is only needed on hardware change, so the
# tune is a function of the hardware). Seeded rows carry the DELTA over the base/type/mtp
# bundles — the fit + measured knobs the bundles don't provide (ngl / n_cpu_moe / ctx /
# batch / threads / reasoning cap); the bundles still supply flash_attn / KV type / mlock /
# no_mmap / spec_*. Row #1 = the author's on-box-measured Gemma 26B-A4B config for the
# 8 GB / 32 GB class (n_cpu_moe 21 — the tested floor; 20 OOMs on a 2070S; the sweep's 23
# is safer/slower). NO context_shift / cache_reuse (Gemma iSWA supports neither).
JW_CLASS_TUNES: list[dict] = [
    {"model_id": "gemma-4-26b-a4b-qat", "class_key": "dgpu-vram8|ram32", "switches": {
        "n_gpu_layers": "99", "n_cpu_moe": "21", "ctx_len": "32768",
        "batch_size": "512", "ubatch_size": "512", "threads": "8",
        "reasoning_budget": "1024",  # cont_batching dropped: equals llama's default (on)
    }},
    # Row #2 = the on-box-measured Gemma 26B-A4B config for the 32 GB INTEGRATED-GPU
    # class (Core Ultra 7 / Arc iGPU, Vulkan; kit matrix 2026-07-23, recovery doc §6+§14+§16).
    # It's a UMA one-pool box, so NO expert offload (n_cpu_moe 0 — the ncmoe sweep proved
    # every offload step loses on BOTH prefill and decode) and flash_attn OFF (it HURTS
    # this iGPU's prefill badly, and overrides the base bundle's "on" which is right only
    # for CUDA — class_tunes resolve above the bundles). ngl 99 / ub 512 = the matrix
    # winner. threads OMITTED (machine-specific — derived per box from cpu_cores, since the
    # class spans machines with different core counts); the engine backend (Vulkan) comes
    # from detection, not this row.
    {"model_id": "gemma-4-26b-a4b-qat", "class_key": "igpu-mem32", "switches": {
        "n_gpu_layers": "99", "n_cpu_moe": "0", "ctx_len": "32768",
        "batch_size": "512", "ubatch_size": "512", "flash_attn": "off",
        "reasoning_budget": "1024",
    }},
    # Row #3 = StyleTune V2 on the 8 GB discrete class: speculative decode OFF.
    # MEASURED 2026-07-25 (2070S, b10107, --fit off, -ngl 8, 200-token generations, three
    # seeds per arm): with the MTP draft 10.85 / 11.52 / 11.71 tok/s (mean 11.36) vs
    # without 10.89 / 11.88 / 11.50 (mean 11.42). No-draft is nominally FASTER, and the
    # within-arm spread swamps the difference — the draft earns nothing here while costing
    # 0.23 GB on a card where this 16 GB model already fits only 8 of 30 layers.
    # WHY the model still keeps `mtp: True` and a working drafter: the cause is that an MTP
    # head predicts its BASE model's tokens and this finetune moved the weights too far
    # (contrast the ez row, a lighter merge, at 60.5% acceptance) — but the measurement
    # above was taken under HEAVY CPU offload, which is an 8 GB-class condition. On a card
    # that holds all 30 layers, speculative decode behaves differently and may well pay.
    # So this is scoped to the class that was measured, NOT made a global default.
    {"model_id": "gryphe-styletune-v2", "class_key": "dgpu-vram8|ram32", "switches": {
        "spec_type": "none",
    }},
    # Row #4 = E4B on the 16 GB INTEGRATED-GPU class (i7-1355U / Iris Xe, Vulkan; the
    # user's decided model for this box — "16 GB Iris Xe = E4B", 2026-07-24). MEASURED on
    # that laptop's own speed-kit run (b10099, 2026-07-24, results shared 2026-07-25):
    # E4B quick screen 9.8 tok/s decode at ngl 99 (the model generates cleanly — quality
    # probe non-empty; the 12B probe on the same box is EMPTY and 12B fell below the kit's
    # 7 tok/s cutoff, confirming E4B as the top viable rung). flash_attn OFF + ubatch 512:
    # the box's own full matrix (run on the dense Ternary-8B, same Vulkan/Iris-Xe backend —
    # cross-model transfer of a backend property, stated honestly): at pp8192 fa-off wins
    # 53.5 vs 40.2 tok/s, and ub 2048 collapses depth to 22.7 — same signature the Arc
    # igpu-mem32 matrix showed, and long-context prefill is THE manuscript workload.
    # ctx 32768 / batch 512 / reasoning_budget 1024 mirror the blessed rows (the
    # igpu-mem32 precedent). Dense model → no n_cpu_moe; threads machine-derived, omitted.
    {"model_id": "gemma-4-e4b-qat", "class_key": "igpu-mem16", "switches": {
        "n_gpu_layers": "99", "ctx_len": "32768",
        "batch_size": "512", "ubatch_size": "512", "flash_attn": "off",
        "reasoning_budget": "1024",
    }},
    # ── The dGPU BAND recommendations (2026-07-25, Part 2 of the per-band survey; the
    # ref IS the recommendation — §9 ruled shape). Models are CARRIED, TESTED rows only
    # (an untested outside candidate never becomes a recommendation — the A/B law);
    # the survey's candidates for future testing live in
    # justwrite-app docs/plans/2026-07-25-per-band-model-survey.md.
    # HONESTY ON UNOWNED HARDWARE: nobody has measured these bands, so rows carry only
    # what is defensible without a box — the mirrors (ctx 32768 / batch 512 / ub 512 /
    # reasoning_budget 1024, the blessed-row values) plus placement ONLY where the
    # estimator settles it: the 24-band flagship rows set ngl 99 / ncmoe 0 because the
    # whole 26B MoE (est ~17.7 GB) fits a 24 GB card outright — which also sidesteps
    # upstream #24350 (--fit + a gemma4_mtp draft fails to create a context; tracked).
    # The 16-band flagship rows set NO placement flags: the model needs SOME expert
    # offload there and the honest amount is unmeasured — the engine's --fit places it
    # (those users can hit #24350 with MTP on until upstream fixes land; that exposure
    # exists with or without this row and is tracked in TASKS.md).
    # 12-band + vram16|ram16 → the 12B dense: fully resident (est ~10.7 GB), RAM-light —
    # ram16 boxes can NOT carry the flagship (its ~24 GB RAM appetite, min_ram 24000).
    # vram8|ram16 (the budget build) → the 12B, MEASURED 2026-07-25 on the author's
    # actual 8 GB card (2070S, b10107 quick screen): 12B decodes 39.1 tok/s at ngl 99
    # (6.7 GB file — nearly resident; E4B did 82.3 but the rule was the house
    # quality-first precedent: the 8|32 class accepts ~13 tok/s for the better writer,
    # and 12B clears that bar 3x). RAM-light (dense, ~1-2 GB spill) → honest at ram16.
    {"model_id": "gemma-4-12b-qat", "class_key": "dgpu-vram8|ram16", "switches": {
        "n_gpu_layers": "99", "ctx_len": "32768",
        "batch_size": "512", "ubatch_size": "512", "reasoning_budget": "1024",
    }},
    {"model_id": "gemma-4-12b-qat", "class_key": "dgpu-vram12|ram16", "switches": {
        "n_gpu_layers": "99", "ctx_len": "32768",
        "batch_size": "512", "ubatch_size": "512", "reasoning_budget": "1024",
    }},
    {"model_id": "gemma-4-12b-qat", "class_key": "dgpu-vram12|ram32", "switches": {
        "n_gpu_layers": "99", "ctx_len": "32768",
        "batch_size": "512", "ubatch_size": "512", "reasoning_budget": "1024",
    }},
    {"model_id": "gemma-4-12b-qat", "class_key": "dgpu-vram12|ram64", "switches": {
        "n_gpu_layers": "99", "ctx_len": "32768",
        "batch_size": "512", "ubatch_size": "512", "reasoning_budget": "1024",
    }},
    {"model_id": "gemma-4-12b-qat", "class_key": "dgpu-vram16|ram16", "switches": {
        "n_gpu_layers": "99", "ctx_len": "32768",
        "batch_size": "512", "ubatch_size": "512", "reasoning_budget": "1024",
    }},
    {"model_id": "gemma-4-26b-a4b-qat", "class_key": "dgpu-vram16|ram32", "switches": {
        "ctx_len": "32768", "batch_size": "512", "ubatch_size": "512",
        "reasoning_budget": "1024",
    }},
    {"model_id": "gemma-4-26b-a4b-qat", "class_key": "dgpu-vram16|ram64", "switches": {
        "ctx_len": "32768", "batch_size": "512", "ubatch_size": "512",
        "reasoning_budget": "1024",
    }},
    {"model_id": "gemma-4-26b-a4b-qat", "class_key": "dgpu-vram24|ram32", "switches": {
        "n_gpu_layers": "99", "n_cpu_moe": "0", "ctx_len": "32768",
        "batch_size": "512", "ubatch_size": "512", "reasoning_budget": "1024",
    }},
    {"model_id": "gemma-4-26b-a4b-qat", "class_key": "dgpu-vram24|ram64", "switches": {
        "n_gpu_layers": "99", "n_cpu_moe": "0", "ctx_len": "32768",
        "batch_size": "512", "ubatch_size": "512", "reasoning_budget": "1024",
    }},
]

# WHAT THE SEEDED TUNES WERE MEASURED ON — the model's real identity, not the id some
# host happened to choose. A class tune is the most expensive knowledge in this package
# (somebody sat at a box and measured it), and it was addressable ONLY by `model_id`: an
# app that seeds the same GGUF under its own id inherited nothing, silently, while its
# catalog card read "Nobody has tuned this model on any PC class yet".
#
# Measured 2026-08-03 on the i18n app: its row is `gemma-4-26b-a4b-qat-xl` —
# unsloth/gemma-4-26B-A4B-it-qat-GGUF @ UD-Q4_K_XL, byte-for-byte the file JustWrite
# calls `gemma-4-26b-a4b-qat` — so the 8 GB/32 GB row below (measured on the author's
# own 2070 SUPER) never applied and the model launched on automatic fit: ctx 16384 with
# NO n_cpu_moe, against a measured ctx 32768 + n_cpu_moe 21.
#
# This also makes the package honest with itself: `gemma-4-26b-a4b-qat` is NOT in
# DEFAULT_CATALOG — 6 of the 13 seeded tune rows resolve only because JustWrite adds
# that catalog row app-side (justwrite_server/seed_presets.py:113). Every other adopter
# has been shipping them as dead weight.
JW_CLASS_TUNE_IDENTITY: dict[str, dict] = {
    "gemma-4-26b-a4b-qat": {"hf_repo": "unsloth/gemma-4-26B-A4B-it-qat-GGUF",
                            "quant": "UD-Q4_K_XL"},
    "gemma-4-12b-qat": {"hf_repo": "unsloth/gemma-4-12B-it-qat-GGUF",
                        "quant": "UD-Q4_K_XL"},
    "gemma-4-e4b-qat": {"hf_repo": "unsloth/gemma-4-E4B-it-qat-GGUF",
                        "quant": "UD-Q4_K_XL"},
    "gryphe-styletune-v2": {"hf_repo": "mradermacher/Gemma-4-26B-A4B-StyleTune-V2-GGUF",
                            "quant": "Q4_K_M"},
}
