// QC-20/21/23/24 probe — asserts the USER'S WORDS on the live surfaces
// (QC-22 is backend-only; its recreation lives in just-llm-runner/tests/test_autotune.py):
// QC-20 "the default provider is not set for llama after running quicksetup" —
//   the provider list tags the current default row; its button reads "Default ✓".
// QC-21 "when clicking on set default it falsely reports no embinding model is set" —
//   the built-in's dialog reads the ROUTING default and tells the truth.
// QC-23 "what happend to the shared ai progress bar?" — a Lab run shows the shared
//   AiTaskStrip (elapsed/cancel), not just a bare "Running…".
// QC-24 "character chat has no data to insert, the other one has two drop downs and
//   no sample" — In-character chat offers Sample (+ pickers when project data exists)
//   and every fill affordance sits in ONE row below the Test-input header.
// findChrome copied from scripts/headless-smoke.mjs per JW CLAUDE.md.
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/home/user/justwrite-app/scripts/headless-smoke.mjs");
const { chromium } = require("playwright");

function findChrome() {
  if (process.env.JW_CHROME && existsSync(process.env.JW_CHROME)) return process.env.JW_CHROME;
  for (const root of ["/opt/pw-browsers", `${process.env.HOME || ""}/.cache/ms-playwright`]) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      if (!dir.startsWith("chromium") || dir.includes("headless_shell")) continue;
      const exe = `${root}/${dir}/chrome-linux/chrome`;
      if (existsSync(exe)) return exe;
    }
  }
  return undefined;
}

const results = [];
const check = (name, ok, note = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const API = process.env.JW_API || "http://127.0.0.1:17495";
const routing = await (await fetch(`${API}/v1/ai/routing`)).json();
const localEmbed = routing?.default?.embeddingId === "local-llamacpp" ? (routing.default.embeddingModel || "") : "";

const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 980 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));

await page.goto("http://localhost:1420", { waitUntil: "networkidle" });
await sleep(1500);
try { await page.click('button:has-text("Got it")', { timeout: 1500 }); } catch { /* none */ }
await page.evaluate(() => { window.location.hash = "#/ai"; });
await sleep(2000);

// ── QC-20: the built-in row is tagged Default; its button reads already-set ──
const q20 = await page.evaluate(() => {
  const row = [...document.querySelectorAll(".lu-prow")].find((r) => r.textContent.includes("Built-in provider"));
  if (!row) return { found: false };
  const tag = row.querySelector(".lu-prow-name .ui-tag");
  const btns = [...row.querySelectorAll(".lu-prow-actions button")].map((b) => b.textContent.trim());
  return {
    found: true,
    tagged: tag?.textContent.trim() === "Default",
    btnLabel: btns.find((t) => t.includes("Default ✓") || t.includes("Set as default")) || "",
  };
});
check("QC-20: built-in provider row found", q20.found);
check("QC-20: the current default row carries the Default tag", !!q20.tagged);
check("QC-20: its Set-as-default affordance reads already-set (Default ✓)", q20.btnLabel === "Default ✓", q20.btnLabel);

// ── QC-21: the dialog on the built-in tells the truth about the embedding ──
await page.evaluate(() => {
  const row = [...document.querySelectorAll(".lu-prow")].find((r) => r.textContent.includes("Built-in provider"));
  [...(row?.querySelectorAll(".lu-prow-actions button") || [])]
    .find((b) => b.textContent.includes("Default ✓") || b.textContent.includes("Set as default"))?.click();
});
await sleep(800);
const q21 = await page.evaluate(() => {
  const lines = [...document.querySelectorAll(".lu-sd-line")].map((p) => p.textContent.trim());
  return { open: lines.length > 0, lines };
});
check("QC-21: the set-as-default dialog opened from the default row", q21.open);
if (localEmbed) {
  check(`QC-21: the dialog says the embedding (${localEmbed}) already runs here — unchanged`,
    q21.lines.some((l) => l.includes("already runs here — unchanged") && l.includes(localEmbed)),
    q21.lines.join(" | ").slice(0, 220));
  check("QC-21: the false 'no embedding model set' line is GONE",
    !q21.lines.some((l) => l.includes("no embedding model set")));
} else {
  check("QC-21: no local embedding is set — the keep-current line renders (truthful state)",
    q21.lines.some((l) => l.includes("no embedding model set")), "no routing embed on this DB");
}
await page.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Cancel")?.click();
});
await sleep(500);

// ── Tasks tab — QC-24 + QC-23 ──
await page.evaluate(() => {
  [...document.querySelectorAll(".lu-subnav a")].find((a) => a.textContent.trim() === "Routing by task")?.click();
});
await sleep(2000);

async function openTask(label) {
  await page.evaluate((l) => {
    [...document.querySelectorAll(".lu-fw-card")].find((c) => c.querySelector(".lu-fw-card-label")?.textContent.trim().startsWith(l))?.click();
  }, label);
  await sleep(1500);
}

// QC-24a: In-character chat — Sample present + fills all four boxes.
await openTask("In-character chat");
const q24a = await page.evaluate(() => {
  const fill = document.querySelector(".lu-fw-testin-fill");
  const header = document.querySelector(".lu-fw-testin-h");
  const sample = fill ? [...fill.querySelectorAll("button")].find((b) => b.textContent.trim() === "Sample") : null;
  const headerHasControls = !!header?.querySelector("button, .ui-select-trigger, select");
  // UiSelect's root is a Reka fragment — the rendered picker element is .ui-select-trigger.
  const pickers = fill ? [...fill.querySelectorAll(".ui-select-trigger")].map((p) => p.textContent.trim()) : [];
  return { hasFillRow: !!fill, hasSample: !!sample, headerHasControls, pickers };
});
check("QC-24: In-character chat has a fill-affordance row", q24a.hasFillRow);
check("QC-24: In-character chat has a Sample button (was: none)", q24a.hasSample);
check("QC-24: In-character chat offers the character picker (was: no data to insert)",
  q24a.pickers.some((t) => t.includes("character")), q24a.pickers.join(" · "));
check("QC-24: fill affordances live in their own row, NOT on the header line", !q24a.headerHasControls);
await page.evaluate(() => {
  [...document.querySelectorAll(".lu-fw-testin-fill button")].find((b) => b.textContent.trim() === "Sample")?.click();
});
await sleep(600);
const q24fill = await page.evaluate(() => {
  const out = {};
  for (const f of document.querySelectorAll(".lu-fw-testin .lu-field")) {
    out[f.querySelector("label")?.textContent.trim() || "?"] = (f.querySelector("textarea")?.value || "").slice(0, 60);
  }
  return out;
});
check("QC-24: Sample fills Character name (Mira)", (q24fill["Character name"] || "").includes("Mira"), JSON.stringify(q24fill).slice(0, 200));
check("QC-24: Sample fills Character profile", (q24fill["Character profile"] || "").length > 10);
check("QC-24: Sample fills Question + Excerpts",
  (q24fill.Question || "").length > 10 && (q24fill.Excerpts || "").length > 10);

// QC-24b: Grounded chat — the chapter picker now applies ({question, excerpts}).
await openTask("Grounded chat");
const q24b = await page.evaluate(() => {
  const fill = document.querySelector(".lu-fw-testin-fill");
  const pickers = fill ? [...fill.querySelectorAll(".ui-select-trigger")] : [];
  return {
    hasSample: !!fill && [...fill.querySelectorAll("button")].some((b) => b.textContent.trim() === "Sample"),
    chapterPicker: pickers.some((p) => p.textContent.includes("chapter")),
    pickerCount: pickers.length,
  };
});
check("QC-24: Grounded chat offers the chapter picker (was: NONE)", q24b.chapterPicker, `pickers=${q24b.pickerCount}`);
check("QC-24: Grounded chat has a Sample button", q24b.hasSample);

// QC-24c: Structured extraction — every picker + Sample in the ONE row.
await openTask("Structured extraction");
const q24c = await page.evaluate(() => {
  const fill = document.querySelector(".lu-fw-testin-fill");
  if (!fill) return { hasFillRow: false };
  const header = document.querySelector(".lu-fw-testin-h");
  const kids = [...fill.querySelectorAll(".ui-select-trigger"), ...fill.querySelectorAll("button")];
  const hb = header.getBoundingClientRect();
  const below = kids.every((k) => k.getBoundingClientRect().top >= hb.bottom - 1);
  return { hasFillRow: true, count: kids.length, allBelowHeader: below,
    headerHasControls: !!header.querySelector("button, .ui-select-trigger, select") };
});
check("QC-24: Structured extraction's pickers + Sample share the one fill row", q24c.hasFillRow && q24c.count >= 2, `controls=${q24c.count}`);
check("QC-24: nothing scattered onto the header line; all controls below it",
  !q24c.headerHasControls && q24c.allBelowHeader === true);

// ── QC-23: a Lab run shows the SHARED AiTaskStrip (delayed /v1/ai/run stub) ──
await page.route("**/v1/ai/run", async (route) => {
  await sleep(1800);
  await route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ content: "probe-ok", model: "probe-model", promptTokens: 3, completionTokens: 5, cost: 0 }) });
});
await page.evaluate(() => {
  [...document.querySelectorAll(".cc-run button")].find((b) => b.textContent.includes("Run"))?.click();
});
await sleep(900); // inside the stub's delay window — the run is in flight
const q23 = await page.evaluate(() => {
  const strip = document.querySelector(".sts");
  return {
    stripVisible: !!strip,
    label: strip?.querySelector(".sts-label")?.textContent || "",
    hasCancel: !!strip && [...strip.querySelectorAll("button")].some((b) => b.textContent.includes("Cancel")),
    bareRunning: !!document.querySelector(".cc-running"),
  };
});
check("QC-23: the shared AiTaskStrip renders during a Lab run", q23.stripVisible);
check("QC-23: the strip is THIS run's task (Lab test — …)", q23.label.startsWith("Lab test —"), q23.label);
check("QC-23: the strip carries Cancel; the bare Running… text is gone", q23.hasCancel && !q23.bareRunning);
await sleep(1600);
const q23done = await page.evaluate(() => ({
  out: document.querySelector(".cc-out .cc-pre")?.textContent || "",
  stripGone: !document.querySelector(".sts"),
}));
check("QC-23: the run completes into the column result and the strip clears",
  q23done.out.includes("probe-ok") && q23done.stripGone, q23done.out.slice(0, 40));

check("zero page errors", errors.length === 0, errors.join(" | ").slice(0, 300));

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
await browser.close();
process.exit(passed === results.length ? 0 : 1);
