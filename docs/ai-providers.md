# AI providers

JustWrite uses AI for several features: writing assistance (the scene-strip AI dropdown — Rewrite, Expand, Tighten, Continue, Describe, plus Line edits), critique, entity sweeps, "Ask the book" chat, audiobook narration (TTS), and smart voice assignment. **None of them are required** — you can write an entire novel in JustWrite with zero AI calls.

If you do want AI features, you choose the provider. JustWrite isn't locked to any vendor. It works with anything that speaks the OpenAI chat-completions protocol — **cloud:** OpenAI, Anthropic Claude, Google Gemini, DeepSeek, OpenRouter (one key, every major model), or any other OpenAI-compatible endpoint; **local:** Ollama, LM Studio, llama.cpp, vLLM, or your own deployment. TTS works the same way — any server that speaks the OpenAI audio protocol.

You can have several providers configured at once and route different features to different providers.

---

## The big picture

There are three kinds of provider you might set up:

| Provider kind | What it does | Examples |
|---|---|---|
| **LLM** (chat) | Writing assistance, critique, entity sweeps, smart-cast | OpenAI, Claude, Gemini, DeepSeek, OpenRouter, Ollama, LM Studio |
| **TTS** (text-to-speech) | Audiobook narration | OpenAI TTS, Kokoro, Chatterbox, Dia, Microsoft Edge TTS (built-in), Speechmatics |
| **Embedding** | "Ask the book" chat — indexes your manuscript for question answering | OpenAI embeddings, any local embedding model |

A provider can speak more than one of these. **OpenAI**, for example, provides LLM + TTS + embeddings in one. **Anthropic**, **Google Gemini**, **DeepSeek**, and **OpenRouter** provide LLM only. **Ollama** provides LLM and embeddings (locally). **Kokoro** provides TTS only.

---

## Keeping content out of AI context

Every scene's **Links** panel and every character / location / object / group / worldbuilding article has an **Exclude from AI** checkbox. Tick it and that item is skipped by Ask-the-Book retrieval and any future feature that pulls scene or entity text into an LLM prompt. Use it for spoilers you haven't planted yet, drafts you don't want surfaced in chat answers, or sensitive backstory the model shouldn't read. The flag stays with the item; nothing else changes about how you write it.

---

## Where to set this up

Open **Settings → AI & Audio engines**. The page has three areas:

1. **Defaults** — three pickers for your global default LLM, TTS, and embedding provider.
2. **Feature routing** — per-feature overrides if you want a specific provider for a specific job.
3. **Providers list** — every provider you've added; the place to add, edit, test, and remove.

---

## Add your first provider

Most users start with **one** provider and add more later as needed.

1. Open **Settings → AI & Audio engines**.
2. Click **Add provider**.
3. Choose a preset (see below for the common ones) or configure manually.
4. Paste any API key required.
5. Click **Test** to confirm the connection works.
6. Save.

The connection test shows green (Online), yellow (Checking), or red (Offline). Offline usually means a wrong URL, a wrong key, or a local server that isn't running.

---

## Provider walkthroughs

### OpenAI (cloud)

The full-fat option. LLM + TTS + embeddings, all in one provider. Pay-as-you-go.

1. Sign up at **openai.com** and get an API key from the API keys page.
2. In JustWrite, **Add provider → Preset: OpenAI**.
3. Paste your API key.
4. Click **Fetch models** to populate the chat-model dropdown — common picks: `gpt-4o`, `gpt-4o-mini`.
5. Click **Fetch voices** to populate the TTS voice list — `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`.
6. **Test.** Save.

You're now wired up for every JustWrite AI feature.

**Cost notes.** GPT-4o-mini is inexpensive enough for routine writing assistance; GPT-4o is the better choice for critique and entity sweeps where reasoning quality matters. TTS is priced per character of text.

### Anthropic Claude (cloud)

Excellent for writing tasks — particularly critique and longer prose work — through Anthropic's OpenAI-compatible endpoint. LLM only (no TTS).

1. Sign up at **anthropic.com** and get an API key.
2. **Add provider → Preset: Claude (Anthropic)**.
3. Paste your `sk-ant-…` key.
4. The default model is `claude-haiku-4-5`. Change to `claude-sonnet-4-5` or higher for tougher tasks.
5. **Test.** Save.

**When to pick Claude.** Long-form prose work, structural critique, anything where you want a model that handles nuance and length well. Many writers prefer Claude for critique even when they use OpenAI for everything else — set Claude as the routing for "Critique" in Settings.

### Google Gemini (cloud)

Gemini through Google's OpenAI-compatible endpoint. LLM only (no TTS). Long context window — useful for whole-manuscript reads.

1. Get an API key from **aistudio.google.com**.
2. **Add provider → Preset: Gemini (Google)**.
3. Paste your key.
4. The default model is `gemini-2.5-flash`. Swap to `gemini-2.5-pro` for harder tasks.
5. **Test.** Save.

**When to pick Gemini.** Large-context tasks where the whole manuscript needs to be in the prompt — reverse outline, plot-hole audit, full-book sweeps. Gemini's context window is generous compared to most peers.

### DeepSeek (cloud)

DeepSeek's native API speaks OpenAI shape. LLM only. Strong reasoning quality at a fraction of the cost of GPT-4-class models.

1. Get an API key from **platform.deepseek.com**.
2. **Add provider → Preset: DeepSeek**.
3. Paste your key.
4. The default model is `deepseek-chat` (V3). Switch to `deepseek-reasoner` (R1) for slower-but-stronger reasoning.
5. **Test.** Save.

**When to pick DeepSeek.** Routine writing assistance at low cost, or `deepseek-reasoner` for structural / critique work where you'd otherwise reach for Claude. Notably cheap per token.

### OpenRouter (cloud aggregator)

One API key, OpenAI-shaped, routes to virtually every major model on the market — Claude, Gemini, DeepSeek, Mistral, Llama, GPT, and dozens more. Useful as a "single key for everything" alternative to seeding each provider individually.

1. Get an API key from **openrouter.ai**.
2. **Add provider → Preset: OpenRouter (aggregator)**.
3. Paste your key.
4. Click **Fetch models** — the live catalogue populates the dropdown. Model ids take the form `vendor/model-name`, e.g. `anthropic/claude-sonnet-4-6`, `google/gemini-2.5-pro`, `meta-llama/llama-3.1-70b-instruct`.
5. Pick a chat model. **Test.** Save.

**When to pick OpenRouter.** You want to A/B several models without managing five separate API keys. Or you want a model that doesn't ship with a built-in preset (Mistral, Together, Fireworks, …) — OpenRouter probably proxies it. Routing per feature (Settings → Feature routing) lets you point Critique at Claude, Writer actions at DeepSeek, and Entity sweep at Gemini, all through one key.

### Ollama (local, free)

Runs entire LLMs on your own computer. No API key, no monthly bill, no data leaving your machine.

1. Install Ollama from **ollama.com**.
2. Open a terminal and pull a model: `ollama pull llama3.1` (or `qwen2.5`, `mistral`, etc.). For embeddings: `ollama pull mxbai-embed-large`.
3. Make sure the Ollama service is running.
4. In JustWrite, **Add provider → Preset: OpenAI-compatible (local)**.
5. Base URL: `http://localhost:11434/v1` (Ollama's default).
6. API key: leave blank.
7. Click **Fetch models** — your pulled models appear.
8. Pick a chat model and an embedding model.
9. **Test.** Save.

**When to pick Ollama.** Privacy-critical work, no internet access, no API costs. The trade-off is quality — local 7B–13B models are noticeably weaker than GPT-4-class cloud models, though they've improved dramatically. Try a model on a sample passage before committing.

**Recommended models** (as of 2026): `qwen2.5:14b` or `llama3.1:8b` for writing, `mxbai-embed-large` for embeddings.

### LM Studio (local, free, GUI)

An alternative to Ollama with a graphical interface for downloading and managing models.

1. Install LM Studio from **lmstudio.ai**.
2. Download a model from inside LM Studio.
3. Start the local server (the "Local Server" tab) — default port is `1234`.
4. In JustWrite, **Add provider → Preset: OpenAI-compatible (local)**.
5. Base URL: `http://localhost:1234/v1`.
6. API key: leave blank.
7. **Fetch models** — your loaded model appears.
8. **Test.** Save.

**When to pick LM Studio.** Same use case as Ollama, but with a friendlier interface for finding and managing models. The two are interchangeable from JustWrite's perspective.

### Kokoro (local TTS, free, fast)

A small, fast local TTS engine for audiobook narration.

1. Install Kokoro-FastAPI from its GitHub project page.
2. Start the server — default port is `8880`.
3. In JustWrite, **Add provider → Preset: Kokoro (local TTS)**.
4. Base URL: `http://localhost:8880/v1`.
5. API key: leave blank.
6. **Fetch voices.** Save.

**When to pick Kokoro.** You want to narrate an entire audiobook without paying per character to OpenAI. Kokoro is fast enough to render a full novel in a reasonable amount of time on a modern machine.

### Chatterbox (local TTS + voice cloning)

A local TTS server that supports voice cloning — drop a reference voice clip into its `voices/` folder and the cloned voice appears in JustWrite's voice library.

1. Install Chatterbox-TTS-Server (devnen/Chatterbox-TTS-Server on GitHub).
2. Start the server — default port is `8004`.
3. **Drop your reference WAV or MP3 files** into the server's `voices/` folder. The filenames become the voice names.
4. In JustWrite, **Add provider → Preset: Chatterbox**.
5. Base URL: `http://localhost:8004/v1`.
6. **Fetch voices** — your reference clips appear.
7. Save.

**When to pick Chatterbox.** You want to narrate the book in a specific voice — your own, an actor's, the voice of a particular published audiobook. Drop a clip in, fetch, assign.

### Dia (local TTS + expressive dialogue)

A local TTS server from the same author as Chatterbox, focused on expressive multi-speaker dialogue. Strong choice when dialogue-heavy chapters sound flat with Kokoro or OpenAI's voices. Supports voice cloning via reference clips, plus a bundled catalogue of predefined voices.

1. Install **devnen/Dia-TTS-Server** (Python venv + `pip install -r requirements.txt`, same playbook as Chatterbox).
2. Start the server — default port is `8003`.
3. **(Optional)** Drop reference `.wav` / `.mp3` clips into the server's `./reference_audio/` folder (the web UI's "Import" button puts uploads there, so either path works).
4. In JustWrite, **Add provider → Preset: Dia**.
5. Base URL: `http://localhost:8003/v1`.
6. **Fetch voices** — Dia's bundled predefined voices, your reference clones, and two synthetic mode tokens (**S1** / **S2**) all appear in the cast picker.
7. Save.

**S1 and S2** are Dia's dialogue-mode speaker tokens. Cast a character on S1 and another on S2 in the same chapter to get distinct voices for an exchange even without uploading clones — useful for dialogue-heavy chapters where you want fast renders before committing to specific voice clips.

**When to pick Dia.** Your chapters have a lot of dialogue and you want it to sound like a conversation rather than two slightly different read-alouds. Or you want voice cloning with a different model than Chatterbox's.

### Microsoft Edge TTS (built-in, free)

JustWrite ships with **Microsoft's Edge "Read Aloud" TTS** built in — ~400 neural voices across ~140 locales, no setup, no API key, no account. The voices are the same ones Edge browser's Read Aloud feature uses (Aria, Emma, Guy, Davis, Jenny, Andrew, the multilingual line, plus localised voices for almost every European, Asian, and major African / South American language).

1. In JustWrite, **Add provider → Preset: Microsoft Edge TTS (free)**. Already ready — no fields to fill.
2. **Fetch voices** — the catalogue appears in the cast picker.
3. Save.

**Desktop app only.** Edge TTS routes through JustWrite's Rust backend (using the `msedge-tts` crate) because the renderer can't talk to Microsoft's WebSocket endpoint directly. `npm run dev:vite` in a plain browser won't have it; the packaged desktop build always does.

**When to pick Edge TTS.** You want a no-setup multilingual narration option that ships with the app — useful for first-time renders, non-English manuscripts, or pulling in a specific localised voice without standing up another server.

**Caveats.** Microsoft's Read Aloud endpoint is unofficial — it's intended for Edge browser. Microsoft has rotated authentication tokens before (the upstream library breaks; JustWrite ships a fix in a later release). Treat it as solid for everyday narration but keep one of the local engines (Kokoro, Chatterbox, Dia) configured as a fallback if you depend on TTS for production work.

### Speechmatics (cloud TTS)

A cloud TTS preview — four English voices (2 UK, 2 US, male/female), WAV 16 kHz output. Free during preview; paid tier begins later.

1. Sign up at **speechmatics.com** and get an API key.
2. **Add provider → Preset: Speechmatics (cloud TTS)**.
3. Paste your key.
4. The four voices (`sarah`, `theo`, `megan`, `jack`) are already populated — no Fetch step needed.
5. **Test.** Save.

**When to pick Speechmatics.** Quick cloud narration with no local setup, English-only voices, during the preview window. For full multi-voice casting at scale, Kokoro or OpenAI TTS offer broader voice libraries.

### Web Speech (your operating system's voices)

A special case. JustWrite can preview your OS's built-in voices live (so you can audition them in Studio), but it cannot use them to render audio files. They are flagged as "preview-only" and the render pipeline skips them.

You don't add Web Speech as a provider — it's just there.

---

## Routing features to specific providers

The defaults are convenient but limiting. Once you have two or more providers, you may want to send different features to different ones.

In **Settings → AI & Audio engines → Feature routing** you can pin each of nineteen features to its own provider and model:

| Feature | What it does |
|---|---|
| **Manuscript chat** | "Ask the book" — natural-language questions about your manuscript |
| **Critique** | The structural critique modal in the editor and chapter Versions menu |
| **Entity sweep** | The AI scan that proposes new characters, locations, and objects from chapter text |
| **Writer actions** | The scene strip's **AI** dropdown — Rewrite, Expand, Tighten, Continue, Describe, plus all Line edits |
| **Resume briefing** | The Home "Previously on your novel" card that orients you after a break |
| **Session recap** | The Home "Wrap up session" end-of-day recap that summarises what you wrote and pins open threads |
| **Foreshadowing scan** | The Markers view "Find dangling threads" scan that surfaces setups that may not have paid off |
| **Reader knowledge** | The Reader knowledge view's per-chapter dramatic-irony analysis (reader vs. POV knowledge) |
| **Voice drift explainer** | The Analysis dashboard "Explain" button that diagnoses why a hot chapter's voice differs from the baseline |
| **Unstuck moves** | The AI dropdown's "Unstuck — five ways out" diagnostic that proposes goal shift / interrupt / setting change / reveal / time cut |
| **Sensory research** | The AI dropdown's "Research feel…" modal — a structured sensory pack for the selected subject |
| **Character audit** | The Characters view "Audit consistency" sweep — flags actions inconsistent with each main character's established psychology |
| **Reverse outline** | The Analysis dashboard "Reverse outline" modal — reads the whole draft and produces the act structure the book actually has |
| **Beat sheet overlay** | The Analysis dashboard "Map to beat sheet" modal — maps the draft to Save the Cat, Hero's Journey, or 7-Point Story Structure |
| **Plot-hole audit** | The Analysis dashboard "Plot-hole audit" modal — flags contradictions, timeline issues, continuity drift, and character-knowledge errors across the manuscript |
| **Character chat** | The chat panel's "Talk to a character" mode — first-person, in-voice answers from your cast, grounded in the manuscript |
| **Relationship arc** | The Characters view "Relationship arc" modal — chapter-by-chapter warmth / tension / power tracking for a pair of characters |
| **Marketing pack** | The Analysis dashboard "Marketing pack" modal — logline, three back-cover blurbs, one-page synopsis, three-paragraph elevator pitch |
| **Multi-reader panel** | The chapter editor's "Multi-reader panel" critique — four reader personas (genre reader / literary critic / agent intern / book-club reader) react to a chapter in parallel |

Setting "Inherit default" for any feature uses your global Default LLM.

**A common routing setup**:

- **Default LLM**: Ollama (free, local, fast for routine work)
- **Critique**: pinned to Claude (better at structural reasoning)
- **Entity sweep**: pinned to GPT-4o-mini (cheap and reliable for this specific job)
- **Writer actions**: inherits default (Ollama)
- **Manuscript chat**: inherits default
- **Resume briefing**: inherits default (a fast local model is fine here — it's a short, structured task)
- **Session recap**: inherits default (same reasoning — short structured output, no need for the heavy provider)
- **Foreshadowing scan**: pinned to Claude (long-context structural reasoning helps catch subtler setups; runs once per chapter so the per-call cost adds up — pick your battle)
- **Reader knowledge**: pinned to Claude (same reasoning — sequential per-chapter calls benefit from strong reading comprehension; a smaller model produces noisier facts)
- **TTS**: Kokoro (free, local, fast)

This pattern keeps day-to-day cost near zero and only spends on the two features where cloud quality genuinely matters.

---

## AI usage and cost tracking

If you use cloud providers, **Settings → AI Usage** tracks what you've spent:

- Aggregate counters: total calls, total tokens, estimated cost in USD
- Breakdown by feature (chat, critique, entity sweep, writer actions)
- Breakdown by provider
- A searchable log of recent calls with timestamps, models, and token counts

Local providers always show $0. The cost figures for cloud providers come from a built-in price table — they're estimates, not invoices.

A **Reset ledger** button clears the log so you can start a fresh accounting period.

---

## Engine parameters and advanced settings

When editing a provider, you can:

- **Set a Tier** (Guided / Direct / Reasoned) — affects the speaker-attribution pipeline in Studio. Auto-detected by model name; can be pinned manually. Most users never need to touch this.
- **Add a custom system prompt** — overrides JustWrite's default system message for that provider. Advanced.
- **Adjust temperature and other generation parameters** through the engine parameters block.

These are optional refinements. The defaults are reasonable for almost every case.

---

## Switching provider or model from the page itself

> *"I'm in the Critique modal and the result feels off. I want to try a different model right here without leaving to navigate Settings."*

Every AI page has a small chip in its header showing the current **provider · model** for that feature. Studio shows two — one for the TTS engine, one for the active LLM call (Smart-assign on the Cast tab, Speaker analysis on the Script tab). Critique, Brainstorm, every analysis modal, Reader knowledge, the chat panel, the Speaker Lab — same chip in each. In the chapter editor, the chip sits at the **top of each scene's AI dropdown**, so writer actions (Rewrite, Expand, Tighten, Continue, Line edits) show their routing right above the menu items they apply to.

**Click the chip** and a small popover opens with two dropdowns: Provider and Model. The Provider dropdown lists *"Inherit default"* (the global LLM default set in Settings) plus every configured LLM-capable provider. The Model dropdown enables once you pick a specific provider; it shows the provider's saved configured-default model plus any models the live `/v1/models` fetch returned (Refresh button alongside if you need to force a re-fetch).

**The chip is a clearer surface for the same Feature routing in Settings.** Whatever you pick here is written to the same per-feature pin. Pinning Critique to Anthropic from the Critique modal also routes Multi-reader (which uses the `critique` feature key) to Anthropic — that's expected behavior, since both flow through the same feature.

**Visual cue:** the chip's tint changes when a pin is set, so you can tell at a glance whether the feature is following the global default or has been explicitly routed.

**Dismiss the popover** with Esc, by clicking the chip again, or by clicking anywhere outside it.

**Analysis modals wait for you.** When you open Multi-reader, Entity sweep, Foreshadowing, Plot-hole audit, Reverse outline, Marketing pack, Character audit, Sensory research, Session recap, Stuck diagnostic, or AI-tell scan, the modal opens to an empty-state with a primary "Run" button instead of firing the AI call immediately. That gives you a chance to change the chip routing first — pick a different model, or switch from your default to a faster local one — before spending tokens. Click the Run button when you're ready.

---

## Tuning the speaker-attribution prompt — Speaker Lab and production configs

> *"The Studio Re-analyze pipeline misattributes a few lines in chapter 2 with my current model. I want to try a different temperature or prompt, see if it fixes it, and have that tuned version be what every chapter actually runs against."*

JustWrite ships a **Speaker Lab** in the sidebar (Project section) — a debugging surface that exposes every knob behind Studio → Script → Re-analyze: the system prompt, the user template, temperature, anchor propagation, the confidence floor, Ollama think mode, and the tier (Guided / Direct / Reasoned). Three modes:

- **Studio** — the production pipeline. Tune in here when you want changes to affect what `Studio → Script → Re-analyze` actually does.
- **Lab** — a two-stage experimental pipeline. For research, not currently a production target.
- **Legacy Studio** — the older paragraph-level approach, kept around as a comparison point.

**Production configs.** The Studio panel has a row at the top: a picker showing **Default** plus every saved config, a green `PRODUCTION` badge on whichever one is currently active, and a primary **Use as production** button that promotes the picker's selection. The Default config is built-in (uses tier-resolved prompts and settings for whichever model the feature is routed to) and can't be edited or deleted. You can save the lab's current settings under a name (**Save as**, prompts for the name), load a saved config back into the lab to tweak it (**Load**), and switch the active production config without leaving the lab (just change the picker).

**Settings → AI & Audio engines** also shows a *Production prompt configs* card with the same picker — for each feature (Speaker analysis, Smart-assign), it shows the active config name, source, last-saved timestamp, and a preview of every overridden knob (temperature, system, user, propagate, useFloor, confidenceFloor, think). Switch active right from Settings if you don't want to open the lab.

**What it means in practice:** by default, Studio → Script → Re-analyze runs against the tier-resolved built-in prompt (the same one the lab opens to). If you tune the lab against a hard chapter, save it as *"Tuned for Claude"*, and click Use as production, every subsequent Re-analyze runs against that config — across every chapter in the project. Revert to Default any time by setting the picker back to Default and clicking Use as production.

**Smart-Assign**: the same data model exists for `smartCast`, but the Smart-Assign Lab itself isn't built yet (on the roadmap). For now the Smart-Assign row in Settings always says "Default (tier-resolved)" and you can't override it; the data shape is ready when the lab ships.

---

## Watching AI calls

> *"I asked for a critique five minutes ago. Is it still working, or did it freeze? I switched to another chapter to keep writing and now I can't tell what's going on."*

Anything in JustWrite that calls an AI — critique, brainstorm, smart-assign, script analysis, plot-hole scan, "Ask the book", every writer-assist rewrite — registers as a **task** that you can monitor from anywhere in the app. The sparkle icon in the title bar is the doorway.

**The header chip.** A small sparkle icon sits in the title bar. When no calls are in flight it's quiet. When something is running, it gets a pulsing dot and a number showing how many tasks are active. Click it to open the full **AI task panel** from any screen.

**What the panel shows you, per task:**

- The task's name (e.g. *"Chapter critique notes · Ch. 7"*) and feature.
- **Status phase** — *Connecting* before the first token arrives, *Streaming* once the model starts producing output.
- **Elapsed time** — live, in seconds.
- **First-token latency** — how long the model took to respond at all. Useful for local models that sometimes need to load before the first token; a 30-second first-token delay on a small model usually means it's still warming up.
- **Tokens** — exact count once the call completes, approximate during streaming.
- **Tokens per second** — how fast the model is producing output.
- **A freshness indicator** — the single best signal for *"is this stuck, or still working?"* It walks through three states based on when the last token arrived:
  - **Live** (green) — last token in the past three seconds.
  - **Stalling** (gold, blinking) — no tokens in 3–10 seconds.
  - **Stuck** (red, blinking) — no tokens in 10+ seconds. Almost always means cancel and try again.
- **A preview toggle** — expand to see the assistant's streaming text in real time as it's produced.
- **Cancel** — abort the call immediately. Cleaner than closing a modal mid-stream.

**Tasks survive navigation.** This is the headline. Start a critique on Chapter 7, navigate over to Worldbuilding to check a fact, hop into the Plot Board — the call keeps running. When it finishes, the result lands wherever it was supposed to (the critique on the chapter, the smart cast on Studio characters, etc.) and a toast tells you it's done with a **View** action that opens the panel to the just-finished entry. Closing a modal that was waiting for an AI call no longer cancels the call — the call decouples from the modal's lifecycle.

**Recent history.** The bottom of the panel lists the last 30 completed (or cancelled, or failed) tasks with duration, tokens used, and outcome. Useful for spot-checking which model produced which result, or for noticing that your local Ollama keeps timing out on the same feature.

**Dismissing the panel.** Esc, the **Close** button in the panel header, clicking the chip again, or clicking anywhere outside the panel.

**Why this matters for a writer.** Long AI calls — especially on local models, especially on the bigger analysis features — used to be opaque. You'd click Re-analyze, wait, and have no idea whether to keep waiting or give up. The freshness indicator answers that question directly: a green "live" dot means trust the wait; a red "stuck" dot means cancel and try a different model. And because the calls survive navigation, you're not penalised for switching screens mid-call to check something else.

---

## Troubleshooting

**Test returns Offline.**

- For cloud providers: usually an invalid API key, or a key with insufficient permissions. Verify on the provider's dashboard.
- For local providers: the server isn't running. Start it from the terminal.
- Check the URL doesn't have a typo. The Ollama default is `http://localhost:11434/v1` — note the `/v1` at the end; without it, JustWrite can't talk to the server.

**Local model is very slow.**

- Most likely you don't have enough RAM. A 7B model wants ~8 GB free; a 13B model wants ~16 GB. Try a smaller model.
- A GPU helps enormously. CPU-only inference is feasible but slow.

**The model doesn't return useful results.**

- Small local models (under 7B parameters) may not be good enough for critique or entity sweep. Try a larger model.
- Some quantizations are noticeably worse than others. Try a higher-quality quant (Q5_K_M or Q6_K rather than Q4_K_S).
- For writing tasks, larger context windows help. Check that your model has at least 8K context.

**OpenAI is charging me unexpectedly.**

- Check **Settings → AI Usage** for the breakdown by feature.
- The biggest spenders are usually: TTS (per character of text), critique on long chapters, and "Ask the book" if auto-rebuild RAG is on.
- Pin expensive features to cheaper models or local ones.

**An AI call seems hung — should I wait or give up?**

- Open the **AI task panel** from the sparkle chip in the title bar (see *Watching AI calls* above).
- A **live** (green) freshness dot means tokens are still arriving; trust the wait, especially for big analysis features.
- A **stalling** (gold) dot means no tokens in a few seconds; usually still recoverable.
- A **stuck** (red) dot means nothing has arrived in 10+ seconds. Hit Cancel and try a different model.

---

## See also

- **[Writing](writing.md)** — the scene-strip AI dropdown and Critique modal
- **[Audio Studio](audio-studio.md)** — TTS setup for audiobook narration
- **[Writer Lab](writer-lab.md)** — the standalone AI workbench
- **[Notes and search](notes-and-search.md)** — "Ask the book" chat
