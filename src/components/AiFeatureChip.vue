<script setup>
// AiFeatureChip — JustWrite's binding for the kit's LuFeatureChip, now in
// READ-ONLY provenance mode (B5-1, §7.2: per-surface model pickers removed;
// "The Tasks tab + Feature workbench remain the only editors"). Same name +
// props as before so its ~19 consumers stay untouched — but the chip no
// longer edits a pin. It shows what the feature's task RUNS ON right now —
// the server-resolved route (task preset → dispatch fallback) from
// GET /v1/ai/resolved-route via the kit's useResolvedRoute cache — and
// clicking it navigates to the Tasks tab, where routing is edited. When mounted
// with :editable (ChatPanel), the kit chip instead opens its preset edit doorway.

import { computed, unref, watchEffect } from "vue";
import { useRouter } from "vue-router";
import { LuFeatureChip, useResolvedRoute } from "@delebash/llm-ui";
import { useAiStore } from "../stores/ai.js";

const props = defineProps({
  feature: { type: String, required: true },
  label:   { type: String, default: "" },
  compact: { type: Boolean, default: false },
  // Opt-in edit doorway — passed straight through to the kit chip (false = read-only).
  editable: { type: Boolean, default: false },
});

const router = useRouter();
const ai = useAiStore();
const { routeFor, ensureRoute } = useResolvedRoute();

// `feature` can change on a live mount (ChatPanel flips chat ⇄ characterChat)
// — watchEffect re-ensures whenever it does.
watchEffect(() => { ensureRoute(unref(props.feature)); });

const route = computed(() => routeFor(props.feature));
const providerName = computed(() => {
  const r = route.value;
  if (!r) return "…";
  // Not-configured copy is provider-NEUTRAL (user, 2026-07-10, pick "b"):
  // the old "run Quick Setup" pushed the local-only wizard at users who
  // want an online provider. Clicking already opens the AI settings page.
  if (!r.configured) return "No model set";
  return ai.providerById(r.providerId)?.name || r.providerId || "—";
});
const model = computed(() => {
  const r = route.value;
  if (!r) return "…";
  return r.configured ? (r.model || "—") : "open AI settings";
});

function goToTasks() {
  router.push("/ai");
}
</script>

<template>
  <LuFeatureChip
    :feature="feature"
    :label="label"
    :compact="compact"
    :resolved-provider-name="providerName"
    :resolved-model="model"
    :editable="editable"
    :route="route"
    @navigate="goToTasks" />
</template>
