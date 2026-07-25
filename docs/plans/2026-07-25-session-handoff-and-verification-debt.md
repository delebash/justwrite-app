# 2026-07-25 — session handoff: what shipped, what is VERIFIED, and what is still unproven

Written at the end of a long session, before compaction. Its purpose is to stop the next
session repeating this one's central mistake: **treating a plan doc, a tracker line, or a
passing unit test as proof of live behaviour.** Everything below is marked either VERIFIED
(with how) or UNPROVEN (with the exact check that would close it).

## The commits

| repo | sha | what |
|---|---|---|
| runner | `825b9af` | download Cancel/Dismiss in failed + "Getting ready" states |
| runner | `40737fe` | table convergence — 3 onto `UiTable`, 2 onto `.ui-formgrid` |
| JW | `b78337e` | tracker record + two stale recap facts corrected |
| JW | `2ceeb26` | boot: `Promise.all` on the two boot fetches; the other "cheap item" measured and dropped |
| JW | `ecde415` | `scripts/py.js` — run the PROJECT's python, not PATH's |
| JW | `56388f0` | bench harness uses `findPython` too — one shared resolver |
| JW | `cf935df` | refusal probe v1 + `repo` leg field |
| JW | `4106966` | refusal probe v2; uncensored A/B settled |
| runner | `74102f5` | **StyleTune shipped an unloadable drafter — repointed** |
| JW | `fe0eae0` | corrected the `--fit` claim |
| runner | `9eb43a9` | class tune: StyleTune `spec_type: none` on the 8 GB class |
| JW | `41c62a6` | Goetia tested and rejected |

## VERIFIED — do not re-check

- **Table convergence.** Rendered and measured in a scratchpad harness: `table-layout: fixed`,
  sticky header, top-aligned cells, table 1100px inside a 1100px panel, ZERO clipped cells,
  section+divider rows spanning 7 columns, six live sort headers, clicking Bench re-sorts, no
  JS errors. Confirmed good on the user's box ("the whole table sweep all good").
- **`.ui-formgrid` reaches the app.** I deleted local CSS from `PricingEditor` /
  `LuRunnerBinaries` and replaced it with a kit class — checked the BUILT bundle
  (`dist/assets/*.css`), both `ui-formgrid` and `ui-table-fixed` present. The kit's
  `index.js:9,19` loads `common/styles.css` on any import.
- **`scripts/py.js`.** `npm run test:server` 121 passed; `test:fast` completes all three legs;
  exit codes propagate (5 on failure, 0 success, 2 no-args).
- **HauhauCS `repo` pin.** Run against the LIVE cache: ambiguous without it, resolves to
  `…HauhauCS-Balanced-Q4_K_M.gguf` with it.
- **Uncensored A/B → keep EZForever, drop HauhauCS.** On the violence probe HauhauCS cuts the
  ROPE (like stock QAT); EZForever writes the act. Neither ever refuses — the failure mode is
  DEFLECTION, invisible to any text metric (see the DO-NOT-ADD comment above `looksRefused`).
- **StyleTune ranking.** Fits 8/30 layers vs the flagship's 10/30 (`fit.py` estimator, cached
  headers, no download). Drafter earns nothing: 10.85/11.52/11.71 with vs 10.89/11.88/11.50
  without. Better prose, no comprehension loss ⇒ second-tier row.
- **Goetia REJECTED.** Fastest of all (11/30 layers, 16.3-16.4 tok/s) but raw `/completion`
  leaks `<|channel>thought` and `/v1/chat/completions` returns an EMPTY message. Broken chat
  template in the GGUF.
- **Boot measurements.** Warm pre-listen ~975 ms = import 895 / `create_app` 43 /
  `seed_workspace` 36. Serving `/health` before seeding buys 36 ms — dropped.

## UNPROVEN — shipped but never exercised (the debt)

1. **StyleTune with the repointed drafter has never been LOADED.** `74102f5` changed the seed;
   unit tests prove the row seeds, not that the engine starts. *Close it:* re-run
   `npm run bench:gpu -- --autostart --legs gpu-styletune` with MTP on and confirm `load.ok`.
   This is exactly the gap that hid the original defect for three weeks.
2. **The `spec_type: none` class tune has never been observed reaching the engine.** *Close it:*
   load StyleTune on this box and confirm no `--model-draft` in the launch line.
3. **`PricingEditor` / `LuRunnerBinaries` never RENDERED.** Class reachability proven, visual
   correctness not. *Close it:* open Settings → the pricing + engine-binaries tables and look.
4. **`drive.js`'s `findPython`** — resolver and a manual spawn proven; no bench has actually run
   through `drive.js` since. *Close it:* any `npm run bench:gpu` with `--autostart`.

## TRACKER CORRECTIONS OWED (the audit found these; not yet applied)

- **"iGPU detection ①–③" — CLOSE IT.** Detection is not broken. `mem_arch`
  (`runner/hardware.py:123-133`) classifies by platform + vendor + a >=4 GB physical signal,
  deliberately "NO heavy deps", "no name matching" — so the doc's proposed "add iGPU name
  patterns" would REGRESS an explicit design choice. Replace with ONE narrow item: feed the
  engine's `uma: 0/1` flag (confirmed laptop 1 / 2070S 0, currently unused — zero refs in
  `hardware.py`) into `mem_arch` to catch unified-NVIDIA (DGX Spark), the case its own
  docstring names as falling through.
- **The class-system redesign — CLOSE IT ENTIRELY.** All five parts of
  `docs/plans/2026-07-22-igpu-research-and-cpu-band-recovery.md:471-490` are done or moot:
  part 1's pick map was **DELETED 2026-07-22** (`just-llm-runner/llm_runner/llm/db.py:312-318`);
  part 2's architecture token exists (the Hardware-type dropdown's three options map onto
  `format_class_key`'s three branches, `runner/hardware.py:80-90`); part 3 is largely the
  existing class panel; part 4 is no work; part 5 is happening. **There is no "grammar
  decision" pending** — users never see the key; they pick a type from a dropdown and type two
  numbers, and the string is generated internally.
- **BANNER `2026-07-22-igpu-research-and-cpu-band-recovery.md` §462-490 as SUPERSEDED.** Its
  analysis was overtaken the same day it was written. I relayed it as current for four turns.
- **The `--fit` entry** still says "worth an audit of untuned rows". The audit ran: `model_tunes`
  is empty, all 14 `class_tunes` rows belong to one model, yet the untuned uncensored rows
  measured 60.5% / 58.9% acceptance. Untuned rows are NOT losing MTP. Drop the clause.
- **"E4B/E2B have no catalog rows" — CONFIRMED still true** (zero `E4B` in `seed.py`).

## THE LESSON (why this file exists)

Three of three tracker items I spot-checked were wrong or mischaracterised, and four of my own
shipped changes were never exercised. Both have one root: **stopping at the first green signal**
— a passing unit test, a doc's summary, a build that compiled — and treating it as proof of
behaviour. The one thing that went right today (the catalog table) went right only because it
had been got wrong three times and was finally RENDERED.

A `file:line` not opened this turn is a guess wearing a citation. A plan doc records what
someone INTENDED and is often superseded within days — and a fixed defect leaves its note at
exactly the line the doc points you to, which is where the correction hides.

**Owed and not done:** a diff-based pass over the twelve commits above. This audit covered what
I could recall doing, and in a session this long recall is itself unreliable — the four
unexercised changes are the ones I remembered, not necessarily all of them.
