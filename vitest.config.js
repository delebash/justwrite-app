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

// Quasar's browser build for a test with a DOM (jsdom — Vite's client environment), its server
// build for the rest: a bare `quasar` resolves by the "node" export condition to the SSR build,
// which refuses to install outside an SSR app (Quasar's own error: alias "quasar" to
// "quasar/dist/quasar.client.js" under jsdom), while the browser build reads `window` as it loads.
const quasarBuildPerEnvironment = {
  name: "quasar-build-per-environment",
  enforce: "pre",
  resolveId(id, importer, options) {
    if (id !== "quasar" || this.environment?.config?.consumer !== "client") return null;
    return this.resolve("quasar/dist/quasar.client.js", importer, { ...options, skipSelf: true });
  },
};

export default defineConfig({
  // transformAssetUrls off IN TESTS ONLY (parity batch slice 11): a template's
  // `/public-asset.svg` src stays a URL string (vite dev/build behavior) instead
  // of becoming a file import node can't resolve (the boot smoke hits this on
  // splash images).
  plugins: [quasarBuildPerEnvironment, vue({ template: { transformAssetUrls: false } })],
  resolve: {
    alias: {
      "@renderer": resolve(__dirname, "src"),
      // Same source-alias as quasar.config.js (build.alias) — tests mock it with vi.mock where
      // network transport is involved.
      "@delebash/llm-ui": resolve(__dirname, "../just-llm-runner/ui/src"),
      // Quasar's wrappers (defineBoot / defineRouter / defineStore) — the alias Quasar's own
      // build defines (@quasar/app-vite's lib/config-tools.js).
      "#q-app": "@quasar/app-vite",
      // as quasar.config.js on a computer: the server is a separate process, nothing to start
      "#phone": resolve(__dirname, "src/phone/none.js"),
    },
    // Same dedupe list as quasar.config.js (extendViteConf), and for the same reason: the aliased kit
    // imports its peer deps by bare specifier from its OWN dir, which has no
    // node_modules — without this a mounted kit SFC fails to resolve "quasar". Keep
    // the two lists in lock-step.
    dedupe: ["vue", "quasar", "@floating-ui/dom", "pinia", "vue-router", "vue-i18n", "marked", "@vueuse/core", "qrcode"],
  },
  test: {
    environment: "node",
    // scripts/** carries the bench harness's pure-JS units (config validation,
    // llama-bench output parsing, summary rendering, restore round-trip) — the
    // parts of the harness that can be gated without models or a box.
    include: ["src/**/*.test.js", "bench/harness/**/*.test.js", "scripts/**/*.test.js"],
  },
});
