// SPDX-License-Identifier: MIT
// JustWrite's server on the phone — the in-app server (the kit's docs/plans/2026-10-08-the-phone.md;
// JustWrite's TASKS, Sync decisions 8 and 9). The same routes as on a computer for what the phone
// runs — the books and their images, their versions, settings, writing sessions, saved chats, the
// sweep draft — on the kit's server, answering inside a web worker (src/phone/server-worker.js) on
// SQLite WASM.
//
// Not here: the network door (CSRF, CORS, bearer auth — nothing outside the app can reach this
// server), the file autosave (its phone twin answers "no folder"), backups and the book zip, logs
// and disk, the search index, the local AI engine, serving the UI. Sync and the online AI
// providers join in the plan's slices 3–4.
//
// The worker bundle swaps a module for its `<name>.phone.js` twin where one sits beside it
// (app_state, autosave_api, database/demo_seed); under Node (tests) the originals load.
import { createServer } from "@delebash/llm-runner/platform/server";
import { workerServerFactory } from "@delebash/llm-runner/platform/worker/runtime";
import { router as autosaveRouter } from "./api/autosave_api.js";
import { router as chatRouter } from "./api/chat_api.js";
import { router as healthRouter } from "./api/health_api.js";
import { router as imagesRouter } from "./api/images_api.js";
import { router as projectsRouter } from "./api/projects_api.js";
import { router as sessionsRouter } from "./api/sessions_api.js";
import { router as settingsRouter } from "./api/settings_api.js";
import { router as sweepDraftRouter } from "./api/sweep_draft_api.js";
import { router as versionsRouter } from "./api/versions_api.js";
import { errorEnvelope, TYPE_BASE } from "./app_errors.js";
import { AppState, setState } from "./app_state.js";
import { TABLES } from "./database/models.js";
import { state } from "./database/session.js";

/** Where the data is, as /v1/health reports it: inside the app, not a folder. */
export const PHONE_DATA_DIR = "(the app's own storage)";

/**
 * The phone's server on an open database handle (the kit's `openDatabase` — on the phone over
 * SQLite WASM, in a test over a file). Not listening: requests arrive through `inject`.
 */
export async function createPhoneApp({ handle, serverFactory = workerServerFactory } = {}) {
  handle.createTables(TABLES);
  state.handle = handle;
  setState(new AppState(PHONE_DATA_DIR));

  const app = createServer({ typeBase: TYPE_BASE, onUnhandled: errorEnvelope, serverFactory });
  app.register(healthRouter);
  app.register(autosaveRouter);
  app.register(sweepDraftRouter);
  app.register(projectsRouter);
  app.register(sessionsRouter);
  app.register(chatRouter);
  app.register(settingsRouter);
  app.register(versionsRouter);
  app.register(imagesRouter);
  return app;
}
