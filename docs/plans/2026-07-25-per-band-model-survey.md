# The per-band model survey — Part 2 (2026-07-25, the user's "do 1 and 2")

The widened survey (supersedes the old "higher-tier 24 GB+ survey" item): every dGPU band
resolves to appropriate models — the user's ruling. Keys are BANDS since the same-day band
ruling (recovery doc §22), so each band's recommendation is a plain `(model, band-key)`
class-tune row and exact match covers every real card. This doc records the candidates, the
verdicts, what was seeded, and the two decisions left open for the user.

## The law applied throughout

An untested outside candidate never becomes a recommendation (the A/B law — "test both, keep
the winner"; the Goetia lesson: the fastest candidate of its screen had a broken chat template
that only a real run exposed). So every SEEDED recommendation below is a carried, tested model;
outside candidates are named for FUTURE testing with the facts that would get them a fair
trial.

## The seeded recommendations (runner seed.py, DEFAULT_CLASS_TUNES — shipped with this doc)

| band key(s) | model | why | placement |
|---|---|---|---|
| `dgpu-vram12\|ram16/32/64` | **Gemma 4 12B QAT** | fully resident at est ~10.7 GB — the clean 12 GB pick; RAM-light (dense) so all three rungs | ngl 99 + the blessed mirrors |
| `dgpu-vram16\|ram16` | **Gemma 4 12B QAT** | the flagship's ~24 GB RAM appetite (min_ram 24000; measured 21.5 GB leg peak) excludes 16 GB-RAM boxes — the resident dense rung is the honest pick | ngl 99 + mirrors |
| `dgpu-vram16\|ram32/64` | **Gemma 4 26B-A4B QAT** (the flagship) | near-resident at est ~17.7 GB — needs SOME expert offload; the honest amount is unmeasured on unowned hardware | NO placement flags — `--fit` places (see the #24350 caveat below) |
| `dgpu-vram24\|ram32/64` | **Gemma 4 26B-A4B QAT** | fully resident (est ~17.7 GB < 24 GB) — the flagship at full speed, no offload | ngl 99 / ncmoe 0 (estimator-grounded; also sidesteps #24350) |

Deliberately NOT seeded: **`dgpu-vram8|ram16`** (the most common budget build). Its pick is a
genuine quality-vs-speed call with zero measurements — 12B partially offloaded on the 8 GB card
(better prose, slower) vs E4B fully resident (faster, a quality step down). The user's word
decides; either seeds in one row.

**The #24350 caveat, stated once:** llama.cpp's `--fit` (default on) fails to create a context
when loading a `gemma4_mtp` draft (upstream, reproduced on b10107, cure `--fit off`). The
16-band flagship rows leave placement to `--fit`, so those users can hit it with MTP on — but
that exposure exists with or without the row (fit-by-omission is the default behavior for any
untuned model) and is tracked in TASKS.md; newer builds are expected to fix it (#24795 shows
the family moving). The 24-band rows' explicit ngl 99 sidesteps it there.

## The candidates (GGUF-only screen; carried baselines to beat)

| candidate | band | facts (verified 2026-07-25) | verdict |
|---|---|---|---|
| **Qwen3.6-27B (dense)** | 24+ | Apache-2.0, dense 27B, 262K ctx, **built-in MTP**; `unsloth/Qwen3.6-27B-GGUF` exists — Q4_K_M 16.8 GB / IQ4_XS 15.4 GB → fully resident on 24 GB. Marketed on coding/agentic; prose quality UNKNOWN. Called "the strongest single default" for 24 GB by the July-19-2026 MarkTechPost roundup. | **THE test candidate for the 24+ crown.** Cannot be fairly benched on the 2070S (16.8 GB → heavy offload); quality-probe-only there, or judged when a 24 GB box exists. Until tested, the flagship keeps the band. |
| **Mistral Small 3.2 (24B dense)** | 16 / 24+ | Apache-2.0 family, Q4_K_M ~14 GB; 3.1/3.2's creative output reputed strong (community, not benchmarked); ~32K-class ctx | Second test candidate. On 16 GB it's tight (14 GB + KV, no iSWA); on 24 GB it competes with better-fitting options. Test after Qwen3.6-27B if at all. |
| Mistral Small Creative (25.12) | — | **API-only, deprecated 2026-03-31** (Mistral docs) — no weights, no GGUF | **OUT** — fails cross-platform/local outright, despite being the only prose-purpose-built official model found. |
| gpt-oss-20b | 16 | MoE 21B/3.6B active, native MXFP4 ~14 GB | Noted only — reasoning/tool-use emphasis; no prose signal anywhere found. Not shortlisted. |
| DeepSeek-R1-Distill-Qwen-32B | 24+ | Q4 ~18-20 GB | OUT for this catalog — a reasoning distill, not a prose model. |
| DavidAU Qwen3.6-27B "Fable-Fusion" (uncensored heretic MTP merge) | 24+ | community mega-merge of the same base | Noted for the uncensored lane only; community-merge class (never auto-picked; the Goetia template lesson applies doubly to deep merges). |

12-band: nothing found that beats resident Gemma 4 12B QAT on the stated criteria (prose-first,
QAT/proven quant, clean license); Qwen3.5-9B exists (MTP drafts, ~5.5 GB) but sits below the
12B on quality expectations — not worth a slot while 12B fits resident.

**Sources:** [MarkTechPost 24 GB roundup (2026-07-19)](https://www.marktechpost.com/2026/07/19/best-local-llms-you-can-run-on-a-single-24gb-gpu-in-2026-qwen-gemma-mistral-deepseek-compared/) ·
[Qwen/Qwen3.6-27B](https://huggingface.co/Qwen/Qwen3.6-27B) ·
[unsloth/Qwen3.6-27B-GGUF](https://huggingface.co/unsloth/Qwen3.6-27B-GGUF) ·
[Mistral Small Creative card](https://docs.mistral.ai/models/model-cards/mistral-small-creative-25-12) ·
[llmhardware.io writing guide](https://llmhardware.io/guides/best-llm-for-writing-locally) ·
[EQ-Bench creative writing](https://eqbench.com/creative_writing.html) (JS-rendered; table not
retrievable headlessly — worth a manual look for the 27B when deciding its test).

## CORRECTED same day — availability vs recommendation (the user's ruling)

My first rec gated the 27B's CATALOG ROW on a test no box of ours can run — a catch-22 the
user caught at once ("the goal is to have a model available to download for the users
hardware"). The test-gate belongs to RECOMMENDATION changes (the A/B law, on our test box);
AVAILABILITY follows the 70B/GLM precedent — research-grounded rows for hardware we don't
own, so bigger boxes have something to download. So:

- **`qwen3.6-27b` is SEEDED** (same day): `unsloth/Qwen3.6-27B-MTP-GGUF` UD-Q4_K_XL —
  deliberately the -MTP- variant, the qwen35 row's exact shape (nextn layers baked in,
  `mtp_builtin`, no external draft). The PLAIN repo was a trap the generator exposed: its
  tier-C probe "borrowed" a 15 GB full-model IQ4_XS from the MTP sibling as a "draft" —
  caught before commit. Facts from the real header: 17.9 GB, est_vram 19,594 MB → fully
  resident on 24 GB. quality_rank 14 (bottom of the chat rows) + a notes caveat carry the
  honesty: prose untested, never auto-picked, "try it against the default".
- **The 24-band class recommendation stays with the flagship** — not because the 27B is
  untested per se, but because the flagship is the catalog's own best-rated writer
  (quality_rank 5) and fully resident at 24 GB. A 24 GB user now has BOTH: the recommended
  flagship and the tier-native 27B one click away. One word flips the band recommendation
  if a prose trial (any 24 GB user's, or a slow 2070S quality probe) favors the 27B.

## The last decision — CLOSED same day, by measurement ("jsut do it")

**`dgpu-vram8|ram16` → the 12B.** The matchup had never been tested anywhere (checked: E4B's
only number was the Iris Xe laptop's 9.8 tok/s; 12B's only record was FAILING on that same
weak box; the desktop had screened E2B alone). One quick-screen run on the author's actual
8 GB card (2070S, b10107) settled it: **12B 39.1 tok/s decode at ngl 99** (6.7 GB — nearly
resident; the "offloaded and slow" worry was wrong) vs **E4B 82.3 tok/s**. The decision rule
was the house quality-first precedent — the 8|32 class accepts ~13 tok/s for the better
writer — and 12B clears that bar 3×, so the better writer takes the row; E4B remains the
speed rung below it in the catalog. Evidence:
`bench/results/desktop-rtx-2070s/speed-kit-2026-07-25/`. RAM transfer is clean (dense,
~1-2 GB spill → honest at ram16). Kit note from the run: the `-Models` filter wants EXACT
leaf filenames (`download-models.ps1:118`), and `run-bench.ps1` only auto-invokes the
downloader when the ENGINE is missing — by-hand runs call `download-models.ps1` first.

**The band arc is COMPLETE**: every dGPU band 8→24+, both iGPU classes, and the budget build
all resolve to a model + config; the 27B is downloadable for 24 GB users; no open decisions
remain from this survey.

## Verification

Runner suite after the seeds: 707 passed / 1 documented Windows lspci known-bad / 9 skipped.
The eight band rows + eight band class rows follow the shapes verified in recovery doc §21-22;
the refs list (the visible recommendation library) now carries 12 seeded rows and the wire-shape
test asserts membership rather than position.

## THE TRIM EXECUTED + the embed re-survey (same day, the user's rulings)

Chat: **Qwen3.6-35B-A3B REMOVED** (its all-round-alternative job measured ~2x slower than the
flagship on this box everywhere it applies; the 27B covers the family slot) and **E2B REMOVED**
(every served box has >=16 GB RAM and runs E4B; the CPU band was already ruled not viable —
added in the morning, its job erased by the same day's measurements). Seven qwen legs left
`gpu.json` with the row (leg ids are durable; their stored results remain history).

Embeds, after the user forced a REDO of my first survey (they found
`mradermacher/KaLM-Embedding-Gemma3-12B-2511-GGUF` in one search after my absence-of-evidence
claim; and the "Ailog" blog numbers needed primary-source verification — Harrier turned out
REAL, Bing team, MIT, April 2026, but sized 270M/0.6B/27B with no GGUF found): the set is now
**Qwen3-4B (the default everywhere — won the 2026-07-12 on-box A/B vs the 0.6B; +6.6 English
retrieval over it on the family's own card) + Qwen3-8B (the proven big-card rung) + KaLM-Gemma3-12B
(the 2026 MMTEB leader as the big-card CONTENDER — availability, not recommendation; rank 52
keeps it below the proven 8B so the pick rule never auto-recommends it; header verified:
arch `gemma-embedding`, ctx 131072, 7.3 GB Q4_K_M)**. Cut: 0.6B, nomic v1.5, BGE-M3.
WATCHLIST: Harrier-27B if a GGUF lands; the KaLM trial belongs on the user's 32 GB card.

Two more corrections the user caught, both fixed with the trim:
- **The wizard embed floor was ALREADY BUILT** (#274 — `pickBestEmbedId`,
  `ui/src/common/services/modelPick.js:134-145`: CPU-tier always eligible, else
  minVram <= leftover-after-chat-pick). My "still tracked, pull it forward" was stale
  doc-memory; nothing needed building.
- **Seeded `notes` were box-hardcoded** — the catalog rendered "Your notes:" over MY bench
  numbers ("Measured on the 8 GB floor: writer TTFT 1.5-1.7s...") and internal jargon
  ("Lab A/B", "never auto-picked"), meaningless on any other machine. All twelve notes
  fields (11 runner + the JW flagship extra) rewritten as box-independent plain words;
  the measurements stay in the seed comments, plan docs, and bench results where they
  belong. And the "Hardware/model class default" chip now NAMES the class it means,
  via the classes panel's own formatter (`classKeyLabel`) — e.g.
  "Hardware/model class default · 8 GB VRAM · 32 GB RAM".

Final catalog: **8 chat + 3 embeds**. Every row's job in one line each: flagship (default),
12B (small dense), E4B (iGPU laptops), 31B/70B/GLM (big-rig curation trio, campaign decides),
27B (24 GB native option), StyleTune (prose voice), EZ (uncensored) · 4B (embed default),
8B (embed big-card), KaLM (embed contender).

## EMBED PLACEMENT HONESTY (same day, the user's "your rec go" after their design review)

The user caught the badge contradiction (an 8B embed chip reading "Fits · needs ~6.8 GB VRAM"
on a box whose policy forces it onto the CPU) and then pressure-tested the placement rule
itself ("surely we can tell when to load embed vs main"). Verdict: sequence-aware/live
tracking rejected — it needs the same predicted chat footprint the static rule already uses,
plus state machinery, for one rare cloud-default edge. What shipped instead (runner):

1. **The chat-first baseline swap** — `_embed_gpu_leftover_mb` now subtracts the chat
   default's CLAIM (`est_vram_mb`, falling back to `min_vram_mb`) instead of the bare floor.
   The proof case is a 16 GB card: floor math computed 10+ GB of "leftover" and handed the
   8B embed a GPU claim beside a flagship whose est is ~17.7 GB; est math yields 0 → CPU,
   chat-first. `est_vram_mb` rides `RecommendedFor` (additive; JV deferred to the later
   integration per the user).
2. **ONE placement source** — new `RunnerService.embed_placement(model, hardware)` →
   ("cpu"|"gpu", leftover): `_apply_embed_placement` enforces it at load, and the models
   endpoint ships it per embed row (`embedPlacement` / `embedLeftoverMb`), so the UI can
   never promise a placement the loader refuses.
3. **Honest surfaces** — the catalog fit chip on embedding rows now reads CPU/GPU with a
   plain-words title (RAM-based for CPU placement); `m.fit` itself is untouched underneath
   (section grouping still reads it). Quick Setup's embed hint states where the selected
   embed will run, and the wizard's own leftover uses the same est-based claim
   (`wizardLeftoverMb` — pick and load can no longer disagree on baseline semantics).

Tests: the placement block's fixtures now carry the real est/min shape; the 16 GB proof
case is pinned; `embed_placement` verdicts pinned as the one source. Runner 708 passed /
1 documented lspci known-bad; JW gates fully green.
