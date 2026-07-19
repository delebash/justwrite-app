# Ideas — the master backlog

The **one** place to drop ideas that aren't yet scheduled work. Not a plan, not a
spec — a holding pen so nothing good gets lost. When an idea is picked up, it
graduates to a `docs/plans/*` doc and gets a link here (or is struck through).

- Keep entries short: the itch, the rough shape, why it matters.
- Newest at the top of its section. Date each one.
- Anyone (user or agent) can add here; adding an idea is never "starting" it.

---

## AI / authoring

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

---

## UI / UX

_(none yet)_

## Infra / tooling

_(none yet)_
