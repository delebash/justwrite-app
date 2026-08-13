# Models

Local models live under the **Providers & models** tab (in **Settings → AI**). Two things
run the show: **Quick Setup**, which picks and wires the right model for your machine in
one click, and the **model catalog** on the built-in engine, where you download, add, and
tune models yourself.

## Quick Setup — one good model that fits

> *"I want to run AI locally, but every guide tells me to pick a model, figure out the right quantization, install it, then configure four different things in Settings. Just tell me what to do."*

A fresh install (and a factory reset — they are the same state) ships the catalog **full**
but every choice **empty**: no chat model, no embedding. The "Your setup" strip shows both
slots as **Not set**, and anything that needs a model before setup answers with "run Quick
Setup" guidance instead of an error. The **Run Quick Setup** band sits at the top of the
**Local** tab on the **Providers & models** page (marked **Sets up the built-in llama.cpp
provider only**) and does the whole first-time setup — the **Built-in provider** itself is
the first row in that Local list, and its control panel opens when you click **Edit** on it:

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
4. It **downloads everything at the same time** — the general model and the search
   (embedding) model run in **parallel, each with its own progress bar** showing the size,
   speed and time remaining, in plain language ("Downloading the model", "Loading it into
   your graphics card"). Each bar has its own **Cancel** and **Retry**: cancelling one keeps
   whatever it has already downloaded (Retry picks up where it stopped) and leaves the other
   download running. A model is several gigabytes, so a first run takes a few minutes; a
   model already on disk is skipped (if your general model is already downloaded it still
   loads its weights, while the search model downloads beside it). Apply finishes with
   **both models present**, so your first sentence and your first "Ask the book" question
   don't pay a silent download wait.

   **First run, engine not installed?** If the local engine (the program that actually runs
   models) isn't installed yet, Quick Setup installs it too — as a **third progress bar** at
   the top ("The engine"), with the **same Cancel and Retry** as the model bars. The engine
   and the search model download in parallel right away; your general model waits its turn
   ("Waiting for the engine…") and starts the moment the engine is ready. It's the same shared
   download control everywhere — Quick Setup, the model catalog, and the Local engine panel all
   use one bar, so downloading anything (engine, model, or embedding) always cancels and retries
   the same way. If you cancel the engine, the model bar says so and continues once you retry the
   engine.

Quick Setup is **local-only**: it configures the **bundled runner** — the local engine that
downloads and runs models on your machine — and nothing else. If you'd rather run models
through another provider (**Ollama** or **LM Studio** on your machine, or a cloud API),
set it up on the **provider list** and point presets at it there — the wizard never touches
external providers. Ollama and LM Studio are **already listed** under **Local**, pointing at
their default ports (`localhost:11434` and `localhost:1234`); start the app you want and hit
**Test** on its row. Anything else is **add a provider**. (The embedding always runs locally
on the bundled runner.)

> **Provider types (the cloud APIs).** Each cloud provider now talks to its vendor
> through that vendor's own official library, so unknown-field errors from mixing
> sampler settings across providers are gone. The pickable types are **OpenAI**,
> **Anthropic (Claude)**, **Gemini (Google)**, **DeepSeek**, **OpenRouter**, **xAI (Grok)**,
> **Mistral**, **Ollama (native)**, and the generic **OpenAI-compatible** (LM Studio, a
> self-hosted server, any OpenAI-shaped gateway). Add xAI or Mistral from the preset chips
> on the add-a-provider form, paste a key, hit **Fetch**.
>
> **The API key field.** On a saved provider the key sits **masked in the field** with an
> **eye** to reveal it — edit it in place, and **Fetch** / **Test connection** now use it
> automatically (they no longer need you to retype it). Clearing the field and saving
> **removes** the stored key; leaving a revealed key untouched keeps it.
>
> **The model dropdowns fill themselves.** When you reopen a saved provider that has a key
> (or a local server), its chat/embedding lists load automatically — no need to press
> **Fetch** first. The list refreshes each time you open, so it keeps up as a provider adds
> or retires models; **Fetch** / **Refresh** re-pulls it on demand (use it after you change
> the key or URL), and you can always just type a model id the list doesn't show.
>
> **Gemini models.** New Google keys can't use the 2.5-generation models at all
> (Google returns "no longer available to new users"), so the default is the current
> **3.x flash-lite** tier and **Fetch** lists the bare 3.x ids (no `models/` prefix, and the
> veo/imagen/audio-only models are filtered out). **Thinking** runs at the model's own
> default until you turn it on for a preset; DeepSeek, xAI, and Mistral always run their
> model's own thinking default (their **Reasoning levels** editor says so — there's nothing
> to set per level).
>
> **If you already had Claude, Gemini, or Ollama connected** (from before this change),
> their rows were seeded under the old generic type. To move them onto the native library:
> **delete the provider → restart the app → the row reappears typed correctly → paste the
> key again.** Nothing else migrates automatically, and no data is lost — it's a re-add.

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

Once a provider is your default, changing its **Default model** (or embedding model) on the
Edit form and saving re-points your features onto the new model right away — you don't need
to press **Set as default** again. A provider that isn't your default keeps a changed model
as its own stored setting until you make it the default.

When you click **Apply**, that one model becomes the default for **every preset** — writing,
chat, extraction, judgment — and it downloads and loads right away. If you've already
changed the model on a particular preset yourself (under **Routing by feature**), Quick
Setup leaves that preset alone.

After Apply, the done step tells you which launch settings this machine got — **no sweep
ever starts on its own**. A machine with its **own saved tune** keeps it (a **Re-optimize**
button asks before overwriting). A machine matching a **built-in PC class** — a memory
*range* that includes a machine the config was measured on — starts pre-tuned with
no sweep. A machine with neither runs on the engine's automatic memory fitting and gets two
optional measured passes: **Quick optimize (~2 min)**, which tries the most likely settings
within a time box and keeps the best it finds (and says so honestly when it finds nothing
faster — the full sweep or the model's Tune dialog go deeper), and **Full optimize**
(10 minutes or more), which keeps measuring. Either pass saves its result only if it
strictly beats the current launch, and other AI features pause while one runs.

That's the intent: you don't pick a model per job. One good model handles everything, and
each preset keeps its own *settings* (temperature, samplers, thinking on/off) automatically.
If you later want a faster model for specific work, swap it in on that **Preset** and use
its **Lab** to measure the difference.

## The model catalog

The catalog lives inside the **Built-in provider** — the first row on the **Local** tab of
the **Providers & models** page; click **Edit** on that row to open it. A
**"Your setup"** strip at the top shows the two slots the app needs filled — your **General
model** (writes prose, chats, extracts) and your **Embedding model** (powers semantic search
and grounded chat). The app runs these two **side by side**, and each card is that pair's
control panel: a **dropdown that's always there** shows the slot's current model — pick a
different one and it's assigned and the loaded model swaps, no other step — plus the slot's
live state (**● loaded** · **○ loads on first use** · downloading · not downloaded) with its
own **Load now** / **Unload** buttons; loading is always automatic on first use, so Load now
just skips the first wait. Every download progress bar — model downloads and the engine
install alike — shows the live **speed and time remaining** next to the byte counts. Each
dropdown lists **every model of its kind**, best-ranked first, with the one **we recommend
for this PC tagged** — nothing is hidden for not fitting. Instead of hiding, each chat
option carries its **fit and expected speed right on the label** (*Fits · ~fast*, *Won't
fit*), and picking a model the estimate rejects shows an honest warning under the dropdown:
you can still load it — the engine tries, and backs off if the load fails. The estimate
informs your choice; it never blocks it. An empty card names the recommendation in its
hint (the embedding recommendation is the same pick Quick Setup makes). Quick Setup fills
both slots automatically.

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
description). The Fit badge also answers the *second* question — **how fast would it
run here** — with a **speed band** right on the chip: *Fits · ~fast*, *Fits · ~fine*,
*Tight · ~slow*, down to *~very slow*. The bands are computed from the model file's own
physics (how many bytes each generated word actually touches) against your machine's
memory speed, deliberately erring on the slow side; **~fine** means comfortable reading
speed. The **~** marks an estimate — once you've actually run the model on this PC, the
row shows the **real measured tokens/second** instead and the ~ disappears (a measurement
always outranks an estimate; the numbers come from Tune & measure and Optimize runs).
A model whose file or your machine's speed the app doesn't know yet simply shows the
plain fit chip — it never guesses. The chip's hover spells it out: the estimated or
measured speed, and on an MTP model, that speculative decoding may make it faster than
the estimate. Where the band thresholds live — and how to adjust them — is in the engine
settings note below. Under the name, beside the download size, each chat row **states the hardware
it needs** — *"5.6 GB · needs ~11 GB VRAM + 14 GB RAM"* — so the list answers "what would
this run on?" without hovering anything. Those are the model's minimum figures, printed as
real numbers rather than a class name (a class rounds *down*, which would understate a
requirement). The **Fit** badge's hover says **"Estimated"** in as many words, because a fit
grade is those figures measured against your card, never a run on your box — and on a model
nobody has tuned for your class it adds *"not yet tested on your PC class"*. Embedding rows
are excluded from the needs line: their hover tells the placement story instead (policy runs
them on the CPU). The model every preset currently uses carries a **Default** badge; the
embedding model carries an **Embedding** badge. From here you can:

- **Download** a model — fetches the weights onto your machine. Your chat default and the
  embedding can run together, and a model also loads on demand when a feature needs it.
  For an MTP-enabled model (speculative decoding), there are two shapes. Most carry a
  **separate draft file** (e.g. Gemma's `MTP/mtp-…gguf`) — Download fetches it too, so
  **Downloaded** includes it and the first load never surprises you with an extra fetch.
  A few carry MTP **built into the main weights** (e.g. Qwen3.6-A3B-MTP) — there's no
  separate file; the model self-drafts from its own head. Either way the app turns
  speculative decoding on automatically; whether it's actually *accepting* drafts (the win)
  is measurable — the bench reports the acceptance rate.
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
  **asked** (temperature, max tokens, thinking on/off, samplers — in the preset, edited in
  the Routing-by-feature Lab, no
  reload needed). So there is exactly **one place to set engine switches: the model's
  Tune & measure dialog** — opened from the model's row in the catalog, or from a Lab
  column's **Engine switches ↗** link (same dialog, same config).
- **Thinking: the feature asks, the model provides the default.** Every preset's
  **Thinking** control (on its chip or in the Lab — same control, same save) has three
  states: **Off** · **Model default** — think on, following the *selected model's* own
  budget, resolved live from its layers (your applied config → PC class config →
  global launch defaults), nothing copied, so switching models switches the budget
  automatically · **a level** (Low…Max) — this preset's *own* ask, riding the preset no
  matter which model it points at. The line under the control always shows the number
  that will actually run and where it came from ("this preset", "PC class
  config", "your applied config", "global default").
- **The model's own budget is not a launch switch.** The `reasoning_budget` value is
  layered like any switch (global defaults → your PC class config → your applied config)
  but **sent with every request** rather than at launch — changing it applies
  immediately, no reload; its row carries a "per-request" note wherever it appears in
  the Tune & measure dialog. Special values: **0** turns thinking off, **-1** means
  unlimited — shown with a warning, because an unlimited think can run until the
  context fills. Cloud providers ignore the layered value; their thinking comes from
  the preset's level, translated per provider on the provider's **Reasoning levels**
  editor (a popup on the provider's form).
- **When a model can't do what the preset asks, you see the provider's own error —
  nothing is filtered on the way out.** The request goes to the provider exactly as
  the preset configured it. If the model can't take it — a model with no reasoning
  support asked to think, a fixed-reasoning model asked for a different level — the
  provider refuses, and the error you see is that provider's own message with one
  sentence added at the end naming the fix: turn Thinking off on this feature's
  preset, or point the preset at a model that can think. There is no hidden
  downgrade and no silent retry, so a preset that works is one you've actually seen
  work — test it in the Lab before relying on it.
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
  it stops following later changes to the global launch defaults or the PC class config — what you
  measured is what keeps running (both defaults libraries say so right in their help text).
  If the defaults DO change under an applied config, the dialog tells you the next time you
  open it — *"Defaults have changed since you applied this config — N values differ"* —
  with a **Refresh from defaults** button that loads today's defaults into the grid for you
  to review, measure, and Apply; nothing changes until you do. The dialog's badge tells you
  **how** the model got its config: **Auto-tuned on this PC ✓** (the sweep's winner, applied
  unedited), **Hand-tuned on this PC ✓**, or **Untuned — using the layered defaults** (the
  badge never claims the config comes from one single layer — the rows themselves show which
  layer set each value). A model with no config of its own but a saved PC class config shows a
  **PC class config** badge on its **row in the catalog** — the badge names your class after it
  (*"PC class config · 8 GB VRAM · 32 GB RAM"*), and its hover spells the class out as the full
  range it covers (tuned rows show their Auto-/Hand-tuned badge there; untuned rows just carry
  none).
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
  **grouped under a heading per source** — *Your applied config* · *PC class
  config* · *Global launch defaults* · *Computed for this PC* — so "what set this
  switch?" is answered by the section it sits in (values the engine works out for your
  machine, like GPU layers, are ordinary rows under *Computed for this PC*, and Apply
  keeps them with the rest). Values are plain text or numbers — **hover a row for what
  the switch does and which values it accepts** (the KV cache types, for example, accept
  f32, f16, bf16, q8_0, q4_0, q4_1, iq4_nl, q5_0, q5_1). Speculative decoding (**MTP**)
  turns on automatically for models that support it; set *spec_type* to none (or remove
  its rows) and Apply if you don't want it. For an MTP model, Auto-tune also **times
  speculative decoding itself**: one trial with it **switched off**, so you can see
  whether it actually pays on your machine (it doesn't always — on a CPU-only box the
  drafting can cost more than it saves), plus one trial per **alternative draft file**
  the model's repo publishes. The draft trials are shown for information only and are
  never saved on their own — if a different draft wins on your box, set it on the model
  itself under **Edit → MTP draft**. After a measurement, **Save for
  PC class** keeps the config as the shared starting point for **every PC in the same
  memory class** (a machine with its own applied config still wins), and the
  **"PC class configs ↗"** link in the same dialog opens **this model's PC class
  config straight in its editor** — your PC's class row when one exists, otherwise a new
  config prefilled with your class — no list to click through; a
  **"Global launch defaults ↗"** link beside it opens the always-on switch bundles the
  same way, so nothing is edited embedded in the Tune dialog itself. The full **library**
  lives inside the Built-in provider (Edit its row) — the **"PC class configs…"** button
  there opens every saved config in one table where **each row is one model × one PC
  class** (there is no single tune covering all models; adding a config there starts with
  picking the model), with **Copy**/**Import** to share a config between users as a small
  piece of text; while you edit or import there, the editor takes the screen by itself and
  Cancel brings the table back. **Every other chat model is listed under the class too**,
  behind one line — *"N more models — not tested on this class"* — that opens to show each
  one reading plainly **no switches**, with an **Add switches** button that opens the same
  editor already pointed at that model and class. Nothing is created by listing them: a
  config *is* its switch rows, so a model with none genuinely has nothing stored, and the
  panel now says so instead of leaving the model out. (Embedding models are left out on
  purpose — policy places them on the CPU, so a memory-class config would not apply.)
  **A class is a memory *range*, not one exact machine** —
  the panel names the range it covers (*"8–11 GB VRAM · 32 or 48 GB RAM"*), and the top
  one reads *"24 GB VRAM and above"*, so a 10 GB card and a 32 GB card each land in a
  class without needing one of their own. Your PC is matched to the nearest class at or
  below its size, which is why a config never promises more memory than a machine has;
  when you add a class, the form tells you which class your numbers will be saved as
  before you save. Every measured speed is also **saved for
  good**: the
  **Measurement history** drawer in the same dialog lists each **Load & measure** run and
  each auto-tune trial — when, with which settings, and how fast — and survives closing the
  dialog and restarting the app; **Clear history** empties it (applied configs and PC class
  configs are never touched by a clear).
- **Add model** — point at any Hugging Face GGUF repo and click **Load model info from HF**
  (right under the repo field, above the quant picker): the form lists the repo's
  **available quants as a dropdown** (each with its download size and a **QAT** /
  **IQ** label where it applies), pre-picks one that fits your machine (change it, or pick
  *Custom…* to type your own), and fills the model's details from the file — all before
  downloading. The pre-pick never defaults to a
  **1-2-bit file** (however small) — it wants a full-quality quant: the mainstream
  K-family first (on this engine the unsloth-style **_XL** dynamic quants win over
  their _M siblings at near-identical size), and the size-optimized **IQ4** family
  only when that's all the repo ships. Every quant stays selectable. And because the quant decides *which file* the row describes,
  **picking a different quant re-reads the model info automatically** — name, size,
  and details always match the file you actually selected (a name or description you
  typed yourself is left alone). If the repo ships a **separate MTP draft model** (some models, like Gemma,
  keep speculative decoding in its own small file), the form detects it and pre-selects the
  **smallest draft that isn't too compressed** — a draft only makes generation *faster*, it
  can never change what the model writes (the main model checks every word the draft
  proposes), so a small file is the right default on every machine, big graphics card
  included: a bigger draft is re-read on every token and takes video memory the main model
  wants. Every draft the repo ships stays selectable, and **Tune & measure** can time them
  on your box if you want to compare. The draft downloads alongside the model, and the app
  reserves video memory for it when working out how much of the model fits on the card.
  If a repo's only draft uses a format the built-in engine can't run (some models publish a
  draft that only works on other hardware), the form leaves speculative decoding **off** and
  says so, rather than setting up a draft that would fail to load.
  This is how you run a model outside the built-in list.
- **Edit** a model's details. The memory numbers are **not yours to figure out anymore**:
  the app computes what a model needs from the model file itself (read the link once and
  every "Needs … GB" you see is derived from the file's own layer and expert structure —
  it updates automatically whenever the app's math improves). Only **embedding models**
  keep hand-set floors, because theirs steer the setup wizard rather than describe the
  file. The **description** belongs to the file: **Load model info
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
> right beside its "Installed · build · gpu" line), and **Details** expands the rest: the
> spawn log, the loaded-models list with its VRAM budget, and — right there with the
> **Models kept loaded at once** knob — the engine's memory and speed settings, all on
> one Save: the **VRAM safety margin**; the **default context cap** (the most context a
> model gets automatically when nothing was tuned for it; a tuned model's own context
> setting always wins, and 0 removes the cap); the **RAM headroom** (system RAM held
> back when computing a model's RAM requirement — room for the OS and your other
> programs); and the **speed-band lines** — the tokens-per-second levels where the
> catalog's *fast* / *fine* / *slow* / *very slow* labels switch over (~8 tok/s is
> reading speed; tune them if your idea of "fine" differs). The **download settings**
> sit in the same group, and the engine-binaries editor below keeps just the download
> URLs and the pinned build. Downloads are **segmented** by
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
> **PC class configs…** (the shared per-PC-class launch configs — a class can also carry
> optional **typical memory-bandwidth** numbers in GB/s, the *last-resort* input to the
> speed bands above; your machine's own reported or measured speed always outranks them)
> and **Global launch
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

## How the recommendations were chosen

The curated list and the **Recommended for this PC** badge don't come from leaderboards.
Every default was **measured in the app** — the same chat-with-your-book, in-character
chat, entity extraction, critique, continue-writing and rewrite features you use, run
end-to-end on real book material — on a reference machine for the class (an 8 GB
RTX 2070 SUPER with 32 GB RAM), with a portable speed kit re-run on other hardware.
Speed is measured; quality is judged by reading the outputs side by side.

The headline decision (July 2026): **Gemma 4 26B-A4B (QAT) against Qwen3.6-35B-A3B**,
the two flagship-class MoE models that run on an 8 GB card by offloading their experts
to system RAM. Both were loaded exactly as the app loads them, speculative decoding on.
Gemma generated at 25–29 tokens/s against Qwen's 14–24, and finished every writing
feature faster — most of them in about half the time:

| Feature (median, whole run) | Gemma 4 26B-A4B | Qwen3.6-35B-A3B |
|---|---:|---:|
| Chat with the book | 13s | 23s |
| Entity extraction sweep | 39s | 101s |
| Critique | 17s | 35s |
| Continue writing | 11s | 19s |

So the 35B left the catalog: a bigger model that's slower at everything it does here
isn't a better model. The Qwen family stays for bigger cards through the
**Qwen3.6-27B** row.

You may read the opposite online — 8 GB roundups that crown the Qwen 35B. Look at what
they test: **coding**. Qwen's strengths lean code and agentic work; Gemma's lean prose.
Both results can be true at once, and this catalog is tuned for writing. The
long-context slowdowns some reviews report for Gemma also start well beyond the context
sizes JustWrite's features actually use — Gemma's sliding-window attention keeps its
memory small exactly in that working range.

The other picks came the same way:

- **Per PC class:** a 12 GB card gets **Gemma 4 12B (QAT)** fully resident; 16 GB VRAM
  with 32 GB of RAM or more — and everything above — gets the **26B-A4B** flagship. A
  16 GB card in a 16 GB-RAM box also gets the 12B: the flagship wants about 24 GB of
  system RAM for its offloaded experts.
- **A dense model that only fits by spilling onto the CPU loses:** a dense Gemma 4 31B
  managed about **1 token/s** on the reference card. That measurement is why Quick Setup
  skips that shape entirely rather than "recommending" the biggest number that loads.
- **Embeddings:** **Qwen3-4B** won an on-box A/B against the smaller 0.6B and is the
  default; **Qwen3-8B** is the proven step up for bigger machines; KaLM-Gemma3-12B is
  listed for big cards as a contender you can choose, not a recommendation.
- **The style-tune and uncensored rows** were measured too (close to the flagship's
  speed, same base family) — they stay deliberate choices, never auto-picked.
