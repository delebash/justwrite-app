# Roadmap

This page lists items on the table for future versions. **None of these are promises.** Some may ship; some may not; some may change shape entirely. Treat the roadmap as direction, not commitment.

Items are loosely grouped by area and by how concrete they are.

---

## Story bible

- **Tag filter chips on Characters / Locations / Objects.** Worldbuilding already has filter chips for tags. The other entity grids don't yet. Adding them is mechanical work — the pattern's been established.
- **Curated project-wide tag vocabulary.** A small editable default set in Settings (alongside the existing per-entity-type categories) would prevent typo splintering ("antagonist" / "Antagonist" / "antag"). The current freeform + typeahead system catches most of this, but a curated baseline would catch the rest.

---

## Editor and writing

- **Sidebar arrow-key navigation.** Items in the sidebar are reachable by Tab but arrow keys don't move within a list. A roving-tabindex pattern would fix this. Accessibility win for keyboard-first users.
- **Search snippet highlight offset fix.** Some snippets with multi-space runs show highlights off by a character or two. Small fidelity issue, fix planned.

---

## AI and audio

- **Token budgets per feature.** A per-feature monthly cap that pauses AI calls when exceeded, to prevent surprise bills on cloud providers.
- **Embedding rebuild status.** The auto-rebuild RAG indicator could be more visible when it's actively running.
- **Per-model temperature, resolved via tier.** AI services currently hard-code their temperature (0.3 for JSON-output features like speaker analysis and smart-cast, 0.4–0.55 for prose critique, etc.). One value applies regardless of which model runs the call. A more nuanced approach would extend the tier system (`Guided` / `Direct` / `Reasoned`) with a per-tier temperature so that, say, Claude or GPT-4o on Direct could run at 0.4 for a touch more nuance while Qwen3:8B on Guided stays at 0.3 for JSON safety. Services would read `tier.temperature` the same way they currently read `tier.think`.
- **Smart-Assign Lab.** Speaker Lab already proves the workflow: tune a prompt + temperature, save as a named production config, switch between configs from Settings or the lab. Smart-Assign (`smartCast`) needs the same surface — currently the only override is "Default (built-in)" because there's no UI to populate `savedConfigs.smartCast`. Probably a third tab in Speaker Lab so the two casting-related labs share a sidebar entry, or a popover off the Studio Cast tab. The store, services, and Settings card already accept the data shape; only the lab UI is missing.

---

## Audiobook

- **Better mid-render error recovery.** If a single line fails to render mid-chapter, the chapter currently has to restart. A line-level retry is on the wishlist.
- **Per-chapter pacing controls.** Speed and pause-between-paragraph settings per chapter would help match narration to the chapter's rhythm.
- **Render settings surface.** A lot of audio knobs are currently hardcoded in `services/render.js`: `pauseBetween: 0.35` seconds between lines, `sampleRate: 44100` on the AudioContext, WAV-only output (no bitrate / compression knob), and no per-line speed or pitch adjustment. A Render settings card on Studio's Render tab (or in Settings → AI & Audio engines) would expose these — at minimum the pause control, with speed / pitch and an output-format picker as follow-ups.
- **Per-line persistent render cache.** `services/tts.js` already has an in-memory cache keyed on `providerId :: model :: voice :: speed :: paramsHash :: input`, so re-rendering an unchanged chapter is near-instant *in-session*. Persisting that map to disk (alongside the chapter audio under `$APPDATA/JustWrite/audio/<projectId>/cache/`) would carry it across app restarts. The win compounds on long books: changing one preset value re-synths only the lines that actually moved, instead of the whole chapter. Care needed around invalidation (the cache key already captures everything that matters but the on-disk store needs eviction policy + size cap) and around blob lifetime (current blobs are object URLs that die with the session; need to write WAV bytes to disk).

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
- **A built-in publishing pipeline.** JustWrite produces files (EPUB, PDF, DOCX, M4B). What you do with them — Amazon, Apple Books, Kobo, IngramSpark, Findaway Voices — is your business.
- **Real-time collaboration.** Same reasons as the no-cloud-account decision. A snapshot you hand to a collaborator works; merging concurrent edits across the wire does not.
- **Lock-in to any single AI provider.** Every AI feature works with whichever provider you choose. That includes local engines that never call out to the internet.

---

## How to suggest something

Open an issue on the JustWrite GitHub repository (link from the [main README](README.md)). Concrete, narrowly-scoped requests get traction faster than broad ones. "Tag filter on Characters" is easier to act on than "make Characters better."
