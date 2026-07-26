// Unit-test harness (ledger E2) — pure-JS service/composable tests, node
// environment, NO browser. The renderer gate stays the Playwright headless
// smoke (tests/smoke/headless-smoke.js); this covers logic the smoke can't reach
// deterministically (cache seams, parsers, mappers). Run: npm run test:unit
//
// COMPONENT tests (2026-07-16): the vue plugin lets a single SFC be MOUNTED for a
// write path the smoke can't reach deterministically — a chip popover's Save. Those
// files opt in per-file with a `@vitest-environment jsdom` docblock, so the default
// stays node and the pure-JS suites are untouched. `createApp` does the mounting; no
// @vue/test-utils dependency is added. Why this exists: a thinking-budget save shipped
// a ReferenceError past a fully green build+lint because NOTHING executed the SFC —
// build:vite compiles SFCs without resolving script identifiers and biome doesn't check
// .vue identifiers, so a mount is the only gate that runs that code.
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@renderer": resolve(__dirname, "src/renderer/src"),
      // Same source-alias as vite.config.js — tests mock it with vi.mock where
      // network transport is involved.
      "@delebash/llm-ui": resolve(__dirname, "../just-llm-runner/ui/src"),
    },
    // Same dedupe list as vite.config.js, and for the same reason: the aliased kit
    // imports its peer deps by bare specifier from its OWN dir, which has no
    // node_modules — without this a mounted kit SFC fails to resolve "reka-ui". Keep
    // the two lists in lock-step.
    dedupe: ["vue", "reka-ui", "@floating-ui/dom", "pinia", "vue-router", "vue-i18n", "marked", "vue-sonner", "@tanstack/vue-table", "@vueuse/core"],
  },
  test: {
    environment: "node",
    // scripts/** carries the bench harness's pure-JS units (config validation,
    // llama-bench output parsing, summary rendering, restore round-trip) — the
    // parts of the harness that can be gated without models or a box.
    include: ["src/renderer/src/**/*.test.js", "bench/harness/**/*.test.js", "scripts/**/*.test.js"],
  },
});
