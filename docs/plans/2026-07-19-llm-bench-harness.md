# LLM bench harness — token-free model × switches testing through the real app (2026-07-19)

**Status: BUILT, gates green, NOT yet run end-to-end on the box.** User doc:
`docs/bench.md`. First consumer: the CPU-only band test
(`just-llm-runner/docs/plans/2026-07-19-cpu-only-band-test.md`).

## Why

The user needs to test the LLM system — different models, GPU and CPU, different
switches — for performance and accuracy against the default tutorial book and the
default feature settings, repeatedly, **without spending agent tokens driving the
runs**. Every prior round was driven live from a session: the 2070S tuning sweep's
harness was a scratchpad `bench.py` that died with the session
(`docs/plans/archive/2026-07-06-llamacpp-config-tuning-2070s.md:209`), and the pending
CPU-band test is written as a recipe for a human to execute by hand.

The user's own framing: *"we actually just have a test preset and a test hardware
that we use, basically all going through our app but just headless or even
changing it to full head in an instance so i could actually see the test preset in
my gui, but the script just automates the run, each different config run just
updates the test preset"* — plus **"bench is fine"** as the name and **no DB
reset** (it would delete Smart-Add model rows).

Flow after this: Claude edits a legs config → the user runs `npm run bench` →
results land in `bench-results/<run-id>/` → Claude reads `summary.md` and fills in
the decision doc's table. Claude's cost drops to config edits + reading results.

## The design, and why each piece is what it is

**The Bench preset carries request tunables (the user's idea).** The one-source
model says a preset owns the model + every tunable, so a leg's temperature/top-p/
think/reasoning/samplers need no new config mechanism — they are preset fields.
It is a real preset row, visible on the AI page during a run, which is what the
user asked for.

**Routing goes through the real assignment refs, not request overrides.** An
earlier lean was to pass per-request overrides on `/v1/ai/run`. Rejected on a read
of the run path: `_plane2_extra` applies the resolved preset's long-tail samplers
wherever the request doesn't name that key (`prompts.py:373-380`), so an override
payload is not a faithful carrier of a full leg config, and a request can't null a
preset sampler. Re-pointing `feature_preset_refs` IS the production path (identical
to a user assigning features to a custom preset on the Routing tab), so the bench
measures what the app does. There is no per-request preset id
(`preset_resolve.py:53-57`).

**No "test hardware" row.** Launch switches don't live in presets — `EnginePresetRow`
says so explicitly ("No launch switches (§7.1)", `presets_api.py:39-60`). They ride
`POST /v1/llm-runner/load`, whose named Plane-1 fields + transient `switches` map
are documented as "transient tuning inputs (measure-only), **not saved per-model**"
(`runner/schema.py:221-265`). So a leg's `-ngl 0`/threads/ctx are **ephemeral** and
the bench writes **zero** tune rows — no fake hardware key, nothing to restore, and
no way for a crashed run to leave the daily setup degraded.

**Features run through a DEV hook, not UI clicks.** chat/characterChat/entitySweep
assemble their prompts CLIENT-side (retrieval → cited excerpts → `runAiFeatureStream`,
`rag/chat.js:79-195`), so bare HTTP would measure a different prompt than the app
sends. Clicking real buttons would work but couples the harness to UI layout.
`window.__jwBench` calls the same service functions the buttons call — the
`window.__jwProject` precedent (`main.js:184-196`), same DEV guard.

**Three drive modes, one script.** Tauri 2 renders in WebView2 on Windows, and
Playwright attaches to any WebView2 over CDP when the app is launched with
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>` (Playwright's
own webview2 doc, fetched 2026-07-19). So headless / headed / real-app differ by a
flag.

**Capture-only.** The harness records outputs, timings, usage, resolved route and
mechanical flags (error · timeout · empty output · JSON contract unparsed). It
scores nothing — judging by reading is what makes it token-free.

## What changed · file:line

**New — JustWrite only; zero `just-llm-runner` edits (its endpoints are consumed as-is).**

- `scripts/lib/smoke-common.js` — **shared** `findChrome()` / `waitReady()` /
  `isUp()` / `sleep()`. Extracted because CLAUDE.md forbids a hand-rolled browser
  path and the rule was previously satisfied by *copying* `findChrome()` into each
  script. **An unfiltered `grep -rln findChrome scripts/` found 20 copies** — the
  bench would have been the 21st. Also **fixes a real defect**: those copies scan
  Linux layouts only (`chrome-linux/chrome`), so they find nothing on Windows. The
  shared version scans win64/win/mac layouts + `%LOCALAPPDATA%\ms-playwright`.
  **PARTIAL, and stated as such:** the two GATES + the bench now import it; the
  other **19** copies are one-off probe scripts for shipped work and still carry
  their Linux-only lookup. Filed in `docs/TASKS.md`, not silently claimed done.
- `scripts/headless-smoke.js:15-25`, `scripts/book-smoke.js:20-27` — import the
  shared helpers instead of carrying their own copies.
- `scripts/headless-smoke.js:105-115` — **fixed a pre-existing Windows bug in the
  renderer gate itself.** Its jscpd check ran `execFileSync("npx", ["jscpd"])`,
  which on Windows throws `ENOENT` (npx is `npx.cmd`); `npx.cmd` throws `EINVAL`
  (node refuses to spawn `.cmd` without a shell). The bare `catch` reported both
  as "duplication OVER threshold", so **the gate failed identically whether the
  code was clean or not** — it had never actually measured duplication on this
  box. Now runs jscpd's JS entry with `process.execPath`, and an unspawnable
  jscpd says so instead of blaming the code.
- `src/renderer/src/services/benchHook.js` — the DEV seam: `info()` · `activate()` ·
  `ensureIndex()` · `features()` · `run(featureKey, args)` over the six features.
  Owns the per-run AbortController + timeout; **never throws** — a failure is a
  recorded result, because a model that wedges is a finding, not a reason to abort a leg.
- `src/renderer/src/main.js:184-196` — installs it inside the existing
  `import.meta.env.DEV` guard, via **dynamic** import so the module graph cannot
  enter a production bundle (verified: `grep __jwBench dist/` is empty after a build).
- `scripts/bench/run.js` — the orchestrator (args · dry run · leg loop · restore ·
  SIGINT handling).
- `scripts/bench/lib/` — `config.js` (validate + defaults) · `server.js` (REST
  client) · `llamaBench.js` (engine discovery, GGUF resolution, output parsing) ·
  `sampler.js` (peak VRAM/RAM) · `results.js` (tree + `summary.md`) ·
  `restore.js` · `drive.js` (the three modes) · `bench.test.js` (31 tests).
- `scripts/bench/configs/gpu.json` + `cpu.json` (the two BANDS) + `example.json`
  (every field documented). The one-off `cpu-band.json` was retired into them.
- `scripts/bench/lib/store.js` — the results STORE (round 2, below).
- `docs/bench.md` — the user doc.
- `package.json` — `"bench": "node scripts/bench/run.js"`.
- `vitest.config.js` — include `scripts/**/*.test.js` (the bench's pure-JS units).
- `.gitignore` — `bench-results/`.

## Round 2 (same day) — bands, a results store, and the .js conversion

The first build answered "run the CPU-band recipe". The user's reframing made it a
standing capability instead: *"i thought it would be 2 bands cpu and gpu … are results
saved so if i want to run it again but dont need to run the gpu base line i can skip it,
ie a new model for cpu is out and i want to bench that against my existing result …
lets verify this framework and then we will have real tests with stored data instead of
just docs"*. Rulings: **gemma is the baseline**, **split the config**, **convert `.mjs`
→ `.js`**, **skip recipe leg D**, **get Bonsai**.

**Bands replace the experiment config.** `configs/gpu.json` ("which models write well on
my GPU") and `configs/cpu.json` ("is a no-dGPU box usable"), each with durable leg ids
(`gpu-gemma-26b`, `cpu-gemma-26b`, `cpu-gemma-12b`, `cpu-bonsai-27b`, `cpu-qwen-35b`).
The CPU band never re-runs the GPU bar: `baselineRefs: ["gpu-gemma-26b"]` recalls it from
the store as a comparison row.

**The baseline leg sends NO launch overrides** (the user's ruling): it loads exactly as
the app resolves it today, so the bar is "the system as it works", not a hand-pinned
config. What it resolved to is recorded per run.

**The store (`lib/store.js`) makes the LEG the unit of truth, not the run.** Every
`leg.json` under the results root, grouped by leg id, newest wins — no index to drift,
and pruning a folder prunes the store. `mergeBandRows` then renders the whole band on
every run: fresh legs measured now, everything else recalled. Each row shows its
provenance, and a recalled row is FLAGGED (`⚠`) when the engine build or the leg's own
config fingerprint has changed since — comparing across those is allowed, pretending
they're the same measurement is not. New flags: `--report` (regenerate a band's table,
run nothing, no server needed) and `--missing` (measure only legs never measured).

**Two ordering bugs fixed in the leg pipeline.** It ran llama-bench BEFORE the load — but
the load is what downloads missing weights (`api.py:175` "Download (if needed) + spawn"),
so a model's first-ever leg silently skipped its entire raw matrix. llama-bench now runs
LAST, after the features, with the model stopped and the process confirmed gone. And a
leg whose weights aren't cached gets a 4-hour load ceiling instead of the 30-minute one,
so a healthy 23 GB download is no longer reported as a load failure.

**Storage dedupe:** `leg.json` keeps run METRICS only; the model's text lives once, in the
per-feature capture file. It used to be written twice.

**`.mjs` → `.js` across the repo** (the user: *"there is absolutely no reason for a new
vue tauri app to use ext mjs vs js"* — and they were right: `package.json:6` has set
`"type": "module"` all along, so the extension carried no meaning; the only reason was
that all 23 sibling scripts used it). Converted 28 tracked files with `git mv` (history
preserved) + 9 untracked, plus `e2e/`. Live references updated; **historical
`docs/plans/*` deliberately left alone** — they record what was true when written.
**The rename reached the enforcement machinery:** `claude-config/hooks/_rules.py:79`
classified harness scripts as commit-gate LOW-RISK with an extension-pinned regex
(`-(probe|smoke)\.mjs$`), so the rename would have silently reclassified every probe and
both smokes as HIGH. Regex now accepts `.[cm]?js`, and `test_gates.py` pins both
extensions plus a negative case. Gate suite re-run: ALL PASS.

**Bonsai, verified rather than assumed.** Repo `prism-ml/Ternary-Bonsai-27B-gguf`; the
mainline-compatible file is **`Ternary-Bonsai-27B-Q2_g64.gguf`** — note `Q2_g64`, *not*
`Q2_0_g64` as the recipe and the maintainer's own prose call it. Three findings that
shaped the leg: (1) the repo also ships an F16 at 53.8 GB, so `quant` is PINNED —
otherwise the resolver takes the largest file and benches the F16 by mistake; (2) only
the g64 file runs on mainline llama.cpp and only on CPU/Metal (Q2_0 needs the PrismML
fork), so there can be no GPU leg for it on our engine; (3) HF discussion #3 reports this
exact file failing to load with `tensor 'output_norm.weight' has offset 357580800,
expected 337715200` on both mainline and the fork, and users reporting ~1–2 tok/s on CPU.
All recorded in the leg's `_why` so the risk is visible before the download.

## Round 3 (same day) — the review of round 2's execution, and four fixes

Round 2 was designed in conversation but executed without a plan-mode pass, so the
user asked for a review of what the executor decided on its own ("please rethink what
opus designed and executed"). The architecture survived; the gaps clustered exactly
where the design had been left unspecified. Four fixes, landed while the store was
still empty (free schema change today, migration pain after the first real run):

1. **Fingerprint composition** (`store.js legFingerprint`): `repeats` removed — it
   changes the sample count, not the measurement, and including it would have flagged
   every stored row as config-drift the day repeats went 2 → 3.
2. **The book is now tracked** (`run.js` stamps the ACTUAL measured project id into
   `env` + every leg record; `store.js stalenessOf` flags `book A → B`): feature
   timings scale with chapter length before the model gets a say, so a cross-book
   recall must never read as like-for-like. Unknown-on-either-side → no false flag.
3. **`--missing` counts data, not presence** (`store.js missingLegIds`): a stored
   record with zero feature runs and zero llama-bench rows (a failed load) no longer
   retires its leg — the Bonsai trap: fail before the Smart Add, and a presence-only
   check would skip the leg forever after the model was added.
4. **Per-feature gap notes** (`results.js`): a recalled leg measured before a feature
   joined the band gets "no data for: X" in the summary instead of a table that looks
   complete. Plus: `example.json` now documents `band`/`baselineRefs` (it claims to
   document every field), the dry run prints them, and `--report` fetches today's
   engine build when the server is up (else says engine-drift flags are unavailable)
   so reports don't silently show cross-build rows as clean.

**Executor deviation, reviewed and endorsed:** the promised `bench:headed`/`bench:tauri`
aliases shipped as `bench:gpu`/`bench:cpu` instead — band aliases compose with mode
flags (`npm run bench:cpu -- --tauri`); mode aliases without a config do nothing.
Flagged to the user in the review; kept on their go.

Tests: 4 new/updated in `bench.test.js` (repeats-invariant fingerprint · book
staleness incl. the no-false-flag cases · the failed-load `--missing` retry · the
feature-gap note) — 43 bench tests total.

## Facts this was built on (read this session, not from memory)

- `/v1/ai/run` resolves the action's preset and applies request overrides:
  `prompts.py:466-517`; sampler bleed-through `:373-380`; `RunRequest` has no preset id `:227-259`.
- Preset rows carry no launch switches: `presets_api.py:39-60`. `POST /engine-presets`
  **mints its own id** (`:140`) — hence find-by-name-then-update, not a fixed `bench` id.
- Assignments: `GET/PUT /v1/ai/preset-assignments[/feature]` `presets_api.py:178-194`.
- Load/stop/measure/download/resident: `runner/api.py:175,259,350,201,232`;
  `/measure` takes **query params**, not a body (`:350-354`); residency comes from
  `/resident` (`RunnerResidentResponse`, `schema.py:187-215`), not the single-model `/status`.
- `llama-bench.exe` ships in the engine dir; the engine dir + model cache derive from
  `engine_status().serverExe` (`lifecycle.py:526-543`, layout `binary.py:112-122`).
- Book/DB state on this box (queried read-only): one project `prj_sample_ninth_facet`,
  10 seeded presets, the 40-action ref map.

## Verification — what ran, and what did not

**Ran, green:**
- `npm run test:unit` — **388 passed** (40 files), including **32** new bench tests.
- `npm run build:vite` — green; and `grep -rl "__jwBench\|benchHook" dist/` → **empty**,
  so the DEV-only claim is proven, not asserted.
- **`node scripts/headless-smoke.js` — PASSED: all 25 routes + 5 AI sub-tabs + the
  provider-form and sampler-order probes, shell-structure green, ZERO JS errors.** Run
  against an ISOLATED stack (a second server on :17496 with a temp data dir, serving its
  own built UI at its own origin, with a book seeded via `PUT /v1/projects/{id}/book` +
  `PATCH /v1/settings`). The user's `:1420`/`:17495` were never driven. *Caveat, stated
  plainly:* because the server hosts the **production** build, this run exercised the
  renderer but NOT the `import.meta.env.DEV` branch — the bench hook itself was covered
  separately by the live-renderer probe below.
- `npx biome check` on the changed renderer file — clean (biome's scope is
  `src/renderer/src/**`; `scripts/` is out of scope by project config, so all new
  scripts were `node --check`ed instead — all pass).
- `npm run bench -- --dry` on both configs — prints the full plan, including each leg's
  exact load body.
- **Real-disk probe** of `enginePaths()` + `resolveGguf()` against this box's actual
  cache: engine dir, cache root and the 14.2 GB Gemma GGUF all resolve; the MTP draft
  companion is correctly excluded.
- **Live-renderer probe** (isolated server + vite, the user's stack untouched):
  `window.__jwBench` installs, reports version 1 and all six features; an unknown
  feature and a no-chapter run both come back as **recorded failures with timings**,
  not throws; zero page errors.

**Three defects found by actually running things — all fixed, all pinned:**

1. **`resolveGguf()` could bench the WRONG MODEL.** It matched repos on the raw
   directory name, and every HF dir starts with `models--`, so any model id containing
   the token "model" matched *every* cached repo — an unknown id silently resolved to
   some other model's weights. Reporting one model's numbers under another's name is
   the worst failure this harness could have. Fixed by stripping the `models--` prefix,
   requiring at least half the id's tokens to hit, and **refusing an ambiguous match**
   rather than picking one. Three regression tests, including one that isolates the
   prefix strip specifically.
2. **`stop()` did not mean "released".** llama-bench was started right after a
   full-teardown `POST /stop`, but that call clears the ledger and returns while the
   child is still exiting (`lifecycle.py:945-958`) — so llama-bench could start against
   a still-resident model and contaminate the exact number the harness exists to
   produce. (`/resident` can't detect this either: it reads empty immediately.) Now
   `waitEngineQuiet()` polls the OS process list until no engine process remains, and a
   timeout is logged as a contamination warning.
3. **`chat` was not the only caller pinning temperature.** `characterChat.js:146` sends
   `temperature: 0.7` in the same way `chat.js:191` sends `0.3`, so a leg's temperature
   silently doesn't reach it either. An unfiltered grep of the six call sites confirmed
   these two and only these two; both now carry `temperature-fixed-by-caller`, and the
   summary + user doc name both.

**And the renderer gate caught one of my own violations:** jscpd flagged two clones
*inside* `benchHook.js` (the two writer actions, and the two RAG-chat returns). Fixed by
parameterizing — `writerAction(label, fn)` and `ragChatResult(...)` — which also makes
adding `expand`/`tighten` a one-liner. jscpd is now clean at 1.82% (threshold 3.5) and
was **proven to fire**: `--threshold 0` exits 1, the configured threshold exits 0.

**Not run, honestly:**
- **No end-to-end bench run.** That needs model weights on the GPU and is the user's
  box — it is the first real run, by design (the CPU-band doc's own protocol: numbers
  come from the box, the product decision happens in a normal session afterwards).
- **No feature run has reached a live model** through the harness. The probes proved the
  wiring up to the model call; the model call itself is unexercised.
- The `--tauri` mode has **not** been attached to a running Tauri window.
- **`scripts/book-smoke.js` could not be run.** It requires the DEV renderer
  (`window.__jwProject`, absent from a production build) and therefore a vite dev server,
  which lives on port **1420** — occupied by the user's own app for the whole session.
  Its only change is the shared-helper import, and the identical import is exercised by
  the headless smoke, but that is an argument, not a run.
- `--restore` is proven by unit tests against a fake client (including the case where a
  write silently doesn't stick), **not** yet by a real mid-run kill. The fire-test —
  kill mid-leg, `--restore`, confirm the Routing tab shows the originals — is owed and
  is listed in `docs/TASKS.md`.

**Process note:** a probe of mine drove `http://localhost:1420` moments after the user
started their own app there (my IPv4 port check missed a vite bound to IPv6 `[::1]` only).
It performed a read + a failed `switchProject`, so no data changed, but they may have seen
a stray "That project couldn't be loaded" toast. The recap's warning is now sharpened:
check **both** stacks, and prefer an isolated server + temp data dir.

**A stale claim corrected — the renderer gate DOES run on this box.** `MORNING_RECAP.md`
said it can't, for lack of Chromium. False on both counts: Playwright 1.61 and its
browsers are installed (`%LOCALAPPDATA%\ms-playwright\chromium-1228\chrome-win64\chrome.exe`)
and **the full headless smoke was run here today and passed**. Two things had made it look
impossible: `findChrome()` scanned Linux paths only (fixed in the shared helper), and the
gate's jscpd step reported its own Windows spawn failure as a code-duplication failure
(fixed above). Recap updated.

## What reverses it

Delete `scripts/bench/`, `scripts/lib/smoke-common.js` (restoring the two inline
`findChrome()` copies), `src/renderer/src/services/benchHook.js` and its `main.js`
line, `docs/bench.md`, the `bench` npm script, the vitest include entry and the
gitignore line; delete the `Bench` preset in the GUI. No schema, no migration, no
seed change — nothing else to unwind.
