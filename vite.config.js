import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

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
    },
  },
  plugins: [vue()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: process.env.TAURI_DEV_HOST || false,
    // ffmpeg.wasm (the M4B audiobook exporter) needs SharedArrayBuffer,
    // which requires cross-origin isolation. Tauri's webview gets these
    // from `tauri.conf.json` -> `app.security.headers`; the vite dev
    // server needs them set here too so `npm run dev:vite` (outside
    // Tauri) is also isolated.
    //
    // COEP is `credentialless` rather than `require-corp` because Tauri's
    // IPC custom protocol (`http://ipc.localhost/...`) responses don't
    // carry CORP headers — `require-corp` blocks them and the http
    // plugin's body-chunk-read loop spins on the broken postMessage
    // fallback. `credentialless` still grants cross-origin isolation
    // (SharedArrayBuffer works), just without the explicit CORP opt-in.
    headers: {
      "Cross-Origin-Opener-Policy":   "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    // Tauri's bundled webview is a current Chromium / WKWebView on each
    // OS; the per-platform targets here keep esbuild from down-leveling.
    // The macOS fallback (safari17) matches the WKWebView floor Tauri 2
    // ships against and is high enough that worker bundles using modern
    // destructuring (ffmpeg.wasm) transpile cleanly under Vite 8.
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari17",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  optimizeDeps: {
    // Same exclusion as before — ffmpeg.wasm ships its own loader.
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
  },
  worker: {
    format: "es",
  },
});
