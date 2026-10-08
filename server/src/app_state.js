// SPDX-License-Identifier: MIT
// Application-wide state — the port of justwrite_server/app_state.py. A singleton via
// setState/getState, mirroring JustVoice. Holds the data dir.

import { mkdirSync } from "node:fs";
import { purePath } from "@delebash/llm-runner/platform/data_paths";
import { RuntimeError } from "@delebash/llm-runner/platform/py";

export class AppState {
  constructor(dataDir) {
    // Python held a Path: `str(state.data_dir)` is the normalized form (native separators,
    // no trailing separator) — kept as that string here.
    this.dataDir = purePath(dataDir);
    mkdirSync(this.dataDir, { recursive: true });
  }
}

let STATE = null;

export function setState(state) {
  STATE = state;
}

export function getState() {
  if (STATE === null) throw new RuntimeError("AppState not initialized — call setState() during boot");
  return STATE;
}
