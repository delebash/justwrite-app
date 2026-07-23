// Bench harness unit gate — the parts that can be proven WITHOUT models or a
// box: config validation, llama-bench output parsing, TTFT derivation, summary
// rendering, and the restore round-trip (against a fake client).
//
// Honest limit: an end-to-end bench run needs weights + an engine, so it is the
// user's on-box run, not this suite. What this suite protects is the layer that
// would silently corrupt an overnight run — a config typo accepted, a parser
// returning nothing, a restore that reports success without verifying.

import { describe, expect, it } from "vitest";

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ConfigError, featureArgsFor, validateConfig } from "./config.js";
import { deriveTtft, enginePaths, parseBenchOutput, resolveGguf } from "./llamaBench.js";
import { median, renderSummary, runId } from "./results.js";
import { applyAssignments, snapshotAssignments } from "./restore.js";
import { legFingerprint, mergeBandRows, missingLegIds, scanStore, stalenessOf } from "./store.js";

const MINIMAL = {
  name: "t",
  legs: [{ id: "a", model: "m1" }],
};

describe("config validation", () => {
  it("applies run + leg defaults", () => {
    const cfg = validateConfig(MINIMAL);
    expect(cfg.repeats).toBe(2);
    expect(cfg.legs).toHaveLength(1);
    expect(cfg.legs[0].effectiveRepeats).toBe(2);
    expect(cfg.legs[0].effectiveTimeoutMs).toBe(10 * 60000);
    expect(cfg.legs[0].effectiveFeatures).toEqual(cfg.features);
    // llamaBench is opt-in: a leg that didn't ask for it must not silently run it.
    expect(cfg.legs[0].llamaBench).toBeNull();
  });

  it("lets a leg override features, repeats and timeout", () => {
    const cfg = validateConfig({
      ...MINIMAL,
      legs: [{ id: "a", model: "m1", features: ["chat"], repeats: 5, timeoutMinutes: 1 }],
    });
    expect(cfg.legs[0].effectiveFeatures).toEqual(["chat"]);
    expect(cfg.legs[0].effectiveRepeats).toBe(5);
    expect(cfg.legs[0].effectiveTimeoutMs).toBe(60000);
  });

  it("fills llamaBench defaults when a leg opts in", () => {
    const cfg = validateConfig({ ...MINIMAL, legs: [{ id: "a", model: "m1", llamaBench: {} }] });
    expect(cfg.legs[0].llamaBench).toEqual({ p: [512, 2048, 8192], n: 128, reps: 2 });
  });

  // Each of these would otherwise be discovered hours into an overnight run.
  it.each([
    ["no legs", { name: "t", legs: [] }, /non-empty array/],
    ["leg without id", { name: "t", legs: [{ model: "m" }] }, /needs a non-empty "id"/],
    ["leg without model", { name: "t", legs: [{ id: "a" }] }, /needs a "model"/],
    ["duplicate leg ids", { name: "t", legs: [{ id: "a", model: "m" }, { id: "a", model: "m" }] }, /duplicate leg id/],
    ["empty features", { ...MINIMAL, features: [] }, /"features" must be a non-empty array/],
    ["zero repeats", { ...MINIMAL, repeats: 0 }, /"repeats" must be > 0/],
    ["bad llamaBench.p", { name: "t", legs: [{ id: "a", model: "m", llamaBench: { p: [0] } }] }, /positive prompt sizes/],
  ])("rejects %s with a named error", (_label, cfg, pattern) => {
    expect(() => validateConfig(cfg)).toThrow(ConfigError);
    expect(() => validateConfig(cfg)).toThrow(pattern);
  });

  it("merges run-level and per-leg featureArgs, leg winning, and injects the sweep cap", () => {
    const cfg = validateConfig({
      ...MINIMAL,
      sweepChapterCap: 7,
      featureArgs: { chat: { question: "run-level", k: 6 } },
      legs: [{ id: "a", model: "m1", featureArgs: { chat: { question: "leg-level" } } }],
    });
    const chat = featureArgsFor(cfg, cfg.legs[0], "chat");
    expect(chat.question).toBe("leg-level");
    expect(chat.timeoutMs).toBe(10 * 60000);
    const sweep = featureArgsFor(cfg, cfg.legs[0], "entitySweep");
    expect(sweep.chapterCap).toBe(7);
  });
});

describe("llama-bench output parsing", () => {
  const TABLE = `
| model                | size     |  params | backend | ngl | test   |            t/s |
| -------------------- | -------: | ------: | ------- | --: | ------ | -------------: |
| gemma 26B Q4_K       | 14.2 GiB |  26.00B | CUDA    |   0 | pp512  |  516.00 ± 5.10 |
| gemma 26B Q4_K       | 14.2 GiB |  26.00B | CUDA    |   0 | pp2048 |  480.25 ± 2.00 |
| gemma 26B Q4_K       | 14.2 GiB |  26.00B | CUDA    |   0 | tg128  |   27.60 ± 0.40 |
`;

  it("parses the markdown table every build prints", () => {
    const { rows, format } = parseBenchOutput(TABLE);
    expect(format).toBe("table");
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.test === "pp512")).toMatchObject({ tokensPerSec: 516, stddev: 5.1 });
    expect(rows.find((r) => r.test === "tg128").tokensPerSec).toBe(27.6);
  });

  it("parses -o json output", () => {
    const json = JSON.stringify([
      { model_filename: "m.gguf", n_prompt: 512, n_gen: 0, avg_ts: 500.5, stddev_ts: 1.2 },
      { model_filename: "m.gguf", n_prompt: 0, n_gen: 128, avg_ts: 30.1, stddev_ts: 0.3 },
    ]);
    const { rows, format } = parseBenchOutput(json);
    expect(format).toBe("json");
    expect(rows.map((r) => r.test)).toEqual(["pp512", "tg128"]);
    expect(rows[0].tokensPerSec).toBe(500.5);
  });

  it("reports unparsed rather than inventing rows", () => {
    expect(parseBenchOutput("error: unknown argument\n")).toEqual({ rows: [], format: "unparsed" });
    expect(parseBenchOutput("")).toEqual({ rows: [], format: "unparsed" });
  });

  it("derives TTFT from pp rows (prompt ÷ pp), ignoring tg", () => {
    const d = deriveTtft([
      { test: "pp2048", tokensPerSec: 1024 },
      { test: "pp8192", tokensPerSec: 512 },
      { test: "tg128", tokensPerSec: 20 },
    ]);
    expect(d).toEqual({ ttft2048Ms: 2000, ttft8192Ms: 16000 });
  });
});

describe("engine + model resolution", () => {
  /** A fake HF cache: <root>/models--<owner>--<repo>/snapshots/<sha>/<file>. */
  function fakeCache(repos) {
    const root = mkdtempSync(join(tmpdir(), "jwbench-"));
    for (const [dir, files] of Object.entries(repos)) {
      const snap = join(root, dir, "snapshots", "abc123");
      mkdirSync(snap, { recursive: true });
      for (const [name, size] of Object.entries(files)) {
        const path = join(snap, name);
        mkdirSync(join(path, ".."), { recursive: true });
        writeFileSync(path, Buffer.alloc(size));
      }
    }
    return root;
  }

  it("locates the cache root whether or not the exe sits in a GPU variant dir", () => {
    // …/llamacpp/<build>/<gpu>/llama-server.exe  and  …/llamacpp/<build>/llama-server.exe
    // (binary.py:174-176 falls back to the build dir) must both find <cacheRoot>.
    const withGpu = enginePaths({ serverExe: join("R:", "data", "ai-cache", "llamacpp", "b1", "cuda12", "llama-server.exe") });
    const flat = enginePaths({ serverExe: join("R:", "data", "ai-cache", "llamacpp", "b1", "llama-server.exe") });
    expect(withGpu.cacheRoot).toBe(join("R:", "data", "ai-cache"));
    expect(flat.cacheRoot).toBe(join("R:", "data", "ai-cache"));
  });

  it("reports the missing engine instead of pretending", () => {
    expect(enginePaths({}).ok).toBe(false);
    expect(enginePaths({}).reason).toMatch(/not installed/);
  });

  it("resolves a model id to its largest non-draft gguf", () => {
    const cache = fakeCache({
      "models--unsloth--gemma-4-26B-A4B-it-qat-GGUF": {
        "gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf": 4096,
        "MTP/mtp-gemma-4-26B-A4B-it-Q4_0.gguf": 64, // the draft companion, never the bench target
      },
    });
    const r = resolveGguf({ hfCache: cache, model: "gemma-4-26b-a4b-qat" });
    expect(r.ok).toBe(true);
    expect(r.path).toMatch(/UD-Q4_K_XL\.gguf$/);
    expect(r.path).not.toMatch(/mtp/i);
  });

  // THE REGRESSION: the token "model" used to match the `models--` prefix that
  // EVERY repo dir carries, so an unknown id silently resolved to some other
  // model's weights and got benched under the wrong name.
  it("does NOT match an unrelated repo just because the id contains 'model'", () => {
    const cache = fakeCache({ "models--Qwen--Qwen3-Embedding-4B-GGUF": { "Qwen3-Embedding-4B-Q4_K_M.gguf": 2048 } });
    const r = resolveGguf({ hfCache: cache, model: "nonexistent-model-xyz" });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no cached repo matches/);
  });

  // Isolates the PREFIX STRIP specifically: with a two-token id whose only
  // matching token is "model", the half-the-tokens floor alone would still let
  // this through — only stripping `models--` from the haystack rejects it.
  it("rejects an id whose sole matching token is the 'models--' prefix itself", () => {
    const cache = fakeCache({ "models--Qwen--Qwen3-Embedding-4B-GGUF": { "a.gguf": 2048 } });
    expect(resolveGguf({ hfCache: cache, model: "model-zzz" }).ok).toBe(false);
  });

  it("refuses an ambiguous match rather than picking one", () => {
    const cache = fakeCache({
      "models--a--gemma-4-26B-GGUF": { "x.gguf": 10 },
      "models--b--gemma-4-26B-GGUF": { "y.gguf": 10 },
    });
    const r = resolveGguf({ hfCache: cache, model: "gemma-4-26b" });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/matches several cached repos/);
  });

  it("narrows by quant when a repo ships several", () => {
    const cache = fakeCache({
      "models--x--gemma-4-12b-qat-GGUF": {
        "gemma-4-12b-qat-Q8_0.gguf": 9000,     // larger, but not the requested quant
        "gemma-4-12b-qat-UD-Q4_K_XL.gguf": 4000,
      },
    });
    expect(resolveGguf({ hfCache: cache, model: "gemma-4-12b-qat" }).path).toMatch(/Q8_0/);
    expect(resolveGguf({ hfCache: cache, model: "gemma-4-12b-qat", quant: "UD-Q4_K_XL" }).path).toMatch(/UD-Q4_K_XL/);
  });

  it("honours an explicit gguf path and fails loudly when it is missing", () => {
    const cache = fakeCache({ "models--x--solo-model-GGUF": { "solo-model.gguf": 10 } });
    const real = resolveGguf({ hfCache: cache, model: "solo-model" }).path;
    expect(real).toBeTruthy();
    // An explicit path wins even when the model id would resolve elsewhere.
    expect(resolveGguf({ hfCache: cache, model: "something-else", explicit: real })).toMatchObject({ ok: true, source: "config" });
    expect(resolveGguf({ hfCache: cache, model: "solo-model", explicit: join(cache, "nope.gguf") }).ok).toBe(false);
  });

  it("refuses a model id with nothing matchable in it", () => {
    const cache = fakeCache({ "models--x--y-GGUF": { "y.gguf": 10 } });
    expect(resolveGguf({ hfCache: cache, model: "y" })).toMatchObject({ ok: false });
  });
});

describe("results", () => {
  it("takes the median, not the mean, so one outlier cannot move a verdict", () => {
    expect(median([10, 12, 100])).toBe(12);
    expect(median([10, 20])).toBe(15);
    expect(median([])).toBeNull();
    expect(median([null, undefined, 5])).toBe(5);
  });

  it("makes a run id that is filesystem-safe", () => {
    const id = runId("2026-07-19T14:03:22.918Z", "cpu-band");
    expect(id).toBe("2026-07-19_14-03-22-cpu-band");
    expect(id).not.toMatch(/[:*?"<>|]/);
  });

  it("renders a summary with the engine matrix, feature medians and failures", () => {
    const cfg = validateConfig({
      ...MINIMAL,
      features: ["chat"],
      legs: [{ id: "a", model: "m1", llamaBench: {} }],
    });
    const md = renderSummary({
      id: "run1",
      config: cfg,
      env: { cpu: "Ryzen 7 5700X", totalRamMb: 32768, gpus: [{ name: "RTX 2070 SUPER", totalMb: 8192, driver: "560" }], engineBuild: "b10068", engineGpu: "cuda12", appSha: "abc1234" },
      startedAt: "s", finishedAt: "f",
      restore: { ok: true, changed: [], failed: [], mismatched: [] },
      legs: [{
        leg: cfg.legs[0],
        peaks: { peakVramMb: 7714, peakRssMb: 2048 },
        llamaBench: { rows: [{ test: "pp512", tokensPerSec: 516 }, { test: "tg128", tokensPerSec: 27.6 }], derived: { ttft2048Ms: 4000 } },
        runs: [
          { featureKey: "chat", ok: true, ttftMs: 1000, wallMs: 5000, outputChars: 900, flags: [], usage: { promptTokens: 800, completionTokens: 200 } },
          { featureKey: "chat", ok: true, ttftMs: 3000, wallMs: 7000, outputChars: 1100, flags: ["temperature-fixed-by-caller"], usage: { promptTokens: 800, completionTokens: 220 } },
          { featureKey: "chat", ok: false, wallMs: 600000, flags: ["timeout"], error: "aborted", outputChars: 0 },
        ],
      }],
    });
    expect(md).toContain("Raw engine (llama-bench)");
    expect(md).toContain("516.0");
    expect(md).toContain("7714");
    // Median of the two OK runs' TTFT (1s, 3s) = 2.0s — the failed run must not count.
    expect(md).toContain("2.0s");
    expect(md).toContain("2/3");
    expect(md).toContain("## Failures");
    expect(md).toContain("temperature-fixed-by-caller");
    expect(md).toContain("assignments restored + verified");
  });

  it("names legs whose model never loaded instead of hiding them", () => {
    const cfg = validateConfig(MINIMAL);
    const md = renderSummary({
      id: "r", config: cfg, env: {}, startedAt: "s", finishedAt: "f",
      legs: [{ leg: cfg.legs[0], load: { ok: false, error: "OOM at load" }, runs: [] }],
    });
    expect(md).toContain("Legs whose model never loaded");
    expect(md).toContain("OOM at load");
  });
});

describe("the results store (cross-run comparison)", () => {
  /** A fake results root: { runDir: { legDirName: legRecord } }. */
  function fakeStore(runs) {
    const root = mkdtempSync(join(tmpdir(), "jwstore-"));
    for (const [runDir, legs] of Object.entries(runs)) {
      for (const [legDir, record] of Object.entries(legs)) {
        const dir = join(root, runDir, legDir);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "leg.json"), JSON.stringify(record));
      }
    }
    return root;
  }
  const rec = (id, finishedAt, extra = {}) => ({
    leg: { id, model: `model-${id}` }, finishedAt, runs: [], ...extra,
  });

  it("keeps the NEWEST result per leg id across runs", () => {
    const root = fakeStore({
      "2026-07-01_run": { "01-a": rec("leg-a", "2026-07-01T10:00:00Z"), "02-b": rec("leg-b", "2026-07-01T11:00:00Z") },
      "2026-07-19_run": { "01-a": rec("leg-a", "2026-07-19T10:00:00Z") },
    });
    const store = scanStore(root);
    expect(store.size).toBe(2);
    expect(store.get("leg-a").finishedAt).toBe("2026-07-19T10:00:00Z");
    expect(store.get("leg-b").finishedAt).toBe("2026-07-01T11:00:00Z"); // untouched by the newer run
  });

  it("ignores unfinished legs and survives a truncated leg.json", () => {
    const root = fakeStore({
      r1: { "01-a": rec("leg-a", "2026-07-19T10:00:00Z"), "02-b": { leg: { id: "leg-b" } } }, // no finishedAt
    });
    writeFileSync(join(root, "r1", "02-b", "leg.json"), "{ this is not json");
    const store = scanStore(root);
    expect([...store.keys()]).toEqual(["leg-a"]);
  });

  it("returns an empty store for a missing root rather than throwing", () => {
    expect(scanStore(join(tmpdir(), "definitely-not-there-jw")).size).toBe(0);
  });

  // THE headline behaviour: run one leg, still get the whole band's table.
  it("merges a fresh leg with recalled ones and marks each row's provenance", () => {
    const cfg = validateConfig({
      name: "cpu", band: "cpu", baselineRefs: ["gpu-base"],
      legs: [{ id: "cpu-a", model: "m-a" }, { id: "cpu-b", model: "m-b" }, { id: "cpu-new", model: "m-new" }],
    });
    const store = scanStore(fakeStore({
      old: {
        "01-a": rec("cpu-a", "2026-07-10T00:00:00Z", { env: { engineBuild: "b9993" }, fingerprint: legFingerprint(cfg.legs[0]) }),
        "02-base": rec("gpu-base", "2026-07-09T00:00:00Z", { env: { engineBuild: "b9993" } }),
      },
    }));
    const rows = mergeBandRows({
      config: cfg,
      freshLegs: [{ leg: cfg.legs[1], runs: [] }],   // only cpu-b measured this time
      store,
      env: { engineBuild: "b9993" },
    });
    const byId = Object.fromEntries(rows.map((r) => [r.legId, r]));
    expect(byId["cpu-b"].source).toBe("fresh");
    expect(byId["cpu-a"].source).toBe("stored");
    expect(byId["cpu-a"].stale).toEqual([]);          // same engine, same config → clean comparison
    expect(byId["cpu-new"].source).toBe("missing");   // declared but never measured
    expect(byId["gpu-base"].source).toBe("borrowed"); // cross-band baseline, not re-run
  });

  it("flags a recalled row when the engine build or the leg config has changed", () => {
    const stored = { env: { engineBuild: "b9993", appSha: "aaa" } };
    expect(stalenessOf(stored, { engineBuild: "b9993", appSha: "aaa" })).toEqual([]);
    expect(stalenessOf(stored, { engineBuild: "b10068", appSha: "aaa" })).toEqual(["engine b9993 → b10068"]);
    expect(stalenessOf({ ...stored, fingerprint: "x" }, { engineBuild: "b9993", appSha: "aaa", fingerprint: "y" }))
      .toEqual(["leg config changed since"]);
  });

  it("fingerprints the things that change the numbers, and ignores the things that don't", () => {
    const base = { id: "a", model: "m", tunables: { temperature: 0.7 }, launch: { threads: 8 } };
    expect(legFingerprint(base)).toBe(legFingerprint({ ...base, id: "renamed", label: "new label" }));
    expect(legFingerprint(base)).not.toBe(legFingerprint({ ...base, launch: { threads: 12 } }));
    expect(legFingerprint(base)).not.toBe(legFingerprint({ ...base, tunables: { temperature: 0.9 } }));
    // key ORDER must not change the fingerprint
    expect(legFingerprint({ model: "m", id: "a", launch: { threads: 8 }, tunables: { temperature: 0.7 } }))
      .toBe(legFingerprint(base));
    // repeats changes the SAMPLE COUNT, not the measurement — bumping it must not
    // flag every stored row as config-drift.
    expect(legFingerprint({ ...base, repeats: 5, effectiveRepeats: 5 })).toBe(legFingerprint(base));
  });

  it("flags a recalled row measured against a DIFFERENT book", () => {
    const stored = { env: { engineBuild: "b9993", book: "prj_sample_ninth_facet" } };
    expect(stalenessOf(stored, { engineBuild: "b9993", book: "prj_sample_ninth_facet" })).toEqual([]);
    expect(stalenessOf(stored, { engineBuild: "b9993", book: "prj_other" }))
      .toEqual(["book prj_sample_ninth_facet → prj_other"]);
    // Book unknown on either side → no false flag (a report with book:"" must not mark everything stale).
    expect(stalenessOf(stored, { engineBuild: "b9993", book: "" })).toEqual([]);
    expect(stalenessOf({ env: { engineBuild: "b9993" } }, { engineBuild: "b9993", book: "prj_x" })).toEqual([]);
  });

  it("--missing re-offers a leg whose only stored record is a failed load (the Bonsai trap)", () => {
    const cfg = validateConfig({ name: "c", legs: [{ id: "a", model: "m" }, { id: "b", model: "m" }, { id: "c", model: "m" }] });
    const store = scanStore(fakeStore({
      r: {
        "01-a": rec("a", "2026-07-19T00:00:00Z", { runs: [{ featureKey: "chat", ok: true }] }), // real data → done
        "02-b": rec("b", "2026-07-19T00:00:00Z", { load: { ok: false, error: "unknown model" }, runs: [] }), // failure only → still missing
      },
    }));
    expect(missingLegIds(cfg, store)).toEqual(["b", "c"]);
  });

  it("notes per-feature gaps on recalled legs when the band gained a feature", () => {
    const cfg = validateConfig({ name: "cpu", band: "cpu", features: ["chat", "beatSheet"], legs: [{ id: "cpu-a", model: "m" }] });
    const md = renderSummary({
      id: "r", config: cfg, env: {}, startedAt: "s", finishedAt: "f",
      legs: [{
        legId: "cpu-a", leg: cfg.legs[0], source: "stored", finishedAt: "2026-07-10T00:00:00Z", stale: [],
        runs: [{ featureKey: "chat", ok: true, ttftMs: 1, wallMs: 2, outputChars: 3, flags: [] }],
      }],
    });
    expect(md).toContain("missing data for current features");
    expect(md).toContain("no data for: beatSheet");
    expect(md).not.toContain("no data for: chat");
  });

  it("names exactly the legs with no stored DATA (--missing)", () => {
    const cfg = validateConfig({ name: "c", legs: [{ id: "a", model: "m" }, { id: "b", model: "m" }] });
    const store = scanStore(fakeStore({
      r: { "01-a": rec("a", "2026-07-19T00:00:00Z", { llamaBench: { rows: [{ test: "tg128", tokensPerSec: 5 }] } }) },
    }));
    expect(missingLegIds(cfg, store)).toEqual(["b"]);
  });

  it("renders recalled rows with their date and a staleness marker", () => {
    const cfg = validateConfig({ name: "cpu", band: "cpu", features: ["chat"], legs: [{ id: "cpu-a", model: "m-a", llamaBench: {} }] });
    const md = renderSummary({
      id: "r", config: cfg, env: { engineBuild: "b10068" }, startedAt: "s", finishedAt: "f",
      legs: [{
        legId: "cpu-a", leg: cfg.legs[0], source: "stored", finishedAt: "2026-07-10T00:00:00Z",
        stale: ["engine b9993 → b10068"],
        llamaBench: { rows: [{ test: "tg128", tokensPerSec: 5.2 }], derived: {} },
        runs: [{ featureKey: "chat", ok: true, ttftMs: 9000, wallMs: 60000, outputChars: 700, flags: [] }],
      }],
    });
    expect(md).toContain("stored 2026-07-10");
    expect(md).toContain("⚠ engine b9993 → b10068");
    expect(md).toContain("0 measured now");
  });
});

describe("restore", () => {
  /** Minimal fake of the assignments API. */
  function fakeClient(initial) {
    const state = { defaultPresetId: "d", features: { ...initial } };
    const calls = [];
    return {
      state, calls,
      getAssignments: async () => ({ defaultPresetId: state.defaultPresetId, features: { ...state.features } }),
      setFeaturePreset: async (featureKey, presetId) => {
        calls.push([featureKey, presetId]);
        if (presetId) state.features[featureKey] = presetId;
        else delete state.features[featureKey];
      },
    };
  }

  it("puts every re-pointed feature back and verifies by re-reading", async () => {
    const client = fakeClient({ chat: "p_chat", critique: "p_judge" });
    const snap = await snapshotAssignments(client);

    // The run re-points both features at the Bench preset.
    await client.setFeaturePreset("chat", "bench");
    await client.setFeaturePreset("critique", "bench");
    client.calls.length = 0;

    const result = await applyAssignments(client, snap);
    expect(result.ok).toBe(true);
    expect(client.state.features).toEqual({ chat: "p_chat", critique: "p_judge" });
    expect(result.changed).toHaveLength(2);
  });

  it("is a no-op when nothing drifted", async () => {
    const client = fakeClient({ chat: "p_chat" });
    const snap = await snapshotAssignments(client);
    const result = await applyAssignments(client, snap);
    expect(result.ok).toBe(true);
    expect(client.calls).toHaveLength(0);
  });

  it("clears a feature that had NO assignment before the run", async () => {
    const client = fakeClient({});
    const snap = await snapshotAssignments(client);
    await client.setFeaturePreset("chat", "bench");
    const result = await applyAssignments(client, snap);
    expect(result.ok).toBe(true);
    expect(client.state.features.chat).toBeUndefined();
  });

  it("reports NOT-ok when a write silently fails to stick (no false 'restored')", async () => {
    const client = fakeClient({ chat: "p_chat" });
    const snap = await snapshotAssignments(client);
    await client.setFeaturePreset("chat", "bench");
    // A server that accepts the write but does not apply it.
    client.setFeaturePreset = async () => {};
    const result = await applyAssignments(client, snap);
    expect(result.ok).toBe(false);
    expect(result.mismatched).toEqual([{ featureKey: "chat", expected: "p_chat", actual: "bench" }]);
  });
});
