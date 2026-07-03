# Models

The **Models** tab (under **Settings → AI → Models**) is where you find, download, and
tune the local models the app runs on. It has two parts: a **grid** that recommends a
model for your hardware, and the full **catalog** underneath.

## The grid — a model for your machine

The grid has one **row per hardware tier** (from a CPU-only box up to a 128 GB
workstation) and one **column per job** — chat, prose, extract, analysis, and the
embedding model for search. The row that matches **your** machine is highlighted.

Each cell suggests up to two models:

- **Quality** — the best model that fits that tier for that job.
- **Faster** — a lighter model that also fits, when speed matters more than the last bit
  of quality.

"Fits" is estimated from the model's size against the tier's VRAM and RAM — a mixture-of-
experts model can run on a small graphics card by spilling its experts into system RAM,
which is why some big models appear on modest tiers. Each pick shows a **Fit** badge
(*Fits* / *Tight* / *CPU*) and a one-line reason; **Download** (or **Load**) pulls and
starts it right there, and **Tune** measures its real speed on your box.

## Manage all models

Below the grid is the full catalog — every model the app knows about, with its size,
license, live Fit, and download/loaded status. From here you can:

- **Load / Download & load** a model (one runs at a time; loading a new one replaces it).
- **Tune** a downloaded model — load it with custom engine flags and measure decode speed
  on your box. To *keep* a tuned config, use **Send to Tasks Lab** in the Tune window: it
  opens as a new column in that Task's Lab, where you save it as the Task's preset.
- **Add model** — point at any Hugging Face GGUF repo and **Read from link** to fill in
  its details from the file before downloading. This is how you run a model outside the
  built-in list.
- **Edit** a model's details, **Delete** one you added, or **Reset catalog** to restore
  the built-ins (your added models are kept).

A model's weights download from Hugging Face onto your machine; the catalog only lists
them. Some models carry a **use-limited** license (⚠) — free to try, but not for
unrestricted commercial use.

> Installing the local engine itself (the llama.cpp runtime) is separate — that lives on
> the **Built-in** provider under **Providers & models**.

> **Recommended samplers come from the model file.** When you pick a model in a Task's
> **Lab**, its maker-recommended sampler settings (read from the GGUF) seed the sampler
> grid automatically — the Task keeps its own temperature, and the model fills the
> secondary knobs (top-k / min-p / top-p / penalties) it leaves blank. What you see in the
> grid is what runs.

## Advanced: edit recommendations

At the bottom, **Advanced: edit recommendations** opens the raw table behind the grid —
the per-model, per-job "why" and ranking. Most people never need it; it's there to curate
which models the grid suggests.
