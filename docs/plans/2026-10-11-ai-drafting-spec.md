# AI drafting on the story-world pages and in the editor — spec (2026-10-11)

**Status:** decided 2026-10-11 — the design and every open question (§9) ("your rec all go", twice;
the decisions as shown are in `docs/dev/TASKS.md`). Implementation approved the same day ("you
have go for implementation"): slices 1 (characters) and 2 now, per §1.5; the plan is
[`2026-10-11-ai-drafting-plan.md`](2026-10-11-ai-drafting-plan.md).

**Why:** the user, 2026-10-11 — AI creation on each story-world page ("describe a character and
have the ai create one like prosellm … i dont like it seperate like they are on brainstorm") and AI
that writes the story or parts of it. The itch was first recorded 2026-07-26 (IDEAS.md "Brainstorm →
point-of-use generation", which this spec picks up).

**Precedent (in this app):** **Fill from book** — `src/components/CharacterProfileFillModal.vue`:
proposals per field beside the current value, empty fields pre-ticked, nothing saved until
**Apply**. For prose: **Continue with direction…** and its accept/reject diff in the editor.
**Real-world references:** LocalProse's Workshops (the user's screenshots, 2026-07-18: a describe
box, "Preserve existing data", Generate / Complete) and Sudowrite's Story Bible (+ Add Character →
Generate; Generate / Rewrite per trait). The survey: [`2026-10-11-ai-writing-apps-survey.md`](2026-10-11-ai-writing-apps-survey.md).

---

## 1. Decisions (approved 2026-10-11)

1. **Placement.** On a story-world page, a describe box while the page is thin; once it isn't, the
   box collapses to one line. The header's Fill from book button becomes **Draft with AI ▾** with
   two items: *From a description* and **Fill from book** (its name kept — its behaviour doesn't
   change).
2. **Brainstorm stays;** its categories also appear where they're used — names first (the name
   fields), titles later.
3. **Scene plan:** a **Summary** field per scene. Prerequisite done: scenes' POV and "when" were
   lost on every save — tested, fixed, shipped (`d55f8f5`, kit `1ab9a69`).
4. **Prose:** scene drafting is opt-in; every AI draft is recorded in AI usage; AI-drafted text is
   marked.
5. **Order (§9.2):** the context composer and story-world drafting for characters (slice 1) →
   story-aware writer actions (slice 2) → the translation work → the location / object / group
   sheets → scene summaries + planning from the premise (slice 3) → scene drafting (slice 4). Your
   own AI actions are the kit's, sized separately. Not doing: whole-book generation; AI portraits
   (for now).

---

## 2. The context composer (built with slice 1)

One module, two scopes — the single source every drafting feature reads (no second context
builder beside it):

- **book** — premise, genre, the Setting document, world rules, the cast roster; for an entity
  draft, the entity's own filled fields.
- **scene** — book, plus: the cards of the characters / locations / objects linked to the scene,
  its POV, the strand beats pinned to it, its notes, its Summary (§5), and the end of the
  previous scene.

Entity text comes from `buildEntityCards` (`src/services/rag/cards.js:443`) — the card builder the
index and both chats already share — and the roster from the same file. The precedent for one
composer serving several features is `composeCharacterAuditInput`
(`src/services/analysis/characterAudit.js:100`: Fill from book + the audit, "QC-35: one source").
It honours **Exclude from AI** as the chunker does. It sends only what is relevant (the cards
linked to the scene, its beats and notes) and stops at a budget (§9.4): a share of the context
window of the model the feature is routed to. On your box every preset — both prose presets
included — uses `gemma-4-26b-a4b-qat` at 32,768 tokens (`data/ai-runtime/models.ini`; one launch
profile serves every task since 2026-07-06, `server/src/seed_presets.js:34`). What it sent is
shown: a **Context:** line in the AI strip naming the cards.

## 3. Slice 1 — story-world drafting (characters first)

1. **Describe box.** Top of the character page. Open while the page is thin (§9.3); otherwise a
   one-line row that opens it. Input: the description + composer(book). Output: Fill from book's
   two lean JSON contracts (profile, voice), from two new prompt actions with the same reply
   shapes — so `sanitizeProfile`, `sanitizeVoice`, `draftRows` and `applyProfileDrafts`
   (`src/services/analysis/characterProfile.js`) are reused unchanged. The new actions sit under
   the existing features **Character profile** / **Character voice** (one model choice per drafting
   job); their catalog hints (`server/src/feature_catalog.js`) are rewritten to say "from their
   scenes or from your description". Review: the Fill from book window, its eyebrow naming the
   source; nothing saves until Apply; one undo step.
2. **Draft this section** — ✨ in each `CharacterSheetSection` header: the same flow, rows limited
   to that section's fields; the draft reads the sheet's other filled fields.
3. **Name ideas** — ✨ in the name box (characters; the other pages after §9.1): a list from the
   existing `brainstorm` action, its category by page kind, its seed from the page's fields +
   composer(book). Click sets the name; **More like these** as on Brainstorm. The categories move
   to one source both surfaces read (today hardcoded, in English outside i18n,
   `src/pages/BrainstormPage.vue:18-61`).
4. **Suggest characters…** (and locations… after §9.1) — list-page header: composer(book) → a
   list of proposals (name, role, one-liner) with checkboxes → **Add {n} to story bible** (the sweep's label): a new store
   action, mapped in `ACTION_DOMAINS` (`src/stores/project.js:384`). Shaped like
   `EntitySweepModal.vue`.
5. **Save to sheet** on a Talk to {name} answer — where it goes is §9.6.
6. Locations, objects, groups and worldbuilding come after the translation work, with the sheets in §9.1.

## 4. Slice 2 — story-aware writer actions

Today Continue sees the last 800 characters before the cursor and nothing else
(`src/components/RichEditor.vue:371`, `:489`). The prose actions (`runAction`, `guidedContinue`
in `src/services/writerAI.js:128,169`) gain a `storyContext` variable from composer(scene); their seeded prompts gain `{{storyContext}}`
(revised through the prompt stale-heal, `server/src/seed_feature_prompts.js:1098`); the Lab's
sample variables gain it (`src/services/labTestData.js:103`). Line edits (`applyRule`, `:186`)
per §9.5. Two new actions on the same footing: **Rewrite with direction…** (sibling of Continue
with direction) and **Write dialogue…** (the scene's characters, from their voice fields).

## 5. Slice 3 — scene summaries + planning from the premise

- `scenes.summary` — `models_schema.js` + `ADDED_COLUMNS` + `book_io` save and load + the
  round-trip fixture + sync schema 3 (the same path `d55f8f5` took).
- Shown in the scene's Links panel; the chapter's card view shows it instead of the first 180
  characters of prose (`src/pages/ChaptersPage.vue:320`). **Summarize this scene** drafts it from
  the prose (reviewed).
- **Plot board:** **Fill this template for my story** (the template's beats get notes for this
  book from composer(book); reviewed) and **Suggest next beats** per strand (the `brainstormPlot`
  action → beat cards; reviewed). Brainstorm's Next plot beats / Plot twists also appear here and
  in the editor's AI menu.
- **Architecture:** **Draft from the premise**, on the Fabula and Setting documents (lands as a diff in the
  document).

## 6. Slice 4 — scene drafting (opt-in)

- Off until switched on (§9.7).
- **Draft from plan** — in an empty scene and in the AI menu: composer(scene) with the Summary →
  the existing accept/reject diff, or 3 variations.
- Its own feature row, so it can be routed to a different model (a cloud model, or a larger
  window) than the other writer actions.
- Every draft is recorded in AI usage — by feature and model; the ledger has no book
  (`just-llm-runner/server/src/llm/usage_sink.js:24`). The per-book record is the marks:
  AI-drafted text marked with a TipTap mark like the markers
  (`server/src/editor/markers.js`) — the editor schema is shared with sync's scene adapter, so a
  new mark is a sync schema change; its look and whether it survives edits get their own design
  pass.
- **Not gated on local models** (the user, 2026-10-11: "even local models dont it would still be
  useful for online frontier models to use"). Its routing row can point at a cloud preset while
  the rest stays local. A bench leg on your box with the full scene context decides only whether
  the local presets are recommended for it, and what the feature says when they aren't.

## 7. Slice 5 — your own AI actions (the kit)

A named prompt with variables (`{{passage}}`, `{{storyContext}}`, `{{direction}}`) in the kit's
prompt store + Feature Workbench, shown in the editor's AI menu. Sized separately, in
`just-llm-runner`.

## 8. Standards each piece follows

| Piece | Follows |
|---|---|
| Review window | ours: `CharacterProfileFillModal.vue`, on the kit's `AppModal` → Quasar QDialog — https://quasar.dev/vue-components/dialog |
| Describe box, section ✨ | ours: the page's composition and `CharacterSheetSection.vue`'s header |
| Name ideas | Quasar QPopupProxy (a menu on the desktop, a dialog on the phone) — https://quasar.dev/vue-components/popup-proxy |
| Suggest list | ours: `EntitySweepModal.vue`'s review list |
| AI calls, progress, model chip | the kit: `runAiFeature`, `AiTaskStrip`, `AiFeatureChip`; ours: `FEATURE_CATALOG` + seeded prompts |
| Context composer | ours: `buildEntityCards` (`src/services/rag/cards.js`) |
| Prose landing | ours: `RichEditor`'s accept/reject diff + `VariationsModal` |
| Scene Summary column | the kit: `createTables` additive columns (`just-llm-runner/server/src/platform/sql.js:191`); the sync engine's schema rule (`just-sqlite-sync/README.md` "Schema changes") |
| AI-text mark | ours: the markers' TipTap `Mark` (`server/src/editor/markers.js`) |
| Your own AI actions | the kit: its prompt store + Feature Workbench |

Nothing is NOT STANDARD.

## 9. Decided 2026-10-11 (each with its reason)

1. **Locations, objects, groups: structured sheets or a drafted note?**
   *Decided:* small sheets that collapse when empty, like the character sheet. Each keeps its
   existing description; the added fields are:
   - **Location:** Atmosphere & senses · History.
   - **Object:** Properties · History · Where it is now.
   - **Group:** Goals & beliefs · Leadership · History.
   - **Worldbuilding** stays an article: drafting writes its body from the title and summary.

   *Why:*
   - The review window's "fill only empty fields" means nothing with one note.
   - The composer gets facts it can use: atmosphere is what a scene set there needs, and where an
     object is now is what the continuity checks need. The character sheet already asks where
     each possession with story weight is (`docs/character-sheet.md:211`).
   - Real columns, not text blobs, is the house rule.
   - LocalProse, your reference, splits places and items the same way: visual description ·
     atmosphere & sensations · history / lore, and visual description · properties & aura ·
     history / origin (your screenshots, 2026-07-18). Its groups weren't in the screenshots.
   - Adding columns is a proven, safe path since `d55f8f5`.

   The field names are approved as listed.
2. **Before or after the translation work?**
   *Decided:* the character half of slice 1 and slice 2 first; then the translation work; then the
   location/object/group sheets and slices 3–5.
   *Why:*
   - Slices 1–2 for characters are mostly reuse (Fill from book's pipeline, the card builder), and
     they are what you asked for now.
   - Three of the translation work's asks are waiting on you (the `es.json`, the `--think` PR, the
     Gemini key).
   - The new sheets bring many field hints — exactly the text the single-source system exists to
     stop duplicating between the page and the docs — so they cost less after it.
3. **"Thin" for the describe box.**
   *Decided:* a character is thin while none of the sheet's sections has a filled field, so a swept
   character with only a role and a one-liner still counts; another page is thin while its sheet
   fields are empty.
   *Why:* there's no number to tune (nothing to hardcode or seed), it covers the case Entity sweep
   creates, and you can predict it.
4. **The story-context budget.**
   *Decided:* a ceiling — a share of the routed model's context window, seeded at **15%** and
   editable in Settings → AI. The composer sends only what's relevant, so the ceiling matters only
   for crowded scenes.
   *Why — measured 2026-10-11:*
   - On your box the writer actions run at a 32,768-token window (above). The 12B model is set at
     16,384 (`data/ai-runtime/models.ini`).
   - The sample book's whole story bible — 50 cards from the app's own builder — is ~4,800
     tokens. Its largest character card is ~440 tokens. Its scenes link 1–5 characters, 4 in most.
     A typical scene's notes come to roughly 2,000 tokens.
   - The cost is wait time: your box reads a prompt at ~560 tokens a second (the 32k profile,
     `docs/dev/measured-performance.md:20`). 2,000 tokens of notes add ~4 s before the first word,
     where Continue starts in ~1.5 s today (`server/src/seed_presets.js:39`).
   - At 15%: 32k → ~4,900 tokens. Every typical scene fits, and so would the sample book's whole
     bible; the worst case adds ~9 s. 16k → ~2,450 tokens, so a four-character scene fits. A
     200k-token frontier model → ~30,000 tokens, six times the sample book's whole bible.
   - 25% would allow ~8,200 tokens at 32k: up to ~15 s more wait on crowded scenes, and no gain on
     typical ones.
   - Caveat: the sample book's profiles are thin. Chat's notes record one rich protagonist's card
     at 3,009 characters (~750 tokens, `src/services/rag/entityMatcher.js:166`), so a full book's
     scenes will run larger. Measuring a real book is the first step of slice 2.
   - Chat's own pin budget (1,200 tokens, a code constant, `src/services/rag/entityMatcher.js:86`)
     is a retrieval balance, not a share, and stays as it is. Moving it into the database is a
     separate small item.
5. **Line edits and story context.**
   *Decided:* no.
   *Why:* they rework the style of the selected text, and the story doesn't change a passive-voice
   fix. On a local model the context costs tokens and wait time, and it invites the model to
   rewrite content instead of style.
6. **Save to sheet.**
   *Decided:* the chat answer goes through slice 1's describe-and-draft flow. The answer is the
   description, the review window proposes field changes, and you tick what to keep.
   *Why:* no new field or storage, slice 1 reused whole, and nothing saves without review.
7. **Scene drafting's switch.**
   *Decided:* per book, in Settings → Project beside Premise, off by default, labelled **AI scene
   drafting**.
   *Why:*
   - Both rules apply per book. The Authors Guild issues its Human Authored mark "per title"
     (FAQ #2, #17). KDP asks about AI-generated text when each book is published or republished;
     AI-assisted editing needn't be disclosed (KDP content guidelines, G200672390; both read
     2026-10-11).
   - So one book can stay human-written while another uses drafting.
   - The per-book record is the AI-text marks in the book's own text. The AI usage ledger has no
     book (`just-llm-runner/server/src/llm/usage_sink.js:24`).
8. **New labels.**
   *Decided:* keep the list below, with three changes:
   - **Create selected** → the sweep's existing **Add {n} to story bible**: one name for one action.
   - **Draft the Fabula / Setting from the premise** → **Draft from the premise**: the page already
     names the document.
   - **Write dialogue** → **Write dialogue…**: it asks for a direction first, and "…" marks that in
     this app (Continue with direction…, Research feel…).

   The list: Draft with AI · From a description · Describe this character · Draft · Draft this
   section · Name ideas · Suggest characters… · Save to sheet · Rewrite with direction… · Summary ·
   Summarize this scene · Fill this template for my story · Suggest next beats · Draft from plan ·
   Context: · AI scene drafting.

## 10. Blast radius (greps, 2026-10-11)

```
# the writer actions — gain storyContext (slice 2)
src/components/RichEditor.vue:344,357   writerAI.describe(
src/components/RichEditor.vue:375,388   writerAI.continueFrom(
src/components/RichEditor.vue:414-436   rewrite / expand / tighten picked by name (fnVariation, fn)
src/components/RichEditor.vue:466,478   writerAI.applyRule(
src/components/RichEditor.vue:1142,1155 writerAI.guidedContinue(
src/services/labTestData.js:103         { passage, voiceCanon: voiceCanonVar() } — the Lab's writer variables

# Fill from book's helpers — reused by the description draft (slice 1)
src/components/CharacterProfileFillModal.vue:58,66,70,71,112
src/components/CharacterBatchFillModal.vue:107,117,137,138,140,191,192,208
src/services/analysis/characterProfile.js:85,113,144,169,198,225
src/services/analysis/characterAudit.js:100,133   composeCharacterAuditInput
src/services/labTestData.js:202                   composeCharacterAuditInput

# the card builder — the composer's source
src/services/rag/cards.js:443          export function buildEntityCards
src/services/rag/characterChat.js:122  src/services/rag/chat.js:169  src/services/rag/chunker.js:141

# undo — new mutating store actions go here
src/stores/project.js:384  ACTION_DOMAINS     src/stores/project.js:469  COALESCED_ACTIONS

# Brainstorm — its one caller of the brainstorm actions
src/pages/BrainstormPage.vue:124       action: isPlot ? "brainstormPlot" : "brainstorm"

# scene rows — slice 3's Summary column
server/src/book_io.js:268 (save)  :574 (load)
server/src/database/models.js:55  ADDED_COLUMNS
server/src/database/session.js:43  server/src/phone.js:65   createTables(TABLES, ADDED_COLUMNS)
server/src/sync.js:38             SYNC_SCHEMA_VERSION = 2
```

## 11. Testing, per slice

- **Unit:** the composer (both scopes, the budget trim, Exclude from AI); the new store actions are
  in `ACTION_DOMAINS`; the sanitizers' existing tests still hold.
- **Server:** the seeded prompts exist and heal; the book round-trip carries Summary; the sync
  schema version.
- **Renderer:** `npm run smoke` (every route, zero JS errors); the rendered layout measured at
  1280 and 390 px.
- **Local model:** the new prompts run in the Lab on your box; slice 4's bench leg.
- **User docs, in the same change as each slice:** `character-sheet.md`, `story-bible.md`,
  `brainstorm.md`, `writing.md`, `plot-and-time.md`, `ai-features.md`.
