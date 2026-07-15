# Presets

A **preset** is a named engine configuration — the model a feature runs on plus every
tunable: temperature, top-p, max tokens, samplers, and the **Reasoning** dial (whether it
thinks, and how hard). Every AI feature in the app points at exactly one preset, and
features that should run with the same settings simply share one — edit the preset once
and everything using it follows. **The preset is the one source of truth for engine
settings** (2026-07-15): nothing else in the app stores a tunable.

You'll find Presets under **Settings → AI → Presets**.

## What a preset holds

- **A name** — "Generate prose", "Judgment & scoring", "Reader panels", …
- **The model** — the provider + model its features run on.
- **Every tunable** — temperature, top-p, max tokens, the long-tail samplers, and the
  Reasoning level (Off / Low / Medium / High / XHigh / Max).
- **Its features** — shown as "used by N features", with the member list in the detail
  pane. A feature always points at some preset (or the **default preset** if unassigned).

What a preset does **not** hold: the feature's prompt text and its **JSON contract**
(whether the app parses that feature's output as structured JSON). Those belong to the
feature itself — re-pointing a feature at a different preset can never break its own
parser. The Lab shows the contract as a read-only badge, with an ephemeral "test as JSON"
toggle for experiments that is never saved.

## Create, rename, delete

- **＋ New preset** adds one of your own: name it (that's all the form needs), then set
  its model and values in the Lab below and assign features to it.
- The **name is the field at the top of the detail pane** — edit it right there.
- **Delete** removes a preset you made; its features fall to the default preset. The
  built-in presets can be renamed and re-tuned but not deleted — **Reset** (one preset)
  or **↺ Reset all** (everything) restores the shipped state while keeping your custom
  presets.

## Assign features

In a preset's **Features** list, **＋ Assign a feature** points a feature at this preset,
and **Move to…** on any member sends it to a different one. You can also set a single
feature's preset from **Routing by feature** — its **Preset** dropdown lists the library
plus "— default preset —" (which clears the assignment so the feature follows the default).

## Test and tune

The Lab at the bottom of the page **is** the preset's editor: the column shows this
preset's actual values, **Update** writes them back to this preset, and **Save as preset**
makes a new one instead. Pick **Test against** to run the preset on one of its member
features' real prompts and compare columns. The same Lab on **Routing by feature** tests a
single feature; its "Use for this feature" points that feature at the tested preset.

The two chat chips (Ask the book / Talk to character) are also **edit doorways**: click
one to change that feature's model and Reasoning level right there — the popover names the
preset it edits and how many features share it before you save.

## Reasoning

The Reasoning dial lives on the preset. On a **local** run the level's token budget is
capped by your hardware's tested bound (the effective value is shown wherever the level
is picked); on cloud providers each level maps to that provider's own control — the
per-provider mapping is an editable table on the provider's form.

## Reset to defaults

- **↺ Reset all** (bottom of the preset list) — restores the built-in presets, every
  feature assignment, and the default preset. Custom presets survive.
- **Reset** (on a built-in preset) — restores just that preset's name and values.
