# Audio Studio

> *"I want my novel as an audiobook, and I can't afford to hire a narrator. Or I'm halfway through revisions and I want to *hear* my prose read back so I can catch what my eyes keep skipping."*

The **Studio** view is where you turn your written manuscript into a narrated audiobook. It walks you through three sequential stages, presented as three tabs:

1. **Cast** — choose voices for the narrator and every character.
2. **Script** — let the AI work out who speaks each line of every chapter.
3. **Render** — generate the audio chapter by chapter.

When all chapters are rendered, the **Export** view packages them into an M4B audiobook file with chapter markers.

You can write an entire novel in JustWrite without touching Studio. It exists for writers who want to produce an audiobook themselves, or to hear their prose read aloud as a revision tool.

---

## Setup required

Before you can use Studio at all:

- **A TTS (text-to-speech) provider** — Studio needs an engine that can speak text. Options include OpenAI TTS (cloud, paid), Kokoro (local, free, fast), Chatterbox (local, free, supports voice cloning), and anything else that speaks OpenAI's TTS protocol. Set this up in **Settings → AI & Audio engines**.
- **An LLM provider** — Studio uses an LLM for the "Smart-assign" voice matcher and for the per-chapter speaker analysis. Any OpenAI-compatible chat model works.

See [AI providers](ai-providers.md) for the full setup walkthrough for each engine.

A note on **Web Speech** (your operating system's built-in voices): JustWrite can preview them, but it cannot use them for final renders — they only exist live, and there is no file output. They are useful as auditioning voices, not as production voices.

---

## Cast — assigning voices

> *"I want each character to sound like a different person — and I'd rather not spend three hours auditioning every voice against every character."*

The **Cast** tab is where you pick a voice for each character and for the narrator.

### What you see

- **A TTS provider dropdown** at the top — pick which TTS engine to draw voices from. Only providers you've actually connected appear here (an API key set, or a local server pointed at JustWrite). Each entry shows a status tag: `CHECKING…` while the dropdown verifies reachability, `OFFLINE` when a server isn't responding or a key looks wrong. Offline providers stay in the list (so you don't lose your selection when a local server is temporarily off) — just dimmed and labelled. If your active provider goes offline, a small banner appears below the dropdown with a **retry** link.
- **A voice library** — every voice your selected provider offers, discovered live the first time you open Studio (and re-discovered when you switch providers). Each voice has a name, a gender chip, and a play button for an audition clip.
- **A search box** to filter the voice library by name.
- **The Narrator slot** — a dedicated card. The narrator voice handles all narration, interior thought, and the auto-generated chapter intros.
- **Character cards** — every character in your Story Bible appears as a card showing name, role, and the currently assigned voice. Unassigned cards have a dashed border and a warning badge so nothing slips through.
- **Smart-assign button** — calls your LLM to match every character to the best-fitting voice. The model gets each character's name, role, **gender**, **pronouns**, and any **aliases** (a.k.a.) from your Story Bible, plus each voice's name, gender, age, accent, and tone descriptors. The system prompt explicitly tells it to match on age / gender / tone / accent.
- **Clear cast button** — resets every assignment.

### How to use it

1. **Pick a provider** from the dropdown.
2. **Click a character's card** to select them.
3. **Click a voice in the library** to assign it.
4. **Audition voices** by clicking the play button — important for getting a feel before you commit.
5. **Click Smart-assign** to fill in the rest in one go. You can still override any of its choices afterward.
6. **Assign the Narrator last.** Pick a voice that feels right for the prose of your book — not a character voice. The Narrator carries everything that isn't direct character speech, so it's the voice the reader hears most.

### Tips

- **Smart-assign is a starting point, not a verdict.** It does a reasonable job matching gender and rough age but it doesn't know your book the way you do. Review every assignment before rendering.
- **Voices from different providers can coexist.** If OpenAI has the perfect voice for your protagonist but Kokoro has the right antagonist voice, use both — the pipeline routes each character's line to the correct engine automatically.
- **Voice cloning** (Chatterbox) lets you drop reference voice clips (WAV or MP3) into Chatterbox's `voices/` folder and use them by filename. Useful for narrating in your own voice, or for matching the tone of a published audiobook.

### Gender tags — auto-detected, click to fix

JustWrite tries to fill in each voice's gender automatically when it discovers it:

- **OpenAI voices** (Alloy, Echo, Fable, Onyx, Nova, Shimmer, and the newer Ash / Coral / Sage / Verse / Ballad) carry OpenAI's published gender (and accent and tone) from a built-in canon.
- **Kokoro voices** follow a `<region><gender>_<name>` convention — `af_alloy` is American Female, `bm_george` is British Male — which JustWrite parses on import. Accent comes free.
- **Chatterbox and other freeform voices** are checked against a built-in dictionary of common first names. `sarah.wav` is tagged female, `michael.wav` male. Genuinely ambiguous names (Alex, Jamie, Riley, Sam, Charlie) are deliberately left **unset** rather than being guessed wrong.

The gender chip in the voice library is **click-to-cycle**: ❓ → F → M → N (neutral) → unset → back to start. Click whenever the auto-detect is wrong (a stage name like "Vex", a fantasy voice called "Orb-7", or just a guess you disagree with). The override is saved on the voice and used by Smart-assign on subsequent runs.

Why bother? Smart-assign matches characters to voices by gender alongside everything else. A character your auto-detected as the wrong gender will get matched against the wrong voice pool. Fixing the chip once before Smart-assigning is cheaper than re-doing the assignment.

**Both sides of the equation matter.** Smart-assign also uses each character's **Gender** field (set on the character's page in the Story Bible — see [Story bible](story-bible.md#characters)). A character with no gender set gives the LLM no signal on that axis; it'll fall back to inferring from name/role/description, which is hit-and-miss. The pre-flight ritual that produces the best matches:

1. Check the voice library for any ❓ chips → click-cycle to set them.
2. Open each main character in the Story Bible and confirm **Gender** + **Pronouns** are filled.
3. Then click Smart-assign.

Existing voices you cached before the auto-detect shipped get backfilled on the next Studio open — JustWrite fills in any blank gender/accent/tone fields from inference but never overwrites a chip you set manually.

---

## Script — detecting who speaks what

> *"I write paragraphs that mix narration and dialogue — 'I don't know,' she said, and walked to the window. An audiobook needs the dialogue read in her voice and the rest in the narrator's. I don't want to manually split every paragraph."*

The **Script** tab does the unglamorous work of figuring out, for every paragraph of every chapter, **who is speaking** — the narrator, a specific character (dialogue), or a specific character (interior thought). This is what makes the eventual audio sound like a proper audiobook with distinct voices per character, rather than a single voice reading the entire text.

### What you see

- **A chapter dropdown** — pick the chapter you want to analyse. JustWrite remembers your last selection between sessions, so reopening Script lands you where you left off.
- **A Re-analyze button** — sends the chapter prose to your LLM, which returns a labelled breakdown.
- **The result display** — each line of the chapter, labelled with: **speaker** (Narrator / character name), **type** (Narration / Dialogue / Interior thought), **confidence percentage**, and the full text of the line. Every line has an **editable speaker dropdown** — if the AI got it wrong, click the dropdown and pick the right speaker (or *Unknown* if it's genuinely ambiguous). This works for both dialogue and narration: first-person POV chapters where the protagonist is the narrator, or stretches the AI mistakenly attributed to the narrator instead of a character, are both fixable here. Edited lines show a small ✎ marker and drop their confidence number (you've overruled the AI; it doesn't get to claim a percentage anymore).

### How it works

When you click Re-analyze, JustWrite runs an **inline-tag pipeline**:

1. Pull the chapter body.
2. Strip things that shouldn't be voiced — scene-break ornaments, "Scene 1" labels, structural headings, AI tracked-changes that haven't been accepted yet.
3. **Split every paragraph by quote marks** into alternating narration and dialogue segments. Narration parts are mechanically assigned to the narrator — the model never sees them as a candidate for any character voice.
4. **Tag each dialogue segment** inline (`[D1]`, `[D2]`, …) and send the cleaned, tagged text to your LLM with a list of project characters. The model attributes only the tagged dialogue.
5. **Anchor propagation** runs as a deterministic safety net: when a narration span contains a dialogue tag like *"Sarah said"* and matches a cast name, the adjacent dialogue segment is anchored to that character before the LLM sees it. Anchors win on tie-break.
6. **Confidence floor** — any LLM character pick below the configured threshold is demoted to "unknown" so a low-confidence wrong attribution doesn't quietly leak into the audiobook.
7. Prepend a **chapter intro** for the narrator: *"Chapter Seven. Brackish Cove, at low tide."* Generated from chapter number and title; you don't write it.
8. Emit a per-segment script: every paragraph explodes into a narrator line for the narration parts and individual lines for each `[D#]` segment with their attributed speaker.

The result: a paragraph like *"'I don't know,' she said. She walked to the window."* becomes three script lines — the character's "I don't know," then "she said." in the narrator voice, then the rest of the narration. Previously paragraphs got one speaker assignment apiece, which meant the dialogue tag ("she said.") either stuck on the character voice or pulled the dialogue onto the narrator.

Review the result. If a line is mis-attributed, you have three options:

- **Fix the line in place.** Click the speaker dropdown on that line and pick the right character. The line updates immediately and is saved with your project.
- **Improve the prose, then Re-analyze.** A misattribution usually comes from a confusing dialogue tag. Tightening the prose helps the AI *and* the reader.
- **Open Speaker Lab** (sidebar → Project section) to tune the pipeline against this chapter, save the tuned config as a named preset, and click **Use as production** so every Re-analyze going forward runs with your settings instead of the built-in defaults.

### The AI learns from your corrections

Every time you fix a speaker on a **dialogue line**, JustWrite remembers the line and the right speaker as a **correction**. The next time you Re-analyze *any* chapter in this project, the most recent corrections are folded into the LLM prompt as worked examples: *"here are lines you previously misattributed in this story — match these exactly when they appear, and apply the same reasoning to similar lines."*

Narration-line edits *don't* feed the learning loop. The LLM only ever attributes dialogue — narration is split out mechanically by the quote-splitter before the model sees anything — so a manual narration override is a one-off override of the pipeline, not a training signal. If you re-run Re-analyze on a chapter where you'd reassigned narration to a character, you'll need to reassign it again.

In practice this means:

- A character whose voice the AI keeps confusing (two characters named Alex; a soft-spoken antagonist the AI keeps assigning to the protagonist) gets unstuck after two or three corrections — subsequent chapters land cleaner without further manual fixes.
- Your corrections are per-project. A different project starts with a clean slate.
- Corrections involving characters you've since deleted from the cast quietly drop out — they're useless as examples.
- Up to 12 of the most recent corrections are sent on each Re-analyze; up to 200 are stored. The cap keeps the prompt small and your prior-art bank focused on recent decisions.
- You can wipe the whole correction memory in **Settings → Audio → Studio · Speaker corrections** (e.g. after a major character rename or POV change that invalidates old examples). The card shows how many corrections are stored. Clearing the memory does not touch existing scripts or the lines you've already fixed.

Re-analyze itself doesn't preserve manual edits to specific lines — it overwrites the script wholesale. The **correction memory is what carries your judgement forward** across runs.

Repeat for every chapter you intend to render.

### Why Script comes between Cast and Render

You can't render audio with the right character voices until something has decided which lines belong to which character. The Script step does that decision-making. The Render step is then deterministic — it has the script, it has the cast, it just generates the audio.

---

## Render — generating the audio

The **Render** tab is the final stage. For each chapter, it sends every script line to your TTS engine with the assigned voice, then stitches the audio fragments into a single WAV file for that chapter.

### What you see

- **A list of every chapter** in your manuscript.
- A **Render button** per chapter (disabled until the chapter has been analysed in the Script tab).
- A **progress strip** while rendering — elapsed time, current line / total lines, and a **Cancel** button. It's the same status strip every AI feature in JustWrite uses, so the in-flight render also appears in the header AI status panel and survives navigating away from Studio.
- Once rendered: **Play / Stop**, **WAV** (download), **Re-render**, and a **Delete** icon per chapter. The chapter row tells you the rendered duration in seconds.
- A **Delete all rendered (N)** button in the tab toolbar when at least one chapter has been rendered, in case you want to free the disk space the WAVs are taking up before re-rendering with a different cast.

### How to use it

Work down the chapter list:

1. **Click Render** on Chapter 1.
2. **Wait.** Longer chapters take several minutes depending on your TTS provider's speed and your machine. A 5,000-word chapter on a local Kokoro server typically renders in 1–3 minutes. Use **Cancel** on the progress strip to stop a render mid-flight (useful when you realise you've assigned the wrong voice).
3. **Listen** to the result with **Play**. **Stop** halts playback; clicking another chapter's Play stops the previous one automatically.
4. **Re-render** if the result is unsatisfactory (see below).
5. **Move to Chapter 2** and repeat.

Rendered chapters are automatically made available to the **Export** view for packaging into an M4B file.

### Renders survive a refresh

On the desktop app, every rendered chapter is written to disk under your app data directory and indexed in the project. **Closing JustWrite or refreshing the window does not lose your renders** — when you come back to the Render tab, the Play / WAV / Re-render / Delete row is already there. Renders only disappear when you:

- click **Delete** on a single chapter,
- click **Delete all rendered** for the project,
- permanently delete a chapter from the **Trash** (soft-deleting a chapter keeps its audio, so restoring brings the audio back too),
- delete the whole project.

In other words: deleting work in JustWrite cleans up its audio too; restoring keeps it intact.

In the browser-only dev build (`npm run dev:vite`), renders are session-only — refreshing the tab wipes them.

### Re-render and download

- **Re-render** generates the chapter again with the current cast and current script. The same on-disk file is overwritten; you don't end up with two copies. Use this whenever you change a character's voice in Cast, re-run Script analysis, or tweak the chapter prose.
- **WAV** opens a native Save As dialog (on the desktop app) so you can drop the chapter file wherever you want — no Downloads-folder lock-in. The file is copied from the in-app render directory, so saving doesn't consume extra disk space until you confirm.

### Tips

- **Local TTS engines are dramatically faster** than re-downloading audio from a cloud API. If you plan to render the whole book, a local engine (Kokoro, Chatterbox) is worth setting up.
- **Improve the prose, then re-render.** Often a misattributed line in the audio comes from a confusing dialogue tag in the text. Fix the prose in the editor, re-analyse the chapter in the Script tab, then Re-render here.
- **Render is sequential.** You can't render four chapters at once — the Render buttons on other rows disable while one is in flight.

---

## Putting it together — a complete audiobook workflow

A realistic full-book audiobook session:

1. **Configure your TTS provider** in Settings (one-time setup).
2. **Open Studio → Cast.** Click Smart-assign. Review the assignments — override any that feel wrong. Assign the Narrator.
3. **Open Studio → Script.** Work through every chapter, clicking Re-analyze on each. Spot-check the speaker attribution; fix any clearly wrong lines by improving the chapter prose.
4. **Open Studio → Render.** Render every chapter. Listen to each as it finishes.
5. **Open Export → M4B Audiobook.** Confirm all chapters are present, and export. You get a single `.m4b` file with chapter markers and metadata.

For a 100,000-word novel, this is a multi-day process — partly because of TTS speed, partly because spot-checking and re-rendering takes time. Treat it like a final-pass production stage, not something you do during drafting.

---

## A few less-obvious uses

Studio earns its keep even if you never ship an audiobook. Three writer-problems it quietly solves:

### Read your prose aloud as a revision technique

> *"I keep missing the same clunky sentences when I re-read silently — my eye fills in what I meant instead of what I wrote."*

Render a single chapter and listen. You will hear clunky sentences, repeated words, and rhythm problems that your eye missed. This is older than the recording industry: writers have read aloud for centuries to catch what reading silently can't — TTS just removes the friction of doing it yourself. A flat-affect synthetic narrator is, perversely, *better* than a great human reader for this: it doesn't paper over a weak sentence with charm.

### Check dialogue attribution clarity

> *"My beta reader said she lost track of who was speaking in the argument scene — but reading it back, every line seems obviously attributed to me."*

If the Script tab gets a line wrong, your reader probably will too. The LLM that runs Script is doing roughly what your reader does: scanning for cues that say "this is character A, not character B." Use it as a diagnostic for "does this dialogue read cleanly?" — when the Script tab misattributes, that's the spot to add a beat or a tag.

### Make an early audiobook for beta readers

> *"Half my beta readers listen rather than read, and I don't have a finished audiobook to give them yet."*

A rough TTS render is enough for a beta reader who prefers listening over reading. The voices won't be perfect — but plot, character, pacing all land, and you get genuine reactions instead of a "I'll get to it when I have time" stall.

---

## Once everything is rendered: M4B export

The M4B format is a single file that contains the entire audiobook with chapter markers and metadata. Apple Books treats it as a proper audiobook (with chapter navigation and a resume-where-you-stopped position). Most dedicated audiobook players (Overcast, Smart Audiobook Player) support it.

To export:

1. Open **Export** in the sidebar.
2. Pick **M4B Audiobook**.
3. Confirm the chapter count and total duration shown in the source status panel.
4. Click **Export**.

The first M4B export downloads ffmpeg.wasm (about 10 MB, one-time). The export itself depends on chapter count and total length — expect several minutes for a full novel.

If only some chapters are rendered, JustWrite offers to export the partial set rather than blocking you.

See [Import and export](import-and-export.md) for the full export walkthrough.

---

## See also

- **[AI providers](ai-providers.md)** — setting up OpenAI TTS, Kokoro, Chatterbox
- **[Import and export](import-and-export.md)** — M4B and other export formats
- **[Writer Lab](writer-lab.md)** — for prose-level revision before you commit to rendering
