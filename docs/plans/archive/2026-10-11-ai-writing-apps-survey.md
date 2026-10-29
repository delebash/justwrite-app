# What other writing apps ship that JustWrite doesn't — survey (2026-10-11)

The record behind [RESEARCH.md § What other writing apps ship](../dev/RESEARCH.md#what-other-writing-apps-ship).
Asked by the user 2026-10-11 ("see what features they have that we dont not just the stuff i
mentioned"), for the design in [`2026-10-11-ai-drafting-spec.md`](2026-10-11-ai-drafting-spec.md).

**Method.** Two web passes by agents, read-only. **A** — AI generation: entities from a
description, and prose/story generation. **B** — every other feature area, AI and not. Pass B
grep-checked each "JustWrite lacks X" over `src/` + `server/src/` (counts are matching lines).
The session re-fetched two sources itself (A1, A34 — both matched) and re-checked in code the
claims the design rests on (scene columns, the card synopsis, the Timeline, the marker
categories, "No manual edges", the writer actions' variables). Everything else here is
*web, agent*: checked against the cited page by an agent, not re-checked by the session.

**Builds on, not repeated:** [`archive/2026-06-05-ai-features-roadmap.md`](archive/2026-06-05-ai-features-roadmap.md)
(2026-06-05) · [`archive/2026-06-05-potential-roadmap.md`](archive/2026-06-05-potential-roadmap.md) (2026-06-05) ·
[`2026-07-26-writers-editor-gap-research.md`](2026-07-26-writers-editor-gap-research.md).

**Limits.** worldanvil.com and korben.info answered 403; NovelCrafter's feedback boards are shut;
Sudowrite's My Voice help page is a 404; LivingWriter's JS-only pages went unread; Reddit was read
through the Arctic Shift archive; "Autocrafted" is a parked domain. UNVERIFIED marks what could
not be checked.

---

## A · Generation

### A1. Entities from a description

| Product | Describe → generate | Per-field AI | Via chat / other | Bulk | Existing content | Names / candidates |
|---|---|---|---|---|---|---|
| Sudowrite | yes — **+ Add Character → Blank / Generate / Surprise Me** [A1,A2] | yes — Generate on an empty trait, Rewrite on a filled one, optional instruction [A1,A2] | Chat "Allow edits" creates and revises Characters / Worldbuilding [A3] | **Generate All Characters** from the Synopsis; Smart Import ≤30 per batch from ≤60k words [A1] | whole-card overwrite UNVERIFIED; card history [A1] | names from the separate Brainstorm tool [A4] |
| NovelCrafter | no (none in the Codex editor) [A5,A7] | no | Chat → **Extract** → a review pop-up, one card per entry, "Save Entries" [A5] | yes (Extract) [A5,A6] | new entries or "replacing old entries" [A6] | via chat only [A5] |
| LocalProse | yes — a describe box in each Character / Place / Object Workshop; **Générer / Compléter** fills every tab [A8] | no evidence; a follow-up instruction revises the sheet [A8] | Interview (role-play) [A10] | no evidence | **Préserver l'existant** — fills only empty fields (v2.1.3, 2026-05-01) [A9] | a default name, not AI-made (v3.4.0) [A9] |
| NovelAI | yes — Lorebook Generator, a type + input text [A11] | n/a (one text body) | no | no evidence | adds to the entry's text [A11] | History keeps the last 50 [A11] |
| LivingWriter | yes — "AI Element Generation" (characters, settings, objects, research) [A12] | UNVERIFIED | — | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Squibler | partial — "Elements Creation" [A13]; a separate Character Generator [A14] | UNVERIFIED | — | — | — | — |
| Campfire · Plottr · Dabble · Novel Factory | no — Plottr: "We're not building AI features into Plottr" [A16,A17]; Dabble and Novel Factory market "AI-free" [A18,A19] | | | | | |
| World Anvil | UNVERIFIED (a 2024 forum decline [A20] vs a competitor blog's "Sage" [A21]) | | | | | |

**Context entity generation reads:** Sudowrite — the Synopsis and the other entries [A1,A2];
NovelAI — Memory, Author's Note, ~2,500 characters of recent story, other entries [A11];
LocalProse — its universe and timeline state [A9]; NovelCrafter — what you add to the chat [A5].

### A2. Story and prose

| Product | Scene/chapter from beats | Outline from premise | Whole book | Continue | Rewrite tone/style | In my voice | Chat edits the manuscript | Custom prompts |
|---|---|---|---|---|---|---|---|---|
| Sudowrite | yes — Draft: Scenes → chapter [A26] | yes — Braindump → Synopsis → Generate Outline [A24,A25] | no evidence | yes — Write Auto / Guided / Tone Shift, 1–6 cards [A27] | yes [A4,A27] | partial — Match My Style writes a style prompt; My Voice paused / "retired" [A4,A28] | yes — "Allow edits", plan approval, AI text in purple [A3] | yes — Plugins [A29] |
| NovelCrafter | yes — "/" scene beat → Apply / Retry / Discard [A30] | partial — chat → Extract into chapters / beats [A6] | no | yes [A30] | partial — Text Replacement prompts [A7] | partial — "Your Voice" + a writing sample [A31] | no evidence [A6,A32] | yes — prompt library [A7] |
| LocalProse | no [A9] | no [A9] | no [A9] | yes — Inspiration, max length [A9] | yes — Style / Tone / Format, saved profiles, diff [A9] | "Imitate my style" in the user's screenshot, not in its docs — UNVERIFIED | no | none documented |
| LivingWriter | not listed [A12] | yes — "AI Outlines" [A12] | no | — | yes [A12] | — | no [A12] | — |
| Squibler | yes, inside book generation [A13] | yes [A13] | yes — one test: 45,584 words, 20 scenes, a renamed character and a POV switch [A13,A14] | — | partial [A13] | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| NovelAI | — | — | — | yes (its core), steered by Memory / Author's Note / tags [A33] | — | — | — | — |
| Raptor Write | — | — | — | yes — Accept / Reject / Rerun [A22] | through prompts | — | — | yes — `{{before}}` `{{after}}` `{{selected_text}}` `{{user_input}}` … [A22] |

**Context prose generation sends:**
- Sudowrite Write: up to 20,000 words before the cursor, up to 20,000 more from ≤25 linked
  documents, plus Style, Genre, Characters, Worldbuilding and the linked outline [A27].
- Sudowrite Draft: Style, Genre, the Characters / Worldbuilding the scenes mention, the Scenes;
  a pre-check offers fixes and a credit estimate [A25,A26].
- NovelCrafter scene beat: Codex entries mentioned in the beat or the text before it, manual
  references, the POV entry, "Always include" entries and their children; per entry **Always /
  Include when detected / Don't include when detected / Never** [A34]; a prompt preview [A30].

### A3. Where it sits in the UI

- **Describe box in the entity's own editor** — LocalProse [A8]; NovelAI's Lorebook [A11].
- **"+ Add" with Blank / Generate / Surprise Me** — Sudowrite [A1,A2].
- **Per-field Generate (empty) / Rewrite (filled)** with an optional instruction — Sudowrite [A1,A2].
- **Pipeline buttons** Synopsis → cast → outline → scenes → Draft — Sudowrite [A1,A24,A26];
  InkWeaver claims idea → characters, world, chapter outline in one pass [A40].
- **Chat → extract through a review pop-up** — NovelCrafter [A5]. **Chat with edit permission** —
  Sudowrite [A3].
- **A selection → a new entity pre-filled for the generator** — LocalProse [A9].
- **Inline proposals** — a "/" beat block (NovelCrafter [A30]); History cards (Sudowrite [A27]); a
  proposal bar with variants, the editor locked while pending, and a diff (LocalProse [A9]).
- **Interview from the entity**, exportable to its notes — LocalProse [A9,A10].
- No product documents several entity candidates side by side, or a name button inside the
  entity form.

### A4. 2026 changes

- **Sudowrite** [A35]: Chat that edits documents and the Story Bible, margin Feedback (05-12) [A36];
  a new plugin editor, the Ballad 1.1 model, Chat web research (06-04) [A29]; Draft estimates,
  My Voice "retired" (08-14) [A28]; Rewrite on Ballad (09-22); Character Portraits (09-25);
  Worldbuilding Images (10-07). The glossary (01-07): My Voice "Development has been paused" [A4].
- **NovelCrafter** [A32]: reasoning prefer/avoid (01-09), Codex tracking (03-21), an organization
  overhaul (09-24), a model per Chat thread and multi-POV beat fixes (10-02) — no new generation.
- **LocalProse** [A9]: places and objects (Feb), Interview (02-27), Préserver l'existant (05-01),
  Ollama + GGUF import (05-18), rewrite profiles and variants (07-17), Interview export (07-24),
  rewrite diff (08-28), a plot-mechanics audit (10-01). Still no scene, chapter or outline generation.
- **Plottr** announced AI in 2024, now says it won't build it (01-08, updated 05-19) [A16,A17].
- **NovelAI**: a GLM-4.6-based model ~03-31, community sources only — UNVERIFIED [A37].
- **New entrants**: Noveble 2 (02-15; chapter prose from outlines; AI traits reviewed before
  canon) [A38,A39]; InkWeaver (your own OpenRouter key) [A40]; Chronicle (~08-04; fully local via
  LM Studio / Ollama, no account, the story bible sent with every call) [A41].

### A5. Writer sentiment

- **Cambridge / Collett report** (launched 2025-11-20; 258 published novelists): 97% "extremely
  negative" about AI writing whole novels, 87% about AI writing short sections, 43% about AI
  editing; a third use AI, mostly for non-creative tasks [A42].
- **Gotham Ghostwriters / Bernoff** (2025-11-05): 42% of fiction authors use AI, 11% for
  publishable text [A43]. **BookBub** (updated 2025-11-05; 1,229 authors): 45% use AI, 48% never
  will; research (81%) and outlining are the top uses; 74% don't disclose [A44].
- **Authors Guild Human Authored**: brainstorming and outlining are allowed "as long as the AI use
  is merely preparatory and no actual AI-generated text appears in your work" [A45]; open to any
  US-published author since 2026-03-04 [A46].
- **SFWA**: the Nebulas bar works "written, either wholly or partially," by LLMs (after a
  same-day reversal, December 2025) [A47].
- **Publishers**: Hachette pulled *Shy Girl* (2026-03) over AI use — reported as the first such
  cancellation by a major house; its contracts require disclosure [A48]. Pan Macmillan: "AI is a
  tool to enhance the craft, not replace it" [A49].

### A6. Generation JustWrite lacks

1. Describe → generate on each story-world page, fill-empty-only, follow-up instruction.
2. Per-field (or per-section) Generate / Rewrite with an instruction.
3. "Surprise me" — a random entity that fits the story.
4. A cast / world generated from the premise.
5. Brainstorm or chat output saved as entities through a review list (today: clipboard only,
   `src/pages/BrainstormPage.vue:165`).
6. Entities imported from pasted text or a file.
7. A selection turned into a new entity, pre-filled.
8. Premise → synopsis → outline / plot-board cards.
9. A chapter drafted from its beats or scenes, with a pre-check.
10. A chat allowed to edit the manuscript and the story bible.
11. User-defined prompts with context variables.
12. Named tone / style / format pickers with saved profiles (Rewrite is one fixed instruction).
13. An editable style description distilled from your chapters (the voice canon injects raw
    chapters instead).
14. A character chat saved to the character (Talk to a character has no such action — the session
    grepped `ChatPanel.vue`).
15. AI portraits and images (may fall outside "writing only").

### A — sources

1. https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/characters/a7tdE1ZB8KvAwMD3Mopwpd — 2026-01-14 [official] (re-fetched by the session 2026-10-11)
2. https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/worldbuilding/uc5NfWSz4x8Wm3S19LZeo8 — 2026-01-14 [official]
3. https://write.helpkit.so/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/chat/5vbuELXf6LZQnGfVzsEXCV — 2026-05-13 [official, docs mirror]
4. https://docs.sudowrite.com/getting-started/dQph1snuwbfMWG9wRjsNug/glossary/1Symu5y4wtu65nQVYHjhxa — 2026-01-07 [official]
5. https://www.novelcrafter.com/courses/ultimate-beginners-guide/codex-and-chat — n.d. [official]
6. https://novelcrafter.com/help/docs/organization/the-extract-feature — 2025-12-01 [official]
7. https://www.novelcrafter.com/help/docs/prompts/prompt-types — 2025-06-26 [official]
8. https://www.localprose.com/creation-personnage-ia-locale.html — 2026-09-04 [official]
9. https://wiki.localprose.com/changelog/ — v1.1.0 2026-02-11 … v3.7.0 2026-10-01 [official]
10. https://www.localprose.com/interview-personnage-ia-locale.html — 2026-03-13 [official]
11. https://docs.novelai.net/en/text/lorebook — n.d. [official]
12. https://livingwriter.com/ai-features — n.d. [official]
13. https://www.squibler.io/ — n.d. [official]
14. https://www.sigmabrowser.com/blog/ai-story-generator-free-tools-tested — 2026-09-15 [review]
15. https://www.campfirewriting.com/ — n.d. [official]
16. https://plottr.com/plottr-in-2026/ — 2026-01-08, updated 2026-05-19 [official]
17. https://plottr.com/plottrs-ai-future/ — 2024-03-11 [official]
18. https://www.dabblewriter.com/docs/reference/dabble-is-ai-free — n.d. [official]
19. https://www.novel-software.com/ — n.d. [official]
20. https://www.worldanvil.com/community/voting/suggestion/182ee13a-ceb8-4bb8-b53d-904bfb2a326e/view — May 2024 per the search snippet; 403 — UNVERIFIED
21. https://sudowrite.com/blog/what-is-the-best-ai-for-worldbuilding-we-tested-the-top-tools/ — n.d. [review, competitor; not fetched] — UNVERIFIED
22. https://raptorwrite.com — v0.69, n.d. [official]
23. https://autocrafted.com — a for-sale page, checked 2026-10-11
24. https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/outline/3owKyHXUm1bCdp41b2Npjk — 2026-01-14 [official]
25. https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/what-is-story-bible/jmWepHcQdJetNrE991fjJC — 2026-01-13 [official]
26. https://write.helpkit.so/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/scenes--chapter-prose/49p5MTVxTKkVFEC5rVUzpY — 2026-01-14 [official, docs mirror]
27. https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/write/pvxUvbQqYybfEosqx1sXjY — 2026-01-08 [official]
28. https://feedback.sudowrite.com/changelog/improved-draft-estimates-plus-a-bunch-of-fixes — 2026-08-14 [official]
29. https://feedback.sudowrite.com/changelog/opus-48-new-plugin-editor-free-excellent-friday-and-more — 2026-06-04 [official]
30. https://novelcrafter.com/help/docs/write/generating-prose — 2025-06-27 [official]
31. https://www.novelcrafter.com/help/faq/write/writing-samples — 2025-06-26 [official]
32. https://www.novelcrafter.com/changelog — 2026 entries [official]
33. https://docs.novelai.net/en/text/editor/storysettings — n.d. [official]
34. https://www.novelcrafter.com/help/faq/ai-and-prompting/codex-context-in-prompting — 2025-12-02 [official] (re-fetched by the session 2026-10-11)
35. https://feedback.sudowrite.com/changelog — 2026 entries [official]
36. https://feedback.sudowrite.com/changelog/your-personal-writing-partner-has-arrived — 2026-05-12 [official]
37. https://reddit.sentinel-team.org/posts/1s9fgew/snapshots/2026-04-03T15%3A05%3A24.89649Z — 2026-04-03 [review, community]
38. https://www.producthunt.com/products/noveble/launches/noveble-2 — 2026-02-15 [review]
39. https://www.noveble.com/ai-character-generator/ — n.d. [official]
40. https://www.producthunt.com/products/inkweaver — "Launched in 2026" [review]
41. https://www.producthunt.com/p/chronicle-13/launching-tuesday-a-local-ai-story-bible-for-novelists — "Tuesday, August 4th", year inferred [review]
42. https://www.thebrighterside.news/post/half-of-surveyed-uk-novelists-fear-ai-could-replace-their-work-entirely/ — 2026-10-04 [review]; launch: https://www.c2d3.cam.ac.uk/events/impact-generative-ai-novel-lunchtime-webinar
43. https://www.publishersweekly.com/pw/print/20251110/99019-new-report-examines-writers-attitudes-toward-ai.html — 2025-11-05 [review]
44. https://insights.bookbub.com/how-authors-are-thinking-about-ai-survey/ — updated 2025-11-05 [official]
45. https://authorsguild.org/human-authored/faq/ — n.d. [official]
46. https://rightstech.com/2026/03/authors-guild-expands-human-authored-certification-program/ — 2026-03-04 [review]
47. https://techcrunch.com/2026/01/25/science-fiction-writers-comic-con-say-goodbye-to-ai/ — 2026-01-25 [review]
48. https://mugglehead.com/major-publisher-hachette-pulls-horror-novel-shy-girl-over-ai-allegations/ — 2026-03-23 [review]
49. https://www.panmacmillan.com/response-to-collett-report — n.d. [official]

---

## B · Everything else

### B1. New gaps — in no earlier doc

1. **AI images** — portraits, scene art, covers. Sudowrite (Portraits 2026-09-25, Worldbuilding
   Images 2026-10-07, Visualize) [B1], NovelAI [B2], Squibler [B3], LivingWriter covers [B4],
   ProWritingAid character cards [B5]; Dabble 3.0's non-AI cover designer [B6]. JustWrite: absent
   (`imageGen|generateImage|…|txt2img|flux` → 0). The bundled llama.cpp engine makes no images.
2. **Interactive maps** — pins linked to entities, layers, routes, maps that change over the
   story. Campfire [B7], World Anvil [B8], LegendKeeper Atlas (2026-01) [B9], Kanka [B10];
   asked for on Reddit 2026-08 [B11]. JustWrite: no map page.
3. **Family trees and typed relationships** (mother-of, rival; faction webs). Plottr Family Tree
   (2025-08) [B12], Campfire [B7], World Anvil [B8], NovelCrafter Relations [B13], bibisco [B14],
   Kanka [B10]. JustWrite: absent by design — "No manual edges" (`docs/story-bible.md:256`).
4. **Story-bible facts that change over the book** ("progressions"). NovelCrafter [B13], World
   Anvil Chronicles [B8]. JustWrite: one static `life_status` per character.
5. **Mentions detected without `@`**, with a per-entry AI rule. NovelCrafter (2026-03) [B13],
   LegendKeeper auto-linking [B9]. JustWrite: explicit `@` only; the alias matcher serves RAG and
   the review modals; per-entity "Exclude from AI" exists.
6. **Custom fields, entity types, your own templates.** Sudowrite [B1], NovelCrafter [B13], Plottr
   [B12], Campfire (2026-05) [B7], World Anvil [B8], LegendKeeper Properties (2026-08) [B9], Novel
   Factory [B15]. JustWrite: absent; plot templates, beat-sheet templates and marker categories are
   code constants (`src/services/plotTemplates.js:10`, `src/services/analysis/beatSheet.js`,
   `server/src/editor/markers.js:14` "Hard-coded for now") — against the nothing-hardcoded rule.
7. **Scene synopses + "summarize this scene".** NovelCrafter (2025-05) [B13], Plottr [B12], Novel
   Factory [B15]. JustWrite: no field; the card view's "synopsis" is the first 180 characters of
   prose (`src/pages/ChaptersPage.vue:320`).
8. **Scenes on a story-time timeline** (chronological vs reading order, computed ages). Aeon
   [B17], Novel Factory [B15], LegendKeeper (2025-09) [B9], Novelium [B18]. JustWrite: scenes have a
   "when" (kept since 2026-10-11, `d55f8f5`), but the Timeline lists entity events only
   (`src/pages/TimelinePage.vue:22`).
9. **User-defined AI actions / prompt library / plugins.** Sudowrite Plugins [B1], NovelCrafter
   prompts and personas [B13], Raptor Write [B19], NovelAI scripting [B2], AutoCrit custom beta
   readers [B20]. JustWrite: the menu actions, line edits and reader personas are fixed.
10. **Agentic chat + web research.** Sudowrite Chat "Allow edits" + web research (2026-05/06) [B1];
    Squibler Agentic Editor (2026-04) [B3]. JustWrite: absent.
11. **Reports JustWrite lacks** — genre benchmarks against published books (AutoCrit [B20],
    Marlowe [B21]); a per-scene checklist (Fictionary [B22]); an explicit-content section (Marlowe
    [B21]); house-style consistency checks (ProWritingAid [B5], Atticus [B23]).
12. **Store-metadata kit** — KDP keywords and categories, retailer descriptions, a query letter, a
    cover brief. Marlowe [B21], ProWritingAid [B5], AutoCrit [B20], StoryWith AI [B24]. JustWrite:
    partial (the Marketing pack stops at logline / blurbs / synopsis / pitch / comps).
13. **Submission format + more export formats** (Shunn manuscript; Markdown / TXT / RTF / ODT /
    HTML). Scrivener [B16], Dabble [B6], Ellipsus [B25]. JustWrite exports pdf / docx / epub / zip.
14. **Book design** — front and back matter (an "AI/Human-written" copyright page among them),
    themes, drop caps, ornamental scene breaks, box sets. Atticus [B23], Vellum [B26], Reedsy [B27].
    JustWrite's scene break is a fixed `* * *`.
- Smaller: import from Scrivener projects and PDF/scans (Plottr [B12], LegendKeeper [B9], Squibler
  [B3], LocalProse [B28]); research attachments (Scrivener [B16], Campfire [B7]); deadline-driven
  goals (Scrivener, Dabble, Atticus); authorship / provenance tracking (iA Writer 2026-05 [B29],
  Grammarly [B30], Ellipsus [B25], VellumProof 2026-08 [B31]); a conlang dictionary (Campfire,
  World Anvil); a guided method (Novel Factory [B15], Wavemaker [B32]); reading one character's
  or strand's scenes alone (NovelPad [B33]).

### B2. Known gaps, still open — competitors ship them

Spelling and grammar that knows the story bible (ProWritingAid, Dabble, LocalProse) · thesaurus
(AutoCrit, LocalProse) · prose highlights (Scrivener) · dictation (AutoCrit, LocalProse offline,
Yaps [B34]) · sprint timer (Dabble, Raptor Write, Squibler 2026-05, 4thewords [B35]) · a POV
character per scene (NovelCrafter, Fictionary) · series (NovelCrafter, AutoCrit, Novelium) ·
beta-reader round-trip (Dabble Review Copies 2026-07, Atticus, BetaBooks [B36]) · AI margin notes
(Sudowrite 2026-05, ProWritingAid) · canvas / idea boards (Plottr 2025-10, LocalProse, Wavemaker) ·
custom calendars (LegendKeeper, Kanka, World Anvil) · story-bible export (NovelCrafter, Plottr) ·
print knobs and EPUB checks (Atticus, Vellum) · dyslexia editor fonts (Sudowrite ships
OpenDyslexic) · an echo / pet-word report (ProWritingAid, Ellipsus) · a sensitivity pass
(ShakespeareAI 2026-07 [B37]) · AI disclosure (BookWriter's KDP questionnaire 2026-05 [B38],
Atticus's copyright page) · split view (Scrivener) · setup/payoff pairs (StoryWith AI).
Status corrections: chapter snapshots + diff and the daily target have shipped; no surveyed
product *displays* reasoning (NovelCrafter only sets its effort); no surveyed product ships KFX.

### B3. Rejected before — the field has moved

- **Whole-book AI beta read** (rejected: "diplomatic mush") — ProWritingAid Manuscript Analysis +
  Virtual Beta Reader, AutoCrit Alpha/Beta readers + Story Analyzer+ (2026-04), Marlowe 3.0,
  Sudowrite Beta Read, Twig [B39]. **Materially changed**: every critique product ships one.
- **Collaboration / track changes** (rejected as out of scope) — Dabble 3.0 co-authoring, track
  changes and Review Copies (2026-07) [B6]: a non-live review copy merged back fits local-first.
- **What-if branches** (rejected: a branching data model) — Ellipsus compare + merge [B25],
  Squibler branching (2026-04) [B3], NovelAI [B2]. JustWrite's sync already merges scene edits.
- **Translation** (rejected: saturated) — Amazon Kindle Translate (beta 2025-11, updated 2026-06)
  [B40], Squibler; Reddit calls Kindle's output too literal [B11].
- **Historical accuracy** (rejected: models confidently wrong) — LocalProse anachronism checks [B28],
  Sudowrite web research [B1]. Partly changed.
- Unchanged: readability scores, footnotes, screenplay, read-aloud (JustVoice's), publishing.

### B4. Where JustWrite is ahead

A bundled local engine with hardware-fit setup and per-feature routing (a 2026-10 Reddit thread:
still no "good local harness that rivals novelcrafter" [B11]) · the reader-vs-POV knowledge map,
dangling threads, relationship arcs, the consistency audit, voice drift, the resume briefing and
session recap — in no surveyed product's docs · offline, no account, encrypted folder/LAN sync and
a phone app (Campfire's phone app is online-only [B7]; Plottr pulled its mobile apps [B12]) · a
self-hosted headless server usable from any browser.

### B — sources

Prefixes: SW = docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS · SWC =
feedback.sudowrite.com/changelog · NC = novelcrafter.com/help · AT =
intercom.help/atticus-5877e36564df/en/articles · LL = literatureandlatte.com · DB =
dabblewriter.com/docs. All https; n.d. = no date shown.

1. Sudowrite [official]: SW/portraits--images/8FB59VFrbbhcmBRYNicXis (2026-10-07); SWC; SW/visualize/4MxYzYduLVPbGceg6zMMCb (2026-01-08); SW/what-are-plugins/nv29Kiu2qRSNsMgG4hvL75; SW/characters/a7tdE1ZB8KvAwMD3Mopwpd (2026-01-14); SW/chat/5vbuELXf6LZQnGfVzsEXCV (2026-05-13); SWC/your-personal-writing-partner-has-arrived (2026-05-12); SWC/opus-48-new-plugin-editor-free-excellent-friday-and-more (2026-06-04); docs.sudowrite.com/resources/ktuxRrzphwp3uTNneRtaos/what-accessibility-options-are-available/5KF5DpS7ZcYQKtgU4MDHWf (Jan 2026).
2. NovelAI [official]: docs.novelai.net/en/image/models, /en/scripting/introduction, /en/text/editor, /en/text/usersettings/tts (n.d.).
3. Squibler [official]: squibler.io/whats-new/ (2025-03 … 2026-09); squibler.io (n.d.).
4. LivingWriter [official]: livingwriter.com/en/ai-features, /en/screenwriting (n.d.).
5. ProWritingAid [official]: help.prowritingaid.com/article/428-what-type-of-feedback-does-character-analysis-provide (2026-06-28), /375-what-type-of-feedback-does-marketability-analysis-provide (2025-10-19), /314-how-do-i-use-manuscript-analysis (2026-08-29), /337-what-type-of-feedback-does-virtual-beta-reader-provide (2025-07-01), /102-how-do-i-add-a-word-to-my-personal-dictionary (2024-08-12); prowritingaid.com/en/App/WritingReports (n.d.).
6. Dabble [official]: DB/reference/whats-new-in-3, DB/reference/release-notes/ (3.0 2026-07-13/15; tracked-changes export 2026-08-27), DB/import-export-printing/export-your-manuscript, DB/goals-progress/set-a-word-count-goal, DB/goals-progress/writing-timer-and-sprints, DB/collaboration-sharing/review-copies, DB/writing-editing/spelling-and-grammar (n.d.).
7. Campfire [official]: campfirewriting.com/interactive-maps, /conlang-software, /story-planner, /publishing, /apps, /faq (n.d.); /learn/relationships-tutorial (2025-08-12); /learn/update42 (2026-05-26).
8. World Anvil [official]: worldanvil.com/features/maps, /features/chronicles, /features/publication, /learn/family-trees/family-trees-guide, /learn/diplomacy-webs/diplomacy-webs, /learn/article-templates, /learn/article-guides/language-dictionary, /learn/calendars/calendars (n.d.) — read on echristopherclark.com, a custom domain serving World Anvil's docs (worldanvil.com answers 403).
9. LegendKeeper [official]: legendkeeper.com (n.d.); /changelog/legendkeeper-0-18-0-0/ (2026-01-10); /legendkeeper-timelines-are-here (2025-09-09); /changelog/ (moons 2025-11-06, Properties 2026-08-18); /import-world-legendkeeper/ (2026-01-09).
10. Kanka [official]: kanka.io/features (©2026).
11. Reddit [review]: reddit.com/r/fantasywriters/comments/1vq3wpi (2026-08-16), /r/selfpublish/comments/1u55igi (2026-06-13), /r/selfpublish/comments/1t5pmjg (2026-05-06), /r/WritingWithAI/comments/1x0jmgx (2026-10-08), /r/selfpublish/comments/1vpe6qi (2026-08-15).
12. Plottr [official]: plottr.com/changelog (Family Tree 2025-08-28, Idea Board 2025-10); plottr.com (n.d.); docs.plottr.com/article/13-importing-from-scrivener (2024-07-03), /article/66-exporting (2025-05-29), /article/117-mobile-new-mobile-app-incoming-please-read (2025-05-10).
13. NovelCrafter [official]: NC/docs/codex/progressions-additions (2025-03-17), NC/docs/codex/codex-tracking (2026-03-19), NC/docs/codex/codex-relations (2025-06-26), NC/docs/codex/codex-details (2025-05-09), NC/docs/codex/series-codex (2025-01-31), NC/faq/plan/update-scene-summaries (2025-05-27), NC/faq/codex/codex-export (2026-02-08), NC/docs/plan/planning-with-the-matrix (2025-02-04), NC/docs/models/thinking-settings (2026-01-08); novelcrafter.com/blog/may-2025-new-prompting-system-update (2025-05-09).
14. bibisco [official]: bibisco.com/docs/bibisco-3-release-notes/ (2023-05-31).
15. Novel Factory [official]: novel-software.com/features/, /knowledge-base/using-custom-fields/, /knowledge-base/timelines/, /knowledge-base/the-roadmap/ (n.d.).
16. Scrivener [official]: LL/scrivener/features (n.d.); LL/blog/compiling-your-scrivener-project-the-basics (2022-04-20); LL/blog/how-to-compile-your-scrivener-project-for-print-pdf-or-microsoft-word (2025-12-10); LL/blog/let-me-count-the-ways (2017-10-11); LL/blog/use-dialogue-focus-and-linguistic-focus-to-revise-and-edit-your-writing-in-scrivener (n.d.); LL/scrivener/release-notes?os=macOS (3.5, 2025-10-01).
17. Aeon Timeline [official]: aeontimeline.com/features/narrative-storytelling (©2026).
18. Novelium [official]: novelium.com (©2026).
19. Raptor Write [official]: raptorwrite.com (n.d.).
20. AutoCrit [official]: help.autocrit.com/en/articles/12301831-how-to-create-an-alpha-beta-reader (2025-09-21), /12333513-what-is-the-story-analyzer-plus (2026-04-20), /9802399-how-do-i-compare-to-different-authors-and-genres (2026-03-12); autocrit.com, /pricing/, /series-analyzer/ (n.d.).
21. Marlowe [official]: authors.ai/faq/ (n.d.); authors.ai/author-dashboard/ (2025-08-27, mod. 2026-04-16); authors.ai/introducing-marlowe-3-0-and-the-author-dashboard/ (2025-09-25); authors.ai (mod. 2026-10-09).
22. Fictionary [official]: fictionary.co/support/help-docs/evaluate/ (n.d.).
23. Atticus [official]: AT/12622589-front-and-back-matter-preset-layouts (2025-11-18), AT/15423788-what-is-the-ai-human-written-copyright-template-and-how-do-i-use-it (n.d.), AT/16264622-how-do-i-add-an-ornamental-scene-break (2026-08-07), AT/12684460-does-the-inconsistencies-alert-prevent-export (2025-10-28), AT/12622874-how-to-set-writing-goals-with-atticus (2025-10-20), AT/14472234-how-do-i-change-my-trim-size (2026-04-07), AT/12581917-add-alts-text-to-images-using-atticus (2025-10-14); atticus.io, atticus.io/collaboration-roles (2024-12-03).
24. StoryWith AI [official]: storywith.ai (©2026).
25. Ellipsus [official]: ellipsus.com/plus (n.d.); help.ellipsus.com/support/solutions/articles/205000067298-writing-insights, /205000067239-compare-and-merge-drafts, /205000067275, /205000067276-export-your-work-to-archive-of-our-own (no year).
26. Vellum [official]: vellum.pub, help.vellum.pub/elements/, /text-features/, /text-features/store-link/, /print/auto-layout/ (n.d.).
27. Reedsy Studio [official]: reedsy.com/studio, /studio/format-a-book (n.d.); reedsy.com/faq/studio-app/common-questions/formatting-options (2024-08-29).
28. LocalProse [official]: localprose.com, localprose.com/en (n.d.).
29. iA Writer [official]: ia.net/writer/support/editor/authorship (n.d.); ia.net/topics/authorship-arrives-on-windows (2026-05-30).
30. Grammarly [official]: support.grammarly.com/hc/en-us/articles/29548735595405 (n.d.).
31. VellumProof [official]: vellumproof.com; launch date from runtimewire.com/article/dylan-reed-vellumproof-github-authorship-trail-novelists (2026-08-05) [review].
32. Wavemaker [official]: raw.githubusercontent.com/wavemakercards/wavemaker-v4/main/README.md (pushed 2026-10-03).
33. NovelPad [official]: novelpad.co (n.d.).
34. Yaps [official]: yaps.ai/blog/best-dictation-software-for-writing-a-book (2026-07-15).
35. 4thewords [official]: 4thewords.com (n.d.).
36. BetaBooks [official]: betabooks.co (©2026).
37. ShakespeareAI [official]: shakespeareai.net/blog/ai-sensitivity-reader (2026-07).
38. BookWriter [official]: bookwriter.vip/kdp-ai-disclosure-generator (2026-05-03).
39. Twig [official]: twig.io (©2025).
40. Amazon [official]: aboutamazon.com/news/books-and-authors/amazon-kindle-translate-books-authors (2025-11-06, updated 2026-06-30).
