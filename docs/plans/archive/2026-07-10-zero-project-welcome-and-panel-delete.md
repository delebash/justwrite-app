# 2026-07-10 — The zero-project law + the scene-notes panel delete

> ✅ **CLOSED (docs campaign 2026-08-04)** — produced two builds + one recorded decision; closed. History/evidence only; live work: `docs/dev/TASKS.md`.

The user's three answers this evening (verbatim: *"1 it seems to switch now,
but i have reset the database twice and restarted and i still have untitled
project. 2 is there any reason not to strip it for ai reasons? 3 not sure what
you mean. Notes for scene you have as detach it need to be delete a note not
detach."*) produced two builds and one recorded decision. Plan rules-checked
(one T8 FAIL — this document is the remedy; two implementation cautions folded
in below).

## Item A — kill the phantom "Untitled project" (the user's #1)

**Root cause (verified).** The phantom was minted by the RENDERER, never the
server (the server ships zero projects since QC-40 — `seed.py`). Three mint
paths: (1) `bootstrap()`'s empty-registry fallback (`stores/project.js` —
minted a blank "Untitled project" entry + active id on EVERY boot with an
empty registry, and `ensureActiveProjectPersisted()` then PUT the row to the
server), (2) `deleteProject`'s last-project branch called
`createProject({ title: "Untitled project" })`, (3) `_ensureActiveId()`
lazily mints an id on any persist with a null active id. So a workspace
reset (POST /v1/data/reset — what the Settings reset button calls) wiped the
DB, and the next renderer boot re-minted and re-persisted the phantom: reset
could never win. The fallback's stated purpose ("so the app always has
something to show") predates the QC-46 welcome screen, which is now the
proper nothing-to-show surface.

**THE ZERO-PROJECT LAW (the design decision).** Zero projects is a VALID
state, and its home is `/welcome`:

- `bootstrap()`'s empty branch returns `{ activeId: null, registry: [],
  snapshot: null }` — no mint, no settings write.
- The `main.js` router guard redirects EVERY navigation to `/welcome` while
  the registry is empty — deliberately NOT behind the run-once first-run
  gate (checker caution: a mid-session reset must still redirect). The
  allowlist is exactly the project-independent surfaces the welcome screen
  itself links to: `/ai` (Quick Setup + connect provider) and `/help`
  (hosts "Show welcome screen"), plus `/welcome` itself.
- `deleteProject`'s last-project branch blanks the in-memory state via the
  shared `blankSnapshot()` (extracted from `createProject` — one source),
  nulls the active id + the `activeProjectId` setting, and persists NOTHING;
  the Sidebar caller then routes to `/welcome`.
- `createProject` and `switchProject` gate their "persist the outgoing
  project first" step on an active id existing — otherwise the very CTAs on
  the welcome screen ("Start a new project", "Try tutorial") would re-mint a
  phantom row through `_ensureActiveId` on their way in. `_ensureActiveId`
  itself stays as a last-resort net (unreachable behind the guard).
- First-run behavior is unchanged for users WITH projects: the run-once
  `welcomeSeen` redirect on the root still shows the welcome screen once to
  upgraders.

**Verification:** fresh-reset probe (cold boot forced to /welcome · deep-link
/chapters redirected · /ai visit leaves ZERO project rows on the server — the
`_ensureActiveId` hazard leg · create → lands normally, one row · delete-last
→ back on /welcome, zero rows) + vitest + build + full headless smoke +
pytest/ruff. DB restored byte-exact after the probe.

## Item B — scene marks stay in the AI features (the recorded decision)

The user asked (#2): *"is there any reason not to strip it for ai reasons?"*
Verified answer: **yes — keep them.** The mark the four features
(critique/structural, entityExtraction, threadExtraction, readerKnowledge —
the `stripSceneMarks: false` call sites) pass through is the literal line
`* * *` (`project.js` stitches scenes with `<p class="scene-mark">* * *</p>`),
which is the industry-standard manuscript scene-break notation. It tells the
model that a cut/time jump/POV shift at that point is DELIBERATE; stripping
would glue scenes into seamless prose, and the critique/pacing/knowledge
features would misread intentional breaks as abrupt-transition defects. No
server prompt references the marks and no parser consumes them (all four
parse JSON), so the only cost of keeping them is ~3 tokens per break. This
closes the deep-audit A1 open question: KEEP, on the merits above — flips to
full-strip on the user's word (one flag per call site).

## Item C — the panel's per-note ✕ becomes Delete (the user's #3 order)

`SceneNotesPanel.vue`: the per-note action (was detach/unanchor) now calls
`project.removeNote(id)` — a soft delete to Trash, no confirm (NotesView's
own delete has none) and no toast (QC-37: the card visibly leaves; recovery
is the Trash view). Icon Close → Trash (the Sidebar per-project delete
precedent), tooltip/aria "Delete note". The panel-CLOSE ✕ in the header stays
Close (checker caution — only the per-note button changes). Unanchoring
without deleting still lives in the Notes view's anchor picker
("Story-wide"). Docs updated in the same commit: `notes-and-search.md`
(panel paragraph), `whats-new.md` (scene-notes + tutorial-project entries),
`getting-started.md` (the "workspace starts as a blank Untitled project"
sentence → the zero-project truth).

Undo note (#235 law, unchanged): a delete made in the panel lands in the
`notes` history domain, so ⌘Z for it lives on /notes — the recorded,
intended asymmetry.
