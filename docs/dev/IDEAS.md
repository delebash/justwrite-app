# IDEAS — the master backlog (whole system)

The **one** place to drop ideas that aren't yet scheduled work, across the system we
work as a whole — **JustWrite**, the shared **AI stack** (`just-core` +
`@delebash/ui`), and **JustVoice**. Not a plan, not a spec — a holding pen so
nothing good gets lost. Committed work lives in `docs/dev/TASKS.md`; when an idea is
picked up it graduates to a `docs/plans/*` doc and gets a link here (or is struck
through).

- Keep entries short: the itch, the rough shape, why it matters.
- Newest at the top of its section. Date each one.
- Anyone (user or agent) can add here; adding an idea is never "starting" it.
- The user-facing roadmap pages are pointed to at the bottom, not duplicated.

**Settled 2026-10-29** (the user's "your rec go" on every open item — `docs/dev/TASKS.md`, the
2026-10-29 entry): grammar, dictation, the quantized-KV note, the Bonsai watch (the kit's
`docs/llama-cpp-watch.md` owns it), the defaults-drift notice, customizable menus and Series were
removed; the single-source text item is the TASKS line "Help hints translated". Git keeps them.

---

## AI / authoring

### Brainstorm's category names live in code (noted 2026-10-11; its request wording moved 2026-10-28)

**Being built** — on the 2026-10-29 DO list in `docs/dev/TASKS.md`.

The round's scaffolding moved into the seeded system prompts on 2026-10-28 (the request is data
only — Category, Seed, "Liked", "Already shown" — and the systems say what to do with each list;
healed on unedited databases). Still in code, in English: each category's model-facing name
(`promptLabel`, filling the system's `{{label}}`) and the plot categories' `kind`, beside the
category list that wires the Brainstorm panels.

---

## Roadmaps & candidate pools (pointers — user-facing, not duplicated here)

- **`docs/roadmap.md`** — the published user-facing roadmap (pace-chart trend lines and
  multi-window, both on the 2026-10-29 DO list). Feeds the in-app `?` drawer + the docs index.
- **The two June pools are closed** (2026-10-29) and archived as history:
  `docs/plans/archive/2026-06-05-ai-features-roadmap.md` (all 29 items shipped or won't-ship) and
  `docs/plans/archive/2026-06-05-potential-roadmap.md` (each row's outcome in its banner).
