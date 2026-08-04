# Docs coverage worklist — code-first audit results (JW, 2026-08-04)

LIVE plan: the executable worklist from the code-first coverage audit. Every cite
was code-verified by the audit agent. Method: think-passes until dry → surgical
edits (extend pages, never rewrite good ones) → commit. Items check off by
deletion when done.

## A · False claims — ALL FIXED 2026-08-04 (incl. two more of the same class found mid-pass: writing.md's briefing/recap routing paths)

1. `docs/writing.md:242` "Settings → AI & Audio engines → Voice canon" — no such
   menu. Truth: AI Settings page → **Writing AI** tab (`WritingAiSettings.vue:90`,
   tab label `AiView.vue:51`). Same page's "Three variations" says "Settings → AI →
   Three-alternative streaming" — same tab, fix both.
2. `docs/core-concepts.md:100` "saved to your computer's local storage instantly" —
   renderer holds no durable data; truth = the local server (SQLite) via autosave.
3. `docs/core-concepts.md:104` "Settings → Backups → Export snapshot" — real
   controls: **Export backup / Import backup** (workspace) and **Export this
   book…** (per book). `backups-and-data.md` says "snapshot" 3× — align or define
   once.
4. `docs/backups-and-data.md:29,81` "Click Restore from autosave…" — real UI:
   **Show autosaves** toggle → list with per-row Restore + Delete selected/all
   (`SettingsView.vue:1472-1502`).
5. `docs/dev/ARCHITECTURE.md` six stale claims (fix inline + amend the second
   banner): single-turn chat → keeps last 8 messages (`rag/chat.js`); EPUB/ODT
   "strips images" → `rewriteImageSrcs` carries them; "per-project IndexedDB" RAG →
   server SQLite; "sequential" entity sweep → bounded-concurrency provider-aware
   pool; "auto-update skipped" → kit `UpdatesPanel` is MOUNTED
   (`SettingsView.vue:1568`) but DISPLAY-ONLY (version + release notes; no
   check/download — verified in the kit source); Writer-Lab routes no longer exist.

## B · Missing user-doc sections — WRITTEN 2026-08-04 (language landed in appearance.md — the picker lives in the Appearance tab, so no new page; Updates note → whats-new.md; About + welcome + sidebar → getting-started.md; chat sessions + index + palette → notes-and-search.md; sweep/scene-notes/editor-smalls → writing.md; link backfill → analysis.md; batch fill → story-bible.md; trash + tag vocabularies + dailyTarget → core-concepts.md)

1. NEW `docs/general-settings.md` (+ toc): **UI language** (`settings.language`,
   picker from `AVAILABLE_LOCALES`, es ships; changes UI + Intl formatting, never
   manuscript prose; add a language by dropping `src/i18n/locales/<code>.json` —
   VERIFY which Settings tab hosts the picker before writing) · **Updates** (kit
   panel: current version + changelog from whats-new.md; display-only, no
   auto-update) · **About** (runtime, renderer, image storage, workspace stats,
   trash count, shortcut card).
2. Logs section (in `storage.md`): LogsPanel retention, day picker,
   Download/Copy; relation to the AI page's Server console.
3. Trash: promote to a real section (12 `TRASH_KINDS`, per-kind restore, Empty
   trash, scenes/chapters restore into their parent; `TrashView.vue`).
4. Command palette (⌘P) section: 21 nav targets + entity index (8 kinds) + 12
   actions (`CommandPalette.vue`).
5. Chat sessions in `notes-and-search.md`: list per project, New chat, auto-title
   from first question, rename overrides, delete, scope-switch resumes that
   scope's latest, empty sessions never saved (`chatApi.js`, `ChatPanel.vue`).
6. Manuscript index management in `notes-and-search.md`: Build/Refresh modal
   (incremental vs full, per-scene rows, Clear index); auto-rebuild = 60 s
   debounce, only after one manual build, silent failure; template edits need a
   manual Rebuild (`IndexBuildModal.vue`, `rag/autoIndex.js`).
7. Entity sweep extension in `writing.md`: crash-safe per-chapter draft resume
   (pending/failed/changed rescan), online 4-wide vs local single-slot, per-call
   watchdog, Start over (`sweepDraft.js`, `EntitySweepModal.vue`).
8. Link backfill in `analysis.md`: deterministic name/alias matcher, NO LLM,
   grouped per entity, review-then-apply (common-name risk is why never auto)
   (`LinkBackfillModal.vue`, `AnalysisView.vue:753`).
9. Batch Fill from book in `story-bible.md`: pick → run → review → done; mains
   pre-checked, zero-scene disabled; auto-apply-empty-only toggle; cost line;
   sequential by design; Retry failed (`CharacterBatchFillModal.vue`).
10. Editor smalls in `writing.md`: Typewriter mode (focus-mode sub-toggle,
    centres caret line, `RichEditor.vue:1316-1346`); page-break node; AI dropdown
    "Clean up → Clear strikethroughs"; the per-change diff stepper.
11. Scene notes panel in `writing.md`: docked (not overlay), edit-in-place,
    scene vs chapter scope, "Manage all notes ↗" (`SceneNotesPanel.vue`).
12. Project settings: `dailyTarget` (goals card) + **tag vocabularies** editor
    (per-kind curated lists, canonicalization on commit, ships EMPTY on purpose)
    into `core-concepts.md` §Tags or writing.md.
13. Welcome flow in `getting-started.md`: the projectless shell (only /welcome,
    /ai, /help reachable with no project) + the one-time AI dialog's three paths.
14. Sidebar mechanics in `getting-started.md`: per-section filter box;
    drag-to-reorder items AND parts/chapters (`Sidebar.vue:612-692`).

## C · Dev-doc additions — DONE 2026-08-04 (ARCHITECTURE six fixed + banner amended; architecture-notes gained the six subsections + the two list corrections; home-v2 → IDEAS)

- `architecture-notes.md`: §Stores add `versions.js`; §IPC bridge add `pick_file`
  (`lib.rs:205`); new tight subsections — chat-sessions storage model (sessions
  are storage-only, id minting, title derivation, hydration token), sweep-draft
  protocol v1 (raw per-chapter results + re-merge, `textHash` invalidation),
  editor extension inventory (fontSize/indent/pageBreak/sceneBoundary + comment
  mark; 3 toolbar profiles), sidecar lifecycle (spawn, port-in-use kill, respawn
  each launch), analysis module map (19 modules → catalog features, names only),
  i18n note: the runtime switcher SHIPPED (es live).
- `docs/dev/IDEAS.md`: `/home-v2` Paper Shelf = live route, no UI entry —
  unshipped experiment; decide ship-or-delete later.

## D · Recorded, not actioned now (stay in this file)

AI-setup dialog + What's-new modal are file-header-only (thin); `whats-new.md`
drives both the modal and Updates. The audit's full coverage table lives in the
session record; the "Verified NOT stale" anchors (keyboard-shortcuts, toolbar
list, 22 feature ids, headless-access, presets, analysis dashboard) must not be
churned.
