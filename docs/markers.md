# Markers

> *"I noticed the pacing was off in this scene but I knew if I stopped to fix it I'd lose the next paragraph entirely — so I just kept writing and now I've forgotten what was wrong."*

Markers are pins you drop directly into your prose while drafting — "fix this later", "verify this fact", "this dialogue is weak", "this is a loose thread". They live inline in the manuscript like comments, but they're built for speed: hit a key, type three words, keep writing. Later, in revision, you open the Markers view and see every unresolved problem in the book laid out on one strip.

The point is to stop interrupting your flow to fix things you've noticed. Drop the marker, keep writing, come back when you're in revision mode.

---

## How markers differ from notes and comments

JustWrite has three ways to leave yourself a message about your prose. They're related but each fits a different moment:

- **Notes** are full prose surfaces. You open the Notes view, write a paragraph or three about a chapter or scene, anchor it, and it lives there until you delete it. Use Notes for *thinking*: plot ideas, character backstory you might use, scene-planning sketches.
- **Comments** are paragraph-level annotations. You select text, hit the Comment button, write a longer explanation. The selected text gets an underline; the comment pops up when you click. Use Comments for *explanations* that need more than a phrase — review feedback from a beta reader, an editorial note you want to keep across drafts.
- **Markers** are span-level pins with a one-line label and a category. Drop one with a hotkey while writing, almost without breaking flow. Use Markers for *unresolved problems in the prose itself*.

If you write 14 iffy sentences in a chapter, 14 Notes is unusable and 14 Comments is heavy. 14 Markers shows up as 14 ticks in one colour on the timeline strip — and you can see at a glance that chapter seven is where your prose problems live.

---

## Dropping a marker

While the cursor is in the editor:

- Select the text you want to flag (a word, a phrase, a sentence — whatever you want the marker to attach to).
- Press **Alt + M** or click the pin icon in the editor toolbar.
- A small popover opens. Pick a category, optionally type a one-line label, hit **Enter** (or click **Drop marker**).

If you don't have anything selected, JustWrite expands the marker to the word at the cursor — so a quick Alt + M without a selection still lands on something visible.

The marked text gets a dotted underline in the category's colour. The label and category are stored inline in the scene HTML, so the marker travels with the prose when you move scenes around, split chapters, or merge.

### The categories

The built-in categories are designed to cover the most common revision concerns:

| Category | Colour | Use for |
|---|---|---|
| **Fix later** | red | Anything obviously broken you'll come back to |
| **Verify** | blue | Facts to check, names to look up, dates to confirm |
| **Weak prose** | pink | Sentences you don't love but don't want to stop and fix |
| **Loose thread** | purple | Plot threads or character beats that need closing |
| **TODO** | yellow | Generic catch-all |
| **Idea** | green | A thought you had while drafting that you might develop later |

Each category gets its own colour throughout the app — the dotted underline in the editor, the ticks on the timeline strip, the dots in the markers list. Pick whatever convention you like; the system is opinionated about the names but you don't have to use them in any particular way.

---

## Editing or resolving a marker

Click any marked span in the editor and the marker popover opens again — this time in edit mode. You can:

- **Change the category** — pick a different chip.
- **Edit the label** — change the one-line note.
- **Save** — apply your changes.
- **Resolve** — remove the marker (the underlying text stays put; only the pin goes).
- **Cancel** — close without changes.

The toolbar also has **previous marker** and **next marker** buttons (the arrows next to the pin icon). They walk through every marker in the current scene in document order.

---

## The Markers view

The sidebar's Planning section has a **Markers** entry. Click it to open the manuscript-wide markers view.

### The timeline strip

> *"I'm starting my revision pass and I have no idea where the real problems are — I just have a vague feeling that the second half is rougher."*

At the top of the view is a horizontal strip that represents your whole manuscript at proportional scale. Every marker in the book is a coloured tick on that strip — coloured by category, positioned by how far into the manuscript the marker sits.

The strip is the differentiator. You see at a glance:

- Where your problem markers cluster. Fourteen "weak prose" ticks in the second half of chapter seven means that's where your revision pass starts.
- Whether you've left "verify" pins scattered through the book (yellow ticks every few chapters) or concentrated in one section (clumped together).
- Whether your "loose thread" pins are evenly distributed (you've been good about tracking them throughout) or all in the back half (the front of the book is now suspiciously fine).

Click any tick to jump straight to that marker in the editor.

### The filter chips

Below the timeline is a row of category chips with marker counts. Click any chip to filter the list (and dim the timeline strip) to just that category. Click **All** to clear the filter.

The counts are honest — they're recomputed every time you open the view. As you resolve markers in the editor, the counts go down.

### The marker list

Below the filters is the flat marker list, in manuscript order. Each row shows:

- The category dot and label.
- The chapter and scene number.
- Your one-line label (if you wrote one).
- A short snippet of the marked text in italics.
- **Jump to** — opens the chapter/scene in the editor.
- **Resolve** — removes the marker from the prose. The text stays; only the pin goes.

---

## "Find dangling threads" — AI scan for unresolved setups

> *"I planted the locket in chapter three and genuinely can't remember if it ever pays off."*

You don't notice the threads you forget. Mid-draft you set up a vow, an object, a question, an ability, a secret — and a thousand sentences later you've buried it. The thing about a forgotten setup is that you can't search for it: you don't remember what to look for. The Markers view has a **Find dangling threads** button in the header that closes this loop by asking the model to do the noticing for you.

**What it does.** Walks every chapter and identifies *setups* — narrative elements that demand a later payoff. Things like:

- **Promises** ("I'll find him")
- **Objects** (a distinctive item placed in someone's hand)
- **Questions** raised but not answered
- **Abilities** established for later use
- **Secrets** known to one character but not others
- **Threats** issued
- **Debts** declared

For each setup it captures a verbatim phrase from the chapter and a short "key term" — a specific noun or two-word phrase. Then it scans every *later* chapter for that key term. Setups whose key term never reappears are flagged as **Dangling**; setups whose key term does show up later are flagged as **Mentioned later** (payoff or not is your call — the model is cautious about claiming something is resolved).

**The review modal.** After the scan you see a list grouped by chapter. The default filter is **Dangling** — the ones that need your attention. Each thread shows the kind badge, the verbatim snippet in italics, your auto-generated label, and a status badge listing the chapters the key term re-appears in (if any). Per-thread **Pin** drops a Loose-thread marker into the chapter at the exact phrase. **Pin all dangling** marks the whole filtered set at once.

**What the scan doesn't do.** It doesn't read for payoff in the literary sense — that requires understanding the scene, which is expensive. The keyTerm check is a cheap proxy: if the noun doesn't show up downstream, there's nothing to pay it off. If it does show up, you decide whether the payoff is real or whether the chapter just mentions the noun in passing.

**Already-pinned threads are filtered out.** The scan checks your existing Loose-thread and TODO markers and skips proposals that overlap with them — so a re-scan doesn't surface the same threads you've already noted.

**Routable** as the **foreshadowing** feature in Settings → AI. Long-context structural reasoning is helpful here, so a stronger cloud model often produces better setup-spotting than a small local model. The scan runs once per chapter, so per-call costs add up on long books — pick a model accordingly.

---

## "Find AI tells" — phrases that smell of AI

> *"I asked the model to rewrite a paragraph and it sounds technically fine, but something about it feels off — and I can't put my finger on what."*

LLM-assisted prose has a fingerprint. Even when the meaning is right and the voice is mostly yours, certain phrases sneak in that read as AI: stock catalog verbs ("delved into", "navigated the complexities", "tapestry of"), body-language clichés ("eyes sparkled", "stomach churned"), hedging qualifiers ("couldn't help but", "in a sense"), over-balanced cadence ("not only X, but Y"), and out-of-genre register ("ultimately", "it is important to note").

The **Find AI tells** button in the Markers view header runs a pure-deterministic regex scan across every chapter for the most common giveaway phrases. **No LLM call**. Results land instantly.

The modal groups findings into five kinds:

- **Stock catalog phrase** — the AI press-release register ("a testament to", "shed light on", "myriad of")
- **Body-language cliché** — the AI emotional-tell catalogue ("heart raced", "let out a shaky breath", "exchanged a knowing look")
- **Hedge / qualifier** — distancing layers the model adds when it isn't sure ("somehow felt", "in a way")
- **AI cadence** — over-balanced sentence rhythms the model defaults to ("not only X, but Y", "what had begun as X had become Y")
- **Out-of-genre register** — essay or non-fiction phrasings ("in conclusion", "ultimately", "as we have seen")

Each finding shows: the matched phrase, the sentence it falls in (with the match highlighted), the chapter and scene, and a short why-this-is-suspicious blurb. Click the kind chips to filter; click any **Scene** link to jump to the offending passage. **Re-scan** runs the pass again — useful after revisions.

**What it catches and what it doesn't.** The deterministic pass catches the easy tells with high confidence. It does not catch the harder ones: paragraph-level cadence, the way LLMs over-balance "and" clauses across sentences, generic abstraction creeping into descriptive prose. Those need a model to hear and are out of scope for this scanner. Treat the findings as a fast first-pass triage — fix what's flagged, then read with fresh eyes for the rest.

**Why a writer would use it.** AI-tell phrases are the single most reliable signal that prose was AI-assisted (or that the writer has internalised LLM register from too much exposure). They're cheap to fix once flagged. A draft that's been through this scan reads markedly less AI-shaped without the writer having to remember the catalog themselves.

---

## A drafting workflow

> *"I keep noticing problems while I'm drafting but every time I stop to fix one I lose my place in the scene."*

What this is meant to enable:

1. You're writing. The current sentence isn't great but you don't want to lose momentum fixing it. Highlight the sentence, Alt + M, pick "Weak prose", type "stilted" if you like, Enter. Three seconds. Keep writing.
2. You're writing. You name a character "Margaret" but you're not sure if that contradicts a backstory beat from chapter three. Highlight "Margaret", Alt + M, pick "Verify", type "ch.3 conflict?", Enter. Keep writing.
3. You're writing. You mention an old letter the protagonist found, but you haven't decided what it says. Highlight "the letter", Alt + M, pick "Loose thread", type "decide what it says", Enter. Keep writing.

Hours later, you stop drafting and open Markers. The timeline shows the scene you just wrote has clusters of weak-prose ticks (this scene is hard for you) and a couple of loose-thread pins. Spend 20 minutes resolving the weak-prose ones — most are smaller than they felt when you flagged them. Leave the loose threads alone; they're real plot work for next session.

That's the loop. The point is to make "I noticed a problem" a one-handed two-second action so noticing doesn't cost you the next sentence.

---

## How markers behave during structural changes

Markers ride on the prose, not on the scene. So:

- **Splitting a chapter** — markers in the before-cursor half stay with the original chapter; markers in the after-cursor half go with the new chapter.
- **Moving scenes** — markers go where the scene goes.
- **Merging two scenes** (deleting a scene boundary in continuous mode) — markers from both scenes end up in the merged scene.
- **Copy and paste** — copying a marked span pastes the marker too.

There's no "I had three markers in this chapter and now they're gone" failure mode — they always travel with the text they wrap.

---

## See also

- **[Writing](writing.md)** — the editor, view modes, the scene-strip AI dropdown, the formatting bubble menu
- **[Notes and search](notes-and-search.md)** — the heavier Notes surface for thinking
- **[Keyboard shortcuts](keyboard-shortcuts.md)** — Alt + M and the rest
