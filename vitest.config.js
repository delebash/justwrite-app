// Unit-test harness (ledger E2) — pure-JS service/composable tests, node
// environment, NO browser. The renderer gate stays the Playwright headless
// smoke (scripts/headless-smoke.mjs); this covers logic the smoke can't reach
// deterministically (cache seams, parsers, mappers). Run: npm run test:unit
import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@renderer": resolve(__dirname, "src/renderer/src"),
      // Same source-alias as vite.config.js — tests mock it with vi.mock where
      // network transport is involved.
      "@delebash/llm-ui": resolve(__dirname, "../just-llm-runner/ui/src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/renderer/src/**/*.test.js"],
  },
});
