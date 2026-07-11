# What's new

Recent changes worth noticing. Older entries fall off the bottom — see the [Roadmap](roadmap.md) for direction.

---

## v1.0.0 — 2026-06

**Ask the book knows your story bible.** Grounded chat used to see only your
prose — "who is X?" came back as a guess from scenes. Now every character,
location, object, group, worldbuilding article, note, strand, and
architecture doc is part of the searchable index as a "Story Bible" entry,
naming an entity in your question pins its entry into the answer's sources
(marked "pinned" in the citations), scene excerpts carry their linked
characters/location/objects/POV even when the prose doesn't name them, and
clicking a Story Bible citation jumps to that entity's page. If you already
built a book index, open Ask the book and hit **Rebuild** once (it also
self-heals on the next index update) — the embedding models now apply their
proper task instructions, which sharpens search for everyone.

**Imports split into real scenes.** Importing a manuscript now detects the
standard scene-break markers ("* * *", "#", a horizontal rule) and creates
one scene per section instead of one giant scene per chapter — so search,
chat excerpts, and scene links work at the right grain on imported books.

**The entity sweep keeps its receipts.** Accepting a proposed character,
location, or object now also links it to the scenes it appears in (the
Relations graph fills in instead of staying empty), and character proposals
include the nicknames/aliases the text uses — editable before you accept.

**A welcome screen on first run.** A fresh JustWrite now opens on a welcome
page: start a new project or the tutorial book with one click, see what the
app does at a glance, and — if you want the AI features — run Quick Setup
(local, uses your PC) or connect an online provider right from there. It
shows once; reopen it anytime from the Help page.

**Scene notes beside the editor.** The Notes buttons on a scene and on the
chapter toolbar now open a panel docked next to your prose instead of
navigating away: jot a note in the composer and it's pinned to that scene,
click a note to edit it in place, and delete with the trash button (it moves
to Trash, so nothing is lost by accident). Managing the full notes list stays
in the Notes view ("Manage all notes ↗").

**Page-related undo.** Ctrl/⌘ + Z now undoes changes to the page you're on — character edits on Characters, manuscript changes on Chapters — and never silently reverts something from another page. Each page's redo also survives work you do elsewhere, and the title-bar Undo button tells you when the current page has nothing to undo. Redoing an undone prose change works with the scene editor open, too — previously the open editor could quietly swallow the redo.

**In-app help drawer.** Every pane now has a small `?` next to its title that opens a side panel with the docs for that surface — no more hunting the marketing site.

**Keyboard shortcut cheatsheet (Ctrl/⌘ + /).** A quick reference overlay you can summon from anywhere.

**What's new modal.** When you open JustWrite after an upgrade, a modal shows you what changed in the new version — dismissible, and keyed to the version number so it only shows once.

**Tutorial project.** The **sidebar's project switcher menu → "Try tutorial project"** opens *The Cartographer's Daughter* — a complete small demo novel (characters, locations, chapters, plot strands, events) created on demand, so a fresh install starts clean on the welcome screen instead. It is a real project you can poke at without touching your own work; delete it from the same switcher when you're done, and the button brings it back fresh any time.

**Better empty states.** Every catalog (Characters / Locations / Objects / Groups / Notes / Strands / Worldbuilding) now explains what the surface is for and where it connects, rather than just "No characters yet."

**Clearer disabled buttons.** Greyed-out actions (Render, Export, AI scans) now explain their prerequisite when you hover them — no more guessing why a button won't click.

**Command palette help mode.** The `Ctrl/⌘ + P` palette now lists every help doc — type a doc title or keyword and hit Enter to open the drawer directly.

**Tooltip enrichment.** Every shortcut-bound action surfaces its shortcut in the tooltip. AI actions name what call they make. Studio playback controls and the voice preview button now have tooltips at all.

---

## Earlier

For the full history of shipped features, dip into the [Roadmap](roadmap.md) and [AI features roadmap](ai-features-roadmap.md) — items annotated with a ship date.
