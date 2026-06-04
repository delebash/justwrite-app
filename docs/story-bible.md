# Story bible

Your "Story Bible" is everything that isn't manuscript prose — characters, places, things, factions, and the way they all connect to each other. JustWrite gives you a structured place for each of these, plus a graph that visualises how they're woven together.

You do not need to fill every field. Many writers start with names alone and only fill in the rest when they need it. The point of the Story Bible is that it's there when you do.

---

## Characters

The **Characters** view is your central file for every person (or creature) in your story.

### What you can capture

- **Name** — large serif heading; click to rename inline.
- **Role** — a short label (e.g., "Detective", "Henchman").
- **Main character toggle** — promotes them to the inner ring of the Relations graph. Use this for protagonists, not for everyone.
- **Age** — numeric.
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

### Why a writer would use the Motivation panel

The Wants / Needs / Lie / Truth grid is a compressed version of a long-standing storytelling framework (Lisa Cron, K.M. Weiland, and others have written about it). It is genuinely useful to write down what your character thinks they want, what they actually need, the false belief that keeps them stuck, and the truth they discover. When you get to a scene and don't know what your character would do, the Motivation panel often answers it.

Fill it in for your protagonist and your antagonist first. Supporting characters can stay empty until you discover they need filling out.

### Voice & dialect — why bother

If you write multiple POVs, or you ever have to hand a chapter to an editor or collaborator, the Voice section is your reference for keeping a character's dialogue consistent. A "Sample line" is especially powerful — a single line that sounds *exactly like them* — so when you write new dialogue for them weeks later, you can re-read it and re-tune your ear.

### Backstory

Private notes that never get exported. Use this for "I know they used to be a soldier, but the reader doesn't" details. The Description fields on Locations and Objects do export; the Character Backstory field does not.

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

A location entry is worth it when the place will appear in more than one scene and you want to keep sensory details, history, or floor plans consistent. For a single throwaway location ("a dusty bar in town"), a tag on the scene is enough.

Because the description editor supports headings and lists, you can structure a complex location — a mansion with multiple rooms, a city with several districts — inside a single article rather than splintering it into many tiny records.

---

## Objects

Significant props: weapons, letters, artefacts, MacGuffins, vehicles. Anything that has a role in the plot and is worth documenting.

### Fields

Same shape as Locations: Name, Kind, Status, Tags, Images, Groups, Events, Description, "Appears in scenes", "Mentioned in prose".

### When to make something an Object

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

Relations is a **diagnostic** view, not a data-entry view. You don't build connections here; they appear automatically from the work you do elsewhere — adding characters to scenes via the Links panel, putting things in groups, tagging scenes with strands.

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
