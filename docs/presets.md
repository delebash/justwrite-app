# Presets

A **preset** is a named engine configuration — the model a feature runs on plus every
tunable: temperature, top-p, max tokens, samplers, and the **Reasoning** dial (whether it
thinks, and how hard). Every AI feature points at exactly one preset, and features that
should run with the same settings simply share one — edit the preset once and everything
using it follows. **The preset is the one source of truth for engine settings**
(2026-07-15): nothing else in the app stores a tunable.

There is no separate presets page — everything lives on **Settings → AI → Routing by
feature**, on the preset bar above each feature's Lab.

## The preset bar

Pick a feature on the left; its Lab loads the preset it runs (marked **● in production**).
The bar is the whole workflow:

- **The dropdown** loads any preset into the Lab so you can see and tune its real values
  (model, temperature, samplers, reasoning) before committing to anything.
- **Use in production** — makes the loaded preset the one this feature runs. It appears
  whenever the loaded preset isn't the live one.
- **Update** — writes your tuned values back into the loaded preset. Every feature
  sharing that preset follows; that's the point of sharing.
- **＋ Save as preset** — saves the column as a new preset (name it, Enter). It appears
  in every feature's dropdown immediately; renaming is save-under-a-new-name + delete
  the old.
- **🗑** — deletes the loaded preset; features using it fall back to the default preset.

## What a preset does *not* hold

The feature's prompt text and its **JSON contract** (whether the app parses that
feature's output as structured JSON) belong to the feature itself — re-pointing a
feature at a different preset can never break its own parser. The Lab shows the contract
as a read-only badge, with an ephemeral "test as JSON" toggle that is never saved.

## Reasoning

The Reasoning dial lives on the preset. On a **local** run the level's token budget is
capped by your hardware's tested bound (the effective value is shown wherever the level
is picked); on cloud providers each level maps to that provider's own control — the
per-provider mapping is an editable table on the provider's form.

## Reset

- **Reset to default** (in a feature's header, when it has its own assignment) — the
  feature goes back to the default preset and its form reloads.
- **↺ Reset presets to defaults** (bottom of the feature list) — restores the built-in
  presets and every feature assignment to the shipped defaults. Custom presets survive.
