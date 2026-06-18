// Client for workspace-level operations (/v1/workspace). resetWorkspace() wipes
// the entire server database — the "Reset workspace" action — replacing the old
// clearPrefix("justwrite:") kv wipe (which since P2 only cleared kv and left the
// SQL tables behind). The caller reloads afterwards to re-seed.

import { serverUrl } from "./serverApi.js";

export function resetWorkspace() {
  return fetch(serverUrl("/v1/workspace"), { method: "DELETE" });
}
