# Batch Fill-from-book (character list) + sweep chaining + auto-apply toggle — Opus execution plan

**Date:** 2026-07-19 · **Status: QUEUED — execute on the user's "go"**
**Authorization:** user approved the design incl. the toggle, verbatim: *"build the toggle
go, make sure opus has the details so it doesnt need to decide you do"* / *"or at least opus
does not need to decide big things"*. **Every BIG decision is made in this doc.** If
something material is genuinely unspecified AND can't be resolved by the named precedents,
stop and ask the user — don't invent. Trivia (spacing px, local var names) is yours.

**What this builds, in one breath:** a "Fill from book" for MANY characters at once — a
checklist modal on the Characters LIST (mains pre-checked), running the existing two passes
(profile → voice) per character sequentially with per-call watchdogs, ending in ONE grouped
review — plus an **opt-in "apply automatically — empty fields only" toggle** that skips
review (never overwrites user text), and a **chained offer after an entity-sweep accept**
("Draft profiles now?") pre-checked with the just-accepted characters.

**Zero server changes.** It reuses the existing `characterProfile` + `characterVoice`
actions untouched. No prompt edits, no heals, no pytest count pins move.

---

## §0 Operating rules (same as the v3 plan — read that doc's §0 if in doubt)

1. Branch `claude/admiring-galileo-il3q0o`, JustWrite repo only. Push with `-u origin`,
   retry ×4 backoff on network errors. No PR.
2. One workstream at a time; commit sequence in §8.
3. Gates: `npm run build:vite` + `npm run test:unit` per commit; **headless smoke**
   (server :17495 + vite :1420 + `node scripts/headless-smoke.mjs`) after view changes;
   **`node scripts/rag-probe.mjs` MUST pass after WS-C** (it drives the sweep-accept flow
   this plan modifies — §6.3 tells you the exact probe edit). Screenshots per §7.
4. Never put a model id in any pushed artifact. Commit trailer per session config.
5. Kit primitives only; Biome style; no store surgery (everything rides existing actions).

## §1 Verified current state (read these before coding — all verified 2026-07-19)

- **Single-character fill:** `components/CharacterProfileFillModal.vue` — runs
  `profileFromBook` then `voiceFromBook` (both in `services/analysis/characterProfile.js`),
  builds rows from local `fieldDefs()` / `voiceFieldDefs()` (label + current-value getters),
  groups Profile/Voice, empty-current default-tick, All/None bar, `apply()` routes
  identity→`updateCharacter` (age parseInt) and groups→`setCharacterExtras` merge.
- **Sweep chain:** `EntitySweepModal.vue` mounts `EntityReviewModal` (line ~301,
  `@committed="onReviewCommitted"`); `onReviewCommitted(payload)` forwards
  `emit("committed", payload)` **verbatim** (line ~290). `CharactersView.vue` line ~834:
  `<EntitySweepModal @committed="sweepOpen = false" />` (payload currently dropped).
  `EntityReviewModal` commit emits `{ added, linked }` and knows the accepted characters as
  `accepted` entries with `kind: "character"`, `entityId` (its commit fn).
- **Watchdog + pool honesty:** `services/analysis/entitySweep.js` exports
  `watchdogTimeoutMs(durations)` (max(3× rolling median, 180s); 600s baseline). The sweep's
  per-call pattern: per-call `AbortController` mirroring an outer signal + `setTimeout`.
- **Scene digest:** `services/analysis/characterAudit.js` — `buildSceneDigest(project, id)`
  is **not exported**; `composeCharacterAuditInput` is (heavy — builds full text).
- **confirmDialog idiom:** `const ok = await confirmDialog({ ... })` — object arg; existing
  usage in `EntitySweepModal.vue` line ~142 (copy its exact option keys).
- **rag-probe:** `scripts/rag-probe.mjs` line ~249 clicks
  `'.ui-modal button:has-text("to story bible")'` to commit the sweep review — the chained
  confirm dialog this plan adds appears right after that click (§6.3 fixes the probe).
- **List header buttons:** `CharactersView.vue` list mode, `PaneHeader` slot (~lines
  269–281): Entity sweep · Audit consistency · Relationship arc — ghost `size="small"`
  buttons with 13px icons. The batch button joins them.

## §2 WS-A — extract the shared field/apply layer (refactor, no behavior change)

The single modal owns field defs + apply routing; the batch modal must not duplicate them
(QC-35). Move them into **`services/analysis/characterProfile.js`**:

1. **`export function profileFieldDefs(character, extras)`** and
   **`export function voiceFieldDefs(extras)`** — EXACTLY the current arrays from
   `CharacterProfileFillModal.vue` (keys, labels, current-value getters — byte-same labels).
   Signature note: they take the raw character record + extras object (not refs).
2. **`export function emptyOnlyPicks(defs, fields)`** — the auto-apply selector:
   `defs.map(d => ({...d, proposed: proposedFor(fields, d.key)})).filter(d => d.proposed && !d.current)`
   → returns `[{ key, label, proposed }]`. Move the private `proposedFor(fields, key)`
   helper into the service too (not exported).
3. **`export function applyProfileDrafts(project, characterId, picks)`** — the current
   `apply()` routing, parameterized: `picks` = `[{ key, proposed }]`; routes
   `oneLiner`/`identity.*` → ONE batched `project.updateCharacter` (age: parseInt,
   Number.isFinite else null), everything else `<group>.<key>` → merged
   `project.setCharacterExtras` patch (spread existing group from
   `project.characterExtras?.[characterId]`, don't clobber siblings). Returns the number of
   fields written. **The single modal's `apply()` becomes a 3-liner calling this.**
4. In **`services/analysis/characterAudit.js`**: add
   **`export function characterSceneCount(project, characterId)`** — cheap count (loop
   `project.allChapters` → `project.scenesFor(ch.id)` → count scenes whose
   `scene.characters` includes the id). No text extraction. (Don't export
   buildSceneDigest; the count is all the batch modal needs.)
5. Refactor `CharacterProfileFillModal.vue` to import all of the above. Zero visual or
   behavioral change — `npm run test:unit` must stay green untouched except NEW tests:

**Tests (extend `characterProfile.test.js`):**
- `emptyOnlyPicks` never selects a field whose current is non-empty (the
  never-overwrite property), and drops empty proposals.
- `applyProfileDrafts` with a mock project object (`{ characterExtras: {…},
  updateCharacter: recorded, setCharacterExtras: recorded }`): identity keys land in ONE
  updateCharacter call with age as number; `motivation.fear`+`voice.register` merge into
  their groups without clobbering existing sibling keys; returns the written count.
- `profileFieldDefs`/`voiceFieldDefs`: current values read from the right places
  (`c.role`, `x.motivation?.fear`, `x.voice?.sample`, `x.presence?.stressTells`, age
  renders `String(c.age)` when set, "" when null).

Commit 1: `refactor(characters): shared field-defs + draft-apply layer for fill-from-book`.

## §3 WS-B — `CharacterBatchFillModal.vue` (the feature)

New file `src/renderer/src/components/CharacterBatchFillModal.vue`. RULE #1 precedents to
name in the header comment: **EntitySweepModal** (pick list + per-row progress + footer CTA
+ All/None `.tb-btn`s + watchdog pattern) and **CharacterProfileFillModal** (row shape,
grouped review, empty-only default ticks).

**Props:** `{ preCheckedIds: { type: Array, default: null } }`. Emits `close`.

### 3.1 Phases (one `phase` ref: `"pick" | "run" | "review" | "done"`)

**PICK phase:**
- Rows: every `project.characters` entry, ordered mains-first then name. Each row:
  `UiCheckbox` + name + muted role + scene-count chip (`characterSceneCount`), formatted
  `"{n} scenes"`. Characters with **0 linked scenes: checkbox disabled**, note
  `"no linked scenes"` (muted) — they cannot be selected.
- Default checks: if `preCheckedIds` prop → exactly those (that have scenes>0); else all
  **mains with scenes > 0**. All/None buttons (`.tb-btn wide`, EntitySweepModal idiom) —
  All checks every enabled row.
- **The toggle** (the user's decision — build it): a `UiCheckbox` + label row above the
  footer: label **"Apply automatically — empty fields only (skip review)"**, muted hint
  under it: **"Nothing you've written is ever overwritten. Proposals land as each character
  finishes; review mode is the default."** Default **OFF**.
- Cost line in the footer: **`{checked} selected · {checked × 2} model calls`**.
- Footer: cost line · spacer · ghost **Close** · primary **`Fill {checked} characters`**
  (disabled at 0).
- Desc paragraph at top: **"Runs the same two passes as a single character's Fill from
  book — profile, then voice — for every character you tick, one at a time. Characters
  with no linked scenes can't be drafted."**
- `AiFeatureChip feature="characterProfile"` in `#header-extra` (same as single modal).

**RUN phase (sequential — the C2 single-slot honesty, deliberately no pool):**
- For each checked character IN ORDER: status `pending → profile → voice → done | failed`.
  Row shows name + live status text (`Drafting profile…` / `Drafting voice…` /
  `"{k} fields"` on done / the error message truncated on failed).
- Each of the two calls wrapped in the sweep's per-call watchdog: a per-call
  `AbortController` mirroring the batch controller + `setTimeout(watchdogTimeoutMs(durations))`
  (import from `entitySweep.js`); push each successful call's elapsed ms onto `durations`.
- **Failures don't stop the batch**: catch per character → mark row failed, continue. A
  failed profile call skips that character's voice call (no input consistency) — the whole
  character is one failed unit, retryable.
- **Cancel** (footer ghost button): aborts the batch controller → in-flight call rejects →
  current character marked `cancelled`, remaining marked `skipped`, jump to end state.
  Distinguish batch-cancel from an external per-task cancel via a `cancelled` ref — an
  external abort of one call = that character fails, batch continues.
- **Auto-apply ON:** as each character completes, immediately
  `applyProfileDrafts(project, id, [...emptyOnlyPicks(profileFieldDefs(ch, x), r.fields),
  ...emptyOnlyPicks(voiceFieldDefs(x), v.fields)])` — read `extras` FRESH at apply time.
  Track `fieldsApplied += returned count`. Rows show `"{k} fields filled"`.
- **Auto-apply OFF:** stash per-character results `{ characterId, name, profileFields,
  voiceFields }` for review.

**REVIEW phase (auto-apply OFF only):**
- One scrollable list grouped by character: character-name header row (serif, like
  `.ra-dyn-name`), then the same row shape as the single modal (`.cpf-row`: checkbox ·
  label · current-value block when present · editable proposed `UiTextarea`), with the
  Profile/Voice `.cpf-section` subheads INSIDE each character group only when both groups
  have rows. Empty-proposal rows dropped (same as single modal). Default ticks:
  empty-current only.
- Global select bar at top: `"{ticked} of {rows} selected"` · spacer · **All** · **None**
  (ghost small). Per-character All/None: small ghost buttons on the character header row.
- Footer: ghost **Discard** · primary **`Apply {ticked} fields`** → loop characters,
  `applyProfileDrafts(project, id, tickedPicksForThatCharacter)`, then `phase = "done"`.
- "replaces what you wrote" label on rows with a current value (existing class).

**DONE phase:** summary line — auto mode:
**"Drafted {done} of {total} characters — {fieldsApplied} fields filled."**; review mode:
**"Applied {fieldsApplied} fields across {done} characters."** Plus, when failures exist:
`"{failed} failed"` + secondary **Retry failed** button → re-enters RUN with only the
failed ids (same toggle state). Footer: primary **Done** → close.

### 3.2 Component decisions locked (so you don't have to)

- **No `AiTaskStrip`** in this modal — the batch's own Cancel is THE cancel; the global AI
  panel still lists the per-call tasks (they carry labels `Profile: {name}` /
  `Voice: {name}` from the existing services — pass `task` through unchanged).
- **No "include voice" toggle** — both passes always run. One knob (auto-apply) only.
- **No server-side draft persistence** (non-goal for v1) — sequential + Retry-failed +
  empty-only re-runs cover recovery. If the user later batches 100+ characters, that's a
  follow-up (note it in IDEAS.md — already covered by this section, don't build).
- **Undo note:** each applied character = 1–2 store actions; a 40-character batch writes
  many history entries and may evict older `characters`-domain undo history
  (HISTORY_LIMIT). Accepted; durable rollback is the server autosave, not history. Put
  this sentence in the component header comment.
- **Modal shell:** `AppModal` `wide`, `eyebrow="Fill from book"`,
  `:title="'Draft many characters'"`, `:closable="phase !== 'run'"` (during RUN, Cancel is
  the exit).
- Styles: reuse `.cpf-*` classes where identical by importing nothing — copy the few
  needed rules into this component's scoped block (scoped styles don't cross components;
  keep class NAMES the same for grep-ability).

**Wire the entry point:** in `CharactersView.vue` LIST header (after "Relationship arc"):
```
<UiButton intent="ghost" size="small" @click="batchFillOpen = true"
  v-tooltip.bottom="'Draft profiles and voice for several characters at once from the scenes that feature them — review before anything saves, or opt into auto-fill of empty fields'">
  <Icon name="Book" :size="13" /> Fill from book
</UiButton>
```
Mount next to the other modals:
`<CharacterBatchFillModal v-if="batchFillOpen" :pre-checked-ids="batchFillIds" @close="batchFillOpen = false; batchFillIds = null" />`
(`batchFillOpen` ref false, `batchFillIds` ref null.)

Commit 2: `feat(characters): batch fill-from-book — checklist, sequential run, grouped
review, auto-apply-empty-only toggle`.

## §4 WS-C — chain off the sweep accept

1. **`EntityReviewModal.vue`** — in the commit fn, collect
   `const characterIds = accepted.filter(a => a.kind === "character").map(a => a.entityId);`
   and extend the emit: `emit("committed", { added, linked, characterIds })`.
2. **`EntitySweepModal.vue`** — no change (forwards payload verbatim — verified).
3. **`CharactersView.vue`** — replace `@committed="sweepOpen = false"` with a handler:
   ```js
   async function onSweepCommitted(payload) {
     sweepOpen = false (ref);
     const ids = payload?.characterIds || [];
     if (!ids.length) return;
     const ok = await confirmDialog({
       title: "Draft profiles now?",
       message: `${ids.length} character${ids.length === 1 ? "" : "s"} joined the story bible with scene links. Run Fill from book on them now (profile + voice, 2 calls each)?`,
       confirmLabel: "Draft now", cancelLabel: "Later",
     });
     if (ok) { batchFillIds.value = ids; batchFillOpen.value = true; }
   }
   ```
   **Copy the exact confirmDialog option KEY NAMES from the existing call in
   `EntitySweepModal.vue` line ~142** (don't trust the sketch above for key spelling —
   match the codebase).
   Timing note: review-commit backfills scene links BEFORE the emit, so `preCheckedIds`
   rows already have scene counts > 0. Characters accepted from reference pages only
   (0 links after WS7's exclusion) will show disabled with "no linked scenes" — correct,
   not a bug.

Commit 3 (with §5+§6): `feat(characters): sweep accept chains into batch fill + probe/docs`.

## §5 Docs (same commit 3)

- `docs/character-sheet.md`, the Fill-from-book callout: append one sentence —
  **"You can also run it for many characters at once — Fill from book on the Characters
  list — with an optional auto-apply that fills only empty fields."**
- `docs/story-bible.md` Characters section pointer paragraph: append
  **"After an entity-sweep accept, JustWrite offers to draft the new characters'
  profiles in one batch."**

## §6 Probe + gates protection (same commit 3 — DO NOT SKIP)

1. **`scripts/rag-probe.mjs`** line ~249: immediately AFTER the
   `'.ui-modal button:has-text("to story bible")'` click, the new confirm dialog appears.
   Add (catch-guarded, 2000ms timeout): click `button:has-text("Later")`. Comment it:
   `// WS-C chained batch-fill offer — decline; the probe tests the sweep, not the batch.`
   Then run the probe end-to-end — **18/18 must pass**.
2. Headless smoke after every view commit.
3. `npm run test:unit` — expect the §2 additions; nothing else moves. NO server test
   changes (zero server edits — if a pytest count fails you broke something, stop).

## §7 Verification matrix + screenshots (send to the user)

| After | Run |
|---|---|
| WS-A | vitest (new + all green) · build:vite |
| WS-B | build:vite · vitest · headless smoke · **screenshot: PICK phase** (Ninth Facet — 8 rows, mains pre-checked, scene-count chips, toggle visible, cost line) · **screenshot: DONE-with-failures state** (run with no model configured in the container: every character fails fast → rows show errors + "Retry failed" — this proves the run machinery without an LLM) |
| WS-C | rag-probe 18/18 · headless smoke · screenshot optional |
| End | `npm run test:fast` · push |

Container note: no model is configured in dev, so a real end-to-end batch (proposals +
review phase) can't run here — the review-phase UI is exercised by code + the single-modal
shared layer (already proven). State that honestly in the final report; the user validates
review mode on their box.

## §8 Commits

1. `refactor(characters): shared field-defs + draft-apply layer for fill-from-book` (§2)
2. `feat(characters): batch fill-from-book — checklist, sequential run, grouped review, auto-apply-empty-only toggle` (§3)
3. `feat(characters): sweep accept chains into batch fill + probe/docs` (§4–§6)

Push after 2 and 3. Update THIS doc's Status line to SHIPPED with the commit ids, and add
one SHIPPED line to `MORNING_RECAP.md`'s shipped list (newest-first, one bullet).

## §9 Out of scope (do NOT build)

- Parallel per-character calls (local runner is single-slot; sequential is honest).
- Server-side batch draft persistence / resume across app restarts.
- An "include voice pass" toggle, per-field model routing, or batching locations/objects.
- Any change to the `characterProfile` / `characterVoice` prompts or server code.
- Auto-apply as default — review stays the default; the toggle is opt-in each time
  (do NOT persist the toggle state to settings in v1).
