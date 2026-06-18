# Backups and data

JustWrite keeps your work in three places so you don't lose it:

1. **In the app's local storage** (instant, on every change)
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
- **Click Restore from autosave…** to roll back to any of the three generations.

**Why three generations.** If autosave runs while you're in the middle of a regrettable edit, the current and the .prev may both be the bad state — but .prev2 is from before. Three generations is usually enough for "I made a mess, give me what it looked like a minute ago."

---

## Manual snapshot export and import

> *"I'm about to tear this chapter apart and reorganize the whole middle act. I want a copy I can go back to if I hate where it ends up."*

For more permanent archiving:

### Export snapshot

Click **Export snapshot** in the Backups section. JustWrite produces a single JSON file containing **everything** — every chapter body, every character and Story Bible item, the trash bin, your AI provider list, your voice cast, your writing session log, the lot. It's a complete portable copy of the project.

In the desktop app, a native Save dialog opens so you can pick where to put it. In the browser-only version, the file downloads to your Downloads folder.

The timestamp of the last manual snapshot is shown so you can see when you last archived.

### Import snapshot

Click **Import backup**. Pick a previously exported `.json` file. JustWrite shows you the project title and chapter count from the file before doing anything. If you confirm, **the current workspace is replaced** with the snapshot's contents.

### When to use snapshots

- **Before any major restructuring** — a heavy rewrite, a chapter split, an aggressive edit.
- **Before switching machines** — export, copy the file to the new machine, import.
- **As a routine archive** — once a week, once a milestone, however suits your paranoia.
- **As a shareable artifact** — give a snapshot to a collaborator so they can open your exact project (Story Bible and all).

The autosave on disk and the manual snapshots are complementary. Autosave is your moment-to-moment safety net; snapshots are your archives.

---

## Restoring from autosave

> *"I just deleted three scenes trying to restructure a chapter and now I need them back. I saved after, so Ctrl-Z won't reach it."*

If something goes wrong:

1. Open **Settings → Backups → Restore from autosave…**
2. JustWrite lists the available autosave generations with their timestamps.
3. Pick one. JustWrite shows you what's in it (project title, chapter count) before committing.
4. Confirm.

Your current state is replaced. The autosave you chose becomes the new current.

If you'd rather not lose the current state in case the autosave is wrong, **export a snapshot first** — then restoring autosave is reversible by importing your fresh snapshot.

---

## The Danger zone — Reset workspace

At the bottom of the Backups section, in red, is **Reset workspace**.

This wipes **all** JustWrite data from your computer's local storage — every project, every chapter, every character, every AI provider configuration, every voice assignment, every session log. The seed project (*The Cartographer's Daughter*) is reloaded so you start clean.

It does not delete autosave files on disk; those remain unless you delete them manually.

To trigger it, you have to **type `RESET`** in the confirmation dialog. JustWrite does not make this easy by design.

### When you'd actually use this

- You're handing the app to a developer for debugging and want a clean state.
- You're starting completely over and the autosaves don't matter.
- Something has gone deeply wrong (very rare) and a fresh slate is the simplest fix.

Almost no normal use case needs this button. If you're considering it for any reason that isn't one of the above, **export a snapshot first** so you can come back.

---

## What is actually stored where

For the technically curious:

- **Local storage** lives in your browser engine's IndexedDB, scoped to JustWrite. It's instant, always-on, and survives app restarts.
- **Autosave on disk** lives in your operating system's app data folder under a JustWrite directory. The Backups section shows the exact path.
- **Snapshots** are wherever you saved them.
- **Images** for character avatars, location photos, the cover image, etc., live under the same app data folder as autosave (when you run the desktop app) or as data URLs in the project snapshot (when you run in a browser).

You can move a JustWrite project from one computer to another by copying the autosave folder, by exporting/importing a snapshot, or both. There is no cloud account to sync.

---

## A reasonable backup discipline

> *"How worried should I actually be about losing my book? What's the minimum I need to do to sleep at night?"*

You don't need to do much; the defaults are safe. A practical approach:

1. **Let autosave do its job.** It's automatic and reliable.
2. **Once a week, export a snapshot** to a known location.
3. **Point your cloud sync at the autosave folder** if you want off-machine redundancy.
4. **Before any aggressive edit, export a fresh snapshot** so you have a known-good return point.

This costs you about thirty seconds of effort per week and provides three independent layers of safety.

---

## See also

- **[Getting started](getting-started.md)** — first launch and the seed project
- **[Import and export](import-and-export.md)** — manuscript exports (PDF, DOCX, EPUB) are a different feature from data snapshots
- **[Core concepts](core-concepts.md)** — soft delete and undo
