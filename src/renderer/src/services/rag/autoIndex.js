// Auto-rebuild watcher for the RAG index.
//
// When ai.autoRebuildRagIndex is on, this subscribes to project-store
// mutations and silently runs buildOrUpdateIndex() one minute after the
// last change. Guards skip the call when:
//   - the setting is off
//   - no embedding provider is configured
//   - no index has been built yet (we don't auto-build from scratch —
//     the user has to opt in via the "Build index" flow at least once)
//   - a build is already in flight
// Errors are swallowed: an auto-rebuild failing should never toast or
// alert; the user can still manually update from the chat panel.

import { ref } from "vue";
import { useAiStore } from "../../stores/ai.js";
import { useProjectStore } from "../../stores/project.js";
import { buildOrUpdateIndex, indexStatus } from "./indexer.js";

const DEBOUNCE_MS = 60_000;

// Reactive flag for the ChatPanel "indexing…" indicator. Mutated only
// from inside fire(); read-only from the perspective of consumers.
export const autoIndexRunning = ref(false);

let timer = null;
let unsubscribe = null;

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(fire, DEBOUNCE_MS);
}

async function fire() {
  timer = null;
  if (autoIndexRunning.value) return;

  const ai = useAiStore();
  if (!ai.autoRebuildRagIndex) return;
  if (!(await ai.ensureEmbeddingDefaults())) return; // self-heal a failed boot fetch (2026-07-11)

  const status = await indexStatus();
  if (!status.exists || status.entryCount === 0) return;

  autoIndexRunning.value = true;
  try {
    await buildOrUpdateIndex();
  } catch {
    // Auto-rebuild is opportunistic — failures are not the user's problem
    // to deal with. They can still Update manually if they want.
  } finally {
    autoIndexRunning.value = false;
  }
}

/**
 * Begin watching project mutations. Safe to call multiple times — only
 * the first call wires up the subscription.
 */
export function startAutoRebuildWatcher() {
  if (unsubscribe) return;
  const project = useProjectStore();
  unsubscribe = project.$subscribe(() => {
    schedule();
  });
}

export function stopAutoRebuildWatcher() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  if (timer) { clearTimeout(timer); timer = null; }
}
