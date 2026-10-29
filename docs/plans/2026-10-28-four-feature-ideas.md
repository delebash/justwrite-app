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
The facts this plan rests on are in `docs/dev/RESEARCH.md`, "Four feature ideas".

**The standards, piece by piece** (checked by the kit's `scripts/check-plan.js`):

| Piece | Standard it follows | Kit code |
|---|---|---|
| 1. The PDF's page size and margins | pdfmake's `pageSize` / `pageMargins` | app — JustWrite's own manuscript export (`src/services/export/pdf.js`); only this app exports documents |
| 1. Page size and margin fields on the PDF card | the kit's controls | `UiSelect`, `UiInput` |
| 1. The choice kept per book, and synced | the added-columns list + the sync schema step, as `language` was added | app — the book's own storage (`server/src/database/models.js`, `book_io.js`, `sync.js`) |
| 1. The sizes offered, editable | seeded rows (the seed ships facts) | app — JustWrite's seeded data (`server/src/database/seed.js`) |
| 2. AI-written words per chapter | the existing per-book count | app — writing (`src/services/aiText.js`) |
| 2. The breakdown | the family's one table control | `UiTable` |
| 2. Copy as text | the browser's Clipboard API, as the kit's own copy does | app — Quasar's `copyToClipboard`, as the app's other copies (2026-10-29: `navigator.clipboard` is missing on a plain http:// address); the kit has no clipboard helper |
| 3. The Story Bible outline | the pages' own field labels (the locale's `characters.fields.*`, …) | app — writing (a new `src/services/export/storyBible.js`) |
| 3. The DOCX and PDF files | the `docx` library and pdfmake, already shipped | app — JustWrite's own document export (`src/services/export/`) |
| 3. The Story bible card | the kit's controls | `UiCheckbox`, `UiButton` |
| 1–3. A failure while exporting | the kit's error reporting | `reportError` |

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

**Built 2026-10-28, with one change found while building.** Decision 3 became three margins (top,
bottom, sides), because two couldn't keep decision 2. Today's A4 has a 70 pt top and an 80 pt bottom,
with the page number in the bottom margin, and one "top and bottom" value would have moved every
existing PDF. The seeded ids have no dots (`trim-5-25x8`), because vue-i18n reads a dot in a key as
nesting. Choosing a size resets the margins to the new size's own. A margin commits when its box is
left or on Enter, so it's one undo step. The cover image now fits the chosen page's text area (it was
A4's, as numbers). Checked: an exported 6 × 9 PDF of the sample book has every one of its 355 pages
at `0 0 432 648`.

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

**Built 2026-10-28.** `chapterAiWrittenWords` beside the book's count; the share shows one decimal
(a new shared number format, `percentOneDecimal`, in `src/i18n/index.js`), because a whole percent
read a few words in a long chapter as "0%". Building it on a phone showed that Settings → Project
squeezed every field into a third of the screen: its 160px label column now stacks over the fields
under Quasar's sm breakpoint (`.proj-fields`). The table's column names wrap so its three columns fit
on a phone.

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

**Built 2026-10-28.** The outline's labels come through `tBook`, in the book's language, as the
manuscript files' few words do. The PDF uses the book's PDF page (§1). The two exporters' engine
loaders (`getDocx`, `getPdfMake`) and the page-number footer (`pageNumberFooter`) are now exported and
shared, not copied. Checked on the sample book: the DOCX reads "The Salt-Iron Road — Story bible",
"by Neve Aubermont", Characters → Sable Coyne → Role, Age, One-liner, then the Arc section; the PDF
has 15 A4 pages.

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
