// ============================================================
// tauri-bridge.js — adapter that exposes the same
// `window.justwrite.project` (+ shell / storage) API the Vue app already
// calls, routing every call through Tauri's `invoke()`.
//
// Lives as a side-effect import in main.js so `window.justwrite` is
// populated before any Pinia store mounts. Outside a Tauri webview
// (e.g. plain `vite dev` in a browser tab) this is a no-op and the
// renderer falls back to its server / data-URL paths.
// ============================================================

import { invoke } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

if (isTauri) {
  // ── Global fetch override ─────────────────────────────────────────
  // Route every cross-origin http(s) request through the Tauri http
  // plugin so the call comes from Rust's reqwest. That sidesteps the
  // browser's CORS preflight and our own COEP: require-corp header,
  // which together would otherwise block any local LLM server that
  // doesn't ship CORS headers (LM Studio, Ollama, llama.cpp, …).
  //
  // Passthrough rules — keep the native fetch for anything that's already
  // origin-local or doesn't make sense to route through Rust:
  //   - data:/blob: URLs (in-memory resources)
  //   - same-origin URLs (the renderer's bundled assets)
  //   - protocol-relative or path-only URLs (always same-origin)
  //   - Tauri's reserved `*.localhost` custom protocols
  //     (`ipc.localhost`, `tauri.localhost`, `asset.localhost`, …). The
  //     http plugin itself uses `invoke()` which on Windows talks to
  //     `ipc.localhost` via fetch — routing those back through tauriFetch
  //     causes an exponential recursion that explodes the request body
  //     until `Uint8Array` throws "Invalid array length".
  const nativeFetch = window.fetch.bind(window);
  const origin = window.location.origin;

  function shouldRouteThroughTauri(input) {
    let url;
    try {
      url = typeof input === "string" ? input
          : input instanceof URL ? input.href
          : input?.url;
    } catch { return false; }
    if (!url || typeof url !== "string") return false;
    if (url.startsWith("data:") || url.startsWith("blob:")) return false;
    if (url.startsWith("/") || url.startsWith("./") || url.startsWith("../")) return false;
    if (url.startsWith(origin)) return false;
    if (!/^https?:\/\//i.test(url)) return false;
    // Tauri reserves `*.localhost` for its internal protocols (ipc, asset,
    // tauri/window). Anything pointed at those must use the browser's
    // native fetch, never our wrapper.
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (host.endsWith(".localhost")) return false;
    } catch { /* malformed URL — let native fetch decide */ }
    return true;
  }

  window.fetch = function patchedFetch(input, init) {
    return shouldRouteThroughTauri(input)
      ? tauriFetch(input, init)
      : nativeFetch(input, init);
  };

  // Helper — turn Tauri's "throw String" rejection style into the
  // `{ ok: false, error }` shape the renderer expects from the old
  // Electron handlers (which never threw, they returned `cancelled`).
  const safe = (promise) => promise.catch((err) => {
    const msg = String(err || "");
    if (msg === "cancelled") return { ok: false, cancelled: true };
    return { ok: false, error: msg };
  });

  window.justwrite = {
    platform: "tauri",
    version: "2",

    shell: {
      // Hand a URL to the OS default browser. `window.open` does
      // nothing inside the Tauri webview, so callers must route here.
      openExternal: (url) => safe(invoke("open_external", { target: url })),
      // Native folder picker. Returns the selected path or null if the
      // user cancelled. Every native dialog routes through a Rust command,
      // not the JS dialog plugin, so we keep a single capability surface.
      pickDirectory: ({ title, defaultPath } = {}) =>
        invoke("pick_directory", { title, defaultPath })
          .catch(() => null),
      // Save-as for binary blobs. WebView2 ignores `<a download>` on
      // blob: URLs, so callers must come through here for the desktop
      // app and fall back to the anchor trick on `vite dev` in a browser.
      // Bytes ride the raw IPC body; suggested filename + dialog title +
      // a single file-type filter come through base64 headers so non-
      // ASCII names survive transport.
      saveFile: async ({ blob, suggestedName, title, filterName, filterExt, defaultDir }) => {
        const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
        const headers = {};
        if (suggestedName) headers["x-save-name"] = b64(suggestedName);
        if (title)         headers["x-save-title"] = b64(title);
        if (filterName)    headers["x-filter-name"] = b64(filterName);
        if (filterExt)     headers["x-filter-ext"] = b64(filterExt);
        if (defaultDir)    headers["x-save-dir"] = b64(defaultDir);
        return safe(invoke("shell_save_file", bytes, { headers }));
      },
      // Native "open a file" dialog. Resolves { name, dir, dataBase64 } for the
      // picked file (e.g. a <book>.zip to import) or { ok:false, cancelled:true }.
      // `dir` lets the caller remember this chooser's last location.
      pickFile: ({ title, filterName, filterExt, defaultDir } = {}) =>
        safe(invoke("pick_file", { title, filterName, filterExt, defaultDir })),
    },

    storage: {
      // The portable data root (src-tauri lib.rs). getRoot → { root, default,
      // portable }. relocate MOVES all app data into a new folder + respawns the
      // server; the caller should reload the webview once it resolves. Use the
      // existing shell.pickDirectory to choose the folder first.
      getRoot: () => safe(invoke("storage_get_root")),
      relocate: (newPath) =>
        invoke("storage_relocate", { newPath }).then(
          () => ({ ok: true }),
          (e) => ({ ok: false, error: String(e) }),
        ),
    },

  };
}
