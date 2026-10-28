#!/usr/bin/env node
// Version bumper for JustWrite: `npm version` (docs.npmjs.com/cli/commands/npm-version) on the
// root package and its server workspace — package.json, server/package.json (the server answers
// with it: server/src/version.js; the family guard checks they're equal) and package-lock.json
// together, as the template's scripts/bump.js does. electron-builder, the update feed and the
// renderer's "What's new" read it. Does NOT commit or tag; the user owns git operations.
//
// Usage:
//   npm run bump 0.2.0

import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const version = process.argv[2];

if (!version) {
  console.error("Usage: npm run bump <version>   (e.g. 0.2.0)");
  process.exit(1);
}
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error(`Invalid version "${version}". Expected semver like 0.2.0 or 0.2.0-rc.1`);
  process.exit(1);
}

execSync(`npm version ${version} --no-git-tag-version --workspaces --include-workspace-root --allow-same-version`, {
  cwd: ROOT,
  stdio: "inherit",
});
console.log("");
console.log("Next steps (your call):");
console.log(`  git add package.json server/package.json package-lock.json`);
console.log(`  git commit -m "release: v${version}"`);
console.log(`  git tag v${version}`);
console.log(`  git push && git push origin v${version}`);
console.log(`  npm run release   # triggers the GitHub Actions build`);
