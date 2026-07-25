import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import { readFileSync } from "fs";

// Inject the package.json version into the renderer so the
// "What's new" modal can pin its dismissal to the current build.
const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8"));

// Tauri pre-2.x compatible config. The Rust backend lives in `src-tauri/`
// and is built by the `tauri` CLI; vite only handles the renderer.
//
// Layout:
//   src/renderer/index.html        ← vite root
//   src/renderer/src/main.js       ← Vue entry
//   dist/                          ← vite build output, fed to Tauri's `frontendDist`
//   src-tauri/                     ← Rust crate
//
// The dev URL (http://localhost:1420) is referenced from
// `src-tauri/tauri.conf.json` (`devUrl`). Keep these in lock-step.

export default defineConfig({
  root: resolve(__dirname, "src/renderer"),
  publicDir: false,
  resolve: {
    alias: {
      "@renderer": resolve(__dirname, "src/renderer/src"),
      // Shared LLM UI package, consumed from its src for the dev/HMR loop
      // (alias now). The release form is the git/published dependency in
      // package.json (later). Sibling repo: ../just-llm-runner/ui.
      "@delebash/llm-ui": resolve(__dirname, "../just-llm-runner/ui/src"),
    },
    // The aliased kit imports peer deps (vue, reka-ui, marked, @tanstack/vue-table)
    // by bare specifier from its own dir; dedupe forces a SINGLE copy from this
    // app's node_modules (Reka provide/inject + Vue reactivity break with two
    // instances). marked rides the shared HelpDrawer renderer; @tanstack/vue-table
    // is what the shared UiTable needs.
    // @vueuse/core rides AppModal's header-drag (useDraggable). The kit has no
    // node_modules of its own, so its bare import must resolve to THIS app's copy.
    dedupe: ["vue", "reka-ui", "@floating-ui/dom", "pinia", "vue-router", "vue-i18n", "marked", "vue-sonner", "@tanstack/vue-table", "@vueuse/core"],
  },
  plugins: [vue()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: process.env.TAURI_DEV_HOST || false,
    fs: {
      // The vite root is `src/renderer/`, so anything the dev server must READ from
      // outside it needs an entry here (the production build is unaffected — this is
      // the dev server's file-serving guard only):
      //   docs/            — docs/*.md for the in-app Help viewer (import.meta.glob in
      //                      services/helpDocs.js bundles them at build time; this lets
      //                      the dev server serve them too).
      //   ../just-llm-runner/ui — the shared kit, consumed from source for HMR.
      //   node_modules/    — dependency ASSETS referenced from bundled CSS. Added
      //                      2026-07-24: self-hosting the fonts made main.js import
      //                      @fontsource CSS whose url()s point at
      //                      node_modules/@fontsource/*/files/*.woff2 — outside the
      //                      root, so `npm run dev` refused every font file ("is
      //                      outside of Vite serving allow list") and the app silently
      //                      fell back to system fonts. It only broke in DEV: `vite
      //                      preview` serves the built bundle and never consults this
      //                      list, which is exactly why verifying against preview
      //                      missed it. Allowing the dependency ROOT (not just
      //                      @fontsource) so the next dependency that ships an asset
      //                      does not fail the same way.
      allow: [
        resolve(__dirname, "src/renderer"),
        resolve(__dirname, "docs"),
        resolve(__dirname, "node_modules"),
        resolve(__dirname, "../just-llm-runner/ui"),
      ],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version),
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    // Tauri's bundled webview is a current Chromium / WKWebView on each
    // OS; the per-platform targets here keep esbuild from down-leveling.
    // The macOS floor (safari17) matches the WKWebView version Tauri 2
    // ships against.
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari17",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
