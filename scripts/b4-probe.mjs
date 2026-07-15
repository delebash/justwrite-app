// B4 probe — the Presets-page LAYOUT / UX-invariant acceptance (2026-07-15 one-source
// rewrite). The TaskKinds page this probe originally asserted is DELETED; the Presets
// page is its successor and this probe is repointed to it. It keeps B4's "acceptance-diff
// discipline" for the PAGE STRUCTURE + the Option-A create/rename/delete UX:
//   #28  the assign-a-feature picker sits ON the "Features using this preset" heading line;
//   #29  REPLACED (was: two columns) → the detail is a SINGLE pane; the two-column
//        task layout is gone with the task tier. FLAGGED design change.
//   A1   no Default-preset fallback row; "Reset all to defaults" survives in the aside;
//   A2   the assign picker reads "Assign a feature here…" and every option names the
//        preset the feature comes FROM (honest move provenance);
//   A3   "+ New preset" opens an IN-PANE form (no popup) with Save disabled while empty;
//   A4   REPLACED (was: a preset is required to Save) → the create form is NAME-ONLY now
//        (a preset owns its own params; there is no preset-of-a-preset). Name alone
//        enables Save, and the form carries NO preset picker. FLAGGED design change.
//   A5-A7 create round-trip · inline rename on blur · delete cleanup.
// The per-ACTION test-input affordances (old #30/QC-9/QC-35/#35 checks) moved off this
// page: qc35-probe.mjs owns them on the Routing-by-feature Workbench, and
// headless-smoke.mjs owns the one-flat-column sampler grid. The functional create/assign
// flow is also covered end-to-end by presets-probe.mjs; here the focus is the LAYOUT diff.
// findChrome copied from scripts/headless-smoke.mjs per JW CLAUDE.md.
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

function findChrome() {
  if (process.env.JW_CHROME && existsSync(process.env.JW_CHROME)) return process.env.JW_CHROME;
  const roots = ["/opt/pw-browsers", `${process.env.HOME || ""}/.cache/ms-playwright`,
    `${process.env.LOCALAPPDATA || ""}/ms-playwright`];
  for (const root of roots) {
    if (!root || !existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      if (!dir.startsWith("chromium") || dir.includes("headless_shell")) continue;
      for (const sub of ["chrome-linux/chrome", "chrome-win64/chrome.exe", "chrome-win/chrome.exe"]) {
        const exe = `${root}/${dir}/${sub}`;
        if (existsSync(exe)) return exe;
      }
    }
  }
  return undefined;
}

const results = [];
const check = (name, ok, note = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${note ? ` — ${String(note).slice(0, 200)}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 980 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));

await page.goto("http://localhost:1420", { waitUntil: "networkidle" });
await sleep(1500);
try { await page.click('button:has-text("Got it")', { timeout: 1500 }); } catch { /* none */ }

// The Presets tab lives in the AI area.
await page.evaluate(() => { window.location.hash = "#/ai"; });
await sleep(1500);
await page.evaluate(() => {
  [...document.querySelectorAll(".lu-subnav a")].find((a) => a.textContent.trim() === "Presets")?.click();
});
await sleep(2000);

// #28: the assign-a-feature picker sits ON the "Features using this preset" heading line.
const b41 = await page.evaluate(() => {
  const h = [...document.querySelectorAll(".lu-tk-sec-h")].find((x) => x.textContent.includes("Features using this preset"));
  return { headerHasAdd: !!h?.querySelector(".ui-select-trigger"), strayAddBelow: !!document.querySelector(".lu-tk-members ~ .ui-select-trigger") };
});
check("#28 Assign-a-feature is ON the Features heading line", b41.headerHasAdd && !b41.strayAddBelow, JSON.stringify(b41));

// #29 REPLACED (design change, flagged): the detail is a SINGLE pane — the old
// two-column task layout (.lu-tk-cols) is gone with the task tier; the members list
// and the Lab stack vertically in the one edit pane.
const b42 = await page.evaluate(() => ({
  twoCol: !!document.querySelector(".lu-tk-cols"),
  singlePane: !!document.querySelector(".lu-fw-edit"),
  sections: document.querySelectorAll(".lu-fw-edit .lu-tk-sec").length,
}));
check("#29 (was 2-col) NEW: single detail pane, no .lu-tk-cols two-column layout",
  !b42.twoCol && b42.singlePane && b42.sections >= 1, JSON.stringify(b42));

// A1: no Default-preset fallback row; "Reset all" survives in the aside.
const a1 = await page.evaluate(() => ({
  fallback: !!document.querySelector(".lu-tk-default-k"),
  resetAll: [...document.querySelectorAll(".lu-fw-list button")].some((b) => b.textContent.includes("Reset all to defaults")),
}));
check("A1 QC-15: no Default-preset fallback row; Reset-all survives", !a1.fallback && a1.resetAll, JSON.stringify(a1));

// A2: create a fresh EMPTY preset so its assign picker offers every feature with
// its "— from <preset>" provenance (an occupied built-in would show fewer).
await page.click(".lu-tk-new");
await sleep(600);
await page.fill(".lu-tk-createform input.ui-input", "Probe layout A");
await sleep(300);
// A4 REPLACED (design change, flagged): NAME ALONE enables Save (name-only create —
// no preset picker in the form; a preset is not composed of another preset).
const a4 = await page.evaluate(() => ({
  saveEnabled: [...document.querySelectorAll(".lu-tk-createactions button")]
    .find((x) => x.textContent.trim() === "Save")?.disabled === false,
  presetPickerInForm: !!document.querySelector(".lu-tk-createform .ui-select-trigger"),
}));
check("A4 (was preset-required) NEW: name-only create — Save enabled by name; no preset picker in the form",
  a4.saveEnabled && !a4.presetPickerInForm, JSON.stringify(a4));
await page.evaluate(() => {
  [...document.querySelectorAll(".lu-tk-createactions button")].find((x) => x.textContent.trim() === "Save")?.click();
});
await sleep(1000);
// A5: create round-trip selects the new preset (its inline name field shows it).
const a5 = await page.evaluate(() => ({
  activeCard: document.querySelector(".lu-fw-card.is-active")?.textContent.trim().slice(0, 40) || "",
  nameField: document.querySelector("input.lu-tk-name")?.value || "",
}));
check("A5 QC-15: create round-trip selects the new preset",
  a5.activeCard.includes("Probe layout A") && a5.nameField === "Probe layout A", JSON.stringify(a5));

// A3: re-open the create form to assert the in-pane, no-popup, Save-disabled-while-empty shape.
await page.click(".lu-tk-new");
await sleep(600);
const a3 = await page.evaluate(() => ({
  dialog: !!document.querySelector("[role=dialog]"),
  form: !!document.querySelector(".lu-tk-createform"),
  saveDisabled: [...document.querySelectorAll(".lu-tk-createactions button")]
    .find((x) => x.textContent.trim() === "Save")?.disabled ?? null,
}));
check("A3 QC-15: + New preset = in-pane form, NO popup, Save disabled while empty",
  !a3.dialog && a3.form && a3.saveDisabled === true, JSON.stringify(a3));
// Cancel back to the created preset.
await page.evaluate(() => [...document.querySelectorAll(".lu-tk-createactions button")].find((b) => b.textContent.trim() === "Cancel")?.click());
await sleep(500);
await page.evaluate(() => {
  [...document.querySelectorAll(".lu-fw-list .lu-fw-card")]
    .find((c) => c.textContent.includes("Probe layout A"))?.click();
});
await sleep(800);

// A2b: the empty preset's assign picker reads "Assign a feature here…" and every
// offered feature names the preset it comes FROM.
const a2 = await page.evaluate(() => {
  const h = [...document.querySelectorAll(".lu-tk-sec-h")].find((x) => x.textContent.includes("Features using this preset"));
  return { trigger: h?.querySelector(".ui-select-trigger")?.textContent.trim() || "" };
});
check("A2 QC-16: picker reads 'Assign a feature here…'", /assign a feature here/i.test(a2.trigger), JSON.stringify(a2));
await page.click(".lu-fw-edit .lu-tk-sec-h .ui-select-trigger");
await sleep(600);
const a2b = await page.evaluate(() => {
  const opts = [...document.querySelectorAll("[role=option]")].map((o) => o.textContent.trim());
  return { count: opts.length, fromCount: opts.filter((t) => /— from /.test(t)).length };
});
await page.keyboard.press("Escape");
await sleep(300);
check("A2b QC-16: every offered feature says which preset it comes from",
  a2b.count > 1 && a2b.fromCount === a2b.count - 1, JSON.stringify(a2b));

// A6: rename is the inline field — type, blur, the list card updates. No popup.
await page.fill("input.lu-tk-name", "Probe layout B");
await page.evaluate(() => document.querySelector("input.lu-tk-name")?.blur());
await sleep(900);
const a6 = await page.evaluate(() => ({
  renamed: [...document.querySelectorAll(".lu-fw-card")].some((c) => c.textContent.includes("Probe layout B")),
  oldGone: ![...document.querySelectorAll(".lu-fw-card")].some((c) => c.textContent.includes("Probe layout A")),
  dialog: !!document.querySelector("[role=dialog]"),
}));
check("A6 QC-15: inline rename saves on blur (no popup)", a6.renamed && a6.oldGone && !a6.dialog, JSON.stringify(a6));

// A7: delete the probe preset (custom-only Delete → its confirm) so the DB is left as found.
await page.evaluate(() => {
  [...document.querySelectorAll(".lu-fw-edit .lu-fw-h button")].find((b) => b.textContent.trim() === "Delete")?.click();
});
await sleep(700);
await page.evaluate(() => {
  const dlg = document.querySelector('[role=dialog], [role=alertdialog]');
  const btns = [...(dlg?.querySelectorAll("button") || [])];
  btns.reverse().find((b) => b.textContent.trim() && !/cancel/i.test(b.textContent))?.click();
});
await sleep(900);
const a7 = await page.evaluate(() =>
  ![...document.querySelectorAll(".lu-fw-card")].some((c) => c.textContent.includes("Probe layout B")));
check("A7 cleanup: probe preset deleted — DB left as found", a7);

console.log(`\npage errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log("  " + e));
const fails = results.filter((r) => !r.ok);
console.log(fails.length ? `B4 PROBE FAILED: ${fails.map((f) => f.name).join(", ")}` : "B4 PROBE PASSED");
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
