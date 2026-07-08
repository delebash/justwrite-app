// B4 probe — asserts the USER'S WORDS directly (the acceptance-diff discipline):
// #28 "move add a feature to same line as feature in this task"
// #29 "features … one column, make it 2 and move the Preset & test line … to the second column"
// #35 "don't make a specific advance section in the switches … one column"
// #30 "sample button with some sample data we have in database" + §7.3 Insert-from pickers.
// QC-9 "does it make sense to drop character info for generate prose?" — NO: a picker
//   renders only when its source can fill one of the open feature's boxes.
// findChrome copied from scripts/headless-smoke.mjs per JW CLAUDE.md.
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/home/user/justwrite-app/scripts/headless-smoke.mjs");
const { chromium } = require("playwright");
const OUT = "/tmp/claude-0/-home-user/3cfd68b9-10db-5b2c-8f07-e258fb196800/scratchpad";

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

const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 980 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));

await page.goto("http://localhost:1420", { waitUntil: "networkidle" });
await sleep(1500);
try { await page.click('button:has-text("Got it")', { timeout: 1500 }); } catch { /* none */ }
// The Tasks tab lives in the AI area.
await page.evaluate(() => { window.location.hash = "#/ai"; });
await sleep(1500);
await page.evaluate(() => {
  [...document.querySelectorAll(".lu-subnav button, .lu-subnav a, [role=tab], button")]
    .find((b) => b.textContent.trim() === "Tasks")?.click();
});
await sleep(2000);

// #28: the add-a-feature picker sits ON the "Features in this task" heading line.
const b41 = await page.evaluate(() => {
  const h = [...document.querySelectorAll(".lu-tk-sec-h")].find((x) => x.textContent.includes("Features in this task"));
  return { headerHasAdd: !!h?.querySelector(".ui-select-trigger"), strayAddBelow: !!document.querySelector(".lu-tk-members ~ .ui-select-trigger") };
});
check("#28 Add-a-feature is ON the Features heading line", b41.headerHasAdd && !b41.strayAddBelow, JSON.stringify(b41));

// #29: two columns — Features left, Preset & test right; the Lab spans below.
const b42 = await page.evaluate(() => {
  const cols = document.querySelector(".lu-tk-cols");
  if (!cols) return { cols: false };
  const secs = [...cols.querySelectorAll(":scope > .lu-tk-sec")];
  const [a, b] = secs.map((s) => s.getBoundingClientRect());
  return {
    cols: true, sections: secs.length,
    left: secs[0]?.textContent.includes("Features in this task"),
    right: secs[1]?.textContent.includes("Preset & test") && secs[1]?.textContent.includes("Test against"),
    sideBySide: a && b && Math.abs(a.top - b.top) < 8 && b.left > a.right - 4,
    labBelow: !!document.querySelector(".lu-tk-cols ~ .lu-tk-sec .lu-fw-tune"),
  };
});
check("#29 two columns (features | preset & test-against), Lab full-width below",
  b42.cols && b42.sections === 2 && b42.left && b42.right && b42.sideBySide && b42.labBelow, JSON.stringify(b42));

// #30/§7.3: the Sample button fills the vars from the DB sample; Insert-from pickers render.
// Wait FOR the button (the samples fetch lands async) instead of a fixed sleep.
let sampleReady = false;
for (let i = 0; i < 16 && !sampleReady; i++) {
  sampleReady = await page.evaluate(() =>
    [...document.querySelectorAll(".lu-fw-testin-h button")].some((b) => b.textContent.trim() === "Sample"));
  if (!sampleReady) await sleep(500);
}
const diag = await page.evaluate(() => ({
  active: document.querySelector(".lu-fw-card.is-active")?.textContent.trim().slice(0, 40),
  testin: !!document.querySelector(".lu-fw-testin"),
  hdr: [...document.querySelectorAll(".lu-fw-testin-h button")].map((b) => b.textContent.trim().slice(0, 24)),
}));
console.log("DIAG:", JSON.stringify(diag));
const before = await page.evaluate(() => {
  const ta = document.querySelector(".lu-fw-testin textarea");
  return ta ? ta.value : null;
});
await page.evaluate(() => {
  [...document.querySelectorAll(".lu-fw-testin-h button")].find((b) => b.textContent.trim() === "Sample")?.click();
});
await sleep(800);
const b44 = await page.evaluate(() => {
  const ta = document.querySelector(".lu-fw-testin textarea");
  const srcs = [...document.querySelectorAll(".lu-fw-testin-h .ui-select-trigger")];
  return {
    sampleBtn: [...document.querySelectorAll(".lu-fw-testin-h button")].some((b) => b.textContent.trim() === "Sample"),
    filled: (ta?.value || "").length > 20,
    text: (ta?.value || "").slice(0, 60),
    sources: srcs.length,
  };
});
check("#30 Sample button exists and fills the test input from the DB",
  b44.sampleBtn && b44.filled && before !== b44.text, b44.text);

// QC-9: on a prose feature ({passage, voiceCanon}) the character/location sources
// can't fill any box — ONLY the chapter picker may render (the user's sentence:
// "does it make sense to drop character info for generate prose?" — no).
const qc9a = await page.evaluate(() => {
  const labels = [...document.querySelectorAll(".lu-fw-testin .lu-field > label")].map((l) => l.textContent.trim());
  const triggers = [...document.querySelectorAll(".lu-fw-testin-h .ui-select-trigger")].map((t) => t.textContent.trim());
  return { labels, triggers };
});
check("QC-9 prose feature: chapter picker only — no character/location pickers",
  qc9a.triggers.length === 1 && /chapter/i.test(qc9a.triggers[0] || "")
    && !qc9a.triggers.some((t) => /character|location/i.test(t)),
  JSON.stringify(qc9a));

// Checker-caught fix (2026-07-08): Insert-from-CHAPTER must actually FILL the
// {{passage}} writing features, not just render. Clear the passage var, open
// the chapter picker, choose the first chapter, assert the textarea fills.
await page.evaluate(() => {
  const ta = document.querySelector(".lu-fw-testin textarea");
  const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
  set.call(ta, "");
  ta.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.click('.lu-fw-testin-h .ui-select-trigger:has-text("Insert from chapter")');
await sleep(700);
const picked = await page.evaluate(() => {
  const opts = [...document.querySelectorAll("[role=option]")];
  const first = opts.find((o) => !/Insert from/.test(o.textContent));
  if (!first) return null;
  const label = first.textContent.trim().slice(0, 30);
  first.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  first.click();
  return label;
});
await sleep(900);
const chapFill = await page.evaluate(() => {
  const ta = document.querySelector(".lu-fw-testin textarea");
  return (ta?.value || "").slice(0, 50);
});
check("checker-fix: Insert-from-chapter FILLS the passage on a writing feature",
  !!picked && chapFill.length > 20, `chapter="${picked}" passage="${chapFill}"`);
await page.screenshot({ path: `${OUT}/b4-tasks.png` });

// QC-9 (the other direction): on a user_content feature ALL THREE sources can
// fill — the pickers must come BACK (relevance filtering, not blanket hiding).
await page.evaluate(() => {
  [...document.querySelectorAll(".lu-fw-list .lu-fw-card")]
    .find((c) => c.textContent.includes("Structured extraction"))?.click();
});
await sleep(1200);
const qc9b = await page.evaluate(() => {
  const labels = [...document.querySelectorAll(".lu-fw-testin .lu-field > label")].map((l) => l.textContent.trim());
  const triggers = [...document.querySelectorAll(".lu-fw-testin-h .ui-select-trigger")].map((t) => t.textContent.trim());
  return { labels, triggers };
});
check("QC-9 user_content feature: all three pickers render (chapter + character + location)",
  qc9b.triggers.length === 3
    && ["chapter", "character", "location"].every((k) => qc9b.triggers.some((t) => new RegExp(k, "i").test(t))),
  JSON.stringify(qc9b));

// #35: the Lab column's sampler grid is ONE flat column (no Advanced, no multi-column).
await page.evaluate(() => {
  const d = [...document.querySelectorAll(".cc-samplers")];
  for (const el of d) el.open = true;
});
await sleep(600);
const b43 = await page.evaluate(() => {
  const grid = document.querySelector(".cc-samplers .ui-kg-check");
  if (!grid) return { grid: false };
  const rows = [...grid.querySelectorAll(".ui-kg-crow")];
  const lefts = new Set(rows.map((r) => Math.round(r.getBoundingClientRect().left)));
  return {
    grid: true, rows: rows.length,
    oneColumn: lefts.size === 1,
    advToggle: !!grid.querySelector(".ui-kg-advtoggle"),
    multiCol: grid.classList.contains("is-cols"),
  };
});
check("#35 samplers: ONE flat column — no Advanced section, no column spread",
  b43.grid && b43.rows > 5 && b43.oneColumn && !b43.advToggle && !b43.multiCol, JSON.stringify(b43));
await page.screenshot({ path: `${OUT}/b4-samplers.png` });

console.log(`\npage errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log("  " + e));
const fails = results.filter((r) => !r.ok);
console.log(fails.length ? `B4 PROBE FAILED: ${fails.map((f) => f.name).join(", ")}` : "B4 PROBE PASSED");
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
