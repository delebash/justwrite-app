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
    // The aliased kit imports peer deps (vue, reka-ui, marked) by bare
    // specifier from its own dir; dedupe forces a SINGLE copy from this app's
    // node_modules (Reka provide/inject + Vue reactivity break with two
    // instances). marked is pulled transitively via the kit's shared HelpDrawer
    // markdown renderer (JW still uses its own help components for now).
    dedupe: ["vue", "reka-ui", "@floating-ui/dom", "pinia", "vue-router", "vue-i18n", "marked", "vue-sonner"],
  },
  plugins: [vue()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: process.env.TAURI_DEV_HOST || false,
    fs: {
      // Allow reading docs/*.md from the repo root for the in-app Help
      // viewer — the vite root is `src/renderer/`, so docs/ sits one
      // level up. import.meta.glob in services/helpDocs.js picks them
      // up at build time; this entry keeps the dev server able to
      // serve them too.
      allow: [resolve(__dirname, "src/renderer"), resolve(__dirname, "docs"), resolve(__dirname, "../just-llm-runner/ui")],
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
