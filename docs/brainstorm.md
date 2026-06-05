# Brainstorm

> *"I need twenty names for this frontier tavern and I don't want any of them cluttering my project — I just need something to pick from so I can get back to the scene."*

Brainstorm is the panel you open when you're stuck on "what should I *call* this thing." Give it a category (Character names, Place names, Item names, Titles, or a free prompt), a seed describing the vibe you're after, and it produces 15–20 short candidates. Thumbs-up the ones you like, click **More like these**, and the next batch drifts in that direction. Copy the winners into your story bible (or your manuscript) and close the panel — nothing here is saved.

It's a transient generator, not a note-taking surface. The Notes view is where you write your thinking down to keep; Brainstorm is for the moment when you want twenty options for a tavern's name and you don't want any of them to live in your project permanently.

---

## Opening Brainstorm

The sidebar's Planning section has a **Brainstorm** entry. Click it. The panel opens; nothing is loaded yet, no project state is touched.

The panel is its own surface — you can leave and come back, but anything in it is wiped. Treat it like a scratchpad you keep beside the keyboard.

---

## The categories

The category shapes the system prompt that goes to the model — it's what tells the LLM whether you want short personal names, evocative book titles, or open-ended phrases. The seed prompt is what tells it the *flavour*; the category tells it the *shape*.

Pick the one that fits the kind of output you want back. The selected category's purpose and an example seed prompt appear inline in the panel itself, so you don't have to remember them.

| Category | What it's for | Example seed |
|---|---|---|
| **Character names** | Personal names — given names, surnames, full names, nicknames | *Norse-sounding female warrior names, sharp consonants, two syllables.* |
| **Place names** | Toponyms — cities, taverns, neighbourhoods, mountains, ships, kingdoms, planets | *Creepy New England small-town shop names, 1920s setting.* |
| **Item / object names** | Names for things — swords, books, organisations, spells, drugs, vehicles, recurring objects | *Names for a legendary sword passed down by exiled queens, evocative not ornate.* |
| **Titles (book / chapter / scene)** | Short, evocative, register-aware titles | *Titles for a heist novel set on a generation ship — single word, evocative.* |
| **Anything (free prompt)** | Use when the list doesn't fit — phrases, taglines, alternate words, ideas | *Twenty short phrases a tired innkeeper might say to a stranger before bed.* |

The categories aren't enforced — picking "Place names" doesn't stop you from typing a character-name seed. They're just a steering hint to the model. If the suggestions you get feel off-shape, switch the category and re-run.

---

## A round of brainstorming

The flow is the same regardless of category:

1. **Pick a category** (see above). The panel updates with a one-line description of what the category is for and an example seed in the input placeholder.
2. **Write a seed.** This is the description the model uses to decide *what kind* of suggestions to make. Be specific — "Norse-sounding female warrior names, sharp consonants, two syllables" gives you much more useful output than "warrior names". The more flavour you give about era, register, sound, mood, language, the less generic the result.
3. **Hit Generate.** The model streams 15–20 suggestions into the panel, one per row. Each row has a 👍 button and a **Use** (copy) button.
4. **Thumbs-up the ones you like.** The thumbs-up is a preference signal, not a save — it tells the model which direction you want it to lean next. You can thumb as many as you like.
5. **Click "More like these".** The model gets your liked items as a steering signal and a list of everything you've already seen, then generates 15–20 fresh suggestions that don't repeat any of them. The new results append to the panel (the old ones stay) so you can keep thumbing across rounds.
6. **Use the winners.** Click the **Use** button on a row to copy that text to the clipboard. Paste it into your character's name field, your location title, your manuscript — wherever it belongs.
7. **Clear** when you're done. The panel returns to empty so the next session starts fresh.

You can also start a completely new run at any time — typing a new seed and hitting **Generate** clears the previous results and the seen list, so the model isn't constrained by an unrelated thread.

---

## What Brainstorm is *not*

> *"I thumbed up six names I liked, navigated away to check a character's notes, and came back to an empty panel."*

- **It's not a notes feature.** Nothing persists between sessions; close the panel and the suggestions are gone. If you want to keep a brainstorm session for later, copy the suggestions you care about into a Note (or directly into a character/location/etc.).
- **It's not a name *committer*.** Brainstorm doesn't write to your project. Clicking **Use** copies to the clipboard — you decide where the result lands.
- **It's not deterministic.** Temperature is high (0.9) — generating the same seed twice will give different results, and that's the point. You're after divergent options, not the "right" answer.

---

## How thumbs-up actually works

When you click **More like these**, the panel sends the model:

- The category and seed (so the request is still anchored).
- A list of every item you thumbed-up this session, with the instruction "generate more in the same direction — same vibe, sound, era, register — but don't repeat any of these".
- A list of *every* item the panel has shown you (liked or not), with the instruction "don't repeat any of these either".

That's it — there's no fine-tuning, no embedding-based similarity, no scoring. It's a steering signal in the prompt and it works as well as the model you're using. Local Ollama models do fine for short-form generation; cloud models (OpenAI, Claude) give noticeably more varied output for the same seed.

If you don't like the direction the new batch went, untick some of your likes (just click the thumb again) and re-run. If the model is being repetitive across rounds, the "seen" list keeps it honest — but you can also just hit **Clear** and start over with a tighter seed.

---

## Picking a model

Brainstorm uses the AI provider you've configured for the **brainstorm** feature in **Settings → AI providers**. If you haven't set one explicitly, it falls back to your default chat provider.

A few observations:

- **Short outputs benefit from creative models.** Brainstorm produces tiny chunks of text (a name, a phrase), so the cost per round is small even on cloud providers. Don't be afraid to use Claude or GPT-4-class models for this — the per-round cost is fractions of a cent.
- **Local models work well for names.** Ollama models like Llama 3.2 or Qwen 2.5 do a fine job on character / place names. Less reliable for titles, which need a stronger sense of register.
- **Temperature is fixed at 0.9.** No setting for this — variety is the whole point.

---

## A workflow that works

What this is good for:

1. You've sketched a character. The notes say "she's the village blacksmith, late 40s, lost a daughter in the war, doesn't trust the protagonist." You haven't given her a name. Open Brainstorm → Character names. Seed: "weathered, late-medieval European blacksmith, woman, name suggests strength but not heroism." Generate. Thumb up the ones with the right weight. More like these. Pick one. Done in under a minute.
2. You're writing the first scene of a new chapter. The protagonist enters a tavern. You need a name for the tavern. Brainstorm → Place names. Seed: "frontier-town tavern, run-down, suggests both refuge and trouble." Generate. Pick one. Back to the scene.
3. You've finished the manuscript and the working title doesn't feel right. Brainstorm → Titles. Seed describes the book in three sentences. Generate, thumb-up the close-but-not-quite ones, More like these, pick one. (Or do this five times across a week — you'll find the title.)

The use case is always: a small naming decision is blocking a larger thing, and you want options fast.

---

## See also

- **[Story bible](story-bible.md)** — where character/location/object/group names live once you've picked them
- **[AI providers](ai-providers.md)** — setting up which model Brainstorm uses
- **[Writing](writing.md)** — the AI actions that work *on* your prose (Rewrite, Expand, Describe…)
