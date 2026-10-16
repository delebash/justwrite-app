// The flow tests (`npm run test:flows`, 2026-10-16; docs/dev/flow-tests.md): Playwright Test
// (https://playwright.dev/docs/test-configuration) drives the BUILT UI (dist/spa) in a browser,
// served by a scratch server on a copy of your data — the smoke's setup (scripts/lib/scratch-server.js)
// — with every AI call answered by the test (the kit's ai-stub.js), so each flow runs in seconds
// with no model and no GPU. Every test runs at a desktop width and at a phone's.
import { defineConfig } from "@playwright/test";
import { chromeLaunchOptions } from "./tests/lib/smoke-common.js";
import { FLOWS_URL } from "./tests/flows/global-setup.js";

export default defineConfig({
  testDir: "tests/flows",
  globalSetup: "./tests/flows/global-setup.js",
  // One server and one copy of the data for the run: the tests take turns.
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { outputFolder: "tests/flows/report", open: "never" }]],
  outputDir: "tests/flows/artifacts",
  use: {
    baseURL: FLOWS_URL,
    launchOptions: { ...chromeLaunchOptions(), args: ["--no-sandbox", "--disable-gpu"] },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
    { name: "phone", use: { viewport: { width: 390, height: 844 } } },
  ],
});
