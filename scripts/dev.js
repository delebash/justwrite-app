// SPDX-License-Identifier: MIT
// `npm run dev` — THE app, as the family's `npm run dev` always opens it: Vite on its own
// port (1420, with hot reload) and the desktop app pointed at it (DEV_URL), its server
// started by the shell from server/src/serve.js on the dev data folder <repo>/data.
// Closing the window ends both.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "package.json"));
const DEV_URL = "http://localhost:1420";

const vite = spawn(process.execPath, [require.resolve("vite/bin/vite.js")], { cwd: root, stdio: "inherit" });

async function waitForVite() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(DEV_URL);
      if (r.ok) return;
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Vite never answered on ${DEV_URL}`);
}

let app;
const stop = (code) => {
  try {
    vite.kill();
  } catch {
    /* gone */
  }
  process.exit(code ?? 0);
};
vite.on("exit", (code) => {
  if (app && app.exitCode === null) app.kill();
  process.exit(code ?? 1);
});

await waitForVite();
const env = { ...process.env, DEV_URL };
delete env.ELECTRON_RUN_AS_NODE;
app = spawn(require("electron"), ["."], { cwd: root, stdio: "inherit", env });
app.on("exit", (code) => stop(code));
process.on("SIGINT", () => {
  app?.kill();
  stop(0);
});
