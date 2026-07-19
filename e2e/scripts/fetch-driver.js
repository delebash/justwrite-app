#!/usr/bin/env node
// Fetches msedgedriver.exe matching the locally-installed Microsoft Edge.
// Runs automatically via `npm install` (postinstall). Re-run by hand with
// --force when the local Edge updates and you need a fresh driver.
//
// Why this exists: msedgedriver is version-coupled to Edge (which auto-
// updates ~monthly), is a 20 MB binary, and ships with a 21 MB license
// folder. Committing it means a stale blob and a fat repo. The script
// detects Edge via the Windows registry, downloads the matching driver
// from msedgedriver.microsoft.com, and falls back to LATEST_STABLE if
// detection fails. Idempotent: skips download when the existing driver
// already matches.

import { existsSync, mkdirSync } from "node:fs";
import { writeFile, unlink } from "node:fs/promises";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DRIVERS = resolve(ROOT, "drivers");
const DRIVER_EXE = resolve(DRIVERS, "msedgedriver.exe");
const FORCE = process.argv.includes("--force");

function tryExec(cmd) {
  try { return execSync(cmd, { encoding: "utf8" }).trim(); } catch { return null; }
}

function detectEdgeVersion() {
  // Read Edge's version from the Windows registry. The BLBeacon key
  // tracks the currently-active install across stable/beta channels.
  const ps = `powershell -NoProfile -Command "(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Edge\\BLBeacon' -ErrorAction SilentlyContinue).version"`;
  const out = tryExec(ps);
  return out && /^\d+(\.\d+){2,3}$/.test(out) ? out : null;
}

async function fetchLatestStable() {
  // Endpoint returns the version string as UTF-16 LE with BOM.
  const res = await fetch("https://msedgedriver.microsoft.com/LATEST_STABLE");
  if (!res.ok) throw new Error(`LATEST_STABLE lookup failed: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  let text = buf.toString("utf16le");
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  return text.trim();
}

function existingDriverVersion() {
  if (!existsSync(DRIVER_EXE)) return null;
  // `msedgedriver --version` prints: "Microsoft Edge WebDriver 148.0.3445.78 (...)"
  const out = tryExec(`"${DRIVER_EXE}" --version`);
  const m = out?.match(/(\d+(?:\.\d+){2,3})/);
  return m ? m[1] : null;
}

const majorOf = (v) => v ? v.split(".")[0] : null;

async function main() {
  let target = detectEdgeVersion();
  if (target) {
    console.log(`Local Edge: ${target}`);
  } else {
    console.log("Could not detect local Edge — falling back to LATEST_STABLE.");
    target = await fetchLatestStable();
    console.log(`LATEST_STABLE: ${target}`);
  }

  const existing = existingDriverVersion();
  if (!FORCE && existing && majorOf(existing) === majorOf(target)) {
    console.log(`msedgedriver ${existing} already matches Edge major ${majorOf(target)} — nothing to do.`);
    return;
  }
  if (existing) console.log(`Updating msedgedriver ${existing} → matching ${target}`);

  mkdirSync(DRIVERS, { recursive: true });

  const url = `https://msedgedriver.microsoft.com/${target}/edgedriver_win64.zip`;
  console.log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const zipPath = resolve(DRIVERS, "edgedriver.zip");
  await writeFile(zipPath, buf);

  console.log("Extracting…");
  // Windows 10+ ships bsdtar, which handles zip via -xf.
  execSync(`tar -xf "${zipPath}" -C "${DRIVERS}"`, { stdio: "inherit" });
  await unlink(zipPath);

  const installed = existingDriverVersion();
  console.log(`Installed: msedgedriver ${installed || "(version unknown)"}`);
}

main().catch((err) => {
  console.error("fetch-driver failed:", err.message);
  console.error("Fallback: download manually from https://msedgedriver.microsoft.com/ and drop msedgedriver.exe into e2e/drivers/.");
  process.exit(1);
});
