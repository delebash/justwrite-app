// SPDX-License-Identifier: MIT
// JustWrite's seeded settings — values the user can change that must still come from the
// database, never from code (the nothing-hardcoded rule). Seeded insert-if-missing per key, so
// a value already set (the user's, or an earlier seed's) is never overwritten — except a value
// still at an EARLIER default, which takes today's (the kit's upgradeSettings, PREVIOUS_AI_PREFS).
// Runs at boot and after a workspace reset (seedWorkspace), after a settings reset (DELETE
// /v1/settings), and on the phone (createPhoneApp).

import { getLogger } from "@delebash/core/platform/log";
import { pyJson } from "@delebash/core/platform/pyjson";
import { upgradeSettings } from "@delebash/core/platform/settings_upgrade";
import { pyLoads } from "../book_io.js";

const log = getLogger("justwrite_server.database.app_settings_seed");

/** The `ai` settings section's seeded keys. `storyContextShare` (2026-10-11): the most of the
 * routed model's context window the story notes may take — the AI drafting spec §9.4, decided
 * at 15% (docs/plans/archive/2026-10-11-ai-drafting-spec.md). */
export const DEFAULT_AI_PREFS = { storyContextShare: 0.15 };

/**
 * The earlier defaults of the `ai` keys whose default has changed — each one's fingerprint (the
 * kit's `fingerprint`: the first 16 hex digits of the SHA-256 of its canonical JSON), per key.
 * When a default in DEFAULT_AI_PREFS changes, add the OUTGOING default's fingerprint here
 * (server/tests/app_settings_seed.test.js holds today's and fails until you do): a library still
 * holding it — its owner never changed it — gets the new default.
 */
export const PREVIOUS_AI_PREFS = Object.freeze({});

/** The `ai` section as a document (an unreadable or missing one reads as empty). */
function readAi(h) {
  const row = h.get("settings", "ai");
  if (!row) return { row, current: {} };
  try {
    const v = pyLoads(row.value);
    if (v && typeof v === "object" && !Array.isArray(v)) return { row, current: v };
  } catch {
    // an unreadable section is replaced by its seeded keys
  }
  return { row, current: {} };
}

function writeAi(h, row, value) {
  const encoded = pyJson(value);
  if (row) h.update("settings", { value: encoded }, { key: "ai" });
  else h.insert("settings", { key: "ai", value: encoded });
}

/** Add any missing seeded key to the `ai` section, then bring a key still at an earlier default to
 * today's. @returns {number} keys added */
export function seedAppSettings(h) {
  const { row, current } = readAi(h);
  const missing = Object.entries(DEFAULT_AI_PREFS).filter(([k]) => !Object.hasOwn(current, k));
  if (missing.length) writeAi(h, row, { ...current, ...Object.fromEntries(missing) });
  upgradeAppSettings(h);
  return missing.length;
}

/** A key of the `ai` section still at an earlier default (PREVIOUS_AI_PREFS) takes today's; a
 * value the user changed is left alone (the kit's upgradeSettings). Returns the keys upgraded. */
export function upgradeAppSettings(h, previous = PREVIOUS_AI_PREFS) {
  const upgraded = upgradeSettings(h, {
    defaults: DEFAULT_AI_PREFS,
    previous,
    getSetting: (db, key) => readAi(db).current[key],
    setSetting: (db, key, value) => {
      const { row, current } = readAi(db);
      writeAi(db, row, { ...current, [key]: value });
    },
  });
  if (upgraded.length) log.info(`settings still at an earlier default, now today's: ${upgraded.join(", ")}`);
  return upgraded;
}
