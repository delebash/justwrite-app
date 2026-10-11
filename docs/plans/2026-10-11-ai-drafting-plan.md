# AI drafting — slices 1 and 2: implementation plan (2026-10-11)

> **For agentic workers:** executed inline by the session that wrote it (the user retired the
> delegated executor, 2026-07-20). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a character can be drafted from a description, a sheet section at a time, named from
ideas, suggested from the premise, and filled from a chat answer — and the editor's prose
actions know the story they're writing in.

**Architecture:** one story-context composer (built on the story-bible card builder) feeds every
drafting call; Fill from book's review window, field defs and apply path are reused for every
character draft; new prompts are seeded server-side like every other action (preset ref, Lab
sample, heal where an existing prompt changes). The routed model's context window comes from
the kit's `/v1/ai/resolved-route`, extended.

**Tech stack:** Vue 3 + Quasar (renderer), Pinia, vitest; Node + Hono + SQLite (server); the kit
(`just-llm-runner`) for AI routing, prompts and the resolved route.

**Spec:** [`2026-10-11-ai-drafting-spec.md`](2026-10-11-ai-drafting-spec.md) — read it with this plan.

## Global constraints (from the spec and the house rules)

- Plain JavaScript, `.js` only. Biome lint clean on every touched file.
- Nothing hardcoded: the story-context share is seeded in the database (`ai` settings section,
  `storyContextShare: 0.15`), editable in Settings → AI; prompts are seeded `feature_prompts` rows.
- Every user-facing string in `src/i18n/locales/en.json`; `npm run i18n:report` MISSING stays 0.
- Labels, exactly: Draft with AI · From a description · Fill from book (unchanged) · Describe this
  character · Draft · Draft this section · Name ideas · Suggest characters… · Add {n} to story bible
  (existing key `entityReview.addAction`) · Save to sheet · Rewrite with direction… · Write
  dialogue… · Context: · More like these (existing).
- Nothing saves without review: every draft lands in the review window; empty fields pre-ticked.
- One undo step per Apply / per "Add {n} to story bible".
- A new mutating store action is mapped in `ACTION_DOMAINS` (`src/stores/project.js:384`).
- Line edits get no story context; prose actions do (spec §9.5).
- The describe box shows while every character-sheet section count is 0 (spec §9.3).
- The renderer gate is `npm run smoke`; the server gate `npm run test:server`; the family guard
  before each commit. User docs change in the same commit as the behaviour.

## Review focus (most likely to bite, each pinned by a test in its task)

1. **An empty book** (no premise, genre, Setting or cast): drafting still runs — the composer
   emits no section for what's missing and never sends a template placeholder unfilled (Task 4).
2. **A malformed or partial model reply**: sanitizers keep only known keys as clamped strings;
   an all-empty draft shows "the model couldn't draft any fields" and applies nothing (Task 7).
3. **A scene with nothing linked**: the prose actions still run; `storyContext` is "" and the
   Context line says so (Task 13).
4. **A cloud route** (no context window reported): no ceiling, no crash on `context: null`
   (Tasks 1, 4).
5. **Phone width (390 px)**: the describe box, the Draft with AI menu and the name list fit
   with no horizontal scroll (Tasks 9, 10 — measured in the rendered app).

---

## Task 0 — AWAITING YOUR GO: status and Exclude from AI are lost on save

Found 2026-10-11 while building the composer (a scratch round-trip on a temp database): the
server stores no `status` for scenes, characters, locations, objects, groups and no
`excludeFromAi` for those plus worldbuilding articles — both come back `undefined` after a save.
And no AI code filters entities on `excludeFromAi` (only scenes, `src/services/rag/chunker.js:99`),
though its tooltip promises "Hides this entity from any AI feature that pulls in story-world
context." The fix, when approved: columns `status VARCHAR NOT NULL DEFAULT ''` and
`exclude_from_ai BOOLEAN NOT NULL DEFAULT 0` via `ADDED_COLUMNS` (the `d55f8f5` path), both ways
in `book_io`, the round-trip fixture, sync schema 3, whats-new; and `buildEntityCards` skips an
excluded entity (so chat, character chat and the composer all honour it). Until then the
composer filters on the flag in memory (Task 4), which works within a session only.

## Task 1 — The kit: the resolved route carries the model's context window

**Files:** modify `just-llm-runner/server/src/llm/prompts.js` (the resolved-route handler,
`measureAction`); test `just-llm-runner/server/tests/` (new `resolved_route_context.test.js`).

**Produces:** `GET /v1/ai/resolved-route` rows gain `context` — an integer (the local runner's
`n_ctx` for the routed model, else its `--ctx-size` launch argument) or `null` (a cloud route, or
the runner can't say). The reading moves into one helper, `localContextWindow(base, model)`,
which `measureAction` also uses (one source).

- [ ] Test: a stubbed runner `/v1/models` listing → `context` from `meta.n_ctx`; from
  `status.args` `--ctx-size` when `meta` lacks it; `null` for a non-local provider; `null`
  (no throw) when the runner is unreachable.
- [ ] Extract the helper from `measureAction`; the handler becomes `async` and adds `context`;
  `ResolvedRouteResponse` gets `context: opt(nullable(T.Integer()), null)`.
- [ ] Kit suite green; commit + push the kit.

## Task 2 — The story-context share, seeded and editable

**Files:** `server/src/database/seed.js` (insert-if-missing / merge `storyContextShare` into the
`ai` settings row), `src/stores/ai.js` (state + `savePrefs` + `setStoryContextShare`),
`src/components/WritingAiSettings.vue` (a card: a number 5–50 %), `en.json`, `docs/ai-features.md`;
tests in `server/tests/seed.test.js` and `src/services/` (store round-trip).

- [ ] Test: a fresh workspace's `ai` row carries `storyContextShare: 0.15`; an existing `ai` row
  without it gains it and keeps `autoRebuildRagIndex`; an existing value is never overwritten.
- [ ] Implement; the card reads/writes through the AI store (the `autoRebuildRagIndex` pattern).
- [ ] Docs: ai-features.md names the setting. Commit.

## Task 3 — The character sheet's field definitions, one source

**Files:** create `src/services/characterSheet.js` (the section list: key, i18n title, and each
field's `{ group, k, type }`, moved verbatim from `CharactersPage.vue:208-289` plus the bespoke
motivation / arc / voice / backstory fields); modify `src/pages/CharactersPage.vue` to import it;
test `src/services/characterSheet.test.js`.

**Produces:** `SHEET_SECTIONS` (`[{ key, fields: [{ group, k, type }] }]`, keys `identity · arc ·
voice · function · capabilities · continuity · depth`), `sectionCounts(extras)`,
`isThinCharacter(extras)` (every count 0), `sectionFieldDefs(sectionKey, extras, t)` (rows in
`draftRows`' def shape: `{ key: "group.k", label, current }`).

- [ ] Test: the seven sections and their field counts (identity 12, arc 3, voice 15, function 9,
  capabilities 5, continuity 8, depth 7) match the page; `isThinCharacter({})` is true and false
  after any one field is set.
- [ ] Move the arrays; the page renders identically (smoke + a look). Commit.

## Task 4 — The context composer

**Files:** create `src/services/storyContext.js`; test `src/services/storyContext.test.js`
(jsdom, like `ragCards.test.js`).

**Produces:**
- `composeBookContext(project, { budgetTokens }) → { text, names, tokens }` — premise, genre,
  world rules, the Setting card, the main-cast card; sections omitted when empty.
- `composeSceneContext(project, { chapterId, sceneId, budgetTokens }) → { text, names, tokens }` —
  the book context plus the cards of the scene's linked characters / locations / objects (in
  link order), its POV label, its pinned strand beats, its notes, and the previous scene's last
  ~800 characters.
- `storyBudgetTokens(share, contextWindow) → number | null` — `null` (no ceiling) when the window
  is unknown.
Tokens are estimated at 4 characters each (`src/services/rag/entityMatcher.js:87`, the existing
module fact). Cards come only from `buildEntityCards`; entities and scenes with `excludeFromAi`
are skipped. Over budget, whole cards drop from the end (book context first in, last out).

- [ ] Tests: an empty project → `""`; a scene with two linked characters → both cards, in order;
  an excluded character → absent; a budget smaller than the cards → only whole cards that fit;
  `storyBudgetTokens(0.15, 32768) === 4915`; `storyBudgetTokens(0.15, null) === null`.
- [ ] Implement. Commit.

## Task 5 — One undo step per applied draft

**Files:** `src/stores/project.js` (`applyCharacterDraft(id, { patch, extras })`, one `_record`,
in `ACTION_DOMAINS` as `characters`; `addCharacters(list)` → ids, one `_record`);
`src/services/analysis/characterProfile.js` (`applyProfileDrafts` writes through
`applyCharacterDraft`); tests in `src/stores/` (undo restores both the record and the extras in
one step).

- [ ] Test first (fails today: two undo steps). Implement. Fill from book's single and batch
  windows keep working (their existing tests). Commit.

## Task 6 — Seeded prompts for the new actions

**Files:** `server/src/seed_feature_prompts.js`, `server/src/seed_presets.js`
(`DEFAULT_FEATURE_PRESETS`, `DEFAULT_TEST_SAMPLES`), `server/src/feature_catalog.js` (hints),
`src/services/labTestData.js` + `src/services/testData.test.js` (the Lab table), server tests'
counts.

New actions:
| Action | Feature | Preset | Variables |
|---|---|---|---|
| `characterProfileDraft` | characterProfile | p_creative_structured | `user_content` |
| `characterVoiceDraft` | characterVoice | p_creative_structured | `user_content` |
| `characterSection` | characterProfile | p_creative_structured | `user_content` |
| `suggestCharacters` | brainstorm | p_creative_structured | `user_content` |

The two drafts return Fill from book's exact JSON shapes (so `sanitizeProfile` /
`sanitizeVoice` apply) but INVENT from the description and the book context instead of grounding
in scenes; the voice draft composes its sample lines (labelled as composed in the prompt).
`characterSection` returns `{ "<key>": "<text>" }` for exactly the keys it is given.
`suggestCharacters` returns `{ "characters": [{ "name", "role", "oneLiner" }] }`, 4–8 of them,
none reusing a cast name. Catalog hints: Character profile / voice say "from their scenes or from
your description"; Brainstorm adds "names on the story-world pages and Suggest characters".

- [ ] Tests: seed counts (prompts 39 → 43, preset refs 39 → 43); every action has a Lab sample
  (the existing set test); the Lab table declares all 43 (adds the two missing Fill from book
  entries too). Commit.

## Task 7 — The drafting service

**Files:** create `src/services/analysis/characterDraft.js`; test `characterDraft.test.js`.

**Produces:** `draftFromDescription({ project, characterId, description, signal })` →
`{ profile, voice }` (sanitized, each pass non-fatal like Fill from book's voice pass);
`draftSection({ project, characterId, sectionKey, description, signal })` → `{ fields }`
(only the section's keys, clamped strings); `suggestCharacters({ project, signal })` →
`[{ name, role, oneLiner }]` (names unique and not already in the cast). Each composes
`user_content` from `composeBookContext` + the character's current sheet (the audit's profile
text) + the description.

- [ ] Tests with a stubbed `runJsonAnalysis`: garbage keys dropped; an empty reply → empty
  fields; suggestions drop duplicates and existing names; the composed `user_content` carries the
  description and the premise. Commit.

## Task 8 — The review window takes a source

**Files:** `src/components/CharacterProfileFillModal.vue` (props `source: "book" | "description"
| "section"`, `description`, `sectionKey`; the eyebrow names the source; rows from Task 3's defs
for a section); `en.json`.

- [ ] Unit-test the row building per source (pure functions in `characterDraft.js`). Apply goes
  through `applyCharacterDraft`. Commit.

## Task 9 — The character page: describe box, Draft with AI ▾, section ✨

**Files:** `src/pages/CharactersPage.vue`, `src/components/CharacterSheetSection.vue` (an optional
`action` slot in the header), `en.json`, `docs/character-sheet.md`.

- The describe box: under the hero row while `isThinCharacter`; else a one-line row
  ("Describe this character…") that expands it. Textarea ~60ch + **Draft** (primary) → the review
  window with `source: "description"`.
- The header's Fill from book button becomes **Draft with AI ▾** (kit `UiMenu` on Quasar's QMenu):
  *From a description* (focuses the box, expanding it) · *Fill from book* (as today).
- Each section header: ✨ **Draft this section** → the review window with `source: "section"`.
- [ ] `npm run smoke`; the rendered page measured at 1280 and 390 px (no horizontal scroll; the
  box ~60ch); docs. Commit.

## Task 10 — Name ideas at the name box

**Files:** create `src/services/brainstormCategories.js` (the seven categories, labels and
placeholders through i18n — out of `BrainstormPage.vue:18-61`); `BrainstormPage.vue` imports it;
create `src/components/NameIdeas.vue` (Quasar `QPopupProxy`: a menu on the desktop, a dialog on the
phone); `CharactersPage.vue` (✨ in the name box); `en.json`; `docs/brainstorm.md`,
`docs/character-sheet.md`.

- The list runs the existing `brainstorm` action (category character names), seeded from the
  page's role, one-liner and description + `composeBookContext`; likes and **More like these** as
  on Brainstorm; a click sets the name.
- [ ] Tests: the seed composition; Brainstorm still renders its categories (smoke). Commit.

## Task 11 — Suggest characters…

**Files:** the Characters list header (`CharactersPage.vue`), `EntityReviewModal.vue` reused
(not a new modal: the family rule — a screen that already has the shape is reused; it gains
optional eyebrow / desc / empty-message props), `src/services/entityProposals.js` (its adds, moved
out so they are testable), `en.json` + `es.json`, `docs/story-bible.md`, `docs/ai-features.md`,
`docs/whats-new.md`.

- **Add {n} to story bible** → `addCharacters` (one undo step) — for Entity sweep too.
- [x] Tests: the service dedupe (Task 7); one undo step (`projectHistory.test.js`); smoke; docs;
  the flow driven in a browser on a scratch copy with the model's reply stubbed (2026-10-11).
  Built.

## Task 12 — Save to sheet from Talk to {name}

**Files:** `src/components/ChatPanel.vue` (an action under a character-mode answer),
`CharactersPage.vue` or a host for the review window, `en.json`, `docs/story-bible.md`.

- The answer text becomes the description of a `source: "description"` draft for that character;
  the review window decides what lands.
- [ ] Smoke + a look; docs. Commit.

## Task 13 — Slice 2: the prose actions know the story

**Files:** `server/src/seed_feature_prompts.js` (a `WRITER_PROSE_SYSTEM` = `WRITER_SYSTEM` +
`{{storyContext}}` for rewrite, expand, tighten, continue, describe, guided-continue; heal entries
listing the old exact system for each), `server/src/seed_presets.js` (samples gain `storyContext`),
`src/services/writerAI.js` (`storyContext` option on the prose actions; line edits unchanged),
`src/components/RichEditor.vue` (a `storyContext` function prop, passed through; the **Context:**
line in the AI strip), `src/pages/ChaptersPage.vue` (supplies it from `composeSceneContext` for the
active scene with the routed window), `src/services/labTestData.js` (the passage fill sends it),
`src/services/benchHook.js`, `docs/writing.md`.

- [ ] Tests: the seeded prose systems carry `{{storyContext}}` and the rules don't; the heal list
  matches the old system byte for byte; a prose run with nothing linked sends `""` (no 400); the
  Lab fill carries `storyContext`. Smoke; docs. Commit.

## Task 14 — Rewrite with direction… and Write dialogue…

**Files:** seeded prompts `writerAI.guided-rewrite` (selection + `{{direction}}`) and
`writerAI.dialogue` (from the cursor + `{{direction}}`; the scene's characters' voice fields come
in `storyContext`), preset refs (p_prose_edit, p_prose_voiced), samples, the Lab table, `writerAI.js`,
the AI menu in `ChaptersPage.vue` (the Continue with direction… pattern: `promptDialog`), `en.json`,
`docs/writing.md`.

- [ ] Tests: seed counts 43 → 45; the menu items exist (smoke). Commit.

## Task 15 — Close out

- [ ] `npm run test:fast`, `npm run smoke`, `npm run i18n:report` (MISSING 0), the family guard.
- [ ] The rendered surfaces measured at 1280 and 390 px.
- [ ] TASKS: slices 1–2 BUILT with commits; RESEARCH.md facts (the context-window route, the
  composer's measured sizes on a real book once one is loaded).
