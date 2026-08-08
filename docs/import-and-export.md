# Import and export

JustWrite reads and writes the formats writers actually use:

- **Reads**: Word (`.docx`), EPUB, LibreOffice (`.odt`), Markdown (`.md`), plain text (`.txt`)
- **Writes**: PDF, Word (DOCX), EPUB, and the whole book as a JustWrite `.zip`

---

## Import

> *"I have a half-finished novel in Word. I don't want to retype it — I just want to keep writing it here."*

The **Import** view (Project section in the sidebar) brings a manuscript file — or a stack of note files — into JustWrite.

### Three import modes

When you start an import, you choose what to do with the result:

| Mode | What it does |
|---|---|
| **Add existing** | Appends the imported chapters to the project you're currently in. You pick which **Part** they land in (any existing part, or a brand-new one). |
| **Start a new book** | Spins up a fresh project from the imported file. You pick a title and (optional) author. |
| **Add notes** | Brings sections of the file in as **notes** on your current project. Each heading becomes one note; a flat file becomes one. Supports dropping multiple files in one batch. |

### How to import

1. Open **Import** from the sidebar.
2. Choose your mode.
3. **Drop a file onto the page** (or several, for **Add notes**) or use the file picker. Supported formats: `.docx`, `.epub`, `.odt`, `.md`, `.txt`.
4. JustWrite parses the file(s) and shows a **preview** with every detected section.
5. **Review the preview**: each entry shows its detected title, word count, and a text snippet. You can:
   - Rename the title inline.
   - Drop entries you don't want imported.
6. If the parser had to work around odd formatting, a **warnings panel** explains what was adjusted — prefixed with the source filename when multiple files were imported.
7. **Confirm.** The chapters (or notes) land in your project.

### Part picker (Add existing)

> *"I'm importing one chapter from an old draft. I want it to land in Part 2, not tacked on at the end of everything."*

In **Add existing**, the **Add to part** dropdown lists every existing Part in the current project plus a **New part…** option. The default is whichever Part is last in your manuscript, so a quick import lands at the end of your draft. Pick a specific Part to insert chapters mid-manuscript, or choose **New part…** to create a Part on the fly (its title defaults to the file name).

### Notes options (Add notes)

> *"I have twenty `.txt` research files sitting in a folder. Copying each one in by hand is going to take all afternoon."*

The **Add notes** mode applies two settings to every note in the batch:

- **Tag** — a single keyword (e.g. `research`, `plot`, `structure`). Defaults to `note`. A datalist suggests tags already in use elsewhere in the project, so your note vocabulary doesn't splinter over time.
- **Pin to** — where the notes attach. Default is **Story-wide** (no anchor). Pick a specific chapter or scene to pin every imported note there in one shot — useful when the file is research for a particular scene. You can re-anchor any individual note later from the Notes view.

**Multi-file drop**: dropping several files at once batches them into a single import. Each file's detected sections become entries in the same preview list, and the whole batch ingests as one undoable action. Useful for bringing in a folder of `.txt` notes from another tool.

### Optional cleanups

- **Text normalization** (on by default) — converts curly quotes, em-dashes, ellipses, and whitespace to consistent Unicode. Turn it off if you want to preserve the original character encoding exactly.
- **Entity sweep** (offered after import) — an AI scan of the new chapters that proposes characters, locations, and objects to add to your Story Bible. You review every proposal individually; nothing is added without your click. Requires an AI provider.
- **Images** embedded in DOCX, EPUB, and ODT files are extracted and stored alongside the project.
- **Lists** — bulleted and numbered lists (including nested ones) are preserved on import, from DOCX, EPUB, and ODT alike.

### When to use which mode

- **Add existing** — you're moving an in-progress draft from Word or Scrivener into JustWrite and want to keep working on it. Useful for getting one Part of a long manuscript out of a `.docx` file you've outgrown.
- **Start a new book** — you have a finished or partial book in another tool and you want a clean JustWrite project for it.
- **Add notes** — you have research, outlines, character sketches, or scratch text in Word/Markdown/plain text that you want surfaced inside the project. Multi-file makes it practical to bring a folder of notes in at once.

### Tips

- **Chapter detection** relies on heading structure (`Heading 1`, `Heading 2`, etc., or `#` and `##` in Markdown). A document with no headings will come in as a single chapter; you can split it later using the editor's **Split chapter** action.
- The preview lets you catch parser mistakes **before** anything changes in your project. If the chapter split looks wrong, drop chapters from the list or rerun the import after fixing the source file.
- Scrivener exports `.epub` cleanly. Word exports `.docx`. Google Docs can save as `.docx` or `.epub`.

---

## Export

> *"I'm finally done with this draft. I need a file I can actually send — to an agent, an editor, or just my e-reader."*

The **Export** view (Project section in the sidebar) produces a finished file in one of four formats.

### The format picker

Four cards: **PDF**, **DOCX**, **EPUB**, and **JustWrite book**. Pick one to see its options.

The first three are **finished reading files** — one manuscript, typeset for a reader. The fourth is **your whole book**, everything JustWrite holds, in a file you can put back.

### PDF

> *"My agent wants a clean read. I need something that looks like a real manuscript, not a Google Doc export."*

A print-ready A4 document with:

- Serif typesetting
- A generated **Table of Contents**
- Each chapter starting on a new page
- Optional **cover image** (set in Settings → Project → Cover image)
- Optional **Part covers** between sections

**Engine:** pdfmake, loaded the first time you export a PDF. It ships inside JustWrite, so there is nothing to fetch — the progress bar shows "Loading PDF engine…" while it warms up.

**When to pick PDF:**

- Sending a draft to an agent or editor who wants a clean read.
- Sharing with beta readers who don't have specific format preferences.
- Printing a physical reading copy.
- Any time you want a single self-contained file that opens the same on every device.

### DOCX

> *"My editor wants to leave tracked changes. She only works in Word."*

A Word document that preserves:

- Chapter headings (so Word's "Navigation Pane" works)
- Scene breaks
- Block quotes
- A live **table of contents** that Word will offer to refresh on first open

**Engine:** the `docx` packager, loaded on first use.

**When to pick DOCX:**

- Sending to an editor or collaborator who wants to track changes or leave comments.
- Submitting to an agent or publisher who specifies DOCX.
- Importing into another writing tool.

### EPUB

> *"I'm self-publishing on Apple Books and Kobo. I need an actual e-book file, not a PDF someone has to squint at on their phone."*

A reflowable EPUB 3 e-book with:

- One HTML file per part and chapter
- A navigation document
- Full compatibility with Apple Books, Kobo, and Calibre
- Optional cover image and metadata (title, author, language)

**Engine:** JSZip, loaded on first use (shared with import, so it is usually already in memory).

**When to pick EPUB:**

- Publishing to **Apple Books** or **Kobo** (both accept EPUB 3 directly).
- Publishing to **Amazon Kindle** — start with EPUB and run it through Amazon's Kindle Previewer to produce the final format Amazon wants.
- Loading onto an e-reader for your own reading.
- Sharing with beta readers who use e-readers.

### JustWrite book (`.zip`)

> *"I've got a new laptop. I don't want to export a PDF — I want the actual book, with my story bible and my images, open on the other machine."*

Not a reading file: **everything in the book, in one `.zip`.** Every part, chapter and scene, the whole Story Bible, and your images — the same file JustWrite itself uses to move a book.

**When to pick it:**

- **Moving to another computer.** Export here, copy the `.zip` across, import it there.
- **Keeping your own copy** of a finished draft, outside the app.
- **Sending the book to someone who also uses JustWrite** — they import it as a new book.
- **Making an audiobook** — this is the file **JustVoice** reads (see below).

**No engine at all** — the server builds this one, so it starts immediately.

**Where it lands:** in the desktop app you choose the folder and JustWrite remembers it for next time. In a browser it goes to your Downloads folder, the same as a PDF.

**Filename:** your book's title, kept as you typed it (minus any characters a filename can't contain) — so *The Ninth Facet* exports as `The Ninth Facet.zip`.

**Going back in:** import a `.zip` from **Settings → Backups → This book → Import a book…**, which brings it in as a **new** book rather than overwriting the one you have open. Importing needs the desktop app.

> This is the same export as **Settings → Backups → Export this book…** — two doors to one thing, so use whichever you're already standing next to.

### Continuous prose toggle (PDF / DOCX / EPUB)

> *"The `* * *` scene breaks look fine on screen but they feel amateur in the actual printed book."*

A checkbox that strips scene titles and `* * *` scene-break ornaments before export, so each chapter reads as **uninterrupted prose** — the way most print novels are formatted.

Leave it off if you want scenes to remain visibly separated (some writers and indie publishers prefer this).

### Audiobook (JustVoice)

JustWrite is writing-only — it doesn't render audio itself. To produce an audiobook, export the book as a **JustWrite book** `.zip` (the fourth format card, above) and open it in **JustVoice**, the companion voice-production app, which handles casting, narration, and audiobook export.

The `.zip` isn't a JustVoice format — it's just JustWrite's own book file, and JustVoice happens to read it. (There's no longer a live "Send to JustVoice" button; the file is the handoff.)

### Manuscript stats panel

Before exporting any document format (PDF / DOCX / EPUB), a stats panel shows:

- Parts count
- Chapters count
- Total word count

This is a sanity check — confirm the right scope before clicking Export.

### Progress and filename

- **Progress display** — an animated indicator with stage labels: "Loading PDF engine…", "Composing document…", "Packaging archive…".
- **Automatic filename** — the exported file is named after your project title. You don't need to name it manually. PDF/DOCX/EPUB slugify it (`the-ninth-facet.pdf`); the JustWrite `.zip` keeps the title as you wrote it (`The Ninth Facet.zip`).
- **Where it goes** — in the desktop app every format opens a Save dialog so you choose the folder, and JustWrite remembers it for next time. Manuscripts (PDF/DOCX/EPUB) and the `.zip` remember *separate* folders, so a submissions folder and a backups folder don't overwrite each other. In a browser there is no folder chooser, so everything lands in Downloads.

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
4. **Optional**: export the **JustWrite book** `.zip` and open it in **JustVoice** to produce an audiobook.

---

## A few caveats

- **The first export of each format loads its engine**, once per session. The engines ship with JustWrite; on the desktop app nothing is fetched over the network at all.
- **The cover image** is set in Settings, not at export time. Same image flows into PDF and EPUB.
- **DOCX TOC** is a Word feature, not a static table — Word will prompt to refresh it the first time you open the file. That's normal.

---

## See also

- **[Appearance](appearance.md)** — typography settings affect screen rendering only, not export formatting
- **[Backups and data](backups-and-data.md)** — exporting a JSON snapshot of the whole project (different from manuscript export)
