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

### Quantized KV cache — a context lever we haven't needed yet (2026-07-30)

**The itch:** an 8 GB-VRAM coding roundup (ai.plainenglish.io, "Best local LLM for 8GB
VRAM", 2026-07) runs Qwen3.6-35B-A3B at a 65k context on a GTX 1070 by quantizing the
KV cache to q4_0 (`--cache-type-k/v q4_0`). We've never needed it — Gemma's iSWA keeps
the KV small at JW's actual context sizes (writer 8k, book chat 32k; no OOM measured at
28k on the 2070S) — but it's the first lever to reach for if book-chat context ever
needs to grow past 32k on the small classes.

**The shape:** nothing to build — Tune & measure already accepts the cache-type rows
(f32…q4_0 are listed in its hover help). The work is an on-box A/B: measure the
VRAM/context headroom it buys vs. what it costs in speed, and **read prose side by
side** — quantized KV can degrade quality, and that matters more for prose than for the
code workloads the roundup tested. Never a silent default; at most a documented switch
in a PC class config.

**Trigger:** a real feature wanting >32k book-chat context on the 8/12 GB classes.

### The writer's-editor gap table — 5 ranked candidates, executor plan written (2026-07-26)

**The itch:** finish the editor to Word/Scrivener parity where it actually matters for
novelists. The research is DONE and same-day CORRECTED (the user caught that "name
generator" was never a gap — Brainstorm's default category IS character names, 7
categories with like-steering, `BrainstormView.vue:18-65`) — full inventory + field
survey + adoption table in `docs/plans/2026-07-26-writers-editor-gap-research.md`. The
surviving rows: **1)** spelling+grammar that knows the story bible (adopt Harper 2.4.0 —
Apache-2.0, offline WASM, `importWords()` auto-fed from the project's
characters/locations/coined words; medium, spike-gated), **2)** thesaurus (vendored
public-domain Moby DATA — the npm wrappers are node-only — + a Brainstorm deep-link for
AI alternatives; small-medium), **3)** prose highlights / linguistic focus (surface the
styleMetrics + aiTellScanner catalogs we already own as toggleable editor decorations;
small, best value-per-work on the list), **4)** session word target (small UI over data
we already record; per-chapter targets deliberately not in v1), **5)** dictation
(whisper.cpp — parked, unscheduled). **The decision-closed executor plan for 3→2→1-spike→4
is `docs/plans/2026-07-26-editor-expansion-executor-plan.md` — written, NOT launched.**
Rejected-with-reasons (autocorrect, track changes, footnotes, read-aloud→JV) are in the
doc §5 so they don't come back as "missing".

### Ternary Bonsai-27B — a model WATCH, not a buy yet (2026-07-19)

**The itch:** 27B-class quality that fits an 8 GB card. PrismML's Ternary Bonsai-27B
(Qwen3.6-27B base, ternary ~1.71 bits/weight, ~6.7 GB deployed, Apache-2.0, 262k ctx,
a trained speculative drafter) self-reports 94.6% of FP16 and beats sub-4-bit quants by
7+ points at a third the size — it could rival our 26B-A4B pick for the 8 GB class.

**Why a watch, not a buy — RE-CORRECTED 2026-07-23 (my earlier correction was itself
wrong on two counts).** Mainline Vulkan DOES run PrismML ternary: b10099 win-vulkan loads
`Ternary-Bonsai-27B-Q2_g64.gguf` and offloads to the GPU (VRAM 565 -> 4188 MiB, measured on
a 2070S). My "Vulkan not merged" claim came from testing only b10083 — 16 builds stale — and
citing **#25850, which is TQ2_0 (BitNet/TriLM ternary, tensor type 35), NOT PrismML's Q2_0
(type 42)**. Two separate formats, two separate PRs. What IS true: **use the g64 variant** —
mainline rejects the plain `*-Q2_0.gguf` (the fork's packing) on both b10083 and b10099.
The remaining reason it stays a watch is speed, not support: the dense 27B ran 1.4 tok/s at
partial offload on an 8 GB card, and on a box that fits the gemma 26B-A4B MoE (~4B active of
25.2B) a dense ternary model is architecturally dominated. Both Bonsai g64 models are now in
the speed kit, so the laptops measure this rather than us arguing it. PrismML's own
docs say stock builds can't run it (GPU = their fork, which we'd never ship as our
engine). The format is mid-churn (fork's g128 files → mainline standardized on
`_Q2_0_g64.gguf`, renames pending). All published speed is Apple Silicon (18–44 tok/s,
M4→M5); no x86 numbers, and a dense 27B still touches every weight per token. Its weakest
areas are instruction-following + tool use — exactly our JSON-extraction path. Zero
independent evals.

**Demo-repo findings (2026-07-23):** `github.com/PrismML-Eng/Bonsai-demo` is their official
launcher (same fork release we staged, `prism-b9596-9fcaed7`); it RAM-tiers ctx (never `-c 0`),
excludes g64 files by design, and reveals **ternary 8B / 4B / 1.7B + a 1-bit family** — a
ternary 8B might fit the 8/16 GB classes outright. Full flag extraction: the recovery doc §12.

**Trigger to promote:** the CUDA PR merges into a release we can pin **and** first
independent evals appear → a 2070S **Lab A/B vs 26B-A4B** (the catalog's
evidence-not-press-release law), plus a watch row in
`just-llm-runner/docs/llama-cpp-watch.md`. *(from the 2026-07-19 LocalProse-comparison
review.)*

### Single-source text system: docs → help/labels → translation (2026-07-19)

> Tracked as the **Research** item in `docs/TASKS.md` — this is the detail it points to.

**The itch (user):** two problems that likely share ONE fix. **(1)** Every field's
inline hint/example on the character sheet is hand-written in `CharactersView.vue`
*and* again, longer, in `docs/character-sheet.md` — two copies that drift; every new
field means editing both. **(2)** The app isn't really translatable yet — no in-app
language switcher, partial coverage. Both point at the same want: **one authored source
of truth for text**, feeding the in-app help, the labels, and the translations.

**Current i18n state (grounded 2026-07-19):**

- JW renders text via **vue-i18n ^11.4.6** + `src/renderer/src/i18n/locales/en.json`
  (389 lines); many views use `$t()`. The kit follows locale via `setUiLocale` (Intl
  number formatting) and takes dialog/help labels via `configureDialog`/`configureHelp`.
  JV has its own i18n (Settings → Appearance already exposes a **Language** select).
- **Gaps:** only English is authored (no other locale files); coverage is partial — many
  strings are hardcoded (e.g. the character-sheet field hints live in `CharactersView.vue`,
  not en.json); **no in-app language switcher in the title bar**; JW's vue-i18n and JV's
  i18n aren't unified (the kit carries no i18n lib of its own).

**Rough shape / the questions the research answers:**

- **The single source.** Author each field's guidance once — in the help doc
  (front-matter or a small `docs/field-hints.yml` keyed by `group.key`) — and derive the
  short inline hint + example (a generated module or a checked-in artifact validated in
  CI). The form stops carrying literal hint strings; it looks them up by key. The same
  source could feed the AI extraction prompts' field descriptions (fill-from-book), so
  prompt + UI + docs are one authored text. How does that source reconcile with the
  vue-i18n locale JSON — is it the source, or a sibling the locale is generated from?
- **Coverage audit.** How much is `$t()` vs hardcoded — the drift class the user keeps
  hitting. A real census before committing to a format.
- **Translation tooling.** **json-autotranslate** (free DeepL / **local-AI** backend) ·
  **json-translator** (easiest/free) — and can our OWN bundled runner translate locally
  (on-brand: no cloud, no cost)? With a human-review step for quality.
- **In-app language switcher** in the title bar + persist the choice; match JV's existing
  Language select so both apps behave the same (kit-level, not a per-app fork).
- **CI guard.** A key exists in the form ⇔ in the source ⇔ translated — so nothing
  silently regresses (the same guard idea covers both the hint-drift and missing
  translations).

**Why it matters:** kills the hint-drift the user keeps hitting, makes "add a field" and
"add a language" one-source changes, and gives real multi-language support. **Scope:**
research → plan → build, each on its own go; do the coverage audit before committing to a
source format, and do it when the field set has stabilized (churn mid-migration wastes the move).

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
