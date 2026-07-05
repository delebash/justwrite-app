// Plan B T4 probe — Quick tune SAVE (per-(model, machine) tune). Drives the REAL
// TuneMeasureModal end-to-end against a live server: a stub GGUF in the server's
// ai-cache flips a catalog model to "Downloaded" so the per-row Tune button exists
// (the modal is gated on downloaded). Asserts: (a) a pre-seeded saved tune renders
// "Tuned for this machine ✓"; (b) a bogus saved flag renders the "unrecognized"
// badge (the D5 stale-flag degradation — visible, not a mystery load failure);
// (c) "Remove saved tune" clears it (API rows → 0); (d) "Save tune" persists the
// grid verbatim (API rows > 0 incl. base defaults like flash_attn). Reuses
// findChrome() from headless-smoke.mjs (never hardcode the Chromium path).
// Prereqs: server :17495 (reset DB) + dev:vite :1420 + the stub GGUF
// (ai-cache/hf/models--unsloth--Qwen3-8B-GGUF/snapshots/fake/qwen3-8b-Q4_K_M.gguf).
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const APP = process.env.JW_APP || "http://localhost:1420";
const API = process.env.JW_API || "http://127.0.0.1:17495";
const MODEL = "qwen3-8b-q4_k_m";

function findChrome() {
  if (process.env.JW_CHROME && existsSync(process.env.JW_CHROME)) return process.env.JW_CHROME;
  const roots = ["/opt/pw-browsers", `${process.env.HOME || ""}/.cache/ms-playwright`];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      if (!dir.startsWith("chromium") || dir.includes("headless_shell")) continue;
      const exe = `${root}/${dir}/chrome-linux/chrome`;
      if (existsSync(exe)) return exe;
    }
  }
  return undefined;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (path, opts = {}) => {
  const r = await fetch(`${API}${path}`, {
    headers: { "content-type": "application/json" }, ...opts,
  });
  if (!r.ok) throw new Error(`${opts.method || "GET"} ${path} → ${r.status}`);
  return r.json();
};

let failed = false;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "   " + extra : ""}`);
  if (!ok) failed = true;
};

// ── API pre-seed: a saved tune with one REAL row + one BOGUS flag name ────────
await api(`/v1/ai/model-tunes?modelId=${MODEL}`, { method: "DELETE" });
const seeded = await api("/v1/ai/model-tunes", {
  method: "PUT",
  body: JSON.stringify({ modelId: MODEL, switches: [
    { flagName: "threads", flagValue: "8" },
    { flagName: "reasoning_budgett", flagValue: "1024" }, // typo'd on purpose → badge
  ] }),
});
check("pre-seed: PUT saved 2 rows (server-derived hwKey)", seeded.rows.length === 2, `hwKey=${seeded.hwKey}`);

const browser = await chromium.launch({ executablePath: findChrome(), args: ["--no-sandbox"] });
const page = await browser.newPage();
const BENIGN = [/fonts\.googleapis\.com/, /fonts\.gstatic\.com/, /net::ERR_CONNECTION_RESET/];
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
page.on("response", (r) => { if (r.status() >= 400 && !BENIGN.some((re) => re.test(r.url()))) errors.push(`${r.status()} ${r.url()}`); });

try {
  // ── navigate: #/ai → Providers → Edit built-in → the catalog with our Tune row ──
  await page.goto(`${APP}/#/ai`, { waitUntil: "networkidle" });
  await page.evaluate(() => [...document.querySelectorAll(".lu-subnav a")].find((a) => /providers/i.test(a.textContent))?.click());
  await sleep(500);
  await page.evaluate(() => [...document.querySelectorAll(".lu-prow button, .lu-prow .lu-btn")].find((b) => /edit/i.test(b.textContent))?.click());
  await sleep(700);
  check("catalog renders", await page.locator(".lu-mcat").isVisible());

  // the stub-GGUF model is the ONLY downloaded row → the only Tune button
  const tuneBtn = page.locator(".lu-mcat button", { hasText: "Tune" }).first();
  check("a Tune button exists (stub GGUF → Downloaded)", await tuneBtn.isVisible());
  await tuneBtn.click();
  await page.waitForSelector('button:has-text("Save tune")', { timeout: 8000 });
  await sleep(900); // startTune + loadSavedTune fetches

  // (a) saved-state renders
  check("'Tuned for this machine ✓' renders for the pre-seeded tune",
    await page.getByText(/Tuned for this machine/).isVisible().catch(() => false));
  // (b) the bogus flag is badged, the real one is not
  const unk = page.locator(".lu-tune-unk");
  check("unrecognized badge renders for the bogus flag",
    await unk.isVisible().catch(() => false));
  const unkText = (await unk.textContent().catch(() => "")) || "";
  check("badge names the bogus flag only", unkText.includes("reasoning_budgett") && !unkText.includes("threads,"));

  // (c) Remove saved tune → badge + saved-state clear; API rows → 0
  await page.getByRole("button", { name: /Remove saved tune/ }).click();
  await sleep(900);
  check("saved-state clears after Remove",
    !(await page.getByText(/Tuned for this machine/).isVisible().catch(() => false)));
  const afterRemove = await api(`/v1/ai/model-tunes?modelId=${MODEL}`);
  check("API rows == 0 after Remove", afterRemove.rows.length === 0);

  // (d) Save tune → verbatim grid snapshot persists; saved-state returns
  await page.getByRole("button", { name: "Save tune" }).click();
  await sleep(900);
  check("'Tuned for this machine ✓' returns after Save",
    await page.getByText(/Tuned for this machine/).isVisible().catch(() => false));
  const afterSave = await api(`/v1/ai/model-tunes?modelId=${MODEL}`);
  const names = afterSave.rows.map((r) => r.flagName);
  check("API rows > 0 after Save (grid verbatim)", afterSave.rows.length > 0, `rows=${names.join(",")}`);
  check("the saved snapshot carries a base default (flash_attn)", names.includes("flash_attn"));

  console.log(`\npage errors: ${errors.length}`);
  if (errors.length) { console.log(errors.slice(0, 6).join("\n")); failed = true; }
  console.log(failed ? "\nTUNE-SAVE PROBE: FAIL" : "\nTUNE-SAVE PROBE: PASS");
} catch (e) {
  console.error("probe error:", e.message);
  failed = true;
} finally {
  await api(`/v1/ai/model-tunes?modelId=${MODEL}`, { method: "DELETE" }).catch(() => {});
  await browser.close();
  process.exit(failed ? 1 : 0);
}
