# The writer's-editor gap audit — what we have, what the field ships, what to adopt (2026-07-26)

The research pass the user ordered when "#256 spell-check" was expanded (2026-07-26 ruling:
"that should be expanded to what our editor has and what a writer might need, Word has a
bunch of features for our novel writing software — do we need to add any features, like the
missing spell check, any AI features that might be missing"). Findings-first, **no building**
— the output is the ranked gap table in §4 for the user to pick from. Every inventory claim
below was verified in code at the cited file:line this session; every library claim was
checked on the web this session (sources in §7). Sibling research the same day:
`2026-07-26-i18n-single-source-research.md` (some gaps here — hint text, help — route
through that plan's machinery, noted where relevant).

## 1. What OUR editor actually has today (verified inventory)

The picture that emerged is better than the task's framing assumed: most of the "does Word
have it and we don't?" list is **already built**. The genuine gaps are few and specific.

**Editor core** (`src/renderer/src/components/RichEditor.vue`): TipTap v3 with StarterKit +
Placeholder, Underline, Subscript/Superscript, TextStyle+Color, Link, Highlight, TextAlign,
Typography (smart quotes/dashes/ellipses — Word's "autoformat as you type" class),
CharacterCount, Focus, Image, TaskList/TaskItem, and the full Table family
(RichEditor.vue:6-24), plus custom FontSize (:120) and Indent (:149) extensions.
**Find & replace is complete** — live search term with case toggle, next/prev navigation,
replace-current and replace-all (RichEditor.vue:1356-1372, toolbar :1625). **Word-style
inline comments exist** — a `comment` mark storing text in `data-comment`, with
`setComment`/`unsetComment` commands (:343-365) and a click-to-view popover (:1377-1381).
**Entity mentions are live links** — clicking a character/location/object/group mention
navigates to its story-bible entry (:1375-1384), something neither Word nor Scrivener has.
Focus mode (:1311) and typewriter scrolling (:445) cover Scrivener's composition mode.
Editor settings (EditorSettingsModal.vue): font size, paragraph indent, auto-capitalize
sentences, line spacing, paragraph spacing, **a spell-check toggle**, and
keep-original-as-strikethrough for AI changes.

**Spell check today = the native engine.** The toggle drives the WebView2/Chromium
`spellcheck` attribute on the editor DOM (RichEditor.vue:421, 438, 492) — squiggles work.
Two real limitations, both verified: (a) in manuscript mode right-click opens OUR custom
menu; the native menu that carries the spelling *suggestions* is only reachable through the
menu's one-shot "Show browser menu" row (`ctxNativeOnce`, RichEditor.vue:808, 822-838) —
suggestions are two right-clicks away; (b) the native dictionary **cannot be taught the
book's invented names** from JS — every character, place, and coined word squiggles forever,
which for a fantasy/SF novelist makes spell check net-hostile. There is no JS API to feed
WebView2's dictionary; fixing (b) requires owning the engine (→ gap row 1).

**AI writing actions** (`services/writerAI.js`): rewrite, expand, tighten, continueFrom,
describe, guidedContinue, applyRule, voiceCanonVar.

**The analysis suite — 19 services** (`services/analysis/`): aiTellScanner (a 44-entry
crutch-word / AI-tell catalog), beatSheet, characterAudit, characterProfile, critique,
entityExtraction, entitySweep, foreshadowingScan, marketingPack, multiReaderCritique,
plotHoleScan, readerKnowledge, relationshipArc, reverseOutline, **styleMetrics**
(deterministic, no-LLM prose metrics: POV filter-words per the Stein / Browne & King craft
canon, -ly adverbs with an exclusion list, dialogue share — styleMetrics.js:1-30),
sweepDraft, tensionSweep, threadExtraction, voiceDrift. This already covers the task's
whole "(c) AI side" list: continuity = plotHoleScan + entitySweep + foreshadowingScan;
character-voice consistency = voiceDrift + voiceCanonVar; pacing = tensionSweep + the
Analysis Pace view; repetition/crutch words = aiTellScanner + styleMetrics; timeline
sanity = the events system + entity sweeps. **No AI-side gap vs the Sudowrite/NovelCrafter
class was found** — the suite exceeds the field; the only AI adds worth making are the two
tiny ones in the gap table (synonyms-in-context, name generator).

**Workflow**: chapter version history with restore (VersionHistoryModal.vue,
stores/versions.js:86, server `chapter_versions` models.py:503-511) = Scrivener snapshots;
project word goal + progress ring (HomeView.vue:37, 292-305) + the per-day sessions log
feeding Home and Analysis Pace; global search ⌘F; manuscript export with TOC / part covers /
cover image to PDF, DOCX (live TOC), EPUB 3 — the Atticus-class formatting parity lives
there, not in the editor; RAG ask-the-book; soft-delete trash + page-related undo.

## 2. What the field ships (cited)

**Word's Editor pane** (Microsoft 365): spelling, grammar, capitalization, punctuation;
"refinements" — clarity, conciseness, formality, vocabulary, inclusive language,
punctuation conventions; 20+ languages. Beyond the pane: thesaurus, read aloud, dictation.
**Scrivener 3**: snapshots, writing targets (project / document / **session**), the name
generator, **linguistic focus** (highlight one part of speech, or dialogue only),
composition mode, compile, the binder/corkboard. **The AI-writing class** (Sudowrite,
NovelCrafter): rewrite/expand/describe/brainstorm + story-bible extraction — matched or
exceeded here (§1).

## 3. Parity verdict — the one-line-per-feature sweep

| Field feature | Verdict | Where |
|---|---|---|
| Spelling squiggles | HAVE (native, toggleable) | RichEditor.vue:421,438,492 |
| Spelling suggestions | PARTIAL — two clicks deep | RichEditor.vue:808,822-838 |
| Custom dictionary / invented names | **GAP** (impossible with native engine) | → row 1 |
| Grammar & style checking | **GAP** (AI critique ≠ as-you-type) | → row 1 |
| Thesaurus / synonyms | **GAP** (zero hits in renderer) | → row 2 |
| Linguistic focus / dialogue highlight | **GAP** (catalogs exist, not surfaced inline) | → row 3 |
| Name generator | **GAP** (trivial on our runner) | → row 4 |
| Session / per-chapter targets | PARTIAL (project goal + daily log exist) | → row 5 |
| Dictation | **GAP** (deferred) | → row 6 |
| Read aloud | NOT A JW GAP — JustVoice's contract | CLAUDE.md audio ban |
| Find & replace | HAVE | RichEditor.vue:1356-1372 |
| Comments | HAVE | RichEditor.vue:343-365 |
| Track changes | COVERED DIFFERENTLY (AI strikethrough diff + versions) | §5 |
| Snapshots / version history | HAVE | VersionHistoryModal.vue |
| Composition / focus mode | HAVE (focus + typewriter) | RichEditor.vue:1311,445 |
| Targets & progress | HAVE (project grain) | HomeView.vue:292 |
| Compile / export | HAVE (PDF/DOCX/EPUB, TOC, parts) | services/export/* |
| Autocorrect | REJECTED (see §5) | — |
| Footnotes | REJECTED (see §5) | — |
| Tables, images, links, task lists | HAVE | RichEditor.vue:15-24 |

## 4. THE RANKED GAP TABLE (the deliverable — user picks; nothing here is a build commitment)

**Row 1 — spelling + grammar that knows the story bible.** The flagship gap, and one
adoption closes three cells (custom dictionary, grammar, suggestion friction).
**REC: adopt Harper** — Automattic's offline, Rust→WASM checker; Apache-2.0; 10k+ stars;
suggestions in <10 ms fully on-device (the privacy story matches our local-AI stance).
`harper.js` ships LocalLinter/WorkerLinter with **`importWords()`** — so the project
store's characters, locations, objects, groups, and worldbuilding terms auto-feed the
dictionary and invented names stop squiggling; nobody in the field has a spell check
that reads the story bible. Its suggestions render in OUR context menu (dissolving the
two-click native escape). Integration = a ProseMirror decoration plugin (the community
LanguageTool-for-TipTap extension is the architectural crib) + context-menu entries +
a settings row; the WorkerLinter keeps linting off the UI thread. Effort: **medium**
(the largest item on this list; one to two days of focused work). Caveat, stated
honestly: harper.js is labeled early-access / API-not-yet-stable — pin the version.
Grammar-side alternatives considered (T4): **LanguageTool** — public API is 20 req/min/IP
(unusable as-you-type) and self-hosting is a Java server (Docker `erikvl87/languagetool`)
— a heavy, wrong-shaped dependency for an offline-first desktop app; **status quo native
engine** — free, but structurally cannot learn names (no JS API) and its checking stops
at spelling. Word's deeper "refinements" (clarity/conciseness/formality) remain covered
by our AI critique/rewrite suite — richer than Word's, just not as-you-type.

**Row 2 — thesaurus.** Nothing today (zero renderer hits). **REC: local dataset for
instant lookup + an AI escalation.** Local options (T4): the **`moby`** npm package —
Moby Thesaurus, the largest English thesaurus, **public domain**, plus OpenOffice
thesaurus data; or **`en-wordnet`** (Princeton WordNet). Remote option rejected for the
final shape: **Datamuse** is keyless and generous (100k req/day) but **non-commercial
only** and its open policy is promised only "until January 1, 2027" — wrong foundation
for a commercial offline-first app (fine as a dev prototype). The AI escalation —
"More synonyms in context" sending the sentence to the existing runner so suggestions
rank by fit — is a tiny writerAI-style feature and does something Word's thesaurus
can't. Surface: the editor context menu (select word → Synonyms) + optional bubble-menu
chip. Effort: **small-medium** (data file sizing/lazy-load is the only real work).

**Row 3 — linguistic focus / prose highlights.** Scrivener's revision superpower
(highlight all adverbs, all filter words, dialogue only). **We already own the catalogs**
— styleMetrics' filter-word + adverb regexes and aiTellScanner's 44 patterns are pure
functions over chapter text; this row is *surfacing existing analysis as toggleable
editor decorations*, not new analysis. Phase 2, if true part-of-speech grade is wanted
(verbs only, nouns only): **compromise** (MIT, 12.1k stars, pushed 2026-07-20, ~1 MB/s,
83 POS tags, browser-local). Effort: **small** (phase 1), compromise deferred until asked
for. High craft value per unit work — the best ratio on this list.

**Row 4 — name generator.** Scrivener ships one; ours would be better — a tiny
writerAI-style feature on the local runner (genre / culture / era / alliteration
parameters), no new deps, and the result can save straight into Characters. Effort:
**tiny** (one prompt + one small surface).

**Row 5 — session & per-chapter targets.** We have the project-grain goal ring and the
per-day sessions log; Scrivener adds "today's target" and per-document targets with a
live bar. A settings field + a small bar on Home/editor footer, fed by data we already
record. No deps. Effort: **small**.

**Row 6 — dictation (defer).** Word has it; novelists with RSI genuinely use it. Local
shape exists — **whisper.cpp** (offline, CPU-viable, streaming) — but the real scope is
audio capture + streaming partials + punctuation/commands, a subsystem of its own, and
it borders the JustWrite/JustVoice audio boundary (speech-*input* is arguably JW's, but
the infrastructure kinship is JV's). **REC: park it as a named future item; do not
schedule.** License/API re-verify on adoption.

## 5. Rejected rows — and why (so they don't come back as "missing")

**Autocorrect** (Word's replace-as-you-type): actively hostile to fiction — it "fixes"
neologisms and invented names; the Typography extension + auto-capitalize setting already
cover the safe subset (quotes, dashes, sentence caps); squiggles-not-rewrites is the right
behavior for prose. **Track changes**: a collaboration feature; for a solo novelist the
AI-strikethrough diff (the one reviewer that exists here) + version history cover the
need; TipTap's suggestion mode is a paid Pro extension. **Footnotes/endnotes**: novels
essentially never use them; export adapters would need matching work; poor fit. **Page
layout / headers / margins**: an export-side concern already handled by the manuscript
adapters (that's the Atticus comparison, and it lives there by design). **Read aloud**:
architecture — all audio output is JustVoice's (CLAUDE.md: "Do not reintroduce TTS…").
**Real-time collaboration**: out of scope for a local-first solo tool; noted only so the
row is visibly decided, not forgotten.

## 6. If the user picks — the natural order

Independent rows; any subset works. The order that front-loads value: **3 → 2 → 1 → 4 → 5**
(prose highlights first because it's small and pure-win; thesaurus next; Harper as the one
medium-sized adoption when a clear slot exists; name gen and targets as gap-fillers). All
editor-touching rows are renderer work — **bench-gated** like everything else this week
(no `src/renderer/**` edits while a bench runs). New user-facing strings land through the
i18n key machinery once Phase 1 merges (`2026-07-26-i18n-single-source-research.md`), and
each row ships its hint/help text with the feature per the hints content pass (step 3b).

## 7. Sources (checked 2026-07-26)

- Harper: https://writewithharper.com/ · https://github.com/automattic/harper (Apache-2.0)
  · harper.js docs https://writewithharper.com/docs/harperjs/introduction ·
  `importWords` ref https://writewithharper.com/docs/harperjs/ref/harper.js.linter.importwords.html
- Word Editor: https://support.microsoft.com/en-us/office/check-grammar-spelling-and-more-in-word-0f43bf32-ccde-40c5-b16a-c6a282c0d251
  · https://www.microsoft.com/en-us/microsoft-365/microsoft-editor
- Scrivener 3: https://scrivener.software/ · linguistic focus / targets / name generator per
  https://indieauthormagazine.com/scrivener-unlocked-10-hidden-features-to-simplify-your-writing-life/
- LanguageTool: https://dev.languagetool.org/public-http-api.html (20 req/min/IP) ·
  https://languagetool.org/http-api/
- Datamuse: https://www.datamuse.com/api/ (non-commercial, 100k/day, policy to 2027-01-01)
- Moby: https://github.com/words/moby (public domain) · npm `moby`
- WordNet: https://github.com/open-language/en-wordnet
- compromise: https://github.com/spencermountain/compromise (MIT · 12,144 stars ·
  pushed 2026-07-20, verified via GitHub API this session)
- whisper.cpp dictation ecosystem: https://dev.to/alichherawalla/how-to-run-voice-to-text-locally-on-your-desktop-whisper-offline-dictation-349p
