import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromeLaunchOptions } from "file:///E:/Dev/Web/just-llm-runner/scripts/lib/exec-resolve.js";
const require = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = require("playwright");
const dir = process.argv[2];
const states = [...new Set(readdirSync(dir).filter((f) => f.startsWith("real-") && f.endsWith(".png")).map((f) => f.slice(5, -4)))];
const b = await chromium.launch(chromeLaunchOptions());
const p = await b.newPage({ viewport: { width: 1920, height: 400 } });
for (const s of states) {
  const phone = s.startsWith("phone");
  const w = phone ? 390 : 640;
  const html = `<html><body style="margin:0;background:#888;font:600 14px sans-serif;display:flex;gap:6px">${["real", "quasar", "element"].map((n) => `<div><div style="padding:4px;background:#222;color:#fff">${n} — ${s}</div><img src="${pathToFileURL(path.join(dir, `${n}-${s}.png`)).href}" style="width:${w}px;display:block"></div>`).join("")}</body></html>`;
  const f = path.join(dir, `_cmp-${s}.html`);
  writeFileSync(f, html);
  await p.setViewportSize({ width: w * 3 + 12, height: 400 });
  await p.goto(pathToFileURL(f).href);
  await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(dir, `compare-${s}.png`), fullPage: true });
}
await b.close();
console.log(states.join("\n"));
