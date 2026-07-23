#!/usr/bin/env node
// The LLM bench runner.
//
//   npm run bench -- --config bench/harness/configs/cpu-band.json
//   npm run bench -- --config <cfg> --dry             # print the plan, touch nothing
//   npm run bench -- --restore bench/results/<run-id> # crash recovery
//
// Always HEADLESS (2026-07-20, the user's ruling): the bench drives services
// through the bench hook, so a window has nothing to show — progress is watched
// in this terminal. The old --headed/--tauri modes are deleted (git history).
//
// WHAT IT DOES, per leg: point the features under test at the Bench preset
// (carrying that leg's request tunables), load the leg's model with that leg's
// EPHEMERAL launch switches, run llama-bench for the raw pp/tg matrix, then run
// each feature through the real app against the tutorial book, capturing every
// output. Assignments are snapshotted first and restored at the end.
//
// It does not score anything. Accuracy is judged by reading the captures.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus, totalmem } from "node:os";
import { execFileSync } from "node:child_process";

import { ConfigError, featureArgsFor, loadConfig } from "./lib/config.js";
import { callHook, openDriver } from "./lib/drive.js";
import { engineMissingError, enginePaths, resolveGguf, runLlamaBench } from "./lib/llamaBench.js";
import { ensureDir, legDir, renderSummary, runId, writeJson } from "./lib/results.js";
import { applyAssignments, readRestoreFile, snapshotAssignments, writeRestoreFile } from "./lib/restore.js";
import { gpuInfo, startSampler, waitEngineQuiet } from "./lib/sampler.js";
import { makeClient } from "./lib/server.js";
import { legFingerprint, mergeBandRows, missingLegIds, scanStore } from "./lib/store.js";
import { writeFileSync } from "node:fs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// ── args ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {
    config: "", dry: false, restore: "", legs: null,
    // Machine-organized results (user ruling 2026-07-23): the harness always runs
    // on THIS box, so its runs file under the desktop machine folder's bench/;
    // kit returns from other machines go under <machine>/kit/ (bench/results/README.md).
    resume: "", outDir: join(REPO_ROOT, "bench", "results", "desktop-rtx-2070s", "bench"), autostart: false,
    report: false, missing: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--config" || a === "-c") out.config = argv[++i];
    else if (a === "--headless") { /* the only mode — accepted for old muscle memory */ }
    else if (a === "--headed" || a === "--tauri") {
      throw new ConfigError(`${a} was removed — the bench always runs headless; watch progress in this terminal, and open your app yourself if you want it open (its server gets used either way).`);
    }
    else if (a === "--dry" || a === "--dry-run") out.dry = true;
    else if (a === "--restore") out.restore = argv[++i];
    else if (a === "--resume") out.resume = argv[++i];
    else if (a === "--legs") out.legs = String(argv[++i]).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--out") out.outDir = resolve(argv[++i]);
    else if (a === "--autostart") out.autostart = true;
    else if (a === "--report") out.report = true;
    else if (a === "--missing") out.missing = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a.startsWith("-")) throw new ConfigError(`unknown flag ${a}`);
  }
  return out;
}

const log = (msg) => console.log(`${new Date().toISOString().slice(11, 19)}  ${msg}`);

function appSha() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: REPO_ROOT }).toString().trim();
  } catch {
    return "";
  }
}

// ── the load body for a leg ─────────────────────────────────────────────────
// Named Plane-1 fields map 1:1 onto LoadRequest (runner/schema.py:221-265);
// anything else the config names rides the transient `switches` map, which the
// server converts with the same helper it uses for stored switches. Neither is
// persisted — that is why the bench never writes a tune row.
function loadBody(leg) {
  const L = leg.launch || {};
  const body = { modelId: leg.model };
  const named = {
    nGpuLayers: "nGpuLayers", nCpuMoe: "nCpuMoe", ctxLen: "ctxLen",
    cacheTypeK: "cacheTypeK", cacheTypeV: "cacheTypeV", flashAttn: "flashAttn",
    noMmap: "noMmap", mlock: "mlock", noKvOffload: "noKvOffload",
    batchSize: "batchSize", ubatchSize: "ubatchSize", threads: "threads",
    threadsBatch: "threadsBatch", parallel: "parallel", contBatching: "contBatching",
    contextShift: "contextShift", cacheReuse: "cacheReuse", specType: "specType",
    specNMax: "specNMax", modelDraft: "modelDraft", reasoningBudget: "reasoningBudget",
  };
  for (const [key, wire] of Object.entries(named)) {
    if (L[key] !== undefined && L[key] !== null) body[wire] = L[key];
  }
  if (L.extraFlags?.length) body.extraFlags = L.extraFlags;
  if (L.switches && Object.keys(L.switches).length) {
    body.switches = Object.fromEntries(Object.entries(L.switches).map(([k, v]) => [k, String(v)]));
  }
  return body;
}

function printDryRun(cfg, args) {
  console.log(`\nBENCH DRY RUN — ${cfg.name}  (${cfg.source})`);
  console.log(`  band: ${cfg.band || "(none)"}   book: ${cfg.book || "(active project)"}   preset: ${cfg.presetName}`);
  if (cfg.baselineRefs.length) console.log(`  baselineRefs: ${cfg.baselineRefs.join(", ")} — recalled from the store, never run here`);
  console.log(`  ensureIndex: ${cfg.ensureIndex}   sweep cap: ${cfg.sweepChapterCap} chapters`);
  console.log(`  results → ${args.outDir}/<run-id>/`);
  const legs = args.legs ? cfg.legs.filter((l) => args.legs.includes(l.id)) : cfg.legs;
  console.log(`\n  ${legs.length} leg(s):`);
  for (const leg of legs) {
    console.log(`\n  ── ${leg.id}${leg.label ? ` — ${leg.label}` : ""}`);
    console.log(`     model      ${leg.model}`);
    console.log(`     tunables   ${JSON.stringify(leg.tunables)}`);
    console.log(`     load body  ${JSON.stringify(loadBody(leg))}`);
    console.log(`     llamaBench ${leg.llamaBench ? `p=${leg.llamaBench.p.join(",")} n=${leg.llamaBench.n} reps=${leg.llamaBench.reps}` : "skipped"}`);
    console.log(`     features   ${leg.effectiveFeatures.join(", ")} × ${leg.effectiveRepeats}`);
    console.log(`     timeout    ${leg.effectiveTimeoutMs / 60000} min per feature run`);
  }
  console.log("\n  WRITES: the Bench preset row · the assignment refs for the features above (snapshotted + restored) · model downloads · the results folder.");
  console.log("  NOT touched: tune rows, switch bundles, the DB (no reset), the engine dir.\n");
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || (!args.config && !args.restore)) {
    console.log(`
JustWrite LLM bench — run models × switches through the real app, capture everything.

  --config <path>   bench config — a BAND (bench/harness/configs/gpu.json | cpu.json)
  --legs a,b        measure only these leg ids (the rest are recalled from the store)
  --missing         measure only legs that have no stored result yet
  --report          print the band's table from stored results — runs NOTHING
  --dry             print the plan and exit — touches nothing
  --autostart       start server/vite if they are not already up (the server on YOUR app's data root)

Always headless — the bench drives services through the app's bench hook, so there
is nothing to watch in a window; progress prints here. Simplest setup: have your
app running (npm run dev) and the bench connects to its server + engine.
  --out <dir>       results root (default: bench/results/desktop-rtx-2070s/bench/)
  --restore <dir>   re-apply the assignment snapshot from a previous run and exit

Results are keyed by LEG ID and accumulate across runs, so measuring one new leg
still prints the whole band — earlier legs are recalled and labelled with their
date, and flagged if the engine build or the leg's config has changed since.
`);
    return 0;
  }

  const client = makeClient();

  // Crash recovery: no config needed, just put the assignments back.
  if (args.restore) {
    const path = existsSync(args.restore) && args.restore.endsWith(".json")
      ? args.restore
      : join(args.restore, "restore.json");
    log(`restoring assignments from ${path}`);
    const result = await applyAssignments(client, readRestoreFile(path), { onLog: log });
    console.log(result.ok
      ? `\nRESTORE OK — ${result.changed.length} assignment(s) put back, verified by re-read.`
      : `\nRESTORE INCOMPLETE — failed=${JSON.stringify(result.failed)} mismatched=${JSON.stringify(result.mismatched)}`);
    return result.ok ? 0 : 1;
  }

  const cfg = loadConfig(args.config);
  if (args.dry) {
    printDryRun(cfg, args);
    return 0;
  }

  // --report: regenerate this band's table from stored results. Runs NOTHING,
  // needs no server, and is how you re-read a band after pruning result folders.
  if (args.report) {
    const store = scanStore(args.outDir);
    // Best-effort env so staleness flags work in a report too: without today's
    // engine build a recalled row would read as clean across an engine upgrade.
    // The server being down degrades to "unknown", stated — never a crash.
    const reportEnv = { book: cfg.book || "" };
    let envNote = "";
    try {
      const es = await makeClient().engineStatus();
      reportEnv.engineBuild = es?.build || "";
    } catch {
      envNote = " Engine-drift flags unavailable (server not reachable) — recalled rows may span engine builds without a ⚠.";
    }
    const rows = mergeBandRows({ config: cfg, freshLegs: [], store, env: reportEnv });
    const summary = renderSummary({
      id: `report-${cfg.name}`, config: cfg, env: reportEnv, legs: rows,
      startedAt: "", finishedAt: "", restore: null, reportOnly: true,
    });
    console.log(`\n${summary}`);
    const known = rows.filter((r) => r.source !== "missing").length;
    console.log(`\n(report only — nothing was run. ${known}/${rows.length} leg(s) have a stored result in ${args.outDir}.${envNote})`);
    return 0;
  }

  const store = scanStore(args.outDir);
  let legs = args.legs ? cfg.legs.filter((l) => args.legs.includes(l.id)) : cfg.legs;
  if (args.missing) {
    const ids = new Set(missingLegIds(cfg, store));
    legs = legs.filter((l) => ids.has(l.id));
    if (!legs.length) {
      console.log(`\nNothing to do — every leg in ${cfg.name} already has a stored result. Use --report to see them, or --legs <id> to re-measure one.`);
      return 0;
    }
    log(`--missing → ${legs.length} leg(s) with no stored result: ${legs.map((l) => l.id).join(", ")}`);
  }
  if (!legs.length) throw new ConfigError(`--legs matched nothing (have: ${cfg.legs.map((l) => l.id).join(", ")})`);

  const startedAt = new Date().toISOString();
  const id = args.resume || runId(startedAt, cfg.name);
  const root = ensureDir(join(args.outDir, id));
  log(`run ${id} → ${root}`);
  writeJson(join(root, "config.json"), cfg);

  // The env record, the engine gate and the assignment snapshot all need the
  // server ANSWERING — which, with --autostart, only happens once the driver
  // is up. So they moved INSIDE the try, after openDriver. (The old order probed the engine
  // and snapshotted before autostart — a cold `--autostart` run crashed on the
  // snapshot, and the engine probe mis-read "server not up yet" as "engine not
  // installed".)
  let env = null;       // used by the summary block after the try
  let snapshot = null;  // restoreNow no-ops until the snapshot exists

  let restoreResult = null;
  const restoreNow = async (why) => {
    if (!snapshot) return null; // nothing was written — nothing to put back
    if (restoreResult) return restoreResult;
    log(`restoring assignments (${why})`);
    restoreResult = await applyAssignments(client, snapshot, { onLog: log });
    if (!restoreResult.ok) log(`WARNING: restore incomplete — run: npm run bench -- --restore ${root}`);
    return restoreResult;
  };

  // Ctrl-C must not leave the user's routing pointed at the Bench preset.
  let interrupted = false;
  const onSignal = () => {
    if (interrupted) process.exit(130);
    interrupted = true;
    log("interrupted — restoring before exit (press Ctrl-C again to force)");
    restoreNow("interrupt").finally(() => process.exit(130));
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const collected = [];
  let driver = null;

  try {
    driver = await openDriver({
      autostart: args.autostart, repoRoot: REPO_ROOT, onLog: log,
    });
    log(`driver ready — bench hook v${driver.hookVersion}`);

    // ── environment record + THE ENGINE GATE ──────────────────────────────────
    const engine = await client.engineStatus().catch((e) => ({ error: String(e.message || e) }));
    const paths = enginePaths(engine); // the legs loop below shares this try-block scope
    env = {
      capturedAt: startedAt,
      cpu: cpus()[0]?.model || "",
      cores: cpus().length,
      totalRamMb: Math.round(totalmem() / 1048576),
      platform: process.platform,
      gpus: await gpuInfo(),
      engineBuild: engine?.build || "",
      engineGpu: engine?.gpu || "",
      serverExe: engine?.serverExe || "",
      benchExe: paths.ok ? paths.benchExe : "",
      benchExeProblem: paths.ok ? "" : paths.reason,
      hfCache: paths.hfCache || "",
      appSha: appSha(),
      node: process.version,
      server: client.base,
    };
    writeJson(join(root, "env.json"), env);
    // No engine on this server = NO local leg can run (loads need it to spawn) —
    // fail loudly and name the fix instead of limping (user ruling, 2026-07-20).
    // A PARTIAL problem (engine present, llama-bench exe missing) only skips the
    // raw-matrix legs, so that stays a warning.
    if (!engine?.serverExe) {
      throw new ConfigError(engineMissingError({ server: client.base, dataRoot: driver.dataRoot }));
    }
    if (!paths.ok) log(`WARNING: ${paths.reason} — llama-bench legs will be skipped`);

    // ── snapshot BEFORE the first write ───────────────────────────────────────
    snapshot = await snapshotAssignments(client);
    const restorePath = join(root, "restore.json");
    writeRestoreFile(restorePath, snapshot);
    log(`assignments snapshotted → ${restorePath}`);

    const hookFeatures = await callHook(driver.page, "features");
    const unknown = [...new Set(legs.flatMap((l) => l.effectiveFeatures))].filter((f) => !hookFeatures.includes(f));
    if (unknown.length) {
      throw new ConfigError(`config names features the app does not expose: ${unknown.join(", ")} (available: ${hookFeatures.join(", ")})`);
    }

    // Mirror the feature check for MODEL ids (defect A, 2026-07-22): a leg naming a
    // model the catalog doesn't have — an un-Smart-Added id or a typo — must fail in
    // SECONDS naming it, not a 30-min dead wait on a load the runner rejects in 114 ms.
    // (baselineRefs are NOT validated here: they are leg ids from ANOTHER band recalled
    // from the store, never loaded — so they carry no catalog model to check.)
    const catalog = await client.models().catch((e) => ({ error: String(e.message || e) }));
    if (catalog?.error) {
      throw new ConfigError(`could not fetch the model catalog to validate leg models: ${catalog.error}`);
    }
    const knownModels = new Set((catalog.models || []).map((m) => m.id));
    const unknownModels = [...new Set(legs.map((l) => l.model))].filter((m) => !knownModels.has(m));
    if (unknownModels.length) {
      throw new ConfigError(
        `config names model id(s) not in the catalog: ${unknownModels.join(", ")} — ` +
        `Smart-Add them in the app or fix the id. Known ids: ${[...knownModels].sort().join(", ")}`,
      );
    }

    if (cfg.book) {
      log(`activating book ${cfg.book}`);
      await callHook(driver.page, "activate", cfg.book);
    }
    const info = await callHook(driver.page, "info");
    writeJson(join(root, "book.json"), info);
    log(`book: ${info.title || "(untitled)"} — ${info.chapters.length} chapters, ${info.characters.length} characters`);
    // The ACTUAL project measured (cfg.book may be "" = whatever was active).
    // Stamped into env + every leg record so a later run against a different
    // book flags the comparison instead of silently mixing manuscripts.
    env.book = info.projectId || cfg.book || "";
    writeJson(join(root, "env.json"), env);

    if (cfg.ensureIndex) {
      log("ensuring the RAG index exists (chat falls back to bible-only without one)");
      const idx = await callHook(driver.page, "ensureIndex", {});
      log(`index: ${idx.exists ? `${idx.entryCount} entries (${idx.model})` : "MISSING"}${idx.built ? ` — built in ${Math.round(idx.buildMs / 1000)}s` : ""}`);
    }

    // ── legs ────────────────────────────────────────────────────────────────
    for (const [i, leg] of legs.entries()) {
      if (interrupted) break;
      const dir = legDir(root, cfg.legs.indexOf(leg), leg.id);
      log(`\n══ leg ${i + 1}/${legs.length}: ${leg.id} (${leg.model})`);
      // `fingerprint` + `env` are what let a LATER run tell whether this stored
      // result is still comparable (same engine build, same leg config) — see
      // store.stalenessOf. Without them a recalled row would look like a
      // like-for-like measurement when it isn't.
      const legRecord = {
        leg, runId: id, band: cfg.band,
        fingerprint: legFingerprint(leg),
        env: { engineBuild: env.engineBuild, engineGpu: env.engineGpu, appSha: env.appSha, cpu: env.cpu, gpus: env.gpus, book: env.book || "" },
        startedAt: new Date().toISOString(), runs: [],
      };

      // 1. the Bench preset carries this leg's request tunables
      const preset = await client.ensureBenchPreset(cfg.presetName, { ...leg.tunables, model: leg.model });
      legRecord.preset = preset;
      log(`preset "${preset.name}" (${preset.id}) → model=${preset.model} temp=${preset.temperature ?? "—"} think=${preset.think}`);

      // 2. point this leg's features at it (feature key == action id)
      for (const featureKey of leg.effectiveFeatures) {
        await client.setFeaturePreset(featureKey, preset.id);
      }
      log(`routed ${leg.effectiveFeatures.length} feature(s) → ${preset.name}`);

      const sampler = startSampler({});

      // 3. LOAD FIRST — and deliberately so. `POST /load` is "Download (if
      //    needed) + spawn" (api.py:175), so on a model's first-ever leg this is
      //    what fetches the weights. Running llama-bench before it would find no
      //    GGUF on disk and silently skip the whole raw matrix for exactly the
      //    legs a new model most needs it. llama-bench therefore runs AFTER the
      //    feature runs, once the model is stopped again (step 7).
      const onDisk = paths.ok
        ? resolveGguf({ hfCache: paths.hfCache, model: leg.model, explicit: leg.gguf, quant: leg.quant || "" })
        : { ok: false, reason: paths.reason };
      // A first download is tens of GB; the normal load ceiling would call a
      // perfectly healthy fetch a failure.
      const loadTimeoutMs = onDisk.ok ? 1800000 : 14400000;
      if (!onDisk.ok) log(`weights not in the cache yet (${onDisk.reason}) — the load will download them; allowing ${loadTimeoutMs / 3600000}h`);

      const body = loadBody(leg);
      log(`loading ${leg.model}: ${JSON.stringify(body)}`);
      try {
        await client.load(body);
        legRecord.load = await client.waitLoaded(leg.model, { timeoutMs: loadTimeoutMs });
      } catch (e) {
        legRecord.load = { ok: false, error: String(e.message || e) };
      }
      if (!legRecord.load.ok) {
        log(`LOAD FAILED: ${legRecord.load.error} — recording and moving to the next leg`);
        legRecord.peaks = await sampler.stop();
        legRecord.finishedAt = new Date().toISOString();
        writeJson(join(dir, "leg.json"), legRecord);
        collected.push(legRecord);
        continue;
      }
      log(`loaded in ${Math.round(legRecord.load.waitedMs / 1000)}s`);

      // 5. the server's own probe + the route it says a run will take
      legRecord.measure = await client.measure({ maxTokens: 192, modelId: leg.model }).catch((e) => ({ ok: false, error: String(e.message || e) }));
      if (legRecord.measure?.ok) log(`measure: ${legRecord.measure.tokensPerSec} tok/s decode`);
      legRecord.routes = {};
      for (const featureKey of leg.effectiveFeatures) {
        legRecord.routes[featureKey] = await client
          .resolvedRoute(featureKey, featureKey)
          .catch((e) => ({ error: String(e.message || e) }));
      }

      // 6. the feature runs — the app's own path, against the tutorial book
      for (const featureKey of leg.effectiveFeatures) {
        for (let n = 1; n <= leg.effectiveRepeats; n++) {
          if (interrupted) break;
          const fargs = featureArgsFor(cfg, leg, featureKey);
          log(`  ${featureKey} (${n}/${leg.effectiveRepeats}) …`);
          const result = await callHook(driver.page, "run", featureKey, fargs);
          const capture = {
            runId: id, leg: leg.id, model: leg.model, attempt: n,
            args: fargs, preset, route: legRecord.routes[featureKey], ...result,
          };
          writeJson(join(dir, `${featureKey.replace(/[^\w.-]/g, "_")}-${n}.json`), capture);
          // leg.json keeps the METRICS; the model's text lives once, in the
          // capture file written just above. Storing it twice would bloat every
          // leg record the store has to scan, for no reader's benefit.
          const { output: _text, ...metrics } = result;
          legRecord.runs.push(metrics);
          log(result.ok
            ? `    ok — ttft=${result.ttftMs ?? "—"}ms wall=${Math.round(result.wallMs / 1000)}s chars=${result.outputChars}${result.flags.length ? ` flags=${result.flags.join(",")}` : ""}`
            : `    FAILED (${result.flags.join(",")}) — ${result.error}`);
        }
      }

      // 7. llama-bench LAST, with nothing resident. The weights are guaranteed on
      //    disk by now (the load fetched them if needed). A full-teardown stop
      //    returns BEFORE the child exits (it clears the ledger and returns —
      //    lifecycle.py:945-958), so wait for the process to actually be gone;
      //    otherwise llama-bench competes with a dying llama-server for the very
      //    VRAM/RAM it is measuring.
      if (leg.llamaBench) {
        await client.stop().catch(() => {});
        const quiet = await waitEngineQuiet({});
        legRecord.engineQuiet = quiet;
        if (quiet.quiet === false) {
          log(`WARNING: an engine process was still resident ${Math.round(quiet.waitedMs / 1000)}s after stop (${quiet.lastRssMb} MB) — llama-bench readings may be contaminated`);
        }
        const gguf = paths.ok
          ? resolveGguf({ hfCache: paths.hfCache, model: leg.model, explicit: leg.gguf, quant: leg.quant || "" })
          : { ok: false, reason: paths.reason };
        if (!gguf.ok) {
          log(`llama-bench skipped: ${gguf.reason}`);
          legRecord.llamaBench = { ok: false, reason: gguf.reason, rows: [] };
        } else {
          log(`llama-bench on ${gguf.path}`);
          legRecord.llamaBench = await runLlamaBench({
            benchExe: paths.benchExe, gguf: gguf.path, spec: leg.llamaBench,
            launch: leg.launch, timeoutMs: leg.effectiveTimeoutMs * 3, onLog: log,
          });
          const r = legRecord.llamaBench;
          log(r.ok ? `llama-bench: ${r.rows.map((x) => `${x.test}=${x.tokensPerSec}`).join("  ")}` : `llama-bench FAILED: ${r.error || "no rows"}`);
        }
      }

      legRecord.peaks = await sampler.stop();
      legRecord.finishedAt = new Date().toISOString();
      writeJson(join(dir, "leg.json"), legRecord);
      collected.push(legRecord);
      log(`leg ${leg.id} done — peak VRAM ${legRecord.peaks.peakVramMb ?? "?"} MB, peak engine RAM ${legRecord.peaks.peakRssMb ?? "?"} MB`);
    }
  } finally {
    await restoreNow("run finished");
    if (driver) await driver.close().catch(() => {});
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }

  const finishedAt = new Date().toISOString();
  // The summary shows the WHOLE band, not just what ran: legs measured now, plus
  // every other leg recalled from its last stored result (labelled + staleness
  // flagged), plus any cross-band baseline. That is what makes "bench the new
  // model against my existing results" a single command.
  const rows = mergeBandRows({
    config: cfg, freshLegs: collected, store: scanStore(args.outDir), env,
  });
  const summary = renderSummary({
    id, config: cfg, env, legs: rows, startedAt, finishedAt, restore: restoreResult,
  });
  writeFileSync(join(root, "summary.md"), summary);
  log(`\nwrote ${join(root, "summary.md")}`);
  console.log(`\n${summary}`);

  const failed = collected.flatMap((l) => l.runs.filter((r) => !r.ok)).length;
  const badLoads = collected.filter((l) => l.load && !l.load.ok).length;
  console.log(
    `\nBENCH DONE — ${collected.length} leg(s), ${failed} failed feature run(s), ${badLoads} leg(s) whose model never loaded.` +
    `\nResults: ${root}`,
  );
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(`\nBENCH ERROR: ${e instanceof ConfigError ? e.message : e.stack || e}`);
    process.exit(1);
  });
