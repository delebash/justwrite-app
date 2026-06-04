# Core concepts

Before you start clicking around, it helps to understand how JustWrite organises a book and how it keeps your work safe. None of this is hard; it is mostly common sense with a few names attached.

---

## A book is Parts → Chapters → Scenes

Every manuscript in JustWrite has three structural levels:

- A **Part** groups chapters. You can call a Part anything — "Part One", "Book of Storms", "Before the Fall". Many novels use a single Part for the whole book; longer or multi-volume works use several.
- A **Chapter** is what your reader will see as a chapter.
- A **Scene** is a unit inside a chapter. Scenes are how JustWrite splits one chapter into multiple drafts on the corkboard, lets you reorder beats inside a chapter, and tracks which characters and locations appear where.

You write **inside scenes**. A chapter is just a container; the prose lives in the scenes.

If you think in chapters rather than scenes, that is fine — every chapter starts with one scene, you can stay there forever, and JustWrite will treat your chapter and scene as one piece. If you prefer to break a chapter into discrete beats, the Scene structure is ready for you.

You can also switch a chapter into **continuous mode** (a toggle in the editor) where you see and write all of its scenes as one stitched document with visible dividers between them.

---

## The Story Bible

The "Story Bible" is the collective name for everything that isn't manuscript prose:

- **Characters** — your cast
- **Locations** — your places
- **Objects** — your significant props (a relic, a letter, a car, a sword)
- **Groups** — collections that bundle any of the above (factions, families, crews)
- **Worldbuilding articles** — long-form reference pages organised by category (magic, history, politics, etc.)
- **Narrative strands** — your plot threads (we'll explain these next)
- **Architecture** — four fixed planning documents that hold your book's foundations
- **Notes** — anything else

The Story Bible is where you do background work that doesn't go into the manuscript. None of it is required, but the more you fill in, the more the rest of the app can help you — Search finds it, the Relations graph maps it, exports can include it, and the AI features know it exists when you ask them to rewrite, critique, or extract entities.

---

## Strands vs. Plot Board vs. Events vs. Timeline

This is the part most new users find confusing, so it gets its own section.

JustWrite has four planning surfaces that touch on plot and time, and they are not the same thing:

| Surface | What it is | When to use it |
|---|---|---|
| **Narrative strands** | The threads that run through your book — main plot, subplots, character arcs, themes. Each strand has its own colour, its own notes, and its own beats. | "I want to plan one specific thread of my story." |
| **Plot Board** | A two-axis grid: strands across the top, chapters across the bottom. You see every beat in every strand at once. | "I want to see the whole shape of the book and how my threads weave." |
| **Per-entity Events** | A chronological log attached to a single character, location, object, or group. "Aria was born in 1842." "Dunmore burned in 1854." | "I want to record what happened in my world, when." |
| **Timeline** | A merged read-only view of every event across every entity, sorted by date. | "I want to see my world's history end-to-end." |

A useful way to think about it: **strands and the plot board are about story shape** (where things turn, what threads exist). **Events and the Timeline are about world chronology** (what happened, when, to whom).

Most writers will use strands and the plot board heavily. Events and the Timeline are most valuable if your story has dates that matter — historical fiction, time-travel, multi-generational sagas, mysteries with carefully placed past events.

See [Plot and time](plot-and-time.md) for a deeper walkthrough.

---

## Nothing is deleted (right away)

When you delete a chapter, a character, a note, a strand — anything — JustWrite does not actually destroy it. It moves the item to the **Trash**.

You will see a small toast pop up at the bottom of the screen with an **Undo** button. Click it within a few seconds and the deletion never happened.

If you miss the toast, open **Trash** from the sidebar's Project section. Every soft-deleted item from every category is sitting there with a **Restore** button. Items stay in Trash indefinitely; you decide when (or whether) to empty it.

This means you can experiment fearlessly. Delete a chapter you don't think is working; if you change your mind a week later, restore it.

The only thing that actually destroys an item is clicking the trash-can icon inside the Trash view itself, or pressing **Empty trash** at the top. Both confirm before doing anything.

---

## Undo and redo

JustWrite remembers the last hundred changes you made and lets you walk backwards through them with **Ctrl/⌘ + Z**. Redo with **Ctrl/⌘ + Shift + Z** (or **Ctrl + Y** on Windows).

A few details worth knowing:

- Undo covers structural changes (delete a chapter, rename a character, move a beat on the plot board) and small edits across the whole project.
- Inside the manuscript editor, undo is handled by the editor itself (this is why your typing doesn't jam up the global undo history). Each chapter's editor has its own undo log.
- When you close the app, the last ten history steps are saved. The other ninety are only kept while the app is open.

In short: edit freely. There is almost always a way back.

---

## Autosave

You do not need to save. Every change you make — typing in a chapter, adding a character, dragging a beat — is saved to your computer's local storage instantly, and to a JSON file on disk within about ten seconds.

The sidebar footer shows "Autosaved · Xs ago" so you can confirm at a glance that things are flowing.

If you ever want to force a backup to a file you can move or archive, open **Settings → Backups → Export snapshot**. See [Backups and data](backups-and-data.md) for the full story on backups and recovery.

---

## Statuses

Almost every item in JustWrite (chapters, scenes, characters, locations, articles, strands) carries a **status** — a coloured label that tells you, at a glance, where it stands. The default palette includes things like Draft, Revise, Done, To-do.

You can edit the palette in **Settings → Project → Statuses**: add new statuses, rename them, recolour them, delete ones you don't use. The colours then appear throughout the sidebar, on chapter rows, on scene strips, and on the Home dashboard.

Statuses are entirely yours. Use them for whatever workflow makes sense to you. A common scheme:

- **To-do** — a chapter sketched but not yet written
- **Draft** — written, not yet revised
- **Revise** — revised once, may need another pass
- **Done** — finished

---

## Tags

Characters, Locations, Objects, and Worldbuilding articles all carry **tags** — short freeform labels you type yourself. Tags are how you cut across categories: "antagonist", "northern coast", "act three", "magic system".

Tags suggest existing values as you type, so you don't end up with "Antagonist", "antagonist", and "antag" all referring to the same thing.

---

## Mentions: the `@` symbol

When you are writing in the editor, type **`@`** to bring up a small picker. Start typing a name and JustWrite shows matches from your entire Story Bible — characters, locations, objects, groups, strands. Pick one and it gets inserted as a linked mention.

This is the single most useful keystroke in the app. A mention makes the entity findable: open the character's page, and you see a list of every scene they're mentioned in, with a snippet of the surrounding prose. Search finds them. The Relations graph uses them.

Use `@` liberally. It costs you nothing and it makes the entire Story Bible come alive.

---

## What you do not need to do

Things JustWrite does not require:

- **Save your work** — autosave handles it.
- **Plan before you write** — start with a blank Chapter 1 if that's how you work.
- **Fill out every Character field** — every field is optional.
- **Use every section of the app** — many writers only ever touch Chapters and Characters; that's a complete way to use JustWrite.
- **Configure AI** — every AI feature is optional.
- **Pay anyone** — JustWrite itself is yours, and you can use it with free local AI engines or none at all.
