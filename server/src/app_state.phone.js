// SPDX-License-Identifier: MIT
// The phone's twin of app_state.js — the same API; the phone's in-app server keeps everything in
// its SQLite database, so there is no data folder to create (the kit's
// docs/plans/2026-10-08-the-phone.md).
import { RuntimeError } from "@delebash/llm-runner/platform/py";

export class AppState {
  constructor(dataDir) {
    this.dataDir = String(dataDir);
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
