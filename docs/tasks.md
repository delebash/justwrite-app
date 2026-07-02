# Tasks

A **task** is a kind of LLM work — "generate prose", "edit prose", "structured
extraction", "judgment & scoring", and so on. Every AI feature in the app is assigned
to a task, and each task points at an **engine preset** (a model plus its samplers).
Grouping features by the *work they do* — rather than by where they sit in the menus —
lets one well-tuned preset serve everything of the same shape.

You'll find Tasks under **Settings → AI → Tasks**.

## What a task holds

- **A name and description** — what this kind of work is.
- **An engine preset** — the model + samplers that runs for it. A task with no preset
  of its own falls back to the **Default preset**.
- **Its features** — every AI feature assigned to this task. One feature belongs to
  exactly one task.

## Create, rename, delete

- **New task** adds one of your own — for a kind of work the built-in set doesn't
  cover. Give it a name, then assign features and a preset.
- **Rename** changes its name; **Delete** removes a task you made. The built-in tasks
  can be renamed and re-pointed but not deleted (a workspace reset restores them).
  Deleting a task returns its features to their original tasks.

## Assign features

In a task's **Features** list, **+ Add a feature** moves a feature into this task, and
**Move to…** on any member sends it to a different task. A feature always has a task,
so you reassign rather than remove. (You can also change a single feature's task from
**Routing by feature**.)

## Set up and test a task's preset

Pick a task's **Preset**, then **Test against** one of its member features to run that
preset on a real prompt — tune the model and samplers in the Lab, compare columns, and
**Save** the result. **Use for this task** makes the tested preset the one this task
runs. Because a task has no prompt of its own, you test it through one of its features.
