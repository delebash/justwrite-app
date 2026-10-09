// SPDX-License-Identifier: MIT
// The JustWrite server's application factory — the port of justwrite_server/app.py.
//
// Boots SQLite + AppState and mounts the domain APIs (projects, settings, sessions, chat,
// versions, images, RAG) plus the SHARED runner router and the whole shared LLM stack via
// installLlm (the same stack JustVoice mounts). All renderer state persists here in SQLite —
// there is no key/value or IndexedDB seam.

import { cpSync, existsSync, mkdtempSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import { installLlm, router as runnerRouter } from "@delebash/llm-runner";
import {
  BearerAuthMiddleware,
  CorsMiddleware,
  CsrfOriginMiddleware,
  createServer,
  installFileLog,
  installLogRing,
  makeDiskRouter,
  makeLogsRouter,
} from "@delebash/llm-runner/platform";
import { purePath } from "@delebash/llm-runner/platform/data_paths";
import { getLogger } from "@delebash/llm-runner/platform/log";
import { pyOr } from "@delebash/llm-runner/platform/py";
import { router as autosaveRouter } from "./api/autosave_api.js";
import { router as bookTransferRouter } from "./api/book_transfer_api.js";
import { router as chatRouter } from "./api/chat_api.js";
import { router as healthRouter } from "./api/health_api.js";
import { router as imagesRouter } from "./api/images_api.js";
import { router as prefsRouter } from "./api/prefs_api.js";
import { router as projectsRouter } from "./api/projects_api.js";
import { router as ragRouter } from "./api/rag_api.js";
import { router as serverAuthRouter } from "./api/server_auth_api.js";
import { router as sessionsRouter } from "./api/sessions_api.js";
import { router as settingsRouter } from "./api/settings_api.js";
import { router as sweepDraftRouter } from "./api/sweep_draft_api.js";
import { router as versionsRouter } from "./api/versions_api.js";
import { AppState, setState } from "./app_state.js";
import { readAuth } from "./auth.js";
import { pyGet, pyLoads } from "./book_io.js";
import { getDataRouter } from "./data_admin.js";
import { _bundledSamplesDir, _dirHasSample } from "./database/demo_seed.js";
import { initDb, state } from "./database/session.js";
import { FEATURE_CATALOG } from "./feature_catalog.js";
import { defaultDataDir, SOURCE_ROOT } from "./paths.js";
import { flushSync, openBookSync, stopBookSync, router as syncRouter } from "./sync.js";
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
import { PRODUCT } from "./version.js";
import { errorEnvelope, TYPE_BASE } from "./app_errors.js";

const log = getLogger("justwrite_server.app");

export { TYPE_BASE };

// The origins the app's own pages load from: the Vite dev server, and the Electron window
// (`app://justwrite` — the desktop shell loads the renderer from there; without it every
// mutating call from the desktop app would be refused 403 by the CSRF guard). The packaged
// Tauri origins are the kit's own defaults.
export const DESKTOP_ORIGIN = "app://justwrite";
export const APP_ORIGINS = ["http://localhost:1420", "http://127.0.0.1:1420", DESKTOP_ORIGIN];

/**
 * The `cors` settings section ({origins, originRegex}) read at boot, or {} if
 * unset/unavailable. CORS is configured once at app construction (changing it needs a
 * restart — same as JustVoice).
 */
function readCors() {
  const h = state.handle;
  if (h === null) return {};
  try {
    const row = h.get("settings", "cors");
    return row ? pyOr(pyLoads(row.value), {}) : {};
  } catch (e) {
    log.warning(`cors config read failed (allow-all fallback): ${e?.message ?? e}`);
    return {};
  }
}

/**
 * Best-effort one-time copy of the bundled samples into `<dataDir>/samples/`, so the
 * demo/tutorial loader reads samples from the portable data root (which a relocate carries)
 * instead of the source tree. Copies via a temp dir + atomic rename so a crash mid-copy can
 * never leave an empty/partial `<data>/samples/` (same crash-safety idiom as the autosave
 * write). NEVER crashes boot: a missing/partial source is tolerated — demo_seed's read-time
 * fallback still serves the bundled source directly.
 */
function materializeSamples(dataDir) {
  const dest = path.join(dataDir, "samples");
  if (existsSync(dest)) return; // already materialized (or a partial one — read-fallback covers it)
  const src = _bundledSamplesDir();
  if (!_dirHasSample(src)) return; // no bundled source to copy from
  try {
    const tmpParent = mkdtempSync(path.join(dataDir, ".samples-tmp-"));
    try {
      const staged = path.join(tmpParent, "samples");
      cpSync(src, staged, { recursive: true, preserveTimestamps: true });
      renameSync(staged, dest); // atomic — dest was absent; same filesystem
    } finally {
      rmSync(tmpParent, { recursive: true, force: true });
    }
  } catch (e) {
    // a copy failure must never crash boot
    log.warning(`sample materialize skipped (${dataDir}): ${e?.message ?? e}`);
  }
}

/** Find the built UI across the checkout and packaged layouts (Quasar's build, 2026-10-08). */
export function locateUiDir() {
  const candidates = [];
  const override = process.env.JUSTWRITE_UI_DIR;
  if (override) candidates.push(override);
  // A checkout: server/src/app.js → the repo root holds Quasar's browser build, dist/spa/.
  candidates.push(path.join(SOURCE_ROOT, "dist", "spa"));
  // The packaged app: this package is installed at <app>/node_modules/justwrite-server, so
  // SOURCE_ROOT (two folders above src/) is <app>/node_modules — and Quasar puts the built UI
  // at <app> itself (resources/app.asar), beside electron-main.js.
  if (path.basename(SOURCE_ROOT) === "node_modules") candidates.push(path.dirname(SOURCE_ROOT));
  // cwd fallback.
  candidates.push(path.join(process.cwd(), "dist", "spa"));
  for (const c of candidates) {
    if (statSync(c, { throwIfNoEntry: false })?.isDirectory() && statSync(path.join(c, "index.html"), { throwIfNoEntry: false })?.isFile()) {
      return c;
    }
  }
  return null;
}

/** The Fastify app (not yet listening). `dataDir` defaults to the family data-root ladder. */
export async function createApp(dataDir = null) {
  dataDir = dataDir ? purePath(String(dataDir)) : defaultDataDir();
  const h = initDb(dataDir);
  // Sync on the book tables (../just-sqlite-sync; docs/dev/TASKS.md "Sync — …"): the engine
  // notes every change to them from here on, and adopts the rows already there.
  openBookSync(h, dataDir);
  setState(new AppState(dataDir));
  materializeSamples(dataDir);
  // Server logs → in-memory ring (the AI/Logs viewer) + a per-day file that survives a
  // crash/boot-hang. Shared platform helpers (same in every app).
  installLogRing();
  installFileLog(path.join(dataDir, "logs", "justwrite.log"));

  const app = createServer({ typeBase: TYPE_BASE, onUnhandled: errorEnvelope });

  // Python's middleware order, outermost first: CSRF, then CORS, then bearer auth (Starlette
  // ran the last-added first). Fastify runs onRequest hooks in the order these root plugins
  // load, so they are registered in that order: a CSRF 403 carries no CORS headers; CORS
  // answers preflights before auth sees them and stamps auth's 401/403.
  const cors = readCors();
  const corsOrigins = pyGet(cors, "origins");
  const corsRegex = pyGet(cors, "originRegex");

  // CSRF: reject cross-site browser mutations to /v1 (no token — can't lock anyone out).
  // Reuses the CORS origins as the allowlist.
  app.register(CsrfOriginMiddleware, {
    appOrigins: APP_ORIGINS,
    extraOrigins: pyOr(corsOrigins, []),
    typeBase: TYPE_BASE,
  });

  // CORS — settings-driven (the `cors` section: origins / originRegex) so an exposed/headless
  // server can lock origins down; allow-all for the local + dev + headless paths when unset.
  // The desktop window's own origin stays allowed when the user locks origins down (decided
  // 2026-10-08, JustVoice TASKS, the Electron move: the window IS the app — under Tauri its
  // requests were never refused).
  if (pyOr(corsOrigins, null) || pyOr(corsRegex, null)) {
    app.register(CorsMiddleware, {
      allowOrigins: [DESKTOP_ORIGIN, ...pyOr(corsOrigins, [])],
      allowOriginRegex: pyOr(corsRegex, null),
      allowCredentials: true,
      allowMethods: ["*"],
      allowHeaders: ["*"],
    });
  } else {
    app.register(CorsMiddleware, { allowOrigins: ["*"], allowMethods: ["*"], allowHeaders: ["*"] });
  }

  // Bearer auth — OFF unless tokens are configured in Settings (the `auth` section). Gates
  // /v1/* only.
  app.register(BearerAuthMiddleware, { readAuth, typeBase: TYPE_BASE });

  // Sync: stamp what the triggers noted after every request that may have written (the order
  // edits were made in is the order their stamps run); stop the auto-sync timer on close.
  app.addHook("onResponse", async (req) => {
    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") flushSync();
  });
  app.addHook("onClose", async () => stopBookSync());

  app.register(healthRouter);
  app.register(serverAuthRouter); // the auth door + lockout escape (family shape)
  // The server-owned rotating on-disk JSON mirror of each book (moved off Rust 2026-07-13).
  app.register(autosaveRouter);
  app.register(sweepDraftRouter); // /v1/projects/{id}/sweep-draft
  app.register(projectsRouter);
  app.register(syncRouter); // /v1/sync/* — the sync engine's routes + JustWrite's (export, import, folder, pairing)
  app.register(bookTransferRouter); // per-project zip export/import (/v1/projects/*)
  app.register(sessionsRouter);
  app.register(chatRouter);
  app.register(settingsRouter);
  app.register(prefsRouter); // the family /v1/prefs door over the same document (P9)
  app.register(versionsRouter);
  app.register(getDataRouter()); // shared backup/restore/reset (/v1/data/*)
  app.register(makeLogsRouter("JustWrite")); // shared /v1/logs/*
  app.register(makeDiskRouter(dataDir)); // shared /v1/disk/usage (reclaim-disk panel)
  app.register(ragRouter);
  app.register(imagesRouter);
  app.register(runnerRouter);

  // Drop in the ENTIRE shared LLM stack with ONE call. JustWrite provides only its DB + its
  // feature seed DATA; installLlm creates the LLM tables, wires storage, mounts every /v1/ai
  // + /v1/llm-providers router, sets the DB usage sink, and points the bundled runner's
  // catalog at the DB. Nothing else about LLM lives in JustWrite.
  await installLlm(app, {
    db: state.handle,
    featureCatalog: FEATURE_CATALOG,
    featurePrompts: DEFAULT_FEATURE_PROMPTS,
    // Preset seed (2026-07-15 one-source model): the built-in engine presets + the
    // per-ACTION preset refs (action→preset_id — the one source of what an action runs) +
    // the catch-all default preset. The action's preset owns model + every tunable; the
    // FeatureCatalogEntry nav group stays display-only.
    enginePresets: DEFAULT_ENGINE_PRESETS,
    featurePresets: DEFAULT_FEATURE_PRESETS,
    defaultPresetId: DEFAULT_PRESET_ID,
    // JW's WHOLE model catalog (decision ④, 2026-08-05): the daily-driver 26B row + the
    // curated writing ladder — a model ladder is app data, and this is the writing app's.
    modelCatalogExtra: [...DEFAULT_MODEL_CATALOG_EXTRA, ...JW_CURATED_CATALOG],
    // The measured class-tune library + what each tune was measured on + the embed task
    // templates — moved from the kit with the rows they describe.
    classTunesSeed: JW_CLASS_TUNES,
    classTuneIdentity: JW_CLASS_TUNE_IDENTITY,
    embedTemplates: JW_EMBED_TEMPLATES,
    // §7.3 Lab test samples — synthesized per-ACTION rows for the Lab's Sample button;
    // fill-if-empty, so edited rows survive reseeds.
    testSamples: DEFAULT_TEST_SAMPLES,
    // Prompt stale-heals (RAG build): revised seed prompts reach existing DBs only when the
    // row still carries the old exact seed text.
    featurePromptHeals: FEATURE_PROMPT_HEALS,
    // The bundled runner's engine + model cache lives under the app data dir
    // (<dataDir>/ai-cache) so all on-disk data shares one portable root.
    dataDir,
    // Names JW in the family cache registry (2026-08-03) so a sibling app's Quick Setup can
    // offer to SHARE these engine + model files instead of downloading them again.
    product: PRODUCT,
    // #12 C6: JW guards mutating /v1 with the CSRF origin check (above), so it opts IN to the
    // POST key/reveal route (pre-fill a masked, editable key field).
    allowKeyReveal: true,
  });

  // Headless UI — serve the built UI (dist/spa/; the app root when packaged) so the headless server + a browser at the
  // server's origin gives the full app WITHOUT the desktop shell (the renderer's
  // origin-aware serverApi targets window.location.origin). Every /v1/* route wins first (a
  // static route beats the wildcard). Starlette's StaticFiles(html=True) semantics: "/" is
  // index.html; a missing file answers FastAPI's {"detail": "Not Found"}; any method but
  // GET/HEAD on an unrouted path answers 405 (measured on the Python server, 2026-10-08).
  const uiDir = locateUiDir();
  if (uiDir !== null) {
    const toRoot = async (_req, reply) => reply.redirect("/", 307);
    app.get("/ui", toRoot);
    app.get("/ui/", toRoot);
    app.register(fastifyStatic, {
      root: uiDir,
      prefix: "/",
      wildcard: true,
      index: ["index.html"],
      redirect: false,
      cacheControl: false,
    });
    // StaticFiles raised Starlette's own HTTPException, which FastAPI's default handler
    // answers (not the kit's problem+json).
    app.route({
      method: ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      url: "/*",
      handler: async (_req, reply) => reply.code(405).send({ detail: "Method Not Allowed" }),
    });
    log.info(`UI served from ${uiDir}`);
  } else {
    log.warning("UI build not found — headless UI disabled. Run `npm run build:spa` to produce dist/spa/, or set JUSTWRITE_UI_DIR.");
  }

  return app;
}
