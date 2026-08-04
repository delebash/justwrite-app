# The LLM bench harness

Run models — GPU or CPU, any switches — through **the real app** against the
tutorial book, capture everything, and read the results afterwards. The point is
that a bench run costs no agent tokens: you start it, it writes a folder, and
the analysis happens by reading that folder.

```bash
npm run bench:gpu -- --dry                   # print the plan, touch nothing
npm run bench:gpu                            # run the GPU band
npm run bench:cpu -- --legs cpu-gemma-26b    # measure ONE leg
npm run bench:cpu -- --missing               # measure only legs never measured yet
npm run bench:cpu -- --report                # print the band's table — runs nothing
npm run bench -- --restore bench/results/2026-07-19_21-04-11-cpu   # crash recovery
```

**The bench always runs headless — the terminal is the view.** It drives the
app's services directly through the bench hook, so a window would have nothing
to show; instead the runner prints every leg and every feature run as it goes,
and `summary.md` holds the tables at the end. (The old `--headed`/`--tauri`
watch modes were removed 2026-07-20 for exactly that reason — there was nothing
to watch.)

**The simplest setup: have your app running (`npm run dev`).** The bench then
connects to *its* server — your data root, your installed engine, your models.
Installing the engine (and a model) is a one-time job you do **in the app**
(Quick Setup, or AI page → Install engine); the bench never installs anything.
If the server it reaches has no engine, the run **stops with an error** telling
you exactly that — it does not limp through a run that can't load a model.

## Two bands

A config is a **band**: a standing question about this box, not a one-off
experiment.

- **`configs/gpu.json`** — "which models write well on my GPU?"
- **`configs/cpu.json`** — "is a no-dGPU box usable for writing?" (every leg pure CPU)

Add a leg whenever a new model is worth testing. Legs have **durable ids**
(`gpu-gemma-26b`, `cpu-gemma-12b`, …) because that id is how a result is matched
across runs — rename one and you orphan its history.

The CPU band does **not** re-run the GPU baseline. It lists `gpu-gemma-26b` in
`baselineRefs`, which recalls that leg's stored result into the table as a
comparison row. Run the GPU band once; every CPU run after that shows the bar for
free.

## Results accumulate — a new model doesn't mean re-running everything

Results are keyed by leg id and persist across runs, so:

```bash
# a new CPU model came out — add its leg, measure only it
npm run bench:cpu -- --legs cpu-newmodel
```

…still prints the **whole band's table**: the new leg fresh, every other leg
recalled from its last run. Each row carries a **source** column — `fresh`,
`stored 2026-07-19`, or `baseline` — and a `⚠` when the recalled result ran on a
different engine build, against a **different book**, or when that leg's own
config has changed since. (Changing `repeats` doesn't count — more samples of
the same measurement is not a different measurement.) Those comparisons stay
useful; they just aren't like-for-like, and the table says so instead of letting
you assume.

Two more honesty rules: a leg whose only stored record is a **failed load**
still counts as *missing* — so `--missing` retries it next time instead of
retiring it on its own failure (Bonsai before its Smart Add is the concrete
case). And a recalled leg measured before a feature joined the band gets a
"no data for: X" note rather than a table that looks complete.

`--report` regenerates a band's table from stored results without running
anything or needing a server. Deleting a run folder simply removes it from the
store — there is no index to keep in sync.

## What a run actually does

One leg = one *(model × launch switches × request tunables)* combination. For
each leg, in order:

1. **Writes the leg's tunables into the `Bench` engine preset** — temperature,
   top-p, max tokens, think, reasoning effort, samplers. This is a normal preset:
   it lives in the DB and you can see it on the **AI page**, including mid-run.
2. **Points the features under test at that preset** (the same per-action
   assignment the *Routing by feature* tab edits). This is why the run goes
   through the production resolution path rather than a side channel.
3. **Loads the leg's model with that leg's launch switches** — `nGpuLayers`,
   `nCpuMoe`, `ctxLen`, threads, batch sizes. These are sent **ephemerally** on
   the load call; they are never saved, so your tune rows are untouched. The load
   also *downloads* the weights if they aren't cached yet, which is why it runs
   before the raw benchmark (and gets a 4-hour ceiling when a download is needed).
4. **Runs each feature through the app**, `repeats` times, capturing the full
   output, timings, token usage, the resolved route, and any flags.
5. **Stops the model, waits for the process to actually exit**, then runs
   **`llama-bench`** for the raw prompt-processing / generation matrix with
   nothing resident to compete for VRAM/RAM.
6. Writes the leg's results and moves on. At the end, assignments are restored.

## How it runs

Headless Chromium drives the DEV renderer (vite) — the bench hook is stripped
from production builds. The bench expects the server and vite to already be up
(they both are whenever your app is running); pass `--autostart` to have it
start whatever is missing. An autostarted server runs on **your app's data
root** (the same `dataroot.txt` / dev-default resolution the app uses), so it
sees the engine and models you installed in the app — a server you start by
hand does *not* do this unless you set `JUSTWRITE_DATA_DIR` yourself.

## What a run changes, and what it never touches

**Changes**
- The `Bench` preset row. It persists between runs on purpose — you asked to see
  it in the GUI.
- The per-feature preset assignments for the features under test. These are
  **snapshotted to `restore.json` before the first write** and restored at the
  end, on Ctrl-C, and via `--restore`.
- Model weights it had to download (a normal product action).
- The `bench/results/` folder (git-ignored).

**Never touched:** tune rows, switch bundles, hardware rows, the engine
directory, `models.ini`, and — emphatically — **there is no DB reset anywhere in
the bench**. A reset would delete Smart-Add model rows, tunes and measurements.

> **Caution:** the bench and your open app share one server. If you run a bench
> while using the app, the features under test are pointed at the Bench preset
> for the duration, so your own AI actions during that window use the leg's
> config. Restore puts it back.

## Reading the results

```
bench/results/<run-id>/
  summary.md                  ← start here
  config.json                 the resolved config (defaults applied)
  env.json                    engine build · GPU/driver · CPU/RAM · app sha
  book.json                   the book, chapters and characters used
  restore.json                the pre-run assignment map
  01-<leg>/leg.json           load result · llama-bench rows · peaks · routes
  01-<leg>/<feature>-1.json   one capture per feature run
```

`summary.md` holds the tables — the raw engine matrix (pp/tg/TTFT/peak VRAM/peak
RAM per leg), the feature matrix (median TTFT, wall time, output size, token
usage, flags), an **MTP acceptance** table per leg (draft acceptance from the
leg's measure probe — `⚠ never engaged` when a spec-configured model didn't
actually speculate), and, when a model has two or more legs, an **A/B block**
comparing them feature-by-feature (wall · tokens) — plus every failure spelled
out. Per-feature captures hold the **full model output** and, for chat, the
retrieved citation chunk ids.

**Think A/B workflow.** To measure what thinking costs and whether it helps, add
a second leg with the same model + `"tunables": { "think": true }` (see
`gpu-gemma-26b-think` in `configs/gpu.json`), run it (`npm run bench:gpu -- --legs
gpu-gemma-26b-think`) — the baseline is recalled from the store — and read the
A/B block for the cost, the two legs' captured answers side by side for the quality.

**Hard-question legs (the quality instrument).** An easy retrieval question cannot
show a thinking gain — its answer sits in the excerpts. The `gpu-gemma-26b-hq*`
leg pairs ask questions that require CONNECTING facts across chapters, with a
written **answer key in each leg's `_why`** (full prose keys in the plan doc), so
the A/B is judged as correctness-against-the-key, not vibes. Think legs run
`reasoningEffort: "high"` (the seeded local map's 8192-token budget) so the test
isn't cap-limited, and `repeats: 3` (run 1 is prompt-cache-cold — a timing note
only; quality is unaffected). Adding your own: same pattern — one question, two
legs differing ONLY in tunables, an answer key in `_why`, `features: ["chat"]`,
`llamaBench: null`.

Nothing is scored automatically. Accuracy is judged by reading the captures;
that is what keeps the harness token-free.

### Things the numbers won't tell you unless you know them

- Medians are reported, not means: this workload carries roughly ±10%
  run-to-run variance, so a single sample is not a measurement (`repeats`
  defaults to 2).
- `TTFT` on feature rows is measured client-side and **includes** retrieval and
  prompt assembly — it is the wait a user actually experiences.
- `critique` and `entitySweep` have no TTFT (they don't stream) **and no token
  counts** — their services discard the usage the server returns, so those
  numbers exist on the wire but never reach the result. Wall time is the measure
  there. (Prompt-token counts on the two biggest-prompt features are exactly what
  a prompt-processing test wants, so this is worth fixing in the services.)
- `chat` and `characterChat` send their own temperature, which overrides the
  preset's, so a leg's `temperature` does not reach those two. Runs carrying this
  are flagged `temperature-fixed-by-caller`. Every other tunable applies to all
  six features.
- Without a RAG index, `chat` and `characterChat` silently run in bible-only
  mode — a different prompt. `ensureIndex` (default on) builds it first.

## Writing a config

`bench/harness/configs/example.json` documents every field with its default.
`gpu.json` and `cpu.json` are the two real ones.

Feature keys are the app's action ids — `chat`, `characterChat`, `entitySweep`,
`critique`, `writerAI.continue`, `writerAI.rewrite`. They are validated against
the running app before any leg starts, so a typo fails in seconds rather than
after a model load.

Model ids are **catalog ids**, not file paths. For `llama-bench` the GGUF is
resolved out of the model cache automatically; set `gguf` explicitly on the leg
if a model is ambiguous (the resolver refuses to guess between equal matches).

## If a run dies

```bash
npm run bench -- --restore bench/results/<run-id>
```

Re-applies the assignment snapshot and verifies it by re-reading. Everything
completed before the crash is already on disk; legs are written as they finish.

## Deep detail absorbed from the build plan (docs campaign 2026-08-04)

The 2026-07-19 harness plan is archived (`../plans/archive/2026-07-19-llm-bench-harness.md`);
these are the load-bearing facts it carried that this doc lacked:

- **Routing rides `feature_preset_refs`, never per-request overrides** — the
  resolved preset's long-tail samplers apply wherever the request doesn't name the
  key, so an override payload can't carry a full leg config and can't null a preset
  sampler; there is no per-request preset id.
- **The bench writes ZERO tune rows by construction** — presets carry no launch
  switches; switches ride `POST /v1/llm-runner/load` as transient measure-only
  inputs, so a crashed run can't degrade the daily setup. There is deliberately no
  "test hardware" row.
- **The DEV seam**: `window.__jwBench` (`services/benchHook.js`) — `info() ·
  activate() · ensureIndex() · features() · run(featureKey, args)`; owns the
  per-run AbortController + timeout and NEVER throws ("a model that wedges is a
  finding"). Dynamically imported under `import.meta.env.DEV`; `grep __jwBench
  dist/` is empty — it cannot ship.
- Why not bare HTTP: chat/characterChat/entitySweep assemble prompts CLIENT-side —
  HTTP would measure a different prompt.
- **Store semantics**: the unit of truth is the LEG (grouped by leg id, newest
  wins, no index to drift); `leg.json` keeps metrics only (model text lives once in
  the per-feature capture); `legFingerprint` deliberately EXCLUDES `repeats` and
  INCLUDES tunables (a think leg gets its own identity); the run stamps the ACTUAL
  measured project id and `stalenessOf` flags book A→B; `--missing` counts DATA,
  not presence (the Bonsai trap). `legRecord.measure` carries
  `draftN`/`draftNAccepted`/`draftAcceptance` (the MTP fields).
- **Engine discipline**: load ceilings 4 h with downloads / 30 min default (and the
  ordering lesson: llama-bench must run AFTER the load or a model's first leg
  silently skips its raw matrix); `POST /stop` returns while the child still exits —
  `waitEngineQuiet()` polls the OS process list and logs a timeout as a
  CONTAMINATION warning; `resolveGguf()` requires ≥ half the id's tokens to match
  and refuses ambiguity (reporting one model's numbers under another's name is the
  worst failure this harness could have).
- **Endpoint anchors**: `POST /engine-presets` mints its own id → find-by-name-
  then-update; `GET/PUT /v1/ai/preset-assignments[/feature]`; `/measure` takes
  QUERY params, not a body; residency from `/resident`, never the single-model
  `/status`.
- Drive modes: Playwright attaches to WebView2 over CDP via
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>`;
  `bench:gpu`/`bench:cpu` are BAND aliases composing with mode flags. (The plan's
  `--headed`/`--tauri` flags were removed 2026-07-20 — superseded, do not revive
  from the archive.) NOTE the plan's paths (`scripts/bench/`, `bench-results/`) are
  the OLD layout; this doc's `bench/harness/` + `bench/results/` are current.
- The hard-question answer keys live in
  `../plans/archive/2026-07-20-mtp-verify-think-ab-bench.md` §6.
- **Standing debt** (also tracked): no end-to-end bench run has reached a live
  model through the harness; `--restore` proven only against a fake client;
  `book-smoke.js` needs port 1420 free.
