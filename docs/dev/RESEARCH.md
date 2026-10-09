<!-- SPDX-License-Identifier: MIT -->
# Research register — what we already know, and where the proof is (JustWrite)

**Read the section for your subject before researching anything** — before reading code to
answer a question, before measuring, before briefing an agent. Then grep `docs/plans` for
anything newer. The shared AI stack's facts (the kit, llama.cpp, the memory arbiter) are in
[the kit's register](../../../just-llm-runner/docs/dev/RESEARCH.md).

## The rule (family-wide, decided 2026-10-04)

The user: *"why do we keep re researching stuff, we need a primary research doc that we point to
so we dont keep duplicating or forgeting what we have done in the past"* — approved "your rec on
all go". The kit's register carries the rule in full; in short:

- **Before research:** read the subject's section here and grep `docs/plans`. An agent's brief
  carries that section and the line *"don't re-derive these; re-check one only if the code it
  cites changed after its date"*.
- **After research:** its facts land here in the same change. A research doc with no entry here
  is not done. The family guard (`../just-llm-runner/scripts/check-family.js`, check 15) fails
  any `docs/plans/YYYY-MM-DD-*.md` dated 2026-10-04 or later that this page does not link, and
  any link here that points nowhere.
- **Filled as each subject comes up.** Until then a subject's records are indexed below, so
  they can at least be found.
- One fact per bullet, then *how it was checked and when* (measured · code · web · git · record
  · agent), then where the proof is. A fact that turns out wrong is rewritten, ending "(was: …
  until <date>)".

Subjects: [JustWrite on Electron and Node](#justwrite-on-electron-and-node) ·
[The phone app: UI library and the server](#the-phone-app-ui-library-and-the-server) ·
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

---

## The phone app: UI library and the server

**Records:** [`2026-10-08-phone-ui-library-test.md`](../plans/2026-10-08-phone-ui-library-test.md)
(the theming test; its tools, measurements and screenshots in the folder of the same name) ·
[`2026-10-08-sync-design.md`](../plans/2026-10-08-sync-design.md) (phone ↔ desktop sync — research
started, nothing decided). Upstream library facts (versions, licences, Node on phones, sync
tools) are in the kit's register §2, "Phones".

- **The screens never call the server directly.** No raw `fetch(` in `src/`; every call goes
  through the kit's `get/post/put/del/requestBlob` and its AI client's `fetch`
  (`../just-llm-runner/ui/src/client.js`). Answering those two in-app is what a phone build without
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

## Records not yet distilled

Indexed by subject so they can be found; their facts move into a section above when work next
touches the subject. History in [`../plans/archive/`](../plans/archive/) is not listed.

**The writer's editor** —
[`2026-07-26-writers-editor-gap-research.md`](../plans/2026-07-26-writers-editor-gap-research.md) ·
[`2026-07-26-editor-expansion-executor-plan.md`](../plans/2026-07-26-editor-expansion-executor-plan.md).

**Single-source text and translation** —
[`2026-07-26-i18n-single-source-research.md`](../plans/2026-07-26-i18n-single-source-research.md).

**Performance** — [`measured-performance.md`](measured-performance.md) (distilled evidence) ·
[`bench.md`](bench.md) (the LLM bench harness).

**Story-bible retrieval** — [`rag-design.md`](rag-design.md) (distilled decisions).

**Roadmaps** — [`ai-features-roadmap.md`](ai-features-roadmap.md) ·
[`potential-roadmap.md`](potential-roadmap.md) (research-driven candidates).

**Family parity** — [`2026-08-05-family-parity-batch.md`](../plans/2026-08-05-family-parity-batch.md).

**Docs** — [`2026-08-04-docs-coverage-worklist.md`](../plans/2026-08-04-docs-coverage-worklist.md).
