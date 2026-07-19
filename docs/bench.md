# The LLM bench harness

Run models — GPU or CPU, any switches — through **the real app** against the
tutorial book, capture everything, and read the results afterwards. The point is
that a bench run costs no agent tokens: you start it, it writes a folder, and
the analysis happens by reading that folder.

```bash
npm run bench:gpu -- --dry                   # print the plan, touch nothing
npm run bench:gpu                            # run the GPU band, headless
npm run bench:cpu -- --legs cpu-gemma-26b    # measure ONE leg
npm run bench:cpu -- --missing               # measure only legs never measured yet
npm run bench:cpu -- --report                # print the band's table — runs nothing
npm run bench:cpu -- --tauri                 # drive the REAL app window
npm run bench:cpu -- --headed                # watch it in a browser
npm run bench -- --restore bench-results/2026-07-19_21-04-11-cpu   # crash recovery
```

The three drive modes are **flags**, not separate commands — `--headless`
(default), `--headed`, `--tauri` — so they combine freely with any band and any
leg selection.

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

## The three modes

| Mode | What it drives | Use it for |
|---|---|---|
| `--headless` (default) | Playwright Chromium against the vite dev server | Long/overnight runs |
| `--headed` | The same, visible | Watching a run go by |
| `--tauri` | The **real desktop app**, attached over WebView2 CDP | Seeing the Bench preset and the AI task strip in your actual GUI while it runs |

`--tauri` launches the app itself (`npm run dev`) with remote debugging enabled
and attaches to its webview. It needs a **DEV** build — the bench hook is
stripped from production builds.

Browser modes expect the server and vite to already be up; pass `--autostart` to
have the bench start whatever is missing.

## What a run changes, and what it never touches

**Changes**
- The `Bench` preset row. It persists between runs on purpose — you asked to see
  it in the GUI.
- The per-feature preset assignments for the features under test. These are
  **snapshotted to `restore.json` before the first write** and restored at the
  end, on Ctrl-C, and via `--restore`.
- Model weights it had to download (a normal product action).
- The `bench-results/` folder (git-ignored).

**Never touched:** tune rows, switch bundles, hardware rows, the engine
directory, `models.ini`, and — emphatically — **there is no DB reset anywhere in
the bench**. A reset would delete Smart-Add model rows, tunes and measurements.

> **Caution:** the bench and your open app share one server. If you run a bench
> while using the app, the features under test are pointed at the Bench preset
> for the duration, so your own AI actions during that window use the leg's
> config. Restore puts it back.

## Reading the results

```
bench-results/<run-id>/
  summary.md                  ← start here
  config.json                 the resolved config (defaults applied)
  env.json                    engine build · GPU/driver · CPU/RAM · app sha
  book.json                   the book, chapters and characters used
  restore.json                the pre-run assignment map
  01-<leg>/leg.json           load result · llama-bench rows · peaks · routes
  01-<leg>/<feature>-1.json   one capture per feature run
```

`summary.md` holds two tables — the raw engine matrix (pp/tg/TTFT/peak VRAM/peak
RAM per leg) and the feature matrix (median TTFT, wall time, output size, token
usage, flags) — plus every failure spelled out. Per-feature captures hold the
**full model output** and, for chat, the retrieved citation chunk ids.

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

`scripts/bench/configs/example.json` documents every field with its default.
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
npm run bench -- --restore bench-results/<run-id>
```

Re-applies the assignment snapshot and verifies it by re-reading. Everything
completed before the crash is already on disk; legs are written as they finish.
