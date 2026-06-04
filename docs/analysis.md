# Analysis

The **Analysis** view (Project section in the sidebar) is a dashboard of objective data about your manuscript — how much you've written, how fast, how the chapters are structured, and what your prose patterns look like.

Most of it is calculated locally from the text. None of it requires an AI provider except for the dialogue-vs-narration breakdown, which uses the Studio speaker analysis.

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

A line graph of words written per day. A segmented control switches between **14 / 30 / 90 days**.

Below the graph: total words in the window, average per day, peak single day.

Populated automatically as you write — no manual logging required.

**Why a writer would care.** The 14-day view shows your current rhythm. The 90-day view shows whether you're maintaining it. A flat 90-day pace with a steep recent dip is a more reliable warning sign than your gut.

### Writing year heatmap

A GitHub-style 53-week grid, every day of the past year as a small square. Each square is shaded by how much you wrote that day, on a 5-tier scale from none (blank) to peak (deep colour). Month labels and day-of-week labels are shown. Hover any cell to see the date and exact word count.

**Why a writer would care.** Long blank stretches are obvious. So are streaks. So is the pattern of "I write a lot for two weeks and then nothing for a week" — which is useful information about your real working style.

### Milestones

A horizontal bar showing progress toward standard fiction milestones (10k, 25k, 50k, 75k, 100k, 125k, 150k words). Plus:

- Progress bar to the next milestone
- A visual grid of all milestones with checkmarks on hit ones
- Current writing streak (consecutive days with words written)
- Lifetime total words written in the project
- Total writing days

**Why a writer would care.** Milestones are silly and they work. Hitting 50,000 is the difference between a draft and a sketch; hitting 100,000 is a novel. The streak chart can be a motivator or a tyrant — use it as motivation, ignore it when it would push you to write badly.

### Chapter status donut

A donut chart showing the proportion of chapters by status (Done / Revise / Draft / To-do), with exact counts.

**Why a writer would care.** A glance answers "how close am I to a finished draft?" In revision, it tracks how many chapters still need work.

### Narrative strand distribution

A horizontal bar chart showing how many **words and chapters** each narrative strand contains, proportional to the total.

**Why a writer would care.** This is a structural diagnostic. If your main plot has 80% of the words and your B-story has 5%, your B-story is probably underweight. If a thematic strand has 60%, something is out of balance.

### Words per chapter

A bar chart with one bar per chapter, colour-coded by narrative strand, with the exact word count. Clicking a chapter opens it in the editor.

**Why a writer would care.** Wildly uneven chapter lengths are sometimes deliberate (a punchy short chapter for impact). Often they aren't, and a 12,000-word chapter next to a 1,500-word one is a sign the long one needs splitting or the short one needs more.

### Style and pacing metrics

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

### Cast presence heatmap

A grid: every character along one axis, every chapter along the other. Each cell shows whether the character appears in that chapter:

- Blank — absent
- Light shading — mentioned
- Full colour — featured

Hover a cell for the exact mention count. Click to open the chapter or the character's profile.

Presence is fed by **both** prose mentions (the `@` linking system) **and** the Studio speaker analysis where available. So a character who is referred to in dialogue but never named in narration still shows up if Studio has analysed that chapter.

**Why a writer would care.** This is the structural diagnostic for character distribution. Spot:

- A major character who **drops out for a long stretch**. Intentional? Or did you forget about them?
- A **B-plot character** who is only in chapters 4 and 18 — they don't have an arc, they have two appearances.
- An **ensemble cast chapter** with many lit cells — usually a turning point.
- A **single-character chapter** at the climax — usually a deliberate intimate moment.

### Dialogue vs. narration breakdown

A stacked bar showing the book-wide split between dialogue, narration, and interior thought as a percentage of word count. Plus a per-chapter row for each chapter that's been analysed.

This section **requires Studio → Script analysis** on at least one chapter. Without that, you get a prompt to run the analysis. With it on every chapter, you get a complete picture.

**Why a writer would care.** Dialogue-heavy chapters and narration-heavy chapters do different work. If your action sequences are mostly narration, that's normal. If your climax is mostly interior thought, that may be the problem you couldn't put a finger on. The per-chapter breakdown shows you which chapters are which.

### Scenes per chapter

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
- **Cast presence heatmap** — partially. The mention layer is local; the Studio speaker layer requires Studio → Script to have been run, which uses an LLM
- **Dialogue vs. narration breakdown** — requires Studio → Script

If you don't run Studio analysis, the dashboard still works; the dialogue breakdown just stays empty.

---

## See also

- **[Writing](writing.md)** — the editor that feeds the word counts and session log
- **[Audio Studio](audio-studio.md)** — the Script analysis that powers cast presence and dialogue breakdown
- **[Plot and time](plot-and-time.md)** — strand tagging that powers strand distribution
