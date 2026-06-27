> ⛔ **NOT THE CURRENT PLAN.** The ONE current plan is `just-llm-runner/docs/plans/2026-06-27-MASTER-PLAN.md` — everything is folded in there (✅ done + ⬜ outstanding, full detail). This doc is kept as **historical background only** (past plan / design / research / evidence). Read it for context; **plan from the master.**

# Shared platform settings — same-stack apps (JustWrite + JustVoice + future)

**Authored 2026-06-24 after a RULE #5/#7 cross-app settings audit** (read JW +
JV settings in full, file:line). Companion to `2026-06-20-shared-ai-stack-plan.md`
(the AI menu). This plan governs the **non-AI** settings surface. Belongs in both
repos when JV adopts.

## Principle

Most of "App Settings" is **platform infrastructure of the stack**, not app
content. A Vue 3 + Tauri 2 + Python + SQLite thin-client app, by definition, has
a SQLite DB, a Python server, a Tauri shell, the shared appearance engine, and
the shared AI runner. So backup/restore/reset, server/connection, logs,
updates, appearance, hardware, and about are **stack-level concerns** → **one
shared implementation** (components + server modules) every app drops in — same
as the AI menu. Only a thin **app-domain** slice differs (JW: Project; JV:
Mastering/Generation/Capture/Channels/Voices/MCP).

JV is **not** the reference — its "General" is a cluttered catch-all and it
duplicates AI usage in two places. Design the correct shape; both apps adopt it.

## By-concern homes (consistent in every app)

Put each concern where the thing it acts on lives, and make that the **same
place** in every app:

| Concern | Home | Shared? |
|---|---|---|
| **Data & Storage** — backup · restore · reset · clear caches · data location | App Settings → **Data** | shared (server module + `<DataManagement>`) |
| **Server & Connection** — URL · bind host/port · keep-running · auth · health | App Settings → **Server** | shared component |
| **Appearance** — theme/density/accent/fonts · **language** | App Settings → **Appearance** | shared engine (+ shared UI) |
| **Logs** — server log viewer (open/download/tail/copy) | App Settings → **Logs** | shared (server module + component) |
| **Updates** — version · changelog · Tauri updater | App Settings → **Updates** | shared shell, per-app changelog content |
| **Diagnostics** — versions/paths/DB size/last errors · "copy for bug report" | App Settings → **About/Diagnostics** | shared shell + app stats |
| **AI** — providers/routing/models/usage/per-app-AI | **AI menu** (`AiModelsArea`) | shared (separate plan) |
| **Hardware (GPU/CPU/RAM/accel)** — detection + machine accel | **AI menu** (runner-driven hardware panel) | shared — *not* an App-Settings tab |
| **App domain** | App Settings → app tabs | per-app (JW Project; JV audio domain) |

- **Cache = storage** → lives with **Data** (one "reclaim disk" home), each app
  contributes its cache list (JW: RAG index; JV: render cache; shared: GGUF
  downloads). Per-model management stays in the AI menu.
- **GPU = compute** → the generic hardware panel lives in the **AI menu** (where
  per-model Fit/offload is), consistent in both; per-TTS-engine device knobs stay
  with JV's engines.

## Backup / Restore / Reset — one shared module (same front + back)

Drift today: **JW** reset = `DELETE /v1/workspace` + a renderer JSON snapshot (no
server backup route); **JV** reset = `POST /v1/admin/factory-reset`, backup =
`GET /v1/backup` + `POST /v1/restore` (ZIP). Converge to ONE schema-agnostic
implementation:

- **Server (shared `make_data_router(get_engine, asset_dirs, reseed)`):**
  `GET /v1/backup` → ZIP (SQLite file/dump + declared asset dirs);
  `POST /v1/restore` → swap DB + assets (auto pre-backup first);
  `POST /v1/reset` → `metadata.drop_all` + recreate + `reseed()`. DB ops don't
  care about the schema.
- **Client (shared `<DataManagement>`):** Export / Import / Reset (confirm +
  "type RESET").
- **The one seam (RULE #7 §C):** each app passes its extra **asset dirs** + a
  **reseed** callback. Everything else is identical. A full-DB dump is more
  complete than JW's project-only JSON snapshot — adopt-and-improve.

## Where shared code lives

- **Client:** the shared kit (`@delebash/llm-ui` already hosts non-AI shared UI —
  modals, toasts, appearance engine, ConnectionError) → platform-settings section
  components go here.
- **Server:** a **separate shared platform module/package** (NOT `just-llm-runner`,
  which stays AI-focused) exposing `make_data_router` / `make_logs_router` behind
  host hooks — same factory pattern as the provider/routing routers. (Interim:
  may live as a `platform/` module until extracted to its own package.)

## Unit sequence (per RULE #5 — one at a time, verify + commit each)

- **U1 — AI consolidation + Debug removal (JW + kit).** `AiModelsArea` gains an
  app-tab slot (`appTabLabel` + `#app-tab`); JW fills it with **Writing AI**
  (voice canon + auto-rebuild RAG + 3-variation), removing the App-Settings
  "Writing AI" tab. Remove the **Debug** tab + `/debug/writer-lab` +
  `WriterLabDebugView` (the old Writer Lab — no longer needed).
- **U2 — Usage consolidation.** Lift `MODEL_PRICING` + by-provider into the kit;
  upgrade the AI-menu **Usage** tab to the full ledger (rollup + by-feature +
  by-provider + reset); remove the App-Settings Usage tab.
- **U3 — Shared Data & Storage.** `make_data_router` + `<DataManagement>`;
  converge JW (retire `DELETE /v1/workspace` + the JSON export) to the shared
  backup/restore/reset; record JV migration off `/v1/backup|restore|admin/factory-reset`.
- **U4 — Shared Server / Logs / Updates / Appearance(+language) / Diagnostics**
  sections; JW SettingsView reaches its final layout.
- **U5 — JV adoption** of the shared platform settings + GPU/Hardware → AI menu.

## Canonical App-Settings tab order (both apps)

`Data` · `Server` · `[app-domain]` · `Appearance` · `Logs` · `Updates` · `About`

- **JW** app-domain = `Project` (Writing AI lives in the AI menu).
- **JV** app-domain = use-case · Mastering · Generation · Capture · Channels · MCP.

## JV transfer checklist

1. Mount the shared `make_data_router` (asset dirs = audio/render cache; reseed =
   JV seed) → retire `/v1/backup`, `/v1/restore`, `/v1/admin/factory-reset`.
2. Replace JV's General/Cache/Logs/Changelog tabs with the shared section
   components; keep audio-domain tabs.
3. Move JV's generic GPU detection into the AI-menu hardware panel; keep
   per-engine device knobs with the TTS engines.
4. Adopt the shared `<DataManagement>` / Server / Logs / Updates sections.
