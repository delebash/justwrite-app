> ⛔ **NOT THE CURRENT PLAN.** The ONE current plan is `just-llm-runner/docs/plans/2026-06-28-MASTER-PLAN.md` — everything is folded in there (✅ done + ⬜ outstanding, full detail). This doc is kept as **historical background only** (past plan / design / research / evidence). Read it for context; **plan from the master.**

# Feature Workbench — action-grained, under AI → Features

**Status:** in progress (2026-06-23). Supersedes the feature-spined workbench draft.

## Decision (from the design conversation)

- **The unit is the *action*** (37 of them). **"Feature" is a visual group only** — a
  folder in the menu (writerAI groups its 13 actions; 16 features are a single action).
  Each action owns its own model, system prompt, instruction, params, presets, and
  production flag.
- **Per-feature default model** — like Quick/Accuracy roles but scoped to a feature.
  Set once on the feature group header; every action inherits it unless it overrides.
- **Cascade for an action's model:** action's own config → feature default → role →
  global default. ("Fall back to feature" = the feature default the actions share.)
- **Presets are per action.** A saved preset captures provider + model + that action's
  prompt + params; one per action can be marked **production** (the badge).
- **One surface.** AI → Features *is* the workbench. The standalone Feature Routing
  folds in: its globals (default LLM + embedding, Quick/Accuracy roles) move to the
  workbench top; its per-feature pins become the feature-default model on each group.

## Why this shape

- writerAI already stores 13 separate prompt rows (verified: 1 shared system text +
  13 distinct user templates today). Per-action prompts cost nothing — the data is
  already there. The day `tighten` needs its own system, it's a one-row edit.
- The model is the only thing that was per-feature in the engine. Making it
  per-action with a feature fallback is additive, so nothing existing changes.

## Mechanics (no new tables)

- **Model assignment = routing pins.** `RoutingPin` rows are keyed by a string. A pin
  keyed by a **feature** key = that feature's default; a pin keyed by an **action**
  key = that action's override. `config.py` already maps every routing pin →
  `FeaturePinConfig`, so action pins flow to dispatch with no change.
- **Dispatch (`dispatch.py`) — one additive branch.** `resolve_pin(config, feature,
  action=None)`: if `action` is set, try the action's own production-config / pin
  first (`_resolve_action_override`); if it resolves, use it; else fall through to the
  existing feature-level resolution unchanged. `chat` / `stream_chat` gain an
  `action` param; `/v1/ai/run` + `/v1/ai/stream` pass `action=body.action`.
  Backward-compatible: `action=None` (every existing caller, incl. all of JustVoice)
  behaves exactly as today.
- **Presets (`feature_presets`) re-keyed `feature` → `action`.** `set_active` clears
  the same action's other presets. "Use as production" writes the action's prompt row
  (live) + the action's routing pin (model) + marks the preset active.
- **Routing GET** also returns the raw `pins` map so the workbench can read
  action-level pins (the catalog-merged `features` array stays for feature defaults).

## Files

Runner (`just-llm-runner`):
- `llm_runner/llm/dispatch.py` — action param + `_resolve_action_override`.
- `llm_runner/llm/prompts.py` — pass `action=body.action` in run/stream.
- `llm_runner/llm/feature_presets_api.py` — `FeaturePreset.feature` → `action`.
- `llm_runner/llm/routing_api.py` — add `pins` to `RoutingResponse`.
- `ui/src/views/FeatureWorkbench.vue` — rebuild action-based (groups + globals).
- `ui/src/views/AiModelsArea.vue` — Features tab renders the workbench.

JustWrite:
- `server/justwrite_server/models.py` — `feature_presets.feature` → `action`.
- `server/justwrite_server/llm/feature_preset_store.py` — action keying.
- nav cleanup: drop the temporary `/feature-workbench` route + sidebar entry +
  `AiWorkbenchView.vue` (now reachable under AI → Features).

## Iterate-on list (after first cut)

- Action labels (derive readable names from keys), group collapse state, the
  "set this model for all N actions" group helper, whether to also surface action
  pins in routing presets, and rolling the same workbench into JustVoice.
