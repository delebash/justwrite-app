# bench/results — ALL results live in git (user ruling 2026-07-23)

One folder per MACHINE, split by result KIND (also the user's ruling):

- `<machine>/bench/` — the STANDARD bench harness (`bench/harness/run.js`):
  feature-level runs through the app pipeline (TTFT/tok-s with cache effects).
  The harness always runs on the desktop, so it writes new dated runs into
  `desktop-rtx-2070s/bench/` by default (`-gpu`/`-cpu` suffix per config).
- `<machine>/kit/` — the PORTABLE SPEED KIT (`bench/speed-kit/`, its ONE home): raw
  llama-bench matrices + detect-facts, comparable across machines (same build,
  same models, same script). Copy a machine's returned `results*.jsonl` +
  `bench-log*.txt` + `detect-facts.txt` here and commit.

Machines:
- `desktop-rtx-2070s/` — this box (RTX 2070 SUPER + Ryzen 5700X).
- `laptop-core-ultra-7/` — Core Ultra 7 165U (Arc iGPU, uma:1, 32 GB).

New machine → new `<machine>/kit/` folder. No loose result files outside this
tree (everything committed — the whole tree is text-sized).

## What the runs decided (index of verdicts)

The trees above are evidence; the rulings they fed live in `docs/plans/*`. The map so
far (add a row when a run decides something — the summaries alone don't say what was
concluded):

| Evidence (runs) | Decision | Recorded in |
|---|---|---|
| `2026-07-21_*-gpu` + think legs of `2026-07-22_03-28-55-gpu` | Think A/B costs quantified per feature; MTP acceptance verified paying on this box (tg 13.4 raw → 25–29 tok/s drafted) | `docs/plans/archive/2026-07-20-mtp-verify-think-ab-bench.md` |
| `2026-07-22_03-28-55-gpu` (+ `2026-07-22_14-53-06-gpu` bible legs) | Gemma 26B-A4B QAT confirmed flagship; **Qwen3.6-35B-A3B removed** — ~2× slower through the app's features everywhere it applies; the 27B keeps the family slot | `docs/plans/archive/2026-07-25-per-band-model-survey.md` |
| `2026-07-22_*-cpu` | CPU band ruled not viable; E2B removed | `docs/plans/archive/2026-07-22-igpu-research-and-cpu-band-recovery.md` + the survey doc |
| `2026-07-25_*-gpu`, `2026-07-26_*-gpu` | Style-tune (Gryphe) + uncensored (EZ) rows measured (deliberate choices, never auto-picked); refusal probes; dense **Gemma 4 31B ~1.2 tok/s tg** → the dense-spill shape non-viable on 8 GB | survey doc trim + the run summaries (`gpu-gemma-31b`, `gpu-refusal-*`) |
| `laptop-core-ultra-7/kit` | Arc iGPU (uma) class measurements feeding the per-class configs | the kit summary |

User-facing digest of the same story: `docs/models.md` § "How the recommendations were
chosen".
