# AI drafting — the story-world sheets, slice 3 and slice 4: implementation plan (2026-10-15)

The spec is `2026-10-11-ai-drafting-spec.md`; every decision it records stands (§1, §9). This plan
turns its remaining parts into tasks, the way `2026-10-11-ai-drafting-plan.md` did for slices 1–2.
Nothing here is built yet. It waits for the user's go, and §5 lists what needs the user's words
first. Order (spec §1.5, §9.2): the sheets → slice 3 → slice 4.

Asked for by the user 2026-10-15: "lets do all the stuff that does not need gpu". Building and
unit-testing these needs no GPU; the Lab runs of the new prompts and slice 4's bench leg do, and
wait until the GPU is free.

## 1. Global constraints (from the spec and the house rules)

- Real columns, no JSON blobs; additive columns through `createTables(TABLES, ADDED_COLUMNS)`;
  drop-and-reseed policy otherwise. Every new store action in `ACTION_DOMAINS`; keystroke-grain
  ones in `COALESCED_ACTIONS`.
- Every label, hint and message in `en.json` only; other languages through docgen.
- Reuse, never copy: the character sheet's pieces (`src/services/characterSheet.js`,
  `CharacterSheetSection.vue`, the describe box, the review window, `characterDraft.js`) are
  generalised where the new sheets need them, not copied.
- Nothing saves without review; one undo step per applied draft (plan Task 5's rule).
- Exclude from AI honoured by every new reader (plan Task 0's rule).
- User docs in the same change: `story-bible.md`, `writing.md`, `plot-and-time.md`,
  `ai-features.md`, `brainstorm.md`, `whats-new.md`.

## 2. The sheets (spec §9.1)

### Task S1 — The columns, in one schema step (with slice 3's and 4's)
- `locations.atmosphere`, `locations.history`; `objects.properties`, `objects.history`,
  `objects.where_now`; `groups.goals`, `groups.leadership`, `groups.history` — TEXT NOT NULL
  DEFAULT ''. With them, slice 3's `scenes.summary` (TEXT) and slice 4's
  `projects.ai_scene_drafting` (BOOLEAN DEFAULT 0), so older devices are asked to update once
  (§5 question 2).
- Files, as `d55f8f5` (POV and "when") took the path: `server/src/database/models_schema.js` (DDL),
  `models.js` `ADDED_COLUMNS`, `book_io.js` save (locations :311, objects :324, groups :338,
  scenes, projects) and load (:660 on), `sync.js` `SYNC_SCHEMA_VERSION` 3 → 4 with its reason,
  `server/tests/book_io.test.js` round-trip. `session.js` and `phone.js` already create with
  `ADDED_COLUMNS`.
- Tests: the round trip carries every new field; an old database gains the columns at boot; the
  sync version.

### Task S2 — The field definitions, one source
- Beside `characterSheet.js`'s `SHEET_SECTIONS`: the location, object and group sheets as data
  (key, label key, hint key, textarea), read by the pages, the card builder, the drafting prompts
  and the docs' field list. Labels as approved; hints per §5 question 1.

### Task S3 — The sheets on their pages
- `LocationsPage.vue` (:215, the note), `ObjectsPage.vue` (:215), `GroupsPage.vue` (:193, the
  blurb): the description stays first; the new fields below it, folded while empty, as the
  character sheet's sections fold. `CharacterSheetSection.vue` is already generic (title, hint,
  count, a Draft button) and is reused as it is — renamed `SheetSection.vue` in the same commit,
  since it no longer belongs to characters only.
- Store: `updateLocation` / `updateObject` / `updateGroup` (`src/stores/project.js:1652, 1664,
  1921`) already take a patch; field edits coalesce like the character sheet's.
- Measured at 1280 and 390 px.

### Task S4 — The cards carry the new fields
- `buildEntityCards` (`src/services/rag/cards.js:443`; locations and objects :210, groups :108):
  each new field, labelled, when filled — so the composer, both chats and Ask the book's index get
  atmosphere, properties, where an object is now. Tests: the card text; Exclude from AI still drops
  the whole card.

### Task S5 — Drafting on the three pages
- **Draft with AI ▾ → From a description**, and the describe box while the page is thin (§9.3:
  every sheet field empty), on the character page's components (`CharactersPage.vue:453`).
- One drafting service for every sheet: `characterDraft.js` generalised (its section filter, the
  sanitiser, `draftRows`, apply as one undo step); the review window takes the sheet's fields.
- Seeded prompts, one per kind (location / object / group), reply shape = the sheet's keys;
  revised through the prompt stale-heal; Lab samples for each. Their feature row: §5 question 3.
- **Name ideas** at the name box on the three pages (§3.3), Brainstorm's categories by page kind.
- **Suggest locations…** on the Locations list, in Suggest characters' shape (§3.4 names
  locations only).
- **Worldbuilding:** Draft with AI writes the article's body from its title and summary (§9.1).

## 3. Slice 3 — scene summaries + planning from the premise (spec §5)

### Task P1 — Summary
- The scene's Links panel shows **Summary** (an editable field); the chapter's card view shows it
  instead of the first 180 characters (`src/pages/ChaptersPage.vue:330`), falling back to the prose
  when empty. The composer's scene scope gains it (`src/services/storyContext.js`; the spec lists
  it in §2).
- **Summarize this scene** — drafts it from the prose; reviewed; one undo step.

### Task P2 — The plot board
- **Fill this template for my story** — on a template applied from `PLOT_TEMPLATES`
  (`src/services/plotTemplates.js`, `PlotBoardPage.vue:64`): composer(book) → a note for each beat;
  reviewed per beat.
- **Suggest next beats** per strand — the existing `brainstormPlot` action → beat cards; reviewed.
- Brainstorm's Next plot beats / Plot twists also in the plot board and the editor's AI menu.

### Task P3 — Architecture
- **Draft from the premise** on the Fabula and Setting documents
  (`src/pages/ArchitecturePage.vue:29-30`): composer(book) → lands as a diff in the document.

## 4. Slice 4 — scene drafting (spec §6), after §5 question 5

### Task D1 — The switch
- **AI scene drafting** in Settings → Project beside Premise (`SettingsPage.vue:757`), per book,
  off by default (`projects.ai_scene_drafting`, Task S1).

### Task D2 — Draft from plan
- In an empty scene and in the editor's AI menu, only while the switch is on: composer(scene) with
  the Summary → the existing accept/reject diff, or 3 variations (`VariationsModal`).
- Its own feature row (routable to a cloud model); every draft recorded in AI usage.

### Task D3 — The AI-text mark
- A TipTap mark like the markers (`server/src/editor/markers.js`); the editor schema is shared with
  sync's scene adapter, so a sync schema step. Its look and whether it survives edits are a design
  pass of their own (spec §6) — §5 question 5.

### Task D4 — The bench leg (needs the GPU, later)
- Whether the local presets are recommended for it, and what the feature says when they aren't.

## 5. Needs the user's words before building

1. **The new fields' hints** (labels are approved). Proposed:
   - Location — Atmosphere & senses: "What it's like to be there: light, sound, smell, mood."
     History: "What happened here before the story, and what people say about it."
   - Object — Properties: "What it does, what it's made of, what makes it unusual." History:
     "Where it came from and who has held it." Where it is now: "Who has it, or where it is, at
     this point in the story."
   - Group — Goals & beliefs: "What the group wants and what it holds true." Leadership: "Who
     leads it and how it decides." History: "How it began and what shaped it."
2. **One schema step** for all the new columns (the sheets, Summary, the switch), so other devices
   are asked to update once — my rec — or one step per slice.
3. **The new feature rows** (Settings → AI → Routing by feature), proposed: **Story-world sheets**
   (drafting locations, objects, groups and worldbuilding), **Scene summary**, **Plot planning**
   (template notes, next beats), **Draft from the premise**, **Scene drafting** (decided: its own
   row).
4. **Fill from book** for locations, objects and groups isn't in the spec. My rec: not now — From a
   description only, as the spec says.
5. **The AI-text mark's design** (its look; whether it survives your edits) — my rec: I bring the
   design before slice 4 is built; the sheets and slice 3 don't wait for it.

## 6. Standards each piece follows

| Piece | Follows |
|---|---|
| New columns | the kit: `createTables` additive columns (`just-llm-runner/server/src/platform/sql.js`); the sync engine's schema rule (`just-sqlite-sync/README.md` "Schema changes") |
| Sheet sections, describe box, review window, drafting service | ours: the character sheet's, reused (`CharacterSheetSection.vue` → `SheetSection.vue`) or generalised (`characterDraft.js`, `CharacterProfileFillModal.vue`) on the kit's `AppModal` → Quasar QDialog (https://quasar.dev/vue-components/dialog) |
| Name ideas | Quasar QPopupProxy (https://quasar.dev/vue-components/popup-proxy), as slice 1 |
| Suggest locations | ours: Suggest characters' (`EntitySweepModal.vue`'s shape) |
| AI calls, progress, chip | the kit: `runAiFeature`, `AiTaskStrip`, `AiFeatureChip`; ours: `FEATURE_CATALOG` + seeded prompts |
| Prose and document landing | ours: `RichEditor`'s accept/reject diff + `VariationsModal` |
| AI-text mark | ours: the markers' TipTap `Mark` |

Nothing is NOT STANDARD.

## 7. Blast radius (greps, 2026-10-15)

```
# the tables and their save/load
server/src/database/models_schema.js:331 scenes · :563 locations · :615 objects · :667 groups · :25 projects
server/src/database/models.js:55          ADDED_COLUMNS
server/src/book_io.js:311 locations · :324 objects · :338 groups (save) · :660 on (load)
server/src/sync.js:40                     SYNC_SCHEMA_VERSION = 3
# the pages' description fields
src/pages/LocationsPage.vue:215  loc.note · src/pages/ObjectsPage.vue:215  obj.note · src/pages/GroupsPage.vue:193  g.blurb
# the store mutators (already in ACTION_DOMAINS :411-414 and COALESCED_ACTIONS :488)
src/stores/project.js:1652 updateLocation · :1664 updateObject · :1921 updateGroup
# the character sheet's one source and its readers — generalised, not copied
src/services/characterSheet.js:12-35  SHEET_SECTIONS' parts
src/services/analysis/characterDraft.js:17,55 · src/services/analysis/characterProfile.js:13,224
src/pages/CharactersPage.vue:453      the Draft with AI ▾ menu
src/pages/CharactersPage.vue          the one user of CharacterSheetSection (renamed SheetSection)
src/services/storyContext.js          the composer — no Summary yet (slice 3 adds it)
# the cards
src/services/rag/cards.js:108 groupMemberships · :210 locations/objects · :443 buildEntityCards
# slice 3
src/pages/ChaptersPage.vue:330        the 180-character card preview
src/pages/PlotBoardPage.vue:5,64      PLOT_TEMPLATES / applyTemplate
src/pages/ArchitecturePage.vue:29-30  the Fabula and Setting documents
server/src/feature_catalog.js:28      the brainstorm feature (brainstormPlot's row)
# slice 4
src/pages/SettingsPage.vue:757        Premise — the switch goes beside it
server/src/editor/markers.js          the mark precedent
```

## 8. Testing, per task

- Unit: the field definitions; the cards; the generalised drafting service on each sheet; every new
  store action in `ACTION_DOMAINS`.
- Server: the round trip; the columns at boot; the sync version; the seeded prompts exist and heal.
- Renderer: `npm run smoke`; each changed surface measured at 1280 and 390 px.
- Local model (needs the GPU, later): the new prompts in the Lab; slice 4's bench leg.
