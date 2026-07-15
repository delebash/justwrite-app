# Models

Local models live under the **Providers & models** tab (in **Settings → AI**). Two things
run the show: **Quick Setup**, which picks and wires the right model for your machine in
one click, and the **model catalog** on the built-in engine, where you download, add, and
tune models yourself.

## Quick Setup — one good model that fits

A fresh install (and a factory reset — they are the same state) ships the catalog **full**
but every choice **empty**: no chat model, no embedding. The "Your setup" strip shows both
slots as **Not set**, and anything that needs a model before setup answers with "run Quick
Setup" guidance instead of an error. The **Built-in provider** is the permanent section at
the top of the **Providers & models** tab — its whole control panel is always on the page
(no Edit click) — and the **Run Quick Setup** band at its top (marked **For the Local
built-in provider**) does the whole first-time setup:

1. It detects your hardware (GPU, VRAM, RAM).
2. It picks the **most capable model that still runs fast on your box** — not just the
   biggest that fits. A model streams fast enough when it's a **dense** model that fits
   entirely in VRAM, or a **mixture-of-experts (MoE)** model whose experts can offload to
   system RAM (only a fraction runs per word, so the offload stays quick). Among those,
   Quick Setup takes the highest-quality one (the catalog's quality order). It deliberately
   **skips a dense model that only fits by spilling onto the CPU** — that spill makes every
   word slow — unless nothing faster runs, in which case it falls back to the best model that
   runs at all. You can change the pick before applying. If your machine is already set
   up (mixed per-preset models, or saved machine tunes), the confirm step lists **exactly
   which presets Apply will change** — and which of your own choices it keeps — before
   anything is written; your saved machine tunes are never touched.
3. It sets the **embedding model** — used for semantic search and grounded chat. The
   embedding runs on the **CPU**, leaving your graphics card free for the chat model, so the
   default is the **most capable embedding your system memory supports** — a higher-quality
   embedding on a well-equipped machine, and a smaller, faster one on a machine with less
   RAM, so every machine gets a working default. The dropdown still lists every embedding
   that runs on your box — picking a different one is a deliberate choice.

Quick Setup is **local-only**: it configures the **bundled runner** — the local engine that
downloads and runs models on your machine — and nothing else. If you'd rather run models
through another provider (**Ollama** or **LM Studio** on your machine, or a cloud API),
connect it on the **provider list** (Providers & models → add a provider) and point presets at
it there — the wizard never touches external providers. (The embedding always runs locally
on the bundled runner.)

**Set as default, on any provider.** Every provider row — the built-in, a local server, or
a cloud API — carries a **Set as default** button, and it's the same flow everywhere. The
provider your presets currently run on is marked with a green **Default** tag on its row, and
its button reads **Default ✓** (still clickable — that's where the overwrite option lives).
Setting a default makes that provider the one your AI features run on (the provider's chat
model), and — when the provider has an **embedding model** set — the search/embeddings
provider too; the built-in's dialog reads your actual embedding setup, so when a local
embedding is already serving it says so ("already runs here — unchanged") instead of
claiming none is set. Before applying you choose what happens to presets you already
customized: leave them on their own models (the default), or tick **Also overwrite presets I
customized** to repoint everything. The built-in needs an assigned chat model first (pick
one in the catalog, or run Quick Setup); any other provider needs its **Default model**
filled in on its Edit form.

When you click **Apply**, that one model becomes the default for **every preset** — writing,
chat, extraction, judgment — and it downloads and loads right away. If you've already
changed the model on a particular preset yourself (under **Routing by feature**), Quick
Setup leaves that preset alone.

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
each preset keeps its own *settings* (temperature, samplers, reasoning) automatically. If
you later want a faster model for specific work, swap it in on that **Preset** and use
its **Lab** to measure the difference.

## The model catalog

The catalog lives inside the **Built-in provider** section — always on the **Providers &
models** page, nothing to open. A
**"Your setup"** strip at the top shows the two slots the app needs filled — your **General
model** (writes prose, chats, extracts) and your **Embedding model** (powers semantic search
and grounded chat). The app runs these two **side by side**, and each card is that pair's
control panel: a **dropdown that's always there** shows the slot's current model — pick a
different one and it's assigned and the loaded model swaps, no other step — plus the slot's
live state (**● loaded** · **○ loads on first use** · downloading · not downloaded) with its
own **Load now** / **Unload** buttons; loading is always automatic on first use, so Load now
just skips the first wait. Every download progress bar — model downloads and the engine
install alike — shows the live **speed and time remaining** next to the byte counts. The list in each dropdown is the models that fit your machine,
best-ranked first, with the one **we recommend for this PC tagged** — an empty card names
that recommendation in its hint (the embedding recommendation is the same pick Quick Setup
makes). Quick Setup fills both slots automatically.

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
description). The model every preset currently uses carries a **Default** badge; the
embedding model carries an **Embedding** badge. From here you can:

- **Download** a model — fetches the weights onto your machine. Your chat default and the
  embedding can run together, and a model also loads on demand when a feature needs it.
- **Load as default** — makes a downloaded model the one **every preset** uses (the same effect
  as Quick Setup; any preset you've re-pointed yourself under **Routing by feature** keeps
  its own model) **and loads it into memory right away**, so your first write doesn't pay
  the load wait.
- **Unload** — appears on a loaded model; frees its memory (VRAM) without picking anything
  else. The model loads again on **Load as default** or the next time a feature needs it.
- On an **embedding** row, **Load as default** works the same way — it makes that model the
  one used for search and grounded chat **and loads it right away, alongside your chat
  model** (the two run together); a loaded embedding gets the same **Unload**. You don't
  have to pre-load it, though: the embedding model **loads itself on first use** — the next
  search or Ask-the-book question downloads (if needed) and loads it, with a "Preparing the
  embedding model" entry in the AI task panel while it happens. Switching to a different
  embedding model works the same way: the next search loads the new one.
- Every model from Hugging Face carries a **Model card ↗** link (on its row and in its Edit
  dialog) that opens the full details — files, license, the maker's notes — in your browser.
- **Engine switches belong to the model, not to presets** — that's the one rule of the
  whole tuning system. A loaded model is one engine process with one set of launch
  switches, shared by **every preset that uses it**; what a *preset* owns is how the model is
  **asked** (temperature, max tokens, thinking, samplers — in the preset, edited in
  the Routing-by-feature Lab, no
  reload needed). So there is exactly **one place to set engine switches: the model's
  Tune & measure dialog** — opened from the model's row in the catalog, or from a Lab
  column's **Engine switches ↗** link (same dialog, same config).
- Until you apply a config, a model **launches with the engine's automatic memory fitting**
  (it places the model across GPU/CPU for your card at the app-chosen context size); an
  applied config replaces that with your measured values.
- **Tune** a downloaded model — measure its decode speed on your box with custom engine
  flags, then **Apply**. A confirmation first tells you exactly which presets the change
  reaches (they all share the model), then the config is kept **for this model on this
  machine** and — if the model is running right now — it **reloads immediately**, so what
  you applied is always what's actually running; a **toast confirms the moment it's done**.
  Every later load uses it automatically (and each machine keeps its own config, so a data
  folder moved to another computer never applies the wrong numbers). **Applying is a
  deliberate snapshot: the model takes ownership of everything you see.** From that moment
  it stops following later changes to the global or hardware/model class defaults — what you
  measured is what keeps running (both defaults libraries say so right in their help text).
  If the defaults DO change under an applied config, the dialog tells you the next time you
  open it — *"Defaults have changed since you applied this config — N values differ"* —
  with a **Refresh from defaults** button that loads today's defaults into the grid for you
  to review, measure, and Apply; nothing changes until you do. The dialog's badge tells you
  **how** the model got its config: **Auto-tuned on this PC ✓** (the sweep's winner, applied
  unedited), **Hand-tuned on this PC ✓**, or **Untuned — using the layered defaults** (the
  badge never claims the config comes from one single layer — the rows themselves show which
  layer set each value). A model with no config of its own but a saved class config shows a
  **Hardware/model class default** badge on its **row in the catalog** (tuned rows show their
  Auto-/Hand-tuned badge there; untuned rows just carry none).
  **Remove applied
  config** sits right beside Apply in the dialog's footer — it returns the model to its
  live defaults, also reloading a running model. In the dialog, only the **switch grid scrolls**
  (in its own capped area) — the load/measure progress and the **tok/s result stay in view
  below it**, no scrolling to find them. **Auto-tune** asks before it starts: the measured
  sweep can take **4 to 30 minutes depending on your hardware** (it usually gives the best
  results for a model that hasn't been tuned yet, and you can cancel after any trial).
  **The grid shows only the switches that are actually set** — the same simple editor as
  the two defaults libraries: each row is a switch name and a plain value box, with an
  **✕ to remove the row**. A removed switch simply isn't sent — the engine handles it its
  own way, exactly like leaving a flag off the command line — and **＋ Add switch** puts
  one in (any engine flag can be typed, even one the catalog doesn't list). Rows sit
  **grouped under a heading per source** — *Your applied config* · *Hardware/model class
  default* · *Global launch defaults* · *Computed for this PC* — so "what set this
  switch?" is answered by the section it sits in (values the engine works out for your
  machine, like GPU layers, are ordinary rows under *Computed for this PC*, and Apply
  keeps them with the rest). Values are plain text or numbers — **hover a row for what
  the switch does and which values it accepts** (the KV cache types, for example, accept
  f32, f16, bf16, q8_0, q4_0, q4_1, iq4_nl, q5_0, q5_1). Speculative decoding (**MTP**)
  turns on automatically for models that support it; set *spec_type* to none (or remove
  its rows) and Apply if you don't want it. After a measurement, **Save for
  hardware class** keeps the config as the shared starting point for **every PC with the
  same video memory and RAM** (a machine with its own applied config still wins), and the
  **"Hardware/model class defaults ↗"** link in the same dialog opens **this model's class
  config straight in its editor** — your PC's class row when one exists, otherwise a new
  config prefilled with your class — no list to click through; a
  **"Global launch defaults ↗"** link beside it opens the always-on switch bundles the
  same way, so nothing is edited embedded in the Tune dialog itself. The full **library**
  lives on the Built-in provider section — the **"Hardware/model class defaults…"** button
  there opens every saved config in one table where **each row is one model × one PC
  class** (there is no single tune covering all models; adding a config there starts with
  picking the model), with **Copy**/**Import** to share a config between users as a small
  piece of text; while you edit or import there, the editor takes the screen by itself and
  Cancel brings the table back. Every measured speed is also **saved for
  good**: the
  **Measurement history** drawer in the same dialog lists each **Load & measure** run and
  each auto-tune trial — when, with which settings, and how fast — and survives closing the
  dialog and restarting the app; **Clear history** empties it (applied configs and class
  configs are never touched by a clear).
- **Add model** — point at any Hugging Face GGUF repo and click **Load model info from HF**
  (right under the repo field, above the quant picker): the form lists the repo's
  **available quants as a dropdown** (each with its download size and a **QAT** /
  **IQ** label where it applies), pre-picks one that fits your machine (change it, or pick
  *Custom…* to type your own), and fills the model's details from the file — all before
  downloading. If the repo ships a **separate MTP draft model** (some models, like Gemma,
  keep speculative decoding in its own small file), the form detects it and pre-selects the
  smallest draft; the draft downloads alongside the model on its first MTP load. This is how
  you run a model outside the built-in list.
- **Edit** a model's details. The **description** belongs to the file: **Load model info
  from HF** regenerates it from what the model actually is (parameters, context, MTP, quant,
  size) — and your own **Notes** field sits beside it for anything personal (measured
  speeds, taste, use policy); notes are never touched by reads, downloads, or resets, and
  show in italics under the description on the model's row. The **auto-detected facts**
  (architecture, expert count, file size, download size, trained context, recommended
  samplers) are **saved on the model**, so the form shows them the moment it opens — Load
  model info from HF just re-verifies them against the live repo (the download size belongs
  to the selected quant and clears if you pick a different one). The **benchmark rank**
  (lower = better) and the **what-this-model-is checkboxes** — **MoE**, **MTP** (a selected
  draft file keeps MTP checked; speculative decoding auto-enables), **Embedding** — round
  out the form. **Delete** one you added, or **Reset catalog** to restore the built-ins
  (your added models are kept). Each row also shows its **rank and size** right under the
  id, so the sort orders are visible.

A model's weights download from Hugging Face onto your machine; the catalog only lists
them. The built-in list is a **small curated ladder, Gemma-first for writing** — Gemma 4
dense rungs for small and large cards, the Gemma 4 26B-A4B MoE as the tested default, one
Qwen MoE alternative, plus a few embedding models — every repo, quant, license, **and file
size** verified against Hugging Face, so each built-in row shows its real **file size and
download size from the start** (no download or info-load needed first). Two rows are **deliberate choices, never auto-picked**: a community
prose style-tune (Gryphe) and an **uncensored** build for fiction whose dark, gory, or adult
scenes hit stock refusals — you pick those yourself. It's a starting point, not a limit:
**Add model** lets you run anything. Some models carry a **use-limited** license (⚠) — free
to try, but not for unrestricted commercial use, and never chosen as a default.

Each model is explicitly marked as a **chat model** or an **embedding model**, so the app
always knows which is which (it never guesses from the name). **Embedding models** also show their **pooling** (mean · cls · last) in the edit form,
read-only. Pooling is how a model combines its per-word vectors into the single vector
used for search; each embedding model is trained for one specific kind, so it is set per
model and can't be changed here — the wrong pooling would quietly make search worse.

Embedding rows in the edit form also carry two **task templates** — *Document template*
and *Query template* — because some embedding models are trained to see a task prefix and
search noticeably better with it (nomic wants `search_document:` / `search_query:` on the
two sides; the Qwen3 embeddings want an instruction line on the query side; BGE-M3 wants
nothing). The catalog seeds each model's published wording with a `{text}` placeholder,
and every index build wraps your scenes with the document side while every search/chat
question gets the query side — automatically, per model. Both fields are editable; leave
one empty and that side embeds raw. If you edit a template after building an index, hit
**Rebuild** in Ask the book once so the stored vectors match the new wording.

> Installing the local engine itself (the llama.cpp runtime) is separate — that lives on
> the same **Built-in** provider, above the catalog, as one compact row: **Install engine**
> when it's absent (the Local engine panel shows its own Install button then too), **Update**
> and **Uninstall** once installed (uninstalling deletes only the engine binaries — your
> downloaded models are kept; the Local engine panel carries the same Uninstall button
> right beside its "Installed · build · gpu" line), and **Details** expands the rest (the
> spawn log, the loaded-models list with its VRAM budget, the two keep-loaded knobs, the
> **download settings**, and the engine-binaries editor). Downloads are **segmented** by
> default: one file is fetched as several parallel connections, so one slow server path
> can't cap the whole download — the settings let you turn it off, change how many
> connections run, the size floor below which files stay single-stream, and the retries
> per connection. An in-flight install's progress bar and any error stay visible
> even with Details collapsed. The installed check reads your **disk**, not a stored
> setting: if the engine folder holds the engine, the app reports it installed and shows
> that folder's version — so resetting the app's data can never make an engine that is
> already on disk read "Not installed". **Test connection** on the Built-in provider reports its real
> health — engine installed, build, how many models the catalog holds — rather than probing
> a server that hasn't loaded anything yet (models load on first use by design).
>
> Under the catalog, two buttons open the other editable libraries as dialogs:
> **Hardware/model class defaults…** (the shared per-PC-class launch configs) and **Global launch
> defaults…** — the always-on switch bundles (all models · MoE · dense · speculative decode)
> that sit underneath every tune, visible and editable with a Reset. Both libraries carry
> the same standing note: **models with an applied config keep their saved values** — a
> change in a library reaches them only when you refresh or remove their applied config in
> Tune & measure (a model without one always follows the libraries live).

> For a **cloud or external provider** (OpenAI, Ollama, LM Studio, …) there are no
> hardcoded model suggestions anywhere: connect it, hit **Fetch**, and pick the chat +
> embedding models from the provider's own live list. The built-in local provider doesn't
> show those two fields at all — its models are chosen right here on the catalog.

> **Recommended samplers come from the model file.** When you pick a model in a Preset's
> **Lab**, its maker-recommended sampler settings (read from the GGUF) seed the sampler
> grid automatically — the preset keeps its own temperature, and the model fills the
> secondary knobs (top-k / min-p / top-p / penalties) it leaves blank. What you see in the
> grid is what runs.

> **Filling the Lab's Test input.** The **Sample** button fills the boxes with editable
> sample data stored in the app's database (click again for the next sample), and the
> **"Insert from chapter / character / location…"** pickers pull real material from your
> open book. Every feature has at least one sample, and the pickers cover every feature's boxes:
> the chat features take a chapter's prose as their excerpts, and In-character chat fills its
> character name + profile from a real character. All the fill controls sit together on
> one row above the boxes. A picker only appears when that material can actually fill one
> of the open feature's boxes — a prose feature offers chapters, not character profiles.

> **Watching a Lab run.** Running a test shows the same AI progress strip used everywhere
> else in the app — elapsed time, first-token latency, tokens/sec, and a Cancel button —
> and the run also appears in the title-bar AI status panel. On the built-in provider the
> wait before the first token is a real percentage too: the strip reads **"reading prompt
> N%"** while the engine works through your prompt (cloud providers don't report this, so
> there the strip shows elapsed time until the first token lands). Stopping **Optimize for this
> PC** takes effect immediately: the sweep stops scheduling trials the moment you click
> Skip, even while the engine is still winding a trial down.

> **Where a feature's model shows up in the app.** Writing surfaces (Ask the book, the
> scene editor's AI menu, the analysis tools) carry a small read-only **"runs on"** chip
> naming the provider + model that feature's preset uses right now — resolved by the server
> exactly the way a run resolves it, so the chip can never disagree with reality. On most
> surfaces the chip is provenance: clicking it takes you to AI settings, where
> **Routing by feature** is the only place routing is edited. The two chat chips
> (Ask the book / Talk to character) go one further — clicking them opens an **edit doorway**
> naming the preset and how many features share it. (The old per-surface
> provider/model dropdowns are gone; they edited a side channel that the preset
> overrode anyway.)
