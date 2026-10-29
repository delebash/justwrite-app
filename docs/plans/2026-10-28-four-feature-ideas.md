# Four feature ideas — the plan for your word (2026-10-28)

You liked four ideas and asked for them after the fixes, each argued against again before the
recommendation. This is that second pass. Each idea lists what exists today, the standard each piece
follows, the decisions that are yours (numbered, with my recommendation), and the blast radius.
Nothing here is built until you say go. A piece marked **NOT STANDARD** needs your word by name.

**The kit's "one way per job" table** (`just-core/docs/app-structure.md` §19). Its rows that apply
are **Controls** (the `Ui*` controls: `UiSelect`, `UiInput`, `UiTable`, `UiCheckbox`) and **A
failure, a field's refusal** (`reportError`, `fieldErrors`). The table has no row for exporting a
document or for a seeded table of facts. JustWrite's own `src/services/export/` (pdfmake, `docx`)
and the server's seeded rows are how this app does both today, and only this app exports documents.
So they stay app code. If you want them in the family table, the kit session adds the rows.

## 1. PDF page size and margins

**Today.** `src/services/export/pdf.js:148-149` fixes the page at A4 with margins `[80, 70, 80, 80]`
points, in code. That breaks the house rule (nothing hardcoded), and A4 is no trim size a printer
uses for a novel. Page numbers are already in the footer (`pdf.js:172`). `docs/import-and-export.md`
calls the result "print-ready", which it isn't.

**What the second attack changed.** I dropped "print-ready". pdfmake has no mirrored (inside/outside)
margins, so a gutter can only be a symmetric margin wide enough for it. KDP accepts that, but it isn't
full book typesetting (no chapters forced onto right-hand pages, no running heads). Vellum and Atticus
do that, and we shouldn't pretend to. The feature is: choose the page size and margins of the PDF,
remembered per book.

**Standards.**
- pdfmake's own `pageSize` (a named size or `{ width, height }` in points) and `pageMargins` —
  https://pdfmake.github.io/docs/0.1/document-definition-object/page/
- KDP's paperback trim sizes and margin minimums are the facts —
  https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6
- Per-book storage the way `language` and `ai_scene_drafting` were added: the added-columns list in
  `server/src/database/models.js`, `book_io.js` both ways, and `SYNC_SCHEMA_VERSION` 7 → 8 in
  `server/src/sync.js` (each step's reason is recorded beside it there).
- The sizes are seeded facts, editable: a `page_sizes` table seeded with rows. That's the house
  pattern for facts (the seed ships facts and rules), and a new table needs no reset.

**Your decisions.**
1. The sizes offered. Rec: A4, US Letter, A5, and the four common novel trim sizes — 5 × 8 in,
   5.25 × 8 in, 5.5 × 8.5 in, 6 × 9 in.
2. The default for a book. Rec: A4 stays the default, so nobody's PDF changes until they pick a
   size.
3. Margins: one value for all four sides, or top/bottom/inside/outside. Rec: two values, "Top and
   bottom" and "Sides", in the size's own unit (inches for inch sizes, millimetres for A sizes). The
   defaults keep today's look on A4, and use KDP's safe minimum plus a little for the trim sizes.
4. Where the choice lives. Rec: the PDF card on the Export page, remembered per book. Not in Settings,
   because the PDF card is where you meet it.
5. The words. Rec: "Page size", "Top and bottom margin", "Side margins"; the doc's "A print-ready A4
   document" becomes "A typeset PDF, at the page size you choose".

**Blast radius.**
`pdf.js` (pageSize, pageMargins) · `ExportPage.vue` (the PDF card) · `server/src/database/models.js`
(new columns + the `page_sizes` table) · `server/src/database/seed.js` (the seeded rows) · `book_io.js`
(the columns both ways) · `server/src/sync.js` (schema 8) · `stores/project.js` (the fields, and their
undo domain in `ACTION_DOMAINS`) · `docs/import-and-export.md` · tests: a server round trip of the
columns, a unit test of the page geometry, a flow on the PDF card.

## 2. AI-written words, chapter by chapter

**Today.** Settings → Project shows "AI-written words in this book: N" (`SettingsPage.vue:728`,
`services/aiText.js` `bookAiWrittenWords`). It counts the words still marked as AI-written (violet,
until Mark as mine).

**What the second attack changed.** It dropped two things. One was the usage records: they don't say
which book an AI call was for, so reading them by book means a cross-app schema change in the kit.
The other was a generated "disclosure statement": legal-sounding text the app can't stand behind.
What's left is the facts the app already has, broken down so you can answer a publisher's question
(KDP asks whether a book contains AI-generated text). It reports only what is still marked, and says
so on the screen.

**Standards.** The existing count (`aiText.js`) per chapter — no new data. The kit's `UiTable` for the
table (the family's one table control) and the clipboard the app already uses for "Copy".

**Your decisions.**
1. Where it shows. Rec: under the count in Settings → Project, opened with "By chapter", so the
   number and its breakdown are in one place.
2. What it lists. Rec: each chapter with marked words — chapter, marked words, its share of the
   chapter — and the book's total; chapters with none are left out.
3. "Copy as text": a plain list you can paste into a form. Rec: yes.
4. The note on the screen. Rec: "Counts the words still marked as AI-written. Mark as mine clears a
   mark, so this is what's marked, not a history."

**Blast radius.** `SettingsPage.vue` (the Project section) · `services/aiText.js` (a per-chapter
helper beside `bookAiWrittenWords`) · `docs/writing.md`'s AI scene drafting part (line ~349, where
the switch and Mark as mine are; the count itself isn't in the user docs yet) · a unit test of the
helper · a flow on the breakdown.

## 3. Story Bible export

**Today.** The book `.zip` holds the whole story bible, but only JustWrite reads it. There's no way to
hand an editor, co-author or illustrator the sheets as a document.

**What the second attack changed.** Not much; it holds up. One trim: no new layout engine. It uses
the two exporters the app already ships, `docx` and pdfmake, and the same field labels the pages show
(the locale's `characters.fields.*` and so on), so one label never reads two ways.

**Standards.** The `docx` library and pdfmake, both already used (`src/services/export/docx.js`,
`pdf.js`). The Export page's card pattern for where you choose it.

**Your decisions.**
1. What it includes. Rec: characters (every filled field, by the sheet's sections), locations,
   objects, groups, worldbuilding articles. Timeline events stay out at first — they read better on
   the Timeline.
2. Empty fields. Rec: left out.
3. Formats. Rec: DOCX and PDF.
4. Which entries. Rec: all of them, with a switch to leave out anything marked "Exclude from AI" —
   the flag writers use for spoilers.
5. Where. Rec: a fifth card on the Export page, "Story bible".

**Blast radius.** `ExportPage.vue` (a card) · a new `services/export/storyBible.js` that builds the
outline from the project and hands it to the two exporters · `docs/import-and-export.md` (the cards
list says "Four cards") · unit tests of the outline, a flow on the card.

## 4. Series — books that share their story bible

**Today.** A book is one project; nothing is shared between books.

**What the second attack changed.** Still a design, not a build. The cheap version, "copy characters
from another book", makes copies that drift apart. That's the opposite of what a series needs: one
source for a character across books, with each book's own changes. The real thing touches how a book
is stored, undo (per page, per book), sync (by book), search and the AI's story context.

**The design questions, for a design document of their own if you want the series.**
1. What's shared: characters, locations, objects, groups, worldbuilding, timeline events — all of
   them, or a chosen few?
2. How a book changes a shared entry: an override per book (book 2's Wren is older), or edits that
   change the entry for every book?
3. Where a series lives: a new level above books in the book switcher, or a link between books?
4. What the AI sees: the whole series' bible, or this book's view of it?

## The order, if you say go

1 (it also clears a hardcoded value), then 3, then 2. 4 waits for its own design document.
