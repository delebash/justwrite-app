// ============================================================
// tauri-bridge.js — adapter that exposes the same
// `window.justwrite.{project,images}` API the Vue app already calls,
// routing every call through Tauri's `invoke()`.
//
// Lives as a side-effect import in main.js so `window.justwrite` is
// populated before any Pinia store mounts. Outside a Tauri webview
// (e.g. plain `vite dev` in a browser tab) this is a no-op and the
// renderer falls back to its IndexedDB / data-URL paths.
// ============================================================

import { invoke } from "@tauri-apps/api/core";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

if (isTauri) {
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

    project: {
      save: (snapshot, suggestedName) =>
        safe(invoke("project_save", { snapshot, suggestedName })),
      open: () =>
        safe(invoke("project_open")),
      saveTo: (path, snapshot) =>
        invoke("project_save_to", { path, snapshot }),
    },

    images: {
      // Bytes ride as the raw invoke body (zero-copy, no number[] JSON
      // blowup). Filename goes through a base64 header so non-ASCII
      // names survive transport — HTTP headers aren't UTF-8 safe.
      save: ({ name, buffer }) => {
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        // btoa() only accepts Latin-1; the encodeURIComponent/unescape
        // dance is the canonical browser idiom for UTF-8-safe base64.
        const nameB64 = btoa(unescape(encodeURIComponent(name)));
        return invoke("images_save", bytes, { headers: { "x-image-name": nameB64 } });
      },
      read: (path) =>
        invoke("images_read", { path }),
      delete: (path) =>
        invoke("images_delete", { path }).then(() => ({ ok: true }),
                                                (e) => ({ ok: false, error: String(e) })),
    },
  };
}
