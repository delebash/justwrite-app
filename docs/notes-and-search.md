# Notes and search

Two small but heavily-used surfaces.

---

## Notes

The **Notes** view (Planning section in the sidebar) is a scratch-pad. Each note is a single free-form rich-text document with a title and one optional tag.

### What's on the page

- **Note list in the sidebar** — every note you've created. Click one to open.
- **Inline title** — click in the header to rename.
- **Tag field** — a single freeform tag with typeahead from all tags already used across your notes. Arrow keys navigate the dropdown, Enter selects, Esc closes it.
- **Updated timestamp** — when the note was last edited.
- **Rich-text body** — the same full editor as chapters and worldbuilding articles. Headings, lists, links, images, tables, the lot.

### When to use Notes

A Note is the right home for anything that doesn't fit the structured views:

- Research clippings — quotes, references, links, photos
- Half-baked scene ideas you're not ready to commit to a chapter
- A to-do list for the project
- Cut prose — text you removed from a chapter but might want back
- Brainstorming threads — "five possible endings", "what does the antagonist actually want"
- Reader / beta feedback you want to address later

If you find yourself writing free-form thoughts and they don't belong to a Character, Location, Object, Worldbuilding article, or Architecture document, write them as a Note.

### Tagging

The tag field is the only organisational tool. Pick a single short label per note and the sidebar can filter by it. A few useful tag schemes:

- **By status**: `idea`, `wip`, `done`, `cut`
- **By part of the book**: `act-1`, `act-2`, `act-3`
- **By topic**: `research`, `feedback`, `prose-cuts`

The typeahead means once you've used a tag, you'll reuse it consistently.

### `@`-mentions work here too

Because Notes use the same rich-text editor as chapters, you can `@`-mention any Story Bible entity. Useful for "research on the Heliad Empire" — `@Empire` and the note links back into the Story Bible.

---

## Search

The **Search** view (top of the Manuscript section in the sidebar) is full-text search across everything you've written.

Open it from the sidebar, or press **Ctrl/⌘ + F** from anywhere in the app.

### What it searches

Every text surface in the project:

- Chapter prose (including each scene's body)
- Character profiles and Backstory
- Location descriptions
- Object descriptions
- Notes
- Groups
- Narrative strand notes
- Worldbuilding articles
- Architecture documents

If you also use Studio's Script tab to detect who speaks in which chapter, that speaker attribution is also folded into the index — so searching for a character name surfaces chapters where they speak even if their name isn't typed in the prose.

### What you see

- A **search bar** that auto-focuses when you open the view. Partial words work, and the search is case-insensitive.
- **Kind filter chips** — one chip per content type (Chapters, Characters, Locations, Objects, Notes, Groups, Strands, Worldbuilding, Architecture). Each chip shows a live result count for the current query. Chips with no matches are dimmed. Selecting chips narrows results to those types (multi-select). "All" resets.
- **Grouped results** — matches are grouped by content type, in a canonical order, with a count per group.
- **Result rows** — each shows the document title, an optional sub-label (e.g. part + chapter), and a snippet of the matching prose with the matched terms highlighted in your accent colour. Click any row to navigate to that document.
- **Result count** in the header ("N results").
- **Replace button** — opens the project-wide Find & Replace panel pre-filled with the current query.
- **Esc** clears the query and all kind filters.

### When to use Search

Search is the fastest way to answer questions like:

- "Where did I mention the lighthouse?"
- "Which note has my research on Victorian poisons?"
- "Where does the protagonist say 'I'll never go back'?"
- "Which chapter introduces the Empire?"

The kind filter is essential when looking for a name. Without it, searching for "Aria" returns chapters (every line of dialogue she has), her character page, every scene she's linked to, every note that mentions her, and probably a few worldbuilding articles. Filter to **Chapters** to see only the prose, or to **Characters** to jump straight to her file.

### Project-wide find and replace

The **Replace** button in the Search header opens a project-wide replace dialog — useful when you decide to rename a character across the entire book, or fix a typo you made consistently.

Shortcut: **Ctrl/⌘ + Shift + F** opens replace directly.

Replace shows you a preview of every match before committing. You can apply selectively or all at once.

**Why a writer would use it.** Renaming a character is the obvious case. Less obvious uses: changing tense in a chapter you've decided was wrong, fixing a place name you misspelled for half the book, or systematically cutting a verbal tic you noticed in revision ("I just realised I've used 'just' 240 times").

### The "Ask the book" chat

A different feature in the same neighbourhood: the **Ask the book** chat panel (Manuscript section, or **Ctrl/⌘ + J**) lets you ask natural-language questions about your manuscript and get answers that cite the chapters they came from. This is a separate feature from Search — Search finds exact matches, Ask the book reasons over the whole text.

Ask the book requires an AI provider and an embedding model. See [AI providers](ai-providers.md) for setup.

---

## A practical workflow

When you're trying to find something:

1. **Press Ctrl/⌘ + F.**
2. **Type a partial word** — "lighth" finds "lighthouse" and "lighthouses".
3. **Filter by kind** if the results are noisy.
4. **Click a result** to jump there.

When you want to rename across the whole book:

1. **Press Ctrl/⌘ + Shift + F.**
2. **Type the old name** and the new name.
3. **Review the preview**.
4. **Apply.**

When you want to ask a question about your book:

1. **Press Ctrl/⌘ + J.**
2. **Type your question** — "Where does Aria first realise her father is lying?"
3. Read the answer and the citations.

---

## See also

- **[Writing](writing.md)** — the editor's own in-chapter find-and-replace
- **[Keyboard shortcuts](keyboard-shortcuts.md)** — full shortcut reference
- **[AI providers](ai-providers.md)** — setting up the embedding model for "Ask the book"
