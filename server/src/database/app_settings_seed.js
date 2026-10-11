// SPDX-License-Identifier: MIT
// JustWrite's seeded settings — values the user can change that must still come from the
// database, never from code (the nothing-hardcoded rule). Seeded insert-if-missing per key, so
// a value already set (the user's, or an earlier seed's) is never overwritten. Runs at boot and
// after a workspace reset (seedWorkspace), after a settings reset (DELETE /v1/settings), and
// on the phone (createPhoneApp).

import { pyJson } from "@delebash/llm-runner/platform/pyjson";
import { pyLoads } from "../book_io.js";

/** The `ai` settings section's seeded keys. `storyContextShare` (2026-10-11): the most of the
 * routed model's context window the story notes may take — the AI drafting spec §9.4, decided
 * at 15% (docs/plans/2026-10-11-ai-drafting-spec.md). */
export const DEFAULT_AI_PREFS = { storyContextShare: 0.15 };

/** Add any missing seeded key to the `ai` section. @returns {number} keys added */
export function seedAppSettings(h) {
  const row = h.get("settings", "ai");
  let current = {};
  if (row) {
    try {
      const v = pyLoads(row.value);
      if (v && typeof v === "object" && !Array.isArray(v)) current = v;
    } catch {
      // an unreadable section is replaced by its seeded keys
    }
  }
  const missing = Object.entries(DEFAULT_AI_PREFS).filter(([k]) => !Object.hasOwn(current, k));
  if (!missing.length) return 0;
  const value = pyJson({ ...current, ...Object.fromEntries(missing) });
  if (row) h.update("settings", { value }, { key: "ai" });
  else h.insert("settings", { key: "ai", value });
  return missing.length;
}
