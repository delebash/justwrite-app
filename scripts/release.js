#!/usr/bin/env node
// Triggers the GitHub Actions release build manually via the gh CLI.
//
// The release workflow is configured as workflow_dispatch only — pushes
// and tags do NOT trigger builds on their own. This script is the only
// way to kick a release, on purpose.
//
// Usage:
//   npm run release                       # all platforms, version from package.json
//   npm run release 0.2.0                 # all platforms, explicit version
//   npm run release:windows               # convenience — windows only
//   npm run release:macos                 # convenience — macos only
//   npm run release:linux                 # convenience — linux only
//   node scripts/release.js --platform windows   # flag form (also works)
//
// Preconditions (verified here):
//   - gh CLI installed and authenticated
//   - tag v<version> exists on origin
//   - the kit's and the sync engine's commits this app was built and tested with are on origin —
//     the runners build with those (core_ref, sync_ref), not their main, which every family app's
//     work moves on (the template's release.js)

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf8", cwd: ROOT, ...opts }).trim();
}
function tryRun(cmd) {
  try { return run(cmd, { stdio: ["ignore", "pipe", "ignore"] }); } catch { return null; }
}

function fail(msg) {
  console.error(`Release aborted: ${msg}`);
  process.exit(1);
}

// 1. Check gh CLI ----------------------------------------------------
if (tryRun("gh --version") === null) {
  fail("gh CLI not found. Install from https://cli.github.com/ then run `gh auth login`.");
}
if (tryRun("gh auth status") === null) {
  fail("gh CLI is not authenticated. Run `gh auth login` first.");
}

// 2. Parse args ------------------------------------------------------
const VALID_PLATFORMS = ["all", "windows", "macos", "linux"];
const argv = process.argv.slice(2);
let platform = "all";
let version = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--platform" || a === "-p") {
    platform = argv[++i];
    if (!VALID_PLATFORMS.includes(platform)) {
      fail(`Invalid platform "${platform}". One of: ${VALID_PLATFORMS.join(", ")}.`);
    }
  } else if (!a.startsWith("-") && !version) {
    version = a;
  }
}
if (!version) {
  const pkg = JSON.parse(await readFile(resolve(ROOT, "package.json"), "utf8"));
  version = pkg.version;
}
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  fail(`Invalid version "${version}". Use semver like 0.2.0.`);
}
const tag = `v${version}`;

// 3. Verify tag exists on origin ------------------------------------
const remoteTag = tryRun(`git ls-remote --tags origin ${tag}`);
if (!remoteTag) {
  fail(
    `Tag ${tag} not found on origin. Did you run:\n` +
    `  npm run bump ${version}\n` +
    `  git commit -am "release: ${tag}"\n` +
    `  git tag ${tag}\n` +
    `  git push && git push --tags`
  );
}

// 4. The kit's and the sync engine's commits ----------------------------
// beside the app, where the server's package.json points (`file:<dir>`)
const serverPkg = JSON.parse(await readFile(resolve(ROOT, "server", "package.json"), "utf8"));
function testedCommit(dep, label) {
  const dir = resolve(ROOT, "server", (serverPkg.dependencies?.[dep] || "").replace(/^file:/, ""));
  const repo = tryRun(`git -C "${dir}" rev-parse --show-toplevel`);
  const ref = repo && tryRun(`git -C "${repo}" rev-parse HEAD`);
  if (!ref) fail(`${label} (${dir}) isn't a git checkout.`);
  if (!tryRun(`git -C "${repo}" branch -r --contains ${ref}`)) fail(`${label}'s commit ${ref.slice(0, 7)} isn't on origin — push it first.`);
  if (tryRun(`git -C "${repo}" status --porcelain`)) {
    console.log(`Note: ${label} has changes not committed — the release builds its last commit, without them.`);
  }
  return ref;
}
const coreRef = testedCommit("@delebash/core", "the kit");
const syncRef = testedCommit("@delebash/sqlite-sync", "the sync engine");

// 5. Confirm ---------------------------------------------------------
const ARTIFACTS = {
  all:     ".dmg (macOS universal), .exe (Windows), .AppImage + .deb (Linux)",
  windows: ".exe (Windows only)",
  macos:   ".dmg (macOS universal only)",
  linux:   ".AppImage + .deb (Linux only)",
};
console.log(`Tag ${tag} found on origin. Ready to trigger the release workflow.`);
console.log(`Platforms: ${platform}; the kit at ${coreRef.slice(0, 7)}, the sync engine at ${syncRef.slice(0, 7)}`);
console.log("");
console.log("This will:");
console.log(`  - Build ${ARTIFACTS[platform]}`);
console.log(`  - Create / update GitHub Release '${tag}' with the binaries attached`);
console.log("  - Pack docs/ into docs.tar.gz and attach to the release");
console.log("  - Fire a repository_dispatch to justwrite-website so it rebuilds with the new docs");
console.log("");

const rl = createInterface({ input: stdin, output: stdout });
const answer = (await rl.question("Proceed? [y/N] ")).trim().toLowerCase();
rl.close();
if (answer !== "y" && answer !== "yes") {
  console.log("Cancelled.");
  process.exit(0);
}

// 6. Trigger ---------------------------------------------------------
console.log("Triggering...");
try {
  // Close stdin explicitly. With a fully inherited stdio the prior
  // readline prompt leaves a closed-pipe stdin behind when invoked
  // from a piped context (e.g. `echo y | npm run release`), which gh
  // then exits non-zero on. Inherit stdout/stderr so the run URL
  // still streams live — so execSync returns null: never run(), whose
  // trim() of that null threw and reported a run that had started as
  // failed (the template's v0.1.0, 2026-10-19).
  execSync(`gh workflow run release.yml -f tag=${tag} -f platforms=${platform} -f core_ref=${coreRef} -f sync_ref=${syncRef}`, {
    cwd: ROOT,
    stdio: ["ignore", "inherit", "inherit"],
  });
} catch {
  fail("gh workflow run failed. Check that the release.yml workflow exists on the default branch.");
}

console.log("");
console.log("Build started. Watch progress with:");
console.log("  gh run watch          # picks the latest run");
console.log("  gh run list -w release.yml");
console.log("");
console.log("Or open: https://github.com/delebash/justwrite-app/actions/workflows/release.yml");
