// Results tree + summary.md.
//
// The layout is designed for CHEAP READING: the analyst (Claude) opens
// summary.md first and only drills into a capture file when a number looks
// wrong. Nothing is scored here — accuracy is judged by reading the captured
// outputs, which is the whole point of a token-free harness.
//
//   bench-results/<run-id>/
//     config.json            the resolved config (defaults applied)
//     env.json               engine build · GPU/driver · CPU/RAM · app sha
//     restore.json           the pre-run assignment map
//     summary.md             the headline tables + flags
//     <NN>-<leg>/leg.json    per-leg: load, llama-bench, peaks, route
//     <NN>-<leg>/<feature>-<n>.json   one capture per feature run

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function runId(nowIso, name) {
  const stamp = nowIso.replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  return `${stamp}-${name}`;
}

export function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2));
}

export function legDir(root, index, legId) {
  return ensureDir(join(root, `${String(index + 1).padStart(2, "0")}-${legId}`));
}

const n = (v, digits = 1) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : "—");
const ms = (v) => (typeof v === "number" && Number.isFinite(v) ? `${(v / 1000).toFixed(1)}s` : "—");

/** Median — the headline for repeated samples. With ±10% run-to-run noise on
 *  this class of measurement, a mean lets one outlier move the verdict. */
export function median(values) {
  const xs = values.filter((v) => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = xs.length >> 1;
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

function benchRow(rows, test) {
  return rows?.find((r) => r.test?.toLowerCase() === test.toLowerCase())?.tokensPerSec ?? null;
}

/** How a row got here: measured now, recalled from the store, borrowed from
 *  another band, or never measured at all. Rendered in every table so a recalled
 *  number is never mistaken for a fresh one. */
function provenance(row) {
  if (row.source === "fresh") return "fresh";
  if (row.source === "missing") return "never run";
  const when = String(row.finishedAt || "").slice(0, 10);
  const tag = row.source === "borrowed" ? "baseline" : "stored";
  const stale = row.stale?.length ? ` ⚠ ${row.stale.join("; ")}` : "";
  return `${tag} ${when}${stale}`;
}

/**
 * Render summary.md from MERGED rows (see store.mergeBandRows) — fresh legs plus
 * anything recalled from previous runs, so a one-leg run still prints the whole
 * band's table.
 * `legs`: [{ leg, legId, source, stale, load, llamaBench, peaks, runs: [...] }]
 */
export function renderSummary({ id, config, env, legs, startedAt, finishedAt, restore, reportOnly = false }) {
  const out = [];
  const freshCount = legs.filter((l) => l.source === "fresh").length;
  out.push(`# Bench ${reportOnly ? "report" : "run"} — ${config.name}${config.band ? ` (${config.band} band)` : ""}`);
  out.push("");
  out.push(`- **Run id:** \`${id}\``);
  if (!reportOnly) out.push(`- **Started / finished:** ${startedAt} → ${finishedAt || "(incomplete)"}`);
  out.push(`- **Config:** \`${config.source}\` — ${legs.length} leg(s) shown, ${freshCount} measured now, features: ${config.features.join(", ")}`);
  out.push(`- **Box:** ${env.cpu || "?"} · ${env.totalRamMb ? `${Math.round(env.totalRamMb / 1024)} GB RAM` : "? RAM"} · ${(env.gpus || []).map((g) => `${g.name} ${g.totalMb}MB (driver ${g.driver})`).join(" + ") || "no NVIDIA GPU detected"}`);
  const buildNote = env.engineBuildMismatch
    ? ` ⚠ the binary self-reports **${env.engineBinaryBuild}** but sits in a **${env.engineDirBuild}** dir — the folder name lies; staleness uses the binary build`
    : "";
  out.push(`- **Engine:** build ${env.engineBuild || "?"} (${env.engineGpu || "?"}) · app ${env.appSha || "?"}${buildNote}`);
  if (restore) {
    out.push(`- **Restore:** ${restore.ok ? "assignments restored + verified" : `⚠ INCOMPLETE — ${JSON.stringify(restore.mismatched || restore.failed)}`}`);
  }
  out.push("");

  // ── raw engine matrix ────────────────────────────────────────────────────
  const withBench = legs.filter((l) => l.llamaBench?.rows?.length);
  if (withBench.length) {
    out.push("## Raw engine (llama-bench)");
    out.push("");
    // The peak columns are LEG-wide (the sampler runs from before llama-bench to
    // the end of the feature runs), not llama-bench's own — labelled so.
    out.push("| Leg | model | pp512 | pp2048 | pp8192 | tg128 | TTFT@2k | TTFT@8k | leg peak VRAM | leg peak RAM | source |");
    out.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|");
    for (const l of withBench) {
      const r = l.llamaBench.rows;
      const d = l.llamaBench.derived || {};
      out.push(
        `| ${l.legId} | ${l.leg.model} | ${n(benchRow(r, "pp512"))} | ${n(benchRow(r, "pp2048"))} | ${n(benchRow(r, "pp8192"))} | ` +
        `${n(benchRow(r, "tg128"))} | ${ms(d.ttft2048Ms)} | ${ms(d.ttft8192Ms)} | ` +
        `${l.peaks?.peakVramMb ?? "—"} | ${l.peaks?.peakRssMb ?? "—"} | ${provenance(l)} |`,
      );
    }
    out.push("");
    out.push("_pp/tg in tokens/s. TTFT is derived (prompt ÷ pp), not measured. The peak columns cover the WHOLE leg (llama-bench + the feature runs), not llama-bench alone._");
    out.push("");
  }

  const skippedBench = legs.filter((l) => l.source !== "missing" && l.leg?.llamaBench && !l.llamaBench?.rows?.length);
  if (skippedBench.length) {
    out.push("## llama-bench legs that produced no rows");
    out.push("");
    for (const l of skippedBench) {
      out.push(`- **${l.legId}** — ${l.llamaBench?.error || l.llamaBench?.reason || "no rows parsed"}`);
    }
    out.push("");
  }

  const neverRun = legs.filter((l) => l.source === "missing");
  if (neverRun.length) {
    // The command must name the band that OWNS the leg. A borrowed baseline
    // belongs to another config, and telling the reader to run it from here
    // would just fail — `--legs` can only match this config's own legs.
    const ownIds = new Set(config.legs.map((l) => l.id));
    const cmd = config.band ? `npm run bench:${config.band} --` : "npm run bench -- --config <this config>";
    out.push("## Legs with no result yet");
    out.push("");
    for (const l of neverRun) {
      out.push(ownIds.has(l.legId)
        ? `- **${l.legId}**${l.leg?.model ? ` (${l.leg.model})` : ""} — never measured. Run: \`${cmd} --legs ${l.legId}\``
        : `- **${l.legId}** — a baseline borrowed from another band, never measured. Run it from the band that owns it; this band only recalls its result.`);
    }
    out.push("");
  }

  // ── feature matrix ───────────────────────────────────────────────────────
  out.push("## Features through the app");
  out.push("");
  out.push("| Leg | Feature | n | ok | TTFT (med) | wall (med) | out chars (med) | prompt/compl tok | flags | source |");
  out.push("|---|---|--:|--:|--:|--:|--:|---|---|---|");
  for (const l of legs) {
    if (l.source === "missing") continue;
    const byFeature = new Map();
    for (const r of l.runs || []) {
      if (!byFeature.has(r.featureKey)) byFeature.set(r.featureKey, []);
      byFeature.get(r.featureKey).push(r);
    }
    const prov = provenance(l);
    for (const [featureKey, runs] of byFeature) {
      const okRuns = runs.filter((r) => r.ok);
      const flags = [...new Set(runs.flatMap((r) => r.flags || []))];
      const pt = median(okRuns.map((r) => r.usage?.promptTokens ?? r.usage?.prompt_tokens));
      const ct = median(okRuns.map((r) => r.usage?.completionTokens ?? r.usage?.completion_tokens));
      out.push(
        `| ${l.legId} | ${featureKey} | ${runs.length} | ${okRuns.length}/${runs.length} | ` +
        `${ms(median(okRuns.map((r) => r.ttftMs)))} | ${ms(median(okRuns.map((r) => r.wallMs)))} | ` +
        `${median(okRuns.map((r) => r.outputChars)) ?? "—"} | ${pt ?? "—"}/${ct ?? "—"} | ${flags.join(", ") || "—"} | ${prov} |`,
      );
    }
  }
  out.push("");

  // ── MTP acceptance, per leg ──────────────────────────────────────────────
  // Draft acceptance is from the per-leg `measure` probe (T3): `— (no spec)` or
  // `0.0% ⚠ never engaged` means a model configured for MTP did NOT speculate — the
  // exact silent failure this bench exists to catch.
  const shownLegs = legs.filter((l) => l.source !== "missing");
  const anySpec = shownLegs.some((l) => l.measure?.draftN !== undefined);
  if (shownLegs.length && anySpec) {
    out.push("## MTP acceptance (per leg)");
    out.push("");
    out.push("| Leg | model | measure tok/s | draft acceptance | drafted→accepted |");
    out.push("|---|---|--:|--:|--:|");
    for (const l of shownLegs) {
      const mz = l.measure || {};
      const acc = typeof mz.draftAcceptance === "number"
        ? `${(mz.draftAcceptance * 100).toFixed(1)}%${mz.draftN === 0 ? " ⚠ never engaged" : ""}`
        : "— (no spec)";
      const da = typeof mz.draftN === "number" ? `${mz.draftN}→${mz.draftNAccepted}` : "—";
      out.push(`| ${l.legId} | ${l.leg?.model || "?"} | ${n(mz.tokensPerSec)} | ${acc} | ${da} |`);
    }
    out.push("");
    out.push("_Acceptance is one representative generation (the measure probe), not every run. Read the router log for per-request detail._");
    out.push("");
  }

  // ── A/B blocks: a model with 2+ legs (e.g. think on vs off) ───────────────
  const byModel = new Map();
  for (const l of shownLegs) {
    const k = l.leg?.model || "";
    if (!byModel.has(k)) byModel.set(k, []);
    byModel.get(k).push(l);
  }
  for (const [model, group] of byModel) {
    if (group.length < 2) continue;
    out.push(`## A/B — ${model}`);
    out.push("");
    out.push(`Legs: ${group.map((l) => `\`${l.legId}\` (think ${l.leg?.tunables?.think ? "on" : "off"})`).join(" · ")}`);
    out.push("");
    out.push(`| Feature | ${group.map((l) => l.legId).join(" | ")} |`);
    out.push(`|---|${group.map(() => "---:").join("|")}|`);
    const feats = [...new Set(group.flatMap((l) => (l.runs || []).map((r) => r.featureKey)))];
    for (const f of feats) {
      const cells = group.map((l) => {
        const rs = (l.runs || []).filter((r) => r.ok && r.featureKey === f);
        if (!rs.length) return "—";
        const ct = median(rs.map((r) => r.usage?.completionTokens ?? r.usage?.completion_tokens));
        return `${ms(median(rs.map((r) => r.wallMs)))} · ${ct ?? "—"}tok`;
      });
      out.push(`| ${f} | ${cells.join(" | ")} |`);
    }
    out.push("");
    out.push(`_Cells: wall (median) · completion tokens. The numbers show the COST of the difference (e.g. thinking); QUALITY is judged by reading the captures side by side — \`bench-results/${id}/<NN>-<legId>/<feature>-<n>.json\` for each leg._`);
    out.push("");
  }

  // ── per-feature gaps on recalled rows ────────────────────────────────────
  // The fingerprint deliberately ignores the feature list (adding a feature must
  // not invalidate old timings), so this is the flip side stated out loud: a
  // stored leg measured before a feature joined the band simply has no rows for
  // it, and without this note the table would read as if the leg covered
  // everything.
  {
    const gaps = [];
    for (const l of legs) {
      if (l.source === "fresh" || l.source === "missing") continue;
      const cfgLeg = config.legs.find((c) => c.id === l.legId);
      if (!cfgLeg) continue; // borrowed baseline — its band owns its feature set
      const have = new Set((l.runs || []).map((r) => r.featureKey));
      const miss = (cfgLeg.effectiveFeatures || []).filter((f) => !have.has(f));
      if (miss.length) gaps.push(`- **${l.legId}** — no data for: ${miss.join(", ")} (measured before these joined the band, or those runs recorded nothing)`);
    }
    if (gaps.length) {
      out.push("### Recalled legs missing data for current features");
      out.push("");
      out.push(...gaps);
      out.push("");
    }
  }

  // ── failures, spelled out ────────────────────────────────────────────────
  const failures = legs.flatMap((l) => (l.runs || []).filter((r) => !r.ok).map((r) => ({ leg: l.legId, r })));
  if (failures.length) {
    out.push("## Failures");
    out.push("");
    for (const f of failures) {
      out.push(`- **${f.leg} · ${f.r.featureKey}** (${(f.r.flags || []).join(",") || "error"}) — ${f.r.error}`);
    }
    out.push("");
  }

  // ── load problems ────────────────────────────────────────────────────────
  const badLoads = legs.filter((l) => l.load && l.load.ok === false);
  if (badLoads.length) {
    out.push("## Legs whose model never loaded");
    out.push("");
    for (const l of badLoads) out.push(`- **${l.legId}** (${l.leg?.model || "?"}) — ${l.load.error}`);
    out.push("");
  }

  out.push("## Reading these numbers");
  out.push("");
  out.push("- Medians, not means: single measures on this class of workload carry roughly ±10% run-to-run noise.");
  out.push("- `TTFT` for feature rows is time to FIRST TOKEN of the model's reply, measured client-side; it includes retrieval + prompt assembly, so it is the number a user actually waits.");
  out.push("- `critique` and `entitySweep` have no TTFT (they don't stream) and no token counts — their services discard the usage the server returns, so the numbers exist on the wire but not in the result object.");
  out.push("- `temperature-fixed-by-caller` (`chat`, `characterChat`): those two callers send their own temperature, which overrides the preset's — a leg's temperature does not reach them.");
  out.push("- Accuracy is NOT scored here. Read the per-feature capture files for the actual outputs.");
  out.push("- The **source** column says whether a row was measured in this run or recalled from an earlier one. A recalled row carries its date, and `⚠` when the engine build or the leg's own config has changed since — those comparisons are still useful, they just aren't like-for-like.");
  out.push("");
  return out.join("\n");
}
