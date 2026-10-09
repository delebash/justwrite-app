// SPDX-License-Identifier: MIT
// The phone's start-up: JustWrite's server runs inside the app, in a web worker
// (worker-bundle/server-worker.js, built from server-worker.js), and every request the window
// makes goes there through the kit's transport (`setServerTransport(workerFetch(worker))`).
// quasar.config.js maps `#in-app-server` here for a Capacitor build (and a dev run with
// JUSTWRITE_IN_APP_SERVER=1); everywhere else to none.js.
import { setServerTransport, workerFetch } from "@delebash/llm-ui";
// The worker ships as built (`?url`: no second bundling — it is complete), SQLite's .wasm beside
// it under its own name, handed to the worker in its address.
import workerUrl from "./worker-bundle/server-worker.js?url";
import wasmUrl from "./worker-bundle/sqlite3.wasm?url";

export async function startInAppServer() {
  const worker = new Worker(`${workerUrl}?wasm=${encodeURIComponent(new URL(wasmUrl, location.href).href)}`, { type: "module" });
  await new Promise((resolve, reject) => {
    const onMessage = (event) => {
      if (event.data?.type === "ready") {
        worker.removeEventListener("message", onMessage);
        resolve();
      } else if (event.data?.type === "failed") {
        reject(new Error(`the in-app server failed to start: ${event.data.message}`));
      }
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", (e) => reject(new Error(`the in-app server failed to start: ${e.message || "unknown error"}`)), { once: true });
  });
  setServerTransport(workerFetch(worker));
  return worker;
}
