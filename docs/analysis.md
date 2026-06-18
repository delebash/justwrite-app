# Analysis

The **Analysis** view (Project section in the sidebar) is a dashboard of objective data about your manuscript — how much you've written, how fast, how the chapters are structured, and what your prose patterns look like.

Most of it is calculated locally from the text. The AI-powered passes — story tension, reverse outline, beat sheet, plot-hole audit, marketing pack, and the Voice-drift explainer — are opt-in; nothing calls a provider until you ask.

This page won't change anything about your writing. It is a mirror. What you do with what you see is up to you.

---

## What's on the dashboard

### Top: the KPI row

Four numbers at the very top, always visible:

- **Total word count** and percent of your **word goal** (set in Settings → Project → Goals)
- **Chapters done** vs **total chapters**
- **Average chapter length**
- **Daily writing pace** over the time window you've selected

These are the project's vital signs.

### Pace chart

> *"I feel like I've been writing every day, but I'm not sure I'm actually making progress — or if I've quietly stopped."*

A line graph of words written per day. A segmented control switches between **14 / 30 / 90 days**.

Below the graph: total words in the window, average per day, peak single day.

Populated automatically as you write — no manual logging required.

**Why a writer would care.** The 14-day view shows your current rhythm. The 90-day view shows whether you're maintaining it. A flat 90-day pace with a steep recent dip is a more reliable warning sign than your gut.

### Writing year heatmap

> *"I think of myself as someone who writes consistently. I'm a little afraid to find out if that's actually true."*

A GitHub-style 53-week grid, every day of the past year as a small square. Each square is shaded by how much you wrote that day, on a 5-tier scale from none (blank) to peak (deep colour). Month labels and day-of-week labels are shown. Hover any cell to see the date and exact word count.

**Why a writer would care.** Long blank stretches are obvious. So are streaks. So is the pattern of "I write a lot for two weeks and then nothing for a week" — which is useful information about your real working style.

### Milestones

> *"I've been at this for four months. Am I anywhere near a complete draft, or am I still in the foothills?"*

A horizontal bar showing progress toward standard fiction milestones (10k, 25k, 50k, 75k, 100k, 125k, 150k words). Plus:

- Progress bar to the next milestone
- A visual grid of all milestones with checkmarks on hit ones
- Current writing streak (consecutive days with words written)
- Lifetime total words written in the project
- Total writing days

**Why a writer would care.** Milestones are silly and they work. Hitting 50,000 is the difference between a draft and a sketch; hitting 100,000 is a novel. The streak chart can be a motivator or a tyrant — use it as motivation, ignore it when it would push you to write badly.

### Chapter status donut

> *"I've revised a lot of chapters. But I've lost track — how many are actually done versus just touched?"*

A donut chart showing the proportion of chapters by status (Done / Revise / Draft / To-do), with exact counts.

**Why a writer would care.** A glance shows how close you are to a finished draft. In revision, it tracks how many chapters still need work.

### Narrative strand distribution

> *"My B-plot feels thin, but I don't know if that's a real structural problem or just my anxiety talking."*

A horizontal bar chart showing how many **words and chapters** each narrative strand contains, proportional to the total.

**Why a writer would care.** This is a structural diagnostic. If your main plot has 80% of the words and your B-story has 5%, your B-story is probably underweight. If a thematic strand has 60%, something is out of balance.

### Words per chapter

> *"Some of my chapters feel enormous and some feel like nothing. I don't know if the variation is intentional or if I just lost control of the pacing."*

A bar chart with one bar per chapter, colour-coded by narrative strand, with the exact word count. Clicking a chapter opens it in the editor.

**Why a writer would care.** Wildly uneven chapter lengths are sometimes deliberate (a punchy short chapter for impact). Often they aren't, and a 12,000-word chapter next to a 1,500-word one is a sign the long one needs splitting or the short one needs more.

### Style and pacing metrics

> *"I know I overuse filter words and adverbs. I just don't know which chapters are the worst offenders."*

A per-chapter sortable table with book-level summary pills at the top. Columns:

- **Word count**
- **Average sentence length**
- **Average paragraph length**
- **Dialogue ratio** — what percentage of words are inside dialogue
- **Filter words per 1,000 words** — distancing phrases like "she saw", "he felt"
- **Adverbs per 1,000 words**
- **Passive voice per 1,000 words**
- **POV hint** — auto-detected as 1st person, 3rd person, or mixed

All metrics are calculated locally from the text — no AI call.

**Why a writer would care.** These metrics are noisy at small word counts and meaningful at scale. They're most useful in **revision**:

- A chapter with much higher filter words per 1,000 than your book average is a good revision target.
- A chapter with abnormally high adverbs is doing telling work it could do better with showing.
- A jump from 8% to 40% dialogue ratio between adjacent chapters often signals a structural shift you should be aware of.
- The POV hint is a sanity check — if you're writing third-person and a chapter reads as first-person, the metric will catch it.

Sort by any column to find outliers fast.

### Story tension

> *"My second act drags and I can't tell exactly where."*

JustWrite's Critique modal in the chapter editor already scores each chapter for **tension** (1–10), **hook quality** (1–10), **pacing** (slow / balanced / fast), and **ending class** (cliffhanger / soft / closed / dead-end). The **Story tension** section in Analysis is the manuscript-wide rollup — once you've run the structural pass on multiple chapters, you get a story arc you can actually read at a glance.

The section header has an **Analyse N chapters** button that finds every chapter without a structural score yet and runs the structural pass on them, one at a time. Sequential — one LLM call per chapter — so longer books take a while. Cancellable mid-sweep with partial results preserved. **Re-analyse all** forces a fresh pass on every chapter.

Once you have data:

- **Stats row** — average tension, average hook quality, the peak-tension chapter, the lowest-tension chapter. The peak/lowest are clickable to jump straight into the chapter.
- **Two-line chart** — tension across chapters (solid red) and hook quality (dashed gold). Faint dashed gridlines at 3 and 7 mark the "weak" and "strong" thresholds. The two lines together show the shape of the book — a story whose tension never crosses 6 has different problems from one whose tension is 9 by chapter 4.
- **Per-chapter strip** — one coloured cell per chapter showing pacing at a glance (slow / balanced / fast), with a small corner badge for the ending class (**C**liffhanger · **S**oft hook · **C**losed · **D**ead-end). Click any cell to open that chapter.

**Why a writer would care.** Story shape is one of the things you can't see from inside the draft. The classic "the middle sags" or "the climax doesn't land" complaints usually map to a tension curve that flattens at the wrong place, or peaks too early, or never peaks at all. Seeing the arc charted lets you point at the actual chapter that's dragging instead of vaguely revising the middle of the book.

The structural analysis itself is routable as the **critique** feature in Settings → AI (it shares the pin with the per-chapter Critique modal). A long-context cloud model produces noticeably better structural reasoning than small local models — for this specific feature, the per-chapter cost is worth pinning to your strongest available model.

The Story tension section header also carries four structural-analysis buttons that open full-book LLM modals: **Reverse outline** (the act structure the book actually has), **Map to beat sheet** (mapped to Save the Cat / Hero's Journey / 7-Point), **Plot-hole audit** (see below), and **Marketing pack** (logline / blurbs / synopsis / pitch — see below). Each modal persists its result on the project so re-opening reads from cache.

### Reverse outline — the shape your book actually has

> *"I'm a pantser. I finished 90,000 words and I'm honestly not sure what structure I've ended up with."*

The Story tension chart shows the *curve* of the book. The **Reverse outline** button (in the Story tension section header) does the complementary structural job: reads the manuscript through chapter summaries and tension data, then produces the act structure your book actually has — not the structure it should have. One LLM call over the whole-book digest.

The modal returns:

- A **structure name** — three-act, five-act, or "loose / episodic". The model picks based on what the book actually does; it won't force a three-act reading onto a genuinely episodic book.
- A **2–3 sentence summary** of the book's shape in concrete terms (where it starts, where it pivots, where it lands).
- A **plot points list** — Inciting incident, Plot point 1, Midpoint, Plot point 2, Climax, Resolution, etc. Each with the chapter it lands in (clickable to jump) and one sentence on what specifically happens there.
- A **chapter-by-chapter strip** with **act-break dividers** showing one sentence per chapter on its purpose in the overall shape.

**Why a writer would use it.** Pantsers (writers who draft without a detailed outline) often finish a draft and genuinely don't know what they've built. The reverse outline is the answer to "what shape is this?" — a structural editor's first-pass reading you can use as the foundation for your revision plan. It's also useful for plotters: comparing what you intended (your pre-draft outline) against what you actually wrote (the reverse outline) reveals where the book diverged from the plan.

**Cost note.** This sends a digest of every chapter in one call. On long books the prompt can get large; pin to a long-context model. The model is told to be honest — if the book has structural problems (no clear inciting incident, climax that lands too early), the summary will say so plainly. Routable as the **reverseOutline** feature in Settings → AI. The result persists on the project so re-opening the modal reads from cache.

### Map to beat sheet — fit the draft to a named framework

> *"I want to know if my draft hits the Save the Cat beats, or where it doesn't."*

The reverse outline names whatever structure the book actually has. The **Map to beat sheet** button does the complementary job — maps the draft to a *specific* named narrative framework you pick from a dropdown, and explicitly flags which beats the book is missing.

Three frameworks ship:

- **Save the Cat** — Blake Snyder's 15-beat sheet. Built for commercial film, widely used in genre fiction. Beats include Opening Image, Catalyst, Break Into Two, Fun and Games, Midpoint, Bad Guys Close In, All Is Lost, Dark Night of the Soul, Break Into Three, Finale, Final Image.
- **Hero's Journey** — Christopher Vogler's 12-stage adaptation of Joseph Campbell's monomyth. Strong for fantasy, sci-fi, and mythic structure. Stages from Ordinary World through Return with the Elixir.
- **7-Point Story Structure** — Dan Wells's compressed framework: Hook, Plot Turn 1, Pinch 1, Midpoint, Pinch 2, Plot Turn 2, Resolution. Easy to apply; good for short novels and series planning.

For each beat the modal shows: the beat name, its canonical definition, which chapter best fulfils it (clickable to jump), and a one-sentence justification quoting something specific from that chapter. Beats with no matching chapter get a **MISSING** badge in red with a short reason why the book doesn't cover them.

**The model is instructed to be honest about gaps.** A clean map of every beat is suspicious — most drafts genuinely miss 1–3 beats — and the summary at the top tells you the count ("12 of 15 covered. All Is Lost is missing; the protagonist's lowest point isn't on the page."). Change the framework dropdown to compare how the same draft maps to different structures; each mapping persists separately on `project.beatSheets[templateKey]`, so all three can be on file at once.

**Why a writer would use it.** During revision, after the reverse outline has shown you the structure you actually have. If your reverse outline says "loose / episodic" and you wanted a tight three-act structure, the beat-sheet overlay tells you exactly which beats you're missing. If you wrote to a beat sheet originally but feel the draft has drifted, the overlay tells you what fell out.

**Cost note.** Same shape as Reverse outline — one LLM call over the whole-book digest. Routable as the **beatSheet** feature in Settings → AI.

### Plot-hole / continuity audit

> *"I contradicted myself three chapters ago and I still don't know it."*

The **Plot-hole audit** button (next to Reverse outline and Beat sheet) runs a one-pass continuity scan over the whole-book digest plus a tail of each chapter's actual prose. Reverse outline names the shape; the plot-hole audit looks for things that are *broken* — facts that contradict each other across chapters.

The audit returns findings categorised by kind:

- **Contradiction** — two prose moments that can't both be true
- **Timeline** — events happen in an order or pace the text can't support (a journey takes hours described as days; a year passed but characters reference it as days)
- **Continuity** — small drift in a detail across chapters (eye colour, scar, weather, season)
- **Character knowledge** — a character acts on information they couldn't yet have
- **Object** — an object appears, disappears, or changes hands without explanation
- **Other** — anything else the model flags

Each finding has a **severity** (Flag / Suggestion / Note), the **chapter numbers** whose content collides (clickable to jump), a verbatim **evidence** quote, and a one-line **cheapest fix** suggestion. Findings group by severity in the modal — Flags first, Suggestions second, Notes last.

**Dismiss** removes individual findings from the default view (they persist on the project; **Show dismissed** brings them back). **Re-run** clears the audit and regenerates against the current draft state.

**Why a writer would care.** Continuity drift is the kind of mistake nobody notices in their own draft because the *intent* of each scene was right at the time you wrote it. The audit catches the kind of thing a fresh beta reader would notice on first read — the things readers actually email you about three months after publication. The model is instructed to be selective and honest; a clean audit is meaningful, padded findings are noise. A draft that returns 0–3 findings is normal; 10+ is the signal you have real revision work to do.

**Cost note.** One LLM call over the digest plus tails. The prompt is longer than Reverse outline because of the prose tails, so pin to a long-context model if you can. Routable as the **plotHoles** feature in Settings → AI.

**World rules to enforce.** SFF writers can declare in-world constraints — magic-system rules, hard SF physics, technology limits, social structures — in a collapsible textarea on the modal ("World rules to enforce"). When non-empty, the audit checks each chapter against those rules in the same pass. *"Magic requires a physical cost — wounds, age, exhaustion. No magic is free."* If a chapter breaks a rule but the prose **earns the exception** (a cost paid, a workaround, a stated bypass), it's not flagged. The model is told to distinguish unearned violations from costed ones. Leave the field blank for non-SFF projects — the rest of the audit runs identically. The rules persist on the project, so the writer fills it in once and every subsequent scan picks it up.

#### Marketing pack — logline, blurbs, synopsis, pitch

> *"I've finished the draft. Now I have to write a query letter, a synopsis, a back-cover blurb, and an elevator pitch. I'd rather rewrite a chapter."*

Marketing copy is its own skill set, and it's one most writers don't have. The **Marketing pack** button on the Story tension header opens a modal that generates the four artifacts a writer needs to query agents and pitch publishers — in one LLM call, from the same chapter digest the other structural modals use.

The pack returns:

- **Logline** — one sentence, 15–30 words: protagonist + central conflict + stakes. The version you put at the top of your query.
- **Three back-cover blurbs**, ~150 words each, at three different angles so you can pick or splice:
  - **Hook-driven** — leads with the central conflict or question; closes with stakes.
  - **Character-driven** — leads with the protagonist; closes with what they stand to lose.
  - **Premise-driven** — leads with the world or situation; closes with the human pull.
- **One-page synopsis** — ~600 words, present tense, third person, **includes the ending**. Agents need it; don't tease.
- **Three-paragraph elevator pitch** — ~250 words: paragraph 1 is the hook, paragraph 2 is the spine, paragraph 3 is why-this-book-matters and the comp register.

Each artifact has a **Copy** button that drops it onto the clipboard with a confirmation toast. The pack persists on the project so re-opening the modal reads from cache; **Regenerate** asks for a fresh pass after revisions; **Clear pack** wipes the cached set.

**Why a writer would use it.** The blurbs and synopsis aren't your final marketing copy — they're a strong first draft you edit. The model has read your entire book; it knows what it's about. Most writers find it easier to react to and revise a generated pack than to write one cold. The three blurb angles in particular often surface the framing that *should* go on the back cover, even if the words need work.

**The model is instructed to avoid AI-tell phrases**, but you should still run the result through the [Find AI tells](markers.md) scanner before sending anywhere. Routable as the **marketingPack** feature in Settings → AI.

**Comp titles** ride along in the same modal. The pack returns 3–6 comparable titles — book + author + year + a one-sentence rationale naming the specific craft connection (structure, voice, register, subgenre, protagonist archetype). Each comp carries a **confidence label** (high / medium / low) that's the model's own self-assessment of whether the title-and-author combination is real. A red **verification warning** sits above the list because models confidently invent comp titles that don't exist or misattribute them — treat the suggestions as a *starting point for research*, not a finished list. Agents want comps from the last 5 years and prefer mid-list to bestsellers; a generated comp older than that or aimed at a mega-hit ("like Gone Girl") is a signal to find a more recent or more specific equivalent.

### Voice drift

> *"I drafted Chapter 1 six months ago and Chapter 20 last week. Has my voice drifted?"*

The longer the draft, the harder it is to see your own prose from the outside. You've been deep in chapter 20 for the past month; you can't remember what chapter 3 sounded like. Voice drift across a long book is real — your sentence rhythm tightens or loosens, your dialogue ratio shifts, you stop reaching for filter words because you've internalised the lesson — and it shows up as inconsistency to a reader.

The **Voice drift** section visualises the per-chapter shape of every metric Style & pacing measures (sentence length, paragraph length, dialogue ratio, filter words, adverbs, passive voice). For each metric you get:

- A **sparkline** of values across chapters, one point per chapter.
- A **mean line** (dashed) showing the book-wide average for that metric.
- A **±1 standard deviation band** (faint accent fill) around the mean — the "typical for this writer in this book" range.
- **Outlier dots in red** — chapters that sit more than 1 standard deviation from the mean on this metric.
- A **trend chip** showing whether the metric is rising, falling, or flat across the manuscript (computed by comparing the early third's mean to the late third's). A consistent rise in dialogue plus a consistent fall in filter words is a real voice shift; pay attention.

Underneath the metric strips, the **Hot chapters** list calls out chapters that are outliers on **two or more metrics** at once. One outlier metric is often noise — a single dialogue-heavy interrogation scene, say. Two or more is a pattern.

For any hot chapter, click **Explain** to send the outlier's prose plus a sample of your baseline chapters to the model. It comes back with 2–4 sentences naming the specific shift in concrete terms ("Your voice in Chapter 18 has moved toward action over interiority — paragraphs end on physical beats rather than the protagonist's reflection, and there's almost no use of filter words like 'noticed' or 'realized' that anchor your earlier chapters"). Quotes phrases from both sets to ground the diagnosis.

**Why a writer would care.** Voice drift isn't necessarily bad — sometimes it's deliberate (the climax SHOULD read differently from the opening). But unintended drift is the kind of thing readers notice without being able to name. Catching it during revision is much cheaper than catching it in a copyedit pass, and much cheaper still than catching it in reviews.

The metric analysis is **pure deterministic** — no AI required. The Explain button is the only AI piece, and only fires when you click it. Routable as the **voiceDrift** feature in Settings → AI.

### Cast presence heatmap

> *"My deuteragonist had a big arc in the first half. Did I actually follow through on it in the second half, or did she quietly disappear?"*

A grid: every character along one axis, every chapter along the other. Each cell shows whether the character appears in that chapter:

- Blank — absent
- Light shading — mentioned
- Full colour — featured

Hover a cell for the exact mention count. Click to open the chapter or the character's profile.

Presence is fed by prose mentions (the `@` linking system) and explicit scene → character links.

**Why a writer would care.** This is the structural diagnostic for character distribution. Spot:

- A major character who **drops out for a long stretch**. Intentional? Or did you forget about them?
- A **B-plot character** who is only in chapters 4 and 18 — they don't have an arc, they have two appearances.
- An **ensemble cast chapter** with many lit cells — usually a turning point.
- A **single-character chapter** at the climax — usually a deliberate intimate moment.

### Scenes per chapter

> *"Chapter 14 feels choppy and Chapter 7 feels like it never moves. I want to know if my scene count is actually the problem."*

A bar chart grid — one entry per chapter, showing how many scenes it contains.

**Why a writer would care.** A chapter with 12 scenes is structurally very different from one with 1 long scene. The chart shows you which chapters use which rhythm. Outliers worth examining.

---

## When Analysis is most useful

- **Not on day one.** With 5,000 words written, most metrics are noise.
- **Around the 25,000-word mark**, the pace and style data start to mean something.
- **Throughout revision**, the style and pacing table is genuinely actionable — sort by filter words, fix the worst, move on.
- **Before final draft**, the cast presence heatmap catches structural problems that are otherwise easy to miss.

---

## What requires AI

Almost nothing. Specifically:

- **Pace chart, milestones, streak, heatmap** — all local
- **Chapter status donut, strand distribution, words per chapter** — all local
- **Style and pacing metrics, scenes per chapter** — all local
- **Voice drift metrics + sparklines + hot-chapters list** — all local. The optional **Explain** button per hot chapter is one of two AI surfaces in the dashboard
- **Story tension chart + per-chapter strip** — reads from data already on `chapter.critique.structure`. The **Analyse N chapters** button runs the structural pass on chapters that don't have one yet (the other AI surface in the dashboard)
- **Cast presence heatmap** — all local. Built from the `@` mention layer and explicit scene → character links

---

## See also

- **[Writing](writing.md)** — the editor that feeds the word counts and session log
- **[Reader knowledge](reader-knowledge.md)** — the dramatic-irony map (separate view, LLM-powered)
- **[Plot and time](plot-and-time.md)** — strand tagging that powers strand distribution
