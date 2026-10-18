#!/usr/bin/env node
// `npm run eval` — every Lab sample on a real model, through the app's own server, each reply
// held to its action's contract; no one has to click through the Lab (the user, 2026-10-16:
// "tools to do testing … so there is minimal human interaction and can test with other ai
// models"). docs/dev/architecture-notes.md, "Test harness detail".
//
//   npm run eval                                              # each action on its own route
//   npm run eval -- --models gemma-4-26b-a4b-qat,gemma-4-12b-qat   # each model in turn
//   npm run eval -- --actions locationDraft,sceneSummary      # only these actions
//   npm run eval -- --labels "from a description"             # only samples whose label has this
//   npm run eval -- --provider claude --models <model>        # a cloud model whose key is set in the app
//
// What it does: snapshots your data (scripts/lib/scratch-server.js, as the smoke does) with the
// copy pointed at your installed engine and models, starts a server on the copy, and runs
// promptfoo (pinned below, through npx — never installed into the app, whose node_modules hold
// the server's native SQLite build) once per model, stopping the model before the next one loads:
// one model at a time on one graphics card. Your data and your running app are never written.
// promptfoo's telemetry and update check are off.
//
// Results: evals/results/<run>/ — summary.md (start here: a row per sample, a column per
// model), replies-<model>.md (every reply, to read), <model>.json / <model>.html (promptfoo's).

import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { waitReady } from "../tests/lib/smoke-common.js";
import { findDataRoot, killTree, ROOT, snapshotDataRoot, startServer } from "./lib/scratch-server.js";

const PROMPTFOO = "promptfoo@0.123.1";
const PORT = Number(process.env.JW_EVAL_PORT || 17497);
const SERVER = `http://127.0.0.1:${PORT}`;

const { values: opt } = parseArgs({
  options: {
    models: { type: "string", default: "" },
    provider: { type: "string", default: "" },
    actions: { type: "string", default: "" },
    labels: { type: "string", default: "" },
    keep: { type: "boolean", default: false },
  },
});
const models = opt.models.split(",").map((m) => m.trim()).filter(Boolean);
// A model named without a provider is a local one.
const providerId = opt.provider || (models.length ? "local-llamacpp" : "");

let server = null;
let scratch = "";

async function stopModels() {
  try {
    await fetch(`${SERVER}/v1/llm-runner/stop`, { method: "POST", signal: AbortSignal.timeout(120_000) });
  } catch { /* the server is gone — nothing is loaded */ }
}

function cleanup() {
  killTree(server);
  if (scratch && !opt.keep) {
    try { rmSync(scratch, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

/** npx as node runs it (app-structure §Q.6: never through npm's .cmd shims). */
function npx(args, env, logFile) {
  const cli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
  const fd = openSync(logFile, "a");
  const child = existsSync(cli)
    ? spawn(process.execPath, [cli, ...args], { cwd: ROOT, env, stdio: ["ignore", fd, fd] })
    : spawn("npx", args, { cwd: ROOT, env, stdio: ["ignore", fd, fd], shell: true });
  return new Promise((done) => child.on("exit", (code) => { closeSync(fd); done(code ?? 1); }));
}

const slug = (s) => (s || "routed").replace(/[^A-Za-z0-9._-]+/g, "_");
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ");

/** promptfoo's JSON results → one row per sample. */
function readResults(file) {
  const out = JSON.parse(readFileSync(file, "utf8"));
  const rows = out?.results?.results || [];
  return rows.map((r) => {
    const meta = r.testCase?.metadata || {};
    const res = r.response || {};
    return {
      key: r.testCase?.description || `${meta.action} · ${meta.label}`,
      pass: !!r.success,
      reason: r.error || r.gradingResult?.componentResults?.[0]?.reason || r.gradingResult?.reason || "",
      seconds: res.metadata?.seconds ?? (r.latencyMs ? Math.round(r.latencyMs / 100) / 10 : null),
      tokens: res.tokenUsage?.completion ?? null,
      model: res.metadata?.model || "",
      output: typeof res.output === "string" ? res.output : JSON.stringify(res.output ?? ""),
    };
  });
}

async function main() {
  const source = await findDataRoot([17495]);
  if (!source) {
    console.log("✗ no data root with justwrite.db — set JW_DATA_ROOT");
    return 2;
  }
  const run = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const outDir = join(ROOT, "evals", "results", run);
  mkdirSync(outDir, { recursive: true });

  scratch = snapshotDataRoot(source, { prefix: "jw-eval-", cacheRoot: join(source, "ai-cache") });
  const log = openSync(join(outDir, "server.log"), "a");
  server = startServer({ port: PORT, dataDir: scratch, stdio: ["ignore", log, log] });
  await waitReady(`${SERVER}/v1/health`, "eval server");
  console.log(`· server            ${SERVER} on the copy (log: evals/results/${run}/server.log)`);

  const env = {
    ...process.env,
    EVAL_SERVER: SERVER,
    EVAL_PROVIDER_ID: providerId,
    EVAL_ACTIONS: opt.actions,
    EVAL_LABELS: opt.labels,
    PROMPTFOO_DISABLE_TELEMETRY: "1",
    PROMPTFOO_DISABLE_UPDATE: "1",
    PROMPTFOO_CONFIG_DIR: join(outDir, ".promptfoo"),
  };
  const columns = [];
  for (const model of models.length ? models : [""]) {
    const name = slug(model);
    console.log(`· eval              ${model || "each action's own route"} …`);
    const code = await npx(
      ["--yes", PROMPTFOO, "eval", "-c", "evals/promptfooconfig.yaml", "--no-cache", "--no-progress-bar",
        "-o", join(outDir, `${name}.json`), "-o", join(outDir, `${name}.html`)],
      { ...env, EVAL_MODEL: model },
      join(outDir, `promptfoo-${name}.log`),
    );
    await stopModels();
    const file = join(outDir, `${name}.json`);
    if (!existsSync(file)) {
      console.log(`✗ ${model || "routed"}: promptfoo wrote no results (exit ${code}) — see evals/results/${run}/promptfoo-${name}.log`);
      continue;
    }
    const rows = readResults(file);
    const passed = rows.filter((r) => r.pass).length;
    console.log(`  ${passed}/${rows.length} passed`);
    columns.push({ model: model || "routed", rows });
    writeFileSync(join(outDir, `replies-${name}.md`), [
      `# Replies — ${model || "each action's own route"}`, "",
      ...rows.flatMap((r) => [`## ${r.pass ? "✓" : "✗"} ${r.key}`, "", `*${r.reason}* · ${r.seconds ?? "?"} s · ${r.tokens ?? "?"} tokens · ${r.model}`, "", "```", r.output, "```", ""]),
    ].join("\n"));
  }

  const keys = [...new Set(columns.flatMap((c) => c.rows.map((r) => r.key)))];
  const at = (c, k) => c.rows.find((r) => r.key === k);
  writeFileSync(join(outDir, "summary.md"), [
    `# Eval ${run}`, "",
    `Data: a copy of ${source}. promptfoo ${PROMPTFOO.split("@")[1]}. Every reply: replies-<model>.md.`, "",
    `| Sample | ${columns.map((c) => c.model).join(" | ")} |`,
    `|---|${columns.map(() => "---|").join("")}`,
    ...keys.map((k) => `| ${cell(k)} | ${columns.map((c) => {
      const r = at(c, k);
      return r ? `${r.pass ? "✓" : "✗"} ${cell(r.reason)} (${r.seconds ?? "?"} s)` : "—";
    }).join(" | ")} |`),
    "",
    ...columns.map((c) => `**${c.model}:** ${c.rows.filter((r) => r.pass).length}/${c.rows.length} passed.`),
  ].join("\n"));
  console.log(`· summary           evals/results/${run}/summary.md`);
  return columns.length && columns.every((c) => c.rows.every((r) => r.pass)) ? 0 : 1;
}

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, async () => { await stopModels(); cleanup(); process.exit(130); });

let exitCode = 1;
try {
  exitCode = await main();
} catch (e) {
  console.log(`✗ eval failed: ${String(e?.message || e)}`);
  await stopModels();
} finally {
  cleanup();
}
process.exit(exitCode);
