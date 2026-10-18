# The AI-text mark and slice 4 (scene drafting) — design and plan (2026-10-18)

The design the slice 3–4 plan owed (`2026-10-15-ai-drafting-plan-slices-3-4.md` §4, §5 question 5:
"its look; whether it survives your edits"), then slice 4's tasks. The spec is
`2026-10-11-ai-drafting-spec.md` (§1 decision 4, §6, §9.7).

**Decided** 2026-10-18 under the user's "keep going until everything is done your rec but think on
your decisions twice before doing, finish everything dont stop" — each decision below is the rec
after a second look, with what the look changed. Nothing here is NOT STANDARD.

## 1. Precedent and references

- **In this app:** the markers (`server/src/editor/markers.js`) — a TipTap mark stored inline in the
  scene's HTML (`<span data-marker-*>`), so it travels with the text through split, merge, copy and
  sync; the AI diff's `aiIns`/`aiDel` marks (`server/src/editor/aiDiff.js`) — a pending change,
  green underline / red strike; the Writing settings window (`EditorSettingsModal.vue`) — the
  editor's per-device switches ("keep the original as a strikethrough").
- **Sudowrite:** AI-generated text "is purple when first inserted as a visual indicator"; "The
  purple formatting disappears once you edit the text." Its users ask for the colour to stay through
  edits so they can see what they've reviewed (feedback.sudowrite.com "ai generated words to stay
  colored"). — *docs.sudowrite.com, Write; read 2026-10-18.*
- **iA Writer, Authorship:** "AI-generated text is shown with a colorful gradient", human text "in
  subtle tones"; shown or hidden with Show Authors (⇧⌘A); "Writer relies on you defining the
  authorship by yourself" — Mark Selection reassigns; export to Markdown, HTML, PDF and Word drops
  it. — *ia.net/writer/support/editor/authorship; read 2026-10-18.*
- **KDP** (the reason the switch is per book, spec §9.7): AI-generated content is "text, images, or
  translations created by an AI-based tool … even if you applied substantial edits afterwards";
  AI-assisted — you created the content and used AI to edit or refine it — needn't be disclosed.
  — *KDP content guidelines G200672390, read 2026-10-11 (spec §9.7).*

## 2. The mark — decisions

1. **What is marked: text the AI wrote, wherever it is accepted.** Draft from plan, Continue,
   Continue with direction…, Expand, Describe, Write dialogue…, an idea's Write this, and the
   whole-document drafts (Worldbuilding's Draft with AI, Architecture's Draft from the premise).
   Not marked: AI edits of your own words — Rewrite, Rewrite with direction…, Tighten, the line
   edits (KDP's AI-assisted) — **unless they replace text that is already marked**; then the new
   text stays marked (AI text rewritten by AI is still AI's).
   *The second look changed:* "AI-drafted text" (spec §1.4) read as slice 4's drafts only. But the
   switch exists for disclosure, and KDP counts Continue's paragraphs as AI-generated as much as a
   drafted scene; both references mark every AI insertion. Marking only drafts would leave the
   per-book record (spec §9.7) missing most of what it is for.
2. **How it looks: the ink colour, nothing else** — a violet (`--ai-text-ink`, a light and a dark
   value in `tokens.css`), in the editor only. Read mode and every export show plain text.
   *Why not a background or an underline:* the markers are a tint with a dotted underline, a
   pending change is green-underlined, spelling is a red squiggle, selection and search hits are
   tints — a coloured ink is the one channel nothing else uses (iA's choice too).
3. **It survives your edits: the AI's words stay marked; the words you type are yours.** Typing,
   an accepted spelling fix and Find & replace write unmarked text, inside a marked run too.
   Deleting AI words removes them with their mark; Enter splits a run and both halves stay marked;
   pasting or dragging AI text keeps its mark; Undo restores it. **Mark as mine** clears the mark
   from the selection, or from the whole scene when nothing is selected — your statement that
   those words are now yours.
   *The second look changed:* Sudowrite's "any edit clears it" erases the record KDP says still
   applies, and its users ask for the opposite; a mark that never changes marks your own typing as
   AI. Per word typed is the only rule that stays true both ways.
4. **Highlight AI-written text** — a switch in Writing settings, **on** by default, per device (as
   spelling and the strikethrough are). Off drops the colour; the marks stay. *The second look
   changed:* "Show AI-written text: Off" read as if the AI's text itself were hidden.
5. **The per-book record** — under AI scene drafting in Settings → Project, one line: **AI-written
   words in this book: n**, counted from the marks in the book's scenes.
6. **Storage:** `<span data-ai-text class="ai-text">` inside the scene's HTML, like the markers. A
   pending AI insertion that will carry it says so: `aiIns` gains `aiWritten`
   (`data-ai-written`); accepting turns it into the mark. The editor schema is sync's scene
   adapter's, so the mark is sync schema step 5 — with slice 4's column (§3, D1).

## 3. Slice 4 — tasks

### D1 — The switch
- `projects.ai_scene_drafting` (an added column, `BOOLEAN NOT NULL DEFAULT 0`), saved and loaded
  with the project (`book_io.js`), the store's `project.aiSceneDrafting`, set through
  `updateProjectMeta` (already in `ACTION_DOMAINS`).
- Settings → Project, after Premise: **AI scene drafting** (`UiToggle`, as Settings' Server
  switches), a one-line hint, and the record's line (§2.5).
- Sync schema 5: the column and the mark.

### D2 — Draft from plan
- Its own feature row **Scene drafting** (`sceneDrafting`; routable to a cloud model), action
  `sceneDraft` on `p_prose_voiced` (as Write dialogue and Draft from the premise), a Lab sample
  "Scene from its plan" in the composer's exact shape.
- The prompt: the prose system (voice canon + story context), "draft the scene its Summary sets out,
  from where the passage ends (or from the start when it is empty) to the scene's end".
- The input: the scene's story context (`composeSceneContext` — the Summary is in it) and the prose
  before the cursor.
- Where: the scene's AI menu, first in **From the cursor**, and a button in an empty scene — both
  only while the switch is on. Without a Summary the item is disabled and says so.
- Lands as the accept/reject diff (an insertion at the cursor), or 3 variations (Shift, or the
  global variations switch), the same as Continue. Every run is recorded in AI usage by the kit.

### D3 — The AI-text mark (§2)
- `server/src/editor/aiText.js`: the `aiText` mark, its typing rule (a ProseMirror plugin's
  `appendTransaction`), and `unsetAiText` (Mark as mine); registered in `editorSchema.js`.
- `aiDiff.js`: `aiIns.aiWritten`; `proposeReplacement`/`proposeContinuation` take `aiWritten`;
  `acceptChange` turns those insertions into the mark.
- `RichEditor.vue`: each landing passes `aiWritten` (§2.1); the colour; Highlight AI-written text;
  `markAsMine`; Read mode and exports drop the span.

### D4 — The bench leg (needs the GPU)
- `npm run eval -- --actions sceneDraft` on the local presets; read the drafts. Whether the local
  presets are recommended for it, and what the feature says when they aren't, follows from what
  they write — recorded in RESEARCH "Testing".

## 4. Standards each piece follows

| Piece | Follows |
|---|---|
| The mark | TipTap `Mark` (https://tiptap.dev/docs/editor/extensions/custom-extensions/create-new/mark), as the markers |
| The typing rule | ProseMirror `PluginSpec.appendTransaction` (https://prosemirror.net/docs/ref/#state.PluginSpec.appendTransaction); the `uiEvent` meta ProseMirror sets for paste and drop (https://prosemirror.net/docs/ref/#view.EditorView.dispatch) |
| The column and sync step | the kit's additive columns (`createTables`); just-sqlite-sync's schema rule (README "Schema changes") |
| The switch, the Writing setting | the kit's `UiToggle`, `UiSegmented` — Settings' and Writing settings' own rows |
| Draft from plan | ours: Continue's landing (`proposeContinuation`, `VariationsModal`), slice 3's `planningDraft.js` composer shape, the seeded prompt + preset + Lab sample of every feature |

## 5. Blast radius (greps, 2026-10-18)

```
# where accepted AI text lands — every caller passes aiWritten (§2.1)
src/components/RichEditor.vue:288,294      variations (replace / continue-at)
src/components/RichEditor.vue:406,442      Describe, Continue (continuation)
src/components/RichEditor.vue:495          Rewrite / Expand / Tighten (replacement)
src/components/RichEditor.vue:533          the line edits (replacement)
src/components/RichEditor.vue:1222,1260    Continue with direction… / Write dialogue… ; Rewrite with direction…
src/components/RichEditor.vue:1306         proposeDocument (Worldbuilding, Architecture)
server/src/editor/aiDiff.js:213,267        acceptChange, acceptAllChanges
# readers of scene HTML that strip AI chrome — .ai-text is not .ai-ins, so none strips it
src/services/text.js:32-33 · src/services/analysis.js:190 · src/services/rag/chunker.js:24
src/services/export/manuscript.js:62-67    the export (drops the new span too)
# the schema and sync
server/src/editor/editorSchema.js:383      AiDiff, Marker → + AiText
server/src/sync.js:43                      SYNC_SCHEMA_VERSION = 4 → 5
server/src/database/models.js:55           ADDED_COLUMNS
server/src/book_io.js:217,791              the project's fields (save, load)
# the switch and the menu
src/pages/SettingsPage.vue:764             Premise — the switch goes after it
src/pages/ChaptersPage.vue:1253,1289       From the cursor · Clean up (Mark as mine)
src/services/editorSettings.js:24          DEFAULT_EDITOR_SETTINGS (+ highlightAiText)
```

## 6. Testing

- Unit (jsdom, the real editor schema): an accepted AI-written change carries the mark; an
  AI edit of unmarked text doesn't, of marked text does; typed text inside a run is unmarked;
  paste, Enter and Undo keep it; Mark as mine clears a selection and a whole scene; Read mode's
  and the export's text carry no span; the word count of the record.
- Server: the column round trip; the sync version; the feature row, prompt, preset and Lab sample.
- Renderer: the smoke; the flows; Draft from plan driven on the scratch server with the model
  stubbed, at 1280 and 390 px, in English and Spanish.
- Real model: D4.
