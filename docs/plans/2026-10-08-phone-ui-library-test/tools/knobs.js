// The UI-library test's measurement: for each page (real / quasar / element) and each
// Settings → Appearance knob, apply the appearance live through the app's own engine
// (src/services/appearance.js — nothing is saved) and read the computed styles of the same
// controls on each page. A library "follows" a knob when its controls change the way the
// real page's do; it "matches" when the values are equal.
// usage (from justwrite-app): node <this> <outDir> [locationId]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { chromeLaunchOptions } from "file:///E:/Dev/Web/just-llm-runner/scripts/lib/exec-resolve.js";

const require = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = require("playwright");
const BASE = process.env.JW_UI || "http://localhost:1420";
const out = process.argv[2];
const locId = process.argv[3] || "l1";
mkdirSync(out, { recursive: true });

const ROUTES = { real: "/#/locations", quasar: "/#/ui-test/quasar/locations", element: "/#/ui-test/element/locations" };

// The same control on each page. [list-mode probes, detail-mode probes]
const PROBES = {
  list: {
    chip:      { real: ".entity-chip",                    quasar: ".q-chip.jw-chip",               element: ".el-check-tag.jw-chip" },
    chipOn:    { real: ".entity-chip.active",             quasar: ".q-chip.jw-chip--active",       element: ".el-check-tag.jw-chip.is-checked" },
    search:    { real: ".entity-search-input",            quasar: ".jw-search .q-field__control",  element: ".jw-search .el-input__wrapper" },
    th:        { real: ".ui-table thead th",              quasar: ".jw-table thead th",            element: ".jw-table th.el-table__cell" },
    td:        { real: ".ui-table tbody td",              quasar: ".jw-table tbody td",            element: ".jw-table td.el-table__cell" },
    primary:   { real: ".pane-actions .ui-btn--primary",  quasar: ".pane-actions .q-btn.bg-primary", element: ".pane-actions .el-button--primary" },
    ghost:     { real: ".pane-actions .ui-btn--ghost",    quasar: ".pane-actions .jw-btn--ghost",  element: ".pane-actions .jw-btn--ghost" },
    header:    { real: ".pane-header",                    quasar: ".pane-header",                  element: ".pane-header" },
  },
  detail: {
    primary:   { real: ".pane-actions .ui-btn--primary",  quasar: ".pane-actions .q-btn.bg-primary", element: ".pane-actions .el-button--primary" },
    ghost:     { real: ".pane-actions .ui-btn--ghost",    quasar: ".pane-actions .jw-btn--ghost",  element: ".pane-actions .jw-btn--ghost" },
    title:     { real: "input.entity-name",               quasar: ".jw-name-field input",          element: ".jw-name-field input" },
    field:     { real: ".pane-card input.ui-input",       quasar: ".pane-card .jw-field .q-field__control", element: ".pane-card .jw-field .el-input__wrapper" },
    fieldText: { real: ".pane-card input.ui-input",       quasar: ".pane-card .jw-field input",    element: ".pane-card .jw-field input" },
    check:     { real: ".ui-checkbox-box",                quasar: ".jw-check .q-checkbox__bg",     element: ".jw-check .el-checkbox__inner" },
    status:    { real: ".status-pill",                    quasar: ".jw-status .q-field__control",  element: ".jw-status .el-select__wrapper" },
    tb:        { real: ".editor-toolbar .tb-btn:not(:disabled)", quasar: ".editor-toolbar .jw-tb:not(.disabled)", element: ".editor-toolbar .jw-tb:not(.is-disabled)" },
    header:    { real: ".pane-header",                    quasar: ".pane-header",                  element: ".pane-header" },
  },
};
const PROPS = ["backgroundColor", "color", "borderTopLeftRadius", "paddingTop", "paddingLeft", "fontSize",
  "fontFamily", "fontWeight", "textTransform", "letterSpacing", "borderTopColor", "height", "width"];

// Each knob, applied on top of the app's default appearance.
const KNOBS = {
  default: {},
  dark: { mode: "dark" },
  accent: { accentHue: 270 },
  radius: { btnRadius: "pill" },
  density: { btnDensity: "compact" },
  caps: { btnLabelCase: "uppercase" },
  uiFont: { uiFont: "Atkinson Hyperlegible" },
  displayFont: { displayFont: "EB Garamond" },
  ink: { inkPalette: "sepia" },
};

async function read(page, probes) {
  return page.evaluate(({ probes, PROPS }) => {
    const res = {};
    for (const [k, sel] of Object.entries(probes)) {
      const el = document.querySelector(sel);
      if (!el) { res[k] = null; continue; }
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      res[k] = Object.fromEntries(PROPS.map((p) => [p, p === "height" ? Math.round(r.height) : p === "width" ? Math.round(r.width) : cs[p]]));
    }
    return res;
  }, { probes, PROPS });
}

const browser = await chromium.launch(chromeLaunchOptions());
const data = {};
for (const [name, route] of Object.entries(ROUTES)) {
  for (const mode of ["list", "detail"]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
    const page = await ctx.newPage();
    await page.goto(BASE + route + (mode === "detail" ? `/${locId}` : ""), { waitUntil: "networkidle" });
    const skip = page.getByText("Continue without waiting");
    if (await skip.isVisible().catch(() => false)) await skip.click();
    await page.waitForTimeout(1200);
    const probes = Object.fromEntries(Object.entries(PROBES[mode]).map(([k, v]) => [k, v[name]]));
    for (const [knob, patch] of Object.entries(KNOBS)) {
      await page.evaluate(async (patch) => {
        const m = await import("/src/services/appearance.js");
        m.applyAppearance({ ...m.DEFAULT_APPEARANCE, ...patch });
      }, patch);
      await page.waitForTimeout(700);
      (data[name] ??= {})[`${mode}:${knob}`] = await read(page, probes);
      if (knob === "dark" || knob === "default") await page.screenshot({ path: path.join(out, `${name}-${mode}-${knob}.png`) });
    }
    await ctx.close();
  }
}
await browser.close();
writeFileSync(path.join(out, "knobs.json"), JSON.stringify(data, null, 2));

// Summary: per knob × control, did each library change where the real page changed, and
// does it end up equal?
const lines = [];
for (const mode of ["list", "detail"]) {
  for (const knob of Object.keys(KNOBS)) {
    if (knob === "default") continue;
    for (const ctl of Object.keys(PROBES[mode])) {
      const r0 = data.real[`${mode}:default`][ctl];
      const r1 = data.real[`${mode}:${knob}`][ctl];
      if (!r0 || !r1) continue;
      const changed = PROPS.filter((p) => r0[p] !== r1[p] && p !== "width");
      if (!changed.length) continue;
      for (const lib of ["quasar", "element"]) {
        const l0 = data[lib][`${mode}:default`][ctl];
        const l1 = data[lib][`${mode}:${knob}`][ctl];
        if (!l0 || !l1) { lines.push(`${mode} ${knob} ${ctl} ${lib}: MISSING`); continue; }
        const follows = changed.filter((p) => l0[p] !== l1[p]);
        const equal = changed.filter((p) => l1[p] === r1[p]);
        lines.push(`${mode} ${knob.padEnd(11)} ${ctl.padEnd(9)} ${lib.padEnd(7)} follows ${follows.length}/${changed.length} equal ${equal.length}/${changed.length}  [${changed.filter((p) => !follows.includes(p)).join(",")}]`);
      }
    }
  }
}
writeFileSync(path.join(out, "summary.txt"), lines.join("\n"));
console.log(lines.join("\n"));
