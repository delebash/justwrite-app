// The results STORE — what makes a leg comparable across runs.
//
// The unit of truth is the LEG, not the run. Every completed leg writes a
// compact `leg.json`; the store is simply every `leg.json` under the results
// root, grouped by leg id, newest wins. Nothing is indexed or cached: deleting a
// run folder deletes it from the store, which is the behaviour you want from
// something you'll prune by hand.
//
// WHY it exists: the workflow is "a new CPU model is out, bench it against what
// I already measured". Without a store that means re-running every old leg (an
// overnight job to learn one number) or reading two result folders side by side.
// With it, `--legs cpu-newmodel` produces a table containing every leg in the
// band — the new one fresh, the rest recalled and labelled.
//
// HONESTY RULES, because a silently wrong comparison is worse than no
// comparison: a recalled row always shows its date, and it is FLAGGED when the
// engine build it ran on differs from today's, or when the leg's own config has
// changed since (fingerprint mismatch). Comparing across those is allowed —
// pretending they're the same measurement is not.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A stable fingerprint of everything about a leg that would change its numbers.
 * Deliberately EXCLUDES: label/id (cosmetic), the feature list (a leg that
 * gained a feature is still the same leg for the features it already had — the
 * summary notes per-feature gaps separately), and `repeats` (it changes how many
 * SAMPLES you take, not what is being measured; including it would falsely flag
 * every stored row as config-drift the day repeats goes 2 → 3).
 * The BOOK is not here either — it is run-level, so it rides the leg record's
 * env and is checked by stalenessOf, same as the engine build.
 */
export function legFingerprint(leg) {
  const shape = {
    model: leg.model || "",
    gguf: leg.gguf || "",
    quant: leg.quant || "",
    tunables: leg.tunables || {},
    launch: leg.launch || {},
    llamaBench: leg.llamaBench || null,
  };
  return createHash("sha1").update(stableStringify(shape)).digest("hex").slice(0, 12);
}

/** JSON.stringify with sorted keys, so key order can't change a fingerprint. */
function stableStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(",")}}`;
}

/**
 * Every stored leg result, newest per leg id.
 * Returns Map<legId, record>. Unreadable/partial folders are skipped, not fatal —
 * a half-written leg from a killed run must not break the next report.
 */
export function scanStore(root) {
  const byLeg = new Map();
  if (!existsSync(root)) return byLeg;

  let runDirs;
  try {
    runDirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return byLeg;
  }

  for (const runDir of runDirs) {
    const runPath = join(root, runDir);
    let legDirs;
    try {
      legDirs = readdirSync(runPath, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      continue;
    }
    for (const legDirName of legDirs) {
      const file = join(runPath, legDirName, "leg.json");
      if (!existsSync(file)) continue;
      let rec;
      try {
        rec = JSON.parse(readFileSync(file, "utf8"));
      } catch {
        continue; // truncated by a kill — skip, don't crash the report
      }
      const legId = rec?.leg?.id;
      if (!legId || !rec.finishedAt) continue; // an unfinished leg is not a result
      const prev = byLeg.get(legId);
      if (!prev || String(rec.finishedAt) > String(prev.finishedAt)) {
        byLeg.set(legId, { ...rec, runId: rec.runId || runDir, path: join(runPath, legDirName) });
      }
    }
  }
  return byLeg;
}

/**
 * Why a recalled row can't be compared like-for-like with today's. Empty array
 * = a clean comparison.
 */
export function stalenessOf(stored, { engineBuild, appSha, fingerprint, book }) {
  const notes = [];
  const wasEngine = stored?.env?.engineBuild || "";
  if (engineBuild && wasEngine && wasEngine !== engineBuild) {
    notes.push(`engine ${wasEngine} → ${engineBuild}`);
  }
  if (fingerprint && stored?.fingerprint && stored.fingerprint !== fingerprint) {
    notes.push("leg config changed since");
  }
  // A result measured against a DIFFERENT book is the least comparable of all —
  // feature timings scale with chapter length before the model gets a say.
  const wasBook = stored?.env?.book || "";
  if (book && wasBook && wasBook !== book) notes.push(`book ${wasBook} → ${book}`);
  const wasSha = stored?.env?.appSha || "";
  if (appSha && wasSha && wasSha !== appSha) notes.push(`app ${wasSha} → ${appSha}`);
  return notes;
}

/**
 * The rows a band's summary renders: every leg the config declares, plus any
 * `baselineRef` legs borrowed from another band, each marked fresh / recalled /
 * never-run. This is the merge that lets one leg be re-run without losing the
 * table.
 */
export function mergeBandRows({ config, freshLegs = [], store, env }) {
  const freshById = new Map(freshLegs.map((l) => [l.leg.id, l]));
  const rows = [];

  const push = (leg, { borrowed = false } = {}) => {
    const fingerprint = legFingerprint(leg);
    const fresh = freshById.get(leg.id);
    if (fresh && !borrowed) {
      rows.push({ ...fresh, legId: leg.id, source: "fresh", stale: [], fingerprint });
      return;
    }
    const stored = store.get(leg.id);
    if (!stored) {
      rows.push({ leg, legId: leg.id, source: "missing", stale: [], fingerprint, runs: [] });
      return;
    }
    rows.push({
      ...stored,
      legId: leg.id,
      source: borrowed ? "borrowed" : "stored",
      fingerprint,
      stale: stalenessOf(stored, { engineBuild: env?.engineBuild, appSha: env?.appSha, fingerprint, book: env?.book }),
    });
  };

  for (const leg of config.legs) push(leg);

  // Cross-band baselines: the CPU band compares against the GPU baseline without
  // ever re-running it (the user's "I don't need to run the GPU baseline again").
  for (const refId of config.baselineRefs || []) {
    if (rows.some((r) => r.legId === refId)) continue;
    const stored = store.get(refId);
    rows.push(stored
      ? {
          ...stored, legId: refId, source: "borrowed",
          fingerprint: stored.fingerprint || "",
          stale: stalenessOf(stored, { engineBuild: env?.engineBuild, appSha: env?.appSha, book: env?.book }),
        }
      : { leg: { id: refId, model: "", label: "(baseline from another band)" }, legId: refId, source: "missing", stale: [], runs: [] });
  }
  return rows;
}

/**
 * Leg ids in `config` with no stored result WITH DATA — what `--missing` runs.
 *
 * A failed-load record does not count as "done": it has no feature runs and no
 * llama-bench rows, only the failure. Counting it would retire a leg on its own
 * transient failure — the concrete case is Bonsai before its Smart Add: run
 * `--missing` too early, the load fails in seconds, and a presence-only check
 * would then skip the leg forever AFTER the model was added. With the data
 * check, the next `--missing` simply tries it again (a permanently broken leg
 * re-fails fast and stays visible in the summary instead of vanishing).
 */
export function missingLegIds(config, store) {
  return config.legs
    .filter((l) => {
      const s = store.get(l.id);
      if (!s) return true;
      const hasData = (s.runs?.length || 0) > 0 || (s.llamaBench?.rows?.length || 0) > 0;
      return !hasData;
    })
    .map((l) => l.id);
}
