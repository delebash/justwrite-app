// llama-bench leg: the RAW prompt-processing / generation matrix.
//
// This is the tool the CPU-band recipe prescribes
// (just-llm-runner/docs/plans/2026-07-19-cpu-only-band-test.md): pp at several
// prompt sizes + tg, per model, with `-ngl 0` forcing pure CPU even on a CUDA
// build. It measures the ENGINE in isolation — the feature legs measure the
// whole app. Both land in the same results folder.
//
// Nothing here is hardcoded to a machine: the engine dir comes from
// `GET /v1/llm-runner/engine/status` → `serverExe` (lifecycle.py:526-543), and
// the model file is resolved out of the HF cache that sits beside it.

import { execFile } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const BENCH_EXE = process.platform === "win32" ? "llama-bench.exe" : "llama-bench";

/**
 * Engine paths derived from the running server's own report.
 *
 *   serverExe = <cacheRoot>/llamacpp/<build>/<gpu>/llama-server.exe
 * …but the GPU-variant dir is OPTIONAL: binary.py:174-176 falls back to the
 * build dir when no variant subdir holds the exe. So instead of counting
 * levels, walk up to the "llamacpp" marker — cacheRoot is its parent, and the
 * model cache is <cacheRoot>/hf (verified on this box 2026-07-19).
 */
/**
 * The message for the HARD engine gate (run.js): no engine on the server the
 * bench is talking to means NO local leg can run at all — model loads go through
 * the server, which needs the engine to spawn llama-server. Erroring out loudly
 * (the user's ruling, 2026-07-20) beats a warning + a run that limps to nothing.
 */
export function engineMissingError({ server, dataRoot } = {}) {
  return [
    `the server at ${server || "(unknown)"} has no engine installed — no local model can load, so nothing can be benched.`,
    dataRoot ? `The bench started this server on data root: ${dataRoot}` : "",
    "Fix: open the app (`npm run dev`) and install the engine there (AI page → Install engine, or Quick Setup), then re-run —",
    "with your app running, the bench connects to ITS server and engine. If you started a server by hand, it may be on the",
    "wrong data folder: set JUSTWRITE_DATA_DIR to your app's data root, or just let the app (or the bench) start the server.",
  ].filter(Boolean).join("\n");
}

export function enginePaths(engineStatus) {
  const serverExe = engineStatus?.serverExe || "";
  if (!serverExe) return { ok: false, reason: "the engine is not installed (no serverExe)" };
  const engineDir = dirname(serverExe);
  const benchExe = join(engineDir, BENCH_EXE);

  let cacheRoot = "";
  for (let dir = engineDir, i = 0; i < 6; i++) {
    const parent = dirname(dir);
    if (parent === dir) break;
    if (basename(dir).toLowerCase() === "llamacpp") { cacheRoot = parent; break; }
    dir = parent;
  }

  const hasBench = existsSync(benchExe);
  return {
    ok: hasBench && !!cacheRoot,
    reason: !hasBench
      ? `${BENCH_EXE} not found in ${engineDir}`
      : !cacheRoot
        ? `could not locate the engine cache root above ${engineDir}`
        : "",
    serverExe, engineDir, benchExe, cacheRoot,
    hfCache: cacheRoot ? join(cacheRoot, "hf") : "",
    build: engineStatus?.build || "",
    gpu: engineStatus?.gpu || "",
  };
}

function walkGgufs(dir, out = [], depth = 0) {
  if (depth > 4 || !existsSync(dir)) return out;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkGgufs(p, out, depth + 1);
    else if (name.toLowerCase().endsWith(".gguf")) out.push({ path: p, size: st.size, name });
  }
  return out;
}

/**
 * The GGUF for a leg. `explicit` (config `gguf`) always wins — auto-resolution
 * is a convenience, never a guess the run depends on silently.
 *
 * Auto: find the `models--…` repo dir under `hfCache` whose name shares the most
 * tokens with the model id, walk its `snapshots` tree for .gguf files, drop
 * draft/MTP companions (they live in an MTP subdir and are ~100x smaller than
 * the base weights), and take the largest remaining file. `quant` narrows it
 * when a repo ships several quantisations.
 */
export function resolveGguf({ hfCache, model, explicit = "", quant = "", repo = "" }) {
  if (explicit) {
    return existsSync(explicit)
      ? { ok: true, path: explicit, source: "config" }
      : { ok: false, reason: `configured gguf not found: ${explicit}` };
  }
  if (!existsSync(hfCache)) return { ok: false, reason: `no model cache at ${hfCache}` };

  // Model ids are slugs ("gemma-4-26b-a4b-qat"); repo dirs are
  // "models--unsloth--gemma-4-26B-A4B-it-qat-GGUF".
  //
  // The `models--` PREFIX IS STRIPPED BEFORE MATCHING. It used to be part of the
  // haystack, and the token "model" — present in plenty of ids — then matched
  // EVERY cached repo, so an unknown model id silently resolved to whatever
  // happened to be first. A bench that measures the wrong weights and reports
  // them under the right name is worse than one that fails, hence also the
  // half-the-tokens floor and the ambiguity refusal below.
  const tokens = String(model).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  if (!tokens.length) return { ok: false, reason: `model id ${JSON.stringify(model)} has nothing to match on` };
  const needed = Math.max(1, Math.ceil(tokens.length / 2));

  // `repo` narrows the CANDIDATE REPOS before scoring — the portable way to break
  // a tie. Two uncensored Gemma forks both matched the id
  // "gemma-4-26b-a4b-uncensored" equally, and the only other lever, `gguf`, wants
  // an absolute path that exists on THIS machine, which cannot live in a config
  // shared across boxes. `quant` cannot help: the ambiguity is which repo, not
  // which quantisation inside one. A `repo` that matches nothing falls through to
  // the normal error rather than silently benching the wrong weights.
  const repoNeedle = String(repo).toLowerCase();
  const candidates = readdirSync(hfCache)
    .filter((d) => d.startsWith("models--"))
    .filter((d) => !repoNeedle || d.toLowerCase().includes(repoNeedle));

  const scored = candidates
    .map((d) => {
      const hay = d.slice("models--".length).replace(/--/g, "-").toLowerCase();
      return { dir: d, score: tokens.filter((t) => hay.includes(t)).length };
    })
    .filter((r) => r.score >= needed)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return { ok: false, reason: `no cached repo matches model id ${JSON.stringify(model)} in ${hfCache} (is it downloaded?)` };
  }
  if (scored.length > 1 && scored[0].score === scored[1].score) {
    return {
      ok: false,
      reason: `model id ${JSON.stringify(model)} matches several cached repos equally (${scored.filter((s) => s.score === scored[0].score).map((s) => s.dir).join(", ")}) — set "gguf" explicitly in the leg`,
    };
  }

  const repoDir = join(hfCache, scored[0].dir, "snapshots");
  let files = walkGgufs(repoDir).filter((f) => !/[/\\]mtp[/\\]/i.test(f.path) && !/^mtp-/i.test(f.name));
  if (quant) {
    const q = quant.toLowerCase();
    const narrowed = files.filter((f) => f.name.toLowerCase().includes(q));
    if (narrowed.length) files = narrowed;
  }
  if (!files.length) return { ok: false, reason: `no .gguf under ${repoDir}` };
  files.sort((a, b) => b.size - a.size);
  return { ok: true, path: files[0].path, source: "hf-cache", repo: scored[0].dir, sizeBytes: files[0].size };
}

/**
 * Parse llama-bench output. Both shapes are handled because `-o json` support
 * varies by build: JSON first, then the markdown table llama-bench always
 * prints. Raw stdout is preserved by the caller either way.
 */
export function parseBenchOutput(stdout) {
  const rows = [];
  const trimmed = (stdout || "").trim();

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed);
      for (const r of Array.isArray(data) ? data : [data]) {
        const test = r.test || (r.n_prompt ? `pp${r.n_prompt}` : r.n_gen ? `tg${r.n_gen}` : "");
        const tps = Number(r.avg_ts ?? r["t/s"] ?? r.tokens_per_second);
        if (test && Number.isFinite(tps)) {
          rows.push({ test, tokensPerSec: tps, stddev: Number(r.stddev_ts ?? 0) || null, model: r.model_filename || r.model || "" });
        }
      }
      if (rows.length) return { rows, format: "json" };
    } catch {
      /* fall through to the table parser */
    }
  }

  // | model | size | params | backend | ngl | test | t/s |
  // | gemma | 14 G | 26B    | CUDA    |  0  | pp512| 516.00 ± 5.00 |
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.startsWith("|") || /^\|\s*-+/.test(line)) continue;
    const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
    if (cells.length < 3) continue;
    const testCell = cells.find((c) => /^(pp|tg|pp\d+\+tg)\d+/i.test(c));
    const tpsCell = cells[cells.length - 1];
    const m = tpsCell.match(/^([\d.]+)\s*(?:±\s*([\d.]+))?$/);
    if (testCell && m) {
      rows.push({
        test: testCell,
        tokensPerSec: Number(m[1]),
        stddev: m[2] ? Number(m[2]) : null,
        model: cells[0],
      });
    }
  }
  return { rows, format: rows.length ? "table" : "unparsed" };
}

/** Derived reading: TTFT ≈ prompt_tokens ÷ pp (the CPU-band doc's own formula). */
export function deriveTtft(rows) {
  const out = {};
  for (const r of rows) {
    const m = /^pp(\d+)$/i.exec(r.test);
    if (m && r.tokensPerSec > 0) out[`ttft${m[1]}Ms`] = Math.round((Number(m[1]) / r.tokensPerSec) * 1000);
  }
  return out;
}

function run(exe, args, { timeoutMs }) {
  return new Promise((resolvePromise) => {
    const t0 = Date.now();
    execFile(exe, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        resolvePromise({
          ok: !err,
          code: err?.code ?? 0,
          killed: !!err?.killed,
          stdout: stdout || "",
          stderr: stderr || "",
          error: err ? String(err.message || err).slice(0, 400) : null,
          wallMs: Date.now() - t0,
        });
      });
  });
}

/**
 * Run one leg's llama-bench matrix.
 *
 * The model must NOT be resident when this runs — llama-bench loads the weights
 * itself, and a co-resident llama-server child would fight it for VRAM/RAM and
 * corrupt both readings. The orchestrator stops the runner first.
 */
export async function runLlamaBench({ benchExe, gguf, spec, launch = {}, timeoutMs = 3600000, onLog }) {
  const args = ["-m", gguf, "-p", spec.p.join(","), "-n", String(spec.n), "-r", String(spec.reps ?? 2), "-o", "json"];
  if (launch.nGpuLayers !== undefined && launch.nGpuLayers !== null) args.push("-ngl", String(launch.nGpuLayers));
  if (Number(launch.threads) > 0) args.push("-t", String(launch.threads));
  if (Number(launch.nCpuMoe) > 0) args.push("--n-cpu-moe", String(launch.nCpuMoe));
  if (Number(launch.batchSize) > 0) args.push("-b", String(launch.batchSize));
  if (Number(launch.ubatchSize) > 0) args.push("-ub", String(launch.ubatchSize));
  // NO -c: llama-bench has no context flag (b10079/b10083 reject it FATALLY —
  // "invalid parameter for argument: -c", which silently killed every CPU-band
  // matrix on 2026-07-22 because CPU legs set launch.ctxLen and GPU legs don't).
  // The -p prompt sizes ARE the context exercise; ctxLen stays a server-load knob.
  for (const extra of spec.extraArgs || []) args.push(String(extra));

  onLog?.(`llama-bench ${args.map((a) => (String(a).includes(" ") ? `"${a}"` : a)).join(" ")}`);
  let res = await run(benchExe, args, { timeoutMs });
  let parsed = parseBenchOutput(res.stdout);

  // Older builds reject `-o json` (and some reject --n-cpu-moe). One retry
  // without the optional flags keeps a leg from being lost to a flag mismatch —
  // recorded as `retriedWithout` so the results never hide it.
  const retriedWithout = [];
  if (!res.ok && /invalid|unknown|unrecognized/i.test(`${res.stderr}${res.error || ""}`)) {
    const fallback = args.filter((a, i) => {
      if (a === "-o" || args[i - 1] === "-o") { retriedWithout.push("-o json"); return false; }
      if (a === "--n-cpu-moe" || args[i - 1] === "--n-cpu-moe") { retriedWithout.push("--n-cpu-moe"); return false; }
      return true;
    });
    onLog?.(`llama-bench retry without: ${[...new Set(retriedWithout)].join(", ")}`);
    res = await run(benchExe, fallback, { timeoutMs });
    parsed = parseBenchOutput(res.stdout);
  }

  return {
    ok: res.ok && parsed.rows.length > 0,
    args,
    retriedWithout: [...new Set(retriedWithout)],
    exitCode: res.code,
    timedOut: res.killed,
    wallMs: res.wallMs,
    format: parsed.format,
    rows: parsed.rows,
    derived: deriveTtft(parsed.rows),
    error: res.error,
    stdout: res.stdout.slice(-20000),
    stderr: res.stderr.slice(-8000),
    gguf: basename(gguf),
    ggufPath: gguf,
  };
}
