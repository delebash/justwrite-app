# IDEAS — the master backlog (whole system)

The **one** place to drop ideas that aren't yet scheduled work, across the system we
work as a whole — **JustWrite**, the shared **AI stack** (`just-llm-runner` +
`@delebash/llm-ui`), and **JustVoice**. Not a plan, not a spec — a holding pen so
nothing good gets lost. Committed work lives in `docs/TASKS.md`; when an idea is
picked up it graduates to a `docs/plans/*` doc and gets a link here (or is struck
through).

- Keep entries short: the itch, the rough shape, why it matters.
- Newest at the top of its section. Date each one.
- Anyone (user or agent) can add here; adding an idea is never "starting" it.
- The user-facing roadmap pages are pointed to at the bottom, not duplicated.

---

## AI / authoring

### Ternary Bonsai-27B — a model WATCH, not a buy yet (2026-07-19)

**The itch:** 27B-class quality that fits an 8 GB card. PrismML's Ternary Bonsai-27B
(Qwen3.6-27B base, ternary ~1.71 bits/weight, ~6.7 GB deployed, Apache-2.0, 262k ctx,
a trained speculative drafter) self-reports 94.6% of FP16 and beats sub-4-bit quants by
7+ points at a third the size — it could rival our 26B-A4B pick for the 8 GB class.

**Why a watch, not a buy:** no NVIDIA path on mainline llama.cpp yet — CPU (#24448) +
Metal + Vulkan Q2_0 merged, but **CUDA (#25707) is still an open PR**, and PrismML's own
docs say stock builds can't run it (GPU = their fork, which we'd never ship as our
engine). The format is mid-churn (fork's g128 files → mainline standardized on
`_Q2_0_g64.gguf`, renames pending). All published speed is Apple Silicon (18–44 tok/s,
M4→M5); no x86 numbers, and a dense 27B still touches every weight per token. Its weakest
areas are instruction-following + tool use — exactly our JSON-extraction path. Zero
independent evals.

**Trigger to promote:** the CUDA PR merges into a release we can pin **and** first
independent evals appear → a 2070S **Lab A/B vs 26B-A4B** (the catalog's
evidence-not-press-release law), plus a watch row in
`just-llm-runner/docs/llama-cpp-watch.md`. *(from the 2026-07-19 LocalProse-comparison
review.)*

### Docs-derived control hints — one source of truth for field help (2026-07-19)

**The itch (user):** right now every field's inline hint/example on the character
sheet is hand-written in `CharactersView.vue`, *and* the same guidance is written
again, longer, in `docs/character-sheet.md`. Two copies of the same knowledge →
they drift. Every new field means editing both by hand.

**Rough shape:** make the **docs the single source**, and derive the in-app
control text from them.

- Author each field's guidance once, in the help doc (or a structured sidecar —
  e.g. front-matter or a small `docs/field-hints.yml` keyed by `group.key`).
- A build/generate script (`scripts/gen-field-hints.mjs`) reads that source and
  emits the short label-hint + example the form renders (a generated JS/JSON
  module the view imports, or a checked-in artifact validated in CI).
- The form stops carrying literal hint strings; it looks them up by field key.
- A test/CI guard fails if a field exists in the form but has no doc entry (and
  vice-versa) — so the two can never silently diverge again.

**Why it matters:** kills the drift class the user keeps hitting, makes "add a
field" a one-file change, and means the `?` help drawer and the inline hint are
provably the same words. Natural extension: the same source could feed the AI
extraction prompts' field descriptions (fill-from-book), so prompt + UI + docs
are all one authored text.

**Scope note:** medium. The generate-script + guard is the real work; the content
migration (move existing hints into the doc source) is mechanical. Do it when the
field set stabilizes — churning fields mid-migration wastes the move.

### Defaults-drift notice beyond the Tune modal (was ledger §J3)

A passive indicator on catalog rows whose applied launch config has drifted from
today's defaults — an optional follow-on to the Tune modal's Refresh-from-defaults.
Only worth building if the in-modal notice proves insufficient.

---

## UI / UX

### Customizable editor / context menus (was ledger §J1; big-batch #52a)

Let the user customize the scene editor's right-click context menu + the header AI
menu — their contents and order. A power-user affordance over the existing menus.

---

## Infra / tooling

### Multi-model co-residency VRAM budgeting (was ledger §J2)

For big-VRAM boxes running 2–3 resident models, the fit calculation must count the
already-resident models before sizing a new load, plus an eviction policy. Per-section
switches already work — the gap is only the memory arithmetic. Motivated by the
sleeping-child OOM incident on the user's box.

---

## Roadmaps & candidate pools (pointers — user-facing, not duplicated here)

These stay where they are; this list just points at them so nothing's lost:

- **`docs/roadmap.md`** — the published user-facing roadmap (small concrete planned
  items: tag-filter chips on Characters/Locations/Objects, curated tag vocabulary,
  sidebar arrow-key nav, per-feature token budgets, KFX export, …). Feeds the in-app
  `?` drawer + the docs index.
- **`docs/ai-features-roadmap.md`** — the published AI-features direction; now mostly a
  **shipped/won't-ship record** (~24 of 29 resolved), kept for that history.
- **`docs/potential-roadmap.md`** — the bigger research-driven candidate pool (2026-06-05
  multi-source pass). Half is obsolete (its TTS/audio material moved to JustVoice — see
  its historical banner); the live parts worth revisiting are the four **strategic bets**
  (disclosure-compliant/NDA-safe positioning · genre presets · continuity enforcement as
  the headline AI feature · a series container across books).
