// SPDX-License-Identifier: MIT
// Runs a Node script on Electron's own Node (24 — the runtime the server ships on), not
// whatever `node` is first on PATH. `node scripts/node24.js <script> [args…]`.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const electron = require("electron");
const child = spawn(electron, process.argv.slice(2), {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
