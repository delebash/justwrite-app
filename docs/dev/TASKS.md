# TASKS — the live open-work tracker (whole system)

> **THIS is the live tracker.** One place for everything open across the system we work as a
> whole — **JustWrite**, the shared **AI stack** (`just-llm-runner` + `@delebash/llm-ui`), and
> **JustVoice**. Unscheduled ideas live in `docs/dev/IDEAS.md`.
>
> **How to use.** One line per item + a pointer to its detail doc — the depth lives in the
> linked doc, not here. **Close = delete** (the user's ruling, 2026-08-04): when an item ships
> and its QC is done, its line leaves the file — git and the plan docs keep the history. Add an
> item the moment it's real. A tracker line is a claim, not evidence.
>
> **Last swept: 2026-08-04** — close-means-delete applied to the whole file. Every
> SHIPPED/CLOSED narrative was removed; whatever a closed item still owed (a QC glance, a
> veto, a watch) survives below as its own line. The prior sweep notes, the 2026-07-26
> full-verification banner, and all the shipped detail are in `git log -- docs/dev/TASKS.md`.

## Now / near-term (JustWrite)

- **"Serve `/health` before `seed_workspace`" — recommend DROPPING; your ruling owed.**
  Measured 2026-07-25: it buys 36 ms of a ~975 ms pre-listen window dominated by framework
  imports that cannot be deferred. Re-measure snippet: the 2026-07-25 session record.
- **Fit-estimate label wording — your veto still open.** Shipped with the PC-class work;
  `docs/plans/2026-07-22-igpu-research-and-cpu-band-recovery.md` §25 addendum 9.
- **Writer's-editor expansion — decision-closed plan written, NOT launched; launch = your
  word.** Order 3→2→1-spike→4 (prose highlights · thesaurus · bible-aware spell/grammar
  spike · session word target). Plan: `docs/plans/2026-07-26-editor-expansion-executor-plan.md`;
  findings: `docs/plans/2026-07-26-writers-editor-gap-research.md` + the IDEAS.md gap table.
  Wait-gates: i18n Phase 1a is merged (done); confirm no bench is running at launch.
- **The 2026-07-19..26 unauthorized-changes review — 77 user-visible commits await YOUR
  verdict; only you can say which you approved.** Next candidate: `ea543ae` (panels dismiss on
  Esc/outside-click + nav toggle). Method (both proven the hard way): enumerate with the FULL
  log + a date filter, never `git log --since` (it hid 40 commits including the guilty one);
  "the commit message mentions the user" is NOT evidence of authorization. Regenerate the
  per-commit list with the script — don't trust a stale `visible-changes.txt`.
- **Whole-repo "extraction vs copies" audit — OWED, on your call** (your 2026-07-26 ruling).
  Detector that works: normalise the domain noun between sibling files and diff — jscpd can't
  see this class. Candidates: the seven entity views' detail-mode blocks · per-view empty
  states · the seven `useStatusDisplay` copies · the ~20 probe scripts' private `findChrome()`.
- **i18n remnants** (the sweep itself is DONE — 0 warnings, `no-raw-text` is `error`; record:
  the i18n plan docs + git):
  - Flaky `projectHistory.test.js` cap test — failed once in four identical runs under GPU
    load, mechanism unexplained, not i18n's — yours to call.
  - `Sidebar.vue:820` still freezes `v0.1 · local`; binding it to `APP_VERSION` is the fix —
    yours to call.
  - Key-naming style + the `|` plural pipes in `en.json` — your veto still open.
  - `chapters.outline.intro` copy bug: says "Outline / Cards / Read view modes" but the modes
    are Edit / Outline / Read — preserved word-for-word, yours to call.
  - ~200 duplicate call sites could point at existing `common.*`/`count.*` keys — optional
    reuse polish.
  - Trap to remember: `@` is vue-i18n's linked-message syntax — write `{'@'}` in messages;
    nothing in the toolchain catches it, so render-check any message containing `@ | {`.
- **Single-source text system + translation — THE NEXT BIG TASK** (your roadmap ruling
  2026-07-26; detail: IDEAS.md's single-source entry + 
  `docs/plans/2026-07-26-i18n-single-source-research.md`). All seven decisions blessed; shape
  ruled GENERIC (any Vue app). **The translation tool is now `just_ai_i18n_docgen`** — the
  Python successor of the proven v2 prototype; the Node original was retired 2026-08-04
  (archived: https://github.com/delebash/just-ai-help). Open asks on you: ship the measured
  `es.json` into JW · the upstream `--think` PR · whether to rotate the Gemini key that
  appeared in chat.

## Open — awaiting a go (shared AI stack)

- **B5-4 — nav prominence for Ask the Book** — a design call, nothing else remains from
  Batches 5+6. `just-llm-runner/docs/plans/2026-07-08-big-batch-queue.md` §8.
- **QC queue** — the live findings you drop while QC-ing on your box; discussion-first, each
  needs its own go. Same doc, §9.
- **I2 — cloud prompt caching — research pass owed, then your build/skip call.** Verified
  2026-07-26: the Anthropic and Gemini adapters send no caching hints. Output = a
  recommendation with numbers (what each vendor's caching is TODAY, costs/savings, whether our
  request shapes benefit, the wrong-in-a-costly-way case). Ledger §I2.

## JustVoice — AFTER JustWrite (the user's roadmap ruling, 2026-07-26)

*"The main goal is to completely finish JW and all AI stuff, then we will work on JV."* So
everything below is deliberately parked behind the JW/AI-stack work and the i18n task above —
listed for shape, not queued.

- **F1 — convergence onto the current shared stack (THE big one)** — JV can't even import today's
  `llm_runner` (`models.py` imports `LLMRolesSettings`, gone from the shared schema; 30 tests die
  at collection). Blocks F2/F5-adjacent work/F6/I6; delivers the whole month's shared work
  (catalog/tune, auto-MTP, Logs, provider connect) for free. Ledger §F1.
- **F5 — JV Appearance knob-set gap** — JV exposes Theme/size/accent/language only, while the
  shared engine it already adopted supports the full JW set. Independent of F1. Ledger §F5.
- **F6 — online TTS providers, official-SDK way** — after the JW SDK pivot proved the glue.
  Survey-first; after F1. Ledger §F6.
- **F2 — speaker-attribution task scaffolding** — meaningful only after F1. Ledger §F2.

## Your-box checks (only the Windows / 2070S machine can finish these)

- **Boot splash after the kit adoption (2026-08-04, uncommitted):** the load group is the
  kit's `<BootModelLoad />` now and the model bar shows the MODEL NAME (your shared-behavior
  ruling) instead of "Loading your writing model". One boot with warm-start on is the look
  pass. Gates already green: 560/560 vitest, build, i18n report (its `literal`/`nav.settings`
  rows pre-exist, proven on a stashed clean tree). `warmStartup.js` deleted; the bench
  suppression rides the kit's `skip` option (`main.js`).

- **QC the shipped 2026-07-24/25 batch — pushed; your eyes are the only outstanding half:**
  the boot-splash plate (fit = fill) · self-hosted fonts (**needs one fresh `npm run dev`** —
  `vite.config.js` changed) · boot 4.1 s → 2.3 s · the downloader rate-limit fix · the Model
  Catalog layout. Detail: `docs/plans/2026-07-22-igpu-research-and-cpu-band-recovery.md` §20-33.
- **LOOK at the PC-class surfaces the 2026-07-27 look pass did not cover:** the catalog row's
  needs line beside the download size · the Fit hover's "Estimated / not yet tested on your PC
  class" wording · the renamed badge with your class after it. (The class-configs modal and the
  QuickSetup wizard were QC'd good 2026-07-27.) Same plan doc, §24.
- **Quick Setup wizard EMBEDDING check** — the fix shipped + contract-tested 2026-07-26, but
  only the GUI can prove the wizard: open it, confirm EMBEDDING populates and the banner is gone.
- **Model-download Cancel/Dismiss glance** — server + tests verified 2026-07-26; one look at the
  failed / "Getting ready" states is all that's left.
- **Delete the 31B row in your local catalog UI if you want it gone** — the seeder is
  insert-only, so the 2026-07-26 removal reaches fresh installs only.
- **Bench harness `--restore` fire-test** — one deliberate mid-leg kill → `npm run bench --
  --restore bench/results/<run-id>` → the Routing tab shows the original assignments. Still only
  proven against a fake client. `docs/plans/2026-07-19-llm-bench-harness.md`.
- **`book-smoke.js`** — unverified since the shared-helper extraction; needs port 1420 free once.
- **19 probe scripts still carry a Linux-only `findChrome()`** — they cannot find a browser on
  Windows at all; convert to the shared `tests/lib/smoke-common.js` import or delete the dead
  ones. Same plan doc.
- **Unit 2 reasoning acceptance** — one local High chat run stopping at the hardware cap · one
  new-Anthropic run with reasoning words on the wire, no 400. Ledger §G.
- **Ledger §G1–G6** — Plan B on-device gates · portable data folder · the RTX 2070S spawn
  failure (now self-reporting) · marketing screenshots · full RAG end-to-end + router-flag
  confirm · Windows AMD/Intel detection spot-check. Ledger §G.
- **Providers-surface rounds 9–19** — the per-round box checks.
  `just-llm-runner/docs/plans/2026-07-06-providers-surface-redesign.md`.

## Standing rulings (constraints, not tasks — they gate future work)

- **Server reuse is VETOED** ("i am affraid of a server running when it shouldnt"); the
  kill+respawn cost (`lib.rs:377-391`) was measured and no cheaper boot lever exists.
- **Commit-gate hooks are REJECTED** — the remedy for unauthorized change is asking before
  UI-behaviour changes, not machinery.
- **Availability ≠ recommendation** (the 70B/GLM precedent): a catalog row may exist untested;
  a band recommendation may not.
- **The index FINDS, Outline RESTRUCTURES** — the index never nests scenes, Outline never grows
  filters; drifting either way builds the same page twice.
- **No outside model seeds untested** (the A/B law) · catalog rows are GGUF/cross-platform only.
- **E-row third-party drafters stay `mtp: False`** — revisit only on a measured need; any
  laptop session adds one `-md` load leg first.
- **Refusal probes: always run the stock CONTROL leg, and READ every result** — the failure
  that matters (deflection) is invisible to any text metric; the keyword-scorer post-mortem
  lives in the DO-NOT-ADD comment above `looksRefused` (`services/benchHook.js`).

## Parked (wakes on a trigger or a fresh ask — not active work)

- **D5 — remote curated model catalog** (shape recorded, ready) · **D6 — in-app HF "Discover"
  surface** · **I3 — Apple-Silicon fit/tune refinements** (needs a Mac) · **I5 — the deferred
  parking lot** (per-scene snapshots · per-entity write REST · RAG sqlite-vec ANN · extract kit
  `common/` → `@delebash/ui` · llama-swap layer · the Tauri/package rename PR) · **F3 — audiobook
  converters + speaker-attribution deep research** (JV) · **I6 — the JV tail beyond F1–F5**.
  Each: the ledger section of the same name.
- **claude-config standalone provisioning** — only the fresh-container proof is outstanding
  (prove `~/.claude` provisions from `github.com/delebash/claude-config`, then JW's vendored
  copy can go).
- **`uma` → `mem_arch`** — a design call parked until a unified-memory NVIDIA box actually
  exists; the "Use for this PC" override covers such a user today.
- **Upstream WATCH: `--fit` silently kills Gemma-4 MTP drafts** (llama.cpp #24350; `--fit off`
  is the verified cure; our fit-by-omission placement walks into it) — re-test on a build newer
  than b10107 (#24795 shows the family regressing and being fixed across builds).
- **Model watchlist:** Harrier-27B (MIT, real, no GGUF yet) · the KaLM-Gemma3-12B embed trial
  when your 32 GB card arrives · Ternary Bonsai (its own IDEAS.md entry).
- **LICENCE flag** — Gemma-ToU propagation matters only if we ever BUNDLE weights; your call
  then.
- **Provider SDK pivot re-opens only if funded keys appear** — OpenAI/xAI/Mistral ship wired,
  live-unverified, by your "close 3 i dont have keys".
- **The bench-autostart venv re-exec oddity** — a `F:\Python312` child owned the llama-servers
  on 2026-07-26; ran green, cause unverified; sits on the "which Python runs" trap.
