# Tasks

A **task** is a kind of LLM work — "generate prose", "edit prose", "structured
extraction", "judgment & scoring", and so on. Every AI feature in the app is assigned
to a task, and each task points at an **engine preset** (a model plus its samplers).
Grouping features by the *work they do* — rather than by where they sit in the menus —
lets one well-tuned preset serve everything of the same shape.

You'll find Tasks under **Settings → AI → Tasks**.

## What a task holds

- **A name and description** — what this kind of work is.
- **An engine preset** — the model + samplers its features run by default. The preset a
  feature actually runs cascades through three tiers: **its own per-feature override**
  (if set) → **its task's preset** → the **Default preset**.
- **Its features** — every AI feature assigned to this task. One feature belongs to
  exactly one task.

## Create, rename, delete

- **New task** adds one of your own — for a kind of work the built-in set doesn't
  cover. Give it a name, then assign features and a preset.
- **Rename** changes its name; **Delete** removes a task you made. The built-in tasks
  can be renamed and re-pointed but not deleted (use **Reset**, or **Reset all**, to
  restore them). Deleting a task returns its features to their original tasks.

## Assign features

In a task's **Features** list, **+ Add a feature** moves a feature into this task, and
**Move to…** on any member sends it to a different task. A feature always has a task,
so you reassign rather than remove. (You can also change a single feature's task from
**Routing by feature**.)

## Set up and test a task's preset

Pick a task's **Preset**, then **Test against** one of its member features to run that
preset on a real prompt — tune the model and samplers in the Lab and compare columns.
Save your work two ways: **Save as preset** makes a new reusable preset, and **Update**
edits the loaded preset in place (no duplicate). **Use for this task** makes the shown
preset the one this task runs. Because a task has no prompt of its own, you test it
through one of its features.

When you **Send to Tasks Lab** from a model's Tune window (on the **Models** tab), the
tuned model + engine flags arrive here as a **new column** in the first task's Lab —
alongside the task's current preset, so you can compare them — ready to **Save as preset**.

On **Routing by feature** you can give a single feature its **own preset override** — the
**Preset** dropdown there sets a preset for **that feature only** (or pick **— inherit
from task —** to drop the override and follow the task again). To change every feature in
a task at once, set the task's preset here, or use **Use for this task** in the Lab.

## Reset to defaults

Several levels, all of which **keep your custom tasks and custom presets**:

- **Reset all to defaults** (by the Default preset, at the bottom of the task list) —
  restores the built-in presets, the built-in task names/descriptions, and every
  task→preset, feature→task, and per-feature override (clears them all).
- **Reset** (next to a built-in task's **Rename**) — restores just that task's name,
  description, and preset. Its features stay where they are.
- **↺ next to a feature's Preset** (on **Routing by feature**) — clears just that
  feature's per-feature override, so it follows its task's preset again.
- **↺ next to a feature's Task** (on **Routing by feature**) — the full per-feature
  reset: clears its preset override AND sends it back to its default task.
