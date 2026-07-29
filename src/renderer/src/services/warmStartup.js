// SPDX-License-Identifier: MIT
// On startup, run the SAME workflow every load button runs — nothing bespoke (user, 2026-07-21:
// "on start call the engine install, it either installs or passes, then call load model. run
// existing function 1 2 3, no new fancy warm boot function"). So this holds NO load logic:
//   1. read the warmDefaultOnStartup toggle,
//   2. resolve the default LOCAL chat model (empty ⇒ the default isn't a local model ⇒ no-op —
//      so a cloud-default user never triggers a local load OR an engine install at boot),
//   3. call useRunnerModels().retryLoad — which itself does the engine check → install-if-missing
//      → load (the ONE workflow; see useRunnerModels.js).
// `warmModelId` is exported so App.vue renders the SHARED engine + load DownloadBars on the boot
// splash while it runs (reuse only — no new bar, no new poller).

import { ref } from "vue";
import { get, useModelApply, useRunnerModels } from "@delebash/llm-ui";

// The model being warmed ("" = none). App.vue renders the boot bars for it.
export const warmModelId = ref("");

export async function startWarmOnBoot() {
  // The bench drives this renderer headless and loads its leg models itself — a warm
  // co-load rode along every leg (defect F, 2026-07-22 pass-1 plan T6). The driver
  // sets the flag via an init script before any page script runs.
  if (typeof window !== "undefined" && window.__JW_BENCH__) {
    console.info("[bench] warm-boot suppressed");
    return;
  }
  try {
    const cfg = await get("/v1/ai/engine-config");
    if (!cfg?.warmDefaultOnStartup) return; // 1. toggle off → nothing to do

    // 2. The default LOCAL chat model — the SAME resolution the catalog's Default badge uses.
    //    Empty ⇒ the default provider isn't the local runner ⇒ no-op (cloud-default user).
    const { refreshApplied, currentDefaultId } = useModelApply();
    await refreshApplied();
    const modelId = currentDefaultId.value;
    if (!modelId) return;

    // 3. Show it on the boot splash + run the SAME load a button runs — the engine check +
    //    install-if-missing + load all live inside retryLoad. Fire-and-forget: the runner-models
    //    singleton drives the load bar, engineGateTask drives the engine bar, and App.vue clears
    //    warmModelId when the model goes resident (or the user hits Continue).
    warmModelId.value = modelId;
    useRunnerModels().retryLoad(modelId);
  } catch {
    // best-effort — the on-demand load on first use still covers a miss
    warmModelId.value = "";
  }
}
