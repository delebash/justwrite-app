# Roadmap

This page lists items on the table for future versions. **None of these are promises.** Some may ship; some may not; some may change shape entirely. Treat the roadmap as direction, not commitment.

Items are loosely grouped by area and by how concrete they are.

---

## Story bible

- **Tag filter chips on Characters / Locations / Objects.** Worldbuilding already has filter chips for tags. The other entity grids don't yet. Adding them is mechanical work — the pattern's been established.
- ~~Curated project-wide tag vocabulary~~ — **shipped** (Settings → tag vocabularies; TagEditor canonicalises against it). Deliberately ships EMPTY: a starter default set was considered and rejected — your tags are your own.

---

## Editor and writing

- **Sidebar arrow-key navigation.** Items in the sidebar are reachable by Tab but arrow keys don't move within a list. A roving-tabindex pattern would fix this. Accessibility win for keyboard-first users.
- **Search snippet highlight offset fix.** Some snippets with multi-space runs show highlights off by a character or two. Small fidelity issue, fix planned.

---

## AI

- **Token budgets per feature.** A per-feature monthly cap that pauses AI calls when exceeded, to prevent surprise bills on cloud providers.
- **Embedding rebuild status.** The auto-rebuild RAG indicator could be more visible when it's actively running.
- **Finer per-feature engine tuning.** Every tunable (temperature, samplers, think) now lives on the **engine preset** a feature routes to (AI Settings → Routing by feature) — one source, editable today. The remaining roadmap idea is finer grain: distinct preset defaults per feature *class* (JSON-strict extraction vs prose critique) shipped out of the box, so new users get sensible splits without hand-tuning.

---

## Export

- **Direct Kindle KFX export.** Currently the path is EPUB → Kindle Previewer. A direct export would be a quality-of-life win for indie publishers.
- **Print-ready PDF layout knobs.** Trim size, margins, page numbering style — currently the PDF export uses sensible defaults. Customisation is on the table.
- **Story Bible export.** Some writers want to export their character and worldbuilding sheets alongside the manuscript. Format and inclusion logic TBD.

---

## Analysis

- **Configurable style-metric thresholds.** Currently the per-chapter style table flags outliers against a fixed baseline. Letting the user define their own "this is acceptable" range would make it more useful.
- **Trend lines on the pace chart.** A simple regression line showing whether you're accelerating, holding, or decelerating.

---

## App-wide

- **Multi-window support.** Open a Character page in one window and write in another. Currently the app is single-window.
- **Cross-machine sync.** Right now the path is "point cloud sync at the autosave folder". A first-class sync built into JustWrite (still local-first, just smarter about merging) is on the wishlist.
- **Native dark-mode for charts and graphs.** Some chart and graph surfaces use light-mode colours that don't quite work in dark mode.
- **Curated shadow tokens.** Several places use ad-hoc shadow rgbas; a `--shadow-soft` / `--shadow-medium` token pair would unlock proper dark-mode shadow behaviour.

---

## Things deliberately not on the roadmap

A few things JustWrite **isn't** planning to add. Worth saying so:

- **A cloud account.** The local-first model is the whole point. There may be cross-machine sync (see above) but there will not be a JustWrite account you log into.
- **A built-in publishing pipeline.** JustWrite produces files (EPUB, PDF, DOCX). What you do with them — Amazon, Apple Books, Kobo, IngramSpark — is your business.
- **Real-time collaboration.** Same reasons as the no-cloud-account decision. A snapshot you hand to a collaborator works; merging concurrent edits across the wire does not.
- **Lock-in to any single AI provider.** Every AI feature works with whichever provider you choose. That includes local engines that never call out to the internet.

---

## How to suggest something

Open an issue on the JustWrite GitHub repository (link from the [main README](README.md)). Concrete, narrowly-scoped requests get traction faster than broad ones. "Tag filter on Characters" is easier to act on than "make Characters better."
