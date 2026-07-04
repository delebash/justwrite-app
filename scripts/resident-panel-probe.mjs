// SPDX-License-Identifier: GPL-3.0-or-later
// Targeted probe for the SVM Phase-4a "resident set + residency knobs" panel in
// the shared kit's LuRunnerEngine.vue (mounted in the Built-in provider form).
//
// The resident section is `v-if="installed"`, and the llama.cpp engine is NOT
// installed in CI/the dev container (no GPU, no binary), so the normal headless
// smoke can't exercise it. This probe MOCKS the two runner reads the panel makes
// — /v1/llm-runner/engine/status (installed:true) and /v1/llm-runner/resident (a
// set with loaded + sleeping + a META-LESS error row) — then asserts:
//   • the "Loaded models" section renders;
//   • EVERY status renders verbatim, incl. the error row (a failed model stays
//     visible, not hidden by a loaded/sleeping-only render) and tolerates the
//     missing n_ctx/vram meta on in-flight/error rows;
//   • the VRAM budget line renders;
//   • the two knobs render + seed from /resident;
//   • Save sends ONLY {modelsMax, sleepIdleSeconds} (the partial-PUT no-clobber
//     guard) — captured by intercepting the PUT.
// Zero JS errors throughout. Reuses the smoke's findChrome (never hardcode).
//
// Run (server + vite already up, as for headless-smoke):
//   node scripts/resident-panel-probe.mjs

import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const APP = process.env.JW_APP || "http://localhost:1420";

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

const ENGINE_STATUS = { installed: true, status: "installed", build: "b9644", gpu: "cuda12", hasRuntime: true };
const RESIDENT = {
  router: true, modelsMax: 3, sleepIdleSeconds: 300,
  vramTotalMb: 8192, committedMb: 5000, remainingMb: 3192,
  models: [
    { id: "qwen3-8b-q4", status: "loaded", nParams: 8e9, sizeBytes: 5e9, nCtx: 8192, vramMb: 5000 },
    { id: "nomic-embed", status: "sleeping", nParams: 1.3e8, sizeBytes: 3e8, nCtx: 2048, vramMb: 0 },
    { id: "gemma-27b-q8", status: "error", vramMb: 0 }, // in-flight/error row: NO nCtx/nParams meta
  ],
};

(async () => {
  const exe = findChrome();
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));

  // Mock the two runner reads the panel makes; capture the knob-save PUT body.
  let putBody = null;
  await page.route("**/v1/llm-runner/engine/status", (r) => r.fulfill({ json: ENGINE_STATUS }));
  await page.route("**/v1/llm-runner/resident", (r) => r.fulfill({ json: RESIDENT }));
  await page.route("**/v1/ai/engine-config", (r) => {
    if (r.request().method() === "PUT") {
      putBody = JSON.parse(r.request().postData() || "{}");
      return r.fulfill({ json: { ...ENGINE_STATUS, pinnedBuild: "b9644", safetyMarginMb: 1024, modelsMax: putBody.modelsMax, sleepIdleSeconds: putBody.sleepIdleSeconds, binaries: [] } });
    }
    return r.continue();
  });

  let failed = 0;
  const check = (name, ok, extra = "") => { if (!ok) failed++; console.log(`${ok ? "✓" : "✗"} ${name}${extra ? "   " + extra : ""}`); };

  try {
    await page.goto(APP, { waitUntil: "domcontentloaded" });
    await sleep(1500);
    await page.evaluate(() => { window.location.hash = "#/ai"; });
    await sleep(800);
    // Providers tab → Edit the built-in provider (same nav as the smoke's provider-form probe).
    await page.evaluate(() => [...document.querySelectorAll(".lu-subnav a")].find((a) => /providers/i.test(a.textContent))?.click());
    await sleep(500);
    await page.evaluate(() => [...document.querySelectorAll(".lu-prow button, .lu-prow .lu-btn")].find((b) => /edit/i.test(b.textContent))?.click());
    await sleep(900);

    const mark = errors.length;
    const view = await page.evaluate(() => {
      const sec = document.querySelector(".lu-eng-res");
      const rows = [...document.querySelectorAll(".lu-eng-res-item")].map((li) => ({
        id: li.querySelector(".lu-eng-res-id")?.textContent?.trim(),
        status: li.querySelector(".lu-eng-res-status")?.textContent?.trim(),
        metas: [...li.querySelectorAll(".lu-eng-res-meta")].map((m) => m.textContent.trim()),
      }));
      const knobCaps = [...document.querySelectorAll(".lu-eng-knob-cap")].map((e) => e.textContent.trim());
      const knobVals = [...document.querySelectorAll(".lu-eng-knob input")].map((e) => e.value);
      return {
        section: !!sec,
        title: sec?.textContent?.includes("Loaded models"),
        vram: document.querySelector(".lu-eng-res-vram")?.textContent?.trim() || "",
        rows, knobCaps, knobVals,
      };
    });

    check("section renders", view.section && view.title);
    check("all 3 rows render", view.rows.length === 3, JSON.stringify(view.rows.map((r) => r.id)));
    const statuses = view.rows.map((r) => r.status);
    check("every status verbatim (incl. error)", statuses.includes("loaded") && statuses.includes("sleeping") && statuses.includes("error"), statuses.join(","));
    const errRow = view.rows.find((r) => r.status === "error");
    check("meta-less error row tolerated (no ctx meta, still visible)", errRow && !errRow.metas.some((m) => m.startsWith("ctx")), JSON.stringify(errRow?.metas));
    check("VRAM budget line renders", /5000/.test(view.vram) && /8192/.test(view.vram), view.vram);
    check("two knobs render + seed from /resident", view.knobVals.length === 2 && view.knobVals[0] === "3" && view.knobVals[1] === "300", JSON.stringify({ caps: view.knobCaps, vals: view.knobVals }));

    // Edit models-max → Save → assert the PUT carried ONLY the two knobs (no-clobber guard).
    const first = page.locator(".lu-eng-knob input").first();
    await first.fill("2");
    await page.locator(".lu-eng-knobs button", { hasText: /save/i }).click();
    await sleep(500);
    check("Save sends ONLY {modelsMax, sleepIdleSeconds}", putBody && Object.keys(putBody).sort().join(",") === "modelsMax,sleepIdleSeconds", JSON.stringify(putBody));
    check("Save sent the edited modelsMax", putBody && putBody.modelsMax === 2, JSON.stringify(putBody));

    const newErrs = errors.length - mark;
    check("zero JS errors", newErrs === 0, errors.slice(mark, mark + 3).join(" | "));
  } catch (e) {
    failed++;
    console.log(`✗ probe threw: ${String(e.message || e)}`);
  } finally {
    await browser.close();
  }

  console.log(failed ? `\nRESIDENT-PANEL PROBE FAILED (${failed})` : "\nRESIDENT-PANEL PROBE PASSED");
  process.exit(failed ? 1 : 0);
})();
