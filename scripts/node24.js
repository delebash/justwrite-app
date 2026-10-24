// SPDX-License-Identifier: MIT
// Runs a Node script on Electron's own Node (24 — the runtime the server ships on), not
// whatever `node` is first on PATH. `node scripts/node24.js <script> [args…]`.
// Electron is the desktop app's dependency, so it is installed in src-electron/ (Quasar's
// Electron mode, app-structure §Q.1). Its package's main export is the binary's path, imported
// here as an ES module by file URL — no require (the family's ES-modules rule).
import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const electronMain = path.resolve(import.meta.dirname, "..", "src-electron", "node_modules", "electron", "index.js");
const { default: electron } = await import(pathToFileURL(electronMain).href);
const child = spawn(electron, process.argv.slice(2), {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
