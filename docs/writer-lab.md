# Writer Lab

> *"I want to mess with this passage in a sandbox before I decide what to do with my manuscript — try a rewrite, see a critique, run an analysis, without anything I do leaking back into the book."*

**Writer Lab** (Project section in the sidebar) is a scratch-pad AI workbench. Paste any passage of prose — or load any chapter from your manuscript — and run a menu of writing operations on it.

Think of it as an editor on call for any piece of text at any time. The scene-strip AI dropdown in the manuscript editor works on the current selection in the current chapter; Writer Lab is for **standalone passages**, **experimentation**, and **structural critique** without committing anything to the manuscript.

---

## Setup required

Writer Lab needs an **LLM provider** configured in **Settings → AI & Audio engines**. Any OpenAI-compatible chat provider works — OpenAI, Anthropic Claude, a local Ollama or LM Studio model.

No TTS, no embeddings, no special plugins.

The provider and model used are whatever you've set as your default LLM in Settings (or what you've pinned for "Writer actions" specifically, if you configured per-feature routing).

---

## The layout

- **Input area** — a large text box for your passage. Live word and character counts.
- **Chapter loader** — a dropdown that pulls the plain prose of any chapter into the input area. Loading strips formatting so you have a clean text to work with.
- **Operation buttons** — three groups: Prose Actions, Line Edits, Analysis.
- **Live preview toggle** — for the prose operations, you can choose to see the result stream in as it's written, rather than waiting for the complete result.
- **Output panels** — the raw AI response and a structured/parsed view (formatted HTML for rewrites, scored cards for structural analysis, grouped note lists for critique, entity cards for extraction).
- **Prompt panel** — an optional view of the full prompt sent to the AI, for transparency.
- **Token and timing stats** — shows after each run: elapsed time, tokens sent, tokens received.
- **Cancel button** — stops a running generation mid-stream.

---

## Operations

### Prose actions — whole-passage rewrites

Four operations that transform the entire passage:

| Action | Result |
|---|---|
| **Rewrite** | Same meaning, more vivid and specific prose. Preserves voice and tense. |
| **Expand** | Adds sensory detail, interiority, small physical actions. Roughly doubles the length. |
| **Tighten** | Removes filler words, hedges, redundant phrases. Comes back noticeably shorter. |
| **Continue** | Writes 2–4 new paragraphs from where the passage ends, matching your voice and POV. |

### Line edits — targeted single-issue rewrites

Surgical revisions that rewrite the passage to fix one specific craft problem at a time — what a professional line editor would mark up on a final read. Each one ignores the other dimensions and focuses:

| Pass | What it targets |
|---|---|
| **Show don't tell** | Trades told-emotion ("she was nervous") for the body language, behaviour, and dialogue that let the reader feel it firsthand. |
| **Passive voice** | Switches to active voice when the actor matters. Leaves passive in place when the doer genuinely doesn't — crime scenes, mysteries, agentless states. |
| **Filter words** | Strips the layer of "she saw / he heard / I felt" between the POV character and what they're perceiving. The reader gets the perception direct. |
| **Dialogue tags** | Plainer tags ("exclaimed", "retorted" → "said") and action beats that show how a line lands. Pulls out adverb-glued tags ("said angrily") the same way. |
| **Sensory grounding** | Anchors abstract or interior prose in the body — sight, sound, smell, the feel of the air. Pulls a scene out of pure thought and back into the world. |
| **Sentence variety** | When sentences start marching in lockstep, breaks long ones up or joins short ones together. Lets the rhythm breathe. |
| **Prose tightening** | Cuts hedges ("just", "really", "somewhat"), filler phrases, and lines that don't move the scene. The result is shorter and usually sharper. |

### Analysis operations — no rewrite, just feedback

Three operations that return structured editorial feedback:

#### Critique notes

Returns notes grouped by severity:

- **Flags** — problems
- **Suggestions** — improvements
- **Observations** — neutral notes

Each note has a category label and a plain-language description.

#### Structural analysis

Returns numeric scores and classifications:

- **Tension** (1–10)
- **Hook quality** (1–10)
- **Pacing** — slow / steady / brisk / fast
- **Ending** — cliffhanger / resolved / open / ambiguous
- A prose summary of the analysis

#### Extract entities

Proposes characters, locations, and objects found in the passage, cross-referenced against what's already in your Story Bible. Each proposal includes a one-liner description and a quoted piece of evidence from the text.

You review each proposal individually. Nothing is added to your Story Bible without your click.

---

## How to use Writer Lab well

A few patterns that work:

### Paste in a passage you're struggling with

> *"This paragraph isn't working but I can't see why anymore. I've stared at it too long."*

Run **Rewrite** to see an alternate take on the same prose. You're not committing to the AI's version — you're seeing what the passage looks like through different eyes. Sometimes the rewrite is better; sometimes it gives you the angle you needed to fix your own version. Either way, you learn something.

### Use Tighten or Prose tightening on baggy revisions

> *"I wrote 1,200 words and I know 200 of them are filler. I just can't tell which 200."*

Paste, run **Tighten**, and see what survives. You probably won't keep the AI's output verbatim — but the diff between your draft and the tightened version tells you which sentences are weak. Useful precisely because the AI is more ruthless than you are with your own prose.

### Run Critique notes before sending to a beta reader

> *"I'm about to send this chapter to a beta reader and I'd rather catch the obvious problems myself first — I only get one set of first impressions per reader."*

A free first-pass editorial perspective. The notes won't be perfect, but they'll catch the obvious problems — a flat character motivation, a pacing dip, a confusing antecedent — before your beta reader has to spend their fresh-eyes pass on stuff you could have fixed.

### Use Structural analysis to check chapter shape

> *"Is this chapter actually good, or am I just relieved I finished it?"*

Load a finished chapter. Run **Structural analysis**. If it scores Tension 3 and Hook Quality 2, you have an objective second opinion that the chapter is flat — and you can stop arguing with yourself about it and revise. If it scores Tension 9, you've probably written something good and you can move on instead of overworking it.

### Use Continue when you're stuck at the end of a scene

> *"I finished the paragraph. I don't know what comes next. I just need *something* on the page so I can react to it."*

Paste in the last few paragraphs, run **Continue**, see what direction the AI suggests. You'll almost certainly write something different — but having a draft you disagree with is much easier to write *against* than staring at an empty cursor.

### Use Extract entities after writing or importing a chapter

> *"I imported a draft I wrote in another tool and I have no idea which of the characters in it are missing from my Story Bible."*

You wrote (or imported) a chapter and a new innkeeper character appeared. Did you remember to add him to your Story Bible? **Extract entities** finds out — it surfaces the people, places, and objects in the prose that don't yet have entries, so you can stub them out before they multiply.

---

## What Writer Lab is not

- **It is not automated.** You bring the text, choose the operation, review the result. Nothing happens unattended.
- **It does not write back into your manuscript.** The output is in a panel; you copy what you want and paste it yourself. This is deliberate — Writer Lab is for ideas, not for hands-off rewriting.
- **It is not a substitute for revision.** Running Tighten on every chapter will not produce a tight book. You will produce a tight book. Writer Lab can help you see what to do.

---

## Writer Lab vs. the editor's AI dropdown

Both surfaces have similar AI actions (Rewrite, Tighten, line edits, etc.). The difference:

- **Scene-strip AI dropdown** — works on the current selection in the current chapter, with the result shown as an inline diff you accept or reject line-by-line. Best for **small, targeted edits in flow**.
- **Writer Lab** — works on any passage, in a standalone panel, with the result kept separate from your manuscript. Best for **experimentation, structural critique, and any operation you don't want committed**.

Use the scene-strip AI dropdown when you're inside the writing flow and want a quick rewrite of one paragraph. Use Writer Lab when you want to study a passage, compare alternative versions, or run analysis without touching the manuscript.

---

## See also

- **[Writing](writing.md)** — the in-editor scene-strip AI dropdown and Critique modal
- **[AI providers](ai-providers.md)** — setting up the LLM that powers Writer Lab
