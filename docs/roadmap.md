# Roadmap

This page lists items on the table for future versions. **None of these are promises.** Some may ship; some may not; some may change shape entirely. Treat the roadmap as direction, not commitment.

Items are loosely grouped by area and by how concrete they are.

---

## AI

- **Token budgets per feature.** A per-feature monthly cap that pauses AI calls when exceeded, to prevent surprise bills on cloud providers.
- **Embedding rebuild status.** The auto-rebuild RAG indicator could be more visible when it's actively running.

---

## Export

- **Print layout in the PDF.** The page size and margins are yours to set now; still missing for a print-ready interior are mirrored inside/outside margins, chapters starting on a right-hand page, and the page-number style.

---

## Analysis

- **Trend lines on the pace chart.** A simple regression line showing whether you're accelerating, holding, or decelerating.

---

## App-wide

- **Multi-window support.** Open a Character page in one window and write in another. Currently the app is single-window.

---

## Things deliberately not on the roadmap

A few things JustWrite **isn't** planning to add. Worth saying so:

- **A cloud account.** The local-first model is the whole point. Your books sync between your own devices (see [Sync](sync.md)), but there will not be a JustWrite account you log into.
- **A built-in publishing pipeline.** JustWrite produces files (EPUB, PDF, DOCX). What you do with them — Amazon, Apple Books, Kobo, IngramSpark — is your business.
- **Real-time collaboration.** Same reasons as the no-cloud-account decision. A snapshot you hand to a collaborator works; merging concurrent edits across the wire does not.
- **Lock-in to any single AI provider.** Every AI feature works with whichever provider you choose. That includes local engines that never call out to the internet.

---

## How to suggest something

Open an issue on the JustWrite GitHub repository (link from the [main README](README.md)). Concrete, narrowly-scoped requests get traction faster than broad ones. "Tag filter on Characters" is easier to act on than "make Characters better."
