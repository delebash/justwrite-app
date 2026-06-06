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
3. **Providers list** — every provider you've added; the place to add, edit, test, and remove. The **Quick setup** button at the top of this card runs a one-click wizard that detects your GPU, downloads the right local models, and applies a sensible routing preset (see *Quick setup for local LLM* below). Each provider row carries a small **usage badge** ("default", "N pinned features", or both) — click it to expand a list of every feature routed to that provider, so the role of a secondary provider (e.g. the "fast" Ollama entry the wizard creates on small cards) is visible without scrolling to Feature routing.

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

## Quick setup for local LLM

> *"I want to run AI locally, but every guide tells me to pick a model, figure out the right quantization, install it, then configure four different things in Settings. Just tell me what to do."*

The **Quick setup** wizard (in **Settings → AI & Audio engines**, top of the providers card) does the picking and configuring for you. It detects your GPU, picks the right models for your card, downloads them through Ollama, creates the provider entries, and applies a routing preset that sends each feature to the right model. One click; ~5 minutes of model downloads on a typical card; nothing else to configure.

**What it does, in order:**

1. **Detects your GPU and VRAM** (via `nvidia-smi` on NVIDIA cards, `system_profiler` on macOS, `rocm-smi` on AMD, with a manual picker fallback when detection fails).
2. **Probes your local Ollama server.** If Ollama isn't running, the wizard shows the install link and a Recheck button — it does not try to install Ollama itself (too many OS-specific failure modes).
3. **Picks a hardware preset** — one of CPU / 8 GB / 12 GB / 16 GB / 24 GB / 32 GB. You can override the detected tier from a dropdown.
4. **Lets you (optionally) pick a cloud provider** for heavy analysis features (Critique, Plot-hole audit, etc.). If you don't have one configured, those features stay local on the heavy model.
5. **Shows what it's about to download** — typically 1–3 models, ~5–15 GB depending on tier — and lets you confirm before pulling anything.
6. **Pulls the models** sequentially via Ollama's native API, with per-model progress bars and cancel. Already-installed models are skipped.
7. **Applies the routing preset.** Creates (or updates) up to two Ollama providers — *"Ollama · qwen3:14b"* and *"Ollama · qwen3:8b (fast)"* on the 8 GB tier, for example — sets your default LLM and embedding provider, and pins each feature to the right model per the recipe documented in *Recommended feature routing by card* below.

**What you'll get on an 8 GB card** (the canonical example):

- Default LLM → `qwen3:14b` (prose quality)
- Brainstorm, Resume briefing, Session recap, Entity sweep, Sensory research, Unstuck moves → `qwen3:8b` (snappier responses where speed matters more than depth)
- Writer actions, Studio Speaker analysis, Studio Smart-assign, Character chat → inherit the 14B default (reasoning-class work)
- Critique, Plot-hole audit, Reverse outline, Multi-reader, Character audit, Foreshadowing, Reader knowledge, Voice drift, Beat sheet, Marketing pack, Relationship arc → cloud (if a cloud provider was picked) or default 14B (if not)
- Embedding → `nomic-embed-text` on the same Ollama endpoint

**Re-running is safe.** Pick a different tier and rerun — the wizard upserts the same provider ids, so it overwrites cleanly without leaving stale entries behind. You can also fine-tune any of the pins afterward in **Feature routing** without losing the rest of the preset.

**The presets are editable.** Local LLMs ship faster than this app does, so the per-tier model picks live in a **Hardware presets** card right above the providers list — accordion of every tier with inline editing for the default chat model, fast chat model (when applicable), embedding model, the list of models to download, and the estimated download size. Factory tiers can be **Reset** to their built-in defaults; you can **Add custom tier** for a setup the built-in tiers don't cover (e.g. *"My RTX 4090 setup"* with a model line you specifically prefer); custom tiers can be **Deleted**. Quick Setup reads from this card, so anything you change here is what the wizard offers next time. When a new model lands — bigger Qwen, a fresh Mistral, whatever — you point a preset at it without waiting for an app release.

**When Quick setup isn't the right path.** If you've already curated your own model lineup and feature routing, or you need a model that isn't in Ollama's catalogue (TabbyAPI, llama.cpp's `llama-server`, an LM Studio model), skip the wizard and configure the provider manually — see the *Provider walkthroughs* below.

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

**Recommended models** (as of 2026): see **[Choosing a local model for your hardware](#choosing-a-local-model-for-your-hardware)** below for picks by VRAM tier — covers Ollama and LM Studio alike.

### LM Studio (local, free, GUI)

A graphical alternative to Ollama. Same engine family (llama.cpp under the hood) but with a built-in model browser that filters by VRAM, one-click downloads, and a server tab that flips on an OpenAI-compatible endpoint. The easiest path for users who'd rather not touch a terminal.

1. Install LM Studio from **lmstudio.ai** (Windows / macOS / Linux installers).
2. Open the **Discover** tab. Browse or search for a model — LM Studio shows a green "Will fit" / yellow "Partial GPU" / red "Won't fit" badge against your detected VRAM, so you don't need to guess. See **[Choosing a local model](#choosing-a-local-model-for-your-hardware)** below for picks.
3. Click **Download** on the chosen GGUF variant (e.g. `Q4_K_M` for the best size/quality tradeoff on most cards).
4. Open the **Developer** tab (older builds: **Local Server**) and click **Start Server**. Default port is `1234`.
5. In JustWrite, **Add provider → Preset: OpenAI-compatible (local)**.
6. Base URL: `http://localhost:1234/v1`.
7. API key: leave blank.
8. Click **Fetch models** — every model you've loaded in LM Studio appears.
9. **Test.** Save.

**Embeddings.** LM Studio can serve an embedding model on the same endpoint. Download an embedding model (`nomic-embed-text-v1.5`, `bge-m3`, or `mxbai-embed-large` — see the table below), load it from the Developer tab alongside your chat model, and pick it in JustWrite's embedding-model dropdown for "Ask the book".

**When to pick LM Studio over Ollama.** You want a GUI for browsing and downloading models, you'd like at-a-glance VRAM compatibility, or you want a Settings panel that exposes GPU offload / context length / KV-cache quant without editing config files. Functionally interchangeable with Ollama from JustWrite's perspective — the choice is purely about UX preference.

---

## Choosing a local model for your hardware

The biggest variable for local LLM quality is the model size you can fit in VRAM at a reasonable quantization. The table below is a starting point; LM Studio's compatibility badges will give you the exact answer for your card.

**Quantization quick reference.** `Q4_K_M` is the standard size/quality sweet spot — sub-1pp MMLU loss vs full precision at ~30% of the file size. Drop to `Q3_K_M` only if a model otherwise won't fit; step up to `Q5_K_M` or `Q6_K` if you have headroom and want a small quality bump.

### Honest framing for the 8B tier

Older guidance (including earlier versions of this page) told 8 GB-card users that an 8B model was "fine for writer actions." Current benchmark evidence and user testing say that's too generous:

- The Qwen3 technical report (arXiv 2505.09388) shows **Qwen3-14B = 7.02 vs Qwen3-8B = 5.42** on WritingBench — a ~30% gap.
- Neither dense 8B nor dense 14B Qwen3 models appear in Arena's Creative Writing top 182 (of 363 models, June 2026) — the 8B tier isn't competitive on prose leaderboards.
- Community reports document 8B failure modes — rushing scenes, phrase repetition, voice drift — that show up within standard chapter-length generation, not just long context.

**What 8B is genuinely fine for:** brainstorming, outlining, single-sentence rewrites, structural one-off prompts, short-input/short-output utility calls.

**What 8B underdelivers on:** Continue-a-scene, Expand-with-sensory-detail, voice consistency, multi-paragraph rewrites, Studio speaker attribution. All of these benefit meaningfully from stepping up to 14B even if it costs partial CPU offload on an 8 GB card.

**What you actually want at the prose threshold:** 32B+. 14B is a meaningful step up from 8B but still not what a novelist would call "great." For full-chapter critique and plot-hole work, route to cloud regardless of local card size.

### LLM (writing assistance, critique, entity sweep)

| Your hardware | VRAM | Primary pick | Notes |
|---|---|---|---|
| RTX 2060 / 3050 / 4050, RX 6600 | 6–8 GB | `qwen3:14b` (Q4_K_M) with partial CPU offload | 8B fits cleanly but underdelivers on prose. 14B (~9 GB) needs CPU offload here, runs ~6–12 tok/s — slower but the prose quality justifies it. Keep 8B around as a pin for Brainstorm only. |
| RTX 2070 / 3060Ti / 3070 / 4060 | 8 GB | `qwen3:14b` (Q4_K_M) with partial CPU offload | Same logic. 14B at ~10–20 tok/s with offload is the honest default; pin Brainstorm and Resume briefing to 8B if you want snappy responses there. See 8 GB notes below. |
| RTX 3060 12 GB / 4070 / 5070, RX 6700XT / 7700XT | 12 GB | `qwen3:14b` (Q4_K_M) ~9 GB full-GPU | 14B fits cleanly on GPU here — no offload, ~40–60 tok/s. The 24B at Q3 is a stretch option for tough analysis. |
| RTX 4060Ti 16GB / 5060Ti 16GB / 4080, RX 7800XT | 16 GB | `qwen3:14b` (Q6_K) or `mistral-small3:24b` (Q4_K_M) ~14 GB | Either better quality on a 14B or a meaningfully stronger 24B at standard quant. |
| RTX 3090 / 4090 / 7900XTX | 24 GB | `qwen3:32b` (Q5_K_M) ~22 GB, or `gpt-oss:20b` (Q6_K) | At this tier you're approaching cloud-class quality for prose work. |
| RTX 5090 | 32 GB | `llama3.3:70b` (Q4_K_M) ~42 GB partial offload, or `qwen3:32b` (Q6_K) ~27 GB full | 70B fits comfortably with KV-cache headroom. Genuinely competitive with GPT-4o-mini on writing tasks. |
| CPU only, 16+ GB RAM | n/a | `qwen3:8b` (Q4_K_M) — the only realistic local option here | Expect 3–8 tok/s. Adequate for short utility calls and brainstorming; painful for prose generation, unusable for critique on long chapters. Route prose-heavy features to cloud. |
| Apple Silicon (M2/M3/M4) | unified RAM | Same picks as the matching VRAM tier — Macs share RAM with the GPU | On an M-series with 16 GB RAM, treat it like a 12 GB GPU (the OS reserves some). Metal acceleration is excellent in both Ollama and LM Studio. |

### Embedding ("Ask the book" / RAG)

Embedding models are tiny (sub-1 GB) and run alongside your chat model without meaningful VRAM impact. Three solid picks:

| Model | Size | Context | Notes |
|---|---|---|---|
| `nomic-embed-text` | 137 M (~270 MB) | 8K | Lightweight default. Strong for English prose, multilingual is decent. Fastest. |
| `bge-m3` | 568 M (~1.2 GB) | 8K | Best multilingual quality. Pick this if your manuscript isn't English, or for long chapters where the 8K window matters. |
| `mxbai-embed-large` | 335 M (~670 MB) | 512 | Highest English quality at the price of a short context window — JustWrite chunks chapters before embedding, so the small window is usually fine. |

For an 8 GB GPU running an 8B chat model: `nomic-embed-text` is the safe choice. For 12 GB+: any of the three.

### Recommended feature routing by card

The hardware table above tells you which **model** to use. This section tells you which **features** to pin to which model so the heavier picks only run where they're needed.

> **Shortcut:** the **Quick setup** wizard (see *Quick setup for local LLM* above) applies the routing recipe below for your detected card in one click — providers, defaults, pins and all. The rest of this section is the reference behind what it does, useful if you want to understand or hand-tune the routing.

All of these are configured in **Settings → AI & Audio engines → Feature routing**.

**Two setup steps before you start pinning** (Quick setup does both for you):
1. Add **two** Ollama / LM Studio providers pointing at the same server but with different default chat models — e.g. *"Ollama (8B fast)"* with `qwen3:8b` and *"Ollama (14B prose)"* with `qwen3:14b`. JustWrite treats each as a separate provider you can pin features to.
2. Add a cloud provider (Claude, DeepSeek, or Gemini) for the heavy analysis features.

#### 8 GB card (RTX 2070 / 3060Ti / 3070 / 4060)

**Default LLM** → `qwen3:14b` (partial CPU offload, ~10–20 tok/s).

| Feature | Pin to | Why |
|---|---|---|
| Brainstorm | `qwen3:8b` | Speed matters more than depth for ideation. |
| Resume briefing | `qwen3:8b` | Short structured output. |
| Session recap | `qwen3:8b` | Short structured output. |
| Writer actions | inherit (14B) | Prose generation — accept the slower speed for quality. |
| Studio · Speaker analysis | inherit (14B) | 8B misses attributions; 14B is the working floor. |
| Studio · Smart-assign | inherit (14B) | Reasoning-class. |
| Critique | cloud (Claude / DeepSeek) | Long context, structural reasoning. |
| Plot-hole audit | cloud | Cross-chapter reasoning. |
| Reverse outline | cloud | Reads the whole manuscript. |
| Multi-reader panel | cloud | Four personas in parallel — cloud quality compounds. |
| Character audit | cloud | Cross-chapter reasoning. |
| Foreshadowing scan | cloud | Same. |

Embeddings: `nomic-embed-text` loaded alongside the chat model (~500 MB; fits with the 14B).

#### 12 GB card (RTX 3060 12GB / 4070 / 5070)

**Default LLM** → `qwen3:14b` (full GPU, ~40–60 tok/s — no offload).

Same pinning recipe as 8 GB above, but Writer actions and Studio Speaker analysis run much faster locally. Critique and plot-hole audit are still meaningfully better on cloud at this tier — that's a quality call, not a hardware one.

#### 16 GB card (RTX 4060Ti 16GB / 5060Ti 16GB / 4080)

**Default LLM** → `qwen3:14b` Q6_K, or `mistral-small3:24b` Q4_K_M.

Keep Brainstorm / Resume / Recap pinned to a smaller model for snappy responses. Critique and reverse outline can run locally on the 24B; pin to cloud only if you want top-tier reasoning quality.

#### 24 GB card (RTX 3090 / 4090 / 7900XTX)

**Default LLM** → `qwen3:32b` Q5_K_M, or `gpt-oss:20b` Q6_K.

Almost everything runs locally at this tier. Cloud routing is optional — useful when you want a specific model's voice for critique (Claude's editorial tone, say) but no longer a quality necessity.

#### 32 GB card (RTX 5090)

**Default LLM** → `llama3.3:70b` Q4_K_M, or `qwen3:32b` Q6_K.

Cloud routing becomes a personal preference rather than a quality requirement.

#### CPU only

**Default LLM** → `qwen3:8b` Q4_K_M. Pin **Writer actions, Critique, all Studio features, multi-reader, audits** → cloud. Local CPU inference is too slow to be enjoyable for prose generation; spending a few cents on cloud is the right call. Keep Brainstorm / Resume / Recap local — short calls the CPU can handle.

### Notes for an 8 GB card

If you have an RTX 2070 / 3060Ti / 3070 (8 GB):

- The **default LLM** should be `qwen3:14b` at Q4_K_M with partial CPU offload. Slower than 8B (~10–20 tok/s depending on your CPU and RAM speed) but the prose quality is meaningfully better — Qwen3's own benchmark numbers put 14B ~30% above 8B on WritingBench.
- **Pin Brainstorm, Resume briefing, and Session recap to `qwen3:8b`** for snappier responses where speed matters more than depth.
- **Pin Critique, Plot-hole audit, Reverse outline, Multi-reader panel, Character audit, and Foreshadowing scan to a cloud provider** (Claude, DeepSeek, Gemini). Local 14B with offload technically works but the latency on full-chapter analysis becomes painful, and cloud reasoning quality is meaningfully better.
- **Embeddings ("Ask the book"):** keep `nomic-embed-text` loaded. ~500 MB alongside the chat model, fits comfortably with the 14B.

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

**The only local TTS server JustWrite supports that does true voice cloning.** Ships three swappable models you switch from the provider editor:

- **chatterbox** (Base) — English, 0.5 B parameters, strongest emotion control via the exaggeration and cfg_weight knobs.
- **chatterbox-turbo** — fastest (350 M), supports paralinguistic tags in the script text: `[laugh]` `[chuckle]` `[sigh]` `[gasp]` `[cough]` `[clear throat]` `[sniff]` `[groan]` `[shush]`.
- **chatterbox-multilingual** — 0.5 B, 23 languages.

Switching models triggers a server reload; the first switch for a model may take 10–30 seconds while it downloads from HuggingFace.

1. Install Chatterbox-TTS-Server (devnen/Chatterbox-TTS-Server on GitHub).
2. Start the server — default port is `8004`.
3. **(Optional)** Drop reference WAV or MP3 files into the server's `voices/` folder or `reference_audio/` folder — both are picked up. The web UI's Import button puts uploads into `reference_audio/`, so either path works. Clone entries appear in the cast picker with a `(clone)` suffix.
4. In JustWrite, **Add provider → Preset: Chatterbox**.
5. Base URL: `http://localhost:8004/v1`.
6. **Pick a model** — Base, Turbo, or Multilingual — then click **Apply** to hot-swap the server.
7. **Fetch voices** — predefined voices and clones both appear.
8. (Optional) Open **Engine params** to tune **exaggeration**, **cfg_weight**, **temperature**, **speed_factor**, **chunk_size**, and **language**.
9. Save.

**When to pick Chatterbox.** You want to narrate the book in a specific voice — your own, an actor's, the voice of a particular published audiobook. Drop a clip in `voices/` or `reference_audio/`, fetch, assign. Use Turbo when you want paralinguistic cues like laughter or sighs baked into the audio; use Base when you want the most expressive emotion control; use Multilingual for non-English manuscripts.

### Dia (local TTS + expressive dialogue)

A local TTS server from the same author as Chatterbox, focused on expressive multi-speaker dialogue. Strong choice when dialogue-heavy chapters sound flat with Kokoro or OpenAI's voices. Ships three swappable models you switch from the provider editor:

- **Dia 1.6B** (default) — proven dialogue quality, ~4.4 GB VRAM, the safe choice for 8 GB cards and the only option on devnen Dia-TTS-Server v1.x.
- **Dia2-1B** — ~3 GB VRAM, streaming-capable (real-time generation), lightest on resources.
- **Dia2-2B** — Nari Labs' top-tier dialogue model at ~5–6 GB VRAM; best quality but tight on 8 GB cards if an LLM shares the GPU.

All three are bundled with the same server (devnen v2.0+) and hot-swap without restarting. Bundles a catalogue of predefined voices and accepts reference clips for prosody guidance — but it isn't a voice-cloning engine; for that, use Chatterbox.

1. Install **devnen/Dia-TTS-Server** v2.0.0 or later (Python venv + `pip install -r requirements.txt`, same playbook as Chatterbox).
2. Start the server — default port is `8003`.
3. **(Optional)** Drop reference `.wav` / `.mp3` clips into the server's `./reference_audio/` folder (the web UI's "Import" button puts uploads there, so either path works). These act as prosody/style references — not voice clones.
4. In JustWrite, **Add provider → Preset: Dia**.
5. Base URL: `http://localhost:8003/v1`.
6. **Pick a model** — Dia 1.6B, Dia2-1B, or Dia2-2B — then click **Apply** to hot-swap the server. First load of a Dia2 model can take 30–90s while it downloads from HuggingFace.
7. **Fetch voices** — Dia's bundled predefined voices, any reference clips you've added, and two synthetic mode tokens (**S1** / **S2**) all appear in the cast picker.
8. Save.

**S1 and S2** are Dia's dialogue-mode speaker tokens. Cast a character on S1 and another on S2 in the same chapter to get distinct voices for an exchange even without uploading reference clips — useful for dialogue-heavy chapters where you want fast renders before committing to specific voices.

**When to pick Dia.** Your chapters have a lot of dialogue and you want it to sound like a conversation rather than two slightly different read-alouds. If you specifically need voice cloning, pick Chatterbox instead — Dia's reference clips guide style and prosody, not speaker identity. Use Dia 1.6B for the widest compatibility, Dia2-1B for fastest renders, Dia2-2B if you have a 12 GB+ GPU and want the best dialogue model on the stack.

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

In **Settings → AI & Audio engines → Feature routing** you can pin each of twenty-two features to its own provider and model:

| Feature | What it does |
|---|---|
| **Manuscript chat** | "Ask the book" — natural-language questions about your manuscript |
| **Critique** | The structural critique modal in the editor and chapter Versions menu |
| **Entity sweep** | The AI scan that proposes new characters, locations, and objects from chapter text |
| **Writer actions** | The scene strip's **AI** dropdown — Rewrite, Expand, Tighten, Continue, Describe, plus all Line edits |
| **Brainstorm** | The standalone Brainstorm workbench — ideation and short-form drafting |
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
| **Studio · Speaker analysis** | Studio → Script → Re-analyze — dialogue-to-character attribution. Reasoning-class; benefits from a larger local model than the writer-actions tier. |
| **Studio · Smart-assign** | Studio → Cast — auto-assigns TTS voices to characters based on traits. Reasoning-class. |

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
