// Restore — the only durable state a bench run mutates is the per-action preset
// ASSIGNMENT map (which preset each feature runs). That map is snapshotted
// BEFORE the first write and re-applied at the end, on crash-recovery, and on
// Ctrl-C.
//
// What is NOT restored, and why: the Bench preset row itself (the user asked to
// see it in the GUI between runs) and downloaded model weights (product-normal
// artifacts). Nothing else is touched — no tune rows, no switch bundles, no DB
// reset. Launch switches ride the ephemeral `POST /load` body instead
// (schema.py:263-264 "transient tuning inputs … not saved per-model").

import { readFileSync, writeFileSync } from "node:fs";

/**
 * Snapshot the FULL assignment map before any write. Whole-map (not just the
 * keys we touch) so a partially-applied earlier run is also corrected.
 */
export async function snapshotAssignments(client) {
  const a = await client.getAssignments();
  return {
    capturedAt: new Date().toISOString(),
    defaultPresetId: a?.defaultPresetId || "",
    features: { ...(a?.features || {}) },
  };
}

export function writeRestoreFile(path, snapshot) {
  writeFileSync(path, JSON.stringify(snapshot, null, 2));
}

export function readRestoreFile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Re-apply a snapshot. Only keys that actually DIFFER are written, so a restore
 * is quiet when nothing drifted. Returns the per-key result so the caller can
 * report honestly instead of printing an unverified "restored".
 */
export async function applyAssignments(client, snapshot, { onLog } = {}) {
  const live = await client.getAssignments();
  const liveFeatures = live?.features || {};
  const want = snapshot?.features || {};
  const keys = [...new Set([...Object.keys(want), ...Object.keys(liveFeatures)])];

  const changed = [];
  const failed = [];
  for (const key of keys) {
    const target = want[key] || "";
    const current = liveFeatures[key] || "";
    if (target === current) continue;
    try {
      await client.setFeaturePreset(key, target);
      changed.push({ featureKey: key, from: current, to: target });
      onLog?.(`restored ${key}: ${current || "(none)"} → ${target || "(cleared)"}`);
    } catch (e) {
      failed.push({ featureKey: key, error: String(e?.message || e) });
    }
  }

  // Verify by RE-READING rather than trusting the write calls.
  const after = await client.getAssignments();
  const afterFeatures = after?.features || {};
  const mismatched = keys
    .filter((k) => (want[k] || "") !== (afterFeatures[k] || ""))
    .map((k) => ({ featureKey: k, expected: want[k] || "", actual: afterFeatures[k] || "" }));

  return { changed, failed, mismatched, ok: !failed.length && !mismatched.length };
}
