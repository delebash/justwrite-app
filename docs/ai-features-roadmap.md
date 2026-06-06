# AI Features Roadmap

Research-driven catalog of AI features worth considering for JustWrite. Cross-referenced against current AI features in the app (so nothing here is a duplicate) and against the broader landscape (Sudowrite, NovelCrafter, Plottr, AutoCrit, ProWritingAid, Marlowe, Ideorix, Squibler, Campfire, Deep Realms, Inkfluence AI).

**None of these are promises.** Roadmap, not commitment.

---

## What's already shipped (skip — already covered)

For context while reading the proposals below. JustWrite already has:

- **Drafting**: Rewrite, Expand, Tighten, Continue, Describe (scene-strip AI dropdown, Writer Lab).
- **Line edits**: Show don't tell, Passive Voice, Filter Words, Dialogue Tags, Sensory Grounding, Sentence Variety, Prose Tightening — all with accept/reject diff UI.
- **Analysis**: Chapter Critique notes, Structural Analysis (tension 1–10, hookQuality 1–10, pacing, endingClass, summary).
- **Worldbuilding**: Single-chapter Entity Extraction, Whole-book Entity Sweep with review modal.
- **Brainstorming**: Name / title / free Brainstorm with "more like these" steering.
- **Search**: Full RAG (chunker, embeddings, hybrid BM25+cosine), multi-turn "Ask the book" chat with citations, background auto-rebuild.
- **Studio / audio**: Speaker detection, Smart cast, TTS render to WAV, voice/line preview.
- **AI control surface**: per-feature provider/model chip in every AI page header (click to change routing inline); global header chip + slide-in AI task panel showing every in-flight call with elapsed, first-token latency, tokens, tokens/s, live/stalling/stuck freshness indicator, expandable preview, cancel; 30-entry history with toast-on-completion. Every AI call survives navigation — close a modal mid-stream and the result still lands where it should.
- **Deterministic infrastructure (not AI but leverageable)**: markers system (Fix later, Verify, Weak prose, Loose thread, TODO, Idea), per-chapter styleMetrics (sentence length, dialogue ratio, filter words/1k, adverbs/1k, passive/1k, POV hints), session/word-count tracking, soft-delete trash, snapshot-based undo.

That stack is unusually well-positioned for the features below — many become small features because the substrate already exists.

---

## Tier 1 — Highest ROI (novel value, builds on what's already there)

### 1. Resume-from-here briefing ("Previously on your novel") — **Shipped**

**Writer problem:** "I closed the laptop two weeks ago mid-chapter. I can't remember what I was building toward, who's mad at whom, or which threads I left dangling."

**Why it's interesting:** Universally wanted, nowhere built as a first-class flow. Trivially achievable with existing infrastructure (RAG + entity store + session log + last-edit timestamps).

**Shape:** On app open (or as a Home card), generate a 150–250 word briefing: *"Last session you wrote 1,840 words finishing the rooftop scene. Elena now suspects Marcus. Open threads: the locket from Ch.3 (Loose thread marker), Sarah's missing brother, the warehouse meeting set for next chapter."*

**Composes from:** last N edits → RAG-fetch related codex entries → fold in `Loose thread` and `TODO` markers → one small LLM call → render as dismissible card.

**Shipped as:** A "Previously on your novel" card on Home, between the Resume card and the stat cards. Auto-generates on mount when there's a valid last-edited chapter and an AI provider is configured. Caches per day so same-day reloads reuse the prose. Dismiss hides for the day; Regenerate forces a refresh; the meta line jumps to the last-edited chapter. Routable as the **briefing** feature in Settings → AI. Service: `services/resumeBriefing.js`. Docs: `docs/writing.md`.

### 2. End-of-session recap with forward TODOs — **Shipped**

Sister feature to #1. When the user closes a sprint or hits a target, summarize what was written (plot events, new entities introduced, decisions made) and surface "you set up X — payoff?" Auto-creates `Loose thread` markers at the relevant positions, so the markers panel becomes a living TODO list. Pair with #1 for a session loop nobody else has.

**Shipped as:** A **Wrap up session** button on the Home "Today's session" card opens a modal that generates a 150–300 word recap of today's writing plus a structured list of open threads (verbatim snippets from today's prose). Each thread has a **Pin** button that drops a Loose-thread marker into the chapter at the exact phrase (via a new `addMarkerToSceneHtml` helper that works without an editor instance). **Pin all** marks every unmarked thread at once. Recaps persist as `project.dailyRecaps[day]` (excluded from undo) and feed into the next day's resume briefing as additional grounding — closing the loop. Routable as the **recap** feature in Settings → AI. Service: `services/sessionRecap.js`. Modal: `components/SessionRecapModal.vue`. Docs: `docs/writing.md`.

### 3. Foreshadowing / dangling-thread tracker — **Shipped**

**Writer problem:** "I planted the locket in Chapter 3 and genuinely don't remember if it ever pays off."

**Why it's interesting:** Universally wanted, no major tool surfaces it as a button. The `Loose thread` marker category already exists — this feature LLM-scans the manuscript for setup-without-payoff and proposes new `Loose thread` markers automatically. Accept/reject per finding using the existing Entity Sweep review modal pattern. Basically Entity Sweep but for narrative promises instead of nouns.

**Shipped as:** A **Find dangling threads** button on the Markers view header opens a scan modal that walks every chapter (bounded-concurrency pool) calling `extractThreads()`. Each chapter returns setups categorised as promise / object / question / ability / secret / threat / debt, with verbatim snippets and a "keyTerm" the model picks for downstream matching. A post-pass scans later chapters for each keyTerm and classifies setups as **Dangling** (key term never reappears) or **Mentioned later** (appears in N later chapters). Already-pinned setups are filtered out by comparing against existing Loose-thread / TODO markers. The review UI groups proposals by chapter with per-thread **Pin** buttons (drops a Loose-thread marker at the exact snippet via `addMarkerToSceneHtml`) and a **Pin all dangling** bulk action. Routable as the **foreshadowing** feature in Settings → AI. Services: `services/analysis/threadExtraction.js`, `services/analysis/foreshadowingScan.js`. Modal: `components/ForeshadowingScanModal.vue`. Docs: `docs/markers.md`.

### 4. Reader-knowledge vs character-knowledge tracker (dramatic-irony map) — **Shipped**

**Writer problem:** "I'm writing a mystery and I can't keep straight what the reader has figured out vs. what my protagonist knows."

**Why it's interesting:** Genuinely doesn't exist anywhere as a built tool. For mystery/thriller/suspense/unreliable-narrator writers it would be a "why didn't this exist before" moment. Per chapter, the LLM tracks two knowledge sets (reader vs POV character) and renders a timeline — green = aligned, gold = dramatic irony, red = reader confused. Differentiating and scopable.

**Shipped as:** A new top-level **Reader knowledge** view at `/reader-knowledge` (sidebar Project section, Eye icon). Sequential per-chapter LLM sweep — each call receives the accumulated reader/POV fact lists from prior chapters and returns the deltas + a status classification (aligned/dramatic-irony/reader-confused/neutral) + a rationale. Per-chapter results persist on `chapter.readerKnowledge` (mirrors `chapter.critique`). UI: coloured chapter strip, knowledge-growth chart (two cumulative lines: reader vs POV), stats row, detail panel with rationale + new-facts deltas + jump-to-chapter link. Cancellable mid-sweep — partial results stay. Routable as the **readerKnowledge** feature in Settings → AI. Service: `services/analysis/readerKnowledge.js`. View: `views/ReaderKnowledgeView.vue`. Docs: `docs/reader-knowledge.md`.

### 5. Voice-drift timeline across chapters — **Shipped**

**Writer problem:** "I drafted Ch.1 six months ago and Ch.20 last week. Has my voice drifted?"

**Why it's interesting:** `styleMetrics` already computes per-chapter sentence length, dialogue ratio, filter-words/1k, adverbs/1k, passive/1k, POV hints — all deterministic. Three steps away: (a) plot these as small sparklines per chapter; (b) flag chapters that deviate >1 stddev from baseline; (c) optional LLM diff call: *"Ch.18 voice differs from Ch.1–10: register has become more reportorial, less lyrical."* Pure analytics page, near-zero LLM cost.

**Shipped as:** A new "Voice drift" section in the Analysis dashboard, between Style & pacing and Cast presence. Pure deterministic analytics over `styleMetrics` rows: per-metric mean/stdev/z-scores, ±1 stdev band visualised, per-chapter polyline sparkline with outlier dots in red, early-vs-late-third trend chip per metric. A "Hot chapters" rollup lists chapters that outlier on two or more metrics, sorted by drift score. Each hot chapter has an **Explain** button that calls `explainVoiceDrift()` — an optional LLM call (`voiceDrift` feature pin) that compares the outlier's prose to the 3 most-typical chapters and returns 2–4 sentences naming the specific shifts, with quoted phrases from both sets. Inline-expanding result, no modal. Service: `services/analysis/voiceDrift.js`. Docs: `docs/analysis.md`.

### 6. Stuck-on-this-chapter diagnostic ("I'm blocked" menu) — **Shipped**

**Writer problem:** "I don't even know why I'm stuck. Just give me options."

**Why it's interesting:** Continue *writes* for them; this is a *diagnostic-first* flow. Small panel asks the LLM "what could unblock this scene?" with structured output — five distinct moves: change POV character's goal mid-scene · introduce an interruption · shift the setting · reveal something the POV doesn't yet know · cut to a different timeframe. Each card has a "use this" button that runs Continue with that instruction prepended.

**Shipped as:** An **Unstuck — five ways out** entry in the scene-strip AI dropdown opens a modal that sends the 1800-character prose tail before the cursor to the model. The model returns five moves, one per kind (goal-shift / interrupt / setting / reveal / timeframe), each with a label and a 1–2 sentence instruction. Each card's **Write this** button closes the modal and drives `runGuidedContinue(instruction)` on the editor — which routes through a new `writerAI.guidedContinue()` (the foundation for #7's standalone "Continue with direction") and lands as an accept/reject diff. Per-kind border colours visually distinguish the five categories. Regenerate asks for a fresh five. Services: `services/stuckDiagnostic.js`, `services/writerAI.js` (new `guidedContinue` export). Modal: `components/StuckDiagnosticModal.vue`. Editor: `runGuidedContinue` + `grabUnstuckContext` added to `RichEditor.vue`'s defineExpose. Routable as the **unstuck** feature in Settings → AI. Docs: `docs/writing.md` "Unstuck — five ways out" section.

### 7. Guided Continue (Continue + instruction) — **Shipped**

**Writer problem:** "I know roughly what happens next; I want a 200-word draft I can shape."

**Why it's interesting:** Sudowrite's most-used feature. Current Continue uses surrounding context only. Add an optional one-line instruction field (*"Elena confronts Marcus but he deflects with charm"*) and prepend to the prompt. Trivial code change, large UX delta.

**Shipped as:** A **Continue with direction…** entry in the scene-strip AI dropdown opens a one-field promptDialog. The user's instruction routes through `writerAI.guidedContinue()` (already shipped with #6 as the engine for Unstuck's Write-this buttons) and lands in the editor as an accept/reject diff. Reuses the **Writer actions** provider pin — no new feature key needed. Wired: `views/ChaptersView.vue` openGuidedContinue handler. Docs: `docs/writing.md` "Continue with direction" section.

### 8. Sensory research mode (extension of Describe) — **Shipped**

**Writer problem:** "I'm writing a Victorian tannery scene and have no clue what it smells/sounds/feels like."

**Why it's interesting:** Describe expands a noun in-prose. A sibling action — call it "Research feel" — takes the same selection but produces a *card* (smell / sound / touch / temperature / social dynamics / period-accurate detail) the writer can browse and selectively inject. Different UX surface, same LLM cost class, fills a real gap.

**Shipped as:** A **Research feel…** entry in the scene-strip AI dropdown (placed right after Describe) opens a modal that takes the selection text as the subject and returns a structured JSON pack across eight categories: smell, sound, touch, temperature, taste, movement, social, period detail. Each phrase has an Insert button that drops the phrase as plain inline text at the end of the current selection (via a new `insertSensoryPhrase` on RichEditor that handles whitespace boundaries). Multiple phrases stack cleanly. Regenerate asks for a fresh pack. Routable as the **sensory** feature in Settings → AI. Service: `services/sensoryResearch.js`. Modal: `components/SensoryResearchModal.vue`. Editor: `grabSensorySubject` + `insertSensoryPhrase` added to `RichEditor.vue`'s defineExpose. Docs: `docs/writing.md` "Research feel" section.

### 9. Story-tension timeline (visualize what's already computed) — **Shipped**

`runStructuralAnalysis` already returns `tension: 1-10` and `pacing` per chapter. One chart away from a story-shape visualization — the kind ProWritingAid and Marlowe charge for. Add a bulk "analyze all unanalyzed chapters" button and you get the arc graph for free.

**Shipped as:** A new **Story tension** section at the top of the Analysis dashboard. Reads from data already on `chapter.critique.structure`. Renders: a stats row (avg tension, avg hook, peak/lowest chapters as clickable jumps), a two-line chart (tension in solid red, hook quality in dashed gold, with gridlines at 3 and 7), and a per-chapter strip where each cell is coloured by pacing (slow/balanced/fast) and has a corner badge for ending class. Sequential bulk sweep via `services/analysis/tensionSweep.js` runs `runStructuralAnalysis` on chapters that don't have a structure yet (or all chapters with `force: true`). Cancellable mid-sweep with partial results preserved. Reuses the existing **critique** feature pin — no new feature key. Service: `services/analysis/tensionSweep.js`. Docs: `docs/analysis.md` "Story tension" section.

### 10. Character-action ↔ profile consistency audit — **Shipped**

**Writer problem:** "Did my introverted loyalty-first character betray her best friend convincingly, or did I just write what the plot needed?"

**Why it's interesting:** Retroactive audit doesn't exist in any tool. Character store has descriptions/roles; RAG retrieves scenes. Per-character pass: *"Here is the profile. Here are her scenes. Flag actions inconsistent with established psychology."* Output is evidence-cited concerns, same shape as Critique notes.

**Shipped as:** An **Audit consistency** button on the Characters view header opens a sweep modal that walks every main character sequentially. Per character, the model gets the full profile (name, role, one-liner, voice, arc, motivation, backstory, voice samples) plus a digest of every scene that features them, and returns structured concerns (severity: flag/suggest/info, chapter ref, issue, verbatim quote, reason citing the profile, cheapest fix) plus a per-character verdict (consistent / minor-drift / significant-drift). The model is instructed to be selective and honest — a consistent character returns zero concerns. Results persist on `character.audit` (mirrors the chapter.critique pattern) so re-opening the modal reads from cache. The review UI shows per-character expandable cards with chapter-jump links on each concern. Cancel mid-sweep preserves partial results. Routable as the **characterAudit** feature in Settings → AI. Service: `services/analysis/characterAudit.js`. Modal: `components/CharacterAuditModal.vue`. Project store: `setCharacterAudit / clearCharacterAudit / clearAllCharacterAudits` actions. Docs: `docs/story-bible.md` "Audit consistency" section.

---

## Tier 2 — Solid additions, somewhat more lift

### 11. Reverse-outline ("StorySnap") — **Shipped**

LLM reads finished chapters → produces an outline with act structure / beats. High value for pantsers. Reuses the structural-analysis pattern at manuscript level.

**Shipped as:** A **Reverse outline** button in the Analysis dashboard's Story tension section opens a modal that sends a chapter-by-chapter digest (titles, word counts, structural-analysis summaries when present, first-paragraph fallback otherwise, plus tension/pacing/ending metadata) in one LLM call. Returns structured outline: structure name (3-act / 5-act / loose), 2–3 sentence shape summary, plot points list (Inciting incident, Midpoint, Climax, etc. with chapter refs + descriptions), and per-chapter beats with act-break dividers. The model is told to identify the structure the book ACTUALLY does, not force a preconceived framework (that's #12's job). Persists on `project.reverseOutline` so re-opening the modal reads from cache. Routable as the **reverseOutline** feature in Settings → AI. Service: `services/analysis/reverseOutline.js`. Modal: `components/ReverseOutlineModal.vue`. Docs: `docs/analysis.md` "Reverse outline" sub-section.

### 12. Beat-sheet overlay (Save the Cat / Hero's Journey / 7-point) — **Shipped**

User picks a template; the LLM maps existing chapters to its beats, flagging missing structural elements. Pairs naturally with #11.

**Shipped as:** A **Map to beat sheet** button in the Analysis dashboard's Story tension section (next to Reverse outline) opens a modal with a framework dropdown — Save the Cat (15 beats), Hero's Journey (12 stages), or 7-Point Story Structure. The LLM gets the same chapter digest as Reverse outline plus the chosen framework's beat definitions, and returns a per-beat mapping: which chapter best fulfils each beat (with a verbatim-quote justification), or a **MISSING** badge with a reason if the book doesn't cover it. The model is told to be selective and honest — most drafts genuinely miss 1-3 beats, and a clean full-coverage map is suspicious. Top of the modal shows coverage stats ("12 / 15 beats covered · 3 missing"). Mappings persist per-template on `project.beatSheets[key]` so the writer can keep multiple frameworks mapped at once and compare. Switching the framework dropdown auto-fetches a fresh mapping if the new template isn't cached. Routable as the **beatSheet** feature in Settings → AI. Service: `services/analysis/beatSheet.js` (with `BEAT_TEMPLATES` and `TEMPLATE_OPTIONS` exports). Modal: `components/BeatSheetModal.vue`. Docs: `docs/analysis.md` "Map to beat sheet" sub-section.

### 13. Plot-hole / continuity audit — **Shipped**

Full-manuscript pass for contradictions: timeline impossibilities, eye-color drift, characters meeting people they've been described as not yet having met. RAG + entity store is the right substrate. Same accept/reject review UI as Entity Sweep.

**Shipped as:** A **Plot-hole audit** button in the Analysis dashboard's Story tension section opens a modal that runs a single LLM pass over the whole-book digest (chapter summaries from structural analysis when available, first-paragraph fallback otherwise) PLUS a ~300-word tail of each chapter's actual prose. This lets the model catch contradictions that don't show up in summaries — eye-color drift, a character being in two places, knowledge-state errors. Returns findings categorised by **kind** (contradiction / timeline / continuity / character-knowledge / object / other) and **severity** (flag / suggest / info), each with chapter refs, verbatim evidence quote, and one-line "cheapest fix" suggestion. Findings group by severity. Individual findings can be **dismissed** (persisted but hidden in default view; toggleable); the whole audit can be cleared and re-run. Persists on `project.plotHoles`. Routable as the **plotHoles** feature in Settings → AI. Service: `services/analysis/plotHoleScan.js` (with `KIND_LABELS` export). Modal: `components/PlotHoleScanModal.vue`. Project store: `setPlotHoles / clearPlotHoles / dismissPlotHole / undismissPlotHole` actions. Docs: `docs/analysis.md` "Plot-hole / continuity audit" section.

### 14. Character interview / "talk to your character" chat mode — **Shipped**

Reuse the chat panel: switch system prompt to a chosen character, retrieve scenes featuring them via RAG, let the user ask questions in-voice. A second chat mode beside "Ask the book."

**Shipped as:** A mode picker added to the ChatPanel header — **Ask the book** (the original RAG chat) or **Talk to a character** (new). In character mode a second dropdown appears for picking which character; main characters lead the list. The model gets a system prompt built from the full character profile (name, role, age, one-liner, voice/accent/vocab/tic/sample line, motivation/want/need/lie/truth, arc beginning/midpoint/end, backstory, established sample quotes). Now also includes **gender / pronouns / aliases / life status** when set (same fields appear on the character page). Same RAG retrieval against the manuscript index, with the character's name prepended to the embedding query for a soft bias toward their scenes. System prompt instructs the model to: answer in first person and in voice; only use scenes the character would actually have been present for (and acknowledge ignorance when asked about things they weren't there for); stay in character even when speculating/lying/dodging; never break the fourth wall. Each (mode, character) combo has its own persisted thread — book chat and per-character threads coexist, switching the dropdown restores wherever the writer left off. Routable as the **characterChat** feature in Settings → AI (separate from `chat` so a more conversational model can be pinned). Service: `services/rag/characterChat.js`. Wired: `components/ChatPanel.vue` mode + character picker, thread storage key now incorporates mode + character id. Docs: `docs/story-bible.md` "Talk to a character" section.

**Contextual chat entry points (follow-up).** ⌘J / the sidebar "Ask the book" toggle used to be the only way in. Now the title bar carries a permanent **Chat** icon (same toggle, always visible), and every Story-bible detail page — characters, locations, objects, groups, narrative strands, worldbuilding articles, architecture documents, and chapters — gets an **Ask the book** button in its header that opens the chat with the question prefilled about that entity ("Tell me about {name}"). Character pages get a second contextual button — **Talk to {Name}** — that opens the chat in character mode with that character already selected. The plumbing is a single `ui.openChatPanelFor({ mode, characterId?, question? })` action that stages a target on the ui store; ChatPanel watches it on open, applies the mode/character/prefill, and focuses the input. Includes a click-outside fix: the panel's outside-click listener now runs on mousedown (not click) because Reka's Select removes the dropdown synchronously on selection, which detached `target.closest()`'s ancestor chain from the DOM before the bubble-phase listener could check the exemption. Every contextual trigger button carries `data-chat-toggle` to bypass the close handler.

### 15. Match-my-style / voice fingerprint — **Shipped**

Let the user mark sample chapters as "voice canon"; on every generation, inject a 500–1000 word excerpt and a derived style descriptor. Materially improves Rewrite/Expand/Continue.

**Shipped as:** A **Voice canon** settings card in Settings → AI & Audio engines with a chapter picker (checkboxes; only chapters with >50 words are listed). Pure deterministic `services/voiceFingerprint.js` builds the injected block from selected chapters: a ~600-word excerpt drawn from the middle of each (middle slices avoid scene-setting quirks from openings), plus a measured style summary derived from `styleMetrics` (weighted-by-words averages: sentence length, paragraph length, dialogue ratio, filter words/1k, adverbs/1k, passive/1k, dominant POV). Settings panel previews both the live word count and the full injected block. The fingerprint is automatically prepended to `SYSTEM_BASE` in every `writerAI` action (`runAction` for Rewrite/Expand/Tighten/Continue/Describe, `guidedContinue`, and `applyRule` for line edits) — no LLM call needed for the fingerprint itself, just for the prose it improves. Persists on `project.voiceCanonChapterIds`. Docs: `docs/writing.md` "Match my voice — the voice canon" section.

### 16. Relationship arc tracker — **Shipped**

Per relationship pair (A↔B), LLM produces a chapter-by-chapter arc with warmth/tension/power markers. Renders as a heatmap. Nobody builds this; gold for character-driven fiction.

**Shipped as:** A **Relationship arc** button on the Characters view header opens a modal with two character pickers. JustWrite collects every chapter where both characters are linked to the same scene via the Links panel, sends profiles + shared-scene tails to the model, and gets back a chapter-by-chapter arc with three dimensions per chapter: warmth (1–10, cold↔warm), tension (1–10, calm↔taut), and power ("A"|"B"|"eq"). Plus an overall trajectory classification — warming / cooling / escalating / defusing / flipping / static — and a 2–3 sentence summary. The modal renders a trajectory chip, a two-line chart (warmth solid gold + tension dashed red), and a three-row heatmap strip (warmth / tension / power) with per-chapter cells coloured on those scales. Click any cell to surface the model's one-sentence moment for that chapter. Surfaces a clear error if the two characters share no scenes (the Links panel is the source of truth). Persists per-pair on `project.relationshipArcs[pairKey]` keyed by sorted character ids, so multiple tracked pairs coexist. Routable as the **relationshipArc** feature in Settings → AI. Service: `services/analysis/relationshipArc.js` (with `pairKey` and `TRAJECTORY_LABELS` exports). Modal: `components/RelationshipArcModal.vue`. Project store: `setRelationshipArc / clearRelationshipArc / clearAllRelationshipArcs`. Docs: `docs/story-bible.md` "Relationship arc" section.

### 17. Three-alternative streaming (variations) — **Shipped**

Writer actions currently stream one result. Add an opt-in "show 3" mode (parallel generations, varied temperature). Writers underuse this but it changes draft quality once the habit forms.

**Shipped as:** Opt-in by default with two surfaces, exactly as specified:

1. **Settings → AI → "Show 3 variations on every AI action"** — global toggle, off by default. When on, every Rewrite / Expand / Tighten / Continue / Describe / line edit / guided continue routes through `VariationsModal` instead of streaming inline. The toggle is persisted on `ui.showVariations`.
2. **Shift-click** on any scene-strip AI dropdown item forces variations for that one call regardless of the toggle. `ChaptersView.callAi` and `callProse` now accept the click event and forward `shiftKey` through to `runWriterAction` / `runProsePass`.

Cost story preserved: identical to today by default; triple only on explicit opt-in. The `runAiStream` usage ledger records all three streams independently so cost surfaces honestly in Settings → AI Usage.

**Shape (shipped):**
  - `services/writerAI.js`: `runAction`, `guidedContinue`, and `applyRule` now accept an optional `temperature` param (defaults preserved at 0.7 / 0.7 / 0.6 respectively). A `VARIATION_TEMPERATURES = [0.55, 0.7, 0.95]` constant is exported.
  - `components/VariationsModal.vue` — generic three-column streaming UI parameterised by a `runner(temperature, signal, onDelta)` function the caller closes over. Each column has its own `useAiProgress` instance, live `<pre>`-style preview, error state, retry/re-stream button, and "Use this" action. Closing the modal cancels every in-flight stream.
  - `components/RichEditor.vue`: a `startVariations({ runnerFactory, mode, from, to, originalHtml, eyebrow, label })` helper captures the LLM call shape + target range, sets `variationsFlow` ref to mount the modal, and threads the chosen result back into the existing `proposeReplacement` / `proposeContinuation` machinery on the `useVariation` emission. `runWriterAction`, `runProsePass`, and `runGuidedContinue` all branch through this when `shouldUseVariations(opts.shiftKey)` returns true.
  - `stores/ui.js`: `showVariations: false` state + `setShowVariations` action + persistence.
  - `views/SettingsView.vue`: new "Three-alternative streaming" card under the AI section with writer-problem framing, the toggle, and explicit note that shift-click is always available.

Closes Tier 2 — 12 of 12 entries Shipped.

### 18. Brainstorm-next-beats (plot-level) — **Shipped**

Current Brainstorm does names/titles. Sibling mode: given the last scene + summary, return 8–12 ranked plot beats. Reuses the same UI shell, different prompt.

**Shipped as:** A **Next plot beats** category in the Brainstorm view. Plot-level items use a different length contract (12–25 word sentences, not 6-word phrases) and mix close-to-obvious moves with wilder ones. Reuses the existing Brainstorm UI shell, seed-prompt flow, like/thumbs-up gating, and "more like these" continuation. Routes through the existing `brainstorm` feature pin. Docs: `docs/brainstorm.md` categories table.

### 19. Twist generator — **Shipped**

Cheap, fun, surprisingly generative. Same UI shell as Brainstorm.

**Shipped as:** A **Plot twists** category in the Brainstorm view, sibling to Next plot beats. Same length contract (full-sentence ideas). The model is instructed to mix plausible twists with wild ones so even rejected options often reveal moves the writer didn't see. Routes through the existing `brainstorm` feature pin. Docs: `docs/brainstorm.md` categories table + closing paragraph noting plot-level categories differ from naming ones.

### 20. AI-tell phrase scanner — **Shipped**

Ideorix claims 1,212 blocked phrases ("her eyes twinkled", "couldn't help but", "testament to"). Ship as deterministic post-pass on AI-generated diffs *before* presenting them, plus a manuscript-wide "find AI-tells" report. Reuses the Critique UI.

**Shipped as:** A **Find AI tells** button on the Markers view header opens a modal that runs a pure-deterministic regex scan across every chapter — no LLM call. Hand-curated phrase library in `services/analysis/aiTellScanner.js` groups matches into five kinds: stock catalog phrases ("delved into", "tapestry of", "testament to"), body-language clichés ("eyes sparkled", "stomach churned"), hedges ("couldn't help but", "in a sense"), AI cadence signatures ("not only X, but Y"), and out-of-genre register ("ultimately", "in conclusion"). The modal shows per-finding: phrase, surrounding sentence with the match highlighted, why-this-is-suspicious blurb, kind chip, and chapter+scene jump. Filter chips at the top toggle kinds; Re-scan reruns the pass. Pre-pass on AI-generated diffs is left for a follow-up (the manuscript-wide report is the core value). No feature pin needed (no LLM call). Service: `services/analysis/aiTellScanner.js` (with `TELL_KINDS` export). Modal: `components/AiTellScanModal.vue`. Docs: `docs/markers.md` "Find AI tells" section.

### 21. Blurb / logline / synopsis generation (Shrink Ray equivalent) — **Shipped**

Post-draft marketing pack. LLM compresses the manuscript via RAG into a logline, back-cover blurb (3 variants), one-page synopsis, 3-paragraph elevator pitch.

**Shipped as:** A **Marketing pack** button on the Analysis dashboard's Story tension section opens a modal that runs one LLM call over the same chapter digest the other structural modals use (Reverse outline / Beat sheet / Plot-hole audit). Returns four artifacts: logline (one sentence, 15–30 words), three back-cover blurbs at distinct angles (hook-driven / character-driven / premise-driven, ~150 words each), one-page synopsis (~600 words, includes the ending — agents need it for query packages), and three-paragraph elevator pitch (~250 words). System prompt explicitly bans AI-tell phrases (delved into, tapestry of, in a world where, testament to). Each artifact has a Copy button with toast confirmation. Persists on `project.marketingPack` so re-opening reads from cache. Routable as the **marketingPack** feature in Settings → AI. Service: `services/analysis/marketingPack.js`. Modal: `components/MarketingPackModal.vue`. Project store: `setMarketingPack / clearMarketingPack`. Docs: `docs/analysis.md` "Marketing pack" sub-section.

### 22. Comp-titles suggester — **Shipped**

"Readers who liked X" with rationale. Pair with the blurb generator. Mind the hallucination risk — surface confidence and prompt the user to verify.

**Shipped as:** A **Comp titles** section *inside* the existing Marketing pack modal (#21) — same LLM call returns 3–6 comps as a new `comps` array. Each comp has title, author, year, a one-sentence rationale naming the specific craft connection (structure / voice / register / subgenre / archetype, not generic resemblance), and a `confidence` label (high / medium / low) that's the model's own self-assessment of whether the title-and-author combination is real. Modal renders the comps with the confidence label colour-coding the left border (high green, medium gold, low red) and a prominent red verification warning above the list reminding the writer that models confidently invent titles. Prompt explicitly instructs the model to: prefer comps published in the last 5 years; favour mid-list and well-regarded over bestseller comps; tie each rationale to a specific craft element; flag low confidence honestly rather than guess. Includes a Copy-as-list button that formats comps as a query-letter-ready bullet list. No new feature pin (rides on the existing `marketingPack` pin and cache). Service: `services/analysis/marketingPack.js` (extended). Modal: `components/MarketingPackModal.vue` (extended). Docs: `docs/analysis.md` Marketing pack section extended.

---

## Tier 3 — Niche / experimental

### 23. "What-if" branch exploration — **Won't ship**

At any point, generate a parallel timeline (*"what if Elena DIDN'T forgive him?"*) as a side document. Helps writers test consequences without committing. Could store as a branch-chapter in soft-storage.

**Decision:** Won't ship. Requires a whole branching-storage data model — branches, comparison view, orphan cleanup — disproportionate to the use case. Writers who want this fork by copying into Notes and writing alternatives manually. Revisit if multiple users specifically request.

### 24. Magic-system / world-rule auditor — **Shipped as extension to #13**

Add a "world rules" entity type; LLM audits scenes for violations. High value for SFF.

**Shipped as:** Extension to the **Plot-hole audit** (#13) rather than a separate surface — see commit `097f837`. The Plot-hole audit modal now has a collapsible **"World rules to enforce"** textarea where the writer types free-text in-world constraints (magic-system rules, hard SF physics, technology limits, social structures). When non-empty, the rules are appended to the audit's system prompt and the model checks each chapter against them in the same pass, flagging violations as continuity issues with the specific rule named in the `reason` field. If the prose **earns the exception** (a cost paid, a workaround stated, a bypass shown), it's not flagged. Empty rules = audit runs identically to today. Rules persist on `project.worldRules`. Docs: `docs/analysis.md` Plot-hole audit section.

### 25. Sprint coach with story awareness — **Won't ship**

Wraps existing session tracking. Mid-sprint, watches recent prose and offers micro-nudges based on what's been written this session.

**Decision:** Won't ship. Live-AI-while-writing is a UX bet most apps lose — interruption mid-sprint is counterproductive even when the interruption is smart. The Resume briefing (#1) and Session recap (#2) already cover the bookending parts of a session loop; the writing-itself part stays distraction-free.

### 26. Multi-reader-panel critique — **Shipped**

Run Chapter Critique 3–5 times with different personas (genre-savvy SFF reader / literary critic / first-time reader / agent intern / book club member). Synthesize. Ideorix-style.

**Shipped as:** A **Multi-reader panel** button in the chapter editor's chapter toolbar (next to Critique) opens a modal where four LLM calls fire in parallel — one per persona: **genre-savvy reader** (encountering cold, reading for genre delivery), **literary critic** (prose craft / voice / image), **agent's intern** (hook / comp / marketability), **book-club reader** (character / emotional truth / discussion potential). Each persona has a distinct system-prompt body and returns 2–3 paragraphs of first-person reaction plus 1–3 short concrete suggestions. The modal renders four columns side-by-side, each with a coloured left border distinguishing the persona. The model is told to stay in lane so the columns read as four perspectives rather than four variants of the same bias. Persists per-chapter on `chapter.multiReader`. Routable as the **multiReader** feature in Settings → AI. Service: `services/analysis/multiReaderCritique.js` (with `PERSONAS` export). Modal: `components/MultiReaderPanelModal.vue`. Project store: `setChapterMultiReader / clearChapterMultiReader`. Docs: `docs/writing.md` "Multi-reader panel" section.

### 27. Period/historical accuracy spot-checker — **Won't ship**

Highlight selection → "would this be plausible in [period]?" High hallucination risk — surface as questions, not assertions.

**Decision:** Won't ship. Models are confidently wrong about historical detail in ways worse than no check. A writer trusting a hallucinated date or fact is in worse shape than one doing real research. Anyone writing serious historical fiction has dedicated research tools and primary sources; nobody else needs this.

### 28. Screenplay ↔ novel conversion — **Won't ship**

Niche but high-value for screenwriters crossing to fiction. Probably out-of-scope unless a screenplay format already exists.

**Decision:** Won't ship. JustWrite doesn't have a screenplay format, and adding one for the sake of conversion would be format-conversion-as-feature — a different tool category. Final Draft and similar exist for screenwriters; the conversion workflow is a vanishingly small audience.

### 29. Glossary-aware translation — **Won't ship**

If a translation flow is ever added, do it right: locked codex terms, character name preservation, voice preservation per language. Lexilit is the current best implementation to study.

**Decision:** Won't ship. Translation is a specialised, saturated category. Lexilit is the current best-in-class; users who want translation get more value from running their exported manuscript through it than from a half-built translation layer in JustWrite.

---

## Probably NOT worth adding

- **Infinite spatial Canvas (Sudowrite-style):** Big UX investment, reinventing FigJam. Multi-year bet, not a feature.
- **Real-time Hemingway-style highlighting:** Existing deterministic styleMetrics covers this; always-on inline highlights distract during drafting and conflict with the AI-diff UX.
- **Yet another grammar/copyedit pass:** Grammarly and ProWritingAid have eaten this category. Don't compete on commodity line editing — the line-edit system already does the literary stuff better suited to fiction.
- **Generic readability scoring (Flesch-Kincaid):** Penalizes literary prose. Adds noise, not signal.
- **Beta-reader simulator as a one-shot review:** Tends toward diplomatic mush in practice. The reader-knowledge tracker (#4) is the better version of "reader perspective."

---

## If forced to pick three to ship first

Maximum "writer says wow" per unit of engineering:

1. **Resume-from-here briefing (#1)** — universally wanted, nowhere built, infrastructure makes it small.
2. **Foreshadowing / dangling-thread tracker (#3)** — markers + Entity Sweep modal pattern + one new prompt; transforms revision.
3. **Reader-knowledge tracker (#4)** — genuinely differentiating; nobody else has it; thriller/mystery writers would adopt JustWrite specifically for this.

**Honorable mentions:** #5 (voice-drift timeline) and #9 (tension visualization) — both chart-only, the data is already computed.

---

## Sources

Catalog drawn from research across Sudowrite, NovelCrafter, Plottr (StorySnap), AutoCrit, ProWritingAid (Virtual Beta Reader, Pacing Report, Sentence Length graph), Authors A.I. Marlowe, Fictionary StoryTeller, Ideorix, Deep Realms, Squibler, Campfire, Inkfluence AI, Laterpress, Lexilit, Hemingway Editor, Reedsy Studio, and Future Fiction Academy. Cross-referenced against the JustWrite codebase as of 2026-06-05.
