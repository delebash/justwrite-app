# Potential roadmap — research-driven candidates

A pool of feature candidates, not commitments. Distinct from [`roadmap.md`](roadmap.md) (small concrete planned items) and [`ai-features-roadmap.md`](ai-features-roadmap.md) (AI-specific items already on deck). This page is the bigger, longer-horizon "what could JustWrite become next?" backlog, generated from a multi-source research pass.

**Research date:** 2026-06-05.
**Method.** Six parallel research angles (writer pain-points, competitor roadmaps, AI fatigue/acceptance, mobile/sync/collab, genre-specific tooling, accessibility) across 2024–2026 sources — Reddit writing communities, NaNoWriMo, KBoards, Absolute Write, competitor changelogs (Scrivener, Novelcrafter, Sudowrite, Plottr, Campfire, Dabble, Atticus, World Anvil, Obsidian-for-writers, Living Writer, NovelAI), Authors Guild positions, Jane Friedman, Mythcreants, EFA, and editorial/accessibility blogs. 91 raw findings → merged, filtered against existing JustWrite surface, ranked by demand × novelty.

---

## Executive summary

JustWrite already sits in an unusually strong position — local-first by architecture, deep on Story World and AI auditing primitives, ahead of competitors on transparency (Writer Lab) and provider-agnostic AI. The highest-leverage work isn't new AI generation but three other moves:

1. **Package existing infrastructure into discoverable named features** — sprint timer over Focus Mode, read-aloud over Studio TTS, disclosure generator over Usage Ledger.
2. **Close a small number of genuine gaps that map cleanly onto existing primitives** — per-chapter POV field, setup/payoff Marker pairs, scene snapshots, beta-reader reactions round-trip.
3. **One or two genre and series bets that unlock new audiences** — genre presets, Series container across projects.

The AI-rejection signal is consistently sharp: **prose generation is the third rail**, but copy-edit, disclosure, continuity-enforcement, and read-aloud are accepted even by AI-skeptical writers.

---

## Regular features — ranked

| # | Feature | Demand | Effort | Why |
|---|---|---|---|---|
| 1 | **Genre presets** (Romance / Mystery / SFF / LitRPG / Memoir / Screenplay) — one toggle flips beat-sheet, Marker types, entity schemas, terminology, starter tag-pack | 🔥 hot | medium | Mostly a packaging layer over existing primitives. One codebase, six positioning stories. Plottr/Sudowrite/Campfire all ship per-genre. |
| 2 | **Per-chapter POV character field + POV balance view** — coloured band on Plot Board, balance bar in Analysis, leak detector | 🔥 hot | small | speakersByChapter + character-presence heatmap already exist; this is one typed field. Dabble/Plottr/Novelcrafter/Scrivener all advertise it. |
| 3 | **Beta-reader reactions round-trip** — export read-only EPUB/HTML w/ reactions overlay → reader fills in offline → drops JSON back → lands as typed Markers | 🔥 hot | medium | No account, no cloud. Defensible niche no competitor occupies. EPUB exporter is hand-rolled; Markers are already a typed-span system. |
| 4 | **Track-changes DOCX round-trip** — read incoming Word track-changes + comments as inline Markers; accept/reject in-app; export back preserving state | strong | medium | DOCX import/export already shipped. Closes the editor-handoff loop without live cloud collab. |
| 5 | **Local sprint timer + word-target loop** (ADHD/NaNoWriMo) — Pomodoro 25/5, big counter, optional break cycle, logs feed Sessions store | strong | small | Focus Mode + Sessions store are the substrate. Entire sprint-app market (4thewords, Pacemaker, myWriteClub) is cloud-only. |
| 6 | **Setup/Payoff Marker pairs** + dangling-plant dashboard | strong | small | Sharper specialisation of existing dangling-thread tracker. Doubles as Mystery preset's Clue tracker. |
| 7 | **Named scene/chapter snapshots + word-level diff** | strong | medium | Even Novelcrafter doesn't ship this (it's still in their feedback portal as unbuilt). Undo/redo infrastructure is substrate; named snapshots = tagged history entries + diff renderer. |
| 8 | **Series container** — multiple projects sharing characters/locations/lore/events with per-book overrides | 🔥 hot | **huge** | Biggest unlock for indie series romance / urban fantasy / cozy mystery. Architectural lift is real (single-project store today). Six-to-twelve-month bet. |
| 9 | **Magic System entity** (Sanderson's Three Laws as structured fields) + cost-not-paid AI audit | strong | small | Worldbuilding wiki is substrate. Cheap, high-recognition SFF marketing win. |
| 10 | **Dyslexia-friendly editor fonts** (OpenDyslexic / Atkinson Hyperlegible / Lexend) | moderate | small | Two-day job using existing font-pairing system. No competitor ships these out of the box. |
| 11 | **Ambient soundscape mixer in Focus Mode** (rain / cafe / fireplace / pen scratch) | moderate | small | Closes context-switch to Noisli/myNoise. Royalty-free loops bundled; pure Web Audio. |
| 12 | **Folders/subgroups across all Story World kinds** | strong | medium | World Anvil added universal folders Sep–Dec 2025; now baseline for 200+ entity projects. |
| 13 | **Suspect grid + alibi-contradiction audit** (Mystery preset companion) | moderate | medium | Typewriter explicitly markets this. Reuses reader-knowledge map + timelines + plot-hole audit. |
| 14 | **Per-chapter release schedule + drop calendar** (serial fiction) | moderate | small | Kindle Vella shutdown Feb 2025 left Royal Road/Wattpad/Laterpress writers shopping. Pure metadata. |
| 15 | **Sources entity + `[^cite:id]` footnotes** (memoir/nonfiction) — promote `verify` Marker to carry source/status | moderate | small | KDP/Springer publisher requirements. Light-touch — don't rebuild Zotero. |
| 16 | **Fountain (.fountain) export** of dialogue-only chapters using Studio's speaker analysis | moderate | small | LivingWriter rebuilt this as marquee June 2025. Plain-text export adapter. |
| 17 | **Free-form spatial canvas** for outlining (infinite corkboard, draggable cards, arrows) | moderate | large | Sudowrite Canvas. ADHD writers need non-linear externalisation before structure exists. |
| 18 | **Scheduled auto-export to user folder** (backup hardening) | moderate | small | Lets users opt into "sync" via their own iCloud/Dropbox/OneDrive folder without JW running a cloud. |
| 19 | **Web-companion PWA** (read + minor edit, mobile capture bucket) | strong | large | Mobile capture is the most common phone use case. Browser fallback already exists; real lift is sync via user cloud folder. |
| 20 | **Custom calendars + multi-moon timelines** (SFF) | moderate | medium | Headline SFF feature. World Anvil/LegendKeeper/Chapter all ship. |
| 21 | **EPUB validation pre-export + image alt-text fields** | moderate | small | Atticus shipped this Jun + Oct 2025. Store-acceptance compliance. |
| 22 | **LitRPG "system message" block + Stats entity + stat-continuity audit** | moderate | medium | Niche but rapidly growing; Royal Road threads explicitly asking. |

---

## AI features — ranked

| # | Feature | Demand | Effort | Why writers accept it |
|---|---|---|---|---|
| 1 | **AI Disclosure Statement generator** from Usage Ledger — Authors-Guild-aligned, KDP/Springer/Elsevier-compliant block, export as appendix | 🔥 hot | **small** | Pure structured report over existing substrate. No prose generation. Actively helps writers comply with rules every publisher now requires. **Zero competitor ships this.** |
| 2 | **Continuous fact-ledger + inline contradiction Markers** — always-on background pass; project-wide claim ledger; auto-drops "contradicts ch.3" Marker | 🔥 hot | large | #1 unmet need in AI-acceptance brief. Describes rather than generates — even skeptics want this. Local Ollama for cost-free background passes is a real moat. |
| 3 | **Editor-grade copy-edit pass** — explicitly framed as Authors-Guild-permitted, Elsevier-exempt "basic spelling/grammar" tier; accept/reject suggestions only, never bulk-applied | strong | small | ~70% of AI-using authors use it for editing. Framing is the entire value-add — labelled-safe lane converts skeptics. |
| 4 | **Deterministic pet-words / echo / said-bookism / adjective-stack report** | strong | small | No AI, no tokens, no ethics. Competitors charge subscriptions for this exact pass (PWA, AutoCrit). |
| 5 | **Read-this-aloud proofreading mode** — reuses Studio TTS at 1×/1.25×/1.5×/2× | strong | small | Reuses 90% of Studio pipeline. #1 dyslexia + ADHD use case. Accessibility-positive. |
| 6 | **AI margin notes pinned to spans** — extend Multi-reader panel to drop inline editor-style comments by edit-type (line/dev/copy/continuity) into Markers stream | strong | medium | Competitive parity with Sudowrite's headline 2025 Feedback feature. |
| 7 | **Sensitivity triage pass** — flag potential representation/stereotype concerns, **never clears** for human reader | moderate | medium | "Flag, never clear" framing is the ethical lane. EFA shows publisher requests up 60% since 2021. |
| 8 | **Show-the-thinking toggle for reasoning models** (`<think>` blocks from R1/GPT-5-thinking/Claude-thinking) | moderate | small | Novelcrafter shipped Jan 9 2026. Tiny lift; reinforces no-black-box positioning. |
| 9 | **LLM voice-gender classification** — when the deterministic inferrer (`services/voiceGender.js`: provider canon + Kokoro name pattern + first-name dictionary) returns blank, ask the active LLM `is "<voice id>" likely male / female / neutral?` with a 50-token JSON-mode reply | moderate | small | Catches the long tail the dictionary misses — fantasy/sci-fi voice names ("Vex", "Onyx-Prime", "Solar"), Kokoro-style local-server uploads with stage names, and Chatterbox folder uploads. Runs once at voice discovery, cached on the voice record so the LLM is never asked twice. Falls back to manual cycle-click if the LLM refuses. |
| 10 | **TTS preview pitch analysis for gender** — synthesize a 6-word sample (one TTS call), run `AudioContext.getChannelData` → median F0 estimate (autocorrelation); >180 Hz → female, <150 Hz → male, between → neutral | moderate | medium | The ground-truth method — measures the actual voice rather than guessing from the name. Cost: one TTS call + one decode per unknown voice. Worth doing only when (9) is unavailable or when the writer hits a "Resolve all unknowns" button in the voice library. Bundles cleanly with the existing render pipeline. |

---

## AI features to AVOID

| Feature | Why writers reject |
|---|---|
| **Voice-replicating prose generator** (Sudowrite-style "My Voice") | Crosses the third rail the June 2025 open letter (Lehane/Maguire/Groff + 1,100 sigs) and Authors Guild Human Authored cert draw at: generative prose. JW's deterministic Voice canon is the correctly-positioned half — turning it into a generator would erode local-first trust. |
| **Body-doubling / virtual coworking** | Requires accounts + live cloud presence. Breaks local-first. Deepwrk/Focusmate/Flow Club own it; audience is fine using a second app. |
| **Real-time collaborative editing with live cursors** (Reedsy Studio / Ellipsus) | Architecturally incompatible with local-first JSON projects. ~80% of actual collab need is editor/beta feedback — solve the underlying workflow (track-changes round-trip, beta reactions) instead. |
| **100k-token context-stuffing chat** (LivingWriter's pitch) | JW's Ask-the-book (BM25+vector with citations) is technically better. Building the inferior version for parity burns tokens, hurts accuracy, undermines the citation story. |
| **Always-on AI rewrites without showing context** | Loudest NovelCrafter complaint: "AI doesn't use my context, why did I bother building it?" Hiding what's sent replicates the worst failure mode. |
| **AI that "clears" sensitivity/fact-check/beta passes** (vs. flags) | Writers want triage, not clearance. Implying AI "approved" anything is a trust-killer and a liability. |

---

## Strategic bets — 4 larger directions

### Bet 1 — Position JustWrite as the disclosure-compliant, NDA-safe writing app for professionals

Two converging signals: (1) every major publisher (Elsevier, Springer, Wiley, KDP, COPE) now requires AI disclosure, and **no creative-writing app generates it for the author**; (2) ghostwriters and freelance editors are increasingly arguing that ChatGPT use breaches client NDAs, which flips JW's local-first stance from values-pitch to liability-pitch. JW already has Usage Ledger, Writer Lab, and full local-AI provider support — the substrate is built. The bet: ship the AI Disclosure Statement generator, lead marketing with "NDA-safe" rather than "private", and own the professional-writer-under-confidentiality segment that cloud-AI tools structurally cannot serve.

**Risk:** marketing-positioning bet, not just engineering. Requires sustained messaging discipline and probably a dedicated landing page. "Disclosure" framing may feel regulatory/joyless to indie/hobbyist segments — keep as one positioning lane among several.

### Bet 2 — Genre presets as a packaging-and-positioning multiplier

JW has built broad, deep primitives (Markers, beat-sheets, Story World entities, AI audits, Plot Board). Competitors win by packaging the same primitives into per-genre experiences (Sudowrite ships per-genre AI configs; Plottr ships templates by genre; Campfire ships modules). A Romance / Mystery / SFF / LitRPG / Memoir / Screenplay preset system that flips beat-sheet + Marker types + entity schemas + terminology + starter tag-pack in one click turns one codebase into six positioning stories. Lowest-marginal-cost way to expand the addressable market.

**Risk:** tempts feature sprawl if every preset accumulates its own UI affordances. Mitigation: presets ONLY recombine existing primitives; if a preset needs net-new UI surface, that's a separate ship decision.

### Bet 3 — Continuity enforcement as the headline AI feature, not generation

The AI-acceptance brief is unambiguous: prose generation is the third rail, but **continuity / consistency / story-bible enforcement is the loudest unmet ask even among AI-skeptical writers.** JW's existing character-consistency + plot-hole audits are 80% of the way there. Commit to "continuous fact-ledger + inline contradiction Markers" as a tentpole and lean into the Authors-Guild-aligned framing ("the AI describes contradictions, never rewrites"). This is where JW could leapfrog Sudowrite and NovelCrafter on the one axis writers most care about — and where the local-AI architecture (Ollama for cost-free background passes) is a real moat.

**Risk:** background passes burn local CPU/tokens; needs careful UX so it feels helpful rather than nagging. Requires investment in the fact-extraction substrate. Real engineering, not just packaging.

### Bet 4 — Series container — make JW the home for multi-book worlds

The brief consistently surfaces this as the single biggest unlock for indie series romance, urban fantasy, cozy mystery, and progression-fantasy writers — the core JW audience. Plottr markets "Series Bible" as a paid feature category; World Anvil / Campfire / Novelium all advertise it but the craft blogs still walk writers through hand-rolling because the existing implementations are shallow. JW's Story World primitives (characters with full arcs, lore wiki, event timelines, reader-knowledge map) are precisely what a good series bible needs. The bet is architectural — let multiple JW projects attach to a shared Series, with per-book overrides — and would be the most defensible feature in the category.

**Risk:** largest architectural lift on the list. The project store is single-project today (single JSON blob, single IndexedDB key). Real refactor on persistence, undo/redo scoping, and cross-project references. Six-to-twelve-month bet, not a quarter. Phasing: prototype as a read-only "linked series world" (one canonical world, projects read it) before tackling write-back.

---

## Already covered (filtered out of the candidate list)

Surfaced by research but excluded because JustWrite already ships them:

- Reverse outline view (StorySnap)
- Local-first / NDA-safe AI (Ollama/LM Studio/llama.cpp/vLLM/Claude — positioning gap, not a feature gap)
- Marketing-copy generation (Marketing pack)
- Session recaps / resume briefings as "safe AI"
- AI-tells scanner (already deterministic and shipped)
- Writer Lab prompt inspection (already a differentiator — buried, not missing)
- Opinionated-structure-without-empty-canvas-tax (this IS JustWrite's positioning)
- Plottr-style anti-AI stance (JW's opt-in local lane occupies a third lane)
- Novelcrafter generic "OpenAI Compatible" provider slot (JW already provider-agnostic)
- Novelcrafter full-page snippets (Notes + Worldbuilding wiki cover this)
- Scrivener 3.5 Apple Intelligence menu hooks (JW's local-Ollama integration is the same idea, cross-platform)
- Episode/Series structural mapping for screenwriting (Parts/Chapters/Scenes already maps; only Fountain export + relabel missing)
- Autistic-worldbuilder support (Worldbuilding wiki + Sensory pack are best-in-class — marketing gap)
- Living Writer's 100k-word AI chat (Ask-the-book BM25+vector with citations is technically better)
- Day-one new-model support (provider-agnostic client already wins this)

---

## What jumps out

- **Three small + hot wins** that should ship first: AI Disclosure Statement generator, per-chapter POV field, dyslexia fonts. All small effort, all map onto existing infrastructure, all unique positioning.
- **Two medium-effort packaging wins**: genre presets and the sprint timer. Both mostly recombine what's already there.
- **One huge architectural bet**: Series container. Defines whether JustWrite owns the indie series-fiction segment.
- **Biggest AI underleveraged asset is the Usage Ledger** — one feature (disclosure generator) away from making JW the only writing app that helps authors comply with rules every publisher now requires.
- **The hand-craft / typewriter / focus-mode trend is real and JustWrite is well-positioned for it** — Focus Mode + a sprint timer + ambient soundscape + dyslexia fonts together would land cleanly as a "writing-room" story.

---

## Source pool

Raw findings, briefs, and ~90 cited URLs across the 6 research angles are preserved at:

```
C:\Users\danel\AppData\Local\Temp\claude\E--Dev-Web-justwrite-app\0b8c616d-5e99-42ef-9c1b-cdad5c070423\tasks\w15971bzf.output
```

That file is temp-dir scoped and will be cleared at some point. If a candidate here gets promoted to a real spec, copy the relevant brief's evidence section into the feature's design notes before this file disappears.
