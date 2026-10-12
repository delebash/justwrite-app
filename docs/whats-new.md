# What's new

Recent changes worth noticing. Older entries fall off the bottom — see the [Roadmap](roadmap.md) for direction.

---

## 2026-10-11

**The editor's AI menu stays on screen.** With the sidebar open its left edge was cut off, and in a
narrow window most of it was off the screen. It now always opens where it fits, and works from the
keyboard: ↓ on the AI button opens it, the arrows move, Enter picks. The note under the editor no
longer reads "done in NaNs" for the first seconds after an AI action.

**Rewrite with direction… and Write dialogue….** Two new items in the editor's AI dropdown.
**Rewrite with direction…** rewrites the selection the way you say ("make her colder").
**Write dialogue…** writes an exchange at the cursor between the scene's characters, in the voices
their sheets describe — say what it's about first. See [Writing](writing.md#rewrite-with-direction).

**Rejecting AI changes works every time.** **Reject all** (and Reject on one change) could fail
with an error when the change ended the scene — a Continue at the end of a scene always does — and
with two or more changes pending, **Reject all** could fail and **Accept all** could leave some
pending. Both now settle every change.

**The AI knows the scene.** Rewrite, Expand, Tighten, Continue, Describe and Continue with
direction… now also read the scene they work in — your premise and main cast, the characters,
places and objects linked to the scene, its beats and notes, and how the previous scene ends — so
Continue stops inventing who's in the room. A line under the progress strip names what was sent.
Line edits don't change. See [Writing](writing.md#story-context-the-ai-knows-the-scene).

**Save to sheet.** Under an answer in a **Talk to {Name}** chat, **Save to sheet** drafts the
character's sheet from what they just said. You review every field before anything saves. See
[Story bible](story-bible.md#talk-to-a-character-interview-them-in-their-voice).

**Name ideas.** The ✨ beside a character's name lists names that fit the character and your
book, and never one your cast already uses. Thumbs-up the ones you like and click **More like
these**, as on Brainstorm; click a name to use it. See
[Brainstorm](brainstorm.md#name-ideas-at-the-name-itself). Brainstorm's categories are now
translated too.

**Draft a character with AI.** On a character's page, describe them in the
**Describe this character** box and click **Draft**: the AI drafts the sheet —
identity, motivation, arc, voice, backstory — from your description and your
book. **Draft this section** on each section of the sheet drafts just that
section. **Fill from book** moved into the new **Draft with AI** menu in the
page header. You review every field before anything saves, and fields you've
written are never overwritten unless you tick them. See the
[Character sheet](character-sheet.md).

**Headers that fit.** A page header with many buttons no longer squeezes the name beside them —
a character's name box had shrunk to a sliver; the buttons now move to the row below. Window titles
no longer squeeze beside the AI chip either, and the chip shortens its model name instead of running
past the edge on a phone.

**Suggest characters.** **Suggest characters…** on the Characters list asks the
AI for people your book doesn't have yet — say what you're looking for, or leave
it blank. Tick the ones you want and add them to your story bible. See
[Story bible](story-bible.md#suggest-characters-who-is-this-book-missing).

**Status and Exclude from AI are kept.** The status you pick for a scene, character, location,
object or group, and the **Exclude from AI** box on those and on worldbuilding articles, were
forgotten when the book was reopened. They're saved now. And Exclude from AI now does what it says
for characters, locations, objects, groups and articles: Ask the book, Talk to a character and AI
drafting leave them out (it already worked for scenes, until the book was reopened). Earlier
settings couldn't be recovered, so set them again where you need them. See
[Keeping content out of AI context](ai-providers.md#keeping-content-out-of-ai-context).

**A scene's POV and "When" are kept.** The two answers you give in a scene's
[Links panel](writing.md#the-links-panel), the POV perspective and when the scene happens, were
lost the next time the book was saved and reopened. They're saved now. Earlier answers
couldn't be recovered, so set them again where you need them. If you sync, update JustWrite on
each device: one on an older version asks to be updated before it syncs again (for both of these
fixes).

---

## 2026-10-09

**The desktop app updates itself.** It checks for a new version when it starts; **Settings →
Updates** says when one is out, **Download** fetches it, and it installs when you quit the app —
or at once with **Restart now**. On a Mac, which can't install an unsigned update, it opens the
release page instead.

---

## 2026-10-08

**Export this book works for any title.** A book titled outside Western European letters —
in Japanese, say — failed to export with a server error. It now exports; the downloaded
`.zip` and the folder inside it carry the book's real title. See
[Backups and data](backups-and-data.md#export-this-book).

---

## v1.4.0 — 2026-09

**The engine's Update button works again — and updating is now safe.** It had quietly
stopped appearing in August, when llama.cpp changed the way it labels releases: the app
compared the new label against its own version numbering, concluded you were already up to
date, and said nothing. It now follows llama.cpp's official releases, and also offers the
build this version of the app is tested with, whichever is newer. More importantly, an
update can no longer leave you unable to load models. Before a new engine replaces the one
you have, the app checks two things — that it starts, and that it accepts the settings the
app launches models with. If it fails either, your current engine is kept and the message
names what it refused; your old engine is removed only once the new one is working. If the
newer release has no download for your kind of graphics card, the app tells you and changes
nothing at all. Updates work again on **AMD** cards, whose download files had been renamed
upstream. See [Models](models.md) for the details.

**A newer engine is not automatically a faster one**, so Update stays your deliberate click.
New installs get the engine build this release is tested with. Update also offers that
build to an existing install whenever it is newer than yours, even when llama.cpp's official
releases have not caught up with it. Hover the button to see whether it is offering the
tested build or the newest official release. An existing install keeps whatever engine it
already has until you update.

**Entity sweep really uses its shape now.** Actions that carry a JSON schema were sending it
to the local engine in a form the engine silently ignores, so the answer was only required to
be valid JSON rather than to match the expected fields. The schema now reaches the engine and
is enforced.

## v1.3.0 — 2026-07

**Move a book between computers — or share it.** New **Export this book** / **Import a book** buttons in Settings → Backups save a book as a single `.zip` (named after it) and read one back as a **new** project — the whole thing, images and all. Import the same file as many times as you like; each becomes its own book. And every save now lets you **choose where it goes** — defaulting to your data folder and remembering where you last saved — for the per-book export, the whole-workspace backup, and the data-folder location alike.

**Manage your autosaves.** Settings → Backups can now point the on-disk autosave at any folder you choose (it defaults to your data folder, remembers the choice, and moves your existing autosaves along), and you can delete autosaves you no longer need — one at a time or all at once. (Any folder you've changed also survives a workspace reset now.)

## v1.2.0 — 2026-07

**A new tutorial novel — *The Ninth Facet*.** "Try tutorial project" now opens a fresh sample: a magitech guild-adventure with a full cast, locations, objects, factions, a worldbuilding bible, plot strands, and real full-length chapters — a richer starting point for exploring every screen than the old sample. It works exactly as before: a normal editable project, created on demand, deletable and re-creatable any time.

*(Under the hood the sample is now just data — an exported book folder shipped with the app — so samples can be swapped or added without code changes.)*

## v1.1.0 — 2026-07

**+ New opens the new entry directly — name ready to type.** Creating a character, location, object, group, note, or narrative strand no longer pops up a box asking for a name first. **+ New** (from a list header or the sidebar) makes the entry and takes you straight to its page with its name selected — just start typing to replace the placeholder, then fill in the rest. New chapters work the same way, landing in the editor with the title focused. Changed your mind? It's an ordinary row you can delete, or press Ctrl/⌘ + Z on its page to undo the creation. (Worldbuilding articles still ask first — that popup is where you pick the article's category.)

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
For the entities you already have, a new **Link scenes** button on the
Analysis page runs a no-AI pass over the whole book and proposes every
missing scene link for review — nothing applies until you confirm.

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

**Tutorial project.** The **sidebar's project switcher menu → "Try tutorial project"** opens *The Ninth Facet* — a complete sample novel (characters, locations, objects, groups, worldbuilding, chapters, plot strands, events) created on demand, so a fresh install starts clean on the welcome screen instead. It is a real project you can poke at without touching your own work; delete it from the same switcher when you're done, and the button brings it back fresh any time.

**Better empty states.** Every catalog (Characters / Locations / Objects / Groups / Notes / Strands / Worldbuilding) now explains what the surface is for and where it connects, rather than just "No characters yet."

**Clearer disabled buttons.** Greyed-out actions (Render, Export, AI scans) now explain their prerequisite when you hover them — no more guessing why a button won't click.

**Command palette help mode.** The `Ctrl/⌘ + P` palette now lists every help doc — type a doc title or keyword and hit Enter to open the drawer directly.

**Tooltip enrichment.** Every shortcut-bound action surfaces its shortcut in the tooltip. AI actions name what call they make. Studio playback controls and the voice preview button now have tooltips at all.

---

## Earlier

For the full history of shipped features, dip into the [Roadmap](roadmap.md) and [AI features roadmap](ai-features-roadmap.md) — items annotated with a ship date.

---

*This page is also what **Settings → Updates** shows in-app: your current version
plus these release notes. In the desktop app the panel also says whether a newer
version is out — **Download** fetches it, and it installs when you quit the app.*
