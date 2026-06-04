// WebdriverIO config for screenshot capture against the production
// Tauri build. Spawns tauri-driver locally and bridges to msedgedriver
// for WebView2 (Edge). Runs the capture spec only.

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_BINARY = path.resolve(__dirname, "../src-tauri/target/release/justwrite.exe");
const EDGE_DRIVER = path.resolve(__dirname, "./drivers/msedgedriver.exe");

let tauriDriver;

export const config = {
  runner: "local",
  specs: ["./specs/capture.spec.js"],
  maxInstances: 1,
  capabilities: [
    {
      maxInstances: 1,
      "tauri:options": {
        application: APP_BINARY,
      },
    },
  ],

  // tauri-driver listens on 4444 by default.
  hostname: "127.0.0.1",
  port: 4444,
  path: "/",

  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 180_000,
  },

  logLevel: "warn",
  waitforTimeout: 15_000,
  connectionRetryCount: 1,
  connectionRetryTimeout: 20_000,

  // Spawn tauri-driver in onPrepare; kill it in onComplete.
  onPrepare() {
    tauriDriver = spawn(
      "tauri-driver",
      ["--native-driver", EDGE_DRIVER, "--port", "4444"],
      { stdio: ["ignore", "inherit", "inherit"], shell: true },
    );
  },
  onComplete() {
    if (tauriDriver && !tauriDriver.killed) tauriDriver.kill();
  },
};
