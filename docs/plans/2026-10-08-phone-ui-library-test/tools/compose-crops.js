import { writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromeLaunchOptions } from "file:///E:/Dev/Web/just-llm-runner/scripts/lib/exec-resolve.js";
const require = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = require("playwright");
const [dir, states, x, y, cw, ch, scale] = [process.argv[2], process.argv[3].split(","), ...process.argv.slice(4).map(Number)];
const b = await chromium.launch(chromeLaunchOptions());
const p = await b.newPage();
for (const s of states) {
  const w = Math.round(cw * scale), h = Math.round(ch * scale);
  const html = `<html><body style="margin:0;background:#888;font:600 13px sans-serif;display:flex;gap:6px">${["real", "quasar", "element"].map((n) => `<div><div style="padding:3px 6px;background:#222;color:#fff">${n} — ${s}</div><div style="width:${w}px;height:${h}px;overflow:hidden;position:relative"><img src="${pathToFileURL(path.join(dir, `${n}-${s}.png`)).href}" style="position:absolute;left:${-x * scale}px;top:${-y * scale}px;width:${1280 * scale}px"></div></div>`).join("")}</body></html>`;
  const f = path.join(dir, `_crop-${s}.html`);
  writeFileSync(f, html);
  await p.setViewportSize({ width: w * 3 + 12, height: h + 24 });
  await p.goto(pathToFileURL(f).href);
  await p.waitForTimeout(150);
  await p.screenshot({ path: path.join(dir, `crop-${s}.png`), fullPage: true });
}
await b.close();
