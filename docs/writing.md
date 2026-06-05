# Writing

This is the heart of JustWrite — the dashboard that tells you where you are, the chapter list, the editor itself, and the AI tools that sit inside it. If you only ever read one page of this guide, make it this one.

---

## Home

**Home** is your daily landing page. The sidebar's Manuscript section has a Home item; click it whenever you sit down to write.

What you see at the top:

- **Your manuscript's title** — click to rename inline.
- **A progress ring** — what fraction of your word goal you've hit. The goal is set in **Settings → Project → Goals**.
- **A chapter-status bar** — a horizontal bar showing the proportion of your chapters that are Done, in Revise, in Draft, or still To-do. The deadline you set in Settings appears as a clickable link.
- **Resume writing** — a card that surfaces the chapter you worked on today (or your last-open chapter as a fallback). Click the button to jump straight back into the editor at the right scene.

Below those:

- **Today's session** — words written today, current writing streak, last 14 days total, and a 14-square activity heatmap.
- **The fortnight** — a 14-day sparkline of your daily word counts.
- **Cadence** — a bar chart of your average word count by day of the week. Your best day is highlighted in gold.
- **Narrative strands** — a row per strand with a progress bar showing how many chapters that strand appears in.

**Why this matters for a writer.** The cadence chart often reveals something surprising — that you actually write more on Sundays than on weekdays, for example, or that your Mondays are wasted. Use that information to plan your week. The strand bars are a quick visual check that your subplots are distributed evenly through the book; if one strand has zero chapters for the last quarter of the book, that's a red flag worth investigating.

---

## Chapters

The **Chapters** view is the main writing surface. Open it from the sidebar, or jump straight in from Home's Resume button.

### The view modes

A segmented toggle at the top of the page switches between four modes. They show the same chapter; only the lens changes.

- **Edit** — the writing surface. The default.
- **Outline** — a tree view of every Part, Chapter, and Scene in your manuscript. Inline-editable titles. Drag to reorder. Click any chapter to open it in Edit mode.
- **Cards** — a corkboard view. Each scene appears as a card with a small prose excerpt. Drag cards to reorder scenes within a chapter. Useful for restructuring without committing to a new layout.
- **Read** — a clean read-only view, no editor chrome. Two sub-scopes: **Chapter** (one chapter at a time with Previous/Next) and **Whole book** (the entire manuscript in one continuous scroll, with the sidebar tracking what scene is visible).

**Why a writer would care.** Outline is your planning lens — sketch chapter and scene titles before you write anything. Cards are your editing lens — physically arrange the order of scenes inside a chapter. Read is your reviewing lens — see what your prose actually sounds like without the formatting clutter. Most writers default to Edit and dip into the others as needed.

### The Outline tree

In Outline mode you can:

- Inline-rename any Part, Chapter, or Scene by clicking on its title.
- Reorder Parts with up/down controls.
- Move a chapter from one Part to another with a dropdown.
- Add a new Part, Chapter, or Scene with `+` buttons.
- Click any chapter to open it in Edit mode.

### Splitting a chapter

If you imported a long single-blob document, or you wrote a chapter that is now too long, the editor has a **Split chapter** action. Place your cursor where you want the split, run the command, and JustWrite asks for a title for the new chapter that comes after. The split happens cleanly; both halves keep their scenes.

---

## The editor

When you click into a chapter, you see the editor: a TipTap-powered rich-text writing surface with a full toolbar.

### Toolbar buttons

From left to right (approximate; some buttons collapse into menus on narrower windows):

- **Bold, Italic, Underline, Strikethrough, Subscript, Superscript**
- **Heading levels** (H1 / H2 / H3) — for non-chapter headings inside your prose
- **Font size** — decrease/increase, with the live size shown
- **Blockquote, Bullet list, Ordered list, Task list**
- **New scene boundary** (only visible in continuous-chapter mode) — inserts a divider between scenes
- **Alignment** — left / centre / right / justify
- **Highlight** — multi-colour text highlighting
- **Text colour**
- **Link**
- **Image insert** — embed an image inline
- **Table**
- **Clear formatting**
- **Copy / Cut / Paste**
- **Print**
- **Inline comment** — attach a private note to selected text; the marked text is visually distinguished and clicking it shows the note in a popover
- **Find / Replace bar** — search within this chapter
- **Focus mode** — distraction-free full-screen writing
- **Editor settings** — per-document overrides for font, size, line spacing, layout (Page or Full-width)
- **Undo / Redo**

### The bubble menu

Select any text and a small floating menu appears next to your selection with the formatting palette — bold, italic, underline, text colour, font size, link, comment. The bubble is formatting only; the AI actions live in the scene strip's **AI** dropdown (see below) so they're one click away even when you don't have a selection yet.

### `@`-mentions

Type **`@`** anywhere in the editor and a picker appears. Search across your entire Story Bible — characters, locations, objects, groups, strands. Pick one to insert a linked mention.

A mention is more than text: it tells the rest of the app that this entity appears in this scene. Open the character's page later and you'll see every scene they were mentioned in, with the surrounding prose as a snippet.

### Inline comments

Highlight any text and click the comment button (or use the bubble menu). Type your note. The text is now visually marked; click it later to read the note. Comments are private — they never appear in exports.

Use comments for notes-to-self ("rewrite this passage"), questions you want to come back to ("verify the timeline here"), or research reminders ("look up Victorian medical practice").

### Continuous-chapter mode

By default the editor shows one scene at a time. The **Continuous** toggle stitches every scene in the current chapter together into one document with visible dividers between scenes. Useful when:

- You think in flowing chapters rather than discrete scenes.
- You want to read or revise a whole chapter top-to-bottom without clicking between scenes.
- You want to merge two scenes (delete the boundary) or split one (insert a new boundary mid-scene).

The **New scene** toolbar button (or Ctrl/⌘ + Shift + Enter) inserts a boundary at the cursor.

### The scene strip

Above the editor, a thin bar shows scene-level controls. From left to right:

- **Previous / Next scene** navigation
- The current scene number and status, colour-coded
- **[AI]** — opens the AI dropdown (Rewrite, Expand, Tighten, Continue, Prose pass — see below)
- **Status** select — the scene's status (To-do / Draft / Revise / Done, or whatever you've configured)
- **Split here** — splits the chapter at the cursor; the active scene stays with the original chapter and the rest becomes a new chapter
- **Notes** — opens a scene-focused notes view (just this scene's pinned notes; for the whole-chapter list use the chapter-level Notes button below)
- **Links** — see below
- **+ New scene** — adds a scene to the current chapter (the primary action)
- **Delete scene** — only enabled if there's more than one scene in the chapter

A second toolbar sits just below for chapter-level controls when no scene is focused: previous/next chapter, the chapter's Status, **Versions**, **Critique**, chapter **Notes**, **New chapter**, and **Delete chapter**.

### The Links panel

Click **Links** on the scene strip to open a modal that records the connective tissue for this scene:

- **POV perspective** — six options from first-person through omniscient
- **Characters present** — main and secondary; you can create a new character right here without leaving the scene
- **Locations** — same; inline-create supported
- **Objects** — same
- **When** — free-text date, with a toggle between gregorian and any alternative calendar you use
- **Narrative strands** — which threads this scene belongs to

**Why a writer would bother.** The Links panel is what makes the rest of the app intelligent. Search uses it to find scenes by character or strand. The Strands view shows you which scenes each strand touches. The Cast Presence heatmap in Analysis is built from it. The Relations graph uses it to draw edges. Filling it in is a five-second job per scene; the payoff is everywhere.

### Word and character count

The footer of the editor shows live word and character counts for the active scene (or the whole chapter in continuous mode), updating on every keystroke.

### Find and replace

The **Find / Replace** bar in the toolbar searches within the current chapter and highlights matches as you type. For project-wide replace (renaming a character across the entire book, for example), press **Ctrl/⌘ + Shift + F**, or open Search and click **Replace**.

---

## AI writing actions

If you have an AI provider configured (see [AI providers](ai-providers.md)), the scene strip's **[AI]** dropdown holds a row of AI actions. None of these are required, and they all show you the result as a coloured diff that you accept or reject line-by-line — your prose is never silently overwritten.

The dropdown groups actions by what they operate on, so you can tell at a glance whether you need to highlight text first:

- **Selection only** — Rewrite and Expand. Greyed out until you select text in the editor.
- **Selection or whole scene** — Tighten. Runs on the selection if you have one, on the entire scene otherwise.
- **From the cursor** — Continue. Generates the next paragraphs from wherever the cursor sits.
- **Prose pass** — surgical revisions (Show don't tell, Filter words, Dialogue tags, etc.) that run on the selection, or on the whole scene if nothing is selected.

### Whole-passage actions

- **Rewrite** — same meaning, different prose. Useful when you know the scene works but the wording feels stale. *Selection only* — for whole-scene rewrites, use Writer Lab where you can compare passes side-by-side.
- **Expand** — adds sensory detail, interiority, small physical actions. Roughly doubles the length. *Selection only.*
- **Tighten** — strips filler. Comes back shorter. *Selection or whole scene* — runs on the highlighted text, or the entire scene if nothing is selected.
- **Continue** — generates the next 2–4 paragraphs from the cursor. Useful when you're stuck. *No selection needed.*

### Prose passes

A grouped section of more targeted revisions, each focused on one craft problem. All of them run on the selection, or on the whole scene if nothing is selected.

- **Show, don't tell** — replaces emotion-state statements with concrete behaviour, sensory detail, and dialogue.
- **Passive voice** — converts to active where it strengthens the prose.
- **Filter words** — removes distancing phrases ("she saw", "he felt", "she noticed") so the reader is in the character's perception directly.
- **Dialogue tags** — replaces fancy tags ("exclaimed", "retorted") with "said"/"asked" or action beats; removes adverbs.
- **Sentence variety** — mixes long and short structures when the rhythm has gone monotonous.
- **Prose tightening** — cuts hedges ("just", "really", "very") and sentences that don't earn their place.

**How to use them well.** A small selection gives you a focused, easy-to-review result; running a Prose pass on a whole scene is the right move when you want one consistent treatment applied throughout (e.g. "strip filter words across this scene"). The output is always a starting point, not an answer — accept the changes you like, reject the ones you don't, and keep moving. If a result feels worse than what you wrote, that's useful information about what makes your prose yours.

### Critique and structural analysis

The **Critique** button in the chapter editor toolbar runs two separate passes on the current chapter:

1. A **critique pass** that returns notes grouped by severity: Flags (problems), Suggestions (improvements), Observations.
2. A **structural pass** that scores Tension (1–10), Hook Quality (1–10), and classifies pacing and ending.

Notes persist on the chapter and can be re-run independently.

### Entity extraction

Inside the Critique modal there is a sweep that proposes Story Bible entities — characters, locations, objects — that appear in the chapter text but aren't yet in your Bible. You review every proposal individually; nothing is added without your click. Useful after writing or after importing a draft from elsewhere.

---

## Version History

Click **Versions** in the chapter editor toolbar to save a named snapshot of the current chapter. The dialog shows every snapshot you've ever taken, and you can:

- **Restore** any previous snapshot, replacing the current version.
- **Diff** any two snapshots side-by-side (or compare a snapshot against the current live version).

The diff uses the same red/green visual language as the AI tools, so what's been removed and what's been added is immediately clear.

**Why a writer would use it.** Save a snapshot before any risky revision — a big restructure, an aggressive edit, an AI rewrite. If you regret it, restore. The diff view also makes it possible to see what you actually changed during a revision pass, which is genuinely interesting.

---

## Navigation inside Chapters

The header has a breadcrumb (**Part → Chapter → Scene**) with clickable segments and Previous / Next chapter buttons. Inside the editor:

- **Arrow Left / Right** (in Read mode) — previous/next chapter
- **Esc** (in Whole-book Read mode) — exit back to Edit
- **Tab / Shift + Tab** (in lists and paragraphs) — indent / outdent

---

## A typical writing session

A practical rhythm:

1. Open the app. You land on Home — you can see what you wrote yesterday and your streak.
2. Click **Resume writing**.
3. Write. The editor's word count climbs in real time; you don't have to save anything.
4. When you finish a scene, fill in the **Links** panel (characters, location, strand). Five seconds.
5. Open **Outline** to see how this chapter is shaped, or **Cards** to drag scenes into a better order.
6. Optional: select a passage you're unhappy with, hit **Tighten** or **Show, don't tell** in the bubble menu, and see what comes back.
7. End the day. Tomorrow, JustWrite remembers exactly where you stopped.

That's it. Everything else in the app is in service of this loop.

---

## See also

- **[Core concepts](core-concepts.md)** — Parts, Chapters, Scenes, autosave, undo
- **[Story bible](story-bible.md)** — Characters, Locations, Objects, Groups
- **[Plot and time](plot-and-time.md)** — Strands, Plot Board, Events
- **[AI providers](ai-providers.md)** — getting AI features running
- **[Keyboard shortcuts](keyboard-shortcuts.md)** — the full reference
