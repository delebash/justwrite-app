# Writing

This is the heart of JustWrite — the dashboard that tells you where you are, the chapter list, the editor itself, and the AI tools that sit inside it. If you only ever read one page of this guide, make it this one.

---

## Home

**Home** is your daily landing page. The sidebar's Manuscript section has a Home item; click it whenever you sit down to write.

What you see at the top:

- **Your manuscript's title** — click to rename inline.
- **A progress ring** — what fraction of your word goal you've hit. The goal is set in **Settings → Project → Goals**.
- **A chapter-status bar** — a horizontal bar showing the proportion of your chapters that are Done, in Revise, in Draft, or still To-do. The deadline you set in Settings appears as a clickable link.
- **Resume writing** — a card that surfaces the chapter you worked on today (or your last-open chapter as a fallback). Click the button to jump straight back into the editor at the right scene.
- **Previously on your novel** — an AI-written orientation paragraph that helps you re-enter the story after time away. See below.

Below those:

- **Today's session** — words written today, current writing streak, last 14 days total, and a 14-square activity heatmap. The card has a **Wrap up session** button that generates an end-of-day AI recap — see below.
- **The fortnight** — a 14-day sparkline of your daily word counts.
- **Cadence** — a bar chart of your average word count by day of the week. Your best day is highlighted in gold.
- **Narrative strands** — a row per strand with a progress bar showing how many chapters that strand appears in.

**Why this matters for a writer.** The cadence chart often reveals something surprising — that you actually write more on Sundays than on weekdays, for example, or that your Mondays are wasted. Use that information to plan your week. The strand bars are a quick visual check that your subplots are distributed evenly through the book; if one strand has zero chapters for the last quarter of the book, that's a red flag worth investigating.

### "Previously on your novel"

> *"I closed the laptop two weeks ago mid-chapter. I can't remember what I was building toward, who's mad at whom, or which threads I left dangling."*

When you return to a novel after a break — even a short one — there's a re-entry tax. The story is no longer warm in your head; you have to reload it before you can write. This card hands you that reload, automatically.

When you open Home, JustWrite generates a 150–250 word **briefing** addressed to you ("You left off in the middle of the rooftop confrontation. Elena still suspects Marcus…"). It's grounded in real project state — the chapter you last wrote in, the closing passage of that chapter, your active characters, your open narrative strands, and any **Loose thread** or **TODO** markers in the surrounding chapters. It ends with one concrete next-action suggestion: a scene to write, a thread to pay off, a decision to make.

**How it behaves:**

- **It only runs when there's something to brief on.** A brand-new project with no writing yet, or no AI provider configured, doesn't show the card.
- **It caches for the day.** The first time you open Home, the briefing is generated and saved. Same-day reloads reuse the cached prose — no repeat AI charges. The cache refreshes automatically the next day, or whenever you write in a different chapter.
- **Dismiss hides it until tomorrow.** Click the **×** in the top-right corner if you don't want the card today. It comes back the next day.
- **Regenerate** asks for a fresh briefing right now — useful if the first one missed the mark or if you've made progress since.
- **Click the meta line** ("3 days ago · Chapter 7 — The rooftop") to jump straight into that chapter.

**Why a writer would use it.** Most writers re-orient by scrolling back and re-reading the last chapter, which is slow and easy to skip on a busy day. A two-paragraph briefing closes the gap in about 20 seconds and explicitly names what's at stake and what's open — including the threads you'd planted and forgotten about. It also catches your own **Loose thread** pins from previous sessions, so the markers you dropped in the heat of drafting actually come back to you when you sit down to write.

The model used is whichever provider you've pinned for **briefing** in **Settings → AI** (or your default LLM provider if none is pinned). The footer of the card names it.

### "Wrap up session" — end-of-day recap

> *"I closed the laptop in the middle of a scene and tomorrow I'll forget half of what I just set up — the foreshadowing, the small promises, the decisions I almost made."*

The mirror image of the resume briefing. Where "Previously on your novel" looks back at where you left off, **Wrap up session** looks at what you just did and helps you hand it off cleanly to tomorrow.

Click **Wrap up session** on the **Today's session** card. JustWrite generates a 150–300 word AI recap of today's writing addressed to you ("You wrapped up the rooftop confrontation. Elena chose to keep the locket secret…") and a list of **open threads** — verbatim snippets from today's prose that look like setup-without-payoff.

**For each open thread you can click "Pin"** to drop a **Loose thread** marker directly into the chapter at the exact phrase the AI quoted. The phrase becomes a coloured dotted underline; clicking it later opens the marker popover for editing or resolving. **Pin all** drops markers on every unmarked thread at once. Threads whose snippet can't be located in current prose (because you've since edited that passage) show **Not found** instead of a button.

The recap also persists. Tomorrow's **Previously on your novel** card folds your own wrap-up note into its briefing context, so the AI orienting you back into the story has access to the exact framing you used at the end of the previous session. The two features form a session loop — wrap up at night, get oriented in the morning, with your own words carrying the thread.

**How it behaves:**

- **Eligibility.** The button only enables when you've written at least one word today. Pure-reading days don't have a recap.
- **Caches for the day.** Once generated, today's recap is saved on the project. Re-opening the modal reads from cache; **Regenerate** asks for a fresh pass.
- **Persists across sessions.** Recaps are stored per-day and don't roll back when you undo prose changes — they're append-only by design.
- **Discard recap** in the footer wipes today's saved recap if it missed the mark or you don't want it folded into tomorrow's briefing.
- **Routable** as the **recap** feature in Settings → AI. A small, fast local model is plenty here.

**Why a writer would use it.** The pieces you forget overnight are exactly the ones you should remember — the throwaway line that's actually a setup, the decision you almost-made-but-deferred, the character moment that didn't get its reaction. The recap catches these and converts them into manuscript-anchored markers so tomorrow's draft inherits the throughline you built today, rather than restarting from scratch.

---

## Chapters

The **Chapters** view is the main writing surface. Open it from the sidebar, or jump straight in from Home's Resume button.

### The view modes

A segmented toggle at the top of the page switches between four modes. They show the same chapter; only the lens changes.

- **Edit** — the writing surface. The default.
- **Outline** — a tree view of every Part, Chapter, and Scene in your manuscript. Inline-editable titles. Drag to reorder. Click any chapter to open it in Edit mode.
- **Cards** — a corkboard view. Each scene appears as a card with a small prose excerpt. Drag cards to reorder scenes within a chapter. Useful for restructuring without committing to a new layout.
- **Read** — a clean read-only view, no editor chrome. Two sub-scopes: **Chapter** (one chapter at a time with Previous/Next) and **Whole book** (the entire manuscript in one continuous scroll, with the sidebar tracking what scene is visible).

**Why a writer would care.** Outline is your planning lens — sketch chapter and scene titles before you write anything. Cards are your editing lens — physically arrange the order of scenes inside a chapter. Read is your reviewing lens — see what your prose actually sounds like without the formatting clutter. Most writers default to Edit and dip into the others as needed.

### The Outline tree

In Outline mode you can:

- Inline-rename any Part, Chapter, or Scene by clicking on its title.
- Reorder Parts with up/down controls.
- Move a chapter from one Part to another with a dropdown.
- Add a new Part, Chapter, or Scene with `+` buttons.
- Click any chapter to open it in Edit mode.

### Splitting a chapter

> *"This chapter ballooned to 8,000 words while I wasn't paying attention. I need to break it in two without losing the scenes."*

If you imported a long single-blob document, or you wrote a chapter that is now too long, the editor has a **Split chapter** action. Place your cursor where you want the split, run the command, and JustWrite asks for a title for the new chapter that comes after. The split happens cleanly; both halves keep their scenes.

---

## The editor

When you click into a chapter, you see the editor: a TipTap-powered rich-text writing surface with a full toolbar.

### Toolbar buttons

From left to right (approximate; some buttons collapse into menus on narrower windows):

- **Bold, Italic, Underline, Strikethrough, Subscript, Superscript**
- **Heading levels** (H1 / H2 / H3) — for non-chapter headings inside your prose
- **Font size** — decrease/increase, with the live size shown
- **Blockquote, Bullet list, Ordered list, Task list**
- **New scene boundary** (only visible in continuous-chapter mode) — inserts a divider between scenes
- **Alignment** — left / centre / right / justify
- **Highlight** — multi-colour text highlighting
- **Text colour**
- **Link**
- **Image insert** — embed an image inline
- **Table**
- **Clear formatting**
- **Copy / Cut / Paste**
- **Print**
- **Inline comment** — attach a private note to selected text; the marked text is visually distinguished and clicking it shows the note in a popover
- **Find / Replace bar** — search within this chapter
- **Focus mode** — distraction-free full-screen writing
- **Editor settings** — per-document overrides for font, size, line spacing, layout (Page or Full-width)
- **Undo / Redo**

### The bubble menu

Select any text and a small floating menu appears next to your selection with the formatting palette — bold, italic, underline, text colour, font size, link, comment. The bubble is formatting only; the AI actions live in the scene strip's **AI** dropdown (see below) so they're one click away even when you don't have a selection yet.

### `@`-mentions

> *"I typed a character's name in chapter 12. Three chapters later I've forgotten whether I spelled it consistently — and I can't find all the places she appears."*

Type **`@`** anywhere in the editor and a picker appears. Search across your entire Story Bible — characters, locations, objects, groups, strands. Pick one to insert a linked mention.

A mention is more than text: it tells the rest of the app that this entity appears in this scene. Open the character's page later and you'll see every scene they were mentioned in, with the surrounding prose as a snippet.

### Inline comments

> *"I want to flag this paragraph as 'rewrite this' without stopping to open a note — I'm in the middle of a sentence."*

Highlight any text and click the comment button (or use the bubble menu). Type your note. The text is now visually marked; click it later to read the note. Comments are private — they never appear in exports.

Use comments for notes-to-self ("rewrite this passage"), questions you want to come back to ("verify the timeline here"), or research reminders ("look up Victorian medical practice").

### Continuous-chapter mode

> *"I don't think in scenes. My chapter is one long flow and the scene-by-scene view keeps interrupting me."*

By default the editor shows one scene at a time. The **Continuous** toggle stitches every scene in the current chapter together into one document with visible dividers between scenes. Useful when:

- You think in flowing chapters rather than discrete scenes.
- You want to read or revise a whole chapter top-to-bottom without clicking between scenes.
- You want to merge two scenes (delete the boundary) or split one (insert a new boundary mid-scene).

The **New scene** toolbar button (or Ctrl/⌘ + Shift + Enter) inserts a boundary at the cursor.

### The scene strip

Above the editor, a thin bar shows scene-level controls. From left to right:

- **Previous / Next scene** navigation
- The current scene number and status, colour-coded
- **[AI]** — opens the AI dropdown (Rewrite, Expand, Tighten, Continue, Line edits — see below)
- **Status** select — the scene's status (To-do / Draft / Revise / Done, or whatever you've configured)
- **Split here** — splits the chapter at the cursor; the active scene stays with the original chapter and the rest becomes a new chapter
- **Notes** — opens a scene-focused notes view (just this scene's pinned notes; for the whole-chapter list use the chapter-level Notes button below)
- **Links** — see below
- **+ New scene** — adds a scene to the current chapter (the primary action)
- **Delete scene** — only enabled if there's more than one scene in the chapter

A second toolbar sits just below for chapter-level controls when no scene is focused: previous/next chapter, the chapter's Status, **Versions**, **Critique**, chapter **Notes**, **New chapter**, and **Delete chapter**.

### The Links panel

> *"I wrote a scene with three characters and a location but I have no way to find it later except scrolling — nothing in the app knows they were in this scene."*

Click **Links** on the scene strip to open a modal that records the connective tissue for this scene:

- **POV perspective** — six options from first-person through omniscient
- **Characters present** — main and secondary; you can create a new character right here without leaving the scene
- **Locations** — same; inline-create supported
- **Objects** — same
- **When** — free-text date, with a toggle between gregorian and any alternative calendar you use
- **Narrative strands** — which threads this scene belongs to

**Why a writer would bother.** The Links panel is what makes the rest of the app intelligent. Search uses it to find scenes by character or strand. The Strands view shows you which scenes each strand touches. The Cast Presence heatmap in Analysis is built from it. The Relations graph uses it to draw edges. Filling it in is a five-second job per scene; the payoff is everywhere.

### Word and character count

The footer of the editor shows live word and character counts for the active scene (or the whole chapter in continuous mode), updating on every keystroke.

### Find and replace

The **Find / Replace** bar in the toolbar searches within the current chapter and highlights matches as you type. For project-wide replace (renaming a character across the entire book, for example), press **Ctrl/⌘ + Shift + F**, or open Search and click **Replace**.

### Dropping markers while you write

> *"I'm mid-sentence and I just noticed the timeline is wrong here. I don't want to stop drafting — I just need to mark it and keep going."*

The pin icon in the toolbar (or **Alt + M**) drops a marker — a category-tagged pin attached to a span of prose. Use it for "fix later", "verify this fact", "weak prose", "loose thread", and similar notes you don't want to stop drafting to address. The marker shows as a coloured dotted underline; clicking it opens an edit popover where you can change the category, edit the label, or resolve (remove) it.

Markers are the third annotation layer (after Comments and Notes) and they have a specific job: they're the lightweight "drop a pin and keep writing" surface, plus a manuscript-wide timeline view in revision. See the [Markers](markers.md) page for the full workflow.

---

## AI writing actions

If you have an AI provider configured (see [AI providers](ai-providers.md)), the scene strip's **[AI]** dropdown holds a row of AI actions. None of these are required, and they all show you the result as a coloured diff that you accept or reject line-by-line — your prose is never silently overwritten.

### Three variations — see the space before picking

> *"The AI rewrote the paragraph and it's fine. But I have no idea if there's a better version of that paragraph one click away. I just took the one it gave me."*

By default every AI dropdown action returns one result. **Three-alternative streaming** is an opt-in mode that runs three parallel streams instead — same prompt, different temperatures (more conservative ↔ more inventive). The three columns stream live side-by-side; you click **Use this** on whichever reads best and the other two are discarded.

There are two ways to turn it on:

- **Settings → AI → Three-alternative streaming.** A single toggle: *"Show 3 variations on every AI action."* Off by default. When on, every Rewrite / Expand / Tighten / Continue / Describe / line edit / Continue-with-direction opens the three-column modal automatically.
- **Shift-click any AI dropdown item.** Per-call opt-in regardless of the toggle. When you trust the prose for most actions but want to see the space on one tough paragraph, shift-click is the escape hatch.

**Why the opt-in.** Variations mode triples the token cost on cloud providers. The toggle lets you choose cost vs. choice once and forget it; the shift-click lets you make the choice case by case. There's no surprise bills surface — the dashboard's Usage page records all three streams independently so the cost is honest.

**Why a writer would use it.** The single most under-used pattern in AI-assisted writing. Picking from three forces you to read the *space* of possible rewrites instead of accepting whatever the model gave you first. Writers who form the habit consistently report cleaner prose; writers who don't, don't notice they're missing it. Try it as the default for a week before deciding whether to keep it on.

The chosen column threads back into the existing accept/reject AI-diff machinery — same UX you use for single-stream results.

### Match my voice — the voice canon

> *"The AI rewrites the scene technically correctly, but it doesn't sound like me."*

JustWrite has a project-level setting called the **voice canon** — a small list of your own chapters that represent how you write at your best. Once you've nominated a few, every Rewrite / Expand / Tighten / Continue / Describe / line-edit pass automatically injects a sample from those chapters plus a measured style summary into the model's instructions. The result matches your sentence rhythm, dialogue ratio, register, and POV distance instead of defaulting to generic LLM prose.

Set it in **Settings → AI & Audio engines → Voice canon**. The picker shows every chapter with prose; tick two or three middle-of-book chapters that read like your voice at its strongest. The settings panel shows the measured style summary it'll inject ("Average sentence ~14 words. Dialogue ~32%. Low filter-word density.") plus a collapsible preview of the full block. Clear or re-pick at any time; the change applies to the next AI action.

**Why a writer would use it.** Surface-level style mimicry is the single most reliable lever to make AI prose stop feeling like AI prose. The model has no innate sense of "your voice" — it has to infer it from the prose you put in front of it. Two pages of your own writing in the system prompt closes most of the gap. Best ship after a complete draft, when you know which chapters you're proud of; less useful in early drafting when your own voice is still settling.



The dropdown groups actions by what they operate on, so you can tell at a glance whether you need to highlight text first:

- **Selection only** — Rewrite, Expand, and Describe. Greyed out until you select text in the editor.
- **Selection or whole scene** — Tighten. Runs on the selection if you have one, on the entire scene otherwise.
- **From the cursor** — Continue. Generates the next paragraphs from wherever the cursor sits.
- **Line edits** — surgical, single-issue revisions (Show don't tell, Filter words, Dialogue tags, Sensory grounding, etc.) that run on the selection, or on the whole scene if nothing is selected.

### Whole-passage actions

- **Rewrite** — same meaning, different prose. Useful when you know the scene works but the wording feels stale. *Selection only* — for whole-scene rewrites, use Writer Lab where you can compare passes side-by-side.
- **Expand** — adds sensory detail, interiority, small physical actions. Roughly doubles the length. *Selection only.*
- **Describe** — additive. Treats the highlighted text as a *subject* (a place, person, object, or moment) and writes 1–2 paragraphs of fresh sensory prose **about** it, inserted right after the selection. The original passage stays untouched. Use it when you've named something but haven't brought it to life on the page — highlight "the old market" and get 200 words of sights, smells, and textures dropped in after. *Selection only.*
- **Research feel…** — Describe's structured sibling. Returns a research pack of short concrete sensory phrases the writer browses and selectively drops in. See below.
- **Tighten** — strips filler. Comes back shorter. *Selection or whole scene* — runs on the highlighted text, or the entire scene if nothing is selected.
- **Continue** — generates the next 2–4 paragraphs from the cursor. Useful when you're stuck. *No selection needed.*
- **Continue with direction…** — same as Continue, but you give it a one-line instruction first. See below.
- **Unstuck — five ways out** — opens a diagnostic modal with five distinct moves the scene could take from here. See below.

### Research feel — sensory research pack

> *"I'm writing a Victorian tannery scene and have no clue what it smells / sounds / feels like."*

Describe gives you a paragraph of polished prose about a subject. **Research feel** gives you the *materials* for that paragraph — a structured pack of short sensory phrases across eight categories that you pick from and stack to taste.

Highlight a subject (a place, an object, a moment, an experience) — anything you'd type into a search engine if a search engine could read your scene. Click **Research feel…** in the AI dropdown. JustWrite asks the model for a research pack and shows it as a grid:

- **Smell** — what it smells of, specific and sometimes unpleasant
- **Sound** — background and foreground noise; what the ear actually catches
- **Touch** — surfaces, weight, fabric and air against skin
- **Temperature** — heat, cold, drafts, the body's response
- **Taste** — the mouth as a sense organ (often empty for non-edible subjects)
- **Movement** — bodies in motion, how the space is navigated, what's happening
- **Social** — who is here, what they're doing, the codes they speak in
- **Period detail** — period- or setting-specific texture a modern reader wouldn't know

Each entry is a short concrete phrase, not a finished sentence. Click any phrase to drop it into your manuscript at the end of the selection — additive, your original prose stays untouched. The button turns green to show what you've taken; the rest stays in the modal for browsing. **Regenerate** asks for a fresh pack.

**Why a writer would use it.** Writers under-write smell, sound, touch, and temperature reliably — visual detail comes easy; the other four senses don't. Getting fifteen specific sensory phrases per subject in twenty seconds, then picking three that fit, materially improves prose. The taste and period-detail categories often surprise — they catch things you would not have thought to research.

**The trick is to highlight a SPECIFIC subject**, not a vague one. "The market" produces generic results; "the fish market on a hot July afternoon" produces ones you'd actually want to use. Include the period or modifier in your selection.

**Routable** as the **sensory** feature in Settings → AI. Doesn't need a heavy model — the task is research, not reasoning. A fast local model is usually fine.

### Continue with direction

> *"I know roughly what happens next; I want a 200-word draft I can shape."*

Plain Continue writes whatever it thinks should come next. That works when you're truly stuck, but most of the time you actually know the next beat — you just don't feel like writing it cold. **Continue with direction** is the answer.

Click **Continue with direction…** in the AI dropdown. A small prompt asks for one sentence: "Elena confronts Marcus but he deflects with charm." JustWrite drafts the next 2–4 paragraphs honouring that direction while matching the voice, tense, and POV of what came before. The result lands as an accept/reject diff like any other AI change.

**Why a writer would use it.** This is the single most-used AI feature in working tools like Sudowrite and NovelCrafter because it sits in the sweet spot between dictation (too constrained) and improvisation (too unmoored). You stay the author — the instruction is yours — but you don't have to sit through the friction of actually typing the paragraph. Use it as a momentum tool: type a direction, accept what comes back as a starting point, revise on top of it.

**Routes through the same engine as Unstuck's Write-this buttons** (guidedContinue under the hood). The model used is whichever provider you've pinned for **Writer actions** in Settings → AI.

### Unstuck — five ways out

> *"I don't even know why I'm stuck. Just give me options."*

**Continue** writes for you. **Unstuck** writes nothing — it diagnoses. When you can feel the scene has stalled but can't see where to push it next, this is the right tool to reach for.

Click **Unstuck — five ways out** in the AI dropdown. JustWrite sends the prose leading up to your cursor to the model and asks for **five distinct moves** — one each from these categories:

- **Goal shift** — the POV character's goal changes mid-scene (they wanted X; now they want Y)
- **Interrupt** — someone or something interrupts the current action
- **Setting** — the scene moves to a different place, or the setting itself shifts (weather, lights, time of day)
- **Reveal** — surface something the POV character doesn't yet know
- **Time cut** — cut to a different moment (later, earlier, or elsewhere)

The model returns five cards — one per category — each with a short headline and a 1–2 sentence direction. The categories are constraints, not suggestions, so you really do get five different shapes of move, not five variations of the same idea.

**Each card has a Write this button.** Click it and JustWrite drafts the next 2–4 paragraphs using that direction (via Guided Continue under the hood — the user's pick is fed verbatim into the Continue prompt). The result lands in the editor as a coloured diff you can accept or reject like any other AI change.

**Regenerate** in the modal footer asks for a fresh five if none landed. The modal is dismissible at any time.

**Why a writer would use it.** The hard part of being stuck isn't picking between known options — it's that you can't see what the options ARE. The five-category constraint is the whole point: it stops the model from giving you five flavours of "they keep arguing" and forces it to surface moves you might not have considered. The interrupt option might be the wrong one, but seeing all five at once is often what unlocks the next sentence.

**Routable** as the **unstuck** feature in Settings → AI. The diagnostic itself doesn't need a heavy model — a fast local model is usually fine. The actual prose drafting (the Write-this click) goes through **Writer actions** like any other Continue.

### Line edits

> *"My critique partner flagged passive voice all through chapter 6. I want to sweep just that one issue without touching anything else."*

A grouped section of more targeted revisions, each focused on one craft problem — what a professional line editor would mark up on a final read. All of them run on the selection, or on the whole scene if nothing is selected.

- **Show don't tell** — trades told-emotion ("she was nervous") for body language, behaviour, and dialogue the reader can feel firsthand.
- **Passive voice** — switches to active where the actor matters; leaves passive in place when the doer genuinely doesn't (crime scenes, mysteries, agentless states).
- **Filter words** — strips the layer of "she saw / he heard / I felt" between the POV character and what they're perceiving.
- **Dialogue tags** — replaces "exclaimed", "retorted", "queried" with plain "said" or action beats; pulls out adverb-glued tags ("said angrily").
- **Sensory grounding** — anchors abstract or interior prose in the body — sight, sound, smell, the feel of the air. Pulls a scene out of pure thought and back into the world.
- **Sentence variety** — breaks long sentences up or joins short ones together when the rhythm has gone monotonous.
- **Prose tightening** — cuts hedges ("just", "really", "very"), filler phrases, and lines that don't move the scene.

**How to use them well.** A small selection gives you a focused, easy-to-review result; running a line edit on a whole scene is the right move when you want one consistent treatment applied throughout (e.g. "strip filter words across this scene"). The output is always a starting point, not an answer — accept the changes you like, reject the ones you don't, and keep moving. If a result feels worse than what you wrote, that's useful information about what makes your prose yours.

### Multi-reader panel

> *"My critique partner is brilliant on prose and useless on marketability. My agent friend is the opposite. I want both reads at once."*

The standard **Critique** button gives one editorial pass. The **Multi-reader panel** button (right next to it in the chapter editor's chapter toolbar) gives four — four distinct readers each react to the chapter through their own lens:

- **Genre-savvy reader** — encountering the chapter cold, reading for the things this genre does well. Cares about hook strength, genre-promise delivery, where they'd put this book on the shelf.
- **Literary critic** — reading for prose craft. Cares about voice, image, sentence rhythm, the work the sentences are doing.
- **Agent's intern** — deciding whether to flag this for their boss. Cares about hook strength, voice that distinguishes the writer, comp-title legibility, clear stakes.
- **Book-club reader** — deciding what they'll discuss next month. Cares about character, emotional truth, the choices people make and what those choices reveal.

The four personas run in parallel — one LLM call each, fired concurrently. Each returns 2–3 paragraphs of first-person reaction (in their voice as that reader) plus 1–3 short, concrete suggestions. Each persona is instructed to **stay in their lane** so the four columns read as four perspectives rather than four variants of the same model bias.

The modal renders the four columns side-by-side with a coloured left border distinguishing each persona. Per-column reactions are kept short enough that the writer can read all four in under five minutes. The panel persists on the chapter so re-opening the modal reads from cache; **Re-run panel** regenerates against the current prose; **Clear panel** discards the saved set.

**Why a writer would use it.** Critique partners have biases. Yours might be brilliant on prose and useless on plot, or vice versa. The panel guarantees four different lenses, every time. The biggest value is often in seeing where the personas **disagree** — when the literary critic loves the chapter and the agent's intern would set it aside, you've learned something about the chapter's market position that no single reader would have told you.

**Cost note.** Four LLM calls per panel run. The system prompts are short and the chapter is the bulk of the input, so the cost is ~4× a standard critique. Routable as the **multiReader** feature in Settings → AI.

### Critique and structural analysis

> *"I've revised this chapter three times and I genuinely can't tell if it's good now or if I've just read it too many times to see the problems."*

The **Critique** button in the chapter editor toolbar runs two separate passes on the current chapter:

1. A **critique pass** that returns notes grouped by severity: Flags (problems), Suggestions (improvements), Observations.
2. A **structural pass** that scores Tension (1–10), Hook Quality (1–10), and classifies pacing and ending.

Notes persist on the chapter and can be re-run independently.

### Entity extraction

> *"I imported three chapters from my old draft and new characters appeared in the prose that aren't in my Story Bible yet. I want to find them all without reading every chapter by hand."*

The **Characters**, **Locations**, and **Objects** views each have a **Find new** button that runs a sweep across every chapter and proposes Story Bible entities of that kind that appear in your prose but aren't yet in the Bible. Same-name proposals from multiple chapters are merged into one with the originating chapters listed. You review every proposal individually on the next screen; nothing is added without your click. Useful after writing or after importing a draft from elsewhere.

---

## Version History

> *"I'm about to restructure this chapter heavily. If I hate what it becomes, I want to be able to get the original back."*

Click **Versions** in the chapter editor toolbar to save a named snapshot of the current chapter. The dialog shows every snapshot you've ever taken, and you can:

- **Restore** any previous snapshot, replacing the current version.
- **Diff** any two snapshots side-by-side (or compare a snapshot against the current live version).

The diff uses the same red/green visual language as the AI tools, so what's been removed and what's been added is immediately clear.

**Why a writer would use it.** Save a snapshot before any risky revision — a big restructure, an aggressive edit, an AI rewrite. If you regret it, restore. The diff view also makes it possible to see what you actually changed during a revision pass, which is genuinely interesting.

---

## Navigation inside Chapters

The header has a breadcrumb (**Part → Chapter → Scene**) with clickable segments and Previous / Next chapter buttons. Inside the editor:

- **Arrow Left / Right** (in Read mode) — previous/next chapter
- **Esc** (in Whole-book Read mode) — exit back to Edit
- **Tab / Shift + Tab** (in lists and paragraphs) — indent / outdent

---

## A typical writing session

A practical rhythm:

1. Open the app. You land on Home — you can see what you wrote yesterday and your streak.
2. Click **Resume writing**.
3. Write. The editor's word count climbs in real time; you don't have to save anything.
4. When you finish a scene, fill in the **Links** panel (characters, location, strand). Five seconds.
5. Open **Outline** to see how this chapter is shaped, or **Cards** to drag scenes into a better order.
6. Optional: select a passage you're unhappy with, hit **Tighten** or **Show, don't tell** in the bubble menu, and see what comes back.
7. End the day. Tomorrow, JustWrite remembers exactly where you stopped.

That's it. Everything else in the app is in service of this loop.

---

## See also

- **[Core concepts](core-concepts.md)** — Parts, Chapters, Scenes, autosave, undo
- **[Story bible](story-bible.md)** — Characters, Locations, Objects, Groups
- **[Plot and time](plot-and-time.md)** — Strands, Plot Board, Events
- **[AI providers](ai-providers.md)** — getting AI features running
- **[Keyboard shortcuts](keyboard-shortcuts.md)** — the full reference
