// Warm the default local chat model into VRAM on app startup (2026-07-21, user).
//
// WHY: the bundled llama.cpp runner starts cold — the first "Ask the book" / writing
// AI run after launch pays the full spawn + load-into-VRAM latency. When the built-in
// provider is the user's default and its model is already downloaded, kick that load
// early so the model is ready by the time they ask, and SHOW it loading.
//
// This is OPT-IN + GATED, never a silent surprise:
//   1. the `warmDefaultOnStartup` engine-config flag is on (default on; user-toggle in
//      the Local-engine panel), AND
//   2. the ROUTING default provider is the built-in runner (`local-llamacpp`) with a
//      chat model set — so a cloud-default user never triggers a local load, AND
//   3. the engine is installed AND the model is ALREADY DOWNLOADED and not already
//      resident — so a fresh box / CI never triggers a multi-GB pull or a redundant load.
//
// Visibility reuses the shared AI-task registry (the same surface `ensureEmbeddingReady`
// uses for the embed model): the warm shows as "Loading your writing model" in the
// TitleBar AI chip + the AI status panel. Fire-and-forget — it never throws into boot.

import { get, post, useAiTasksStore } from "@delebash/llm-ui";
import { getRoutingPrefs } from "./routingBackend.js";

const BUILTIN_ID = "local-llamacpp";
const READY = new Set(["loaded", "sleeping"]);
const POLL_MS = 1500;
const TIMEOUT_MS = 180_000;

export async function warmDefaultModel() {
  try {
    // 1. Master toggle (persisted engine-config; default on).
    let cfg;
    try { cfg = await get("/v1/ai/engine-config"); } catch { return; }
    if (!cfg?.warmDefaultOnStartup) return;

    // 2. The built-in runner is the routing default, with a chat model.
    const prefs = getRoutingPrefs();
    const modelId = prefs?.defaultModel;
    if (!prefs || prefs.defaultLlmId !== BUILTIN_ID || !modelId) return;

    // 3. Engine installed + model already downloaded + not already resident.
    //    NEVER trigger a download or a redundant load here.
    let engInstalled = false;
    try { engInstalled = !!(await get("/v1/llm-runner/engine/status"))?.installed; } catch { return; }
    if (!engInstalled) return;
    let row = null;
    try {
      const cat = await get("/v1/llm-runner/models");
      row = (cat?.models || []).find((m) => m.id === modelId) || null;
    } catch { return; }
    if (!row || !row.downloaded) return;   // weights not on disk → skip (never auto-download)
    if (READY.has(row.status)) return;     // already loaded/sleeping → nothing to do

    // 4. Warm it, visible as an AI task. `start` needs an active pinia; guard so a
    //    headless host (no pinia) still warms silently instead of throwing.
    let handle = null;
    try { handle = useAiTasksStore().start({ feature: "warm", label: "Loading your writing model" }); } catch { /* no pinia → warm silently */ }

    try {
      await post("/v1/llm-runner/load", { modelId });
      const deadline = Date.now() + TIMEOUT_MS;
      for (;;) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        let res = null;
        try { res = await get("/v1/llm-runner/resident"); } catch { /* transient — keep polling */ }
        const m = (res?.models || []).find((x) => x.id === modelId) || null;
        if (m && READY.has(m.status)) { handle?.finish?.(); return; }
        if (m && (m.status === "failed" || m.status === "error")) { handle?.fail?.("Couldn't load the model"); return; }
        if (Date.now() > deadline) { handle?.fail?.("Timed out loading the model"); return; }
      }
    } catch (e) {
      handle?.fail?.(e?.message || "Couldn't load the model");
    }
  } catch {
    // Warm is best-effort — the on-demand load path still runs on first use.
  }
}
