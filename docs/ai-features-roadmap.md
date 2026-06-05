# AI Features Roadmap

Research-driven catalog of AI features worth considering for JustWrite. Cross-referenced against current AI features in the app (so nothing here is a duplicate) and against the broader landscape (Sudowrite, NovelCrafter, Plottr, AutoCrit, ProWritingAid, Marlowe, Ideorix, Squibler, Campfire, Deep Realms, Inkfluence AI).

**None of these are promises.** Roadmap, not commitment.

---

## What's already shipped (skip — already covered)

For context while reading the proposals below. JustWrite already has:

- **Drafting**: Rewrite, Expand, Tighten, Continue, Describe (bubble menu, scene-strip AI dropdown, Writer Lab).
- **Line edits**: Show don't tell, Passive Voice, Filter Words, Dialogue Tags, Sensory Grounding, Sentence Variety, Prose Tightening — all with accept/reject diff UI.
- **Analysis**: Chapter Critique notes, Structural Analysis (tension 1–10, hookQuality 1–10, pacing, endingClass, summary).
- **Worldbuilding**: Single-chapter Entity Extraction, Whole-book Entity Sweep with review modal.
- **Brainstorming**: Name / title / free Brainstorm with "more like these" steering.
- **Search**: Full RAG (chunker, embeddings, hybrid BM25+cosine), multi-turn "Ask the book" chat with citations, background auto-rebuild.
- **Studio / audio**: Speaker detection, Smart cast, TTS render to WAV, voice/line preview.
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

### 11. Reverse-outline ("StorySnap")
LLM reads finished chapters → produces an outline with act structure / beats. High value for pantsers. Reuses the structural-analysis pattern at manuscript level.

### 12. Beat-sheet overlay (Save the Cat / Hero's Journey / 7-point)
User picks a template; the LLM maps existing chapters to its beats, flagging missing structural elements. Pairs naturally with #11.

### 13. Plot-hole / continuity audit
Full-manuscript pass for contradictions: timeline impossibilities, eye-color drift, characters meeting people they've been described as not yet having met. RAG + entity store is the right substrate. Same accept/reject review UI as Entity Sweep.

### 14. Character interview / "talk to your character" chat mode
Reuse the chat panel: switch system prompt to a chosen character, retrieve scenes featuring them via RAG, let the user ask questions in-voice. A second chat mode beside "Ask the book."

### 15. Match-my-style / voice fingerprint
Let the user mark sample chapters as "voice canon"; on every generation, inject a 500–1000 word excerpt and a derived style descriptor. Materially improves Rewrite/Expand/Continue.

### 16. Relationship arc tracker
Per relationship pair (A↔B), LLM produces a chapter-by-chapter arc with warmth/tension/power markers. Renders as a heatmap. Nobody builds this; gold for character-driven fiction.

### 17. Three-alternative streaming (variations)
Writer actions currently stream one result. Add an opt-in "show 3" mode (parallel generations, varied temperature). Writers underuse this but it changes draft quality once the habit forms.

### 18. Brainstorm-next-beats (plot-level)
Current Brainstorm does names/titles. Sibling mode: given the last scene + summary, return 8–12 ranked plot beats. Reuses the same UI shell, different prompt.

### 19. Twist generator
Cheap, fun, surprisingly generative. Same UI shell as Brainstorm.

### 20. AI-tell phrase scanner
Ideorix claims 1,212 blocked phrases ("her eyes twinkled", "couldn't help but", "testament to"). Ship as deterministic post-pass on AI-generated diffs *before* presenting them, plus a manuscript-wide "find AI-tells" report. Reuses the Critique UI.

### 21. Blurb / logline / synopsis generation (Shrink Ray equivalent)
Post-draft marketing pack. LLM compresses the manuscript via RAG into a logline, back-cover blurb (3 variants), one-page synopsis, 3-paragraph elevator pitch.

### 22. Comp-titles suggester
"Readers who liked X" with rationale. Pair with the blurb generator. Mind the hallucination risk — surface confidence and prompt the user to verify.

---

## Tier 3 — Niche / experimental

### 23. "What-if" branch exploration
At any point, generate a parallel timeline (*"what if Elena DIDN'T forgive him?"*) as a side document. Helps writers test consequences without committing. Could store as a branch-chapter in soft-storage.

### 24. Magic-system / world-rule auditor
Add a "world rules" entity type; LLM audits scenes for violations. High value for SFF.

### 25. Sprint coach with story awareness
Wraps existing session tracking. Mid-sprint, watches recent prose and offers micro-nudges based on what's been written this session.

### 26. Multi-reader-panel critique
Run Chapter Critique 3–5 times with different personas (genre-savvy SFF reader / literary critic / first-time reader / agent intern / book club member). Synthesize. Ideorix-style.

### 27. Period/historical accuracy spot-checker
Highlight selection → "would this be plausible in [period]?" High hallucination risk — surface as questions, not assertions.

### 28. Screenplay ↔ novel conversion
Niche but high-value for screenwriters crossing to fiction. Probably out-of-scope unless a screenplay format already exists.

### 29. Glossary-aware translation
If a translation flow is ever added, do it right: locked codex terms, character name preservation, voice preservation per language. Lexilit is the current best implementation to study.

---

## Probably NOT worth adding

- **Infinite spatial Canvas (Sudowrite-style):** Big UX investment, reinventing FigJam. Multi-year bet, not a feature.
- **Real-time Hemingway-style highlighting:** Existing deterministic styleMetrics covers this; always-on inline highlights distract during drafting and conflict with the AI-diff UX.
- **Yet another grammar/copyedit pass:** Grammarly and ProWritingAid have eaten this category. Don't compete on commodity line editing — the prose-pass system already does the literary stuff better suited to fiction.
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
