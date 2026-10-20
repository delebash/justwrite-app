// SPDX-License-Identifier: MIT
// The JustWrite server's application factory — the port of justwrite_server/app.py.
//
// Boots SQLite + AppState and mounts the domain APIs (projects, settings, sessions, chat,
// versions, images, RAG) plus the SHARED runner router and the whole shared LLM stack via
// installLlm (the same stack JustVoice mounts). All renderer state persists here in SQLite —
// there is no key/value or IndexedDB seam.

import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { installLlm, runnerRouter } from "@delebash/core/llm";
import {
  bearerAuth,
  CAPACITOR_ORIGINS,
  createServer,
  csrfOrigin,
  installFileLog,
  installLogRing,
  MaintenanceGate,
  makeDiskRouter,
  makeLogsRouter,
  makeShutdownRouter,
  onClose,
  resourceIsolation,
  SHUTDOWN_PATH,
  serveUi,
  starletteCors,
} from "@delebash/core/platform";
import { purePath } from "@delebash/core/platform/data_paths";
import { getLogger } from "@delebash/core/platform/log";
import { pyOr } from "@delebash/core/platform/py";
import { router as autosaveRouter } from "#api/autosave_api";
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
import { AppState, setState } from "#app_state";
import { readAuth } from "./auth.js";
import { pyGet, pyLoads } from "./book_io.js";
import { getDataRouter } from "./data_admin.js";
import { _bundledSamplesDir, _dirHasSample } from "#database/demo_seed";
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
import { TYPE_BASE } from "./app_errors.js";

const log = getLogger("justwrite_server.app");

export { TYPE_BASE };

// The origins the app's own pages load from: the Vite dev server, and the Electron window
// (`app://justwrite` — the desktop shell loads the renderer from there; without it every
// mutating call from the desktop app would be refused 403 by the CSRF guard). The packaged
// Tauri origins are the kit's own defaults.
export const DESKTOP_ORIGIN = "app://justwrite";
export const APP_ORIGINS = ["http://localhost:1420", "http://127.0.0.1:1420", DESKTOP_ORIGIN];

// The writes a restore doesn't wait for (the maintenance gate below): an AI run or an
// embedding, the engine's work (/v1/llm-runner/*), a provider's ping, model probe or key
// reveal, a search of the book index, and the logs. Every other write is the data's.
export const NOT_DATA_WRITES =
  /^\/v1\/(ai\/(run|stream|embeddings)$|llm-runner\/|llm-providers\/(probe-models$|[^/]+\/(ping|key\/reveal)$)|rag\/[^/]+\/search$|logs\/)/;

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
    log.warning(`cors config read failed (the app's own origins only): ${e?.message ?? e}`);
    return {};
  }
}

/**
 * Best-effort copy of the bundled samples into `<dataDir>/samples/`, so the demo/tutorial
 * loader reads samples from the portable data root (which a relocate carries) instead of the
 * source tree. The first boot copies the whole folder; a later boot replaces each entry the app
 * ships whose bytes differ from the copy, and leaves anything else in the folder alone
 * (2026-10-18: copied once and never again, a fixed bundled sample — the ISO dates of 2026-10-15
 * — never reached an install that had booted before). Each copy goes through a temp dir + rename,
 * so a crash mid-copy never leaves a partial entry (same crash-safety idiom as the autosave
 * write). NEVER crashes boot: a missing/partial copy is tolerated — demo_seed's read-time
 * fallback still serves the bundled source directly.
 */
function materializeSamples(dataDir) {
  const src = _bundledSamplesDir();
  if (!_dirHasSample(src)) return; // no bundled source to copy from
  const dest = path.join(dataDir, "samples");
  try {
    if (!existsSync(dest)) {
      stagedCopy(dataDir, src, dest);
      return;
    }
    for (const name of readdirSync(src)) {
      const from = path.join(src, name);
      const to = path.join(dest, name);
      if (!sameTree(from, to)) stagedCopy(dataDir, from, to);
    }
  } catch (e) {
    // a copy failure must never crash boot
    log.warning(`sample materialize skipped (${dataDir}): ${e?.message ?? e}`);
  }
}

/** Copy `from` to `to` through a temp dir beside them, then swap it in by rename (same filesystem). */
function stagedCopy(dataDir, from, to) {
  const tmpParent = mkdtempSync(path.join(dataDir, ".samples-tmp-"));
  try {
    const staged = path.join(tmpParent, "new");
    cpSync(from, staged, { recursive: true, preserveTimestamps: true });
    if (existsSync(to)) renameSync(to, path.join(tmpParent, "old"));
    renameSync(staged, to);
  } finally {
    rmSync(tmpParent, { recursive: true, force: true });
  }
}

/** True when `a` and `b` hold the same files with the same bytes. */
function sameTree(a, b) {
  const sa = statSync(a, { throwIfNoEntry: false });
  const sb = statSync(b, { throwIfNoEntry: false });
  if (!sa || !sb || sa.isDirectory() !== sb.isDirectory()) return false;
  if (!sa.isDirectory()) return sa.size === sb.size && readFileSync(a).equals(readFileSync(b));
  const na = readdirSync(a).sort();
  const nb = readdirSync(b).sort();
  return na.length === nb.length && na.every((n, i) => n === nb[i] && sameTree(path.join(a, n), path.join(b, n)));
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

/** The Hono app (not yet listening). `dataDir` defaults to the family data-root ladder. */
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

  // an unhandled exception answers the kit's family envelope (§15: problem+json, request id)
  const app = createServer({ typeBase: TYPE_BASE });

  // Python's middleware order, outermost first: CSRF, then CORS, then bearer auth (Starlette
  // ran the last-added first). Hono runs middleware in the order added, and only for the routes
  // added after it, so they come first and in that order: a CSRF 403 carries no CORS headers;
  // CORS answers preflights before auth sees them and stamps auth's 401/403.
  const cors = readCors();
  const corsOrigins = pyGet(cors, "origins");
  const corsRegex = pyGet(cors, "originRegex");
  // A reverse proxy's public names (JUSTWRITE_ALLOWED_HOSTS, comma-separated — the template's
  // FAMILY_TEMPLATE_ALLOWED_HOSTS): bearer auth answers this computer's own names only (DNS
  // rebinding), and a browser there sends the proxy's origin (https://write.example.com), the
  // server's own though it sees another scheme and host behind the proxy.
  const allowedHosts = (process.env.JUSTWRITE_ALLOWED_HOSTS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const proxyOrigins = allowedHosts.flatMap((s) => [`https://${s}`, `http://${s}`]);

  // CSRF: reject cross-site browser mutations to /v1 (no token — can't lock anyone out).
  // Reuses the CORS origins as the allowlist.
  app.use(
    "*",
    csrfOrigin({
      appOrigins: APP_ORIGINS,
      extraOrigins: [...pyOr(corsOrigins, []), ...proxyOrigins],
      typeBase: TYPE_BASE,
    }),
  );
  // ...and a read the browser marks cross-site (Fetch Metadata: a cross-site <img> of /v1/data/backup
  // made a backup — the kit's nineteenth review), but the app's own windows by their Origin (the
  // desktop window's app://justwrite, the dev server, the phone, the `cors` setting's origins and
  // pattern, a reverse proxy's name) and a navigation to the UI's pages — the template's.
  app.use(
    "*",
    resourceIsolation({
      appOrigins: APP_ORIGINS,
      extraOrigins: [...pyOr(corsOrigins, []), ...proxyOrigins],
      originRegex: pyOr(corsRegex, ""),
      typeBase: TYPE_BASE,
    }),
  );

  // CORS — the app's own origins only: the desktop window (app://), the dev server, the phone,
  // which call this port directly; the UI this server hosts is its own origin and needs none.
  // Never every origin: any web page the user opened could then read this computer's server —
  // a backup (every API key in it) and the access tokens (measured 2026-10-20 against "*":
  // GET /v1/data/backup from https://evil.example answered 200 with
  // access-control-allow-origin: *; the family's security review, the kit's RESEARCH §2).
  // The `cors` settings section (origins / originRegex) names the origins instead; the desktop
  // window's own origin stays allowed then (decided 2026-10-08, JustVoice TASKS, the Electron
  // move: the window IS the app — under Tauri its requests were never refused).
  if (pyOr(corsOrigins, null) || pyOr(corsRegex, null)) {
    app.use(
      "*",
      starletteCors({
        allowOrigins: [DESKTOP_ORIGIN, ...pyOr(corsOrigins, [])],
        allowOriginRegex: pyOr(corsRegex, null),
        allowCredentials: true,
        allowMethods: ["*"],
        allowHeaders: ["*"],
      }),
    );
  } else {
    app.use("*", starletteCors({ allowOrigins: [...APP_ORIGINS, ...CAPACITOR_ORIGINS], allowMethods: ["*"], allowHeaders: ["*"] }));
  }

  // Bearer auth — OFF unless tokens are configured in Settings (the `auth` section). Gates
  // /v1/* only. The desktop shell's POST /v1/shutdown carries no token: it stays open from this
  // machine (and the route itself refuses anyone else).
  app.use("*", bearerAuth({ readAuth, typeBase: TYPE_BASE, loopbackOpenPaths: [SHUTDOWN_PATH], allowedHosts }));

  // While a restore or a reset replaces the data, the other writes are refused (503,
  // Retry-After) and the ones already running finish first — never a save that lands half-way
  // or over the restored book (the kit's MaintenanceGate; the data router closes it). Only the
  // data's writes: an AI run, the engine's work, a provider's ping or a search is no reason to
  // hold a restore up (house-paint's thirteenth review), so those pass; a route not named here
  // counts as a data write. The shell's shutdown always passes.
  const gate = new MaintenanceGate({ exempt: [SHUTDOWN_PATH], isDataWrite: (c) => !NOT_DATA_WRITES.test(c.req.path) });
  app.use("*", gate.middleware());

  // Sync: stamp what the triggers noted after every request that may have written (the order
  // edits were made in is the order their stamps run); stop the auto-sync timer on close.
  app.use("*", async (c, next) => {
    await next();
    if (c.req.method !== "GET" && c.req.method !== "HEAD" && c.req.method !== "OPTIONS") flushSync();
  });
  onClose(app, async () => stopBookSync());

  app.route("/", healthRouter);
  // POST /v1/shutdown — the desktop shell's clean stop of a JustWrite server it finds on its port
  // (the kit's route; src-electron/electron-main.js `shutdownPath`). The AI engine needs no hook:
  // it runs in the kill-on-close job of this process and ends with it.
  app.route("/", makeShutdownRouter());
  app.route("/", serverAuthRouter); // the auth door + lockout escape (family shape)
  // The server-owned rotating on-disk JSON mirror of each book (moved off Rust 2026-07-13).
  app.route("/", autosaveRouter);
  app.route("/", sweepDraftRouter); // /v1/projects/{id}/sweep-draft
  app.route("/", projectsRouter);
  syncRouter(app); // /v1/sync/* — the sync engine's routes + JustWrite's (export, import, folder, pairing)
  app.route("/", bookTransferRouter); // per-project zip export/import (/v1/projects/*)
  app.route("/", sessionsRouter);
  app.route("/", chatRouter);
  app.route("/", settingsRouter);
  app.route("/", prefsRouter); // the family /v1/prefs door over the same document (P9)
  app.route("/", versionsRouter);
  app.route("/", getDataRouter({ gate })); // shared backup/restore/reset (/v1/data/*)
  app.route("/", makeLogsRouter("JustWrite")); // shared /v1/logs/*
  app.route("/", makeDiskRouter(dataDir)); // shared /v1/disk/usage (reclaim-disk panel)
  app.route("/", ragRouter);
  app.route("/", imagesRouter);
  app.route("/", runnerRouter());

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
  // origin-aware serverApi targets window.location.origin). Every /v1/* route wins first (it
  // was added first). The kit's serveUi (the template's, kit 7e617b7): a write there answers 405
  // with Allow (an unknown /v1 write stays the API's 404), files carry an ETag and answer 304,
  // Vite's hashed assets are kept for good and the rest revalidated. /ui is the Python-era address.
  const uiDir = locateUiDir();
  if (uiDir !== null) {
    const toRoot = (c) => c.redirect("/", 307);
    app.get("/ui", toRoot);
    app.get("/ui/", toRoot);
    serveUi(app, uiDir);
    log.info(`UI served from ${uiDir}`);
  } else {
    log.warning("UI build not found — headless UI disabled. Run `npm run build:spa` to produce dist/spa/, or set JUSTWRITE_UI_DIR.");
  }

  return app;
}
