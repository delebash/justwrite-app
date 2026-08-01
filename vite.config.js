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
//   index.html                     ← vite root
//   src/main.js                    ← Vue entry
//   dist/                          ← vite build output, fed to Tauri's `frontendDist`
//   src-tauri/                     ← Rust crate
//
// The dev URL (http://localhost:1420) is referenced from
// `src-tauri/tauri.conf.json` (`devUrl`). Keep these in lock-step.

export default defineConfig({
  publicDir: false,
  resolve: {
    alias: {
      "@renderer": resolve(__dirname, "src"),
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
    // Same shape create-tauri-app ships, extended for what THIS repo keeps beside the
    // frontend: a Python venv (13k files) and e2e fixtures (13k) as well as the Rust target
    // dir. The vite root is the repo, so all of it is in the watcher's path otherwise.
    watch: { ignored: ["**/src-tauri/**", "**/.venv/**", "**/e2e/**", "**/dist/**"] },
    fs: {
      // The dev server refuses to read outside its root. The repo root now covers docs/
      // (the in-app Help viewer globs docs/*.md), node_modules/ (bundled CSS references
      // @fontsource woff2 files by url(), which DEV refuses without this — `vite preview`
      // serves the built bundle and never consults this list, which is why verifying
      // against preview once missed it) and the app itself. The sibling kit is a genuine
      // outsider, consumed from source for HMR.
      allow: [
        resolve(__dirname, "."),
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
