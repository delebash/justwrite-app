# bench-results — ALL results live in git (user ruling 2026-07-23)

One folder per MACHINE, split by result KIND (also the user's ruling):

- `<machine>/bench/` — the STANDARD bench harness (`scripts/bench/run.js`):
  feature-level runs through the app pipeline (TTFT/tok-s with cache effects).
  The harness always runs on the desktop, so it writes new dated runs into
  `desktop-rtx-2070s/bench/` by default (`-gpu`/`-cpu` suffix per config).
- `<machine>/kit/` — the PORTABLE SPEED KIT (`E:\laptop-speed-kit`): raw
  llama-bench matrices + detect-facts, comparable across machines (same build,
  same models, same script). Copy a machine's returned `results*.jsonl` +
  `bench-log*.txt` + `detect-facts.txt` here and commit.

Machines:
- `desktop-rtx-2070s/` — this box (RTX 2070 SUPER + Ryzen 5700X).
- `laptop-core-ultra-7/` — Core Ultra 7 165U (Arc iGPU, uma:1, 32 GB).

New machine → new `<machine>/kit/` folder. No loose result files outside this
tree (everything committed — the whole tree is text-sized).
