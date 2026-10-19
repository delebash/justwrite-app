<!-- SPDX-License-Identifier: MIT -->
# Research register — what we already know, and where the proof is (JustWrite)

**Read the section for your subject before researching anything** — before reading code to
answer a question, before measuring, before briefing an agent. Then grep `docs/plans` for
anything newer. The shared AI stack's facts (the kit, llama.cpp, the memory arbiter) are in
[the kit's register](../../../just-core/docs/dev/RESEARCH.md).

## The rule (family-wide, decided 2026-10-04)

The user: *"why do we keep re researching stuff, we need a primary research doc that we point to
so we dont keep duplicating or forgeting what we have done in the past"* — approved "your rec on
all go". The kit's register carries the rule in full; in short:

- **Before research:** read the subject's section here and grep `docs/plans`. An agent's brief
  carries that section and the line *"don't re-derive these; re-check one only if the code it
  cites changed after its date"*.
- **After research:** its facts land here in the same change. A research doc with no entry here
  is not done. The family guard (`../just-core/scripts/check-family.js`, check 15) fails
  any `docs/plans/YYYY-MM-DD-*.md` dated 2026-10-04 or later that this page does not link, and
  any link here that points nowhere.
- **Filled as each subject comes up.** Until then a subject's records are indexed below, so
  they can at least be found.
- One fact per bullet, then *how it was checked and when* (measured · code · web · git · record
  · agent), then where the proof is. A fact that turns out wrong is rewritten, ending "(was: …
  until <date>)".

Subjects: [JustWrite on Electron and Node](#justwrite-on-electron-and-node) ·
[The phone app: UI library and the server](#the-phone-app-ui-library-and-the-server) ·
[What other writing apps ship](#what-other-writing-apps-ship) ·
[Records not yet distilled](#records-not-yet-distilled)

---

## JustWrite on Electron and Node

The family's move, step 4 (2026-10-08). The plan is JustVoice's
`docs/plans/2026-10-07-electron-node-plan.md` §6; the decisions are in JustVoice's TASKS.

- **The dev data root is `<repo>/data`.** It moved from `src-tauri/target/debug/data` on
  2026-10-08; saved absolute paths into it were rewritten by a one-off script with the apps
  closed: 9 database cells (JustWrite's chooser folders — `settings` row `chooserDirs` — and 2 measurement paths,
  JustVoice's cache folder and 3 measurement paths, docgen's cache folder and 1 measurement path),
  18 text files (3 `models.ini`, 15 autosave snapshots) and the family cache registry. Backups:
  `<db>.bak-2026-10-08-before-path-rewrite` beside each database. The 2026-08-15 headless root that
  sat at `<repo>/data` is kept as `data-old-2026-08-15/`. (*measured 2026-10-08*, a re-run of the
  survey found the old path only in the backups.)
- **The server port matches Python** on JustWrite's real data: route diff 92 reads (78
  identical, 14 volatile), 37/37 writes, 4,809 database cells, 0 different; the seed comparison
  17,741 cells, 0 different. (*measured 2026-10-08*, the kit's
  `server/scripts/route-diff/route-diff.js --app --target justwrite`, and
  `server/scripts/compare-seed.mjs` — deleted with the Python tools and the seed-data snapshot
  test, 2026-10-08: the family keeps no Python, and the parity they proved is recorded here.)
- **Where the JS answers differ from Python on purpose:** 422 errors now come in field order
  (the kit's fix — Python's order too); the desktop window's origin `app://justwrite` stays
  allowed when the user sets their own CORS origins (Python allowed only the list); a request
  body's `1.0` is stored as `1`; JSON answers say `application/json; charset=utf-8`. (*code*, the
  port's report, 2026-10-08.)
- **The window's CSP is the kit's default plus `https:` images** (`electron/main.js` `cspAdd`):
  the Tauri window had none, and a manuscript can hold an image pasted from the web. pdfmake's
  `Function("return this")` sits behind a `globalThis` check that always wins, so the default's
  no-eval holds. (*code*, the built chunk read 2026-10-08.)
- **The installer is 134 MB** (it was 170 MB while the renderer's libraries — tiptap, pdfmake,
  docx… — were `dependencies`: electron-builder packages every dependency, and Vite had already
  bundled them; they are devDependencies now). It installs, starts, serves headless through
  `justwrite-server.cmd` with the bundled tutorial book, and an update and an uninstall keep
  `data\`. (*measured 2026-10-08*, a silent install into a scratch folder.)
- **The e2e runs on the user's real data** (Electron from the checkout, `<repo>/data`), 7/7. Its
  one write — the theme test — is undone by writing the `ui` settings section back at the end;
  two tests were stale against the app (AI settings moved to `#/ai`; `--accent-h` became
  `--accent-hue`). (*measured 2026-10-08*.)
- **The data folder's copy of the samples went stale.** `createApp` copied the bundled samples into
  `<data>/samples/` once and never again (the 2026-07-13 decision D4), so the sample fix of
  2026-10-15 (Started and Deadline as ISO dates) never reached a data folder made before it: the
  user's copy still read "May 2, 2026". Since 2026-10-18 a boot replaces each entry the app ships
  whose bytes differ, and leaves the rest of the folder alone; on a snapshot of the user's data the
  copy went from "May 2, 2026 / March 1, 2027" to "2026-05-02 / 2027-03-01". A tutorial project
  already in the database keeps its stored words, as notes do (the 2026-10-13 ruling). (*measured
  2026-10-18*, `server/tests/samples_materialize.test.js`.)

---

## The phone app: UI library and the server

**Records:** [`2026-10-08-phone-ui-library-test.md`](../plans/2026-10-08-phone-ui-library-test.md)
(the theming test; its tools, measurements and screenshots in the folder of the same name) ·
[`2026-10-08-sync-design.md`](../plans/2026-10-08-sync-design.md) (phone ↔ desktop sync — research
started, nothing decided). Upstream library facts (versions, licences, Node on phones, sync
tools) are in the kit's register §2, "Phones".

- **The screens never call the server directly.** No raw `fetch(` in `src/`; every call goes
  through the kit's `get/post/put/del/requestBlob` and its AI client's `fetch`
  (`../just-core/packages/ui/src/client.js`). Answering those two in-app is what a phone build without
  the server needs; the views would not change. (*code, 2026-10-08*.)
- **The server is 32 files, 6,765 lines** (`server/src`, tests excluded). Node-only imports in 11
  files — `node:crypto` for ids, `node:path`, and `node:fs` in autosave snapshots, the data-folder
  move and the demo seed. Fastify-specific use is small: `reply.code` 19×, `reply.type` and
  `reply.header` once. The kit modules it uses: `py`, `models`, `pyjson`, `errors`, `log` are
  plain JavaScript; `data_paths`, `zip` and `server` need Node. The database goes through the kit's
  synchronous helper (`platform/sql.js` on better-sqlite3). (*code, 2026-10-08*.)
- **Saving sends the whole book** (`PUT /v1/projects/{id}/book`, `src/services/projectApi.js:83`);
  the server splits it into the tables. Sync between devices would need per-item changes.
  (*code, 2026-10-08*.)
- **35 tables; book rows are keyed `(project_id, id)` with text ids** from
  `uid(prefix)` = prefix + `Date.now()` in base 36 + 4 random base-36 characters
  (`src/stores/project.js:29`) — unique in practice, not guaranteed across devices; the tutorial
  book's ids are fixed (`l1`…). Two chat tables are keyed by **position**
  (`chat_session_messages`, `chat_messages`); writing stats are keyed by day and chapter; the RAG
  tables are derived. (*code, 2026-10-08*, `server/src/database/models_schema.js`; the table list
  is in the sync record.)
- **Quasar and Element Plus both carry JustWrite's look and follow every Appearance knob live**
  on the Locations screen — dark mode, accent, button radius, density, label case, both fonts,
  ink palette; 121 checks. Overrides beyond the variable mapping: Quasar 150 lines, Element Plus
  94; mapping: Quasar 28 Sass lines + 23-line icon set + 4-line dark bridge, Element Plus 54
  variables (56 lines) + a 4-line icon helper, no dark bridge. (*measured 2026-10-08*, the record.)
- **At 390 px every Locations page is unusable alike** — the 280 px sidebar column leaves ~110 px.
  Quasar's `QDrawer` has a `breakpoint` phone mode; Element Plus's layout components have no
  breakpoint logic. (*measured* + *code*, 2026-10-08.)
- **The status menu draws with no background** (`src/components/StatusSelect.vue`): Reka's
  portalled `SelectContent` has no `data-v-*` attribute, so the component's scoped `.status-menu`
  rules never apply. In `dist/` built before the test too. (*measured 2026-10-08*.)
- **A dev-only route list can leak into the build** (Vite 8): a template literal in a route
  path, or an export the dev pages import from the routes module, kept their chunks in `dist/`; a
  static import of the module reshuffled the shipped chunks. `await import()` inside the
  `import.meta.env.DEV` branch kept the build identical (614/615 chunks equal, the one difference
  a kit commit made meanwhile). (*measured 2026-10-08*, the record.)

---

## Sync (2026-10-08)

The engine's own facts are `../just-sqlite-sync/docs/dev/RESEARCH.md`; the field and the phone
tests are the kit's RESEARCH §2 "Sync" / "Sync, round 2". JustWrite's:

- **The book save used to rewrite the whole book** (`book_io.decompose`: delete every child row,
  insert again) — with change recording on, every save would have stamped every field and
  overwritten other devices' edits. The renderer's save now goes through `saveBookChanges`
  against the rows that window last loaded (server/src/api/projects_api.js).
- **The editor's schema loads in Node** (`src/services/editorSchema.js` + aiDiff/markers/
  searchReplace: plain TipTap, the DOM only inside functions); `getSchema` gives 21 nodes and 14
  marks; TipTap warns "Duplicate extension names found: ['link', 'underline']" (StarterKit 3
  already includes both) — as the editor always has.
- **Scene merge through y-tiptap** (`@tiptap/y-tiptap` 3.0.9 `updateYFragment`, `@tiptap/html`
  3.27.1 `/server` on happy-dom 20.14.5): HTML round-trips exactly; two devices' edits to one
  scene merge (tested). Known limit: `updateYText` diffs each text run by common prefix/suffix, so
  a mark one device adds can stretch over words the other inserted inside the same run — text is
  never lost, formatting can over-extend in that case (spike, 2026-10-08).
- **Two copies of Yjs break each other's `instanceof` checks** — the linked engine resolves its
  own `yjs`; JustWrite passes its own to `openSync({ yjs })`.
- **Packaging:** the server now imports TipTap at runtime, so those packages moved from
  devDependencies to dependencies (electron-builder ships only production dependencies).
- **A style attribute's text depends on the DOM** (*measured*, 2026-10-09, on TipTap 3.31.4):
  ProseMirror's serializer writes `style` through `style.cssText` (prosemirror-model 1.25.2+, to
  stay clear of a CSP); happy-dom 20.14.6 — the server's — reads it back as browsers do,
  `prop: value;` declarations joined by one space (`min-width: 50px;`, and it drops a declaration
  it can't parse), while linkedom 0.18 — the phone's — keeps the text as given (`min-width: 50px`).
  happy-dom 20.14.5 kept it as given too, so the phone and the server agreed until the update; the
  phone's `generateHTML` (`server/src/editor/html.phone.js`) now writes the browsers' form.
- **`npm audit` (2026-10-09):** `braces` (high) and `sprintf-js` (moderate) are flagged in every
  version, so no update clears them; they reach JustWrite only through `depcheck` (a development
  tool) and `mammoth`'s command-line argument parser (`argparse`), neither run on the app's input.

## What other writing apps ship

Asked 2026-10-11 for the AI drafting design ([`../plans/2026-10-11-ai-drafting-spec.md`](../plans/2026-10-11-ai-drafting-spec.md);
its implementation plan [`../plans/2026-10-11-ai-drafting-plan.md`](../plans/2026-10-11-ai-drafting-plan.md);
the plan for the story-world sheets and slices 3–4
[`../plans/2026-10-15-ai-drafting-plan-slices-3-4.md`](../plans/2026-10-15-ai-drafting-plan-slices-3-4.md)).
The full survey — two web passes, the matrices, about 90 sources — is
[`../plans/2026-10-11-ai-writing-apps-survey.md`](../plans/2026-10-11-ai-writing-apps-survey.md);
the 2026-06-05 passes it builds on are the roadmaps under *Records* below. *web, agent* = checked
against the page by an agent, not re-checked by the session.

- **Sudowrite generates story-bible entries three ways:** **+ Add Character → Blank / Generate /
  Surprise Me**; **Generate** on an empty trait and **Rewrite** on a filled one; **Generate All
  Characters** from the Synopsis; Smart Import takes up to 30 characters per batch from up to 60k
  words. (*web 2026-10-11*, the docs page updated 2026-01-14, re-fetched by the session; survey A1.)
- **LocalProse fills an entity from a describe box in its own editor,** and since v2.1.3
  (2026-05-01) "Préserver l'existant" fills only empty fields; it has no scene, chapter or outline
  generation as of v3.7.0 (2026-10-01). (*web, agent 2026-10-11*, its changelog; the user's
  screenshots 2026-07-18; survey A8, A9.)
- **NovelCrafter has no describe-to-generate in its Codex;** it creates entries from Chat through
  **Extract**, a review pop-up. Its prose prompts take the Codex entries mentioned in the beat or
  the text before it, manual references, the POV entry and "Always include" entries with their
  children; each entry is **Always / Include when detected / Don't include when detected / Never**.
  (*web 2026-10-11*, the codex-context page re-fetched by the session; survey A5, A34.)
- **Sudowrite's Write sends up to 20,000 words before the cursor plus the Story Bible;** its Draft
  writes a chapter from scenes after a pre-check. (*web, agent 2026-10-11*; survey A26, A27.)
- **No surveyed product documents several entity candidates side by side, or a name button inside
  the entity form.** (*web, agent 2026-10-11*; survey A3.)
- **Writers reject AI prose more than AI planning:** 87% of 258 published novelists are "extremely
  negative" about AI writing short sections (Cambridge, 2025-11); the Authors Guild's Human
  Authored mark allows brainstorming and outlining "as long as … no actual AI-generated text
  appears in your work"; SFWA's Nebulas bar partly LLM-written works. (*web, agent 2026-10-11*;
  survey A42, A45, A47.)
- **Sudowrite added Character Portraits (2026-09-25) and Worldbuilding Images (2026-10-07);**
  JustWrite's engine makes no images. (*web, agent 2026-10-11*; survey A35, B1.)
- **JustWrite's writer actions sent only the passage and the voice canon** — no story-bible
  context (`src/services/writerAI.js:128,169,186`). (*code 2026-10-11*.) Since `ce350cb` (slice 2)
  the six prose actions also send the scene's story context; the line edits still don't.
- **Brainstorm's results went only to the clipboard** (`src/pages/BrainstormPage.vue:165`), and its
  categories were hardcoded English outside i18n (`:18-61`). (*code 2026-10-11*.) Since `b347ace`
  the categories are in the locale files (`src/services/brainstorm.js`) and Name ideas sets a
  character's name from the same list.
- **Entity sweep fills only role, kind, one-liner and note** on what it creates
  (`src/services/analysis/entitySweep.js:124`). (*code 2026-10-11*.)
- **A scene has no summary field;** the card view shows its first 180 characters of prose
  (`src/pages/ChaptersPage.vue:320`). (*code 2026-10-11*.)
- **A scene's POV and "when" were lost on every save** — the scenes table had no columns for them
  (a failing round-trip test, 2026-10-11); fixed in `d55f8f5`. On a copy of `data/`, the upgrade
  added both columns, changed no row count in 77 tables, and The Ninth Facet (12 scenes) came back
  identical through both save paths. The Ninth Facet is the bundled sample book, the only book in
  `data/`. (*measured 2026-10-11*, a scratch script on the copy.)
- **The writer actions run at a 32,768-token window on the user's box:** every preset, both prose
  presets included, uses `gemma-4-26b-a4b-qat` (the presets on the copy of `data/`), set to
  `ctx-size = 32768` in `data/ai-runtime/models.ini`. The 12B there is 16,384. One launch profile
  has served every task since 2026-07-06 (`server/src/seed_presets.js:34`); the "writer 8k" in
  IDEAS.md and `measured-performance.md:17` is the earlier dedicated section. (*code + measured
  2026-10-11*.)
- **Continue sends only the last 800 characters before the cursor** (`src/components/RichEditor.vue:371`,
  `:489`). (*code 2026-10-11*.)
- **The sample book's story bible is ~4,800 tokens:** 50 cards from `buildEntityCards`, 19,199
  characters; the largest character card is 1,746 characters (~440 tokens); scenes link 1–5
  characters, 4 in most. (*measured 2026-10-11*, a scratch vitest run on the copy's export.)
- **The AI usage ledger has no book:** each row is feature, provider, model, tokens, cost and
  timing (`../just-core/packages/core/src/llm/usage_sink.js:24`). (*code 2026-10-11*.)
- **Both AI rules a writer meets apply per book:** the Authors Guild issues Human Authored "per
  title" (FAQ #2, #17); KDP asks about AI-generated text when each book is published or
  republished, and AI-assisted editing needn't be disclosed (content guidelines G200672390).
  (*web 2026-10-11*, both re-fetched by the session.)
- **The sync engine skips a column the receiving device doesn't have**
  (`../just-sqlite-sync/src/engine.js:469`), and its README asks for a schema-version bump on a
  shape change — JustWrite's was 2 since `d55f8f5`, and is 3 since `ff44e29`. (*code 2026-10-11*.)
- **Status and Exclude from AI are lost on every save:** the server keeps no `status` for
  scenes, characters, locations, objects or groups, and no `excludeFromAi` for those or worldbuilding
  articles — both come back `undefined` after a save and reload. No AI code filters entities on
  `excludeFromAi` (only scenes, `src/services/rag/chunker.js:99`), though its tooltip promises
  "Hides this entity from any AI feature that pulls in story-world context." (*measured
  2026-10-11*, a scratch round-trip through `book_io` on a temp database; the pages' writes vs the
  tables' columns.) Fixed in `ff44e29`: both are columns now, and every story-bible card reader
  skips an excluded entity.
- **A linked scene's story context on the sample book is ~2,100 tokens:** The Ninth Facet's chapter
  1, scene 2 (five characters, a location, an object, pinned beats, no notes or POV) composed to
  13 parts, 8,451 characters with its STORY CONTEXT heading — within the 15% share of a
  32,768-token window (4,915 tokens), so nothing was cut. Scene 1 of the same chapter (one
  character, a location, an object, no previous scene) was 3,344 characters. (*measured
  2026-10-11*, the request bodies in a browser on a copy of `data/`, the model stubbed.)
- **Accept all / Reject all map positions twice:** in a TipTap chain each command's `state.doc` is
  the transaction's current doc, and `acceptChange` / `rejectChange` (`server/src/editor/aiDiff.js`)
  find their ranges there and then map them through `tr.mapping`; with two or more pending
  changes Reject all threw `RangeError: Position 3305 out of range`. (*measured 2026-10-11*, a
  browser on a copy of `data/`.) Fixed the same day: each command maps only through its own
  steps (`ownStepsMap`), with `src/services/aiDiff.test.js`.
- **Rejecting a change in the scene's last paragraph threw:** `expandRangeToContainingBlock`
  (`server/src/editor/aiDiff.js`) took the position after a paragraph's closing token for its
  content end and returned one past it, so the block range ended one past the node — past the
  document for the last paragraph (every Continue at a scene's end), into the next block
  elsewhere. (*measured 2026-10-11*, Task 14's browser probe: one fresh change, Reject threw.)
  Fixed the same day, with the last-paragraph and continuation cases in `aiDiff.test.js`.
- **The scene strip's AI menu was a hand-rolled box that left the screen:** 380 px, anchored to
  the right of the AI button and clipped by the pane card — cut off on the left at 1280 px with the
  sidebar open, almost wholly off screen at 390 (x −279 of 359). Moved onto the kit's UiMenu the
  same day; inside a kit menu the routing chip's popover needed the kit's popup z-index (999, not
  Quasar's 6000 on the menu) and `pointer-events: auto` (the menu sets `<body>` to none while
  open). (*measured 2026-10-11*, browser probes on a copy of `data/`.)
- **A finished AI task had no duration while it lingered** (the kit's `aiTasks.js` added
  `durationMs` only on archiving), so the chapter footer read "done in NaNs" for 5 s; the store
  now sets it when the task ends. (*measured 2026-10-11*.)
- **The kit's additive columns needed quoting** for a keyword column (`when`): fixed in the kit's
  `1ab9a69`, with a test. (*measured 2026-10-11*.)

### Marking AI-written text (2026-10-18)

The design and slice 4's plan: [`../plans/2026-10-18-ai-text-mark-and-slice-4.md`](../plans/2026-10-18-ai-text-mark-and-slice-4.md).

- **Sudowrite** shows AI-generated text purple "when first inserted"; "The purple formatting
  disappears once you edit the text". Its users ask for the colour to stay through edits.
  (*web: docs.sudowrite.com, Write; feedback.sudowrite.com; read 2026-10-18.*)
- **iA Writer's Authorship** shows AI text "with a colorful gradient", human text "in subtle
  tones"; Show Authors (⇧⌘A) toggles it; "Writer relies on you defining the authorship by yourself"
  (Mark Selection); the metadata sits at the end of the file and every export drops it. The page
  doesn't say what an edit to AI text does. (*web: ia.net/writer/support/editor/authorship; read
  2026-10-18.*)
- **KDP counts AI text as AI-generated "even if you applied substantial edits afterwards"**; AI
  that edits or refines content you created is AI-assisted and needn't be disclosed — the line
  JustWrite's mark follows: AI-written text marked, AI edits of the writer's words not.
  (*web: KDP content guidelines G200672390, read 2026-10-11 — the spec §9.7.*)
- **ProseMirror: `Mapping.appendMapping(mapping.slice(n))` ignores the slice's bounds** — it
  appends every map, so a position mapped through it moved past the step it should have started
  after (the typing rule unmarked the word after the one typed). Map through
  `tr.mapping.slice(n)` directly. (*measured 2026-10-18, @tiptap/pm 3 — `server/src/editor/aiText.js`.*)
- **A typed character inside a marked run inherits the mark** (`Transaction.insertText` takes
  `$from.marks()`), so "the words you type are yours" needs a plugin; `inclusive: false` only covers
  the run's end. ProseMirror tags paste and drop `uiEvent`, and prosemirror-history tags Undo
  `history$` — the two the rule leaves alone. (*code and tests, 2026-10-18.*)

## Translation: what still shows in English (2026-10-12)

The July research and its seven decisions: [`../plans/2026-07-26-i18n-single-source-research.md`](../plans/2026-07-26-i18n-single-source-research.md)
(decisions as blessed: in `../plans/archive/2026-07-26-i18n-phase1-coverage-plan.md`'s header).
The plan that follows from it, every app and the kit on vue-i18n, is the kit's
`docs/plans/2026-10-12-i18n-standard.md`; the counts for the other repos are in the kit's register §8.
Measured 2026-10-12 by running the built app in the pseudo-locale (`scripts/i18n-pseudo.js`'s
`walk`, switched in the page through the i18n instance) on a copy of `data/`, visiting every
route at 1280 px (Settings' nine sections and the AI console's five tabs each), and listing the
visible text and `placeholder`/`title`/`aria-label`/`alt` that stayed plain English, each
attributed by searching the source trees for its literal. Bucketing-grade: windows, menus,
toasts and hover tooltips were not opened; 147 strings matching book content were set aside.
(*measured 2026-10-12*, scratch probe.)

- **JustWrite's pages are translated; the gaps are elsewhere.** About 446 distinct English
  strings remained, roughly: the kit's screens ~140, JustWrite code the lint can't see ~100,
  Quasar's own text ~10, seeded database words ~10; the rest is not translatable or not chrome
  (help pages, log lines, model ids, URLs, font names).
- **The kit's screens are English.** Settings → Sync (24 strings), the AI console (providers,
  usage, console, logs, pricing, Feature Lab, presets), Updates, Backups' reset, the model
  catalog, and Appearance's theme, size, corner and accent names (53, `appearance.js`). Only the
  labels feed's ~20 words (`src/i18n/familyLabelsFeed.js`: dialogs, AI tabs, download bar,
  connection error) follow the app's language. The blessed decision 1 was vue-i18n as the kit's
  peer dependency; what was built is the feed (`../../../just-core/docs/app-structure.md`
  "Words relabel per app ONLY through the labels feed"). JustVoice depends on vue-i18n
  (`^11.4.13`); docgen does not. — *pseudo-locale run, 2026-10-12, before the i18n plan's Task 1*;
  since its step C the kit's screens render through vue-i18n in JustWrite's language.
- **Quasar's own text never changes language:** no `quasar/lang` pack is set anywhere, so the
  table pager ("Rows per page", "Page 1 / 1"), the editor toolbar and the date picker stay English.
  — *before Task 1*; since its step B `src/boot/i18n.js` sets Quasar's pack with the language.
- **What `no-raw-text` can't see:** bound attributes built in script (`PlotBoardPage.vue`'s
  27 `aria-label`/`title` strings such as "Delete strand {name}"), and labels defined in
  JavaScript (`voiceDrift.js`'s six metric names, `CommandPalette.vue`, `ExportPage.vue`'s format
  descriptions, JustWrite's `appearance.js` theme presets, `AnalysisPage.vue`, `NotesPage.vue`).
- **Dates follow the browser's language, not the app's:** 13 `toLocale…String(undefined)` /
  `()` calls in 8 files (ChatPanel, DateTimePicker, Sidebar, VersionHistoryModal, AnalysisPage,
  EventsTimelinePage, HomeShelfPage, TimelinePage), and `DateTimePicker.vue:20` lists the month
  names in English.
- **Seeded database words stayed English by decision 4** (marker types, statuses, roles) until
  2026-10-18: the marker types are a code table with keys now; statuses and worldbuilding
  categories show by key until renamed (the kit's
  `docs/plans/2026-10-18-seeded-words-in-the-users-language.md` §5); a character's role is the
  writer's own text.
- **How the i18n lint's settings came about** (JustWrite's `eslint.i18n.config.js`, now the family's
  one file): `code` joined `ignoreNodes` 2026-07-26, when the HTML-in-message hints moved to
  `<i18n-t>` slots (a `<code>` holds identifiers like `.zip`, `accent2`); `\p{S}` joined
  `ignorePattern` 2026-07-29, after 23 warnings turned out to be glyph-only nodes (`× − ✕ ✓ ↑ ⏎`);
  `kbd` joined 2026-07-29, because Settings' shortcut table had `⌘F` flagged while `⌘\` passed;
  the rule went from warn to error 2026-07-30, when the sweep reached zero in all 81 renderer `.vue`
  files. — *the config's own comments until 2026-10-12, when they moved here*.
- **A bare `@`, `{`, `}` or `|` in a message breaks it when it's shown.** vue-i18n's message format
  reads `@` as the start of a linked message; `mentionRefs.empty` ("Type @ in a scene…") failed to
  compile on every location or object page without mentions, and the built app's console said
  only `SyntaxError: 10` — the compiler's code 10, INVALID_LINKED_FORMAT, with its words stripped
  from the production build. A literal one is written `{'@'}`. `src/i18n/messagesCompile.test.js`
  compiles every English message through the app's vue-i18n and failed on exactly that one.
  The smoke didn't catch it: its routes are the list pages, which never show the message.
  — *found driving the sheet pages in a browser, 2026-10-16 (`b1c584b`)*.

## Page layout: measured on the story-world pages (2026-10-16)

- **A flex column that is itself the scroller squashes its fields instead of scrolling.** With
  `display:flex; flex-direction:column; overflow-y:auto; min-height:0` on one element, a child
  whose own overflow isn't visible (Quasar's QField) has an automatic minimum height of 0, so a
  page taller than the card shrank the Kind box to a sliver (Locations, at 1280x800 once the
  describe box was there). The standard shape: the scroller holds a plain column. — *measured
  2026-10-16 (`afff407`)*.
- **A grid or flex item's automatic minimum width is its content's.** The scene Links panel (a
  grid item, `width:100%; max-width:920px`) grew to 606 px on a 390 px screen once it held a 60ch
  field; `min-width:0` lets it take the screen's width, and the field's `max-width:100%` then
  holds. — *measured 2026-10-16 (`891ce9e`)*.
- **Two editors sharing a card's height by flex weights leave each a strip.** The location,
  object and group pages split the card between the description editor (`fill`) and the area
  below it: at 1280x800 the area under the editor was ~190 px, and at 390 px the editor's wrapped
  toolbar (taller than its share) spilled over the next block. One scroller for the page, the
  editor sized to its text above a minimum, is Architecture's shape. — *measured 2026-10-16
  (`df8b6c0`)*.

## Testing: real models and click-through flows (2026-10-16)

- **promptfoo is the standard for running prompts on several models with checks** — MIT, Node
  (≥22.22), 0.124.1 the latest (2026-10-08), a release every one to three weeks; OpenAI announced
  buying it on 2026-03-09 and says it stays open source and maintained. Custom providers and
  JavaScript checks are documented extension points; its telemetry and update check switch off with
  `PROMPTFOO_DISABLE_TELEMETRY=1` / `PROMPTFOO_DISABLE_UPDATE=1`. Its docs say a JavaScript check
  that is an ES module must be `.mjs`; on Node 26 a `.js` module in a `"type": "module"` package
  loads (measured). We pin 0.123.1 (the newest at least two weeks old) and run it through npx:
  installed into the app it would share node_modules with the server's native SQLite build. —
  *npm registry and promptfoo.dev, read 2026-10-16; https://www.promptfoo.dev/docs/providers/custom-api/,
  …/configuration/test-cases/, …/configuration/expected-outputs/javascript/,
  …/configuration/telemetry/; the OpenAI announcement: finance.yahoo.com, gigazine.net 2026-03-10.*
- **A server on a copy of the data finds the installed engine through the copy's
  `runner_setting.cache_root`** — the kit reads the stored choice first (`install.js`
  `resolveCacheRoots`); a copy whose source chose none would otherwise look for models in its own
  empty `ai-cache` and, with `JUST_AI_HOME` pointed at the copy, find no sibling to share.
  `scripts/snapshot-db.js --cache-root` sets it on the copy only. — *measured 2026-10-16: gemma-4-26b
  loaded from `data/ai-cache` on the copy's server.*
- **No cloud model can be tried yet on this box** — no provider in the database has a key, and no
  `*_API_KEY` is set (checked 2026-10-16). The local chat models are gemma-4-26b-a4b-qat and
  gemma-4-12b-qat (`data/ai-runtime/models.ini`).
- **A `fetch` with `keepalive: true` fails once its body passes 64 KiB** (the Fetch standard's
  limit on in-flight keepalive bytes; Chromium rejects with "TypeError: Failed to fetch" and sends
  nothing). The book's autosave (`projectApi.js` `_flushPut`) has sent `keepalive: true` since
  2026-06-18: a 62,304-byte book saved (204), the same book about 6 KB larger failed every save. The
  sample book is 61,480 bytes, which is why it never showed. — *measured 2026-10-16
  (`keepalive-probe`, a scratch server on a copy); found by the flow tests' repeat run.*
- **The first real-model run of every Lab sample** (`npm run eval`, gemma-4-26b): 48 of 65
  passed their contract; all 17 failures were writer samples refused by the server before any
  model ran — "missing template variable(s): storyContext" (and `voiceCanon` for "Flabby
  paragraph"): the seed's "Storm at the lighthouse", "Guided continuation" and "Flabby paragraph"
  predate those variables and lack them, so the Lab can't run them either. Read, not asserted:
  `brainstormPlot`'s "Brainstorm seed" sample is the place-name one (it returned 20 place names);
  Draft from the premise gave the archivist of a premise that says "her" a man's name and "he";
  Fill from book's voice pass returned `vocabulary` as a list, which `sanitizeVoice` empties.
  gemma-4-12b: 47 of 65 — the same 17, plus the marketing pack (below); 650 s for the run against
  gemma-4-26b's 394 s (12B dense against 4B active). — *evals/results/2026-10-16-20-21-01
  (git-ignored).*
- **A non-streaming `/v1/ai/run` to llama.cpp fails once the reply takes longer than the
  provider's `timeout_seconds`** (the local provider's is 60): llama-server sends no headers until
  the whole reply is written, and the kit's agent bounds the wait for headers by that timeout
  (`base.js` `agentFor`). `/v1/ai/stream` — the route the app's own AI calls take — gets headers at
  once. gemma-4-12b's marketing pack failed at 61 s with "Headers Timeout Error"; the eval's
  provider now uses the stream, and the same sample then passed in 89.1 s. — *measured 2026-10-16.*
- **The re-run after the five fixes** (gemma-4-26b, the changed actions only): 12 of 12 passed.
  The writer samples run now: Continue ×3, Rewrite ×2, the passive-voice rule. Draft from the premise
  keeps Mira, "she" and "her father"; both voice passes return `vocabulary` as one string of
  semicolon-separated phrases. Each of the three plot samples returns 18 plot beats, using only the
  names its sample gives (Renn, Harbek, the harbor-master).

  — *evals/results/2026-10-16-23-44-09 (git-ignored); 12 samples in about 108 s of model time.*
- **The two read-not-asserted findings, fixed 2026-10-18** (the three actions, 4 samples, 4 of 4 on
  gemma-4-26b and on gemma-4-12b):
  - the passive-voice rule has its own sample, "Passive paragraph" (two passives whose doer
    matters, two agentless states). Both models made exactly the two active ("Mara found the
    letter … and broke the seal") and left "had been abandoned" and "was boarded up" alone;
  - the voice passes' register line no longer opens with a scale ("where their speech sits between
    formal and casual, and when it slips"); the from-book pass now answers "formal and direct;
    avoids casual pleasantries". The two older stored texts heal (`FEATURE_PROMPT_HEALS`).

  The first 26b run that day failed all four at load ("could not load its speculative-decoding
  (MTP) draft even on its own", 286 MB held by other programs, the card otherwise empty), right
  after JustVoice released the card; the next three runs, two minutes later, loaded it each time.
  Not reproduced; the engine's log went with the run's data copy. — *evals/results/
  2026-10-18-16-14-52 (the failure), 2026-10-18-16-16-47 (12b), 2026-10-18-16-18-34 (26b);
  git-ignored.*
- **Draft from plan on the local models** (slice 4's D4; the Lab sample "Scene from its plan": Ines
  radios the harbor, Brannock talks around it, she hears in his evasions that the boat is gone):
  both pass the contract. gemma-4-26b (2,557 characters, 36.1 s) lands every beat — Ines counts
  aloud and never asks a question, Brannock's "now then" before the hard part, and the turn: "The
  boat is gone … The supply boat is at the bottom of the channel." One slip: Brannock says "if
  anything happened" and the next line says "He didn't say *if*." gemma-4-12b (1,625 characters,
  38.2 s) keeps both voices but softens the turn — the call ends on "The silence of the tower felt
  heavier than the wind", not on Ines knowing. So 26b, the default local model, is fit for Scene
  drafting and the feature carries no warning; one sample each is too little to warn off a smaller
  model. — *evals/results/2026-10-18-18-39-15 (git-ignored).*
- **`tests/smoke/book-smoke.js` runs off :1420 by forwarding the page's `/v1` calls.** The kit's
  origin-aware resolver takes any port but the dev ports (`devPorts: ["1420"]`, `src/boot/jw.js`)
  for a same-origin server, so a dev renderer on another port calls itself; and the server's CSRF
  guard admits only `APP_ORIGINS` (`server/src/app.js`). The script hands `<app>/v1/**` to
  `JW_SERVER` with Playwright's `route.fetch` and `route.fulfill`, without the page's Origin and
  Referer. Its old fixed 2 s wait failed on a cold vite (it compiles on first load); it waits for
  the dev store hook now. LOAD and SAVE both passed (vite on :1433, the server on :17510, a temp
  data dir). — *run 2026-10-18.*

## Records not yet distilled

Indexed by subject so they can be found; their facts move into a section above when work next
touches the subject. History in [`../plans/archive/`](../plans/archive/) is not listed.

**The writer's editor** —
[`2026-07-26-writers-editor-gap-research.md`](../plans/2026-07-26-writers-editor-gap-research.md) ·
[`2026-10-18-editor-expansion.md`](../plans/2026-10-18-editor-expansion.md).

**Single-source text and translation** —
[`2026-07-26-i18n-single-source-research.md`](../plans/2026-07-26-i18n-single-source-research.md).

**Performance** — [`measured-performance.md`](measured-performance.md) (distilled evidence) ·
[`bench.md`](bench.md) (the LLM bench harness).

**Story-bible retrieval** — [`rag-design.md`](rag-design.md) (distilled decisions).

**Roadmaps** — [`ai-features-roadmap.md`](ai-features-roadmap.md) ·
[`potential-roadmap.md`](potential-roadmap.md) (research-driven candidates).

**Family parity** — [`2026-08-05-family-parity-batch.md`](../plans/2026-08-05-family-parity-batch.md).

**Docs** — [`2026-08-04-docs-coverage-worklist.md`](../plans/2026-08-04-docs-coverage-worklist.md).
