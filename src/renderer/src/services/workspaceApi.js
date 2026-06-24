// Client for workspace-level operations (/v1/workspace). resetWorkspace() wipes
// the entire server database — the "Reset workspace" action — replacing the old
// clearPrefix("justwrite:") kv wipe. The caller reloads afterwards to re-seed.
// HTTP via the shared kit transport.

import { del } from "@delebash/llm-ui";

export function resetWorkspace() {
  return del("/v1/workspace");
}
