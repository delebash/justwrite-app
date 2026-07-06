// Plan B T5 probe — the catalog grid's Type column + the Add-model form's quant
// dropdown / MTP-draft detection / capability checkboxes, driven LIVE against the
// user's REAL repo (unsloth/gemma-4-26B-A4B-it-qat-GGUF — main quant UD-Q4_K_XL
// QAT + 4 drafts under MTP/). Asserts: (a) the grid shows a Type column with
// Dense/MoE + MTP + Embed tags (Params column gone); (b) Add model → repo →
// "Read from link" → the quant UiSelect renders with size+QAT labels and the
// recommended pick landed; (c) the MTP-draft section auto-detected the drafts and
// pre-selected the SMALLEST (the user's measured Q4_0 @ 240MB); (d) the
// [MoE][MTP][Embedding] checkboxes render (the read-only Type/MTP rows are gone);
// (e) B2: the description auto-composes from the read facts into the EMPTY field;
// (f) B2 no-clobber: a hand-typed description survives a re-read.
// Reuses findChrome() from headless-smoke.mjs. Prereqs: server :17495 + vite :1420.
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const APP = process.env.JW_APP || "http://localhost:1420";
const GEMMA = "unsloth/gemma-4-26B-A4B-it-qat-GGUF";

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

let failed = false;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "   " + extra : ""}`);
  if (!ok) failed = true;
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ["--no-sandbox"] });
const page = await browser.newPage();
const BENIGN = [/fonts\.googleapis\.com/, /fonts\.gstatic\.com/, /net::ERR_CONNECTION_RESET/];
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
page.on("response", (r) => { if (r.status() >= 400 && !BENIGN.some((re) => re.test(r.url()))) errors.push(`${r.status()} ${r.url()}`); });

try {
  await page.goto(`${APP}/#/ai`, { waitUntil: "networkidle" });
  await page.evaluate(() => [...document.querySelectorAll(".lu-subnav a")].find((a) => /providers/i.test(a.textContent))?.click());
  await sleep(500);
  await page.evaluate(() => [...document.querySelectorAll(".lu-prow button, .lu-prow .lu-btn")].find((b) => /edit/i.test(b.textContent))?.click());
  await sleep(800);

  // (a) the grid: Type column with tags, Params header gone
  const grid = await page.evaluate(() => {
    const ths = [...document.querySelectorAll(".lu-mgrid thead th")].map((t) => t.textContent.trim());
    const tags = [...document.querySelectorAll(".lu-mtype .ui-tag")].map((t) => t.textContent.trim());
    return { ths, tags };
  });
  check("grid header has Type, not Params", grid.ths.includes("Type") && !grid.ths.includes("Params"), grid.ths.join("|"));
  check("Type tags render Dense + MoE", grid.tags.includes("Dense") && grid.tags.includes("MoE"));
  check("MTP + Embed tags render (35B-A3B is MTP; embeds seeded)", grid.tags.includes("MTP") && grid.tags.includes("Embed"));

  // (b)+(c)+(d) the Add-model form on the REAL gemma repo
  await page.evaluate(() => [...document.querySelectorAll(".lu-mcat button")].find((b) => /add model/i.test(b.textContent))?.click());
  await sleep(400);
  check("Add modal open", await page.locator(".lu-mm-form").isVisible());
  // capability checkboxes above the fit estimate; read-only Type/MTP rows gone
  const form = await page.evaluate(() => ({
    caps: [...document.querySelectorAll(".lu-mm-caps .ui-checkbox, .lu-mm-caps label")].length,
    capsText: document.querySelector(".lu-mm-caps")?.textContent || "",
    autoText: document.querySelector(".lu-mm-auto")?.textContent || "",
  }));
  check("[MoE][MTP][Embedding] checkboxes render", /MoE/.test(form.capsText) && /MTP/.test(form.capsText) && /Embedding/.test(form.capsText));
  check("read-only Type row is gone from the auto block", !/Type\s*dense/i.test(form.autoText));

  // type the real repo + Read from link (server-side HF fetch → listing + inspect)
  await page.locator(".lu-mm-form input").nth(2).fill(GEMMA); // Name, Id, HF repo — repo is the 3rd input on Add
  await page.getByRole("button", { name: "Read from link" }).click();
  await page.waitForFunction(() => {
    const f = document.querySelector(".lu-mm-form");
    return f && (f.textContent.includes("Draft file") || f.textContent.includes("Couldn't list"));
  }, { timeout: 60000 });
  await sleep(400);

  const after = await page.evaluate(() => ({
    text: document.querySelector(".lu-mm-form")?.textContent || "",
    selects: [...document.querySelectorAll(".lu-mm-form .ui-select-trigger")].map((s) => s.textContent.trim()),
  }));
  check("quant became a SELECT with the QAT label", after.selects.some((s) => /UD-Q4_K_XL/.test(s) && /QAT/.test(s)),
    after.selects.join(" || ").slice(0, 120));
  check("MTP draft section auto-detected", /MTP draft model/.test(after.text));
  check("smallest draft pre-selected (the user's Q4_0 @ 240MB)",
    after.selects.some((s) => /Q4_0-MTP\.gguf/.test(s)), after.selects.filter((s) => /MTP/.test(s)).join(" || ").slice(0, 140));

  // (e) B2: description auto-composed from the read facts (the field was empty on Add).
  // The "Draft file" wait above only proves the LISTING landed; the description composes
  // after the slower header INSPECT — wait for the button to re-enable (loading → done).
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /read from link/i.test(x.textContent));
    return b && !b.disabled;
  }, { timeout: 120000 });
  await sleep(200);
  const descBox = page.locator(".lu-mm-form textarea").first();
  const desc = await descBox.inputValue();
  check("description auto-composed (non-empty)", desc.trim().length > 0, desc.slice(0, 120));
  check("description carries the read facts (context/quant/MTP)",
    /context/.test(desc) && /UD-Q4_K_XL/.test(desc) && /MTP/.test(desc), desc.slice(0, 120));

  // (f) B2 no-clobber: a hand-typed description survives a re-read
  await descBox.fill("MY OWN WORDS");
  await page.getByRole("button", { name: "Read from link" }).click();
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /read from link/i.test(x.textContent));
    return b && !b.disabled;
  }, { timeout: 60000 });
  await sleep(400);
  check("hand-typed description NOT clobbered by re-read", (await descBox.inputValue()) === "MY OWN WORDS");

  console.log(`\npage errors: ${errors.length}`);
  if (errors.length) { console.log(errors.slice(0, 6).join("\n")); failed = true; }
  console.log(failed ? "\nCATALOG-TYPE PROBE: FAIL" : "\nCATALOG-TYPE PROBE: PASS");
} catch (e) {
  console.error("probe error:", e.message);
  failed = true;
} finally {
  await browser.close();
  process.exit(failed ? 1 : 0);
}
