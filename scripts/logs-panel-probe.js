// Logs phase probe — the upgraded shared LogsPanel (App Settings → Logs), live
// against the real server: (a) the day picker renders with "Live tail" + the
// stored days from /v1/logs/days; (b) the level filter reduces/empties the row
// list; (c) Clear (live mode) empties the tail; (d) "Delete all logs" raises the
// kit confirmDialog (cancelled — no destructive side effect); (e) 0 page errors.
// Reuses findChrome() from headless-smoke.js. Prereqs: server :17495 + vite :1420.
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const APP = process.env.JW_APP || "http://localhost:1420";
const API = process.env.JW_API || "http://127.0.0.1:17495";

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

// Seed: ensure the server is up + fabricate a STORED day with known lines so the
// day picker + the GROUP-AWARE level filter are deterministically testable (an
// ERROR line's traceback continuation must survive "Errors only" — the whole
// point of group filtering). Written straight into the server's logs dir.
const health = await (await fetch(`${API}/v1/health`)).json();
const { writeFileSync } = await import("node:fs");
const SEED_DAY = "2026-07-02";
writeFileSync(`${health.dataDir}/logs/justwrite.log.${SEED_DAY}`, [
  // Strict ISO with `.mmm` — the format the server actually writes since
  // 2026-07-19 (logs_api.py `_FMT`). The old `10:00:00,000` seed still PASSED
  // every assertion here while silently no longer resembling a real log line, so
  // this probe had stopped exercising the stamp localisation entirely.
  "2026-07-02T10:00:00.000 [INFO] seed: info line one",
  "2026-07-02T10:00:01.000 [INFO] seed: info line two",
  "2026-07-02T10:00:02.000 [ERROR] seed: boom happened",
  "  Traceback (most recent call last): continuation line",
].join("\n"), "utf-8");
// The day PICKER shows the localised label (formatLogDay) while the id on the wire
// stays ISO — mirror the kit's formatter so this probe asserts what the reader
// sees rather than hardcoding one locale's punctuation.
const [sy, sm, sd] = SEED_DAY.split("-").map(Number);
const SEED_DAY_LOCAL = new Intl.DateTimeFormat(undefined, {
  year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(sy, sm - 1, sd));

const browser = await chromium.launch({ executablePath: findChrome(), args: ["--no-sandbox"] });
// Clipboard permission so the Copy assertion can read back what was written
// (Copy must export RAW ISO even though the screen shows the localised form).
const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
const page = await context.newPage();
const BENIGN = [/fonts\.googleapis\.com/, /fonts\.gstatic\.com/, /net::ERR_CONNECTION_RESET/];
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
page.on("response", (r) => { if (r.status() >= 400 && !BENIGN.some((re) => re.test(r.url()))) errors.push(`${r.status()} ${r.url()}`); });

try {
  await page.goto(`${APP}/#/settings`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Logs", exact: true }).or(page.getByText("Logs", { exact: true })).first().click();
  await sleep(900);

  check("panel renders (Server logs + per-day copy)",
    await page.getByText("Server logs").isVisible().catch(() => false));
  const selects = page.locator(".lu-logs .ui-select-trigger");
  check("day picker + level filter render (2 selects)", (await selects.count()) === 2);
  check("day picker shows Live tail", /Live tail/.test((await selects.first().textContent()) || ""));
  check("Clear + Delete day + Delete all buttons render",
    await page.getByRole("button", { name: "Clear" }).isVisible().catch(() => false)
    && await page.getByRole("button", { name: "Delete day" }).isVisible().catch(() => false)
    && await page.getByRole("button", { name: "Delete all logs" }).isVisible().catch(() => false));

  // (b) pick the SEEDED stored day → 4 rows at All; "Errors only" → the ERROR
  // line PLUS its traceback continuation (group-aware filtering) = exactly 2.
  await selects.first().click();
  // the OPTION is labelled in the reader's format now, not the ISO id
  const dayOptionText = (await page.locator("[role=option]").allTextContents()).join(" | ");
  check("day picker labels the stored day in the reader's format",
    dayOptionText.includes(SEED_DAY_LOCAL) && !dayOptionText.includes(SEED_DAY),
    `want ${SEED_DAY_LOCAL}, not ${SEED_DAY} — saw: ${dayOptionText}`);
  await page.getByRole("option", { name: new RegExp(SEED_DAY_LOCAL.replace(/\//g, "\\/")) }).click();
  await sleep(700);
  const allRows = await page.locator(".lu-logline").count();
  check("stored day renders its 4 seeded lines", allRows === 4, `rows=${allRows}`);

  // THE localisation assertion this probe was missing: the seeded lines are
  // written in strict ISO, so anything ISO still on screen means formatLogStamp
  // never ran on the real render path.
  const firstLine = (await page.locator(".lu-logline").first().textContent()) || "";
  check("log line stamp is localised on screen (no raw ISO left)",
    !firstLine.includes("2026-07-02T10:00:00.000") && /seed: info line one/.test(firstLine),
    `line=${firstLine.trim()}`);

  // …and Copy still exports the RAW ISO line (artifact, like Download).
  await page.getByRole("button", { name: "Copy" }).click();
  await sleep(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => `CLIPBOARD-ERR ${e.message}`);
  check("Copy exports raw ISO with milliseconds",
    clip.includes("2026-07-02T10:00:00.000") && !clip.includes(SEED_DAY_LOCAL),
    `clip[0]=${(clip.split("\n")[0] || "").trim()}`);
  await selects.nth(1).click();
  await page.getByRole("option", { name: "Errors only" }).click();
  await sleep(400);
  const errRows = await page.locator(".lu-logline").count();
  check("group-aware filter: ERROR + its traceback line survive (2 rows)", errRows === 2, `rows=${errRows}`);
  await selects.nth(1).click();
  await page.getByRole("option", { name: "All levels" }).click();
  await sleep(300);
  // back to Live tail for the Clear check
  await selects.first().click();
  await page.getByRole("option", { name: /Live tail/ }).click();
  await sleep(500);

  // (c) Clear empties the live tail (ring) — the API confirms.
  await page.getByRole("button", { name: "Clear" }).click();
  await sleep(700);
  const tail = await (await fetch(`${API}/v1/logs/tail?lines=10`)).json();
  check("Clear emptied the ring (API tail empty)", tail.lines === 0 || tail.text === "");

  // (d) Delete all logs → the kit confirm dialog appears; CANCEL (no destruction).
  await page.getByRole("button", { name: "Delete all logs" }).click();
  await sleep(400);
  check("confirm dialog appears for Delete all",
    await page.getByText("Delete ALL logs?").isVisible().catch(() => false));
  await page.getByRole("button", { name: /Cancel/i }).click().catch(() => page.keyboard.press("Escape"));
  await sleep(300);

  console.log(`\npage errors: ${errors.length}`);
  if (errors.length) { console.log(errors.slice(0, 6).join("\n")); failed = true; }
  console.log(failed ? "\nLOGS-PANEL PROBE: FAIL" : "\nLOGS-PANEL PROBE: PASS");
} catch (e) {
  console.error("probe error:", e.message);
  failed = true;
} finally {
  await browser.close();
  process.exit(failed ? 1 : 0);
}
