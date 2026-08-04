# I1 tail cleanup — voiceDrift TAIL · CSS-clone promotion · RULE-5 new-entity-popup audit (#34)

> **✅ SHIPPED + PUSHED (2026-07-12).** All three tasks built + gate-verified. After a
> sibling session pushed onto the same branch, the user directed pull+sync+push; I rebased
> my unpushed commits onto the new origin tips (no force), resolved one additive queue-doc
> conflict, re-verified the integrated tree (build:vite · vitest 136/136 · biome), and pushed.
> **Then, after an adversarial rules-checker rightly FAILED T7** (the FULL headless smoke — the
> definitive renderer gate this §Verification section requires — had been skipped pre-push on a
> proxy "disjoint ⇒ fine" argument), I fixed forward on the pushed tree: FULL headless smoke
> **every route errors=0** (lone `shell-structure` ✗ = pre-existing zero-project boot, server
> `projects:0`, independent of the merge) · **undo-probe 19/19** · **popup-probe 54/54**; DB
> restored byte-exact.
> Final shas — JW `5f1fa30` voiceDrift · `8491321` CSS · `3f457f9` hook · `a575715` popup;
> runner doc record `fd72047`. Both branches in sync with origin. Full record: the queue-doc
> tail "I1 JUDGMENT LEGS BUILD RECORD" + the recap's SYNCED+PUSHED paragraph. The
> "Push: user's word only" note below was the discipline followed — push happened on the
> user's word.

## Context

The user's go (2026-07-12, verbatim): *"i will take your rec on voice drift, do css, rule 5, you plan let opus do all the work."* Three items, all ledger §I1 judgment legs (`just-llm-runner/docs/plans/2026-07-06-outstanding-master-plan.md:223-253`). Grounding: two Opus Explore sweeps this session (CSS strict-diff · create-flow census), findings folded below with file:line.

**Execution model (the user's word):** I coordinate + verify; **Opus subagents do all build work** — two sequential build agents (they touch overlapping files; parallel would conflict). Three commits (one per task), each with a genuine Opus rules-checker verdict (commit-gate discipline). A checker FAIL = STOP AND ASK. **Push only on the user's explicit word after the green report.**

Out of scope: `useEntityCrudView` (separate open decision — this plan deliberately adds NO new create-helper abstraction), gate ratchets ("dont do gates"), text.test.js, scene-marks (KEEP, decided).

---

## Task 1 — voiceDrift TAIL re-apply (decided 2026-07-11; re-verified + CONFIRMED this session)

- `services/analysis/voiceDrift.js:22` → `import { htmlToText, tailWords } from "../text.js";`; DELETE local head-taking `tailWords` (:178-183). Call sites :229/:241 unchanged (bare 2-arg = drop-in: same split regex, same short-text passthrough, `ellipsis` default false).
- `services/text.js:4-14` header: remove the voiceDrift-HEAD variant clause; remaining named variants = versionDiff no-strip · voiceFingerprint whitespace-collapse · labTestData blank-line-collapse.

WHY: the decided convergence — every other `tailWords` consumer app-wide already takes genuine tail (plotHoleScan:83 · relationshipArc:66 · characterAudit:71 · sessionRecap:60 · resumeBriefing:84 · stuckDiagnostic:140); voiceDrift was the lone head-taker under a name claiming tail. Behavior change confined to which end of long chapters illustrates the explain prompt (the decision itself). No test pins excerpt content (verified).

## Task 2 — CSS-clone promotion → `styles.css` `.entity-*` family

**Evidence (the strict-diff sweep):** the list-mode family (toolbar · search · search-icon · search-input · count · facets · facet · facet-label · chip+hover+active · table · status-empty · empty) and the detail family (name-input+hover+focus · pane-header gap · desc-strong · cell-title-text leaf) are **BYTE-IDENTICAL across SEVEN views** — Characters (609-755) · Locations (350-430) · Objects (348-428) · Groups (313-427) · **Notes (471-523…)** · **Strands (659-711…)** · **Worldbuilding (350-448…)**. Zero external references to any prefixed family; zero probe/test selector coupling; `.entity-*` unoccupied in styles.css; every token exists in both themes. ≈400+ duplicated scoped lines collapse to ≈70 global lines.

**Build (agent A, with Task 1):**
- New styles.css section "Entity library (list + detail)" (near the Three-pane section, :985): `.entity-toolbar/-search/-search-icon/-search-input/-count/-facets/-facet/-facet-label/-chip{,:hover,.active}/-table/-status-empty/-empty` + `.entity-name{,:hover,:focus}` + `.entity-pane-header .pane-title` + `.entity-desc{…; margin:0}` + `.entity-desc strong` + `.entity-cell-title` (stacked, gap:2 — Loc/Obj/WB/Notes) + `.entity-cell-inline` (row, gap:7 — Groups/Strands) + `.entity-cell-title-text` + `.entity-cell-sub` (the ch-role/loc-kind/obj-kind body) + `.entity-tags`. Bodies copied byte-exact from the canonical (CharactersView) rules; `!important` on search-input padding preserved.
- Repoint all 7 views' templates to the `.entity-*` names; DELETE the scoped dupes.
- **+ ArchitectureView (panel catch — the census undercounted): a per-line verdict for ALL of :200-206.** Repoint FIVE live byte-identical leaves to the family: `.arch-table` (:201) → `.entity-table` · `.arch-cell-title` (:202) → `.entity-cell-title` · `.arch-cell-title-text` (:203) → `.entity-cell-title-text` · `.arch-cell-blurb` (:204, template :90 — body = the ch-role/loc-kind/obj-kind body) → `.entity-cell-sub` · `.arch-status-empty` (:205) → `.entity-status-empty`; delete the scoped clones. Sweep the DEAD `.arch-empty` (:206 — byte-identical to `.entity-empty`, zero template usage, no `#empty` slot at :75-97). `.arch-count` (:200) stays scoped — genuine variant (margin-bottom, no margin-left:auto). The rest of ArchitectureView has no list shape and stays untouched.
- **Anti-undercount law for the build agent (panel process note — this census undercounted three times):** before writing, produce the COMPLETE per-declaration strict-diff table of every touched view's scoped style block (a verdict per rule: promote / genuine-variant-stays / dead-sweep), and include it in the build report for coordinator verification. Any byte-identical rule not in this plan's list → report back, don't improvise. **Stays scoped (genuine variants):** Characters `.ch-cell-name`+subs (avatar row) + `.pane-card` container re-declaration (:669 — container-type, the @container query depends on it, DO NOT TOUCH) + avatar/hero/grids; Groups member-grid/color classes; WB `.wb-cat/.wb-words/.wb-cell-title-sum` + `.wb-desc` padding override; Notes anchor/tag classes + `.note-desc` padding override; Strands beats block; per-view desc spacing (`.ch-desc{margin:0 0 18px}` kept as a scoped compose-class — `class="entity-desc ch-desc"` — zero visual change; Loc/Obj/Gr keep their existing inline list-margin styles).
- **Pre-flight (agent verifies before writing):** renderer-wide grep that no component already uses `entity-*` class names in templates (the sweep checked styles.css only; a scoped `.entity-*` elsewhere — e.g. EntityReviewModal — would newly inherit the global rules). Collision found → report back, don't improvise.

Zero-visual-change law: before/after screenshots of all 8 views (the 7 full-shape views list + detail, plus Architecture), eyeballed identical.

## Task 3 — RULE-5 popup audit (#34): collapse the redundant double-steps

**The law** (MASTER-PLAN:5571): "redundant double-step/popup audit → collapse to open-detail+validate-before-save." **Interpretation for today's app (FLAGGED F4):** detail forms edit LIVE (no draft/save cycle anywhere except EventNewView); the app's own conformant precedent is CommandPalette's DIRECT→FORM (`CommandPalette.vue:112-122` — create default-named → land in detail form). Collapse = that pattern + **focus-and-select the name input on arrival** (`?new=1` query; typing immediately replaces "Untitled …" — the popup's autofocus affordance preserved, zero extra keystrokes).

**COLLAPSE (P→FORM double-steps — popup asks a name, then navigates to a form that has the same name field):**
| Flow | Today | Change |
|---|---|---|
| 6 entity views' add handlers (CharactersView:60-66 · LocationsView:44-48 · ObjectsView:44-48 · GroupsView:57-61 · NotesView:68-72 · StrandsView:111-117) | promptDialog(name) → add → push | drop the prompt → `add()` default-named → push with `?new=1`; detail form focuses+selects name |
| Sidebar `addItem` — 6 kinds (Sidebar.vue:240-253) | promptDialog → add → push | same collapse (one handler) |
| WB article: view `addArticle` (WorldbuildingView:40-59, popup title+category) + Sidebar `addArticleInCat` (:710-718) | popup → add → push | collapse — **conditional on verifying the detail form edits category** (it must, else FLAG back); sidebar variant keeps its tree-node category |
| Chapter creates: ChaptersView `addChapter` :341-353 · `addChapterToPart` :546-556 · Sidebar :271-281 · CommandPalette :98-104 | promptDialog(title) → add → editor | collapse — **conditional on verifying the editor surface has an inline-editable chapter title** (setChapterTitle is a coalesced inline action; verify the affordance exists in edit mode, else FLAG back) |
| Sidebar `addSceneToChapter` (Sidebar.vue:304-321, popup optional title → NAVIGATES to editor :318-320) | popup → add → push | collapse to match the in-view precedent `addSceneHere` (ChaptersView:248-252, already DIRECT→editor) — **conditional (F6) on a verified scene-title edit affordance at the landing editor surface** |

**KEEP — every unit at file:line (verdicts, not omissions; panel-hardened):**
- **P→STAY popups are single-step forms, not double-steps** (the popup is the ONLY step; no form follows; the landing surface has no rename affordance): SceneLinks.vue:53 (character+link) · :64 (location+link) · :75 (object+link) · :86 (strand+link) · GroupsModal.vue:26 (group+member) · StatusSelect.vue:40 (status, created+applied) · PlotBoardView.vue:74 (strand on board) · PlotBoardView.vue:115 (beat on board) · StrandsView.vue:137 (beat, multi-field popup IS the form — beats have no detail page) · parts: ChaptersView.vue:537 + Sidebar.vue:262 + CommandPalette.vue:108 (parts have no detail form) · Sidebar.vue:701 (wb category from the tree) · projectStart.js:42 (project title+author → Home; projects have no detail form) · CommandPalette.vue:129 (chapter version) · SettingsView.vue:337 (appearance preset). ALL KEPT.
- **ChaptersView `addSceneToChapter` (:557-573, the outline "+ scene" at :894) KEPT** (panel catch — was missing a verdict row): P→STAY — popup (optional title) → scene row appears IN the outline, no navigation (the :572 comment records the deliberate stay-in-place design). Not a double-step; the popup is the outline's only naming affordance. NOTE the two same-named functions get different verdicts: the Sidebar one navigates to the editor (collapse, conditional); the outline one stays (keep).
- `splitChapterHere` (ChaptersView:498-529) KEPT — its popup does name+confirm dual duty on a restructure (FLAG F6).
- Already conformant, untouched (file:line): CommandPalette.vue:112/:114/:116/:118/:120/:122 (DIRECT→FORM) · ChaptersView.vue:248-252 `addSceneHere` · EventNewView.vue:39-48 (the NEW-VIEW form) · SettingsView.vue:482 (status) + :510 (wb category) + :704 (tag vocab) inline creates · SceneNotesPanel.vue:131-142 composer · TagEditor.vue:48/:57 · ImagesModal.vue:47 + CharactersView.vue:131 (images) · EntityReviewModal.vue:74/:80/:86 (batch review IS the form) · ImportView.vue:225/:237-238/:243 (bulk imports) · PlotBoardView.vue:61-70 (templates).

**Also in this task:** prune `NEW_ENTITY_META` entries that go dead (services/entityMeta.js — verify remaining consumers first); grep `docs/*.md` for described creation flows + update (help docs + whats-new entry — the popup removal is user-visible, T11); extend/repoint any probe that drives a collapsed flow (the census says none reference these popups, but the build agent re-verifies against `scripts/`).

## Task 4 — Docs + records (same commit series)

Queue-doc BUILD RECORD (full prose: both sweep tables, per-flow verdicts, flags, gates) · ledger §I1 legs marked done (tail shrinks to useEntityCrudView + ratchets + text.test.js) · recap pointer ¶ · this plan → `docs/plans/2026-07-12-i1-css-popup-voicedrift.md` · help docs per Task 3.

## Flags (each reverts on a word)

- **F1** CSS scope = **7 full-shape views + ArchitectureView's 4 table leaves** (evidence-driven: Notes/Strands/WB byte-identical; ArchitectureView.vue:201-205 caught by the checker panel; the earlier "4 entity views" was an undercount twice over).
- **F2** family name `.entity-*`; the facet chip is `.entity-chip` (global `.chip` styles.css:649 is a different chip, untouched).
- **F3** `.ch-desc` keeps its 18px via a scoped compose-class (zero visual change; no global spacing modifier invented).
- **F4** collapse semantics = DIRECT→FORM per the app's own precedent + focus-and-select name via `?new=1` (NOT a draft-until-save rework).
- **F5** consequence of the collapse: "+ New" creates immediately — abandoning leaves an "Untitled …" row; recovery = the page's ⌘Z (deletes are tracked) or delete. Inherent to the direction.
- **F6** conditional collapses: chapters (needs verified inline-title edit affordance in the editor) · WB (needs verified category field on the detail form) · Sidebar scene-add (needs verified scene-title edit affordance at the landing editor surface) — any unverified → that flow reports back instead of building. `splitChapterHere` popup KEPT.
- **F7** every P→STAY popup KEPT (list above).
- **F8** dead `NEW_ENTITY_META` entries pruned.
- **F9** NO new shared create-helper (keeps the useEntityCrudView decision untouched).

## Verification

- Per commit: build agent runs targeted checks; I re-verify the diff line-level; genuine rules-checker verdict.
- Standing gates per ship: `npm run test:unit` (135) · `npm run build:vite` · biome on touched files · FULL headless smoke (server :17495 + vite :1420) zero JS errors.
- Task 2: 8-view before/after screenshots (the 7 full-shape views + Architecture), eyeballed identical.
- Build agent independently confirms the two taken-at-word claims (panel note): the current vitest count, and that no test/probe pins the voiceDrift excerpt content.
- Task 3: live Playwright legs — each collapsed flow creates → lands in detail with name focused+selected → typing renames → ⌘Z removes; each KEPT popup still works; DB restored after.
- Push: user's word only.
