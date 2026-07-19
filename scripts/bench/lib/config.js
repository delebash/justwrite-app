// Bench config: load, validate, resolve defaults.
//
// A config is a list of LEGS. One leg = one (model × launch switches × request
// tunables) combination, run against the same book with the same features, so
// legs are comparable by construction. Everything a leg can vary lives here —
// nothing is hardcoded in the runner.
//
// Feature KEYS are validated at RUN time against `window.__jwBench.features()`,
// not against a list in this file: a mirrored list here would drift from the
// hook the moment a feature is added.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Run-level defaults. A leg may override any of the per-leg ones. */
const RUN_DEFAULTS = {
  band: "",                 // "gpu" | "cpu" — which standing question this config answers
  baselineRefs: [],         // leg ids from ANOTHER band to show as comparison rows, recalled
                            // from the store and NEVER re-run (the CPU band's GPU bar)
  book: "",                 // "" → whatever project is already active
  features: ["chat", "characterChat", "entitySweep", "critique", "writerAI.continue", "writerAI.rewrite"],
  repeats: 2,               // ±10% run-to-run noise is documented on this box; 1 sample is not a measurement
  timeoutMinutes: 10,
  sweepChapterCap: 3,
  ensureIndex: true,
  presetName: "Bench",
  featureArgs: {},
};

const LEG_DEFAULTS = {
  label: "",
  gguf: "",                 // "" → resolved from the HF cache by model id
  tunables: {},
  launch: {},
  llamaBench: null,         // null/false → skip the raw pp/tg matrix for this leg
  features: null,           // null → the run-level list
  repeats: null,
  timeoutMinutes: null,
  featureArgs: null,
};

const LLAMA_BENCH_DEFAULTS = { p: [512, 2048, 8192], n: 128, reps: 2 };

class ConfigError extends Error {}

function must(cond, msg) {
  if (!cond) throw new ConfigError(msg);
}

function isObj(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Read + validate a bench config. Throws ConfigError with a NAMED problem —
 * a bench that starts on a malformed config wastes an overnight run.
 */
export function loadConfig(path) {
  const abs = resolve(path);
  let raw;
  try {
    raw = readFileSync(abs, "utf8");
  } catch (e) {
    throw new ConfigError(`cannot read config ${abs}: ${e.message}`);
  }
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (e) {
    throw new ConfigError(`config ${abs} is not valid JSON: ${e.message}`);
  }
  return validateConfig(cfg, abs);
}

export function validateConfig(cfg, source = "<inline>") {
  must(isObj(cfg), `${source}: config must be a JSON object`);
  must(Array.isArray(cfg.legs) && cfg.legs.length > 0, `${source}: "legs" must be a non-empty array`);

  const run = { ...RUN_DEFAULTS, ...cfg };
  must(Array.isArray(run.features) && run.features.length > 0, `${source}: "features" must be a non-empty array`);
  must(Number(run.repeats) > 0, `${source}: "repeats" must be > 0`);
  must(Number(run.timeoutMinutes) > 0, `${source}: "timeoutMinutes" must be > 0`);
  must(isObj(run.featureArgs), `${source}: "featureArgs" must be an object keyed by feature`);
  must(Array.isArray(run.baselineRefs), `${source}: "baselineRefs" must be an array of leg ids`);

  const seen = new Set();
  const legs = cfg.legs.map((leg, i) => {
    const where = `${source}: legs[${i}]`;
    must(isObj(leg), `${where} must be an object`);
    must(typeof leg.id === "string" && leg.id.trim(), `${where} needs a non-empty "id"`);
    must(!seen.has(leg.id), `${where}: duplicate leg id ${JSON.stringify(leg.id)}`);
    seen.add(leg.id);
    must(typeof leg.model === "string" && leg.model.trim(), `${where} (${leg.id}) needs a "model" (a catalog model id)`);
    must(leg.tunables === undefined || isObj(leg.tunables), `${where} (${leg.id}): "tunables" must be an object`);
    must(leg.launch === undefined || isObj(leg.launch), `${where} (${leg.id}): "launch" must be an object`);
    must(leg.features === undefined || leg.features === null || Array.isArray(leg.features),
      `${where} (${leg.id}): "features" must be an array or null`);

    let llamaBench = leg.llamaBench === undefined ? LEG_DEFAULTS.llamaBench : leg.llamaBench;
    if (llamaBench) {
      must(isObj(llamaBench), `${where} (${leg.id}): "llamaBench" must be an object or false`);
      llamaBench = { ...LLAMA_BENCH_DEFAULTS, ...llamaBench };
      must(Array.isArray(llamaBench.p) && llamaBench.p.every((n) => Number(n) > 0),
        `${where} (${leg.id}): llamaBench.p must be an array of positive prompt sizes`);
      must(Number(llamaBench.n) > 0, `${where} (${leg.id}): llamaBench.n must be > 0`);
    }

    return {
      ...LEG_DEFAULTS,
      ...leg,
      llamaBench,
      tunables: { ...(leg.tunables || {}) },
      launch: { ...(leg.launch || {}) },
      // Effective per-leg values, resolved once here so the runner never
      // re-derives them (and never disagrees with the dry-run printout).
      effectiveFeatures: leg.features?.length ? leg.features : run.features,
      effectiveRepeats: Number(leg.repeats) > 0 ? Number(leg.repeats) : Number(run.repeats),
      effectiveTimeoutMs:
        (Number(leg.timeoutMinutes) > 0 ? Number(leg.timeoutMinutes) : Number(run.timeoutMinutes)) * 60000,
      effectiveFeatureArgs: { ...(run.featureArgs || {}), ...(leg.featureArgs || {}) },
    };
  });

  return {
    name: run.name || "bench",
    band: run.band || "",
    baselineRefs: [...run.baselineRefs],
    book: run.book,
    features: run.features,
    repeats: Number(run.repeats),
    timeoutMinutes: Number(run.timeoutMinutes),
    sweepChapterCap: Number(run.sweepChapterCap) > 0 ? Number(run.sweepChapterCap) : 3,
    ensureIndex: run.ensureIndex !== false,
    presetName: run.presetName || "Bench",
    featureArgs: run.featureArgs || {},
    legs,
    source,
  };
}

/** The per-run args a feature gets: run defaults + per-feature overrides. */
export function featureArgsFor(cfg, leg, featureKey) {
  const base = leg.effectiveFeatureArgs?.[featureKey] || {};
  const args = { ...base, timeoutMs: leg.effectiveTimeoutMs };
  if (featureKey === "entitySweep" && args.chapterCap === undefined) {
    args.chapterCap = cfg.sweepChapterCap;
  }
  return args;
}

export { ConfigError };
