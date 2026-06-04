# Import and export

JustWrite reads and writes the formats writers actually use:

- **Reads**: Word (`.docx`), EPUB, LibreOffice (`.odt`), Markdown (`.md`), plain text (`.txt`)
- **Writes**: PDF, Word (DOCX), EPUB, M4B audiobook

---

## Import

The **Import** view (Project section in the sidebar) brings a manuscript file into JustWrite as chapters.

### Three import modes

When you start an import, you choose what to do with the result:

| Mode | What it does |
|---|---|
| **Edit in current project** | Adds the imported chapters to the project you're currently in. You can optionally drop them inside a brand-new Part. |
| **Create new project** | Spins up a fresh project from the imported file. You pick a title and (optional) author. |
| **Narrate as audiobook** | Same as "Create new project" but drops you straight into Studio → Cast as soon as it's done. |

### How to import

1. Open **Import** from the sidebar.
2. Choose your mode.
3. **Drop a file onto the page** or use the file picker. Supported formats: `.docx`, `.epub`, `.odt`, `.md`, `.txt`.
4. JustWrite parses the file and shows a **preview** with every detected chapter.
5. **Review the preview**: each chapter shows its detected title, word count, and a text snippet. You can:
   - Rename any chapter title inline.
   - Drop chapters you don't want imported.
6. If the parser had to work around odd formatting, a **warnings panel** explains what was adjusted.
7. **Confirm.** The chapters land in your project.

### Optional cleanups

- **Text normalization** (on by default) — converts curly quotes, em-dashes, ellipses, and whitespace to consistent Unicode. Turn it off if you want to preserve the original character encoding exactly.
- **Entity sweep** (offered after import) — an AI scan of the new chapters that proposes characters, locations, and objects to add to your Story Bible. You review every proposal individually; nothing is added without your click. Requires an AI provider.
- **Images** embedded in DOCX, EPUB, and ODT files are extracted and stored alongside the project.

### When to use which mode

- **Edit in current project** — you're moving an in-progress draft from Word or Scrivener into JustWrite and want to keep working on it. Useful for getting one Part of a long manuscript out of a `.docx` file you've outgrown.
- **Create new project** — you have a finished or partial book in another tool and you want a clean JustWrite project for it.
- **Narrate as audiobook** — you have a complete manuscript and you want to record an audiobook of it without doing any editing in JustWrite. One-click into Studio.

### Tips

- **Chapter detection** relies on heading structure (`Heading 1`, `Heading 2`, etc., or `#` and `##` in Markdown). A document with no headings will come in as a single chapter; you can split it later using the editor's **Split chapter** action.
- The preview lets you catch parser mistakes **before** anything changes in your project. If the chapter split looks wrong, drop chapters from the list or rerun the import after fixing the source file.
- Scrivener exports `.epub` cleanly. Word exports `.docx`. Google Docs can save as `.docx` or `.epub`.

---

## Export

The **Export** view (Project section in the sidebar) produces a finished file in one of four formats.

### The format picker

Four cards: **PDF**, **DOCX**, **EPUB**, **M4B Audiobook**. Pick one to see its options.

### PDF

A print-ready A4 document with:

- Serif typesetting
- A generated **Table of Contents**
- Each chapter starting on a new page
- Optional **cover image** (set in Settings → Project → Cover image)
- Optional **Part covers** between sections

**Engine:** pdfmake, downloaded on demand (about 1.8 MB) the first time you export to PDF.

**When to pick PDF:**

- Sending a draft to an agent or editor who wants a clean read.
- Sharing with beta readers who don't have specific format preferences.
- Printing a physical reading copy.
- Any time you want a single self-contained file that opens the same on every device.

### DOCX

A Word document that preserves:

- Chapter headings (so Word's "Navigation Pane" works)
- Scene breaks
- Block quotes
- A live **table of contents** that Word will offer to refresh on first open

**Engine:** docx (about 700 KB), downloaded on first use.

**When to pick DOCX:**

- Sending to an editor or collaborator who wants to track changes or leave comments.
- Submitting to an agent or publisher who specifies DOCX.
- Importing into another writing tool.

### EPUB

A reflowable EPUB 3 e-book with:

- One HTML file per part and chapter
- A navigation document
- Full compatibility with Apple Books, Kobo, and Calibre
- Optional cover image and metadata (title, author, language)

**Engine:** about 80 KB, downloaded on first use.

**When to pick EPUB:**

- Publishing to **Apple Books** or **Kobo** (both accept EPUB 3 directly).
- Publishing to **Amazon Kindle** — start with EPUB and run it through Amazon's Kindle Previewer to produce the final format Amazon wants.
- Loading onto an e-reader for your own reading.
- Sharing with beta readers who use e-readers.

### Continuous prose toggle (PDF / DOCX / EPUB)

A checkbox that strips scene titles and `* * *` scene-break ornaments before export, so each chapter reads as **uninterrupted prose** — the way most print novels are formatted.

Leave it off if you want scenes to remain visibly separated (some writers and indie publishers prefer this).

### M4B Audiobook

A single file containing the entire audiobook with chapter markers and metadata. See [Audio Studio](audio-studio.md) for the full audiobook workflow.

**Requirements:**

- All chapters you want included must already be rendered in Studio → Render.
- Engine: ffmpeg.wasm (about 10 MB), downloaded on first use.

**Source status panel** in the M4B card shows:

- How many chapters are rendered
- Total duration ready to export
- A direct link to Studio → Render if anything is missing

If only some chapters are rendered, JustWrite offers to export the partial set.

**When to pick M4B:**

- Publishing an audiobook (Apple Books treats M4B as a proper audiobook with chapter navigation and resume-position memory).
- Sharing a draft narration with beta listeners.
- Personal use on an audiobook player (Overcast, Smart Audiobook Player, BookPlayer, etc.).

### Manuscript stats panel

Before exporting any document format (PDF / DOCX / EPUB), a stats panel shows:

- Parts count
- Chapters count
- Total word count

This is a sanity check — confirm the right scope before clicking Export.

### Progress and filename

- **Progress display** — a percentage bar (for M4B) or animated indicator (for document formats) with stage labels: "Loading PDF engine…", "Composing document…", "Packaging archive…".
- **Automatic filename** — the exported file is named after your project title, slugified. You don't need to name it manually.

---

## A practical export workflow

For a typical novel ready to go to an agent:

1. **Set your metadata** in **Settings → Project**: title, author, subtitle, genre.
2. **Add a cover image** in **Settings → Project → Cover image** if you want one in the PDF and EPUB.
3. **Open Export.**
4. **Pick PDF** for the agent submission.
5. **Optional**: also export EPUB for your own reading on a device.

For a novel ready to publish:

1. **Set metadata and cover.**
2. **Export EPUB** for Apple Books, Kobo, and Kindle (via Kindle Previewer).
3. **Export DOCX** if your publishing path needs it (some print-on-demand services prefer it).
4. **Optional**: record the audiobook in Studio and **export M4B** for audiobook distributors.

---

## A few caveats

- **First export of each format downloads its engine library** the first time only. This is one-time and modest in size.
- **M4B requires Studio renders.** No render, no audiobook.
- **The cover image** is set in Settings, not at export time. Same image flows into PDF and EPUB.
- **DOCX TOC** is a Word feature, not a static table — Word will prompt to refresh it the first time you open the file. That's normal.

---

## See also

- **[Audio Studio](audio-studio.md)** — the full audiobook pipeline that feeds M4B export
- **[Appearance](appearance.md)** — typography settings affect screen rendering only, not export formatting
- **[Backups and data](backups-and-data.md)** — exporting a JSON snapshot of the whole project (different from manuscript export)
