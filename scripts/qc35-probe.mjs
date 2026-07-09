// QC-35 (#232) acceptance probe — the per-action test-input affordances, LIVE.
// Asserts the locked mechanism on the running app (dev:vite :1420 + server
// :17495): per-action pickers, the "From this book" compose button running the
// feature's own composer over the real project, relationshipArc as
// sample+type only, the A-group header shape, and zero page errors.
// Run: node scripts/qc35-probe.mjs   (JW_BASE / JW_CHROME override)
import { execSync } from "node:child_process";
import { chromium } from "playwright-core";

const BASE = process.env.JW_BASE || "http://localhost:1420";
function findChrome() {
  if (process.env.JW_CHROME) return process.env.JW_CHROME;
  const hits = execSync("ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null")
    .toString().trim().split("\n").filter(Boolean);
  if (!hits.length) throw new Error("No chromium found under /opt/pw-browsers — set JW_CHROME.");
  return hits[0];
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${String(detail).slice(0, 160)}` : ""}`);
  if (!ok) failures += 1;
}

const browser = await chromium.launch({ executablePath: findChrome() });
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

await page.goto(`${BASE}/#/ai`, { waitUntil: "networkidle" });
await sleep(1500);
await page.evaluate(() => {
  [...document.querySelectorAll(".lu-subnav a")].find((a) => a.textContent.trim() === "Routing by task")?.click();
});
await sleep(2000);

async function openTask(label) {
  await page.evaluate((l) => {
    [...document.querySelectorAll(".lu-fw-card")].find((c) => c.querySelector(".lu-fw-card-label")?.textContent.trim().startsWith(l))?.click();
  }, label);
  await sleep(1200);
}
// The Lab's action is the task pane's "Test against" select (TaskKinds.vue).
// Reka selects need a REAL pointer click on the trigger + pointerup on the
// option (the b4-probe technique).
async function pickOption(matcher) {
  const hit = await page.evaluate((m) => {
    const opt = [...document.querySelectorAll("[role=option]")]
      .find((o) => o.textContent.trim().toLowerCase().includes(m.toLowerCase()));
    if (!opt) return null;
    const label = opt.textContent.trim();
    opt.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    opt.click();
    return label;
  }, matcher);
  await sleep(1000);
  return hit;
}
async function openFeature(label) {
  await page.click(".lu-tk-testrow .ui-select-trigger");
  await sleep(500);
  return pickOption(label);
}
async function fillState() {
  return page.evaluate(() => {
    const fill = document.querySelector(".lu-fw-testin-fill");
    const boxes = {};
    for (const f of document.querySelectorAll(".lu-fw-testin .lu-field")) {
      boxes[f.querySelector("label")?.textContent.trim()] = f.querySelector("textarea")?.value ?? "";
    }
    return {
      hasFillRow: !!fill,
      triggers: fill ? [...fill.querySelectorAll(".ui-select-trigger")].map((t) => t.textContent.trim()) : [],
      buttons: fill ? [...fill.querySelectorAll("button")].map((b) => b.textContent.trim()) : [],
      boxes,
    };
  });
}
async function clickFillButton(label) {
  await page.evaluate((l) => {
    [...document.querySelectorAll(".lu-fw-testin-fill button")].find((b) => b.textContent.trim() === l)?.click();
  }, label);
  await sleep(900);
}

// ── 1. Composed digest: Reverse outline gets ONE "From this book" button
//       that fills user_content from the real project via its composer. ──
await openTask("Structured extraction");
const featRO = await openFeature("Reverse outline");
let st = await fillState();
check("reverseOutline: feature selected in the Lab", featRO != null, featRO);
check("reverseOutline: NO dropdown — the book is the argument", st.triggers.length === 0, st.triggers.join(" · "));
check("reverseOutline: the 'From this book' compose button renders", st.buttons.includes("From this book"), st.buttons.join(" · "));
await clickFillButton("From this book");
st = await fillState();
const roText = st.boxes["User content"] || "";
check("reverseOutline: compose filled user_content with the composer's digest shape",
  roText.startsWith("The book has") && roText.includes("Chapter digest:"), roText.slice(0, 80));

// ── 2. relationshipArc: sample + type ONLY (the user's decided word). ──
const featRA = await openFeature("Relationship arc");
st = await fillState();
check("relationshipArc: feature selected", featRA != null, featRA);
check("relationshipArc: NO pickers and NO compose — Sample + type only",
  st.triggers.length === 0 && !st.buttons.includes("From this book"),
  `${st.triggers.length} pickers · ${st.buttons.join(" · ")}`);
check("relationshipArc: Sample button present", st.buttons.includes("Sample"));
await clickFillButton("Sample");
st = await fillState();
check("relationshipArc: the sample is the composer's PROFILE A/B + shared-chapters shape",
  (st.boxes["User content"] || "").startsWith("PROFILE A —")
    && (st.boxes["User content"] || "").includes("SHARED CHAPTERS"),
  (st.boxes["User content"] || "").slice(0, 60));

// ── 3. entitySweep: chapter picker RUNS the composer (bible block + frame). ──
const featES = await openFeature("Entity sweep");
st = await fillState();
check("entitySweep: chapter picker declared", st.triggers.some((t) => /chapter/i.test(t)), st.triggers.join(" · "));
await page.click(".lu-fw-testin-fill .ui-select-trigger");
await sleep(500);
const esPicked = await page.evaluate(() => {
  const opt = [...document.querySelectorAll("[role=option]")].find((o) => !/Insert from/.test(o.textContent));
  if (!opt) return null;
  const label = opt.textContent.trim();
  opt.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  opt.click();
  return label;
});
await sleep(900);
st = await fillState();
const esText = st.boxes["User content"] || "";
check("entitySweep: picking a chapter composed the bible block + framed chapter",
  esText.startsWith("Already in the story bible — DO NOT re-propose:") && esText.includes("--- BEGIN CHAPTER ---"),
  `picked="${esPicked}" → ${esText.slice(0, 60)}`);

// ── 4. A-group header shape: foreshadowing's chapter_label carries the run
//       header's trailing blank line (the template fuses label + frame). ──
const featFS = await openFeature("Foreshadowing");
st = await fillState();
check("foreshadowing: chapter picker declared", st.triggers.some((t) => /chapter/i.test(t)), st.triggers.join(" · "));
await page.click(".lu-fw-testin-fill .ui-select-trigger");
await sleep(500);
await page.evaluate(() => {
  const opt = [...document.querySelectorAll("[role=option]")].find((o) => !/Insert from/.test(o.textContent));
  opt?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  opt?.click();
});
await sleep(900);
st = await fillState();
const fsLabel = st.boxes["Chapter label"] ?? "";
check("foreshadowing: chapter_label is the run header ('Chapter N — Title' + blank line)",
  /^Chapter \d+ — .+\n\n$/.test(fsLabel) || fsLabel === "" /* untitled chapter → honest empty header */,
  JSON.stringify(fsLabel.slice(0, 60)));
check("foreshadowing: chapter_text filled", (st.boxes["Chapter text"] || "").length > 20);

// ── 5. Freeform: brainstorm has NO pickers/compose; Sample provides the
//       client-filled {{label}} variable too. ──
await openTask("Ideation");
st = await fillState();
check("ideation (brainstorm): no pickers, no compose — typed or Sample",
  st.triggers.length === 0 && !st.buttons.includes("From this book"), st.buttons.join(" · "));
await clickFillButton("Sample");
st = await fillState();
check("ideation: Sample fills the buildUserPrompt shape (Category/Seed)",
  (st.boxes["User content"] || "").startsWith("Category:"), (st.boxes["User content"] || "").slice(0, 50));

check("zero page errors", pageErrors.length === 0, pageErrors.join(" | "));
await browser.close();
console.log(failures ? `QC-35 PROBE FAILED (${failures})` : "QC-35 PROBE PASSED");
process.exit(failures ? 1 : 0);
