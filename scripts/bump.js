#!/usr/bin/env node
// Version bumper for JustWrite. Updates the three files that have to
// agree on a version number — package.json, src-tauri/Cargo.toml,
// src-tauri/tauri.conf.json — and stops. Does NOT commit or tag; the
// user owns git operations.
//
// Usage:
//   npm run bump 0.2.0

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  packageJson: resolve(ROOT, "package.json"),
  cargoToml:   resolve(ROOT, "src-tauri/Cargo.toml"),
  tauriConf:   resolve(ROOT, "src-tauri/tauri.conf.json"),
};

const version = process.argv[2];

if (!version) {
  console.error("Usage: npm run bump <version>   (e.g. 0.2.0)");
  process.exit(1);
}
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error(`Invalid version "${version}". Expected semver like 0.2.0 or 0.2.0-rc.1`);
  process.exit(1);
}

async function bumpJson(path, key) {
  const raw = await readFile(path, "utf8");
  const obj = JSON.parse(raw);
  const old = obj[key];
  obj[key] = version;
  // Preserve indent (2 spaces) and trailing newline.
  await writeFile(path, `${JSON.stringify(obj, null, 2)}\n`);
  return old;
}

async function bumpCargo(path) {
  const raw = await readFile(path, "utf8");
  const m = raw.match(/^version\s*=\s*"([^"]+)"/m);
  if (!m) throw new Error(`No version line found in ${path}`);
  const old = m[1];
  const next = raw.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`);
  await writeFile(path, next);
  return old;
}

try {
  const pkgOld   = await bumpJson(FILES.packageJson, "version");
  const tauriOld = await bumpJson(FILES.tauriConf,   "version");
  const cargoOld = await bumpCargo(FILES.cargoToml);

  console.log(`Bumped:`);
  console.log(`  package.json        ${pkgOld}   → ${version}`);
  console.log(`  src-tauri/Cargo.toml ${cargoOld}  → ${version}`);
  console.log(`  src-tauri/tauri.conf.json ${tauriOld}   → ${version}`);
  console.log("");
  console.log("Next steps (your call):");
  console.log(`  git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json`);
  console.log(`  git commit -m "release: v${version}"`);
  console.log(`  git tag v${version}`);
  console.log(`  git push && git push --tags`);
  console.log(`  npm run release   # triggers the GitHub Actions build`);
} catch (err) {
  console.error("Bump failed:", err.message);
  process.exit(1);
}
