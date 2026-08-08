# Troubleshooting

The problems users actually hit, and what fixes them. AI-side first (it's where
most questions land), then pointers for everything else.

## AI providers and models

**Test returns Offline.**

- For cloud providers: usually an invalid API key, or a key with insufficient permissions. Verify on the provider's dashboard.
- For local providers: the server isn't running. Start it from the terminal.
- Check the URL doesn't have a typo. For the **Ollama (native)** preset the default is `http://localhost:11434` — no `/v1`. For a generic **OpenAI-compatible** provider (LM Studio, llama.cpp's own server, vLLM) the URL usually needs the `/v1` suffix — LM Studio's default is `http://localhost:1234/v1`.

**Local model is very slow.**

- Most likely you don't have enough RAM. A 7B model wants ~8 GB free; a 13B model wants ~16 GB. Try a smaller model.
- A GPU helps enormously. CPU-only inference is feasible but slow.

**The model doesn't return useful results.**

- Small local models (under 7B parameters) may not be good enough for critique or entity sweep. Try a larger model.
- Some quantizations are noticeably worse than others. Try a higher-quality quant (Q5_K_M or Q6_K rather than Q4_K_S).
- For writing tasks, larger context windows help. Check that your model has at least 8K context.

**OpenAI is charging me unexpectedly.**

- Check **Settings → AI Usage** for the breakdown by feature.
- The biggest spenders are usually: critique on long chapters, and "Ask the book" if auto-rebuild RAG is on.
- Pin expensive features to cheaper models or local ones.

**An AI call seems hung — should I wait or give up?**

- Open the **AI task panel** from the sparkle chip in the title bar (see [Watching AI calls](ai-providers.md#watching-ai-calls)).
- A **live** (green) freshness dot means tokens are still arriving; trust the wait, especially for big analysis features.
- A **stalling** (gold) dot means no tokens in a few seconds; usually still recoverable.
- A **stuck** (red) dot means nothing has arrived in 10+ seconds. Hit Cancel and try a different model.

**A model refuses a thinking / reasoning request.**

- The error you see is the provider's own message, with one sentence naming the
  fix: turn Thinking off on that feature's preset, or point the preset at a
  model that can think. Nothing is filtered or silently retried — see
  [Models](models.md) for how the Thinking control resolves.

## Everything else

- **Data, snapshots, restoring** — [Backups and data](backups-and-data.md)
- **Where data lives, moving it** — [Storage & engine](storage.md)
- **Running headless / in a browser** — [Headless access](headless-access.md)
- **Model downloads, tuning, GPU memory** — [Models](models.md)
