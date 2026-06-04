# Audio Studio

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

The **Cast** tab is where you pick a voice for each character and for the narrator.

### What you see

- **A TTS provider dropdown** at the top — pick which TTS engine to draw voices from. You can mix and match: assign one character to an OpenAI voice and another to a Kokoro voice if you want.
- **A voice library** — every voice your selected provider offers. Each voice has a name, a gender tag, and a play button for an audition clip.
- **A search box** to filter the voice library by name.
- **The Narrator slot** — a dedicated card. The narrator voice handles all narration, interior thought, and the auto-generated chapter intros.
- **Character cards** — every character in your Story Bible appears as a card showing name, role, and the currently assigned voice. Unassigned cards have a dashed border and a warning badge so nothing slips through.
- **Smart-assign button** — calls your LLM to match every character to the best-fitting voice based on name, role description, and gender.
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

---

## Script — detecting who speaks what

The **Script** tab does the unglamorous work of figuring out, for every paragraph of every chapter, **who is speaking** — the narrator, a specific character (dialogue), or a specific character (interior thought).

This is what makes the eventual audio sound like a proper audiobook with distinct voices per character, rather than a single voice reading the entire text.

### What you see

- **A chapter dropdown** — pick the chapter you want to analyse.
- **A Re-analyze button** — sends the chapter prose to your LLM, which returns a labelled breakdown.
- **The result display** — each line of the chapter, labelled with: **speaker** (Narrator / character name), **type** (Narration / Dialogue / Interior thought), **confidence percentage**, and the full text of the line.

### How it works

When you click Re-analyze:

1. The app pulls the chapter body.
2. It strips out things that shouldn't be voiced — scene-break ornaments, "Scene 1" labels, structural headings, AI tracked-changes that haven't been accepted yet.
3. It prepends a **chapter intro** line for the narrator to read: *"Chapter Seven. Brackish Cove, at low tide."* You don't have to write this; it's generated from your chapter number and title.
4. It sends the cleaned text to your LLM and asks it to label every paragraph.
5. The result is shown line-by-line.

Review the result. If a line is mis-attributed, you can fix the chapter text (clearer dialogue tags help) and re-run.

Repeat for every chapter you intend to render.

### Why Script comes between Cast and Render

You can't render audio with the right character voices until something has decided which lines belong to which character. The Script step does that decision-making. The Render step is then deterministic — it has the script, it has the cast, it just generates the audio.

---

## Render — generating the audio

The **Render** tab is the final stage. For each chapter, it sends every script line to your TTS engine with the assigned voice, then stitches the audio fragments into a single WAV file for that chapter.

### What you see

- **A list of every chapter** in your manuscript.
- A **Render button** per chapter (disabled until the chapter has been analysed in the Script tab).
- A **progress display** while rendering — the line being processed and the total line count.
- **Play / Download buttons** once rendered — you can listen to the WAV in the app or save it.

### How to use it

Work down the chapter list:

1. **Click Render** on Chapter 1.
2. **Wait.** Longer chapters take several minutes depending on your TTS provider's speed and your machine. A 5,000-word chapter on a local Kokoro server typically renders in 1–3 minutes.
3. **Listen** to the result. Catch any awkward pronunciations now.
4. **Move to Chapter 2** and repeat.

Rendered chapters are automatically made available to the **Export** view for packaging into an M4B file.

### Tips

- **Local TTS engines are dramatically faster** than re-downloading audio from a cloud API. If you plan to render the whole book, a local engine (Kokoro, Chatterbox) is worth setting up.
- **You can re-render a single chapter** if the result is unsatisfactory. Open the chapter in the manuscript editor, fix the prose (often the problem is a confusing dialogue attribution), re-analyse the chapter in the Script tab, then re-render here.
- **Render is sequential.** You can't render four chapters at once.

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

Some non-audiobook uses for Studio:

- **Read your prose aloud as a revision technique.** Render a single chapter and listen. You will hear clunky sentences, repeated words, and rhythm problems that your eye missed. This is older than the recording industry: writers have read aloud for centuries to catch what reading silently can't.
- **Check dialogue attribution clarity.** If the Script tab gets a line wrong, your reader probably will too. Use it as a diagnostic for "does this dialogue read cleanly?"
- **Make an early audiobook for beta readers.** A rough TTS render is enough for a beta reader who prefers listening over reading.

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
