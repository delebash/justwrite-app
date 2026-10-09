// SPDX-License-Identifier: MIT
// JustWrite's server on the phone — the in-app server (the kit's docs/plans/2026-10-08-the-phone.md;
// JustWrite's TASKS, Sync decisions 8 and 9). The same routes as on a computer for what the phone
// runs — the books and their images, their versions, settings, writing sessions, saved chats, the
// sweep draft — on the kit's server, answering inside a web worker (src/phone/server-worker.js) on
// SQLite WASM.
//
// Not here: the network door (CSRF, CORS, bearer auth — nothing outside the app can reach this
// server), the file autosave (its phone twin answers "no folder"), backups and the book zip, logs
// and disk, the search index, the local AI engine (its runner, model catalog and tunes), serving
// the UI. The AI is the kit's stack for online providers (installCloudLlm) on JustWrite's feature
// data, as on a computer. Sync is the computer's (sync.js), on the phone's platform
// (sync_platform.phone.js): it never listens — the phone connects to a computer.
//
// The worker bundle swaps a module for its `<name>.phone.js` twin where one sits beside it
// (app_state, autosave_api, database/demo_seed, editor/html, sync_platform); under Node (tests)
// the originals load.
import { installCloudLlm } from "@delebash/llm-runner/llm/install_cloud";
import { loadFromConfigs } from "@delebash/llm-runner/llm/registry";
import { seedLlm } from "@delebash/llm-runner/llm/seed";
import * as llmStores from "@delebash/llm-runner/llm/stores";
import { getLogger } from "@delebash/llm-runner/platform/log";
import { createServer, onClose } from "@delebash/llm-runner/platform/server";
import { router as autosaveRouter } from "#api/autosave_api";
import { router as chatRouter } from "./api/chat_api.js";
import { router as healthRouter } from "./api/health_api.js";
import { router as imagesRouter } from "./api/images_api.js";
import { router as projectsRouter } from "./api/projects_api.js";
import { router as sessionsRouter } from "./api/sessions_api.js";
import { router as settingsRouter } from "./api/settings_api.js";
import { router as sweepDraftRouter } from "./api/sweep_draft_api.js";
import { router as versionsRouter } from "./api/versions_api.js";
import { errorEnvelope, TYPE_BASE } from "./app_errors.js";
import { AppState, setState } from "#app_state";
import { TABLES } from "./database/models.js";
import { state } from "./database/session.js";
import { FEATURE_CATALOG } from "./feature_catalog.js";
import { DEFAULT_FEATURE_PROMPTS, FEATURE_PROMPT_HEALS } from "./seed_feature_prompts.js";
import {
  DEFAULT_ENGINE_PRESETS,
  DEFAULT_FEATURE_PRESETS,
  DEFAULT_MODEL_CATALOG_EXTRA,
  DEFAULT_PRESET_ID,
  DEFAULT_TEST_SAMPLES,
  JW_CLASS_TUNE_IDENTITY,
  JW_CLASS_TUNES,
  JW_CURATED_CATALOG,
  JW_EMBED_TEMPLATES,
} from "./seed_presets.js";
import { flushSync, getSync, openBookSync, stopBookSync, router as syncRouter } from "./sync.js";
import { SYNC_PLATFORM, startGuard } from "#sync_platform";

const log = getLogger("justwrite_server.phone");

/** Where the data is, as /v1/health reports it: inside the app, not a folder. A test passes a
 * temporary folder instead (the computer's modules it runs under Node use one). */
export const PHONE_DATA_DIR = "(the app's own storage)";

/**
 * The phone's server on an open database handle (the kit's `openDatabase` — on the phone over
 * SQLite WASM, in a test over a file). Not listening: requests arrive through `app.fetch`. `deviceId`:
 * this device's sync id, kept outside the database (the window's `device.id`).
 */
export async function createPhoneApp({ handle, dataDir = PHONE_DATA_DIR, deviceId } = {}) {
  handle.createTables(TABLES);
  state.handle = handle;
  setState(new AppState(dataDir));
  SYNC_PLATFORM?.useDevice?.(deviceId);
  openBookSync(handle, dataDir);
  // the storage guard (the phone only): rebuild an empty database from this phone's own files,
  // then keep them current after every write
  const guard = startGuard ? await startGuard({ sync: getSync(), isEmpty: () => !handle.value("SELECT count(*) FROM projects"), log }) : null;

  const app = createServer({ typeBase: TYPE_BASE, onUnhandled: errorEnvelope });
  // as on a computer (app.js): stamp what the triggers noted after every request that may have
  // written; stop the auto-sync timers on close
  app.use("*", async (c, next) => {
    await next();
    if (c.req.method !== "GET" && c.req.method !== "HEAD" && c.req.method !== "OPTIONS") {
      flushSync();
      guard?.changed();
    }
  });
  onClose(app, async () => stopBookSync());
  app.route("/", healthRouter);
  app.route("/", autosaveRouter);
  app.route("/", sweepDraftRouter);
  app.route("/", projectsRouter);
  app.route("/", sessionsRouter);
  app.route("/", chatRouter);
  app.route("/", settingsRouter);
  app.route("/", versionsRouter);
  app.route("/", imagesRouter);
  syncRouter(app);

  // the AI: the kit's stack for online providers, on the same feature data as app.js's installLlm
  await installCloudLlm(app, {
    db: handle,
    featureCatalog: FEATURE_CATALOG,
    featurePrompts: DEFAULT_FEATURE_PROMPTS,
    enginePresets: DEFAULT_ENGINE_PRESETS,
    featurePresets: DEFAULT_FEATURE_PRESETS,
    defaultPresetId: DEFAULT_PRESET_ID,
    modelCatalogExtra: [...DEFAULT_MODEL_CATALOG_EXTRA, ...JW_CURATED_CATALOG],
    classTunesSeed: JW_CLASS_TUNES,
    classTuneIdentity: JW_CLASS_TUNE_IDENTITY,
    embedTemplates: JW_EMBED_TEMPLATES,
    testSamples: DEFAULT_TEST_SAMPLES,
    featurePromptHeals: FEATURE_PROMPT_HEALS,
    allowKeyReveal: true,
  });
  // seeded as serve.js seeds a computer (database/seed.js seedWorkspace): the shared seed, then
  // the providers into the dispatch registry
  try {
    seedLlm(handle);
    loadFromConfigs(llmStores.getProviderStore().list());
  } catch (e) {
    log.warning(`AI seed failed: ${e?.message ?? e}`);
  }
  return app;
}
