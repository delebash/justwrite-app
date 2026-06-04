#!/usr/bin/env node
// Triggers the GitHub Actions release build manually via the gh CLI.
//
// The release workflow is configured as workflow_dispatch only — pushes
// and tags do NOT trigger builds on their own. This script is the only
// way to kick a release, on purpose.
//
// Usage:
//   npm run release           # uses version from package.json
//   npm run release 0.2.0     # explicit version
//
// Preconditions (verified here):
//   - gh CLI installed and authenticated
//   - tag v<version> exists on origin
//   - working tree is clean

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
  try { return run(cmd); } catch { return null; }
}

function fail(msg) {
  console.error("Release aborted: " + msg);
  process.exit(1);
}

// 1. Check gh CLI ----------------------------------------------------
if (tryRun("gh --version") === null) {
  fail("gh CLI not found. Install from https://cli.github.com/ then run `gh auth login`.");
}
if (tryRun("gh auth status") === null) {
  fail("gh CLI is not authenticated. Run `gh auth login` first.");
}

// 2. Resolve version -------------------------------------------------
let version = process.argv[2];
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

// 4. Confirm ---------------------------------------------------------
console.log(`Tag ${tag} found on origin. Ready to trigger the release workflow.`);
console.log("");
console.log("This will:");
console.log("  - Build .dmg (macOS universal), .exe + .msi (Windows), .AppImage + .deb + .rpm (Linux)");
console.log("  - Create GitHub Release '" + tag + "' with the binaries attached");
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

// 5. Trigger ---------------------------------------------------------
console.log("Triggering...");
try {
  run(`gh workflow run release.yml -f tag=${tag}`, { stdio: "inherit" });
} catch {
  fail("gh workflow run failed. Check that the release.yml workflow exists on the default branch.");
}

console.log("");
console.log("Build started. Watch progress with:");
console.log("  gh run watch          # picks the latest run");
console.log("  gh run list -w release.yml");
console.log("");
console.log("Or open: https://github.com/delebash/justwrite-app/actions/workflows/release.yml");
