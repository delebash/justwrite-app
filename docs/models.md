# Models

Local models live under the **Providers & models** tab (in **Settings → AI**). Two things
run the show: **Quick Setup**, which picks and wires the right model for your machine in
one click, and the **model catalog** on the built-in engine, where you download, add, and
tune models yourself.

## Quick Setup — one good model that fits

At the top of **Providers & models**, **Run Quick Setup** does the whole first-time setup:

1. It detects your hardware (GPU, VRAM, RAM).
2. It picks the **most capable model that still runs fast on your box** — not just the
   biggest that fits. A model streams fast enough when it's a **dense** model that fits
   entirely in VRAM, or a **mixture-of-experts (MoE)** model whose experts can offload to
   system RAM (only a fraction runs per word, so the offload stays quick). Among those,
   Quick Setup takes the highest-quality one (the catalog's quality order). It deliberately
   **skips a dense model that only fits by spilling onto the CPU** — that spill makes every
   word slow — unless nothing faster runs, in which case it falls back to the best model that
   runs at all. You can change the pick before applying; a **Plan for card** selector also
   re-scores the fit for a different graphics card, so you can plan ahead.
3. It sets the **embedding model** (used for search and grounded chat — a small model that
   always runs on the CPU).

When you click **Apply**, that one model becomes the default for **every task** — writing,
chat, extraction, judgment — and it downloads and loads right away. If you've already
changed the model for a particular task yourself (on the **Tasks** tab), Quick Setup leaves
that task alone, so re-running it is safe.

That's the intent: you don't pick a model per job. One good model handles everything, and
each task keeps its own *settings* (temperature, JSON mode, and so on) automatically. If
you later want a faster model for a specific task, swap it in on the **Tasks** tab and use
its **Lab** to measure the difference.

## The model catalog

Open the **Built-in** provider (under **Providers & models**) to see the catalog — one list
of every model, with the ones that **fit your machine grouped at the top** and the rest
below. A **search** box and a **sort** control (by quality, name, or size) help you find
one. Each row shows the model's size, license, live **Fit** badge (*Fits* / *Tight* / *CPU*
/ *Won't fit*), whether it's **Downloaded** or **Not downloaded**, and a short description.
The model every task currently uses carries a **Default** badge; the embedding model carries
an **Embedding** badge. From here you can:

- **Download** a model — fetches the weights onto your machine. Models load automatically
  when a task uses them, so there's no separate "load" step; your chat default and the
  embedding can run together.
- **Set as default** — makes a downloaded model the one **every task** uses (the same effect
  as Quick Setup; any task you've re-pointed yourself on the **Tasks** tab keeps its own model).
- **Set as embedding** — makes a downloaded embedding model the one used for search and
  grounded chat.
- **Tune** a downloaded model — measure its decode speed on your box with custom engine
  flags. To *keep* a tuned config, use **Send to Tasks Lab** in the Tune window: it opens as
  a new column in that Task's Lab, where you save it as the Task's preset.
- **Add model** — point at any Hugging Face GGUF repo and **Read from link** to fill in its
  details from the file before downloading. This is how you run a model outside the built-in
  list.
- **Edit** a model's details — including its plain-language **description**, its **quality
  rank** (lower = better; the order Quick Setup ranks the fast-enough models by), and an
  **Embedding model** checkbox (mark it if the model is an embedding/RAG model rather than a
  chat LLM). **Delete** one you added, or **Reset catalog** to restore the built-ins (your
  added models are kept).

A model's weights download from Hugging Face onto your machine; the catalog only lists
them. The built-in list is a **small curated ladder** — a few chat models per hardware
tier (dense models that run fully on the GPU → MoE models that offload experts to system
RAM) plus a few embedding models — every repo, quant, and license verified against Hugging
Face. It's a starting point, not a limit: **Add model** lets you run anything. Some models
carry a **use-limited** license (⚠) — free to try, but not for unrestricted commercial
use, and never chosen as a default.

Each model is explicitly marked as a **chat model** or an **embedding model**, so the app
always knows which is which (it never guesses from the name). **Embedding models** also show their **pooling** (mean · cls · last) in the edit form,
read-only. Pooling is how a model combines its per-word vectors into the single vector
used for search; each embedding model is trained for one specific kind, so it is set per
model and can't be changed here — the wrong pooling would quietly make search worse.

> Installing the local engine itself (the llama.cpp runtime) is separate — that lives on
> the same **Built-in** provider, above the catalog.

> **Recommended samplers come from the model file.** When you pick a model in a Task's
> **Lab**, its maker-recommended sampler settings (read from the GGUF) seed the sampler
> grid automatically — the Task keeps its own temperature, and the model fills the
> secondary knobs (top-k / min-p / top-p / penalties) it leaves blank. What you see in the
> grid is what runs.
