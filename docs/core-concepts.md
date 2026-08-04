# Core concepts

Before you start clicking around, it helps to understand how JustWrite organises a book and how it keeps your work safe. None of this is hard; it is mostly common sense with a few names attached.

---

## A book is Parts → Chapters → Scenes

> *"I want to break my novel into acts, then chapters, then individual scenes I can move around — but I'm not sure how the app expects me to think about that."*

Every manuscript in JustWrite has three structural levels:

- A **Part** groups chapters. You can call a Part anything — "Part One", "Book of Storms", "Before the Fall". Many novels use a single Part for the whole book; longer or multi-volume works use several.
- A **Chapter** is what your reader will see as a chapter.
- A **Scene** is a unit inside a chapter. Scenes are how JustWrite splits one chapter into multiple drafts on the corkboard, lets you reorder beats inside a chapter, and tracks which characters and locations appear where.

You write **inside scenes**. A chapter is just a container; the prose lives in the scenes.

If you think in chapters rather than scenes, that is fine — every chapter starts with one scene, you can stay there forever, and JustWrite will treat your chapter and scene as one piece. If you prefer to break a chapter into discrete beats, the Scene structure is ready for you.

You can also switch a chapter into **continuous mode** (a toggle in the editor) where you see and write all of its scenes as one stitched document with visible dividers between them.

---

## The Story Bible

> *"My character notes are in a Google Doc, my world history is in a spreadsheet, and my location sketches are in a notebook. Every time I need to check something, I'm switching between three places."*

The "Story Bible" is the collective name for everything that isn't manuscript prose:

- **Characters** — your cast
- **Locations** — your places
- **Objects** — your significant props (a relic, a letter, a car, a sword)
- **Groups** — collections that bundle any of the above (factions, families, crews)
- **Worldbuilding articles** — long-form reference pages organised by category (magic, history, politics, etc.)
- **Narrative strands** — your plot threads (we'll explain these next)
- **Architecture** — three fixed planning documents that hold your book's foundations
- **Notes** — anything else

The Story Bible is where you do background work that doesn't go into the manuscript. None of it is required, but the more you fill in, the more the rest of the app can help you — Search finds it, the Relations graph maps it, exports can include it, and the AI features know it exists when you ask them to rewrite, critique, or extract entities.

---

## Strands vs. Plot Board vs. Events vs. Timeline

> *"I see four different planning views and I don't know which one I'm supposed to use to map out my subplot."*

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

> *"I just deleted that chapter and immediately regretted it. It's gone, isn't it."*

When you delete a chapter, a character, a note, a strand — anything — JustWrite does not actually destroy it. It moves the item to the **Trash**. The row visibly leaves the list, and there are two ways back: press **Ctrl/⌘ + Z** on that page to undo the delete on the spot, or open **Trash** from the sidebar's Project section — every soft-deleted item from every category is sitting there with a **Restore** button. Items stay in Trash indefinitely; you decide when (or whether) to empty it.

This means you can experiment fearlessly. Delete a chapter you don't think is working; if you change your mind a week later, restore it.

The only thing that actually destroys an item is clicking the trash-can icon inside the Trash view itself, or pressing **Empty trash** at the top. Both confirm before doing anything.

---

## Undo and redo

> *"I renamed a bunch of things and moved some scenes around and now everything feels wrong. I just want to go back to how it was ten minutes ago."*

Undo in JustWrite is **page-related**: **Ctrl/⌘ + Z** undoes changes to the data the page you're looking at owns, and never silently reverts something happening on another page. Undo on Characters walks back character edits; undo on Chapters walks back manuscript changes; a character edit can never vanish while you're looking at your chapters. Redo with **Ctrl/⌘ + Shift + Z** (or **Ctrl + Y** on Windows), and each page's redo survives work you do elsewhere.

A few details worth knowing:

- Undo follows the **data**, not where you made the change. A chapter renamed from the sidebar, or a project-wide find-and-replace run from Search, is undone on the Chapters page — the place that data lives.
- Inside the manuscript editor, undo is handled by the editor itself (this is why your typing doesn't jam up the page history). Each chapter's editor has its own undo log.
- Pages that don't own book data — Search, Import, Export, Trash, Analysis — have nothing of their own to undo; the title-bar Undo button greys out there and tells you so.
- History lives in memory for the current session (each page keeps a deep buffer — roughly ten minutes of continuous typing before the oldest step falls off). Durable rollback across sessions is the per-chapter version history plus autosave, below.

In short: edit freely. There is almost always a way back.

---

## Autosave

> *"I wrote for two hours and then the power flickered. Please tell me I didn't just lose all of that."*

You do not need to save. Every change you make — typing in a chapter, adding a character, dragging a beat — is saved through JustWrite's local server (a database on your own computer) within seconds, plus a rotating on-disk autosave shortly after — nothing lives only in the window.

The sidebar footer shows "Autosaved · Xs ago" so you can confirm at a glance that things are flowing.

If you ever want to force a backup to a file you can move or archive, open **Settings → Backups** and use **Export backup** (the whole workspace) or **Export this book…** (one project). See [Backups and data](backups-and-data.md) for the full story on backups and recovery.

---

## Statuses

> *"I have forty chapters and I genuinely cannot remember which ones I've revised and which ones are still rough draft."*

Almost every item in JustWrite (chapters, scenes, characters, locations, articles, strands) carries a **status** — a coloured label that tells you, at a glance, where it stands. The default palette includes things like Draft, Revise, Done, To-do.

You can edit the palette in **Settings → Project → Statuses**: add new statuses, rename them, recolour them, delete ones you don't use. The colours then appear throughout the sidebar, on chapter rows, on scene strips, and on the Home dashboard.

Statuses are entirely yours. Use them for whatever workflow makes sense to you. A common scheme:

- **To-do** — a chapter sketched but not yet written
- **Draft** — written, not yet revised
- **Revise** — revised once, may need another pass
- **Done** — finished

---

## Tags

> *"I want to pull up every character who's part of the northern faction without having to remember which ones I tagged with what."*

Characters, Locations, Objects, and Worldbuilding articles all carry **tags** — short freeform labels you type yourself. Tags are how you cut across categories: "antagonist", "northern coast", "act three", "magic system".

Tags suggest existing values as you type, so you don't end up with "Antagonist", "antagonist", and "antag" all referring to the same thing.

---

## Mentions: the `@` symbol

> *"I keep referring to the same character in fifty different scenes and I have no way of knowing which scenes she actually appears in without reading the whole thing."*

When you are writing in the editor, type **`@`** to bring up a small picker. Start typing a name and JustWrite shows matches from your entire Story Bible — characters, locations, objects, groups, strands. Pick one and it gets inserted as a linked mention.

This is the single most useful keystroke in the app. A mention makes the entity findable: open the character's page, and you see a list of every scene they're mentioned in, with a snippet of the surrounding prose. Search finds them. The Relations graph uses them.

Use `@` liberally. It costs you nothing and it makes the entire Story Bible come alive.

---

## Finding help in the app

> *"I opened this pane and I have no idea what half these fields are for."*

Every pane's title row has a small **`?`** button. Click it and a drawer slides in from the right with the docs for that surface — no browser, no context switch. The footer of the drawer has **"Open full docs"** (jumps to the full help view inside the app) and **"Open on the web"** if you prefer to browse.

Two other quick-reference tools: **Ctrl/⌘ + /** opens a shortcut cheatsheet overlay, and **Ctrl/⌘ + P** (the command palette) lists every help doc — type a keyword and hit Enter to open the relevant drawer.

---

## What you do not need to do

Things JustWrite does not require:

- **Save your work** — autosave handles it.
- **Plan before you write** — start with a blank Chapter 1 if that's how you work.
- **Fill out every Character field** — every field is optional.
- **Use every section of the app** — many writers only ever touch Chapters and Characters; that's a complete way to use JustWrite.
- **Configure AI** — every AI feature is optional.
- **Pay anyone** — JustWrite itself is yours, and you can use it with free local AI engines or none at all.

---

## Trash, in detail

Trash groups deleted items by kind — all twelve of them (chapters, scenes,
characters, locations, objects, groups, notes, strands, worldbuilding articles,
events, markers, images) — each with its own restore. A restored scene goes back
into its chapter, a chapter back into its part. **Empty trash** (and the per-item
permanent delete inside Trash) is the only genuinely destructive act in the app,
and both confirm first.

## Curated tag vocabularies

Freeform tags splinter: "antagonist", "Antagonist", "antag". **Settings →
Project → Tag vocabularies** holds an optional curated list per entity kind —
when one exists, tags you type are canonicalised against it on save, so the
three spellings above become one tag. The lists ship **empty on purpose** (your
taxonomy is your own; a starter set was considered and rejected). Alongside the
word goal, the goals card also takes a **daily target** — the number your Home
streak and session cards measure the day against.
