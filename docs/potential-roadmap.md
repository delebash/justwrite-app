# Potential roadmap — research-driven candidates

> **⚠️ Historical note (2026-06-18):** JustWrite is now writing-only. The TTS / Audio Studio / audiobook material below (TTS provider candidates, voicebox, sherpa-onnx, "build our own TTS server", one-engine-at-a-time, etc.) is obsolete for JustWrite — voice production moved to the separate **JustVoice** app. It's kept as a research record; treat any audio / TTS item as out of scope for JustWrite.

A pool of feature candidates, not commitments. Distinct from [`roadmap.md`](roadmap.md) (small concrete planned items) and [`ai-features-roadmap.md`](ai-features-roadmap.md) (AI-specific items already on deck). This page is the bigger, longer-horizon "what could JustWrite become next?" backlog, generated from a multi-source research pass.

**Research date:** 2026-06-05.
**Method.** Six parallel research angles (writer pain-points, competitor roadmaps, AI fatigue/acceptance, mobile/sync/collab, genre-specific tooling, accessibility) across 2024–2026 sources — Reddit writing communities, NaNoWriMo, KBoards, Absolute Write, competitor changelogs (Scrivener, Novelcrafter, Sudowrite, Plottr, Campfire, Dabble, Atticus, World Anvil, Obsidian-for-writers, Living Writer, NovelAI), Authors Guild positions, Jane Friedman, Mythcreants, EFA, and editorial/accessibility blogs. 91 raw findings → merged, filtered against existing JustWrite surface, ranked by demand × novelty.

---

## Executive summary

JustWrite already sits in an unusually strong position — local-first by architecture, deep on Story World and AI auditing primitives, ahead of competitors on transparency (Writer Lab) and provider-agnostic AI. The highest-leverage work isn't new AI generation but three other moves:

1. **Package existing infrastructure into discoverable named features** — sprint timer over Focus Mode, read-aloud over Audio Studio TTS, disclosure generator over Usage Ledger.
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
| 16 | **Fountain (.fountain) export** of dialogue-only chapters using Audio Studio's speaker analysis | moderate | small | LivingWriter rebuilt this as marquee June 2025. Plain-text export adapter. |
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
| 5 | **Read-this-aloud proofreading mode** — reuses Audio Studio TTS at 1×/1.25×/1.5×/2× | strong | small | Reuses 90% of Audio Studio pipeline. #1 dyslexia + ADHD use case. Accessibility-positive. |
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

## TTS provider additions (2026-06-06)

Audio Studio research pass. JustWrite already supports OpenAI TTS, Speechmatics, Kokoro, Chatterbox, Dia, and Edge TTS. The following are concrete candidates to add as built-in providers, ordered by ship priority.

| # | Provider | Tier | Ready? | Why |
|---|---|---|---|---|
| 1 | **ElevenLabs** (cloud paid) | Premium | yes | The market reference for audiobook TTS. v3 inline audio tags (`[whispering]`, `[laughs]`, `[sad]`), 10k+ voice library, Professional Voice Clone (PVC) for self-narration, multi-speaker single-pass. Studio (their hosted UI) and API are billed at the **same credit rate** (1 char = 1 credit on v3/Multilingual v2; 0.5 on Flash/Turbo) — no need to redirect writers off-app. Seed Flash v2.5 as default (half cost, same voice library), let users opt up to v3 for final renders. Not OpenAI-compatible natively — needs dedicated `ElevenLabsClient`. |
| 2 | **Qwen3-TTS** (local, Apache 2.0) | Best-balance local | yes | Best published English WER (0.77%) of any open model, RTF 0.87 (faster than realtime), 3-second voice cloning (lowest reference requirement in the field). [groxaxo/Qwen3-TTS-Openai-Fastapi](https://github.com/groxaxo/Qwen3-TTS-Openai-Fastapi) is 198 stars, active March 2026, full `/v1/audio/speech` + `/v1/audio/voices` + streaming + Docker (NVIDIA / ROCm / vLLM-Omni / CPU). Wire to `localhost:8005/v1` by convention; ttsModel `Qwen3-TTS-1.7B` for quality, `Qwen3-TTS-0.6B` for speed. Lowest-friction local addition possible. |
| 3 | **Speechify SIMBA 3.0** (cloud paid) | Value | yes | $10/M chars flat (~$6 for a 100k-word novel). Ranked #7 of 76 on the Artificial Analysis TTS leaderboard May 2026 — above ElevenLabs, OpenAI, Google, Microsoft on ELO. Includes zero-shot voice cloning, SSML, emotional controls, confirmed commercial rights. Best $/quality in the paid market. Proprietary REST API, not OpenAI-compatible — dedicated client. |
| 4 | **CosyVoice 3** (local, Apache 2.0) | Style-prompt local | conditional | 0.5B model (~4GB VRAM), natural-language style prompts via the "instruct" mode (`<sad>` / `<angry>` tags + free-text style direction). [neosun100/cosyvoice-docker](https://github.com/neosun100/cosyvoice-docker) supports v3 with `/v1/audio/speech`. Two caveats: (a) `/v1/audio/voices` response shape is non-OpenAI (returns custom voice IDs); JustWrite needs a small adapter in `openai-compat.js` (mirror the existing `isDia()` / `isSpeechmatics()` special-cases). (b) Docker push went stale 6 months ago — single-maintainer risk. Worth shipping but second-tier. Note: "CosyVoice 3.5 / FreeStyle" is not a public release as of June 2026 — couldn't verify it exists outside marketing copy. |

### Deferred / explicitly skipping

| Provider | Verdict | Reason |
|---|---|---|
| **Fish Speech S2 Pro** | skip | #1 open on TTS Arena (ELO 1128), 15k inline tags — but **non-commercial open license**; commercial use needs Fish's paid agreement. Collides with the writer-publishes-an-audiobook use case. Adding it would mislead users about what they can ship. |
| **Higgs Audio v3** (4B, Boson AI) | defer | Released June 2026 — too new. Official SGLang-Omni serving is research-shaped; no community Docker wrapper for v3 (only v2.5); no `/v1/audio/voices` documented; non-commercial license. Boson overwrote HF repo contents in April 2026 (issue #179) — reliability flag. Revisit in 2-3 months. |
| **Moss-TTS v1.5** (8B, Apache 2.0) | defer | Only model documenting 1-hour stable single-pass generation. Apache 2.0. Community OpenAI wrapper exists. 12-16GB VRAM. Worth a future ticket for power-user "render a whole chapter without segment stitching." |
| **Orpheus TTS 3B** (Apache 2.0) | defer | Dedicated paralinguistic tokens (`<laugh>`, `<sigh>`, `<gasp>`, `<chuckle>`, `<groan>`, `<sniffle>`) trained into the base — cleaner than Chatterbox's retrofit. English-only base. Worth a future ticket for users specifically wanting Apache-licensed English narrator. |
| **Zyphra Zonos** | skip | TTS Arena ELO 1000, no version bump in 16 months, RTF 2× (slower than realtime). Numeric emotion knobs are powerful but UX is awkward and the long-form story isn't documented. |
| **Parler-TTS** | skip | No checkpoint shipped in 22 months. No voice cloning — only 34 trained speakers + text-description approximation. Non-deterministic across runs. Multi-character audiobook impossible. |
| **Cartesia Sonic 3.5** | skip | Real-time leader (82ms latency) — meaningless for offline audiobook rendering. Quality not ahead of ElevenLabs at long-form. |
| **WellSaid Labs** | skip | English-only, no voice cloning below Enterprise. Outclassed by ElevenLabs for fiction. |

### Companion documentation work

When ElevenLabs ships, update `docs/audio-studio.md` and `docs/ai-providers.md` to:

1. Recommend ElevenLabs API over Studio (cost is identical, JustWrite integration is better).
2. Document the **AI-narration distribution path**: ACX/Audible bans AI narration, but **INaudio** (formerly Findaway Voices, Spotify-owned since 2025) explicitly accepts AI-narrated audiobooks with disclosure and pushes to 40+ retailers. Apple Books / Google Play auto-narrate are distribution layers, not production tools (no preview, no file export, 6-month Apple lock-in).
3. Reference the Authors-Guild-aligned disclosure framing — fits the existing AI Disclosure Statement Generator bet in this same roadmap.

### Investigated and rejected as a "unified install" path: SGLang / SGLang-Omni

Investigated 2026-06-06 as a potential single-stack replacement for the per-model Python server install pain. **Not the win it appears.** Keep recommending Ollama (LLM) + dedicated TTS wrappers per provider.

- **SGLang** (github.com/sgl-project/sglang) is a top-tier OpenAI-compatible LLM server (Llama / Qwen / DeepSeek / Mistral / GLM, often faster than vLLM), but each invocation serves one model only — no equivalent of Ollama's auto-load-on-request. Source install, CUDA 13, Linux-leaning.
- **SGLang-Omni** (sister project) is currently a **Higgs Audio v3 serving project** that lists Qwen3-TTS / Fish S2-Pro / MOSS-TTS / Voxtral in its model table but has no cookbook docs for them (Issue #201). Does NOT support Kokoro, Chatterbox, Dia, CosyVoice 3, F5-TTS, Orpheus, or any other model JustWrite users currently install. Same one-model-per-process limit. No PyPI; v1.2 blocked. `/v1/audio/voices` not confirmed.
- A writer wanting Qwen-14B chat + Higgs Audio + Qwen3-TTS would need **three concurrent processes on three ports** under the SGLang stack vs. one Ollama daemon + two Docker containers under the current path. The unified stack is heavier than the per-model approach for typical JustWrite installs.

**Where SGLang-Omni IS right:** the serving path for **Higgs Audio v3 specifically**. If/when Higgs v3 ships as a provider (deferred per the table above), the install docs should route through SGLang-Omni — Boson AI's own serving docs do.

**Watch but don't adopt yet:** **vLLM-Omni** has a broader TTS matrix (includes CosyVoice 3, has `/v1/audio/voices`, batch + WebSocket streaming) and is the stronger candidate for a future "multi-model TTS substrate" story if it stabilizes. **vox-box** (gpustack) is the Windows-friendly multi-backend option — stable PyPI, includes CosyVoice + Dia + Bark + Whisper, but no Higgs/Qwen3-TTS/Fish.

### Investigated 2026-06-06: vLLM-Omni + vox-box don't solve the problem either

Re-investigated as candidates for a "one server, many TTS models" substrate. **Neither works.** Both have the same one-model-per-process limit as SGLang-Omni, and the model coverage gaps are dealbreakers.

- **vLLM-Omni**: Qwen3-TTS, CosyVoice 3, Fish S2, Voxtral, GLM-TTS, MOSS-TTS-Nano, OmniVoice. **Does not support Kokoro / Chatterbox / Dia / Bark / Higgs / Orpheus / F5-TTS / XTTS.** Chatterbox + MOSS-TTS are Q2 2026 roadmap items. **Linux only** — no Windows or macOS. Adopting it would add a 7th server stack, not consolidate the existing 4.
- **vox-box**: Bark + CosyVoice 1/2 + Dia 1.6B. **No Kokoro, no Chatterbox, no Qwen3-TTS, no CosyVoice 3.** TTS works on Linux + macOS only — Windows gets ASR only. **Last release Dec 2024 — 6+ months silent.** CosyVoice voice cloning has been open as a feature request for over a year, still not shipped.

**Verdict: stick with per-model containers.** The consolidation layer that actually works is **inside JustWrite** — the existing `OpenAICompatClient` + provider picker. No external "multi-model TTS server" project has cracked this in June 2026.

### Real install-pain mitigation candidates (better than chasing a unified server)

If the goal is reducing TTS install friction for non-technical writers, the practical paths:

1. **Ship a `docker-compose.yml` template** in `docs/ai-providers.md` that brings up the user's chosen subset of Kokoro / Chatterbox / Dia / Qwen3-TTS on conventional ports via Compose `profiles:` — `docker compose --profile chatterbox --profile qwen3 up`. Single best UX win for any writer who already has Docker Desktop. Small effort. Also document the `%USERPROFILE%\.wslconfig` cap (`memory=8GB autoMemoryReclaim=gradual`) so Windows users aren't surprised by the WSL2 VM idle cost.
2. **Detect Docker Desktop in Settings → AI providers** and show "Install Kokoro" / "Install Chatterbox" / "Install Dia" / "Install Qwen3-TTS" buttons that shell out to `docker run` with the canonical config. Heavier lift; would make JustWrite the first writing app to make local-TTS install genuinely one-click.
3. **Bundle Kokoro as a native Tauri sidecar** (the Edge TTS pattern). Confirmed viable 2026-06-06: Kokoro 82M has mature ONNX Rust bindings (`kokoro-tts` crate v2026.2.1 on crates.io, [Kokoros](https://github.com/lucasjinreal/Kokoros) 784 ⭐ already exposes OpenAI-compatible HTTP on localhost). Cross-platform via ONNX runtime, no Python, ~82 MB in the bundle. The `services/tts.js → isEdgeTts()` branch pattern transfers directly to `isKokoroLocal()`. Chatterbox / Dia / Qwen3-TTS are too big and PyTorch-dependent for this approach — they stay on Docker.

**The two-tier story (3) unlocks:** "Free voices out of the box" — Edge TTS + native Kokoro, **zero setup** — for casual users. "Premium voices" — Chatterbox / Dia / Qwen3-TTS via Docker Compose, opt-in — for users who want voice cloning or specific quality bumps. Most writers stop at tier 1. Ship (3) before (2) and the install-pain problem largely disappears for the median user.

### Investigated 2026-06-06: four community "alt-bundler" projects, all rejected

User-suggested candidates that turned out not to solve the consolidation problem either:
- **[jamiepine/voicebox](https://github.com/jamiepine/voicebox)** (29.5k ⭐, Jamie Pine of Spacedrive) — legitimate but it's a *competing desktop GUI app* with serial model loading and a custom non-OpenAI API. Worth knowing exists; not adoptable as a backend.
- **[loserbcc/open-unified-tts](https://github.com/loserbcc/open-unified-tts)** (51 ⭐, alpha, solo dev) — routing proxy whose own quickstart says `docker run kokoro-fastapi`. Adds a Python process *on top of* the same Docker containers. The intelligent text-chunking logic is the only interesting part.
- **[aivrar/portable-tts-server](https://github.com/aivrar/portable-tts-server)** (2 ⭐, sole contributor) — Windows-only personal tool with subprocess-per-model architecture. Avoids Docker but same conceptual footprint.
- **[oddmeta/oddtts](https://github.com/oddmeta/oddtts)** (10 ⭐, no license) — micro hobby wrapper for older Chinese-ecosystem models (Bert-VITS2, GPT-SoVITS). Wrong model set.

### Docker memory overhead — verified to be a near-misconception

User worry about Docker memory was investigated factually. Numbers:
- **Per-container overhead: 5–30 MB.** Essentially zero.
- **WSL2 VM (Windows Docker Desktop): 2–4 GB idle, FIXED, not per-container.** Cappable via `%USERPROFILE%\.wslconfig` — `memory=8GB` + `autoMemoryReclaim=gradual` releases idle memory back to Windows.
- **VRAM overhead: zero measurable.** NVIDIA Container Toolkit passes CUDA through directly; throughput delta within noise (~1-2%).

### Design constraint clarified: ONE TTS engine at a time

Audio Studio's render workflow is sequential by design — one chapter at a time, one engine. JustWrite is not intended to keep multiple TTS engines hot simultaneously. **This eliminates the VRAM concern entirely:** any 12 GB+ GPU runs any single engine fine; 8 GB handles Kokoro + small Qwen3-TTS comfortably and Chatterbox at the edge.

**Implication:** Docker Compose with `profiles:` is overkill. A single `docker run` invocation per chosen engine is enough. The right control surface is **the existing Settings → AI providers "active TTS engine" picker** — switching engines should hot-swap the container (stop old, start new) via Tauri shell-out. That's the same UX pattern jamiepine/voicebox uses on the backend (serial-load with per-model unload to free VRAM) — we won't adopt their backend but the design lifts cleanly.

**Updated ship plan, ordered:**
1. **Bundle Kokoro as native Tauri sidecar** (item 3 above) — biggest UX unlock; Edge TTS + Kokoro together = zero-install audiobook capability for casual writers
2. **ElevenLabs provider** — premium cloud, highest demand
3. **Qwen3-TTS provider** via [groxaxo wrapper](https://github.com/groxaxo/Qwen3-TTS-Openai-Fastapi) — best 2026 local option, one-line Docker
4. **"Hot-swap active engine" UX in Settings** — single container running at a time, picker controls which one
5. **Speechify provider** — value cloud
6. **CosyVoice 3 provider** — if/when the non-standard voice-listing adapter is worth the effort

---

## sherpa-onnx — parked for future audio features (2026-06-07)

Investigated `sherpa-onnx` (k2-fsa, Apache 2.0, Rust crate `sherpa-onnx = "1.13.2"`) as a candidate for bundling Kokoro 82M as a native Tauri TTS sidecar. The crate solves the espeak-ng problem the earlier Kokoro investigation hit — it bundles phoneme data inside the model tarball rather than linking to system libespeak. Build script auto-downloads prebuilt static archives for Linux x86_64+aarch64, macOS Intel+arm64, Windows x64. ~40-55 MB binary bloat to JustWrite's installer; ~300-700 MB Kokoro models are user-downloaded on first use.

**Conclusion for Kokoro TTS specifically: skip.** Voicebox already ships Kokoro as one of 7 engines, with better engines available (Qwen3-TTS 1.7B = best published English WER + 3s voice cloning, vs. Kokoro 82M = modest quality, no cloning). Edge TTS already covers the zero-install casual segment (400 voices, ships via msedge-tts Rust crate). A Kokoro-native sidecar would sit in a thin band between them, mostly duplicating existing coverage.

**Where sherpa-onnx WOULD earn its bundle bloat** — net-new features that don't overlap with anything JustWrite has today. Listed in roughly increasing implementation cost:

### Candidate features (sherpa-onnx unlocks)

| # | Feature | Demand | Effort | Why it pulls its weight |
|---|---|---|---|---|
| A | **VAD-based silence/breath trim on rendered chapter audio** (Silero VAD) | moderate | small | Audio Studio currently outputs whatever the TTS engine emits — breath gaps, trailing silence, scene-break pauses. A VAD pass at chapter assembly time tightens the export by 1-5% and removes the most annoying "is this still playing?" beats. Pure post-processing, no UX change. |
| B | **Author records a voice clip → ASR transcribes → becomes a voicebox/Chatterbox clone reference** | strong | medium | Closes the voice-cloning loop without leaving the app. Author hits Record in Audio Studio Cast, sherpa-onnx ASR (Whisper / Zipformer / Moonshine — pick one) transcribes, JustWrite verifies the transcript matches the intended line, the WAV becomes a reference clip for voicebox `POST /profiles/{id}/samples` or Chatterbox `/reference_audio/`. Removes the friction of recording in another app, finding the file, naming it correctly. |
| C | **Speech enhancement on user-uploaded reference clips** | moderate | medium | If a writer records on a noisy mic, the clone reference is bad. sherpa-onnx ships a denoise pass. Only relevant if (B) ships first. |
| D | **Dictation flow — "dictate scene 3 into your phone, JustWrite punctuates and inserts as a draft"** (ASR + punctuation restoration) | moderate | large | Writers who think aloud or work hands-free get a way to feed prose into JustWrite without typing. ASR gives raw words, punctuation-restoration model adds periods/commas, draft lands in the chapter editor with a Markers entry tagging it as dictated for later review. |
| E | **Audio Studio chapter audio "show me the silences" timeline overlay** (VAD) | low | small | Visual feedback on render quality. Probably not worth its own ticket but composes cheaply with (A). |

### When to revisit

If any of these features come up in a future session, **don't pull in a separate dependency** (whisper.cpp, separate VAD crate, separate punctuation library, etc.). Reach for sherpa-onnx — the bundle cost is paid once, and the API surface is consistent across all the capabilities. Integration shape mirrors the existing Edge TTS pattern: Tauri commands in `lib.rs` (`audio_asr_*`, `audio_vad_*`, etc.), bridge under `window.justwrite.audio.*`, JS service per feature.

If none of these features come up, sherpa-onnx stays unadopted — no cost.

### Speaker ID / diarization — explicitly NOT in the candidate list

sherpa-onnx also ships speaker embedding extraction and offline diarization (pyannote 3.1, 3D-Speaker, NeMo, WeSpeaker). The obvious-sounding use case — "verify LLM speaker attribution by running speaker-ID on rendered audio" — doesn't actually work. Running speaker-ID on Kokoro-rendered audio confirms what we already know (we used different voice models for different characters), not whether the *text* was attributed correctly. The LLM confidence-flag path stays the right tool for catching attribution errors. Skip.

---

## Build our own TTS server — Phase 4 strategic option (2026-06-07)

After two sessions of integrating voicebox and discovering its API gaps + stale OpenAPI + one-person-maintained slow release pace, we considered three alternatives: fork voicebox, rewrite voicebox in Rust, or build our own. **Honest verdict for now: do none of them.** But the strategic option to build our own server is worth preserving in case future product signals warrant it.

### What voicebox actually figured out (the real IP)

The hard problem isn't the API — it's the **build system that turns PyTorch + CUDA + MLX + multiple TTS engines into a single distributable binary per platform.** Voicebox solved this with:

- `backend/build_binary.py` — orchestrates PyInstaller
- `voicebox-server.spec` — PyInstaller spec bundling every Python dep + native lib (CUDA cuDNN, MLX metallib files, ONNX Runtime, FFmpeg)
- `requirements.txt` + `requirements-mlx.txt` — separate dependency matrices per backend
- Separate `voicebox-server-cuda` binary shipping CUDA 12.8 libs (~2 GB)
- Cross-platform signed binaries

Reproducing that build infrastructure IS the project. Once we'd have it working, adding a new engine is "pip install + register in backends/ + rebuild." Without it, every engine is a week.

### Why we're not doing it now

| Path | Cost | Buys |
|---|---|---|
| Use voicebox as-is + fix our client (current path) | ~90 min | Works today. Subject to upstream pace. |
| Fork voicebox, strip GUI, add our endpoints | 1-2 weeks | We control the API. Inherit upstream's build system. Sync drift cost over time. |
| Build our own server from scratch | 4-6 weeks v1, 3-6 months parity | Full control. No GUI burden. Could open-source as standalone product. |
| Hybrid: Rust sherpa-onnx for Kokoro + Python sidecar for everything else | 2-3 weeks for Rust Kokoro, defer Python | Mac users get zero-install Kokoro. Voicebox stays the heavier-engines path. |

The argument FOR doing it: voicebox is one-person maintained (Jamie Pine of Spacedrive), went 6 weeks without commits mid-2026, has API gaps we discovered the hard way, and a TTS server WE control aligns with JustWrite's local-first philosophy. We could even add engines voicebox doesn't (Fish S2 Pro despite license concerns, IndexTTS-2, MOSS-TTS, Higgs v3).

The argument AGAINST doing it now: voicebox works once we fix our client. We have unverified hypotheses about what JustWrite users actually use (cloning? all 7 engines or just 1-2?). Building before we know means we'll build the wrong server.

### The trigger conditions for Phase 4

Only build our own server if:

- **Phase 3 measurement shows real usage** that voicebox can't serve. Specifically:
  - Voice cloning gets meaningful adoption AND voicebox's cloning quality is limiting writers
  - Users repeatedly ask for engines voicebox doesn't ship
  - Voicebox dies / Jamie Pine archives the project
- **OR a strategic positioning move** — JustWrite wants to be the audiobook-TTS provider, not just consume one
- **OR engine licensing** — we want to commercially distribute an engine voicebox can't (Fish S2 Pro requires paid agreement; if we have one, we'd want full control)

### If/when we do it: starting points

- **Fork voicebox's `voicebox-server.spec`** — don't reinvent PyInstaller config. Start from their working setup.
- **Headless from day one** — no Tauri shell, no React frontend. Just FastAPI.
- **Ship 2-3 engines for v1**, not 7. Pick from real usage: probably Kokoro (cheapest) + Qwen3-TTS (highest quality + cloning) + maybe Chatterbox (paralinguistic tags).
- **API designed for audiobook rendering** — not voice-acting / streaming agents. Add a `/render_chapter` endpoint that takes a parsed script (list of `{character_id, profile_id, text}` entries) and returns one WAV per character, parallelized within VRAM limits.
- **Open-source candidate** — a headless audiobook TTS server with a clean API and a small engine matrix could be useful to other audiobook apps (e.g., the marketing site already documents the writer's audiobook flow; this would be a natural extension product).
- **Naming options**: `audiobook-tts`, `jw-tts`, `bookcast`, or whatever resonates at the time.

### Capture for context preservation

This entire decision is captured in `~/.claude/projects/E--Dev-Web-justwrite-app/memory/project_tts_picks.md` under the "Phased roadmap" section. If a future session is debating "should we build our own TTS server," read both files together before spending a day on architecture design — the answer (probably "not yet") is documented along with the trigger conditions.

---

## Source pool

Raw findings, briefs, and ~90 cited URLs across the 6 research angles are preserved at:

```
C:\Users\danel\AppData\Local\Temp\claude\E--Dev-Web-justwrite-app\0b8c616d-5e99-42ef-9c1b-cdad5c070423\tasks\w15971bzf.output
```

That file is temp-dir scoped and will be cleared at some point. If a candidate here gets promoted to a real spec, copy the relevant brief's evidence section into the feature's design notes before this file disappears.
