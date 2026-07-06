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
   runs at all. You can change the pick before applying; a **Plan for card** selector
   re-scores the fit for a different card (8 GB up to 64 GB), so you can plan ahead.
3. It sets the **embedding model** — used for semantic search and grounded chat. You pick it
   from a dropdown of the embedding models that fit your box (the most capable one that fits
   is chosen by default); it runs alongside your chat model.

Quick Setup is **local-only**: it configures the **bundled runner** — the local engine that
downloads and runs models on your machine — and nothing else. If you'd rather run models
through another provider (**Ollama** or **LM Studio** on your machine, or a cloud API),
connect it on the **provider list** (Providers & models → add a provider) and point tasks at
it there — the wizard never touches external providers. (The embedding always runs locally
on the bundled runner.)

When you click **Apply**, that one model becomes the default for **every task** — writing,
chat, extraction, judgment — and it downloads and loads right away. If you've already
changed the model for a particular task yourself (on the **Tasks** tab), Quick Setup leaves
that task alone.

That's the intent: you don't pick a model per job. One good model handles everything, and
each task keeps its own *settings* (temperature, JSON mode, and so on) automatically. If
you later want a faster model for a specific task, swap it in on the **Tasks** tab and use
its **Lab** to measure the difference.

## The model catalog

Open the **Built-in** provider (under **Providers & models**) to see the catalog — one list
of every model, with the ones that **fit your machine grouped at the top** and the rest
below. A **search** box and a **sort** control (by quality, name, or size) help you find
one. Each row shows the model's **type** (*Dense* or *MoE*, plus **MTP** for models with
multi-token prediction and **Embed** for embedding models), license, live **Fit** badge
(*Fits* / *Tight* / *CPU* / *Won't fit*), whether it's **Downloaded** or **Not downloaded**,
and a short description (the parameter count lives in the name and description).
The model every task currently uses carries a **Default** badge; the embedding model carries
an **Embedding** badge. From here you can:

- **Download** a model — fetches the weights onto your machine. Models load automatically
  when a task uses them, so there's no separate "load" step; your chat default and the
  embedding can run together.
- **Set as default** — makes a downloaded model the one **every task** uses (the same effect
  as Quick Setup; any task you've re-pointed yourself on the **Tasks** tab keeps its own model).
- **Set as embedding** — makes a downloaded embedding model the one used for search and
  grounded chat.
- Until you save a tune, a model **launches with the engine's automatic memory fitting**
  (it places the model across GPU/CPU for your card at the app-chosen context size); a
  saved tune replaces that with your measured values.
- **Tune** a downloaded model — measure its decode speed on your box with custom engine
  flags, then **Save tune** to keep the config **for this model on this machine**: every
  later load of that model here uses it automatically (and each machine keeps its own tune,
  so a data folder moved to another computer never applies the wrong numbers). **Remove
  saved tune** returns the model to its defaults. Good defaults come pre-filled — including
  speculative decoding (**MTP**), which turns on automatically for models that support it;
  set it to *Off* and Save if you don't want it. For a per-*Task* setup instead, **Send to
  Tasks Lab** opens the config as a new column in that Task's Lab, where you save it as the
  Task's preset.
- **Add model** — point at any Hugging Face GGUF repo and **Read from link**: the form lists
  the repo's **available quants as a dropdown** (each with its download size and a **QAT** /
  **IQ** label where it applies), pre-picks one that fits your machine (change it, or pick
  *Custom…* to type your own), and fills the model's details from the file — all before
  downloading. If the repo ships a **separate MTP draft model** (some models, like Gemma,
  keep speculative decoding in its own small file), the form detects it and pre-selects the
  smallest draft; the draft downloads alongside the model on its first MTP load. This is how
  you run a model outside the built-in list.
- **Edit** a model's details — its plain-language **description**, its **quality rank**
  (lower = better; the order Quick Setup ranks the fast-enough models by), and the
  **what-this-model-is checkboxes**: **MoE** (mixture-of-experts), **MTP** (multi-token
  prediction — speculative decoding turns on by default when checked or when a draft file
  is set), and **Embedding** (a search/RAG model rather than a chat LLM). They're
  auto-detected from the file; override them if you know better. **Delete** one you added,
  or **Reset catalog** to restore the built-ins (your added models are kept).

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
