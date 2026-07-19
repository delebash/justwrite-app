// Resource sampling — peak VRAM + peak working set while a leg runs.
//
// The CPU-band recipe asks for "peak RAM (Task Manager, working set)" per leg;
// this automates that reading so it isn't a human watching a graph. Everything
// is best-effort by design: a missing nvidia-smi (AMD/Intel/CPU-only box) must
// degrade to `null`, never fail a leg. Same rule the runner uses for its own
// VRAM probe (hardware.used_vram_mb → None when unmeasurable).

import { execFile } from "node:child_process";

function exec(cmd, args, timeoutMs = 10000) {
  return new Promise((resolvePromise) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
      resolvePromise(err ? null : String(stdout || ""));
    });
  });
}

/** Total VRAM in use across NVIDIA GPUs, in MB, or null when unmeasurable. */
export async function usedVramMb() {
  const out = await exec("nvidia-smi", ["--query-gpu=memory.used", "--format=csv,noheader,nounits"]);
  if (out === null) return null;
  const vals = out.split(/\r?\n/).map((l) => Number(l.trim())).filter((n) => Number.isFinite(n));
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
}

/** Summary of the box's GPUs, or null. Recorded once per run in env.json. */
export async function gpuInfo() {
  const out = await exec("nvidia-smi", [
    "--query-gpu=name,memory.total,driver_version",
    "--format=csv,noheader,nounits",
  ]);
  if (out === null) return null;
  return out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name, totalMb, driver] = l.split(",").map((s) => s.trim());
      return { name, totalMb: Number(totalMb) || null, driver };
    });
}

/**
 * Summed working set (MB) of the engine's child processes, or null.
 *
 * llama-server is spawned by the runner as a separate process, so the bench's
 * own Node RSS says nothing about the model's footprint — the engine processes
 * have to be measured by name.
 */
export async function engineRssMb(processNames = ["llama-server", "llama-bench"]) {
  if (process.platform === "win32") {
    const names = processNames.map((n) => `'${n}'`).join(",");
    const out = await exec("powershell", [
      "-NoProfile", "-NonInteractive", "-Command",
      `(Get-Process -Name ${names} -ErrorAction SilentlyContinue | Measure-Object -Property WorkingSet64 -Sum).Sum`,
    ], 15000);
    if (out === null) return null;
    const bytes = Number(String(out).trim());
    return Number.isFinite(bytes) && bytes > 0 ? Math.round(bytes / 1048576) : null;
  }
  const out = await exec("ps", ["-eo", "comm,rss"]);
  if (out === null) return null;
  let kb = 0;
  for (const line of out.split(/\r?\n/).slice(1)) {
    const [comm, rss] = line.trim().split(/\s+/);
    if (comm && processNames.some((n) => comm.includes(n))) kb += Number(rss) || 0;
  }
  return kb ? Math.round(kb / 1024) : null;
}

/**
 * Wait until no engine process is running.
 *
 * WHY THIS AND NOT `/resident`: a full-teardown `POST /stop` clears the
 * service's resident ledger and returns IMMEDIATELY (lifecycle.py:945-958 —
 * `router.stop()` then `_resident.clear()`), so `/resident` reads empty while
 * the llama-server child is still exiting and still holding VRAM/RAM. Starting
 * llama-bench there contaminates exactly the number this harness exists to
 * produce. The OS process list is the honest signal.
 *
 * Returns `{quiet, waitedMs, lastRssMb}`. Unmeasurable (no `ps`/PowerShell) →
 * `quiet: null` after one probe: never block a run on a probe we cannot make.
 */
export async function waitEngineQuiet({ timeoutMs = 120000, intervalMs = 1000 } = {}) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    last = await engineRssMb();
    if (last === null) return { quiet: true, waitedMs: Date.now() - t0, lastRssMb: null };
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { quiet: false, waitedMs: Date.now() - t0, lastRssMb: last };
}

/**
 * Poll VRAM + engine RSS on an interval, tracking peaks, until `stop()`.
 * `stop()` resolves with the peaks (nulls when nothing was measurable).
 */
export function startSampler({ intervalMs = 2000 } = {}) {
  let peakVramMb = null;
  let peakRssMb = null;
  let samples = 0;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    const [vram, rss] = await Promise.all([usedVramMb(), engineRssMb()]);
    if (vram !== null) peakVramMb = Math.max(peakVramMb ?? 0, vram);
    if (rss !== null) peakRssMb = Math.max(peakRssMb ?? 0, rss);
    samples += 1;
  };

  void tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();

  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      return { peakVramMb, peakRssMb, samples };
    },
  };
}
