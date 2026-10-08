// SPDX-License-Identifier: MIT
// The server's tests (vitest on Electron's own Node — `npm run test:server`). The renderer's
// unit tests have their own config at the repo root.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ["tests/**/*.test.js"],
    // One temp folder per run, removed at the end (the kit's platform/vitest_tmp.js).
    globalSetup: [fileURLToPath(import.meta.resolve("@delebash/llm-runner/platform/vitest_tmp"))],
    pool: "forks",
    testTimeout: 20000,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
