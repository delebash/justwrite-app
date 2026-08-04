# #235 — Book-wide page-related undo (per-domain history rework)

> ✅ **CLOSED (docs campaign 2026-08-04)** — shipped 2026-07-10 (the follow-up too). Its :276 doc-bug note (core-concepts delete-toast) verified FIXED 2026-08-04. History/evidence only; live work: `docs/dev/TASKS.md`.

## Context

The user's law (QC-36, verbatim): *"no not global undo undo should always be page related, not global that is bad idea"* — and #235 (verbatim): *"no global book undo that is bad, so yes add it as a task but since it is big lets do it last"*. Today the project store keeps ONE linear history: every recorded mutation deep-clones ALL 18 `HISTORY_SLICES` (`stores/project.js:302-320`) onto one `_past` stack, so ⌘Z on any page reverts the last mutation ANYWHERE — a character edit reverts while you look at chapters (the exact hazard the user named). #233 already scoped the AI page (`ui.pageUndoScopes` + a kit-local stack); #235 makes the whole book follow the law.

**Two live defects found during grounding, fixed structurally by this rework:**
- The TitleBar Undo/Redo buttons (`components/TitleBar.vue:176-181`) and the CommandPalette Undo/Redo commands (`components/CommandPalette.vue:143-145`) still fire the GLOBAL book undo from /ai — #233 scoped only the keyboard handler (App.vue:88), not the buttons.
- `docs/core-concepts.md:73` still describes the delete-Undo toast that the QC-37 toast law removed.

**User decisions locking this design (2026-07-10, this session):**
1. **Undo model = "By the page's data"** (user's pick): ⌘Z on a page undoes changes to the DATA that page owns, no matter where the change was made (sidebar tree, command palette, find-and-replace modal, quick-create, AI apply). Ordering-safe by construction. The alternative (strict provenance) was presented with its data-loss risk and not picked.
2. **The four AI writers stop recording history** (user's pick): chapter critique, reader-knowledge, multi-reader, character audit join the six artifacts that already skip `_record` (reverse outline, beat sheets, plot holes, relationship arcs, marketing pack, daily recaps — precedent comments at `project.js:1236-1240,1249,1293,1892-1895`). One law for all ten; Clear buttons are the management surface.

## Design

### Domains — a disjoint, total partition of the history state

Entries are keyed by DATA domain (not by page). Every recorded action maps to exactly ONE domain; each domain's entries capture only that domain's slices. `trash` is captured per-kind (each kind belongs to its owner domain); `images` is captured per-entity-key (owner's domain). This is what makes per-domain stacks ordering-safe: no two domains ever capture the same state, so popping one domain's top can never clobber another domain's newer change.

| Domain | Slices | Trash kinds |
|---|---|---|
| manuscript | parts, scenes | chapters, scenes |
| characters | characters, characterExtras (+ images.<id> per-key) | characters |
| locations | locations (+ images.<id>) | locations |
| objects | objects (+ images.<id>) | objects |
| groups | groups (+ images.<id>) | groups |
| notes | notes | notes |
| strands | strands | strands |
| worldbuilding | worldbuilding, worldbuildingCategories | worldbuilding |
| architecture | architecture | — |
| meta | project | — |
| statuses | statuses | statuses |
| tagVocab | tagVocabularies | tagVocab |
| events | events | events |

(13 domains; all 18 HISTORY_SLICES and all 12 EMPTY_TRASH kinds are assigned exactly once. `images` has no domain of its own — image actions take the owner kind and land in that entity's domain with a per-key capture, because images have no dedicated page and one shared images domain would let ⌘Z on /characters revert a location-image edit.)

### The per-action strict-diff table (every recorded action → one domain, panel-required)

Slices each action touches are from the read of every action body in `stores/project.js`; "+trash.X" marks the delete-side capture. Single-domain holds for every row.

- **manuscript** (26): addChapter(parts,scenes) · removeChapter(parts,scenes,+trash.chapters) · setChapterWords(parts — no external caller found; verify at build, flag-delete if dead) · setChapterStatus(parts) · setChapterTitle(parts,scenes) · importChapters(parts,scenes) · splitChapterAtScene(parts,scenes) · addScene(scenes) · updateScene(scenes) · applyStitchedChapter(scenes,parts) · setSceneBody(scenes,parts) · setSceneTitle(scenes) · removeScene(scenes,+trash.scenes,parts) · moveScene(scenes) · addPart(parts) · updatePart(parts) · removePart(parts) · movePart(parts) · moveChapterToPart(parts) · moveChapter(parts) · reorderParts(parts) · reorderChaptersInPart(parts) · replaceInScenes(scenes,parts) · replaceInScene(scenes,parts) · restoreChapterScenes(scenes,parts) · reorderScenes(scenes)
- **characters** (5): addCharacter · removeCharacter(characters,characterExtras,+trash.characters) · updateCharacter · setCharacterExtras(characterExtras) · reorderCharacters
- **locations** (4): addLocation · removeLocation(+trash.locations) · updateLocation · reorderLocations
- **objects** (4): addObject · removeObject(+trash.objects) · updateObject · reorderObjects
- **groups** (6): addGroup · removeGroup(+trash.groups) · updateGroup · addGroupMember · removeGroupMember · reorderGroups
- **notes** (5): addNote · removeNote(+trash.notes) · updateNote · importNotes · reorderNotes
- **strands** (8): addStrand · removeStrand(+trash.strands; the parts sweep is dropped by this plan) · updateStrand · addStrandBeat · updateStrandBeat · removeStrandBeat · moveBeat · reorderStrands
- **worldbuilding** (9): addWorldbuilding · removeWorldbuilding(+trash.worldbuilding) · updateWorldbuilding · moveWorldbuilding · reorderWorldbuilding · addWorldbuildingCategory · updateWorldbuildingCategory · removeWorldbuildingCategory(worldbuilding+worldbuildingCategories — both this domain) · reorderWorldbuildingCategories
- **architecture** (1): updateArchitecture
- **meta** (3): updateProjectMeta · setCoverImage · clearCoverImage
- **statuses** (4): addStatusDef · updateStatusDef · removeStatusDef(+trash.statuses) · reorderStatusDefs
- **tagVocab** (3): addTagVocab · renameTagVocab · removeTagVocab(+trash.tagVocab)
- **events** (3): addEvent · updateEvent · removeEvent(+trash.events)
- **owner-dynamic** (2): addImage · removeImage — domain = the caller-passed owner kind (characters/locations/objects/groups); capture = `images.<entityId>` per-key
- **Lose `_record` and relocate** (10): setChapterCritique, clearChapterCritique, setChapterReaderKnowledge, clearChapterReaderKnowledge, clearAllReaderKnowledge, setChapterMultiReader, clearChapterMultiReader, setCharacterAudit, clearCharacterAudit, clearAllCharacterAudits
- **Deleted dead** (2): setChapterStrands, toggleChapterStrand
- **Never recorded, unchanged**: restoreFromTrash/purgeFromTrash/emptyTrash, the six artifact setters/clears, voice-canon trio, setWorldRules, dailyRecaps pair, loadSnapshot/createProject/switchProject/deleteProject

### Mechanism options considered (panel-required note)

Per-domain entry MAPS (chosen) vs keeping the single arrays and TAGGING each entry with its domain: the tagged single array gets "pop the last entry whose domain ∈ set" for free (arrays are seq-ordered), but per-domain HISTORY_LIMIT capping and per-domain redo invalidation become O(n) filter-rewrites of the whole array on every record, and "current capture of that domain onto its future" still needs the domain-keyed capture spec anyway. The maps make cap/invalidate/pop O(1) per domain with the identical memory footprint. Chosen: maps.

### Store mechanics (`stores/project.js`)

- `_past`/`_future` become `markRaw({})` maps: domain → entry array. Entry = `{ seq, slices }` where `slices` keys are plain slice names plus dotted keys `trash.<kind>` and `images.<entityId>`. A module-level monotonic `seq` counter orders entries across domains.
- `ACTION_DOMAINS` — one static table mapping every recorded actionId → domain (replaces nothing; today the mapping is implicit "everything"). `_record(actionId, opts)` looks up the domain, captures that domain's slice set (helper `cloneDomain(state, domain, opts)`), pushes onto `_past[domain]`, caps at `HISTORY_LIMIT` (1000, now per domain — each entry is far smaller than today's whole-book clone, so memory drops in realistic use), clears `_future[domain]` only. Keystroke coalescing (`COALESCED_ACTIONS`, `COALESCE_WINDOW_MS`, the module-level `lastHistoryAt/lastHistoryAction`) is unchanged — a same-action burst is always same-domain.
- Image actions pass their key: `this._record("addImage", { imagesKey: entityId })` — the capture stores `images.<id>` before-value (undefined ⇒ delete-on-restore).
- `undoFor(domains)`: among the given domains, pick the one whose top entry has the highest `seq`; pop it; push the CURRENT capture of that same domain onto `_future[domain]`; apply the entry (plain keys assign the slice; `trash.<kind>` / `images.<id>` rebuild the parent object, deleting when the stored before-value is undefined); `lastHistoryAction = null`; `_persist()`. `redoFor(domains)` is symmetric. `canUndoFor`/`canRedoFor(domains)` getters replace `canUndo`/`canRedo`. `clearHistory()` resets both maps (same callers: `loadSnapshot`, `createProject`, `switchProject`).
- The old `undo()`/`redo()`/`canUndo`/`canRedo` are REMOVED — all three consumers (App.vue, TitleBar, CommandPalette) migrate; no dual mechanism (T3).

### Making every action single-domain (the two cross-domain writes die)

- `removeStrand` (project.js:1562-1577): DROP the parts sweep that clears dangling `c.strands` refs. Evidence this is safe: the two writers of chapter-strand refs (`setChapterStrands`, `toggleChapterStrand`) have ZERO callers (dead actions — deleted by this plan), and both remaining readers already tolerate dangling ids — HomeView:255 counts by iterating LIVE strands, AnalysisView:632 uses `strandById(...)?.color || fallback`. Bonus fix: today restore-from-trash never restored the cleared refs (they were lost forever); now they never leave.
- `removeScene` (project.js:935-959): DROP the notes re-anchor (:949-956). Evidence: `notesForChapter` matches on `anchor.chapterId` alone (project.js:526) so the note stays findable from the chapter; NotesView's `anchorLabelFor` already degrades a dead sceneId to "Ch. N" (NotesView.vue:160-169). Bonus: restoring the scene from trash re-validates the anchor instead of leaving it chapter-flattened.
- The four AI writers (user decision 2) — **relocated out of the history slices, not just un-recorded** (panel catch): today their blobs live INSIDE `parts`/`characters` (critique/readerKnowledge/multiReader on the chapter object :654-710/:1327-1346; audit on the character object :1214-1235), so merely dropping `_record` would leave them exposed to a silent within-domain clobber — any manuscript undo restores an older `parts` clone WITHOUT the fresh critique. The six precedent artifacts are immune precisely because they are top-level non-history keys. So: four NEW top-level state keys outside HISTORY_SLICES — `chapterCritiques`, `chapterReaderKnowledge`, `chapterMultiReader` (each keyed by chapterId), `characterAudits` (keyed by characterId) — the writers lose `_record`, write the keyed maps, keep `_persist()`; a lift-on-load migration moves embedded blobs off chapter/character objects into the new keys, riding the `normalizeStrands`-style normalize step so it covers ALL THREE load routes — `getBoot()` (:178), `loadSnapshot` (:1857), and `switchProject` (:2028) — not just boot (precedent: the chapterBody→scenes migration :201-217); `exportSnapshot` + `createProject` gain the four keys; every reader repoints through new getters (`critiqueFor(chapterId)` etc. — consumers found by grepping `.critique`/`.readerKnowledge`/`.multiReader`/`.audit` at build: CritiqueModal, ReaderKnowledgeView, MultiReaderPanelModal, CharacterAuditModal + any badge renders). Trash interplay (REVISED at build — the diff checker caught that the original "the blob stays under its id" claim broke across the server round-trip, since the maps persist only for LIVE ids): the artifacts ride the TOMBSTONE — removeChapter/removeCharacter COPY the map values into the trash payload (the opaque, durably round-tripped carrier), a same-session ⌘Z of the delete stays artifact-complete because the live map copy is untouched, restoreFromTrash re-maps the payload copies (gap-fill; a regenerated live value wins), the lift deliberately leaves trash payloads alone, and a permanent purge kills the artifact with its tombstone — no orphans anywhere (flagged F4). This makes "one law for all ten" literally true: generated results can neither enter history nor be dragged by it.
- Everything else verified single-domain already: `removeCharacter` (characters+extras+trash.characters — one domain), `removeWorldbuildingCategory`'s article reassign (both slices in worldbuilding), `setChapterTitle`'s scene mirror (manuscript), `_recomputeChapterWords` (manuscript; its sessions side-effect is outside history today and stays so), `replaceInScenes` (manuscript).

### Page → domains (route meta in `router/index.js`)

`meta: { undoDomains: [...] }` on each route record — the router is the canonical page list; App.vue/TitleBar/palette read `route.meta`.

- `/chapters` → `["manuscript"]` · `/markers` → `["manuscript"]` (FLAG F1: markers edit scenes via `updateScene`, so ⌘Z there can also pop prose entries — same-domain data, visible as scene rows)
- `/characters` → `["characters"]` · `/locations` → `["locations"]` · `/objects` → `["objects"]` · `/groups` → `["groups"]` · `/notes` → `["notes"]` · `/worldbuilding` → `["worldbuilding"]` · `/architecture` → `["architecture"]`
- `/strands` AND `/plot` → `["strands"]` (both render strand data; PlotBoard's `moveBeat`/beat edits are strands-slice writes)
- `/timeline` + every `entityEventRoutes` page (incl. setting events) → `["events"]`
- `/` (Home) + `/home-v2` → `["meta"]` (word-goal edits via `updateProjectMeta`)
- `/settings` → `["meta", "statuses", "tagVocab"]` (Settings edits project meta + the status palette + tag vocabularies). Worldbuilding-category edits made in Settings land in the worldbuilding domain → undone on /worldbuilding (FLAG F8).
- `/search`, `/import`, `/export`, `/trash`, `/analysis`, `/brainstorm`, `/relations`, `/reader-knowledge`, `/help` → no domains: ⌘Z inert, TitleBar buttons disabled (FLAG F2). Trash restores/purges were never recorded (project.js:1728-1816) and stay unrecorded.
- `/ai` → NO `undoDomains` (a route comment records why): the kit TaskKinds page-local stack (#233) owns ⌘Z there via its own capture-phase handler, and with no domains the global handler is a no-op that doesn't preventDefault — behavior identical to today's registry bail, ONE signal instead of two (panel convergence: a separate `localUndo` marker would be redundant). The `ui.pageUndoScopes` runtime registry (ui.js:96,230-237) and AiView's register/unregister calls (AiView.vue:24-26) are DELETED (FLAG F5; one registrant; AiView keeps its `onUnmounted` body `ai.resyncRouting()` and drops the now-unused `onMounted` import). This also closes the TitleBar//ai hole: on /ai the buttons now disable.

Consequence of the user's Option-1 pick, noted not flagged: changes made from global surfaces — Sidebar tree edits, CommandPalette adds, the ⌘⇧F find-and-replace modal (mounted in App.vue), quick-creates (SceneLinks on /chapters, GroupsModal on entity views, StatusSelect's inline status create), ImportView ingests, AI applies — land in their DATA's domain and are undone from that data's page.

### Consumers

- `App.vue:79-98`: keep the `focusedInRichEditor()` bail (TipTap owns editor ⌘Z — unchanged); DROP the `ui.isPageUndoScoped(route.path)` check entirely (no-domain routes make it moot); then `project.undoFor(route.meta.undoDomains || [])` / `redoFor(...)`. When the page has no domains, do NOT `preventDefault` — this incidentally restores native text-field undo on inert pages (today ⌘Z inside e.g. the Search input fires book undo).
- `TitleBar.vue:176-181`: `useRoute()`; buttons bind `canUndoFor`/`canRedoFor(route.meta.undoDomains || [])`; disabled tooltip copy → "Nothing to undo on this page" (FLAG F3 — inline strings, matching the file's existing hardcoded tooltip style).
- `CommandPalette.vue:143-145`: the Undo/Redo commands call the scoped versions with the current route's domains.

### Dead code (mechanical deletions, FLAG F6)

- `components/EventsModal.vue` — zero mount sites (verified by import grep).
- `setChapterStrands` + `toggleChapterStrand` (project.js:628-648) — zero callers.

## Tasks

**Task 1 — Store rework (the core).**
Touch: `stores/project.js` (history block :287-334, getters :535-540, actions :550-583; the action fixes + the artifact relocation listed above; `ACTION_DOMAINS` table; dotted-key capture/apply helpers), `components/ImagesModal.vue` + its 4 mount sites (`CharactersView`, `LocationsView`, `ObjectsView`, `GroupsView`) + `CharactersView`'s direct `addImage` call — image actions gain the owner-kind arg (FLAG F7) — plus the four artifact-reader repoints (CritiqueModal, ReaderKnowledgeView, MultiReaderPanelModal, CharacterAuditModal + any badge renders found by grep).
WHY: the partition is the law's mechanism; single-domain entries are what make it ordering-safe; the relocation is what makes the user's "stop recording them" pick actually hold (in-slice blobs would still be dragged by same-domain undo).
Acceptance: every recorded action appears exactly once in `ACTION_DOMAINS` (the two image actions resolve their domain from the caller-passed owner kind); the ten artifact writers and trash ops record nothing AND their blobs live outside HISTORY_SLICES; `undoFor(["manuscript"])` after a scene edit + character edit reverts the scene only; a manuscript undo does NOT remove a freshly-written critique; per-key images capture restores/deletes exactly the touched entity's list; per-domain redo invalidation; HISTORY_LIMIT caps per domain; `clearHistory` covers all domains.

**Task 2 — Routes + consumers.**
Touch: `router/index.js` (meta per route incl. the `entityEventRoutes` factory), `App.vue:79-98`, `components/TitleBar.vue:176-181`, `components/CommandPalette.vue:143-145`, DELETE `ui.pageUndoScopes`+actions (stores/ui.js:96,230-237) and AiView.vue:24-26 (keep the `onUnmounted` `ai.resyncRouting()` at :27; drop the unused `onMounted` import).
WHY: the route table is the one canonical page list; consumers must all scope or the law leaks (the TitleBar//ai hole is exactly such a leak).
Acceptance: ⌘Z + TitleBar + palette all inert on /search + /ai; /ai keyboard bail preserved; each mapped page pops only its domains; native input undo works on inert pages.

**Task 3 — Dead code.** Delete `EventsModal.vue`, `setChapterStrands`, `toggleChapterStrand`. Acceptance: build + smoke green; no references remain.

**Task 4 — Unit tests.** New `src/renderer/src/stores/__tests__/projectHistory.test.js` (vitest node env; mock `services/settings.js`, `services/projectApi.js`, `services/imageStore.js`, the kit — the `aiFeature.test.js` mock pattern). Cases: domain isolation · cross-set max-seq pop · per-domain redo + invalidation · coalescing · delete→trash capture→undo restores both sides · images per-key isolation (character vs location image) · removeStrand leaves chapter refs and undo restores the strand · removeScene leaves the note anchor · the ten artifact writers record nothing · a manuscript undo does not clobber a freshly-written critique (the relocation's point) · legacy-snapshot lift migration (embedded critique/readerKnowledge/multiReader/audit blobs move to the new top-level keys on load) · per-domain limit · clearHistory on switchProject.

**Task 5 — Probe + gates.** New committed `scripts/undo-probe.mjs` (copies `findChrome()` from headless-smoke — never hardcode the browser path). Live legs: prose typed on /chapters + character rename on /characters → ⌘Z on /chapters reverts prose only → ⌘Z on /characters reverts the name → redo both; sidebar chapter rename made while on /notes undone from /chapters; find-and-replace run from /search undone from /chapters; TitleBar buttons disabled on /search and /ai; a RENDER assert that a relocated artifact actually shows on its surface (a missed reader repoint renders an empty panel without throwing, so the zero-JS-errors gate alone can't catch it); full DB restore. Then the standing gates: `npm run test:unit` · `npm run build:vite` · FULL headless smoke (zero JS errors) · the probe fleet (qcbatch, b5, qc35, qc-quintet, b4, switch, dl2, b29, chip) · biome · JW server pytest+ruff (untouched, ritual).

**Task 6 — Docs.** `docs/core-concepts.md` (:73 stale toast line rewritten per the toast law; the undo section rewritten through :94 to the page-related model — this also fixes the stale "last hundred changes" at :87 and the FALSE "last ten history steps are saved" at :93 (undo is in-memory only, project.js:292-293); the TipTap editor-local note at :92 stays true); `docs/whats-new.md` entry; `CLAUDE.md` project-store invariants paragraph (the "snapshot-based undo" bullet); `MORNING_RECAP.md:363`'s now-stale `pageUndoScopes` description updated; queue-doc BUILD RECORD (full prose, flags, verify results) + the recap GO pointer — at ship, same commit series.

## Flags (each reverts on a word)

- **F1** /markers maps to manuscript (its edits are scene data; prose entries share the stack).
- **F2** the inert-page list (search/import/export/trash/analysis/brainstorm/relations/reader-knowledge/help) — undo there says "Nothing to undo on this page".
- **F3** that tooltip copy.
- **F4** the four AI artifacts RELOCATE to top-level non-history keys (data-shape change with a lift-on-load migration); a trashed entity's artifact rides its tombstone payload and re-maps on restore, and a permanent purge kills it with the tombstone.
- **F5** `ui.pageUndoScopes` registry deleted; /ai simply carries no `undoDomains` (one signal, behavior identical, closes the buttons hole).
- **F6** dead-code deletions (EventsModal.vue, the two dead chapter-strand actions).
- **F7** image actions gain the owner-kind argument so image edits join the entity page's undo.
- **F8** Settings' worldbuilding-category edits are undone on /worldbuilding.
- **F9** redo now survives edits in OTHER domains (today any edit kills all redo) — strictly-better semantics, still flagged as a behavior change.
- **F10** core-concepts.md:73 stale delete-toast doc line rewritten (plus the stale :87/:93 history claims).
- **F11** `meta` is edited from both Home (word goal) and Settings (title/author/goals) — the two pages share the meta domain, so ⌘Z on either can revert a meta change made on the other; both pages display meta.

## Verification (end-to-end)

Task 4's unit suite proves the store mechanics; Task 5's probe proves the law live in the real renderer (the exact hazard scenario the user named, plus the global-surface and inert-page legs); the full smoke + fleet prove no regression anywhere else. One rules-checker diff verdict before the code commit, per the standing discipline.

---

## AMENDMENT AT BUILD (2026-07-10) — the server wire shape

The plan assumed a client-only rework ("JW server pytest+ruff (untouched,
ritual)"). The undo-probe's persisted-shape check disproved that: the JW server
DECOMPOSES snapshots into entity tables, and the four artifacts were already
relational columns (models.py Chapter.critique/reader_knowledge/multi_reader
:116-118, Character.audit :192) whose decompose/assemble only spoke the OLD
embedded wire shape — the new top-level maps were dropped on write and
re-embedded on read, so a reload would have lost every artifact. book_io.py was
extended in the same series: decompose reads the four maps (legacy embedded
accepted as a fallback, the map winning) into the same columns — no schema
change, no reset — and assemble emits the four maps with clean entity objects.
Covered by test_projects.py::test_ai_artifact_maps_roundtrip_and_legacy_lift +
the updated canonical fixture in test_book_io.py, and live by the probe's
"lift reaches the DB" check.

Also recorded at build: redoing a PROSE undo while the scene editor is open is
killed by the editor's stitch write-back (ChaptersView:304 re-records on the
store-driven content change) — behavior identical BEFORE this rework, left
unchanged; the probe's redo-survival leg is editor-free and the unit suite
covers the store mechanics. A future echo-suppression is a candidate fix on
the user's word.

## FOLLOW-UP, SHIPPED 2026-07-10 — the editor echo is dead

The very next go (the user's "redoing a prose undo, why cant this work?"
followed by "we need to compact first" armed it, interpretation flagged in the
queue doc). Root cause pinned in the installed library, not our sync logic:
TipTap v3 (3.27.1 here) changed `setContent`'s second parameter from the v2
boolean `emitUpdate` to an options object whose `emitUpdate` DEFAULTS TO TRUE
(verified at node_modules/@tiptap/core/dist/index.js:1211), so RichEditor's
store→editor sync — written as `setContent(incoming, false)` to mean "apply
silently" — had silently become emit-on-set: every ⌘Z content revert bounced
back out through @change into setSceneBody / applyStitchedChapter, re-recorded,
and cleared the just-armed redo. Two layers shipped: (1) the sync watch now
passes the v3 options form `{ emitUpdate: false }` (RichEditor.vue) — restores
the code's own written intent, and benefits all nine RichEditor mounts (the
same echo was clearing redo for Notes/Locations/Objects/Groups/Worldbuilding/
Architecture/Strands bodies in their own domains); (2) no-op guards in the
store — applyStitchedChapter returns before `_record` when the incoming
records are identical to the current scenes (mirroring the writer's own
semantics: a new scene, a reorder, a removal, or an effective-title change is
never a no-op), and setSceneBody gets the sibling guard (flagged extension —
the same defect class on the single-scene path). Verification: two new unit
cases (the echo recreation — an identical write after an undo records nothing
and keeps redo armed; a real change still records and kills redo) and the
probe's new Leg 1c (type → ⌘Z → ⌘⇧Z restores the typing with the editor OPEN
throughout — the user's exact QC scenario); undo-probe 19/19. The paragraph
above stays as history; its "candidate fix" is this one.
