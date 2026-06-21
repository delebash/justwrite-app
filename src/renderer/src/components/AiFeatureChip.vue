<script setup>
// Click-to-edit chip showing the resolved provider + model for an AI
// feature. Mirrors Settings → AI engines → Feature routing, scoped to a
// single feature, in the surface where the writer is already looking.
//
// Two states only:
//   - Inherit default → no feature pin. The chip shows the global
//     default provider + its chatModel.
//   - Pinned → feature pin set. The chip shows the pinned provider +
//     model.
//
// The popover writes through `ai.setFeaturePin(feature, …)`, which is
// the same backing store Settings edits. Updating from here updates
// the feature globally — Settings stays in sync.
//
// Props:
//   feature  — feature key (e.g. "writerAI", "critique")
//   label    — optional inline label ("Rewrite", "Critique"). When
//              omitted the chip shows just "Engine · provider · model".
//   compact  — drop the leading "Engine ·" word when truthy. Used when
//              the chip already has a clearly-tied label.

import { ref, computed, onMounted, onBeforeUnmount, nextTick } from "vue";
import { useAiStore } from "../stores/ai.js";
import { useModelList } from "../composables/useModelList.js";
import Icon from "./Icon.vue";
import JwSelect from "@renderer/components/ui/JwSelect.vue";

const props = defineProps({
  feature: { type: String, required: true },
  label:   { type: String, default: "" },
  compact: { type: Boolean, default: false },
});

const ai = useAiStore();
const { modelsFor, ensureModels, refreshModels } = useModelList();

const INHERIT = "__inherit__";

// Resolved display values. `providerForFeature` already does the
// fallback-to-default behind the scenes; `modelForFeature` returns null
// when nothing's pinned (then we display the provider's chatModel).
const resolvedProvider = computed(() => ai.providerForFeature(props.feature));
const resolvedModel = computed(() =>
  ai.modelForFeature(props.feature) || resolvedProvider.value?.defaultModel || "—"
);

// Raw pin state — drives the popover selects.
const pinnedProviderId = computed(() =>
  ai.featurePins?.[props.feature]?.providerId || INHERIT
);
const pinnedModel = computed(() => ai.featurePins?.[props.feature]?.model || "");

// Tells the writer which mode they're in (inherit vs pinned) without
// having to interpret the chip text.
const isPinned = computed(() => pinnedProviderId.value !== INHERIT);

// Provider options — Inherit + every ready LLM provider.
const providerOptions = computed(() => {
  const opts = [{
    value: INHERIT,
    label: `Inherit default · ${ai.llmProvider?.name || "—"}`,
  }];
  for (const p of ai.readyLlmProviders) opts.push({ value: p.id, label: p.name });
  return opts;
});

// Same shape as SettingsView.featureModelOptions — provider's saved
// chatModel first (always selectable even if live fetch failed), then
// any models the live fetch surfaced, de-duped by id.
const modelOptions = computed(() => {
  if (pinnedProviderId.value === INHERIT) return [];
  const provider = ai.providerById(pinnedProviderId.value);
  const list = modelsFor(pinnedProviderId.value);
  const seen = new Set();
  const out = [];
  if (provider?.defaultModel) {
    out.push({ value: provider.defaultModel, label: `${provider.defaultModel} (configured default)` });
    seen.add(provider.defaultModel);
  }
  for (const m of list) {
    if (m.id && !seen.has(m.id)) { out.push({ value: m.id, label: m.id }); seen.add(m.id); }
  }
  return out;
});

function setProvider(providerId) {
  if (!providerId || providerId === INHERIT) {
    ai.setFeaturePin(props.feature, null);
    return;
  }
  const p = ai.providerById(providerId);
  ai.setFeaturePin(props.feature, { providerId, model: p?.defaultModel || "" });
  // Force a fresh fetch — ensureModels is lazy and would skip if a prior
  // failed attempt left an empty array in the cache. The fetch resolves
  // async; the Model dropdown re-renders when results land.
  refreshModels(providerId);
}
function setModel(model) {
  const pin = ai.featurePins?.[props.feature];
  if (!pin?.providerId) return;
  ai.setFeaturePin(props.feature, { providerId: pin.providerId, model: model || pin.model });
}

// Popover state + click-outside dismiss.
const open = ref(false);
const wrap = ref(null);

async function toggle() {
  open.value = !open.value;
  if (open.value && isPinned.value) {
    // Refresh the model list whenever the popover opens with a pinned
    // provider — `ensureModels` is lazy and skips if a prior failed
    // attempt left an empty array, so we'd see "no models" forever.
    refreshModels(pinnedProviderId.value);
    await nextTick();
  }
}

// Dismissal:
//   - Esc
//   - Clicking the chip again (toggle)
//   - Clicking a transparent backdrop that sits BEHIND the popover but
//     ABOVE every other page chrome. The backdrop's z-index is one less
//     than the popover, so the popover itself catches its own clicks
//     first by standard z-index hit-testing; ditto for the Reka Select
//     dropdown (z-index 999, far above the backdrop). This sidesteps
//     every false-positive that document-level click-outside listeners
//     produced with the Reka portal + Vue Teleport combination.
function onDocKey(e) {
  if (e.key === "Escape" && open.value) { open.value = false; e.stopPropagation(); }
}
onMounted(() => {
  document.addEventListener("keydown", onDocKey);
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onDocKey);
});
</script>

<template>
  <span class="afc-wrap" ref="wrap">
    <button class="afc-chip" :class="{ pinned: isPinned, open }" @click.stop="toggle"
      v-tooltip.bottom="`Click to change provider or model for ${label || feature}`">
      <template v-if="label">
        <span class="afc-label">{{ label }}</span>
        <span class="afc-sep">·</span>
      </template>
      <template v-else-if="!compact">
        <span class="afc-label">Engine</span>
        <span class="afc-sep">·</span>
      </template>
      <b class="afc-provider">{{ resolvedProvider?.name || "—" }}</b>
      <span class="afc-sep">·</span>
      <code class="afc-model">{{ resolvedModel }}</code>
      <Icon name="ChevDown" :size="9" class="afc-caret" />
    </button>

    <!-- Transparent backdrop. Lives inline (not teleported) so it shares
         the chip's stacking context — that way its z-index 69 is just
         below the popover's z-index 70 and standard hit-testing keeps
         popover clicks on the popover. The Reka SelectContent portals
         to body at z-index 999 and sits above everything either way,
         so its own clicks never reach the backdrop. -->
    <div v-if="open" class="afc-backdrop" @click="open = false" />

    <div v-if="open" class="afc-pop" role="dialog" :aria-label="`Routing for ${label || feature}`"
      @click.stop @mousedown.stop>
      <div class="afc-pop-head">
        <span class="afc-pop-eyebrow">Routing for</span>
        <span class="afc-pop-feature">{{ label || feature }}</span>
      </div>

      <div class="afc-pop-row">
        <label class="afc-pop-label">Provider</label>
        <JwSelect
          :model-value="pinnedProviderId"
          @update:model-value="setProvider"
          :options="providerOptions" />
      </div>

      <div class="afc-pop-row">
        <label class="afc-pop-label">Model</label>
        <span class="afc-pop-model-wrap">
          <JwSelect
            :model-value="pinnedModel"
            @update:model-value="setModel"
            :options="modelOptions"
            :disabled="!isPinned"
            :placeholder="isPinned ? 'Pick a model' : 'Follows default'" />
          <button class="afc-refresh"
            v-tooltip.bottom="isPinned ? 'Refresh model list from the provider' : 'Pin to a specific provider first'"
            :disabled="!isPinned"
            @click.stop="refreshModels(pinnedProviderId)">
            <Icon name="Refresh" :size="11" />
          </button>
        </span>
      </div>

      <div class="afc-pop-foot">
        Changes update the <b>{{ label || feature }}</b> routing everywhere this
        feature runs. <router-link to="/settings/audio" @click="open = false">Manage all routing in Settings →</router-link>
      </div>
    </div>
  </span>
</template>

<style scoped>
.afc-wrap { position: relative; display: inline-flex; }

/* Full-viewport transparent backdrop. Sits BEHIND the popover (z-index
   70) but in front of all page chrome — clicks that aren't on the
   popover or a Reka portal land here and dismiss. Reka SelectContent at
   z-index 999 stays above this and intercepts its own clicks normally. */
.afc-backdrop {
  position: fixed;
  inset: 0;
  z-index: 69;
  background: transparent;
}

.afc-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  font-size: 11.5px;
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  line-height: 1.3;
  white-space: nowrap;
}
.afc-chip:hover { background: var(--surface-2); border-color: var(--border-strong); }
.afc-chip.pinned { border-color: var(--accent-line); background: var(--accent-soft); color: var(--accent-ink); }
.afc-chip.open   { border-color: var(--accent); background: var(--accent-soft); }

.afc-label    { color: var(--muted); font-weight: 500; }
.afc-chip.pinned .afc-label { color: var(--accent-ink); opacity: 0.85; }
.afc-sep      { color: var(--muted); opacity: 0.6; }
.afc-provider { font-weight: 600; }
.afc-model {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--ink-2);
  background: transparent;
}
.afc-chip.pinned .afc-model { color: var(--accent-ink); }
.afc-caret { color: var(--muted); margin-left: 2px; }

/* Popover — fixed-positioned via JS? No, simpler: anchored to the wrap
   with absolute positioning, the wrap is the anchor. We bias to align
   the right edge of the popover to the right edge of the chip so it
   doesn't overflow when the chip is near the page edge. */
.afc-pop {
  position: absolute;
  top: calc(100% + 6px); right: 0;
  z-index: 70;
  min-width: 280px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
  display: flex; flex-direction: column;
  gap: 10px;
}
.afc-pop-head {
  display: flex; flex-direction: column; gap: 2px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-soft);
}
.afc-pop-eyebrow {
  font-family: var(--font-mono); font-size: 9.5px;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--muted); font-weight: 600;
}
.afc-pop-feature { font-size: 13px; font-weight: 600; color: var(--ink); }

.afc-pop-row { display: flex; flex-direction: column; gap: 4px; }
.afc-pop-label {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--muted); font-weight: 500;
}
.afc-pop-model-wrap { display: flex; align-items: center; gap: 6px; }
.afc-pop-model-wrap > :first-child { flex: 1; min-width: 0; }
.afc-refresh {
  display: grid; place-items: center;
  width: 26px; height: 26px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
}
.afc-refresh:hover:not(:disabled) { background: var(--surface-2); color: var(--ink-2); }
.afc-refresh:disabled { opacity: 0.4; cursor: not-allowed; }

.afc-pop-foot {
  font-size: 11px;
  color: var(--muted);
  line-height: 1.45;
  padding-top: 6px;
  border-top: 1px solid var(--border-soft);
}
.afc-pop-foot a { color: var(--accent-ink); text-decoration: none; }
.afc-pop-foot a:hover { text-decoration: underline; }
</style>
