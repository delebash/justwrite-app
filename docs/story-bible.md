# Story bible

Your "Story Bible" is everything that isn't manuscript prose — characters, places, things, factions, and the way they all connect to each other. JustWrite gives you a structured place for each of these, plus a graph that visualises how they're woven together.

**Section landing pages.** Click any Story-bible section header in the sidebar (Characters / Locations / Objects / Groups / Strands / Worldbuilding) and you land on a sortable, searchable grid of every entry. Search across names, tags, and content; filter by status, type, or any in-use facet; click a row to open the detail page. Each detail page has an **Ask the book** button in the header that opens the chat panel with a question prefilled about that entity. The character page has a second button — **Talk to {Name}** — that opens the chat in first-person character mode with that character already selected.

You do not need to fill every field. Many writers start with names alone and only fill in the rest when they need it. The point of the Story Bible is that it's there when you do.

---

## Characters

The **Characters** view is your central file for every person (or creature) in your story.

### What you can capture

- **Name** — large serif heading; click to rename inline.
- **Role** — a short label (e.g., "Detective", "Henchman").
- **Main character toggle** — promotes them to the inner ring of the Relations graph. Use this for protagonists, not for everyone.
- **Gender** — free text. Whatever fits your story — "Female", "Non-binary", "Dragon", "Unspecified". Flows into AI features that already use voice gender for casting and pronoun-aware generation.
- **Pronouns** — free text (e.g., "she/her", "they/them", neopronouns, species-specific). Surfaced to every AI feature that builds a character profile so generated prose uses the right pronouns instead of guessing.
- **Age** — numeric.
- **Life status** — Alive · Deceased · Missing · Unknown. Useful when a character dies mid-book and you don't want AI features writing them as still alive in chapter 30.
- **Aliases (a.k.a.)** — chips for the other names this character goes by. "Mr. Underhill" for Bilbo, "Iron Man" for Tony Stark, "the Witch" for Esme. Speaker attribution and the global search use this to disambiguate; "ask the character" and audits factor it in too.
- **One-liner** — a single italic sentence that captures who they are.
- **Avatar photo** — a 96 px circle. Drag any image file onto it to set or replace.
- **Status pill** — a colour-coded label drawn from your project palette (Settings → Project → Statuses).
- **Tags** — freeform labels with project-wide typeahead.
- **Motivation panel** — four colour-coded boxes: **Wants**, **Needs**, **Lie they believe**, **Truth they meet**.
- **Arc panel** — three columns: **Beginning**, **Midpoint**, **End**.
- **Voice & dialect** — four fields: Accent, Vocabulary, Speech tic, Sample line.
- **Backstory** — a free-text block for private history that never appears in the manuscript.
- **Images modal** — a multi-image gallery for reference photos.
- **Groups modal** — toggle the character into or out of any group.
- **Events button** — opens this character's personal event timeline.

The page also shows two reverse indexes:

- **Appears in scenes** — every scene that has linked this character via its Links panel.
- **Mentioned in prose** — every scene where the character's name was inserted with `@`, with a short snippet and a mention count.

The character page carries a deeper, collapsible dossier — identity & core
engine, voice & presence, function in the story, capabilities, a continuity
ledger, and backstory. Each field explains itself on the page; the **[Character
sheet](character-sheet)** guide covers all of them, and **Fill from book**
drafts many of them from the character's own scenes. After an entity-sweep
accept, JustWrite offers to draft the new characters' profiles in one batch.

### Why a writer would use the Motivation panel

> *"I'm stuck on what my protagonist would do here. I know what the plot needs to happen — but I don't know what she'd actually do."*

The Wants / Needs / Lie / Truth grid is a compressed version of a long-standing storytelling framework (Lisa Cron, K.M. Weiland, and others have written about it). It is genuinely useful to write down what your character thinks they want, what they actually need, the false belief that keeps them stuck, and the truth they discover. When you get to a scene and don't know what your character would do, the Motivation panel often answers it — the four boxes hand the choice back to character instead of to plot convenience.

Fill it in for your protagonist and your antagonist first. Supporting characters can stay empty until you discover they need filling out.

### Voice & dialect — why bother

> *"I haven't written this character in four chapters and now I can't remember how they sound. The dialogue I'm putting in their mouth sounds like everyone else."*

If you write multiple POVs, or you ever have to hand a chapter to an editor or collaborator, the Voice section is your reference for keeping a character's dialogue consistent. A "Sample line" is especially powerful — a single line that sounds *exactly like them* — so when you write new dialogue for them weeks later, you can re-read it and re-tune your ear before you write the next line.

### Backstory

> *"I have a whole history for this character in my head and nowhere to keep it where it won't end up in the exported book."*

Private notes that never get exported. Use this for "I know they used to be a soldier, but the reader doesn't" details — the stuff that shapes how you write them but isn't for the reader's eyes. The Description fields on Locations and Objects *do* export; the Character Backstory field deliberately does not.

### Talk to a character — interview them in their voice

> *"I'm stuck on what my protagonist would do here. I know what the plot needs to happen — but I don't know what she'd actually do."*

The Motivation panel is a planning tool — you write down what your character wants, needs, believes, and discovers, and the next decision often falls out of the four boxes. The character-chat is a *discovery* tool: you put your character on the couch and ask them.

Open the chat panel (sidebar's "Ask the book" toggle, the **Chat** icon in the title bar, or `Ctrl/⌘ + J`). The mode picker at the top has two options: **Ask the book** (the original RAG chat) and **Talk to a character**. Switch to the second; a character dropdown appears (main characters first, then the rest). Pick one and start asking.

Or skip the mode picker entirely: on any character's page, click **Talk to {Name}** in the header — the chat opens already in character mode with that character selected. The companion **Ask the book** button next to it opens book mode with the question prefilled ("Tell me about {Name}") so you can ask third-person questions about the same character without switching contexts.

JustWrite builds the character's system prompt from everything you've put in their detail page — role, age, one-liner, voice (accent / vocabulary / speech tic / sample line), motivation (want / need / lie / truth), arc (beginning / midpoint / end), backstory, and any sample quotes you've stored. The model is told to **answer in first person, in voice**, using the retrieved scenes as their memory of what's happened. RAG retrieval pulls scenes biased toward the character's name; citations work the same way as Ask-the-book.

**Rules the model follows:**

- **First person, in voice.** They speak as themselves.
- **Knowledge state.** The model is told to only use scenes the character would actually have been present for. It can refuse to answer about events they weren't in ("I wasn't there" / "I haven't heard about that yet"). It's an instruction, not a hard guarantee — the model may slip — but the prompt strongly biases toward not leaking.
- **Stay in character even when speculating.** If they'd lie, they lie. If they'd dodge, they dodge. If they'd refuse, they refuse.
- **No fourth-wall breaks.** They won't refer to the manuscript, the writer, or themselves as an AI. They're a person who exists in the story.
- **Reasonably short answers.** Usually 1–3 sentences. Sometimes a paragraph. No lectures.

**Each character has their own persisted thread.** Switch characters in the dropdown and the conversation switches with them. Switch back later and the thread is still there. The book-chat thread is also separate from any character thread — switching modes doesn't lose your place in either.

**Why a writer would use it.** Character-as-oracle is genuinely useful when you can't think your way to a scene. Ask them what they'd do, why they hesitated, what they want from another character, what they'd never tell anyone. The answers reveal contradictions in your own characterisation as often as they unblock the next scene — the model patterns-matches against the profile you've built and surfaces psychological tensions you didn't see while drafting. Treat answers as discovery prompts, not gospel.

**Cost note.** Uses the same vector store and embedding provider as Ask-the-book — if you've already built an index for one, the other works immediately. Routable as the **characterChat** feature in Settings → AI (separately from **chat** so you can pin a more conversational/in-character model here while keeping factual Q&A pinned to a tighter one).

### Relationship arc — how does this pair move across the book?

> *"My two leads' relationship feels static. They're orbiting each other but the dynamic isn't shifting and I can't see why."*

Characters change in arcs. So do the *relationships* between them. The trouble is that an individual character's arc tends to live in your head — you wrote their wants, needs, and end-state into their Motivation panel — but the way two characters' dynamic evolves chapter to chapter rarely gets the same explicit treatment. You feel when it's wrong, you can't always see where.

The **Relationship arc** button on the Characters header opens a modal where you pick two characters who share scenes. JustWrite collects every chapter they both appear in (per the Links panel) and asks the model to track three dimensions chapter by chapter:

- **Warmth** (1–10) — cold ↔ warm. 1 is open hostility; 5 is civil neutrality; 10 is deep intimacy.
- **Tension** (1–10) — calm ↔ taut. 1 is entirely calm; 10 is breaking point.
- **Power** — who's setting the terms in this chapter. "A-dominant", "B-dominant", or "Equal".

The result lands as:

- A **trajectory chip** naming the overall shape: Warming, Cooling, Escalating, Defusing, Flipping (power inverts), or Static.
- A **2–3 sentence summary** of the arc.
- A **two-line chart** of warmth (solid gold) and tension (dashed red) across chapters.
- A **per-chapter strip** with three rows — warmth (cold-blue to warm-gold), tension (grey to red), power (A-tinted / equal-grey / B-tinted). Click any cell to see the model's one-sentence summary of the chapter's moment.

**Persistence and the gallery.** Each pair you track is saved on the project. The modal's pickers default to your first two main characters; switch either dropdown to load a different pair's cached arc, or generate a fresh one. **Regenerate** runs a new pass; **Clear this arc** wipes the saved analysis for the current pair.

**Why a writer would use it.** Two characters in scene together don't just *exist* together — they *move* together, and the movement is a structural element you can shape. A relationship the writer intended as cooling but reads as flat is a real revision finding. A flipping power dynamic that happens too late (or doesn't happen at all) often explains why a climax doesn't land. The chart externalises the curve in a way that's hard to hold in your head while writing.

**Requires scenes with both characters linked.** The model is only shown chapters where both characters are linked to the same scene via the Links panel. If they share zero scenes, the modal surfaces a clear error telling you to link them first.

**Cost note.** One LLM call per relationship pair. Routable as the **relationshipArc** feature in Settings → AI.

### Audit consistency — does this character act like themselves?

> *"Did my introverted loyalty-first character betray her best friend convincingly, or did I just write what the plot needed?"*

You write the character's profile when you start the book. You write the scenes over months. Inevitably, somewhere around chapter eighteen, the character does something the plot needs them to do — and you don't notice that it doesn't match the psychology you established back in chapter one. This is one of the most common revision-stage problems in long fiction, and it's hard to see from inside the draft because you remember WHY you wrote each scene, not whether the scene fits the character.

**Audit consistency** in the Characters view header opens a sweep modal that walks every **main character** one at a time and asks the model: *"Given this character's profile and every scene they appear in, are any of their actions, reactions, or dialogue inconsistent with what you've established about them?"*

The model gets the full profile (name, role, one-liner, voice, arc, motivation, backstory, established voice samples) plus a digest of the scenes that feature the character. It returns:

- A **verdict** per character — Consistent, Minor drift, or Significant drift.
- A list of **concerns**, each with:
  - A **severity** — **Flag** (clear inconsistency), **Suggestion** (borderline, could be intentional growth), or **Note** (small observation).
  - The **chapter** the inconsistency appears in (clickable, jumps you straight there).
  - A short hint of where in the chapter.
  - The **issue** — one sentence naming what action looks inconsistent.
  - A verbatim **quote** from the prose.
  - **Why** it doesn't fit, citing the established profile.
  - The **cheapest fix** — earn the action, change the action, or revise the profile.

**The audit persists.** Results are saved on the character so re-opening the modal reads from cache. **Re-audit** forces a fresh sweep on every main character; **Clear saved audit** discards stored results. Cancel mid-sweep keeps the per-character results that already completed.

**The model is instructed to be honest, not flag-happy.** A character that's genuinely consistent across their scenes returns zero concerns and the **Consistent** verdict — no false flags to pad the output. Character growth and change that's *earned* on the page is ignored unless the scene gives no reason for the shift; the **Why** field is explicit about distinguishing "uncosted change" from "unearned change". You should still treat findings as a second opinion, not gospel — the model is reading without the wider context of your manuscript that informs your decisions.

**Routable** as the **characterAudit** feature in Settings → AI. This is one of the most reasoning-heavy LLM tasks in JustWrite — long context windows and strong text comprehension help materially. Pin to your strongest cloud model if you can; the per-character cost is real but the value-per-call is high.

---

## Locations

Reference sheets for every place in your story.

### Fields

- **Name** — serif heading; rename inline.
- **Kind** — short category text (e.g., "Medieval city", "Spaceship interior", "Abandoned barn").
- **Status, Tags, Images, Groups, Events** — same conventions as characters.
- **Description** — a full rich-text editor. Use as much or as little as you want.
- **Appears in scenes** — scenes that linked this location.
- **Mentioned in prose** — `@` mentions with snippets.

### When to use it

> *"This inn shows up in three chapters and every time I write it the layout is slightly different. Now I can't remember which version is canon."*

A location entry is worth it when the place will appear in more than one scene and you want to keep sensory details, history, or floor plans consistent. For a single throwaway location ("a dusty bar in town"), a tag on the scene is enough — don't fill the bible with one-shot rooms.

Because the description editor supports headings and lists, you can structure a complex location — a mansion with multiple rooms, a city with several districts — inside a single article rather than splintering it into many tiny records.

---

## Objects

Significant props: weapons, letters, artefacts, MacGuffins, vehicles. Anything that has a role in the plot and is worth documenting.

### Fields

Same shape as Locations: Name, Kind, Status, Tags, Images, Groups, Events, Description, "Appears in scenes", "Mentioned in prose".

### When to make something an Object

> *"Is this prop actually worth tracking, or am I just hoarding lore?"*

Two tests:

1. Does it appear in more than one scene? (Or is it about to?)
2. Does it matter — does it carry weight in the plot?

If both, file it. A cursed ring, a forged letter, a navigation key — these earn an Object entry because you'll need to remember their rules, their history, and their movement across scenes.

A coffee cup someone holds for a single beat is not an Object. A coffee cup that carries the assassin's poison is.

---

## Groups

Groups are collections that bundle any mix of characters, locations, objects, and narrative strands under one named cluster.

### Fields

- **Name, Color, Blurb, Status, Images, Events**
- **Members** — auto-collected from every entity that has been toggled into this group. The Groups view shows the roster; you add and remove members from the individual entities' Groups buttons, not from the Group page itself.

### Why use a Group instead of just tagging things

> *"I have a whole rebel cell — five characters, two safe houses, a forged document, an arc that runs through twelve chapters — and tagging each item with 'resistance' isn't giving me a place to think about the cell as a unit."*

Use a Group when a concept spans entity types and you want a single page that collects them.

A vivid example: **"The Resistance"** might contain five characters (the cell leader, four operatives), two safe-house locations, a forged-papers object, and the "Uprising" strand. That's an entire faction documented on one page. Far more expressive than tagging each item with "resistance".

Groups are also the primary way the Relations graph draws **edges** between entities. Every pair of items that share a group gets a line between them. So a well-organised Group instantly makes the graph more informative.

### Group vs. character relationship

If two characters know each other and share scenes, the Relations graph will already show a line between them. You don't need a Group for that.

Create a Group when the **collective identity** — the guild, the family, the crew — is itself a thing you want to document and refer to in the prose. The Resistance is a Group. Mary and Joe being friends is not.

---

## Relations

The **Relations** view is an interactive visual graph showing how every character, location, and object in your project connects.

### What it shows

- **Three-ring layout** — main characters in the inner ring, secondary characters in the middle ring, locations and objects on the outer ring.
- **Edges with weight** — a line is drawn between any two entities that share a group, appear in the same scene, or belong to the same narrative strand. Multiple reasons make the line thicker.
- **Hover for reasons** — hovering an edge shows the full list ("Group: The Resistance · Scene: Ch.3 The Ambush · Strand: Uprising").
- **Focus mode** — hover a node and the unrelated ones dim. Click to pin focus; click the pinned node a second time to navigate to its page.
- **Filter legend** — top-right panel lets you toggle Characters, Locations, and Objects on/off independently.
- **Pan, zoom, reset** — drag empty canvas to pan; scroll or `+`/`-` to zoom; `0` or the Reset button restores the default view.

### How to use it

> *"I think my protagonist is at the centre of this story — but I want to see it, not just believe it."*

Relations is a **diagnostic** view, not a data-entry view. You don't build connections here; they appear automatically from the work you do elsewhere — adding characters to scenes via the Links panel, putting things in groups, tagging scenes with strands. The graph reflects what is actually written, which is the point.

Visit it when you want to ask:

- **Is my protagonist really at the centre of this story?** (If their node has few edges, they're not as central as you think.)
- **Are any major characters isolated?** (A character with one or two edges may be underused.)
- **Do my key locations feel embedded in the plot?** (Or are they orphans nobody visits?)
- **Which scenes are pivots?** (A scene that connects characters from four different groups is probably an important one.)

The graph is honest in a way an outline isn't — it reflects what is actually written, not what you planned. If your antagonist has fewer edges than the heroine's best friend, the graph is telling you something.

### Edges come from three sources

1. **Shared group membership** — two entities in the same Group.
2. **Shared scenes** — both linked to the same scene via the Links panel.
3. **Shared strand** — both linked to scenes that share a narrative strand.

No manual edges. Edges always reflect data you entered elsewhere.

---

## A practical workflow

Most writers don't fill the whole Story Bible up front. A realistic progression:

1. **Add characters as they appear in the writing.** When you write a new character's name in a chapter, type `@`, hit "create new character", and you have a stub. Fill in details later when you have a sense of who they are.
2. **Add locations the same way.** A new place gets a stub on first appearance.
3. **Reach for Groups once you have five or so connected characters.** Group them by faction, family, or crew so the Relations graph becomes meaningful.
4. **Fill in Motivation and Arc when you reach a hard scene.** When you're stuck on what your protagonist would do here, sit down and complete the Motivation panel. It often solves the problem.
5. **Check Relations every now and then** as a structural sanity check.

---

## See also

- **[Worldbuilding](worldbuilding.md)** — the long-form reference library, separate from per-entity sheets
- **[Plot and time](plot-and-time.md)** — Strands and Events, which connect to characters and locations
- **[Writing](writing.md)** — the editor's Links panel, where Story Bible items get attached to scenes
