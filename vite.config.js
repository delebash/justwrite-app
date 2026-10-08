import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

// Inject the package.json version into the renderer so the
// "What's new" modal can pin its dismissal to the current build.
const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8"));

// Vite builds the renderer only. The desktop app is Electron (the family's move,
// 2026-10-08): `electron/main.js` runs the kit's shell, and the server is
// `server/src/serve.js`.
//
// Layout:
//   index.html                     ← vite root
//   src/main.js                    ← Vue entry
//   dist/                          ← vite build output — the window loads it from app://,
//                                    the headless server serves it at /
//   electron/                      ← the desktop app (the kit's runDesktopApp)
//
// The dev URL (http://localhost:1420) is what `npm run dev` points the window at
// (scripts/dev.mjs). Keep these in lock-step.

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
    // The trees beside the frontend: the server, the dev data folder, e2e fixtures (13k
    // files), dist. The vite root is the repo, so all of it is in the watcher's path
    // otherwise.
    watch: { ignored: ["**/server/**", "**/data/**", "**/.venv/**", "**/e2e/**", "**/dist/**", "**/release/**"] },
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
  envPrefix: ["VITE_"],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version),
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    // The desktop window is Electron's own Chromium (152 in Electron 44) on every OS, so
    // one modern target keeps the bundler from down-leveling; the headless UI is opened in
    // a current browser. minify is a BOOLEAN on purpose (P10): the string "esbuild" is a
    // deprecated path on vite 8's rolldown build — true = each vite's own default
    // minifier, same meaning family-wide.
    target: "chrome140",
    minify: true,
  },
});
