// Warm the default local chat model into VRAM on startup — REUSE, not new code
// (2026-07-21, user: "just call the same function as the load button … delete warmDefault
// … reuse that loading control with the progress bar and put it below the loading circle").
//
// No hand-rolled poll loop (the deleted warmDefault.js had one). This just:
//   1. reads the warmDefaultOnStartup flag,
//   2. resolves the default LOCAL chat model the SAME way the catalog's Default badge /
//      "Load now" button does (useModelApply → currentDefaultId; empty ⇒ default isn't
//      local ⇒ no-op, so a cloud-default user never triggers a local load),
//   3. only for a model whose weights are ALREADY on disk (never a multi-GB pull at boot),
//   4. calls the SAME load the "Load now" button runs — useRunnerModels().retryLoad —
//      which drives the shared load progress the DownloadBar renders.
//
// `warmModelId` is exported so App.vue can show that shared DownloadBar (via
// useRunnerModels().taskFor(warmModelId)) below the boot spinner while it loads.

import { ref } from "vue";
import { get, useModelApply, useRunnerModels, refreshRunnerModels } from "@delebash/llm-ui";

// The model being warmed ("" = none). App.vue renders the boot DownloadBar for it.
export const warmModelId = ref("");

const READY = new Set(["loaded", "sleeping"]);

export async function startWarmOnBoot() {
  try {
    const cfg = await get("/v1/ai/engine-config");
    if (!cfg?.warmDefaultOnStartup) return;

    // The default LOCAL chat model — the SAME resolution the catalog Default badge uses.
    const { refreshApplied, currentDefaultId } = useModelApply();
    await refreshApplied();
    const modelId = currentDefaultId.value;
    if (!modelId) return; // default provider isn't the local runner → nothing to warm

    // Only warm weights that are ALREADY downloaded — never kick a pull at boot. Refresh the
    // catalog once so the row status is current, then read the shared singleton's list.
    await refreshRunnerModels();
    const rm = useRunnerModels();
    const row = rm.models.value.find((m) => m.id === modelId);
    if (!row || !row.downloaded) return;
    if (READY.has(row.status)) return; // already resident → nothing to do

    // Show it on the boot screen + run the SAME load the "Load now" button runs. Fire-and-
    // forget: the runner-models singleton polls it and feeds the DownloadBar; App.vue clears
    // warmModelId when the model goes resident (or the user hits Continue).
    warmModelId.value = modelId;
    rm.retryLoad(modelId);
  } catch {
    // best-effort — the on-demand load on first use still covers a miss
    warmModelId.value = "";
  }
}
