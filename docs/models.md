# Models

Local models live under the **Providers & models** tab (in **Settings → AI**). Two things
run the show: **Quick Setup**, which picks and wires the right model for your machine in
one click, and the **model catalog** on the built-in engine, where you download, add, and
tune models yourself.

## Quick Setup — one good model that fits

A fresh install (and a factory reset — they are the same state) ships the catalog **full**
but every choice **empty**: no task model, no embedding. The "Your setup" strip shows both
slots as **Not set**, and anything that needs a model before setup answers with "run Quick
Setup" guidance instead of an error. On the **Built-in server** card, **Run Quick Setup**
does the whole first-time setup:

1. It detects your hardware (GPU, VRAM, RAM).
2. It picks the **most capable model that still runs fast on your box** — not just the
   biggest that fits. A model streams fast enough when it's a **dense** model that fits
   entirely in VRAM, or a **mixture-of-experts (MoE)** model whose experts can offload to
   system RAM (only a fraction runs per word, so the offload stays quick). Among those,
   Quick Setup takes the highest-quality one (the catalog's quality order). It deliberately
   **skips a dense model that only fits by spilling onto the CPU** — that spill makes every
   word slow — unless nothing faster runs, in which case it falls back to the best model that
   runs at all. You can change the pick before applying. If your machine is already set
   up (mixed per-task models, or saved machine tunes), the confirm step lists **exactly
   which tasks Apply will change** — and which of your own choices it keeps — before
   anything is written; your saved machine tunes are never touched.
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

After Apply, the done step tells you which launch settings this machine got — **no sweep
ever starts on its own**. A machine with its **own saved tune** keeps it (a **Re-optimize**
button asks before overwriting). A machine matching a **built-in hardware class** — the
same video memory and RAM as a machine the config was measured on — starts pre-tuned with
no sweep. A machine with neither runs on the engine's automatic memory fitting and gets two
optional measured passes: **Quick optimize (~2 min)**, which tries the most likely settings
within a time box and keeps the best it finds (and says so honestly when it finds nothing
faster — the full sweep or the model's Tune dialog go deeper), and **Full optimize**
(10 minutes or more), which keeps measuring. Either pass saves its result only if it
strictly beats the current launch, and other AI features pause while one runs.

That's the intent: you don't pick a model per job. One good model handles everything, and
each task keeps its own *settings* (temperature, JSON mode, and so on) automatically. If
you later want a faster model for a specific task, swap it in on the **Tasks** tab and use
its **Lab** to measure the difference.

## The model catalog

Open the **Built-in** provider (under **Providers & models**) to see the catalog. A
**"Your setup"** strip at the top shows the two slots the app needs filled — your **General
model** (writes prose, chats, extracts) and your **Embedding model** (powers semantic search
and grounded chat). The app runs these two **side by side**, and each card is that pair's
control panel: it shows the slot's live state (**● loaded** · **○ loads on first use** ·
downloading · not downloaded) with its own **Load now** / **Unload** buttons — loading is
always automatic on first use, so Load now just skips the first wait. Quick Setup fills both
slots automatically; setting them by hand, each card tells you which section below to pick
from, and an unfilled slot shows **Not set**.

The list itself is split into **Chat & writing models** and **Embedding models** — each
section shows the models that **fit your machine**, and everything that doesn't fit sinks
to one group at the very bottom, below the embeddings. A
**search** box and a **sort** control (by **benchmark score**, name, or size) help you find
one — the benchmark order comes from published *general-purpose* tests, so it is not
writing-specific and doesn't know your hardware; the honest per-machine answer is the
**Recommended for this PC** badge, which marks the exact model Quick Setup would pick for
this box. Each row shows the model's **type** (*Dense* or *MoE*, plus **MTP** for models
with multi-token prediction and **Embed** for embedding models), license, live **Fit**
badge (*Fits* / *Tight* / *CPU* / *Won't fit*), whether it's **Downloaded** or **Not
downloaded**, and a short description (the parameter count lives in the name and
description). The model every task currently uses carries a **Default** badge; the
embedding model carries an **Embedding** badge. From here you can:

- **Download** a model — fetches the weights onto your machine. Your chat default and the
  embedding can run together, and a model also loads on demand when a task needs it.
- **Load as default** — makes a downloaded model the one **every task** uses (the same effect
  as Quick Setup; any task you've re-pointed yourself on the **Tasks** tab keeps its own
  model) **and loads it into memory right away**, so your first write doesn't pay the load
  wait.
- **Unload** — appears on a loaded model; frees its memory (VRAM) without picking anything
  else. The model loads again on **Load as default** or the next time a task needs it.
- On an **embedding** row, **Load as default** works the same way — it makes that model the
  one used for search and grounded chat **and loads it right away, alongside your chat
  model** (the two run together); a loaded embedding gets the same **Unload**.
- Every model from Hugging Face carries a **Model card ↗** link (on its row and in its Edit
  dialog) that opens the full details — files, license, the maker's notes — in your browser.
- Until you save a tune, a model **launches with the engine's automatic memory fitting**
  (it places the model across GPU/CPU for your card at the app-chosen context size); a
  saved tune replaces that with your measured values.
- **Tune** a downloaded model — measure its decode speed on your box with custom engine
  flags, then **Save tune** to keep the config **for this model on this machine**: every
  later load of that model here uses it automatically (and each machine keeps its own tune,
  so a data folder moved to another computer never applies the wrong numbers). **Remove
  saved tune** returns the model to its defaults. Good defaults come pre-filled — including
  speculative decoding (**MTP**), which turns on automatically for models that support it;
  set it to *Off* and Save if you don't want it. Values the engine works out for your
  machine on its own (GPU layers, context size, expert offload) show under the grid as
  **"Set automatically for this PC"** with an **Add to grid** action — so you always see
  what the launch will really use, and adding them makes them yours to edit (a saved
  explicit value then replaces the automatic one for good). After a measurement, **Save for
  hardware class** keeps the config as the shared starting point for **every PC with the
  same video memory and RAM** (a machine with its own saved tune still wins), and the
  **Hardware-class defaults** drawer in the same dialog is the editable library of those
  class configs: edit one (editing a built-in makes it yours and it sticks), add one for a
  different class, delete one you added, or **Copy**/**Import** a config as a small piece of
  text to share between users. The same library also has an **all-models view** — a
  collapsed **"Hardware-class defaults — all models"** drawer at the bottom of the Built-in
  server's Edit page listing every model's class configs in one table (adding a config there
  starts with picking the model). For a per-*Task* setup instead, **Send to Tasks Lab**
  opens the config as a new column in that Task's Lab, where you save it as the Task's
  preset.
- **Add model** — point at any Hugging Face GGUF repo and **Read from link**: the form lists
  the repo's **available quants as a dropdown** (each with its download size and a **QAT** /
  **IQ** label where it applies), pre-picks one that fits your machine (change it, or pick
  *Custom…* to type your own), and fills the model's details from the file — all before
  downloading. If the repo ships a **separate MTP draft model** (some models, like Gemma,
  keep speculative decoding in its own small file), the form detects it and pre-selects the
  smallest draft; the draft downloads alongside the model on its first MTP load. This is how
  you run a model outside the built-in list.
- **Edit** a model's details. The **description** belongs to the file: **Read from link**
  regenerates it from what the model actually is (parameters, context, MTP, quant, size) —
  and your own **Notes** field sits beside it for anything personal (measured speeds, taste,
  use policy); notes are never touched by reads, downloads, or resets, and show in italics
  under the description on the model's row. The **auto-detected facts** (architecture,
  expert count, file size, download size, trained context, recommended samplers) are
  **saved on the model**, so the form shows them the moment it opens — Read from link just
  re-verifies them against the live repo (the download size belongs to the selected quant
  and clears if you pick a different one). The **benchmark rank** (lower = better) and the
  **what-this-model-is checkboxes** — **MoE**, **MTP** (a selected draft file keeps MTP
  checked; speculative decoding auto-enables), **Embedding** — round out the form.
  **Delete** one you added, or **Reset catalog** to restore the built-ins (your added
  models are kept). Each row also shows its **rank and size** right under the id, so the
  sort orders are visible, and an empty **Your setup** card offers a **dropdown of the
  models that fit** — pick one there and it's assigned and loaded without scrolling.

A model's weights download from Hugging Face onto your machine; the catalog only lists
them. The built-in list is a **small curated ladder, Gemma-first for writing** — Gemma 4
dense rungs for small and large cards, the Gemma 4 26B-A4B MoE as the tested default, one
Qwen MoE alternative, plus a few embedding models — every repo, quant, and license verified
against Hugging Face. Two rows are **deliberate choices, never auto-picked**: a community
prose style-tune (Gryphe) and an **uncensored** build for fiction whose dark, gory, or adult
scenes hit stock refusals — you pick those yourself. It's a starting point, not a limit:
**Add model** lets you run anything. Some models carry a **use-limited** license (⚠) — free
to try, but not for unrestricted commercial use, and never chosen as a default.

Each model is explicitly marked as a **chat model** or an **embedding model**, so the app
always knows which is which (it never guesses from the name). **Embedding models** also show their **pooling** (mean · cls · last) in the edit form,
read-only. Pooling is how a model combines its per-word vectors into the single vector
used for search; each embedding model is trained for one specific kind, so it is set per
model and can't be changed here — the wrong pooling would quietly make search worse.

> Installing the local engine itself (the llama.cpp runtime) is separate — that lives on
> the same **Built-in** provider, above the catalog, as one compact row: **Install engine**
> when it's absent (the Local engine panel shows its own Install button then too), **Update**
> and **Uninstall** once installed (uninstalling deletes only the engine binaries — your
> downloaded models are kept), and **Details** expands the rest (the spawn log, the
> loaded-models list with its VRAM budget, the two keep-loaded knobs, and the
> engine-binaries editor). An in-flight install's progress bar and any error stay visible
> even with Details collapsed. **Test connection** on the Built-in server reports its real
> health — engine installed, build, how many models the catalog holds — rather than probing
> a server that hasn't loaded anything yet (models load on first use by design).
>
> Below the catalog sit two more editable libraries: **Hardware-class defaults** (the
> shared per-PC-class launch configs) and **Global launch defaults** — the always-on
> switch bundles (all models · MoE · dense · speculative decode) that sit underneath every
> tune, finally visible and editable with a Reset. In a model's **Tune** dialog, every
> pre-filled value now carries a small tag saying **where it came from** (all models · model
> type · speculative decode · your PC class · saved tune), the engine-computed values show
> separately, and a closing line reminds you that anything not listed uses the engine's own
> defaults — so "what set this switch?" always has an answer.

> For a **cloud or external provider** (OpenAI, Ollama, LM Studio, …) there are no
> hardcoded model suggestions anywhere: connect it, hit **Fetch**, and pick the chat +
> embedding models from the provider's own live list. The built-in local provider doesn't
> show those two fields at all — its models are chosen right here on the catalog.

> **Recommended samplers come from the model file.** When you pick a model in a Task's
> **Lab**, its maker-recommended sampler settings (read from the GGUF) seed the sampler
> grid automatically — the Task keeps its own temperature, and the model fills the
> secondary knobs (top-k / min-p / top-p / penalties) it leaves blank. What you see in the
> grid is what runs.
