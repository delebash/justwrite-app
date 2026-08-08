# Backups and data

JustWrite keeps your work in three places so you don't lose it:

1. **In the app's database** (instant, on every change — a local SQLite database in your data folder)
2. **In a JSON file on disk** (within about 10 seconds, with three generations kept)
3. **In manually-exported snapshots** (whenever you ask)

This page covers all three, plus how to restore from any of them, and the reset-workspace nuclear option.

All this lives in **Settings → Backups**.

---

## Autosave to disk

> *"I don't want to lose an hour of work because my laptop died. I want to know my writing is safe without having to remember to save it."*

Every edit you make is mirrored to a JSON file on your computer within about ten seconds. Three generations are kept:

- **Current** — the latest state
- **`.prev.json`** — the state before the most recent autosave
- **`.prev2.json`** — the state before that

The Backups section shows you the **path** where this is stored on your machine. You can:

- **Point a cloud sync tool at this folder** — OneDrive, Dropbox, iCloud, Google Drive, Time Machine. Now your manuscript is also in the cloud as a side effect of normal use, without JustWrite itself needing any cloud account.
- **Open the folder in Finder / Explorer** to confirm files are appearing.
- **Click Show autosaves** to reveal the list — each of the three generations has its own **Restore** button (plus Delete selected / Delete all).

**Why three generations.** If autosave runs while you're in the middle of a regrettable edit, the current and the .prev may both be the bad state — but .prev2 is from before. Three generations is usually enough for "I made a mess, give me what it looked like a minute ago."

---

## Exporting and importing a book

> *"I want to move this book to my other computer, hand it to someone, or keep a copy I can come back to."*

A single book travels as a **`.zip` named after it** — e.g. `The Ninth Facet.zip` — which unzips to a `The Ninth Facet/` folder holding `book.json` (all the text, structure, and Story Bible, plus the trash bin) and an `images/` folder (character avatars, location photos, the cover).

### Export this book

In **Settings → Backups → This book**, click **Export this book…**. On the desktop app a native Save dialog opens — defaulting to your data folder, and remembering wherever you last saved — so you choose where the `.zip` goes. In a browser it downloads to your Downloads folder, the same as a PDF.

The **Export** view's **JustWrite book** format card does exactly this, and is the same button in the place you'd look for it while finishing a draft. Either door, one file.

### Import a book

Click **Import a book…** and pick a `.zip`. It comes in as a **new** book — your current books are untouched — so you can import the same file many times, and each becomes its own project. (This is exactly how the bundled sample works: it's shipped as one of these folders.)

**Import** is a **desktop** feature — it needs a native file picker to hand JustWrite the bytes — so the browser-only build shows a note in place of that one button. Export works everywhere.

### When to use it

- **Before switching machines** — export, copy the `.zip`, import on the other computer.
- **As a shareable artifact** — hand the `.zip` to a collaborator; they import it and see your exact book, Story Bible and all.
- **As a routine archive** — keep dated `.zip`s wherever suits your paranoia.

---

## Whole-workspace backup & restore

> *"I want ONE file with everything — all my books, providers, and settings — to move between machines or keep off-device."*

**Settings → Backups → Backup & restore** is a bigger hammer than a single book: **Export backup** produces a ZIP of the entire database (every book + AI providers + settings), and **Import backup** restores one, **replacing all current data**. On the desktop app the export opens a Save dialog (default: your data folder, last location remembered); in the browser it downloads to Downloads.

Use the whole-workspace backup to move your entire setup; use the per-book `.zip` above to move or share a single book. Autosave (above) is your moment-to-moment net; these are your archives.

---

## The data folder

All of JustWrite's data — your books, images, the AI engine and its models, and logs — lives in **one data folder**. It defaults to a folder beside the app itself (portable), and you can move it to any drive from **Settings → Storage → Data location → Change folder…**. Moving it relocates everything and restarts the app. (The Backups section shows the same path read-only, with a link over to Storage, so the autosave folder — which sits inside the data folder by default — has context.)

---

## Restoring from autosave

> *"I just deleted three scenes trying to restructure a chapter and now I need them back. I saved after, so Ctrl-Z won't reach it."*

If something goes wrong:

1. Open **Settings → Backups** and click **Show autosaves**, then **Restore** on the generation you want
2. JustWrite lists the available autosave generations with their timestamps.
3. Pick one. JustWrite shows you what's in it (project title, chapter count) before committing.
4. Confirm.

Your current state is replaced. The autosave you chose becomes the new current.

If you'd rather not lose the current state in case the autosave is wrong, **export a backup first** — then restoring autosave is reversible by importing your fresh snapshot.

---

## The Danger zone — Reset workspace

At the bottom of the Backups section, in red, is **Reset workspace**.

This wipes **all** JustWrite data from JustWrite's local database — every project, every chapter, every character, every AI provider configuration, every voice assignment, every session log. You start clean on the welcome screen — no demo is reloaded; use **Try tutorial project** if you want the sample book (*The Ninth Facet*) back.

It does not delete autosave files on disk; those remain unless you delete them manually.

To trigger it, you have to **type `RESET`** in the confirmation dialog. JustWrite does not make this easy by design.

### When you'd actually use this

- You're handing the app to a developer for debugging and want a clean state.
- You're starting completely over and the autosaves don't matter.
- Something has gone deeply wrong (very rare) and a fresh slate is the simplest fix.

Almost no normal use case needs this button. If you're considering it for any reason that isn't one of the above, **export a backup first** so you can come back.

---

## What is actually stored where

For the technically curious:

- **The app database** is a local SQLite file inside your data folder, written by JustWrite's built-in server. It's instant, always-on, and survives app restarts. (There is no browser IndexedDB store — the app keeps no durable data in the browser engine.)
- **Autosave on disk** lives in your operating system's app data folder under a JustWrite directory. The Backups section shows the exact path.
- **Snapshots** are wherever you saved them.
- **Images** for character avatars, location photos, the cover image, etc., are stored by the built-in server under your data folder and referenced by id — with an inline data-URL fallback saved in the project snapshot when the server is briefly unreachable.

You can move a JustWrite project from one computer to another by exporting it — the per-book `.zip` or the whole-workspace backup above — or by pointing a cloud-sync tool at your data folder. There is no cloud account to sync.

---

## A reasonable backup discipline

> *"How worried should I actually be about losing my book? What's the minimum I need to do to sleep at night?"*

You don't need to do much; the defaults are safe. A practical approach:

1. **Let autosave do its job.** It's automatic and reliable.
2. **Once a week, export a backup** to a known location.
3. **Point your cloud sync at the autosave folder** if you want off-machine redundancy.
4. **Before any aggressive edit, export a fresh snapshot** so you have a known-good return point.

This costs you about thirty seconds of effort per week and provides three independent layers of safety.

---

## See also

- **[Getting started](getting-started.md)** — first launch and the seed project
- **[Import and export](import-and-export.md)** — manuscript exports (PDF, DOCX, EPUB) are a different feature from data snapshots
- **[Core concepts](core-concepts.md)** — soft delete and undo
