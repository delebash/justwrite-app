# Character sheet v3 merge · richer relation edges · sweep list refinements — Opus execution plan

**Date:** 2026-07-18 · **Status: QUEUED — DO NOT EXECUTE UNTIL THE USER TYPES "go"**
(user, verbatim, 2026-07-18: *"dont have opus code until i give the go command"*).

**Authorization trail:** user approved the design ("i agree with your recs, plan it and have
opus build it give opus good instructions so he doesnt have to figure it all out himself"),
resolved the relations fork ("do richer relations edges"), and asked for richer extraction
("no male female backstory nothing … or can we get that kind of info?"). This doc is those
instructions. It was researched at HEAD `48512b1`-era state by the planning session — every
file:line below was read, not guessed.

**Source document:** `docs/reference/character-template-v3.md` (committed alongside this
plan — the uploaded template is session-local, so it lives in-repo now). The in-app help doc
and label hints derive from it.

---

## §0 Operating rules for the executor (read before touching anything)

1. **Branch** `claude/admiring-galileo-il3q0o`, push `git push -u origin` (retry ×4 on
   network errors, backoff 2/4/8/16s). Never a PR unless the user asks.
2. **One workstream at a time** (RULE #2 tempo): read the whole surface, implement, verify,
   commit, then the next. Commit sequence in §11. No interleaving.
3. **Gates per commit:** `npm run test:unit` for renderer-service changes; `npm run
   test:fast` before each push batch; **headless smoke** (`scripts/headless-smoke.mjs` with
   JW server :17495 + `npm run dev:vite` :1420) after any view change; `cd server && ruff
   check . && python -m pytest` for server changes. **LOOK habit:** screenshot the finished
   character page (Playwright script run from repo root — copy `findChrome()` from
   `scripts/headless-smoke.mjs`; Chromium is at `/opt/pw-browsers/chromium-<ver>/…`, a
   versioned dir) and send it to the user.
4. **Never** put a model id (claude-\*, Fable, Opus) in commits, code comments, or any pushed
   artifact. Commit trailer: `Co-Authored-By:` + `Claude-Session:` lines per session config.
5. **Decision policy:** everything in this plan is user-approved or a flagged default
   (§12). Ship defaults as written; do NOT invent beyond them — anything this plan doesn't
   cover that seems needed → stop and ask the user, don't decide.
6. Kit rule: primitives from `@delebash/llm-ui` only; no local forks; `UiTextarea
   auto-resize` for prose fields. Biome style — match surrounding code, no bulk reformat.
7. The project store is snapshot-undo land: **new character fields need NO store surgery** —
   they ride `updateCharacter` / `setCharacterExtras`, both already in `ACTION_DOMAINS`
   (project.js:391) and `COALESCED_ACTIONS` (project.js:468). Do not add new actions for
   the sheet.

---

## §1 What the user asked for (their words)

- Expand the character sheet by merging `character-template-v3.md` with the existing page.
- "the text explaining the field should go in help" → full explanations in the Help drawer.
- "we can take a small sentence summary for each field and put it next to label" → a short
  muted hint per field, always visible.
- "gender pronoun and age boxes remove hint put label on top like the rest."
- "do richer relations edges" → the template's relationship-dynamics table becomes fields on
  the existing relationship arcs, not a parallel table.
- Richer extraction: "no male female backstory nothing … can we get that kind of info?" →
  Fill-from-book v2 drafts gender/pronouns/age + new core fields.
- From the sweep discussion: a list-aware extraction prompt line + keep non-story chapters
  out of scene-link backfill.

## §2 Verified current state (read these files first)

- **`src/renderer/src/views/CharactersView.vue`** (699 lines). Detail form: hero row
  (lines 459–504) has placeholder-only inputs — Role (477), Gender (488), Pronouns (490),
  Age `UiNumber` (492), Life-status `UiSelect` (494), One-liner textarea (500). Sections:
  Motivation grid `MOTIVATIONS` want/need/lie/truth (44–49, 518–528), Arc `ARC_STEPS`
  start/midpoint/end (50, 530–545), Voice & dialect accent/vocabulary/tic/sample (547–567),
  Backstory (569–575), Appears-in-scenes + Mentioned-in-prose (577–586).
  `updateField` → `project.updateCharacter`; `updateMotivation/updateArc/updateVoice/
  updateBackstory` → `project.setCharacterExtras` (shallow merge per top-level key —
  callers pass the whole nested object).
- **Extras store shape:** `project.characterExtras[id]` = `{ motivation:{want,need,lie,
  truth}, arc:{start,midpoint,end}, voice:{accent,vocabulary,tic,sample}, backstory }`.
  `setCharacterExtras(id, extras)` merges top-level keys (project.js:1457).
- **⛔ CONFIRMED BUG (fix in WS4):** the view writes `extras.voice.tic` / `voice.sample`
  (CharactersView 560/564) but `buildCharacterProfile` reads `v.speechTic` / `v.sampleLine`
  (services/rag/profile.js:58/60) — speech tic + sample line have NEVER reached any AI
  surface (audit, fill, RAG card, character chat).
- **AI profile block:** `services/rag/profile.js` `buildCharacterProfile(character, extras,
  {voice})` — ONE builder, two label tables (`second`/`third`), consumed by
  `composeCharacterAuditInput` (characterAudit.js:97–118, variables `{user_content}`) and
  the RAG character card (cards.js:157).
- **RAG cards:** `services/rag/cards.js` `characterCards` (152–186) = header → profile →
  Relationships (relationshipLines 133–148, from `project.relationshipArcs`, pairKey
  `"a::b"` sorted, `{trajectory, summary, chapters[]}`) → tags → groups → timeline →
  appearances; split via `splitParts` (WB_SPLIT_CHARS=1500), part 1 = pin/citation target.
- **Relationship arcs:** written ONLY by `RelationshipArcModal.vue` (446 lines) —
  `analyseRelationship(…)` → `project.setRelationshipArc(currentKey, result)`
  (project.js:1535 — replaces the whole record). Feature/action `relationshipArc`,
  system prompt `_RELATIONSHIP_SYSTEM` (seed_feature_prompts.py:327).
- **Fill-from-book (E):** `services/analysis/characterProfile.js` (`sanitizeProfile`,
  `profileFromBook`) + `components/CharacterProfileFillModal.vue` (214 lines; `fieldDefs()`
  → rows `{key,label,current,proposed,accept}`, ticked only when current is empty; `apply()`
  routes to `updateCharacter`/`setCharacterExtras`). Server prompt
  `_CHARACTER_PROFILE_SYSTEM` (seed_feature_prompts.py:291–324), action `characterProfile`,
  preset `p_extract`, json_mode.
- **Prompt revisions on existing DBs:** seeding is insert-if-missing; a text change ships
  via **`FEATURE_PROMPT_HEALS`** (seed_feature_prompts.py:1032) — append the OLD system
  text **byte-exact** under the action key; the heal refreshes system + json_schema only
  when the DB row still matches an old text (user-edited prompts untouched). **Copy the old
  string from git BEFORE editing the constant.**
- **Sweep accept/backfill:** `EntityReviewModal.vue` — accepted entities carry
  `originChapters` `[{id,num,title}]`; `originIds` set → `proposeSceneLinks(project,
  accepted, {chapterIds: originIds})` → `project.applyScenePresenceLinks`.
  `isLikelyNonStoryTitle(title)` is exported from `services/analysis/entitySweep.js`.
- **Help system:** docs live at repo-root `docs/*.md` + `docs/toc.json`;
  `services/helpDocs.js` globs them; open via `openHelp("slug")` from
  `@delebash/llm-ui` help.js (precedent: ShortcutCheatsheet.vue:26).
- **Collapse precedents:** CharacterAuditModal expanded-Set + ChevRight/ChevDown icon
  button (43, 270–274); PlotHoleScanModal native `<details>` (157). No page-level section
  collapse exists yet — WS2 creates the canonical one.

---

## §3 WS1 — Hero row: labels on top, hints gone

Current: placeholder-only inputs (§2). Target: every hero control gets a small label above
it, placeholder removed — the pattern already used in the Voice grid (`<div
class="t-muted">Label</div>` above the input, CharactersView 551–560), promoted to a tidy
form: label + control stacked, content-typed widths kept (Role ~200px, Gender/Pronouns
~140px, Age ~80px, Life status ~140px).

- Fields: **Role, Gender, Pronouns, Age, Life status, One-liner** (One-liner keeps its
  full-width italic serif textarea; label "One-liner" above, placeholder dropped; its hint —
  §4 table — sits after the label).
- Add a `.ch-field` scoped style (label `t-muted` 11–12px, 4px gap) rather than inventing a
  global class; if an equivalent exists in `styles.css` already, use it (grep first —
  RULE #1 artifact: name the precedent in the commit message).
- "Main character" + "Exclude from AI" chips stay as they are.
- Life status keeps `UiSelect` with its empty-value sentinel label.

Verify: headless smoke + screenshot. Commit `feat(characters): labeled hero fields`.

## §4 WS2 — Sectioned sheet + the v3 field set

### 4.1 `CharacterSheetSection.vue` (new, `src/renderer/src/components/`)

Local layout component (RULE #1 note in the file header: precedent = CharacterAuditModal's
chevron-expand rows + the `t-eyebrow` section headers already on this page; a kit promotion
is deliberately NOT done — this is page-layout composition, not a primitive).

Props: `{ title, hint (the one-line summary shown muted beside the title), count (filled
fields), defaultOpen }`. Renders: header row = chevron icon-button (ChevRight/ChevDown) +
`t-eyebrow` title + muted hint + (when `count>0`) a small filled-count chip; body = slot.
Open state: `defaultOpen ?? count > 0` — **sections with content open, empty ones start
collapsed** (the template's "dead weight" philosophy on the page). No persistence of
open/closed in v1.

### 4.2 Section map + extras keys

Existing storage keys are UNCHANGED. New fields are new nested `extras` groups; all plain
strings edited via the existing `setCharacterExtras` merge (add one generic
`updateExtrasGroup(group, key, value)` helper in the view mirroring `updateVoice`).

Page order (after hero + tags + aliases):

1. **Identity & Core Engine** — hint: *"The engine — fill this before anything else."*
   Contains the existing Motivation grid (want/need/lie/truth, colored cards kept) plus new
   plain fields. Keys: `extras.identity.{classOrigin, education}`,
   `extras.motivation.{fear, contradiction, values, heuristic, stakes, lieOrigin}` (joins
   the existing four in the same object).
2. **Arc** — existing 3-step card, unchanged keys. Add the hint line only.
3. **Voice & Presence** — existing voice grid extended. Keys: `extras.voice.{register,
   rhythm, forbidden, subtext, humor, languages, sampleAngry, sampleLying}` (+ existing
   accent/vocabulary/tic/sample), `extras.presence.{physicality, presentation, stressTells}`.
4. **Function in the Story** — new. Keys: `extras.function.{theme, protagonistRelation,
   selfImage, persona, privateTruth, buttons, allegiances, escalation, cornered}`.
5. **Capabilities & Limits** — new, genre module, hint says it's skippable; starts
   collapsed even when… no — same open rule as the rest (flagged default §12).
   Keys: `extras.capabilities.{abilities, costs, limits, conditions, whoKnows}`.
6. **Continuity Ledger** — new. Keys: `extras.continuity.{physicalConstants, health,
   timelineAnchors, knows, doesntKnow, believesWrongly, secrets, possessions}`.
7. **Backstory & Depth** — existing backstory textarea + new depth fields. Keys:
   `extras.backstory` (unchanged, top-level), `extras.depth.{regrets, family, skills,
   routines, appearance, tastes}`.
8. **Appears in scenes** / **Mentioned in prose** — unchanged, not collapsible.

Controls: single-line facts → `UiInput`; anything sentence-shaped → `UiTextarea auto-resize
:rows="2"`. Secrets/possessions/knows-lists are textareas with the hint carrying the
line-shape ("one per line…"). No new color tokens; new fields are plain rows inside the
section's `card tight` container (existing pattern lines 549, 571).

### 4.3 Labels + one-line hints (VERBATIM — render hint muted next to/under the label)

| Key | Label | Hint |
|---|---|---|
| oneLiner (hero) | One-liner | Not traits — tension. "A pacifist who keeps ending up in fights." |
| identity.classOrigin | Class origin → now | Where they started vs. where they are — the gap is characterization. |
| identity.education | Education | Formal or otherwise — sets vocabulary, assumptions, what they notice. |
| motivation.want | Wants | What they concretely pursue — checkable on the page. |
| motivation.need | Needs | What would make them whole — usually invisible to them. |
| motivation.lie | Lie they believe | The misbelief driving their bad decisions. |
| motivation.truth | Truth they meet | What they must accept — the arc's destination. |
| motivation.fear | Core fear | What they organize their life to avoid — the lie's shadow. |
| motivation.lieOrigin | Where the lie began | Write it as a scene: where, who said what, what they decided. |
| motivation.contradiction | Central contradiction | Two things both true about them that don't fit. |
| motivation.values | Values under pressure | Three values, ranked — the higher wins until the crisis tests the ranking. |
| motivation.heuristic | Decision heuristic | "Under pressure, they choose ___ over ___." |
| motivation.stakes | Stakes | What breaks — for them and others — if they fail. |
| arc.start / midpoint / end | (existing labels) | Section hint: *Frame it as evidence for and against the lie.* |
| voice.accent | Accent | (no hint needed) |
| voice.register | Register | Formal ↔ casual — where they sit, and when they slip. |
| voice.rhythm | Rhythm | Clipped or flowing; do they interrupt or trail off? |
| voice.vocabulary | Vocabulary tells | 3–5 words only they would use. |
| voice.forbidden | Forbidden words | Words this character would never say. |
| voice.subtext | Subtext habit | Deflects with jokes; answers questions with questions. |
| voice.humor | Humor style | Dry / absent / cruel / self-deprecating — "none" is a choice too. |
| voice.languages | Languages | Who can they understand that others can't? |
| voice.tic | Speech tic | A verbal habit scenes can borrow. |
| voice.sample | Sample line — calm | An ordinary-moment line; the calibration set. |
| voice.sampleAngry | Sample line — angry | |
| voice.sampleLying | Sample line — lying | |
| presence.physicality | How they occupy space | Posture, gait, stillness or motion — one line a scene can borrow. |
| presence.presentation | Presentation | What their appearance *choices* signal — the message, not the looks. |
| presence.stressTells | Baseline & stress tells | Their normal state, and how fear or lying leaks through. |
| function.theme | Thematic argument | The position they embody in the story's central question. |
| function.protagonistRelation | Relation to protagonist | Opposition / mirror / temptation / ally / measuring stick. |
| function.selfImage | Self-image | Who they believe they are. |
| function.persona | Public persona | Who they perform being. |
| function.privateTruth | Private truth | Who they actually are — the gaps between these three are engines. |
| function.buttons | Buttons | What reliably provokes them — levers other characters can pull. |
| function.allegiances | Allegiances & obligations | Groups they belong to — and what membership demands. |
| function.escalation | How they escalate | Aggression, withdrawal, sabotage, going over heads… |
| function.cornered | Cornered behavior | What they do with no good options — who they really are. |
| capabilities.abilities | Abilities | Magic, tech, training — what can they actually do? |
| capabilities.costs | Costs | What each use takes — energy, sanity, time, moral weight. |
| capabilities.limits | Hard limits | What they can never do — limits generate more plot than powers. |
| capabilities.conditions | Conditions | What the ability requires — tools, materials, states. |
| capabilities.whoKnows | Who knows | Who is aware of these capabilities. |
| continuity.physicalConstants | Physical constants | Only features that appear on the page — scar, limp, tattoo. |
| continuity.health | Conditions & disabilities | Anything that changes what's possible in a scene. |
| continuity.timelineAnchors | Timeline anchors | Birth year + dated events — do the math once. |
| continuity.knows | Knows at story start | |
| continuity.doesntKnow | Doesn't know | |
| continuity.believesWrongly | Believes wrongly | The top source of continuity errors and POV leaks. |
| continuity.secrets | Secrets | One per line: the secret — who else knows — what forces the reveal. |
| continuity.possessions | Possessions with story weight | Objects that will matter — and where each one is. |
| backstory | Backstory | Past facts only — beats that will surface on the page. |
| depth.regrets | Regrets | Compressed backstory plus motivation in one line. |
| depth.family | Family / upbringing | |
| depth.skills | Skills & ceiling | Competence AND its limit, so solutions stay fair. |
| depth.routines | Routines & habits | Useful mainly for disruption. |
| depth.appearance | Appearance beyond the constants | |
| depth.tastes | Tastes & quirks | |

Section hints: Voice & Presence — *"How they sound and move — the calibration set."*
Function — *"What they're FOR in the cast."* Capabilities — *"Genre module — skip for
realist fiction."* Continuity — *"Facts that must never drift."* Backstory & Depth — *"Fill
only what will surface on the page."*

Tests: extend an existing vitest file or add `characterSheet.test.js` only if there's logic
worth testing (the section open/count computation). Commit
`feat(characters): v3 sectioned character sheet`.

## §5 WS3 — Help doc

1. Write **`docs/character-sheet.md`** — adapt `docs/reference/character-template-v3.md`
   into app-voiced help: one section per sheet section, every field's full explanatory
   paragraph (the template's parenthetical + blockquote text), plus the template's framing
   ("fill Part 1 first; a field that never affects a scene is dead weight"). Mention
   Fill-from-book and where its button is. Keep the register-shifts table and the
   three-sample-lines idea as guidance prose (the register-shift table is NOT a form field
   in v1 — see §12).
2. Add to `docs/toc.json` under "Planning your story": `{ "slug": "character-sheet",
   "title": "Character sheet", "hint": "Every field of the character dossier, explained" }`.
3. On the character detail page header, add the help affordance opening it:
   `openHelp("character-sheet")` — check how `HelpTrigger` is mounted in PaneHeader.vue
   first and reuse that exact idiom (precedent law); fall back to a ghost `?` icon button
   only if PaneHeader has no slot for it.

Docs are bundled by `services/helpDocs.js` glob automatically — no loader change. Commit
`docs(help): character-sheet doc + page trigger`.

## §6 WS4 — AI plumbing: every filled field reaches the model

**`services/rag/profile.js`:**
1. **Fix the tic/sample bug:** read `v.tic || v.speechTic` and `v.sample || v.sampleLine`
   (view writes tic/sample; legacy keys kept as fallback for old DB rows).
2. Extend `buildCharacterProfile` to append every new field when filled, in this order
   (identity/core first so part 1 of a split card stays the pin/citation target — cards.js
   173 comment): identity block (existing) → classOrigin/education → motivation incl. new
   keys (fear, contradiction, values, heuristic, stakes, lieOrigin) → arc (existing) →
   voice incl. new keys + all three sample lines → presence → function → capabilities →
   continuity → backstory (existing position) → depth.
3. Both `PROFILE_LABELS` voices get entries for every new key (second person: "Your core
   fear", "What you do when cornered", …; third person: "Core fear", "When cornered", …).
   Keep labels short — they're prompt text.

**`services/rag/cards.js`:** no structural change — the card already embeds
`buildCharacterProfile(..., {voice:"third"})`; the split machinery (1500-char parts,
pin-all-parts) absorbs the growth. Sanity-check one long character card still splits with
identity+core in part 1.

**Character chat / audit:** both ride `buildCharacterProfile` via composeCharacterAuditInput
— no change needed; verify by grep that no OTHER profile serializer exists (QC-35).

Tests: `ragCards.test.js` — a character with new-field extras renders them on the card;
tic/sample regression test (extras.voice.tic appears in profile output). Commit
`fix(rag)+feat(rag): voice tic/sample reach AI; v3 fields on the profile block`.

**Re-embed note (surface to the user in the final report):** filled new fields change card
text → those cards re-embed on next index update. Partial, expected.

## §7 WS5 — Richer relation edges (user: "do richer relations edges")

Extend the existing relationship-arc record — NOT a new table, NOT a new store slice.

**Shape:** `relationshipArcs[pairKey]` gains `sides: { [characterId]: { wants, fears,
speaksLike } }` — keyed by character id (pairKey is sorted, picker order isn't; ids are
unambiguous). All strings, "" default.

**Analysis:** extend `_RELATIONSHIP_SYSTEM` + its json schema (seed_feature_prompts.py:327,
and the schema next to it) so the model also returns, for EACH of A and B: `wants` (what
they want from the other), `fears` (what they fear from the other), `speaksLike` (how they
speak to the other — register/manner, one line). `services/analysis/relationshipArc.js`
maps A/B onto the real character ids before the store write (it knows characterAId/BId).
**Add the OLD system text byte-exact to `FEATURE_PROMPT_HEALS["relationshipArc"]`** so
existing DBs heal.

**UI (`RelationshipArcModal.vue`):** under the trajectory chip + summary, a "Dynamics"
block — two mini-cards (one per selected character, header = name): three labeled rows
(labels: "Wants from <other>", "Fears from <other>", "Speaks to <other> like…") —
hand-editable `UiInput`/`UiTextarea`, saved on change via
`setRelationshipArc(currentKey, { ...arc, sides })` (merge, don't clobber the strip data).
AI fills them on analyse; the writer can overwrite. Hints per the template: the
speaks-like row is the register-shift table's payload.

**RAG:** `relationshipLines` (cards.js:133) — after each arc line, when sides exist, append
indented lines: `  ${name} wants from ${other}: …` / `  ${name} fears from ${other}: …` /
`  ${name} speaks to ${other} like: …` for THIS character's side (the other side lives on
the other character's card). Keep deterministic ordering.

**Store/undo:** `setRelationshipArc` keeps its current recording behavior — check whether
it calls `_record` (project.js:1535); match whatever the existing call does, change nothing
about domains.

Tests: ragCards relationship-sides rendering; relationshipArc service maps a/b→ids.
Server: heal entry present. Commit `feat(relations): per-side dynamics on relationship arcs`.

## §8 WS6 — Fill-from-book v2 (richer extraction)

Extend action `characterProfile` (preset untouched — p_extract):

**Prompt (`_CHARACTER_PROFILE_SYSTEM`)** — JSON gains:
```
"identity": { "gender": "", "pronouns": "e.g. she/her — as the prose uses them", "age": <integer years or null>, "role": "occupation/role in the story" },
"motivation": { …existing four…, "fear": "", "contradiction": "", "stakes": "" },
"continuity": { "physicalConstants": "physical features the prose states — scar, build, coloring" }
```
Honest-"" rule extends to every new field; `age` is null unless the prose states or tightly
implies it. **Append the OLD system text byte-exact to
`FEATURE_PROMPT_HEALS["characterProfile"]`** (copy from git before editing). If the action
has a json_schema in its registry entry, extend it to match.

**`sanitizeProfile`** — extend: `identity.gender/pronouns/role` strings (max 60/40/120),
`identity.age` → integer 0–500 or null, `motivation.fear/contradiction/stakes` (max 300),
`continuity.physicalConstants` (max 500). Never emit keys the page doesn't store.

**`CharacterProfileFillModal.vue`** — `fieldDefs()` gains rows: Gender, Pronouns, Age,
Role (current values from the character record), Core fear, Central contradiction, Stakes,
Physical constants (current from extras). `apply()`: identity keys → `updateCharacter`
(age as number); motivation/continuity keys → `setCharacterExtras` merge (spread the
existing group, don't clobber siblings). Empty-current default-tick rule unchanged.

Tests: `characterProfile.test.js` — sanitize clamps + age parsing + no-key-leak for the new
shape. Server: seed tests (heals don't change catalog/preset counts — expect NO count
bumps; if a heal-census test exists, update it). Commit
`feat(characters): fill-from-book drafts identity, fear/contradiction/stakes, constants`.

## §9 WS7 — Sweep list refinements

1. **List-aware prompt line** in `_ENTITY_SYSTEM` (seed_feature_prompts.py:191), appended
   to Rules: `- Some "chapters" are reference pages (character list, dramatis personae,
   glossary, appendix). Treat each entry there as an entity: the entry heading is the name,
   its description feeds role/oneLiner (characters) or kind/note (locations, objects). The
   evidence quote is the entry's first words.` **Add the OLD text byte-exact to
   `FEATURE_PROMPT_HEALS["entitySweep"]`** as a SECOND old-string in that list (one exists
   already — pre-aliases; append, don't replace).
2. **Backfill exclusion:** in `EntityReviewModal.vue`, when building `originIds`, skip
   origin chapters whose `title` matches `isLikelyNonStoryTitle` (import from
   `../services/analysis/entitySweep.js`) — accepted entities keep the origin for display,
   but reference pages never generate scene-presence links.

Tests: sweepCancel.test.js area — a unit test that a Character-List origin is excluded from
the link set (extract the filter into a tiny exported helper in entitySweep.js if that's
cleaner to test). Commit `feat(sweep): list-page-aware extraction; no backfill from
reference pages`.

## §10 Verification matrix

| After | Run |
|---|---|
| WS1, WS2 | vitest · build:vite · headless smoke · **screenshot of a filled + an empty character page → send to user** |
| WS3 | build:vite (docs glob) · open help drawer in smoke run if scriptable, else screenshot |
| WS4 | vitest (ragCards + profile regression) |
| WS5 | vitest · server pytest+ruff (heal) · headless smoke (modal route) |
| WS6 | vitest (characterProfile) · server pytest+ruff |
| WS7 | vitest · server pytest+ruff |
| End | `npm run test:fast` · headless smoke · final screenshot set · push |

pytest count pins: NO catalog/preset/refs count changes expected in this plan (no new
actions). If a count test fails, STOP and find out why before "fixing" the number.

## §11 Commit sequence

1. `feat(characters): labeled hero fields` (WS1)
2. `feat(characters): v3 sectioned character sheet` (WS2)
3. `docs(help): character-sheet doc + page trigger` (WS3)
4. `fix(rag): voice tic/sample reach the AI profile block` + `feat(rag): v3 fields on the profile block` (WS4 — may be one commit)
5. `feat(relations): per-side dynamics on relationship arcs` (WS5)
6. `feat(characters): fill-from-book v2` (WS6)
7. `feat(sweep): list-aware extraction + reference-page backfill exclusion` (WS7)

Push after 2, 4, 7 at minimum (retry rules §0.1).

## §12 Flagged defaults + out of scope

**Defaults the user has NOT individually blessed (ship as written, list them in the final
report so the user can veto in QC):** exact section names/order; which fields are
input vs textarea; empty-sections-start-collapsed; Capabilities gets no special
always-collapsed treatment; secrets/possessions as one-per-line textareas (not tables);
register-shift table and Part 8 prompt card are help-doc guidance only (the RAG card IS the
prompt card, auto-built); fill v2's field subset (voice/function fields deliberately
excluded to keep the JSON contract reliable on local models).

**Out of scope (do NOT build):** auto-detecting which chapter is a character list (the
picker checkbox is the designation mechanism); a manual prompt-card field; fill-from-book
for voice/function/arc-belief fields (phase 2 candidate, needs user go); any JustVoice
parity work; migrating legacy `speechTic`/`sampleLine` data (fallback read covers it).
