# Reader knowledge

The hardest part of writing suspense, mystery, thrillers, or unreliable-narrator fiction is holding two knowledge models at once. There's what your **reader** knows — the facts they've accumulated by the end of each chapter. And there's what your **POV character** knows. The gap between them is dramatic irony. Closing the gap is resolution. Inverting the gap (the POV knows things the reader doesn't) often produces confusion.

> *"I'm three chapters into the back half of my mystery and I can't remember whether the reader has figured out Marcus yet, or whether that's still a reveal I'm holding."*

Most writers manage this in their head, badly. The **Reader knowledge** view (Project section in the sidebar — Eye icon) gives you an outside view: a chapter-by-chapter map of where the gap sits, how it grows, and where the reading goes off the rails.

---

## What the view shows

### The chapter map

A horizontal strip of cells, one per chapter, coloured by the chapter's reading:

- **Green — Aligned.** Reader and POV move in lockstep this chapter. Their knowledge sets are roughly the same.
- **Gold — Dramatic irony.** The reader knows something important the POV character does not. Either a new gap just opened, or a sustained gap continues.
- **Red — Reader confused.** The POV knows things the reader doesn't, OR the chapter introduces ambiguity the reader can't resolve. Sometimes intentional, often not.
- **Grey — Neutral.** A transitional / setup / world-building chapter where neither alignment nor a meaningful gap is the point.

Click any analysed cell to open its detail panel.

### The knowledge-growth chart

A two-line graph across chapters showing the cumulative number of facts the reader knows (solid line, accent colour) and the cumulative number the POV character knows (dashed line, gold). The **gap between the lines is the size of the dramatic-irony reservoir** at that point in the story. A widening gap creates suspense; a narrowing one resolves it.

### The detail panel

When you click a chapter, the detail panel below opens with:

- The chapter's status badge.
- The model's **rationale** — one or two sentences naming the central irony, alignment, or confusion in concrete terms.
- The chapter's **POV character** (the model's best guess from the prose).
- Counts: how many facts the reader knows total, how many the POV knows, and how many "active dramatic irony" facts the reader knows but the POV doesn't.
- Two columns of **new facts** — what the reader newly learns this chapter, and what the POV newly learns. These are the deltas; the running totals are accumulated under the hood.

---

## How to use it

### Running an analysis

Click **Analyse manuscript** in the header. JustWrite walks every chapter in order and asks the model:

1. What does the reader already know going into this chapter?
2. What does the POV character already know going into this chapter?
3. Given the prose of this chapter, what's new for each? How does the gap shift?

The analysis is **sequential by design** — each chapter's call needs to see the accumulated state from prior chapters. That means one LLM call per chapter, no parallelism. A 30-chapter book takes 30 sequential calls. The progress bar shows you which chapter is being analysed in real time, and the chapter strip lights up as cells complete.

### Cancelling mid-sweep

Click **Cancel** to stop. The cells that already completed stay analysed — partial results aren't lost. Click **Re-analyse** to start over from chapter one. There's currently no "resume from where I cancelled" — re-analysis is whole-book.

### Re-analysing

When the manuscript changes substantially (you've written several new chapters, or done major revisions), click **Re-analyse**. The prior analysis is cleared and the sweep starts from chapter one again. **Clear** discards the saved analysis without re-running.

### Jumping into the editor

The chapter title in the detail panel is a link — click it to open that chapter in the editor.

---

## What the analysis catches and what it doesn't

The model is honest about its uncertainty. It's instructed to:

- Be selective — list only facts that materially shift understanding, not every detail
- Skip ambiguous "I'm not sure if this counts" cases
- Use the rationale to name the central pattern in concrete terms

What it's **good at**:

- Catching dramatic irony you've forgotten you set up (the reader figured out Marcus four chapters ago and you've been writing Elena as if he's still a sympathetic character)
- Showing the shape of a mystery — when does the reader pull ahead of the protagonist, when does the protagonist catch up
- Identifying chapters where a POV character knows things the reader hasn't been shown — sometimes intentional (a withheld reveal), sometimes a continuity slip
- Mapping series-of-reveal pacing

What it's **less reliable at**:

- Subtle implicational reading ("the reader will infer X from these three details") — the model tends to under-count these
- Stylistic / tonal irony that doesn't translate to a fact
- Distinguishing between facts the reader has actually grasped vs. facts that were technically on the page but easy to miss

Treat the analysis as a **second opinion**, not a verdict. The model is reading the manuscript without genre instinct, prior expectation, or the wider context of your readership. Useful inputs, not gospel.

---

## When to run it

- **First time:** at the end of your first complete draft. Before you've revised, before you've shown anyone. The pattern of dramatic-irony chapters tells you about the structure of your reveals.
- **During revision:** if you suspect a chapter "isn't landing", check whether the model classifies it the way you intended. A scene you wrote as suspenseful that comes back as "aligned" may be missing the gap that creates the suspense.
- **Between drafts:** re-run after any significant revision pass that adds, removes, or reorders reveals.

Don't run it after every typo — it's a structural lens, not a line-edit tool.

---

## Routing the AI provider

The Reader knowledge analysis is its own routable feature — pick its model under **Routing by feature** on the AI settings page. A stronger cloud model (Claude, GPT-4) materially improves the accuracy of the fact extraction over smaller local models — the task requires real reading comprehension, not just text manipulation. If you're cost-conscious, pin only this feature to the heavier model and leave Writer actions / Critique on a cheaper one.

The footer of each chapter entry records which model produced that analysis.

---

## See also

- **[Analysis](analysis.md)** — the deterministic-stats dashboard (pace, style metrics, cast presence)
- **[Markers](markers.md)** — including the **Find dangling threads** scan that complements this one
- **[AI providers](ai-providers.md)** — provider routing and per-feature pins
