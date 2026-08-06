<script setup>
import { ref, computed, watch, watchEffect } from "vue";
import { useAiStore } from "../stores/ai.js";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { saveImage, urlFor } from "../services/imageStore.js";
import { promptDialog, confirmDialog, DataManagement, LogsPanel, UpdatesPanel, renderHelpMarkdown, get, put, post, fmtBytes, refreshRunnerModels } from "@delebash/llm-ui";
import { loadDoc } from "../services/helpDocs.js";
import { readSetting, writeSetting } from "../services/settings.js";
import { exportProject, importProject, saveBackupBlob, canTransferBooks } from "../services/bookTransfer.js";
import { serverDataDir, chooserDir, rememberDir } from "../services/chooserDirs.js";
import * as autosaveApi from "../services/autosaveApi.js";
import { PaneHeader } from "@delebash/llm-ui";
import { Icon } from "@delebash/llm-ui";
import { UiInput } from "@delebash/llm-ui";
import { UiTextarea } from "@delebash/llm-ui";
import { UiCheckbox } from "@delebash/llm-ui";
import { UiNumber } from "@delebash/llm-ui";
import { UiSelect } from "@delebash/llm-ui";
import { UiButton } from "@delebash/llm-ui";
import { UiToggle } from "@delebash/llm-ui";
import { UiColorPicker } from "@delebash/llm-ui";
import { PRESET_COLORS } from "@renderer/services/categoricalColors.js";
import { SERVER_BASE } from "../services/serverApi.js";
import {
  ACCENT_PRESETS, GOLD_PRESETS, FUNCTIONAL_PRESETS, PAIRINGS, SURFACE_TINTS, PAPER_TINTS,
  THEME_PRESETS, UI_FONTS, DISPLAY_FONTS, INK_PALETTES, UI_SCALES,
  SIDEBAR_HEADING_STYLES, SIDEBAR_HEADING_SIZES,
  NAV_ITEM_STYLES, NAV_ITEM_SIZES,
  BUTTON_RADIUS_OPTIONS, BUTTON_DENSITY_OPTIONS, BUTTON_LABEL_CASE_OPTIONS,
} from "../services/appearance.js";
import { AVAILABLE_LOCALES, setLocale as setI18nLocale } from "../i18n/index.js";
import { useI18n } from "vue-i18n";

import { UiTag } from "@delebash/llm-ui";
import { UiTable } from "@delebash/llm-ui";
import { UiSegmented } from "@delebash/llm-ui";

const props = defineProps({ section: { type: String, default: "" } });

const ai = useAiStore();
const project = useProjectStore();
const ui = useUiStore();

// i18n locale picker — list comes from AVAILABLE_LOCALES; the active
// value mirrors vue-i18n's reactive `locale` ref so the select reflects
// the live UI language even if it was set elsewhere.
const { locale: activeI18nLocale, t } = useI18n({ useScope: "global" });
const LOCALE_OPTIONS = AVAILABLE_LOCALES.map((l) => ({ label: l.label, value: l.code }));
function onLocaleChange(code) {
  const next = code || AVAILABLE_LOCALES[0].code;
  ui.setLocale(next);
  setI18nLocale(next);
}

const SECTIONS = computed(() => [
  { id: "project",    label: t("settings.sections.project") },
  { id: "appearance", label: t("settings.sections.appearance") },
  { id: "general",    label: t("settings.sections.general") },
  { id: "backups",    label: t("settings.sections.backups") },
  { id: "storage",    label: t("settings.sections.storage") },
  { id: "logs",       label: t("settings.sections.logs") },
  { id: "updates",    label: t("settings.sections.updates") },
  { id: "about",      label: t("settings.sections.about") },
]);

const active = ref(props.section || "project");
watch(() => props.section, (s) => { if (s) active.value = s; });

// ── Server: headless access + optional bearer-auth tokens ──────────
// The server hosts the UI itself (StaticFiles at /), so `justwrite-server
// serve` + a browser at this origin gives the full app headless. Bearer
// tokens (the `auth` settings section the middleware reads) gate /v1/* when
// the server runs exposed; off by default.
const headlessUrl = computed(
  () => SERVER_BASE || (typeof window !== "undefined" ? window.location.origin : ""),
);
const authTokens = ref([]);

// The keep-running toggle writes the shell flag immediately AND persists in the
// ui store (App.vue re-applies it every boot — the Rust flag resets per launch).
// Through the bridge, never a direct invoke (this repo's invariant).
async function setKeepRunning(v) {
  ui.setKeepServerRunning(!!v);
  await window.justwrite?.server?.setKeepRunning?.(!!v);
}

// Updates / changelog — version + the rendered whats-new.md (single-sourced with
// the WhatsNew modal). Loaded lazily the first time the Updates tab opens.
const APP_VERSION = import.meta.env.VITE_APP_VERSION || "1.0.0";
const changelogHtml = ref("");
watch(active, async (a) => {
  if (a === "updates" && !changelogHtml.value) {
    changelogHtml.value = renderHelpMarkdown((await loadDoc("whats-new")) || "");
  }
});

// Where the server keeps its data (DB + assets) — shown in General so the user
// knows what to back up / where their work lives. The ONE reader of /v1/health's
// dataDir is chooserDirs.serverDataDir() (also the default folder every chooser
// opens at) — converged so there's a single cached fetch.
const dataDir = ref("");
(async () => {
  dataDir.value = await serverDataDir();
})();

// ── Storage: the portable data root — ONE folder for all app data (projects,
// images, the AI engine + models, logs). Desktop-only (Tauri shell); in a plain
// browser the root is read-only (the dataDir above).
const storageRoot = ref(null); // { root, default, portable } from the shell
const relocating = ref(false);
const storageErr = ref("");

async function loadStorageRoot() {
  const r = await window.justwrite?.storage?.getRoot?.();
  storageRoot.value = r && !r.error ? r : null;
}

// ── Disk usage: the on-disk footprint + the two reclaim actions. Sizes come from
// the shared platform GET /v1/disk/usage; the Clear actions call the runner's own
// reclaim endpoints. Loaded when the Storage section opens, refreshed after a clear.
const diskUsage = ref(null); // { database, appLogs, modelsCache, engineBuilds, spawnLogs, total, diskFree, diskTotal }
const diskBusy = ref("");    // which reclaim op is running: "models" | "spawn" | "" (idle)
const diskErr = ref("");     // a refusal / failure message shown inline

async function loadDiskUsage() {
  try {
    diskUsage.value = await get("/v1/disk/usage");
  } catch {
    diskUsage.value = null; // offline — the rows stay em-dashes
  }
}

// Loading state = an em-dash per row; a real 0 formats as "0 MB" (the kit's
// fmtBytes returns "" for 0). fmtBytes stays the ONE source for the number.
function diskSize(n) {
  if (diskUsage.value == null) return "—";
  return fmtBytes(n) || "0 MB";
}

async function clearModelsCache() {
  const size = fmtBytes(diskUsage.value?.modelsCache) || "0 MB";
  const yes = await confirmDialog({
    title: t("settings.storage.clearModelsTitle"),
    message: t("settings.storage.clearModelsMessage", { size }),
    confirmLabel: t("settings.storage.clearModelsConfirm"),
  });
  if (!yes) return;
  diskBusy.value = "models";
  diskErr.value = "";
  try {
    const res = await post("/v1/llm-runner/models-cache/clear");
    if (res?.ok === false) {
      diskErr.value =
        res.detail === "unload models first"
          ? t("settings.storage.clearModelsLoadedError")
          : res.detail || t("settings.storage.clearModelsError");
    }
  } catch {
    diskErr.value = t("settings.storage.clearModelsError");
  } finally {
    diskBusy.value = "";
    await loadDiskUsage();
    // Re-stat the shared model catalog so cleared models flip from "disk" (→ "Re-download")
    // to "missing" (→ "Download") — the AI-page catalog singleton doesn't re-fetch on its
    // own after an out-of-band cache clear from this tab.
    refreshRunnerModels();
  }
}

async function clearSpawnLogs() {
  diskBusy.value = "spawn";
  diskErr.value = "";
  try {
    await post("/v1/llm-runner/spawn-logs/clear");
  } catch {
    diskErr.value = t("settings.storage.clearSpawnLogsError");
  } finally {
    diskBusy.value = "";
    await loadDiskUsage();
  }
}

// Immediate so a direct deep-link to #/settings/storage loads both cards too (the
// tab-click path already re-triggers this).
watch(active, (a) => { if (a === "storage") { loadStorageRoot(); loadDiskUsage(); } }, { immediate: true });

async function changeFolder() {
  const picked = await window.justwrite?.shell?.pickDirectory?.({ title: t("settings.storage.chooseFolderTitle") });
  if (!picked) return;
  const yes = await confirmDialog({
    title: t("settings.storage.moveDataTitle"),
    message: t("settings.storage.moveDataMessage", { path: picked }),
    confirmLabel: t("settings.storage.moveDataConfirm"),
  });
  if (!yes) return;
  relocating.value = true;
  storageErr.value = "";
  const res = await window.justwrite.storage.relocate(picked);
  if (res?.ok) {
    window.location.reload();
  } else {
    storageErr.value = res?.error || t("settings.storage.moveFailed");
    relocating.value = false;
  }
}
// ── Per-project export / import: a book travels as a single <title>.zip ──
const transferBusy = ref("");   // "export" | "import" | ""
const transferErr = ref(null);

async function exportThisProject() {
  transferErr.value = null;
  transferBusy.value = "export";
  try {
    const res = await exportProject(project._activeId, project.project.title);
    if (res?.ok) ui.showToast({ message: t("settings.backups.bookExported") });
    else if (res && !res.cancelled) transferErr.value = res.error || t("settings.backups.exportFailed");
  } catch (err) {
    transferErr.value = err.message || String(err);
  } finally {
    transferBusy.value = "";
  }
}

async function importAProject() {
  transferErr.value = null;
  transferBusy.value = "import";
  try {
    const meta = await importProject();
    if (meta?.id) {
      await project.openImportedProject(meta);
      ui.showToast({ message: t("settings.backups.bookImported", { title: meta.title || t("settings.backups.untitledBook") }) });
    }
  } catch (err) {
    transferErr.value = err.message || String(err);
  } finally {
    transferBusy.value = "";
  }
}

const requireLoopbackAuth = ref(false);
const newToken = ref("");
// The auth door is its OWN route since 2026-08-05 (/v1/server-auth — the family
// lockout escape, docgen's shape; user ruling: the apps work the same). The
// middleware exempts exactly this route + /v1/health for loopback, so this
// section can ALWAYS fix a lost token; it stopped riding the settings doc
// because exempting the whole settings API would gut requireForLoopback.
async function loadAuthCfg() {
  try {
    const a = await get("/v1/server-auth");
    authTokens.value = Array.isArray(a.tokens) ? a.tokens : [];
    requireLoopbackAuth.value = !!a.requireForLoopback;
  } catch { /* server down — the section shows empty; reopening reloads */ }
}
loadAuthCfg();
async function saveAuthCfg() {
  try {
    const a = await put("/v1/server-auth", {
      tokens: authTokens.value, requireForLoopback: requireLoopbackAuth.value,
    });
    authTokens.value = a.tokens;
    requireLoopbackAuth.value = !!a.requireForLoopback;
  } catch (e) {
    ui.showToast({ message: String(e?.message || e) });
  }
}
function addToken() {
  const t = newToken.value.trim();
  newToken.value = "";
  if (!t || authTokens.value.includes(t)) return;
  authTokens.value = [...authTokens.value, t];
  saveAuthCfg();
}
function removeToken(t) {
  authTokens.value = authTokens.value.filter((x) => x !== t);
  saveAuthCfg();
}
function setRequireLoopbackAuth(v) {
  requireLoopbackAuth.value = !!v;
  saveAuthCfg();
}
function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  newToken.value = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
async function copyHeadlessUrl() {
  try {
    await navigator.clipboard.writeText(headlessUrl.value);
    ui.showToast({ message: t("settings.server.copied") });
  } catch { /* clipboard blocked — no-op */ }
}

// ── Project meta editing ───────────────────────────────────────────
// Patch the store live as the user types; updateProjectMeta is already
// part of the undo/redo history so individual field edits are recoverable.
function setMeta(key, value) {
  project.updateProjectMeta({ [key]: value });
}
function setMetaNumber(key, value) {
  const n = Number(value);
  project.updateProjectMeta({ [key]: Number.isFinite(n) ? n : 0 });
}

// ── Cover image ────────────────────────────────────────────────────
const coverError = ref(null);
const coverUploading = ref(false);
const coverSrc = ref("");
watchEffect(async () => {
  const img = project.project.coverImage;
  coverSrc.value = img ? await urlFor(img) : "";
});

async function onPickCover(e) {
  const file = (e.target.files || [])[0];
  e.target.value = "";
  if (!file) return;
  if (!/^image\//.test(file.type)) {
    coverError.value = t("settings.coverImage.notAnImage");
    return;
  }
  coverError.value = null;
  coverUploading.value = true;
  try {
    const rec = await saveImage(file);
    project.setCoverImage(rec);
  } catch (err) {
    coverError.value = err.message || String(err);
  } finally {
    coverUploading.value = false;
  }
}
async function removeCover() {
  const yes = await confirmDialog({
    title: t("settings.coverImage.removeTitle"),
    confirmLabel: t("settings.coverImage.removeConfirm"),
    danger: true,
  });
  if (!yes) return;
  project.clearCoverImage();
}

// ── Appearance ─────────────────────────────────────────────────────
// Curated tables (presets, pairings, tints, ACCENT/GOLD_PRESETS) are
// imported from services/appearance.js so Settings offers exactly what the
// apply step understands. `ap` is the live appearance config.
const ap = computed(() => ui.appearance);
const THEMES = computed(() => [
  { id: "system", label: t("settings.appearance.themeSystem"), hint: t("settings.appearance.themeSystemHint") },
  { id: "light",  label: t("settings.appearance.themeLight"),  hint: t("settings.appearance.themeLightHint") },
  { id: "dark",   label: t("settings.appearance.themeDark"),   hint: t("settings.appearance.themeDarkHint") },
]);
const SURFACE_TINT_LIST = Object.entries(SURFACE_TINTS).map(([key, t]) => ({ key, ...t }));
const PAPER_TINT_LIST = Object.entries(PAPER_TINTS).map(([key, t]) => ({ key, ...t }));
const INK_PALETTE_LIST = Object.entries(INK_PALETTES).map(([key, t]) => ({ key, ...t }));
const SIDEBAR_HEADING_STYLE_LIST = Object.entries(SIDEBAR_HEADING_STYLES).map(([key, t]) => ({ key, ...t }));
const NAV_ITEM_STYLE_LIST = Object.entries(NAV_ITEM_STYLES).map(([key, t]) => ({ key, ...t }));
const EDITOR_FONT_SIZES = computed(() => [
  { value: "small",  label: t("settings.appearance.fontSizeSmall"),  px: "15px" },
  { value: "medium", label: t("settings.appearance.fontSizeMedium"), px: "18px" },
  { value: "big",    label: t("settings.appearance.fontSizeBig"),    px: "21px" },
]);
const EDITOR_LINE_OPTIONS = [1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2];
const EDITOR_PARA_OPTIONS = [0, 0.3, 0.5, 0.8, 1];

// ── Segmented-control option arrays ───────────────────────────────────
// Each maps existing constants to { value, label, sublabel? } so UiSegmented
// can consume them without needing to know internal key shapes.
const UI_SCALE_OPTIONS = UI_SCALES.map((s) => ({
  value: s.value, label: s.label, sublabel: `${Math.round(s.value * 100)}%`,
}));
const SH_STYLE_OPTIONS = SIDEBAR_HEADING_STYLE_LIST.map((s) => ({ value: s.key, label: s.label }));
const SH_SIZE_OPTIONS  = SIDEBAR_HEADING_SIZES.map((s) => ({ value: s.value, label: s.label }));
const NAV_STYLE_OPTIONS = NAV_ITEM_STYLE_LIST.map((s) => ({ value: s.key, label: s.label }));
const NAV_SIZE_OPTIONS  = NAV_ITEM_SIZES.map((s) => ({ value: s.value, label: s.label }));
const FONT_SIZE_OPTIONS = computed(() => EDITOR_FONT_SIZES.value.map((s) => ({ value: s.value, label: s.label, sublabel: s.px })));
const LINE_OPTIONS  = EDITOR_LINE_OPTIONS.map((v) => ({ value: v, label: String(v) }));
const PARA_OPTIONS  = EDITOR_PARA_OPTIONS.map((v) => ({ value: v, label: v === 0 ? "0" : `${v}em` }));
const INDENT_OPTIONS = computed(() => [
  { value: true,  label: t("settings.appearance.indentOn") },
  { value: false, label: t("settings.appearance.indentOff") },
]);

function isCustomHex(v) { return typeof v === "string" && v.startsWith("#"); }
function inkSwatch(t) {
  if (t.auto) return "var(--ink)";
  const shades = modeNow() === "dark" ? t.dark : t.light;
  return shades[0];
}

function setAp(patch) { ui.setAppearance(patch); }
function applyPreset(p) { ui.setAppearance({ preset: p.id, ...p.patch }); }
function clampHue(v) { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(360, Math.round(n))) : 0; }
function dispStack(label) { return (DISPLAY_FONTS.find((f) => f.label === label) || DISPLAY_FONTS[0]).stack; }
function modeNow() { return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"; }
function tintColor(t) { return t.var ? t.var : t[modeNow()]; }

// Custom presets — save the current look, rename, delete.
async function saveCurrentPreset() {
  const name = await promptDialog({ title: t("settings.appearance.savePresetTitle"), label: t("settings.appearance.presetNameLabel"), placeholder: t("settings.appearance.presetNamePlaceholder"), confirmLabel: t("settings.appearance.savePresetConfirm") });
  if (!name) return;
  ui.saveCustomPreset(name);
}
async function renameCustomPreset(p) {
  const name = await promptDialog({ title: t("settings.appearance.renamePresetTitle"), label: t("settings.appearance.presetNameLabel"), defaultValue: p.name, confirmLabel: t("settings.appearance.renamePresetConfirm") });
  if (!name) return;
  ui.renameCustomPreset(p.id, name);
}
async function removeCustomPreset(p) {
  const yes = await confirmDialog({ title: t("settings.appearance.deletePresetTitle", { name: p.name }), message: t("settings.appearance.deletePresetMessage"), confirmLabel: t("common.delete"), danger: true });
  if (!yes) return;
  ui.deleteCustomPreset(p.id);
}
async function resetAppearance() {
  const yes = await confirmDialog({
    title: t("settings.appearance.resetTitle"),
    message: t("settings.appearance.resetMessage"),
    confirmLabel: t("common.reset"),
  });
  if (!yes) return;
  ui.resetAppearance();
}

// ── Backups ────────────────────────────────────────────────────────
const backupError = ref(null);
const lastAutosaveAt = ref(readSetting("lastAutosaveAt") || null);
const autosaveDir = ref(null);
const autosaveDirBusy = ref(false);
// The autosave-folder picker is desktop-only (needs the native folder dialog).
const canPickAutosaveFolder = !!(typeof window !== "undefined" && window.justwrite?.shell?.pickDirectory);

// Resolve the autosave folder path so users can see where their work
// is being mirrored to disk (served by the Python server; works in browser-dev too).
async function refreshAutosaveDir() {
  try {
    const res = await autosaveApi.getAutosaveDir();
    if (res && typeof res.dir === "string") autosaveDir.value = res.dir;
  } catch {}
}
refreshAutosaveDir();

// D3a: let the user move the autosave folder. The native folder dialog opens at
// the CURRENT autosave folder (never the OS home — chooserDir guarantees a real
// path); the server migrates the existing rotating files into the chosen folder
// (autosave.py put_autosave_dir). Remember-last under the shared "autosave"
// chooser key (folder-path config that survives a workspace reset, D3b).
async function changeAutosaveFolder() {
  if (!canPickAutosaveFolder) return;
  autosaveDirBusy.value = true;
  backupError.value = null;
  try {
    const defaultPath = autosaveDir.value || (await chooserDir("autosave"));
    const picked = await window.justwrite.shell.pickDirectory({
      title: t("settings.backups.chooseAutosaveFolderTitle"),
      defaultPath,
    });
    if (!picked) return;
    await autosaveApi.putAutosaveDir(picked);
    rememberDir("autosave", picked);
    await refreshAutosaveDir();
    if (autosaveListShown.value) await refreshAutosaveList(); // the list reads the new folder
  } catch (err) {
    backupError.value = err.message || String(err);
  } finally {
    autosaveDirBusy.value = false;
  }
}

// Re-read the timestamp on every tab switch into Backups so the user
// doesn't see a stale "Never" right after the first autosave fires.
watchEffect(() => {
  if (active.value === "backups") {
    lastAutosaveAt.value = readSetting("lastAutosaveAt") || null;
    loadStorageRoot();  // Backups shows the data-folder path read-only (relocate lives in Storage).
  }
});

// AI / studio / sessions stores only hydrate from IndexedDB at boot, so
// after restoring workspace keys we need a reload for them to take effect.
// Flush any pending IDB writes first so the reload sees the new values.
function scheduleWorkspaceReload() {
  ui.showToast({ message: t("settings.backups.reloadingWorkspace") });
  flushPending();
  setTimeout(() => location.reload(), 700);
}

// ── Restore from autosave ─────────────────────────────────────────
const autosaveList = ref([]);
const autosaveListBusy = ref(false);
const autosaveListShown = ref(false);

async function toggleAutosaveList() {
  autosaveListShown.value = !autosaveListShown.value;
  if (autosaveListShown.value) await refreshAutosaveList();
}

async function refreshAutosaveList() {
  autosaveListBusy.value = true; backupError.value = null;
  try {
    const res = await autosaveApi.listAutosaves();
    autosaveList.value = Array.isArray(res) ? res : [];
    autosaveSelected.value = {}; // drop any stale checkbox state after the list changes
  } catch (err) {
    backupError.value = err.message || String(err);
  } finally {
    autosaveListBusy.value = false;
  }
}

// ── Select + delete autosaves (P4) ─────────────────────────────────
// Per-row checkbox selection (key -> bool) drives "Delete selected"; "Delete all"
// clears the folder. Both confirm first (kit confirmDialog) and, per the QC-37
// toast law, give NO toast — the row(s) visibly leaving the list is the feedback.
const autosaveSelected = ref({});
const selectedAutosaveKeys = computed(() =>
  autosaveList.value.map((e) => e.key).filter((k) => autosaveSelected.value[k]),
);

async function removeSelectedAutosaves() {
  const keys = selectedAutosaveKeys.value;
  if (!keys.length) return;
  const yes = await confirmDialog({
    title: t("settings.backups.deleteSelectedTitle", { n: keys.length }, keys.length),
    message: t("settings.backups.deleteSelectedMessage"),
    confirmLabel: t("common.delete"),
    danger: true,
  });
  if (!yes) return;
  backupError.value = null;
  try {
    for (const k of keys) await autosaveApi.deleteAutosave(k);
    await refreshAutosaveList();
  } catch (err) {
    backupError.value = err.message || String(err);
  }
}

async function removeAllAutosaves() {
  if (!autosaveList.value.length) return;
  const yes = await confirmDialog({
    title: t("settings.backups.deleteAllTitle"),
    message: t("settings.backups.deleteAllMessage"),
    confirmLabel: t("settings.backups.deleteAllConfirm"),
    danger: true,
  });
  if (!yes) return;
  backupError.value = null;
  try {
    await autosaveApi.deleteAllAutosaves();
    await refreshAutosaveList();
  } catch (err) {
    backupError.value = err.message || String(err);
  }
}

async function restoreFromAutosave(entry) {
  backupError.value = null;
  const when = entry.savedAt ? new Date(entry.savedAt).toLocaleString() : t("settings.backups.unknownTime");
  const yes = await confirmDialog({
    title: t("settings.backups.restoreTitle", { title: entry.title || t("settings.backups.untitledProject"), generation: entry.generation }),
    message: t("settings.backups.restoreMessage", { when }),
    confirmLabel: t("settings.backups.restoreConfirm"),
    danger: true,
  });
  if (!yes) return;
  try {
    const snap = await autosaveApi.readAutosave(entry.key);
    if (!snap || typeof snap !== "object" || !snap.project) {
      throw new Error("Couldn't read the autosave file.");
    }
    const { workspaceRestored } = project.loadSnapshot(snap) || {};
    ui.showToast({ message: t("settings.backups.restoredToast", { title: snap.project.title || t("settings.backups.untitledProject") }) });
    if (workspaceRestored) scheduleWorkspaceReload();
  } catch (err) {
    backupError.value = err.message || String(err);
  }
}

function autosaveLabel(when) {
  if (!when) return t("settings.backups.unknownTimeLabel");
  try { return new Date(when).toLocaleString(); } catch { return when; }
}
function generationLabel(gen) {
  if (gen === "current") return t("settings.backups.generationCurrent");
  if (gen === "prev")    return t("settings.backups.generationPrevious");
  if (gen === "prev2")   return t("settings.backups.generationEarlier");
  return gen || "";
}

const lastAutosaveLabel = computed(() => {
  if (!lastAutosaveAt.value) return t("settings.backups.autosavePending");
  try { return new Date(lastAutosaveAt.value).toLocaleString(); } catch { return lastAutosaveAt.value; }
});


// ── About ──────────────────────────────────────────────────────────
const platformLabel = computed(() => {
  const jw = window.justwrite;
  if (jw?.platform === "tauri") return t("settings.about.runtimeTauri", { version: jw.version || "2" });
  return t("settings.about.runtimeBrowser");
});

const stats = computed(() => {
  const chapters = Object.keys(project.chapterBody || {}).length;
  const characters = (project.characters || []).length;
  const locations = (project.locations || []).length;
  const objects = (project.objects || []).length;
  const worldbuilding = (project.worldbuilding || []).length;
  const trashTotal = Object.values(project.trash || {}).reduce((n, list) => n + (list?.length || 0), 0);
  return { chapters, characters, locations, objects, worldbuilding, trashTotal };
});

// ── Statuses (user-definable palette) ──────────────────────────────
const STATUS_SWATCHES = [
  "oklch(0.7 0.13 75)",  "oklch(0.65 0.13 30)",  "oklch(0.6 0.13 150)",
  "oklch(0.65 0.13 250)", "oklch(0.66 0.14 320)", "oklch(0.68 0.13 200)",
  "oklch(0.64 0.14 290)", "oklch(0.7 0.12 120)",  "oklch(0.55 0.02 260)",
];
const editingColorId = ref(null);
function addStatus() {
  const color = STATUS_SWATCHES[project.statuses.length % STATUS_SWATCHES.length];
  editingColorId.value = project.addStatusDef({ label: "New status", color });
}
function renameStatus(id, label) { project.updateStatusDef(id, { label }); }
function recolorStatus(id, color) { project.updateStatusDef(id, { color }); editingColorId.value = null; }
async function deleteStatus(s) {
  const yes = await confirmDialog({
    title: t("settings.statuses.deleteTitle", { label: s.label }),
    message: t("settings.statuses.deleteMessage"),
    confirmLabel: t("settings.statuses.deleteConfirm"),
    danger: true,
  });
  if (!yes) return;
  project.removeStatusDef(s.id);
}

// ── Tag vocabularies ───────────────────────────────────────────────
const TAG_VOCAB_KINDS = [
  { key: "characters",    labelKey: "nav.characters" },
  { key: "locations",     labelKey: "nav.locations" },
  { key: "objects",       labelKey: "nav.objects" },
  { key: "worldbuilding", labelKey: "nav.worldbuilding" },
];

// ── Worldbuilding categories (user-definable) ──────────────────────
// The category's `icon` field stays in the data model (sidebar still
// renders it), but the icon picker UI was removed — new categories
// default to "Sparkle" since we can't know what the user wants.
function addCategory() {
  project.addWorldbuildingCategory({ label: "New category" });
}
function renameCategory(id, label) { project.updateWorldbuildingCategory(id, { label }); }
function recolorCategory(id, hue) { project.updateWorldbuildingCategory(id, { hue }); }
// Parse the hue number out of an oklch() string emitted by UiColorPicker,
// since worldbuilding categories store hue as a bare number (the render
// code reassembles oklch with its own clamped L and C).
function parseHueFromOklch(s) {
  const m = String(s || "").match(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/);
  return m ? Math.round(parseFloat(m[1])) % 360 : 200;
}
async function deleteCategory(c) {
  if (project.worldbuildingCategories.length <= 1) {
    ui.showToast({ message: t("settings.wbCategories.keepOne") });
    return;
  }
  const count = project.worldbuilding.filter((a) => a.category === c.id).length;
  const into = project.worldbuildingCategories.find((x) => x.id !== c.id)?.label;
  const yes = await confirmDialog({
    title: t("settings.wbCategories.deleteTitle", { label: c.label }),
    message: count ? t("settings.wbCategories.deleteMessage", { n: count, into }, count) : t("settings.wbCategories.deleteMessageEmpty"),
    confirmLabel: t("sidebar.actions.deleteWbCategoryConfirm"),
    danger: true,
  });
  if (!yes) return;
  project.removeWorldbuildingCategory(c.id);
}

</script>

<template>
  <PaneHeader :eyebrow="$t('settings.eyebrow')" :title="$t('settings.title')" help-key="appearance" />
  <div class="pane-card">
    <div class="scrollarea" style="padding:22px">
    <!-- i18n-t + named slots (the user's ruling, 2026-07-26: "i18n-t with slots, no html
         in messages"). Each emphasised term reuses the key that already names that thing —
         the section names come from settings.sections.*, so the intro can never drift from
         the tab strip it describes. -->
    <i18n-t keypath="settings.intro" tag="p" class="set-desc" scope="global">
      <template #settings><strong>{{ $t("settings.title") }}</strong></template>
      <template #project><strong>{{ $t("settings.sections.project") }}</strong></template>
      <template #appearance><strong>{{ $t("settings.sections.appearance") }}</strong></template>
      <template #general><strong>{{ $t("settings.sections.general") }}</strong></template>
      <template #backups><strong>{{ $t("settings.sections.backups") }}</strong></template>
      <template #ai><strong>{{ $t("settings.introTerms.ai") }}</strong></template>
    </i18n-t>
    <div class="settings-layout">
      <!-- Section tabs — horizontal strip, full width (matches JV's settings) -->
      <nav class="set-tabs">
        <button v-for="s in SECTIONS" :key="s.id"
          type="button" class="set-tab" :class="{ on: active === s.id }"
          @click="active = s.id">{{ s.label }}</button>
      </nav>

      <!-- ── PROJECT ─────────────────────────────── -->
      <div v-if="active === 'project'" style="display:flex;flex-direction:column;gap:14px;min-width:0">
        <div class="card">
          <div class="card-title">{{ $t('settings.project.cardTitle') }}</div>
          <p class="t-muted" style="font-size:12px;margin:0 0 14px;line-height:1.55">
            {{ $t('settings.project.editsUndoHint') }}
          </p>
          <div style="display:grid;grid-template-columns:160px minmax(0,1fr);gap:10px 14px;font-size:13px;align-items:center">
            <span class="t-muted">{{ $t('settings.project.fieldTitle') }}</span>
            <UiInput :model-value="project.project.title"
              @update:model-value="(v) => setMeta('title', v)" :placeholder="$t('settings.project.fieldTitlePlaceholder')" />
            <span class="t-muted">{{ $t('settings.project.fieldAuthor') }}</span>
            <UiInput :model-value="project.project.author"
              @update:model-value="(v) => setMeta('author', v)" :placeholder="$t('settings.project.fieldAuthorPlaceholder')" />
            <span class="t-muted">{{ $t('settings.project.fieldSubtitle') }}</span>
            <UiInput :model-value="project.project.subtitle"
              @update:model-value="(v) => setMeta('subtitle', v)" :placeholder="$t('settings.project.fieldSubtitlePlaceholder')" />
            <span class="t-muted">{{ $t('settings.project.fieldGenre') }}</span>
            <UiInput :model-value="project.project.genre"
              @update:model-value="(v) => setMeta('genre', v)" :placeholder="$t('settings.project.fieldGenrePlaceholder')" />
            <span class="t-muted">{{ $t('settings.project.fieldStarted') }}</span>
            <UiInput :model-value="project.project.startedOn"
              @update:model-value="(v) => setMeta('startedOn', v)" :placeholder="$t('settings.project.fieldStartedPlaceholder')" />
            <span class="t-muted">{{ $t('settings.project.fieldDeadline') }}</span>
            <UiInput :model-value="project.project.deadline"
              @update:model-value="(v) => setMeta('deadline', v)" :placeholder="$t('settings.project.fieldDeadlinePlaceholder')" />
            <span class="t-muted" style="align-self:start;padding-top:6px">{{ $t('settings.project.fieldPremise') }}</span>
            <UiTextarea auto-resize rows="3" :model-value="project.project.premise"
              @update:model-value="(v) => setMeta('premise', v)"
              :placeholder="$t('settings.project.fieldPremisePlaceholder')" />
          </div>
        </div>
        <div class="card">
          <div class="card-title">{{ $t('settings.goals.cardTitle') }}</div>
          <div style="display:grid;grid-template-columns:160px minmax(0,1fr);gap:10px 14px;font-size:13px;align-items:center">
            <span class="t-muted" style="align-self:start;padding-top:8px">{{ $t('settings.goals.wordGoal') }}</span>
            <div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0">
              <UiNumber :min="0" :step="500" style="max-width:160px"
                :model-value="project.project.wordsGoal"
                @update:model-value="(v) => setMetaNumber('wordsGoal', v)" />
              <span class="t-muted" style="font-size:11.5px">{{ $t('settings.goals.wordGoalHint') }}</span>
            </div>
            <span class="t-muted" style="align-self:start;padding-top:8px">{{ $t('settings.goals.dailyTarget') }}</span>
            <div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0">
              <UiNumber :min="0" :step="50" style="max-width:160px"
                :model-value="project.project.dailyTarget ?? 1200"
                @update:model-value="(v) => setMetaNumber('dailyTarget', v)" />
              <span class="t-muted" style="font-size:11.5px">{{ $t('settings.goals.dailyTargetHint') }}</span>
            </div>
          </div>
        </div>

        <!-- ── Statuses ─────────────────────────────────────── -->
        <div class="card">
          <div class="card-title">{{ $t('settings.statuses.cardTitle') }}</div>
          <p class="t-muted" style="font-size:12.5px;margin:0 0 14px;line-height:1.55">
            {{ $t('settings.statuses.hint') }}
          </p>
          <div style="display:flex;flex-direction:column;gap:8px">
            <div v-for="s in project.statuses" :key="s.id" style="display:flex;align-items:center;gap:10px">
              <div style="position:relative">
                <button type="button" v-tooltip.bottom="$t('settings.statuses.changeColorTooltip')"
                  :style="`width:24px;height:24px;border-radius:6px;border:1px solid var(--border);cursor:pointer;background:${s.color}`"
                  @click="editingColorId = editingColorId === s.id ? null : s.id" />
                <div v-if="editingColorId === s.id"
                  style="position:absolute;top:calc(100% + 5px);left:0;z-index:20;display:grid;grid-template-columns:repeat(5,20px);gap:5px;padding:8px;background:var(--surface);border:1px solid var(--border-strong);border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.18)">
                  <button v-for="c in STATUS_SWATCHES" :key="c" type="button"
                    :style="`width:20px;height:20px;border-radius:5px;border:0;cursor:pointer;background:${c};box-shadow:${c === s.color ? '0 0 0 2px var(--surface),0 0 0 4px var(--accent)' : 'inset 0 0 0 1px rgba(0,0,0,.08)'}`"
                    @click="recolorStatus(s.id, c)" />
                  <label :title="$t('settings.statuses.customColor')"
                    style="position:relative;width:20px;height:20px;border-radius:5px;display:grid;place-items:center;border:1px dashed var(--border-strong);cursor:pointer;color:var(--muted)">
                    <input type="color" style="position:absolute;inset:0;opacity:0;cursor:pointer;border:0;padding:0"
                      @input="recolorStatus(s.id, $event.target.value)" />
                    <Icon name="Plus" :size="11" />
                  </label>
                </div>
              </div>
              <UiInput style="max-width:220px" :model-value="s.label"
                @update:model-value="(v) => renameStatus(s.id, v)" :placeholder="$t('settings.statuses.namePlaceholder')" />
              <span :style="`font-size:11px;font-weight:600;text-transform:lowercase;color:${s.color}`">{{ s.label }}</span>
              <UiButton intent="ghost" size="small" style="margin-left:auto" v-tooltip.bottom="$t('settings.statuses.deleteConfirm')" @click="deleteStatus(s)">
                <template #icon><Icon name="Trash" :size="13" /></template>
              </UiButton>
            </div>
            <div v-if="!project.statuses.length" class="t-muted" style="font-size:12.5px;font-style:italic">{{ $t('settings.statuses.empty') }}</div>
          </div>
          <UiButton :label="$t('settings.statuses.addStatus')" intent="ghost" style="margin-top:12px" @click="addStatus">
            <template #icon><Icon name="Plus" :size="13" /></template>
          </UiButton>
        </div>

        <!-- ── Worldbuilding categories ─────────────────────── -->
        <div class="card">
          <div class="card-title">{{ $t('settings.wbCategories.cardTitle') }}</div>
          <p class="t-muted" style="font-size:12.5px;margin:0 0 14px;line-height:1.55">
            {{ $t('settings.wbCategories.hint') }}
          </p>
          <div style="display:flex;flex-direction:column;gap:8px">
            <div v-for="c in project.worldbuildingCategories" :key="c.id" style="display:flex;align-items:center;gap:10px">
              <UiInput style="max-width:220px" :model-value="c.label"
                @update:model-value="(v) => renameCategory(c.id, v)" :placeholder="$t('sidebar.actions.newWbCategoryLabel')" />
              <UiColorPicker :presets="PRESET_COLORS"
                :model-value="`oklch(0.62 0.13 ${c.hue})`"
                :aria-label="$t('settings.wbCategories.colorAriaLabel')"
                @update:model-value="(v) => recolorCategory(c.id, parseHueFromOklch(v))" />
              <UiButton intent="ghost" size="small" style="margin-left:auto" v-tooltip.bottom="$t('sidebar.actions.deleteWbCategoryConfirm')" @click="deleteCategory(c)">
                <template #icon><Icon name="Trash" :size="13" /></template>
              </UiButton>
            </div>
            <div v-if="!project.worldbuildingCategories.length" class="t-muted" style="font-size:12.5px;font-style:italic">{{ $t('settings.wbCategories.empty') }}</div>
          </div>
          <UiButton :label="$t('settings.wbCategories.addCategory')" intent="ghost" style="margin-top:12px" @click="addCategory">
            <template #icon><Icon name="Plus" :size="13" /></template>
          </UiButton>
        </div>

        <!-- ── Tag vocabularies ─────────────────────────────── -->
        <div class="card">
          <div class="card-title">{{ $t('settings.tagVocabularies.cardTitle') }}</div>
          <p class="t-muted" style="font-size:12.5px;margin:0 0 14px;line-height:1.55">
            {{ $t('settings.tagVocabularies.hint') }}
          </p>
          <div style="display:flex;flex-direction:column;gap:18px">
            <div v-for="kind in TAG_VOCAB_KINDS" :key="kind.key">
              <div class="t-eyebrow" style="margin-bottom:8px">{{ $t(kind.labelKey) }}</div>
              <div style="display:flex;flex-direction:column;gap:6px">
                <div v-for="t in project.tagVocabularies[kind.key]" :key="t.id"
                  style="display:flex;align-items:center;gap:10px">
                  <UiInput style="max-width:280px" :model-value="t.label"
                    @update:model-value="(v) => project.renameTagVocab(kind.key, t.id, v)"
                    :placeholder="$t('settings.tagVocabularies.placeholder')" />
                  <UiButton intent="ghost" size="small" style="margin-left:auto"
                    v-tooltip.bottom="$t('common.remove')"
                    @click="project.removeTagVocab(kind.key, t.id)">
                    <template #icon><Icon name="Trash" :size="13" /></template>
                  </UiButton>
                </div>
                <div v-if="!project.tagVocabularies[kind.key].length"
                  class="t-muted" style="font-size:12.5px;font-style:italic">
                  {{ $t('settings.tagVocabularies.empty') }}
                </div>
              </div>
              <UiButton :label="$t('settings.tagVocabularies.addTag')" intent="ghost"
                size="small" style="margin-top:8px"
                @click="project.addTagVocab(kind.key)">
                <template #icon><Icon name="Plus" :size="13" /></template>
              </UiButton>
            </div>
          </div>
        </div>

        <!-- ── Cover image ──────────────────────────────────── -->
        <div class="card">
          <div class="card-title">{{ $t('settings.coverImage.cardTitle') }}</div>
          <p class="t-muted" style="font-size:12.5px;margin:0 0 14px;line-height:1.55">
            {{ $t('settings.coverImage.hint') }}
          </p>

          <div style="display:grid;grid-template-columns:minmax(0,140px) minmax(0,1fr);gap:18px;align-items:start">
            <!-- Preview -->
            <div class="cover-frame" :class="{ empty: !coverSrc }">
              <img v-if="coverSrc" :src="coverSrc" :alt="$t('settings.coverImage.coverAlt')" />
              <Icon v-else name="Image" :size="32" />
            </div>

            <div style="display:flex;flex-direction:column;gap:10px">
              <div v-if="project.project.coverImage" style="font-size:12.5px">
                <div><b>{{ project.project.coverImage.name || "cover" }}</b></div>
                <div class="t-muted" style="font-size:11.5px;margin-top:2px">
                  {{ project.project.coverImage.serverId ? $t('settings.coverImage.storedServer') : $t('settings.coverImage.storedInline') }}
                </div>
              </div>
              <div v-else class="t-muted" style="font-size:12.5px;font-style:italic">
                {{ $t('settings.coverImage.empty') }}
              </div>

              <div v-if="coverError" class="banner danger">
                {{ coverError }}
              </div>

              <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
                <UiButton as="label" intent="primary" :disabled="coverUploading">
                  <Icon name="Image" :size="13" />
                  {{ coverUploading ? $t('settings.coverImage.uploading') : (project.project.coverImage ? $t('settings.coverImage.replace') : $t('settings.coverImage.choose')) }}
                  <input type="file" accept="image/*" style="display:none" @change="onPickCover" :disabled="coverUploading" />
                </UiButton>
                <UiButton v-if="project.project.coverImage" :label="$t('common.remove')" intent="ghost" @click="removeCover" />
              </div>

              <div class="t-muted" style="font-size:11px;display:inline-flex;gap:5px;align-items:center;font-family:var(--font-mono)">
                <Icon name="Check" :size="11" />
                {{ $t('settings.coverImage.savedNote') }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── APPEARANCE ────────────────────────────── -->
      <div v-else-if="active === 'appearance'" style="display:flex;flex-direction:column;gap:14px">

        <!-- Language (UI locale — lives with Appearance, matching JustVoice) -->
        <div class="card">
          <div class="card-title">{{ $t("settings.language.label") }}</div>
          <div style="display:flex;flex-direction:column;gap:6px;min-width:0;max-width:300px;margin-top:8px">
            <UiSelect
              :model-value="ui.locale || activeI18nLocale"
              @update:model-value="onLocaleChange"
              :options="LOCALE_OPTIONS"
              option-label="label"
              option-value="value"
            />
            <span class="t-muted" style="font-size:11.5px">{{ $t("settings.language.hint") }}</span>
          </div>
        </div>

        <!-- Presets -->
        <div class="card">
          <div class="card-title">{{ $t('settings.appearance.presetCardTitle') }}
            <UiButton :label="$t('settings.appearance.resetToDefaults')" intent="ghost" size="small" style="margin-left:auto" @click="resetAppearance"
              v-tooltip.bottom="$t('settings.appearance.resetTooltip')">
              <template #icon><Icon name="Refresh" :size="12" /></template>
            </UiButton>
          </div>
          <p class="t-muted" style="font-size:12px;margin:0 0 12px">{{ $t('settings.appearance.presetsHint') }}</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:10px">
            <button v-for="p in THEME_PRESETS" :key="p.id"
              class="preset-tile" :class="{ active: ap.preset === p.id }"
              :data-testid="`theme-preset-${p.id}`"
              @click="applyPreset(p)">
              <b>{{ p.name }}</b>
              <span class="t-muted">{{ p.hint }}</span>
              <Icon v-if="ap.preset === p.id" name="Check" :size="13" class="preset-check" />
            </button>

            <div v-for="p in ui.customPresets" :key="p.id"
              class="preset-tile is-saved" :class="{ active: ap.preset === p.id }"
              @click="applyPreset(p)">
              <b>{{ p.name }}</b>
              <span class="t-muted">{{ $t('settings.appearance.savedPresetTag') }}</span>
              <div class="preset-actions">
                <button class="preset-act" v-tooltip.bottom="$t('settings.appearance.renamePresetConfirm')" @click.stop="renameCustomPreset(p)"><Icon name="Pencil" :size="12" /></button>
                <button class="preset-act danger" v-tooltip.bottom="$t('common.delete')" @click.stop="removeCustomPreset(p)"><Icon name="Trash" :size="12" /></button>
              </div>
            </div>

            <button v-if="ap.preset === 'custom'" class="preset-tile is-save" @click="saveCurrentPreset">
              <Icon name="Plus" :size="15" />
              <b>{{ $t('settings.appearance.savePresetCurrent') }}</b>
              <span class="t-muted">{{ $t('settings.appearance.savePresetCurrentHint') }}</span>
            </button>
          </div>
        </div>

        <!-- Preview — sits right under the preset row so a preset click
             is immediately reflected without scrolling. -->
        <div class="card">
          <div class="card-title">{{ $t('settings.appearance.previewCardTitle') }}</div>
          <div class="appear-preview" :data-layout="ap.editorLayout">
            <div class="ap-side">
              <div class="ap-brand">{{ $t('welcome.wordmark') }}</div>
              <div class="ap-section">{{ $t('sidebar.sections.manuscript') }}</div>
              <div class="ap-nav active">{{ $t('nav.chapters') }}</div>
              <div class="ap-nav">{{ $t('nav.characters') }}</div>
              <div class="ap-section">{{ $t('sidebar.sections.project') }}</div>
              <div class="ap-nav">{{ $t('settings.title') }}</div>
            </div>
            <div class="ap-main">
              <div class="ap-page">
                <div v-if="ap.editorLayout === 'page'" class="ap-runninghead">{{ $t('settings.appearance.previewRunningHead') }}</div>
                <div class="ap-eyebrow">{{ $t('settings.appearance.previewEyebrow') }}</div>
                <div class="ap-h">{{ $t('settings.appearance.previewTitle') }}</div>
                <p class="ap-prose">{{ $t('settings.appearance.previewProse1') }}</p>
                <p class="ap-prose">{{ $t('settings.appearance.previewProse2') }}</p>
                <div class="ap-ornament">✦&nbsp;&nbsp;✦&nbsp;&nbsp;✦</div>
                <div class="ap-controls">
                  <UiButton intent="primary" size="small">{{ $t('settings.appearance.previewAccent') }}</UiButton>
                  <span class="chip" style="background:var(--accent-soft);color:var(--accent-ink);border-color:var(--accent-line)">{{ $t('settings.appearance.previewSelected') }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Mode -->
        <div class="card">
          <div class="card-title">{{ $t('settings.appearance.modeCardTitle') }}</div>
          <div class="settings-mode-grid" style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:10px" role="radiogroup" :aria-label="$t('settings.appearance.modeAriaLabel')">
            <button v-for="t in THEMES" :key="t.id"
              role="radio" :aria-checked="ap.mode === t.id"
              class="theme-tile" :class="{ active: ap.mode === t.id }"
              @click="setAp({ mode: t.id })">
              <div class="theme-preview" :data-mode="t.id === 'system' ? 'split' : t.id">
                <span class="dot dot-bg" /><span class="dot dot-surf" /><span class="dot dot-ink" />
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-start;gap:2px">
                <b style="font-size:12.5px">{{ t.label }}</b>
                <span class="t-muted" style="font-size:11px;line-height:1.4">{{ t.hint }}</span>
              </div>
              <Icon v-if="ap.mode === t.id" name="Check" :size="14" style="margin-left:auto;color:var(--accent)" />
            </button>
          </div>
        </div>

        <!-- Typography -->
        <div class="card">
          <div class="card-title">{{ $t('settings.appearance.typographyCardTitle') }}</div>
          <p class="t-muted" style="font-size:12px;margin:0 0 12px">{{ $t('settings.appearance.typographyHint') }}</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px">
            <button v-for="p in PAIRINGS" :key="p.id"
              class="pairing-tile" :class="{ active: ap.fontPairing === p.id }"
              @click="setAp({ fontPairing: p.id, uiFont: p.ui, displayFont: p.display, editorBodyFont: p.display })">
              <span class="pairing-sample" :style="{ fontFamily: dispStack(p.display) }">{{ $t("settings.appearance.fontSpecimen") }}</span>
              <div style="display:flex;flex-direction:column;min-width:0">
                <b style="font-size:12.5px">{{ p.name }}</b>
                <span class="t-muted" style="font-size:10.5px">{{ p.display }} · {{ p.ui }}</span>
              </div>
              <Icon v-if="ap.fontPairing === p.id" name="Check" :size="13" style="margin-left:auto;color:var(--accent)" />
            </button>
          </div>
          <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:14px">
            <label class="field"><span class="field-l">{{ $t('settings.appearance.uiFontLabel') }}</span>
              <UiSelect :model-value="ap.uiFont" @update:model-value="(v) => setAp({ uiFont: v })"
                :options="UI_FONTS.map(f => ({ label: f.label, value: f.label }))"
                optionLabel="label" optionValue="value" />
              <span class="field-hint">{{ $t('settings.appearance.uiFontHint') }}</span>
            </label>
            <label class="field"><span class="field-l">{{ $t('settings.appearance.displayFontLabel') }}</span>
              <UiSelect :model-value="ap.displayFont" @update:model-value="(v) => setAp({ displayFont: v })"
                :options="DISPLAY_FONTS.map(f => ({ label: f.label, value: f.label }))"
                optionLabel="label" optionValue="value" />
              <span class="field-hint">{{ $t('settings.appearance.displayFontHint') }}</span>
            </label>
            <label class="field"><span class="field-l">{{ $t('settings.appearance.editorBodyFontLabel') }}</span>
              <UiSelect :model-value="ap.editorBodyFont" @update:model-value="(v) => setAp({ editorBodyFont: v })"
                :options="DISPLAY_FONTS.map(f => ({ label: f.label, value: f.label }))"
                optionLabel="label" optionValue="value" />
              <span class="field-hint">{{ $t('settings.appearance.editorBodyFontHint') }}</span>
            </label>
          </div>
          <div class="size-row">
            <span class="field-l">{{ $t('settings.appearance.sizeLabel') }}</span>
            <UiSegmented
              class="size-seg" variant="connected"
              :model-value="ap.uiScale"
              :options="UI_SCALE_OPTIONS"
              :aria-label="$t('settings.appearance.uiScaleAriaLabel')"
              @update:model-value="setAp({ uiScale: $event })" />
            <p class="size-hint">{{ $t('settings.appearance.uiScaleHint') }}</p>
          </div>
          <div class="size-row">
            <span class="field-l">{{ $t('settings.appearance.sectionHeadingLabel') }}</span>
            <UiSegmented
              class="size-seg" variant="connected"
              :model-value="ap.sidebarHeadingStyle"
              :options="SH_STYLE_OPTIONS"
              :aria-label="$t('settings.appearance.shStyleAriaLabel')"
              @update:model-value="setAp({ sidebarHeadingStyle: $event })" />
            <UiSegmented
              class="size-seg size-seg-narrow" variant="connected"
              :model-value="ap.sidebarHeadingSize"
              :options="SH_SIZE_OPTIONS"
              :aria-label="$t('settings.appearance.shSizeAriaLabel')"
              @update:model-value="setAp({ sidebarHeadingSize: $event })" />
            <i18n-t keypath="settings.appearance.sectionHeadingHint" tag="p" class="size-hint" scope="global">
              <template #manuscript><em>{{ $t("sidebar.sections.manuscript") }}</em></template>
              <template #storyWorld><em>{{ $t("sidebar.sections.storyWorld") }}</em></template>
            </i18n-t>
          </div>
          <div class="size-row">
            <span class="field-l">{{ $t('settings.appearance.menuItemLabel') }}</span>
            <UiSegmented
              class="size-seg" variant="connected"
              :model-value="ap.navItemStyle"
              :options="NAV_STYLE_OPTIONS"
              :aria-label="$t('settings.appearance.navStyleAriaLabel')"
              @update:model-value="setAp({ navItemStyle: $event })" />
            <UiSegmented
              class="size-seg size-seg-narrow" variant="connected"
              :model-value="ap.navItemSize"
              :options="NAV_SIZE_OPTIONS"
              :aria-label="$t('settings.appearance.navSizeAriaLabel')"
              @update:model-value="setAp({ navItemSize: $event })" />
            <i18n-t keypath="settings.appearance.menuItemHint" tag="p" class="size-hint" scope="global">
              <template #home><em>{{ $t("nav.home") }}</em></template>
              <template #chapters><em>{{ $t("nav.chapters") }}</em></template>
              <template #characters><em>{{ $t("nav.characters") }}</em></template>
            </i18n-t>
          </div>
        </div>

        <!-- Accents (primary + second) -->
        <div class="card">
          <div class="card-title">{{ $t('settings.appearance.accentsCardTitle') }}</div>
          <i18n-t keypath="settings.appearance.accentsHint" tag="p" class="t-muted" style="font-size:12px;margin:0 0 12px" scope="global">
            <!-- a button-intent id, not copy — never translated (see the lint's ignoreNodes) -->
            <template #accent2Intent><code>accent2</code></template>
          </i18n-t>
          <div class="swatch-row" role="radiogroup" :aria-label="$t('settings.appearance.accentLabel')">
            <span class="swatch-label">{{ $t('settings.appearance.accentLabel') }}</span>
            <button v-for="p in ACCENT_PRESETS" :key="p.hue"
              role="radio" :aria-checked="ap.accentHue === p.hue" :aria-label="p.name"
              class="accent-swatch" :class="{ active: ap.accentHue === p.hue }"
              :title="p.name" :style="`background: oklch(0.55 0.13 ${p.hue})`"
              @click="setAp({ accentHue: p.hue })">
              <Icon v-if="ap.accentHue === p.hue" name="Check" :size="12" />
            </button>
            <UiNumber :min="0" :max="360" style="width:74px"
              :model-value="ap.accentHue" @update:model-value="(v) => setAp({ accentHue: clampHue(v) })" />
          </div>
          <div class="swatch-row" style="margin-top:8px" role="radiogroup" :aria-label="$t('settings.appearance.accent2Label')">
            <span class="swatch-label">{{ $t('settings.appearance.accent2Label') }}</span>
            <button v-for="p in GOLD_PRESETS" :key="p.hue"
              role="radio" :aria-checked="ap.goldHue === p.hue" :aria-label="p.name"
              class="accent-swatch" :class="{ active: ap.goldHue === p.hue }"
              :title="p.name" :style="`background: oklch(0.62 0.1 ${p.hue})`"
              @click="setAp({ goldHue: p.hue })">
              <Icon v-if="ap.goldHue === p.hue" name="Check" :size="12" />
            </button>
            <UiNumber :min="0" :max="360" style="width:74px"
              :model-value="ap.goldHue" @update:model-value="(v) => setAp({ goldHue: clampHue(v) })" />
          </div>
          <!-- Live preview — the button + tag both track the Accent 2 hue. -->
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:14px;padding-top:12px;border-top:1px solid var(--border-soft)">
            <UiButton intent="accent2" size="small" :label="$t('settings.appearance.accent2Label')" />
            <UiTag intent="accent2" :value="$t('settings.appearance.accent2Label')" />
          </div>
        </div>

        <!-- Functional colours -->
        <div class="card">
          <div class="card-title">{{ $t('settings.appearance.functionalColoursCardTitle') }}</div>
          <p class="t-muted" style="font-size:12px;margin:0 0 12px">{{ $t('settings.appearance.functionalColoursHint') }}</p>
          <div class="swatch-row" role="radiogroup" :aria-label="$t('settings.appearance.successLabel')">
            <span class="swatch-label">{{ $t('settings.appearance.successLabel') }}</span>
            <button v-for="p in FUNCTIONAL_PRESETS.success" :key="p.hue"
              role="radio" :aria-checked="ap.successHue === p.hue" :aria-label="p.name"
              class="accent-swatch" :class="{ active: ap.successHue === p.hue }"
              v-tooltip.bottom="p.name" :style="`background: oklch(0.6 0.13 ${p.hue})`"
              @click="setAp({ successHue: p.hue })">
              <Icon v-if="ap.successHue === p.hue" name="Check" :size="12" />
            </button>
            <UiNumber :min="0" :max="360" style="width:74px"
              :model-value="ap.successHue" @update:model-value="(v) => setAp({ successHue: clampHue(v) })" />
          </div>
          <div class="swatch-row" style="margin-top:8px" role="radiogroup" :aria-label="$t('settings.appearance.dangerLabel')">
            <span class="swatch-label">{{ $t('settings.appearance.dangerLabel') }}</span>
            <button v-for="p in FUNCTIONAL_PRESETS.danger" :key="p.hue"
              role="radio" :aria-checked="ap.dangerHue === p.hue" :aria-label="p.name"
              class="accent-swatch" :class="{ active: ap.dangerHue === p.hue }"
              v-tooltip.bottom="p.name" :style="`background: oklch(0.62 0.17 ${p.hue})`"
              @click="setAp({ dangerHue: p.hue })">
              <Icon v-if="ap.dangerHue === p.hue" name="Check" :size="12" />
            </button>
            <UiNumber :min="0" :max="360" style="width:74px"
              :model-value="ap.dangerHue" @update:model-value="(v) => setAp({ dangerHue: clampHue(v) })" />
          </div>
          <div class="swatch-row" style="margin-top:8px" role="radiogroup" :aria-label="$t('settings.appearance.infoLabel')">
            <span class="swatch-label">{{ $t('settings.appearance.infoLabel') }}</span>
            <button v-for="p in FUNCTIONAL_PRESETS.info" :key="p.hue"
              role="radio" :aria-checked="ap.infoHue === p.hue" :aria-label="p.name"
              class="accent-swatch" :class="{ active: ap.infoHue === p.hue }"
              v-tooltip.bottom="p.name" :style="`background: oklch(0.55 0.1 ${p.hue})`"
              @click="setAp({ infoHue: p.hue })">
              <Icon v-if="ap.infoHue === p.hue" name="Check" :size="12" />
            </button>
            <UiNumber :min="0" :max="360" style="width:74px"
              :model-value="ap.infoHue" @update:model-value="(v) => setAp({ infoHue: clampHue(v) })" />
          </div>
          <!-- Live preview — buttons and tags re-skin from the hues above (banners + status chips use the same shades). -->
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:16px;padding-top:14px;border-top:1px solid var(--border-soft)">
            <UiButton intent="success" size="small" :label="$t('settings.appearance.successLabel')" />
            <UiButton intent="danger" size="small" :label="$t('settings.appearance.dangerLabel')" />
            <UiButton intent="info" size="small" :label="$t('settings.appearance.infoLabel')" />
            <span style="width:8px" />
            <UiTag intent="success" :value="$t('settings.appearance.tagDone')" />
            <UiTag intent="danger" :value="$t('settings.appearance.tagError')" />
            <UiTag intent="info" :value="$t('settings.appearance.tagNote')" />
          </div>
        </div>

        <!-- Buttons — every intent the app uses, one of each. -->
        <div class="card">
          <div class="card-title">{{ $t('settings.appearance.buttonIntentsCardTitle') }}</div>
          <i18n-t keypath="settings.appearance.buttonIntentsHint" tag="p" class="t-muted" style="font-size:12px;margin:0 0 12px" scope="global">
            <template #intent><b>{{ $t("settings.appearance.buttonIntentsTerms.intent") }}</b></template>
            <template #primary><b>{{ $t("settings.appearance.intentPrimary") }}</b></template>
            <template #secondary><b>{{ $t("settings.appearance.intentSecondary") }}</b></template>
            <template #ghost><b>{{ $t("settings.appearance.intentGhost") }}</b></template>
            <!-- one <b> in the original spanned all three, so it stays one slot -->
            <template #functional><b>{{ $t("settings.appearance.dangerLabel") }} / {{ $t("settings.appearance.successLabel") }} / {{ $t("settings.appearance.infoLabel") }}</b></template>
            <template #accent2><b>{{ $t("settings.appearance.accent2Label") }}</b></template>
          </i18n-t>
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
            <UiButton intent="primary"   size="small" :label="$t('settings.appearance.intentPrimary')" />
            <UiButton intent="secondary" size="small" :label="$t('settings.appearance.intentSecondary')" />
            <UiButton intent="ghost"     size="small" :label="$t('settings.appearance.intentGhost')" />
            <UiButton intent="success"   size="small" :label="$t('settings.appearance.successLabel')" />
            <UiButton intent="danger"    size="small" :label="$t('settings.appearance.dangerLabel')" />
            <UiButton intent="info"      size="small" :label="$t('settings.appearance.infoLabel')" />
            <UiButton intent="accent2"   size="small" :label="$t('settings.appearance.accent2Label')" />
          </div>
        </div>

        <!-- Backgrounds -->
        <div class="card">
          <div class="card-title">{{ $t('settings.appearance.backgroundsCardTitle') }}</div>
          <i18n-t keypath="settings.appearance.backgroundsHint" tag="p" class="t-muted" style="font-size:12px;margin:0 0 12px" scope="global">
            <template #custom><b>{{ $t("settings.appearance.backgroundsTerms.custom") }}</b></template>
            <template #text><b>{{ $t("settings.appearance.bgTextColourLabel") }}</b></template>
          </i18n-t>
          <div class="swatch-row" role="radiogroup" :aria-label="$t('settings.appearance.bgAppLabel')">
            <span class="swatch-label">{{ $t('settings.appearance.bgAppLabel') }}</span>
            <button v-for="t in SURFACE_TINT_LIST" :key="t.key"
              role="radio" :aria-checked="ap.appBg === t.key" :aria-label="t.label"
              class="tint-swatch" :class="{ active: ap.appBg === t.key }"
              :title="t.label" :style="{ background: tintColor(t) }"
              @click="setAp({ appBg: t.key })">
              <Icon v-if="ap.appBg === t.key" name="Check" :size="12" />
            </button>
            <label class="tint-swatch tint-custom" :class="{ active: isCustomHex(ap.appBg) }" :title="$t('settings.appearance.bgCustomColour')">
              <input type="color" :value="isCustomHex(ap.appBg) ? ap.appBg : '#dcd6c4'"
                @input="setAp({ appBg: $event.target.value })" />
              <Icon v-if="isCustomHex(ap.appBg)" name="Check" :size="12" />
            </label>
          </div>
          <div class="swatch-row" style="margin-top:8px" role="radiogroup" :aria-label="$t('settings.appearance.bgSidebarLabel')">
            <span class="swatch-label">{{ $t('settings.appearance.bgSidebarLabel') }}</span>
            <button v-for="t in SURFACE_TINT_LIST" :key="t.key"
              role="radio" :aria-checked="ap.sidebarBg === t.key" :aria-label="t.label"
              class="tint-swatch" :class="{ active: ap.sidebarBg === t.key }"
              :title="t.label" :style="{ background: tintColor(t) }"
              @click="setAp({ sidebarBg: t.key })">
              <Icon v-if="ap.sidebarBg === t.key" name="Check" :size="12" />
            </button>
            <label class="tint-swatch tint-custom" :class="{ active: isCustomHex(ap.sidebarBg) }" :title="$t('settings.appearance.bgCustomColour')">
              <input type="color" :value="isCustomHex(ap.sidebarBg) ? ap.sidebarBg : '#dcd6c4'"
                @input="setAp({ sidebarBg: $event.target.value })" />
              <Icon v-if="isCustomHex(ap.sidebarBg)" name="Check" :size="12" />
            </label>
          </div>
          <div class="swatch-row" style="margin-top:8px" role="radiogroup" :aria-label="$t('settings.appearance.bgEditorPaperLabel')">
            <span class="swatch-label">{{ $t('settings.appearance.bgEditorPaperLabel') }}</span>
            <button v-for="t in PAPER_TINT_LIST" :key="t.key"
              role="radio" :aria-checked="ap.editorPaper === t.key" :aria-label="t.label"
              class="tint-swatch" :class="{ active: ap.editorPaper === t.key }"
              :title="t.label" :style="{ background: tintColor(t) }"
              @click="setAp({ editorPaper: t.key })">
              <Icon v-if="ap.editorPaper === t.key" name="Check" :size="12" />
            </button>
            <label class="tint-swatch tint-custom" :class="{ active: isCustomHex(ap.editorPaper) }" :title="$t('settings.appearance.bgCustomColour')">
              <input type="color" :value="isCustomHex(ap.editorPaper) ? ap.editorPaper : '#f4ecd8'"
                @input="setAp({ editorPaper: $event.target.value })" />
              <Icon v-if="isCustomHex(ap.editorPaper)" name="Check" :size="12" />
            </label>
          </div>
          <div class="swatch-row" style="margin-top:14px" role="radiogroup" :aria-label="$t('settings.appearance.bgTextColourLabel')">
            <span class="swatch-label">{{ $t('settings.appearance.bgTextColourLabel') }}</span>
            <button v-for="t in INK_PALETTE_LIST" :key="t.key"
              role="radio" :aria-checked="ap.inkPalette === t.key" :aria-label="t.label"
              class="tint-swatch" :class="{ active: ap.inkPalette === t.key }"
              :title="t.label" :style="{ background: inkSwatch(t) }"
              @click="setAp({ inkPalette: t.key })">
              <Icon v-if="ap.inkPalette === t.key" name="Check" :size="12" style="color:#fff" />
            </button>
          </div>
          <div class="inline-paper-row">
            <label>
              <UiCheckbox :model-value="ap.inlinePaper"
                @update:model-value="(v) => setAp({ inlinePaper: v })" />
              <span>{{ $t('settings.appearance.inlinePaperLabel') }}</span>
            </label>
            <p class="t-muted" style="font-size:11px;margin:4px 0 0;padding-left:22px">{{ $t('settings.appearance.inlinePaperHint') }}</p>
          </div>
        </div>

        <!-- Editor layout -->
        <div class="card">
          <div class="card-title">{{ $t('settings.appearance.editorLayoutCardTitle') }}</div>
          <p class="t-muted" style="font-size:12px;margin:0 0 12px">{{ $t('settings.appearance.editorLayoutHint') }}</p>
          <div class="seg2" role="radiogroup" :aria-label="$t('settings.appearance.editorLayoutCardTitle')">
            <button role="radio" :aria-checked="ap.editorLayout === 'full'" :class="{ active: ap.editorLayout === 'full' }" @click="setAp({ editorLayout: 'full' })">
              <b>{{ $t('settings.appearance.editorLayoutFullWidth') }}</b><span>{{ $t('settings.appearance.editorLayoutFullWidthHint') }}</span>
            </button>
            <button role="radio" :aria-checked="ap.editorLayout === 'page'" :class="{ active: ap.editorLayout === 'page' }" @click="setAp({ editorLayout: 'page' })">
              <b>{{ $t('settings.appearance.editorLayoutPage') }}</b><span>{{ $t('settings.appearance.editorLayoutPageHint') }}</span>
            </button>
          </div>
          <i18n-t keypath="settings.appearance.editorLayoutOverrideNote" tag="p" class="t-muted" style="font-size:11px;margin:12px 0 0" scope="global">
            <template #theme><em>{{ $t("settings.appearance.editorLayoutOverrideTerms.theme") }}</em></template>
          </i18n-t>
        </div>

        <!-- Editor writing -->
        <div class="card">
          <div class="card-title">{{ $t('settings.appearance.editorWritingCardTitle') }}</div>
          <p class="t-muted" style="font-size:12px;margin:0 0 12px">{{ $t('settings.appearance.editorWritingHint') }}</p>
          <div class="size-row">
            <span class="field-l">{{ $t('settings.appearance.editorFontSizeLabel') }}</span>
            <UiSegmented
              class="size-seg" variant="connected"
              :model-value="ap.editorFontSize"
              :options="FONT_SIZE_OPTIONS"
              :aria-label="$t('settings.appearance.editorFontSizeLabel')"
              @update:model-value="setAp({ editorFontSize: $event })" />
          </div>
          <div class="size-row">
            <span class="field-l">{{ $t('settings.appearance.editorLineSpacingLabel') }}</span>
            <UiSegmented
              class="size-seg" variant="connected"
              :model-value="ap.editorLineSpacing"
              :options="LINE_OPTIONS"
              :aria-label="$t('settings.appearance.editorLineSpacingLabel')"
              @update:model-value="setAp({ editorLineSpacing: $event })" />
          </div>
          <div class="size-row">
            <span class="field-l">{{ $t('settings.appearance.editorParaSpacingLabel') }}</span>
            <UiSegmented
              class="size-seg" variant="connected"
              :model-value="ap.editorParaSpacing"
              :options="PARA_OPTIONS"
              :aria-label="$t('settings.appearance.editorParaSpacingLabel')"
              @update:model-value="setAp({ editorParaSpacing: $event })" />
          </div>
          <div class="size-row">
            <span class="field-l">{{ $t('settings.appearance.editorParaIndentLabel') }}</span>
            <UiSegmented
              class="size-seg" variant="connected"
              :model-value="ap.editorParaIndent"
              :options="INDENT_OPTIONS"
              :aria-label="$t('settings.appearance.editorParaIndentLabel')"
              @update:model-value="setAp({ editorParaIndent: $event })" />
          </div>
        </div>

        <!-- ── Buttons (radius / density / label casing) ───────── -->
        <div class="card">
          <div class="card-title">{{ $t('settings.appearance.buttonStylingCardTitle') }}</div>
          <p class="t-muted" style="font-size:12px;margin:0 0 12px">{{ $t('settings.appearance.buttonStylingHint') }}</p>
          <div class="size-row">
            <span class="field-l">{{ $t('settings.appearance.btnCornerRadiusLabel') }}</span>
            <UiSegmented
              class="size-seg" variant="connected"
              :model-value="ap.btnRadius"
              :options="BUTTON_RADIUS_OPTIONS"
              :aria-label="$t('settings.appearance.btnCornerRadiusLabel')"
              @update:model-value="setAp({ btnRadius: $event })" />
          </div>
          <div class="size-row">
            <span class="field-l">{{ $t('settings.appearance.btnDensityLabel') }}</span>
            <UiSegmented
              class="size-seg" variant="connected"
              :model-value="ap.btnDensity"
              :options="BUTTON_DENSITY_OPTIONS"
              :aria-label="$t('settings.appearance.btnDensityLabel')"
              @update:model-value="setAp({ btnDensity: $event })" />
          </div>
          <div class="size-row">
            <span class="field-l">{{ $t('settings.appearance.btnLabelCasingLabel') }}</span>
            <UiSegmented
              class="size-seg" variant="connected"
              :model-value="ap.btnLabelCase"
              :options="BUTTON_LABEL_CASE_OPTIONS"
              :aria-label="$t('settings.appearance.btnLabelCasingLabel')"
              @update:model-value="setAp({ btnLabelCase: $event })" />
          </div>
          <div style="display:flex;gap:10px;align-items:center;margin-top:14px;padding-top:14px;border-top:1px solid var(--border-soft)">
            <span class="t-muted" style="font-size:11.5px;font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.08em">{{ $t('settings.appearance.previewLabel') }}</span>
            <UiButton intent="primary" :label="$t('common.save')" />
            <UiButton intent="secondary" :label="$t('common.cancel')" />
            <UiButton intent="ghost" :label="$t('common.skip')" />
            <UiButton intent="danger" :label="$t('common.delete')" />
          </div>
        </div>

      </div>

      <!-- ── STORAGE (the portable data root — one folder for ALL app data) ─── -->
      <div v-else-if="active === 'storage'" style="display:flex;flex-direction:column;gap:14px">
        <div class="card">
          <div class="card-title">{{ $t('settings.storage.dataLocationTitle') }}</div>
          <p class="t-muted" style="font-size:12.5px;margin:4px 0 10px;line-height:1.5">
            {{ $t('settings.storage.dataLocationHint') }}
          </p>
          <div style="display:grid;grid-template-columns:140px 1fr;gap:8px 14px;font-size:13px;align-items:center">
            <span class="t-muted">{{ $t('settings.storage.folderLabel') }}</span>
            <code style="word-break:break-all">{{ (storageRoot && storageRoot.root) || dataDir || "—" }}</code>
            <template v-if="storageRoot">
              <span class="t-muted">{{ $t('settings.storage.typeLabel') }}</span>
              <span>{{ storageRoot.portable ? $t('settings.storage.typePortable') : $t('settings.storage.typeUser') }}</span>
            </template>
          </div>
          <div v-if="storageRoot" style="margin-top:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <UiButton intent="secondary" size="small" :loading="relocating" @click="changeFolder">{{ $t('settings.storage.changeFolder') }}</UiButton>
            <span v-if="relocating" class="t-muted" style="font-size:12.5px">{{ $t('settings.storage.moving') }}</span>
          </div>
          <p v-else class="t-muted" style="font-size:12px;margin:10px 0 0">{{ $t('settings.storage.desktopOnly') }}</p>
          <p v-if="storageErr" style="font-size:12.5px;color:var(--danger,#b91c1c);margin:8px 0 0">{{ storageErr }}</p>
        </div>

        <!-- Disk usage — where the data folder's space goes + the reclaim actions
             (sizes from GET /v1/disk/usage; deletes via the runner endpoints). -->
        <div class="card">
          <div class="card-title">{{ $t('settings.storage.diskUsageTitle') }}</div>
          <p class="t-muted" style="font-size:12.5px;margin:4px 0 10px;line-height:1.5">
            {{ $t('settings.storage.diskUsageHint') }}
          </p>
          <div style="display:grid;grid-template-columns:140px 1fr;gap:10px 14px;font-size:13px;align-items:center">
            <span class="t-muted">{{ $t('settings.storage.modelsCacheLabel') }}</span>
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              <span>{{ diskSize(diskUsage?.modelsCache) }}</span>
              <UiButton intent="secondary" size="small" :loading="diskBusy === 'models'" :disabled="!!diskBusy" @click="clearModelsCache">{{ $t('settings.storage.clearShort') }}</UiButton>
            </div>

            <span class="t-muted">{{ $t('settings.storage.engineBuildsLabel') }}</span>
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              <span>{{ diskSize(diskUsage?.engineBuilds) }}</span>
              <span class="t-muted" style="font-size:12px">{{ $t('settings.storage.managedOnAiPage') }}</span>
            </div>

            <span class="t-muted">{{ $t('settings.storage.serverLogsLabel') }}</span>
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              <span>{{ diskSize(diskUsage?.appLogs) }}</span>
              <span class="t-muted" style="font-size:12px">{{ $t('settings.storage.managedInLogs') }}</span>
            </div>

            <span class="t-muted">{{ $t('settings.storage.spawnLogsLabel') }}</span>
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              <span>{{ diskSize(diskUsage?.spawnLogs) }}</span>
              <UiButton intent="secondary" size="small" :loading="diskBusy === 'spawn'" :disabled="!!diskBusy" @click="clearSpawnLogs">{{ $t('settings.storage.clearShort') }}</UiButton>
            </div>

            <span class="t-muted">{{ $t('settings.storage.databaseLabel') }}</span>
            <span>{{ diskSize(diskUsage?.database) }}</span>

            <!-- The Total row — docgen's invention, canon BOTH apps render (ruling R2). -->
            <span class="t-muted">{{ $t('settings.storage.totalLabel') }}</span>
            <span>{{ diskSize(diskUsage?.total) }}</span>

            <span class="t-muted">{{ $t('settings.storage.freeSpaceLabel') }}</span>
            <span>{{ diskSize(diskUsage?.diskFree) }}</span>
          </div>
          <p v-if="diskErr" style="font-size:12.5px;color:var(--danger,#b91c1c);margin:10px 0 0">{{ diskErr }}</p>
        </div>
      </div>

      <!-- ── SERVER (headless + API access) ─────────── -->
      <div v-else-if="active === 'general'" style="display:flex;flex-direction:column;gap:14px">
        <div class="card">
          <div class="card-title">{{ $t('settings.server.headlessTitle') }}</div>
          <p class="t-muted">{{ $t('settings.server.headlessHint') }}</p>
          <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
            <code style="flex:1;min-width:0;padding:8px 10px;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ headlessUrl }}</code>
            <UiButton intent="secondary" size="small" @click="copyHeadlessUrl">{{ $t('settings.server.copy') }}</UiButton>
          </div>
          <!-- The family headless/tray ruling (2026-08-04, JV's donor): OFF ⇒
               closing the window stops everything; ON ⇒ hide to tray, server stays. -->
          <label style="display:flex;align-items:center;gap:10px;margin:12px 0 0">
            <UiToggle :model-value="ui.keepServerRunning" @update:model-value="setKeepRunning" />
            <span>{{ $t('settings.server.keepRunning') }}</span>
          </label>
          <p class="t-muted" style="font-size:12.5px;margin:4px 0 0">{{ $t('settings.server.keepRunningHint') }}</p>
        </div>

        <div class="card">
          <div class="card-title">{{ $t('settings.server.authTitle') }}</div>
          <p class="t-muted">{{ $t('settings.server.authHint') }}</p>
          <label style="display:flex;align-items:center;gap:10px;margin:10px 0">
            <UiToggle :model-value="requireLoopbackAuth" @update:model-value="setRequireLoopbackAuth" />
            <span>{{ $t('settings.server.requireLoopback') }}</span>
          </label>
          <div v-if="authTokens.length" style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">
            <div v-for="tok in authTokens" :key="tok" style="display:flex;align-items:center;gap:8px">
              <code style="flex:1;min-width:0;padding:6px 10px;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ tok }}</code>
              <UiButton intent="ghost" size="small" :title="$t('settings.server.removeToken')" @click="removeToken(tok)"><Icon name="Close" :size="12" /></UiButton>
            </div>
          </div>
          <p v-else class="t-muted"><em>{{ $t('settings.server.noTokens') }}</em></p>
          <div style="display:flex;align-items:center;gap:8px">
            <UiInput v-model="newToken" :placeholder="$t('settings.server.tokenPlaceholder')" style="flex:1" @keydown.enter="addToken" />
            <UiButton intent="secondary" size="small" @click="generateToken">{{ $t('settings.server.generate') }}</UiButton>
            <UiButton intent="primary" size="small" :disabled="!newToken.trim()" @click="addToken">{{ $t('settings.server.addToken') }}</UiButton>
          </div>
        </div>
      </div>

      <!-- ── BACKUPS ───────────────────────────────── -->
      <div v-else-if="active === 'backups'" style="display:flex;flex-direction:column;gap:14px">
        <div v-if="autosaveDir" class="card">
          <div class="card-title">{{ $t('settings.backups.autosaveCardTitle') }}</div>
          <i18n-t keypath="settings.backups.autosaveHint" tag="p" class="t-muted" style="font-size:12.5px;margin:0 0 12px;line-height:1.55" scope="global">
            <!-- on-disk filenames — data, never translated -->
            <template #prev><code>.prev.json</code></template>
            <template #prev2><code>.prev2.json</code></template>
          </i18n-t>
          <div style="display:grid;grid-template-columns:140px 1fr;gap:10px 14px;font-size:13px;align-items:center;margin-bottom:12px">
            <span class="t-muted">{{ $t('settings.storage.folderLabel') }}</span>
            <code style="word-break:break-all">{{ autosaveDir }}</code>
            <span class="t-muted">{{ $t('settings.backups.lastAutosaveLabel') }}</span>
            <span>{{ lastAutosaveLabel }}</span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <UiButton :label="autosaveListShown ? $t('settings.backups.hideAutosaves') : $t('settings.backups.showAutosaves')" intent="primary" :disabled="autosaveListBusy" @click="toggleAutosaveList">
              <template #icon><Icon name="Folder" :size="13" /></template>
            </UiButton>
            <UiButton v-if="canPickAutosaveFolder" :label="$t('settings.storage.changeFolder')" intent="secondary" :disabled="autosaveDirBusy" @click="changeAutosaveFolder" />
          </div>
          <div v-if="backupError" class="banner danger" style="margin-top:10px">{{ backupError }}</div>
          <div v-if="autosaveListShown" style="margin-top:12px">
            <div v-if="autosaveListBusy" class="t-muted" style="font-size:12.5px">{{ $t('common.loading') }}</div>
            <div v-else-if="!autosaveList.length" class="t-muted" style="font-size:12.5px">
              {{ $t('settings.backups.emptyList') }}
            </div>
            <ul v-else style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:6px">
              <li
                v-for="entry in autosaveList"
                :key="entry.key"
                style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border, #ddd);border-radius:6px;font-size:13px"
              >
                <UiCheckbox
                  :model-value="!!autosaveSelected[entry.key]"
                  @update:model-value="(v) => (autosaveSelected[entry.key] = v)"
                />
                <div style="flex:1;min-width:0">
                  <div><b>{{ entry.title || $t('sidebar.projectSwitcher.untitled') }}</b> <span class="t-muted">— {{ generationLabel(entry.generation) }}</span></div>
                  <div class="t-muted" style="font-size:12px">{{ autosaveLabel(entry.savedAt) }}</div>
                </div>
                <UiButton :label="$t('common.restore')" intent="primary" @click="restoreFromAutosave(entry)" />
              </li>
            </ul>
            <div v-if="autosaveList.length && !autosaveListBusy" style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
              <UiButton :label="$t('settings.backups.deleteSelectedButton')" intent="danger" size="small" :disabled="!selectedAutosaveKeys.length" @click="removeSelectedAutosaves" />
              <UiButton :label="$t('settings.backups.deleteAllConfirm')" intent="danger" size="small" @click="removeAllAutosaves" />
            </div>
          </div>
        </div>

        <!-- Read-only pointer to the data folder (ALL app data), here only to give
             the autosave path above its context (autosave defaults to a subfolder of
             this root). The relocate control has ONE home now — Settings → Storage —
             so this deep-links there instead of duplicating the live chooser. -->
        <div v-if="storageRoot" class="card">
          <div class="card-title">{{ $t('settings.backups.dataFolderTitle') }}</div>
          <p style="font-size:13px;margin:0 0 8px;line-height:1.6">
            <code style="word-break:break-all">{{ storageRoot.root }}</code>
            <span class="t-muted" style="font-size:11px;margin-left:6px">{{ storageRoot.portable ? $t('settings.backups.portableSuffix') : $t('settings.backups.userFolderSuffix') }}</span>
          </p>
          <!-- The other shape i18n-t is for: a COMPONENT inside a sentence. This was the
               last "deliberate leftover" in the view — a paragraph left unconverted because
               splitting it around the button would have handed a translator two fragments.
               As one keypath with a {link} slot it is a single translatable sentence again,
               and the button can move within it in any language. -->
          <i18n-t keypath="settings.backups.dataFolderHint" tag="p" class="t-muted" style="font-size:12.5px;margin:0;line-height:1.5" scope="global">
            <template #link>
              <UiButton intent="ghost" size="small" style="vertical-align:baseline" @click="active = 'storage'">{{ $t("settings.backups.dataFolderLinkLabel") }}</UiButton>
            </template>
          </i18n-t>
        </div>

        <!-- Per-project export / import — a book travels as a single <title>.zip
             (book.json + images/ inside). Desktop-only (native save/open dialog);
             the browser shows a note. -->
        <div class="card">
          <div class="card-title">{{ $t('settings.backups.thisBookTitle') }}</div>
          <i18n-t keypath="settings.backups.thisBookHint" tag="p" class="t-muted" style="font-size:12.5px;margin:0 0 12px;line-height:1.55" scope="global">
            <template #export><strong>{{ $t("settings.backups.thisBookTerms.export") }}</strong></template>
            <template #import><strong>{{ $t("settings.backups.thisBookTerms.import") }}</strong></template>
            <!-- a file extension — data, never translated; the sentence names it twice -->
            <template #zip><code>.zip</code></template>
            <template #zip2><code>.zip</code></template>
          </i18n-t>
          <div v-if="transferErr" class="banner danger" style="margin-bottom:10px">{{ transferErr }}</div>
          <div v-if="canTransferBooks" style="display:flex;gap:10px;flex-wrap:wrap">
            <UiButton intent="primary" :disabled="!!transferBusy || !project._activeId" @click="exportThisProject()">
              <template #icon><Icon name="Download" :size="13" /></template>
              {{ transferBusy === 'export' ? $t('settings.backups.exporting') : $t('settings.backups.exportButton') }}
            </UiButton>
            <UiButton intent="secondary" :disabled="!!transferBusy" @click="importAProject()">
              <template #icon><Icon name="Folder" :size="13" /></template>
              {{ transferBusy === 'import' ? $t('settings.backups.importing') : $t('settings.backups.importButton') }}
            </UiButton>
          </div>
          <p v-else class="t-muted" style="font-size:12px;margin:0">{{ $t('settings.backups.desktopOnly') }}</p>
        </div>

        <!-- Backup / restore / reset — the shared full-DB module (same code +
             server endpoints in every same-stack app). The autosave card above
             is JustWrite's Tauri-specific on-disk restore, kept app-local. -->
        <DataManagement app-name="JustWrite" :save-file="canTransferBooks ? saveBackupBlob : null" />
      </div>

      <!-- ── LOGS (shared panel) ───────────────────── -->
      <div v-else-if="active === 'logs'" style="display:flex;flex-direction:column;gap:14px">
        <LogsPanel />
      </div>

      <!-- ── UPDATES (shared panel) ─────────────────── -->
      <div v-else-if="active === 'updates'" style="display:flex;flex-direction:column;gap:14px">
        <UpdatesPanel :app-version="APP_VERSION" :changelog-html="changelogHtml" />
      </div>

      <!-- ── ABOUT ─────────────────────────────────── -->
      <div v-else-if="active === 'about'" style="display:flex;flex-direction:column;gap:14px">
        <div class="card">
          <div class="card-title">{{ $t('settings.about.appCardTitle') }}</div>
          <p style="font-size:13px;margin:0 0 12px;line-height:1.6">
            {{ $t('settings.about.tagline') }}
          </p>
          <div style="display:grid;grid-template-columns:160px 1fr;gap:8px 14px;font-size:13px">
            <span class="t-muted">{{ $t('settings.about.runtimeLabel') }}</span><span>{{ platformLabel }}</span>
            <span class="t-muted">{{ $t('settings.about.rendererLabel') }}</span><span>{{ $t('settings.about.rendererValue') }}</span>
            <span class="t-muted">{{ $t('settings.about.imageStorageLabel') }}</span><span>{{ $t('settings.coverImage.storedServer') }}</span>
          </div>
        </div>

        <div class="card">
          <div class="card-title">{{ $t('settings.about.workspaceCardTitle') }}</div>
          <div class="settings-stats-grid" style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:14px">
            <div class="stat-tile">
              <div class="stat-num">{{ stats.chapters }}</div>
              <div class="stat-label">{{ $t('nav.chapters') }}</div>
            </div>
            <div class="stat-tile">
              <div class="stat-num">{{ stats.characters }}</div>
              <div class="stat-label">{{ $t('nav.characters') }}</div>
            </div>
            <div class="stat-tile">
              <div class="stat-num">{{ stats.locations }}</div>
              <div class="stat-label">{{ $t('nav.locations') }}</div>
            </div>
            <div class="stat-tile">
              <div class="stat-num">{{ stats.objects }}</div>
              <div class="stat-label">{{ $t('nav.objects') }}</div>
            </div>
            <div class="stat-tile">
              <div class="stat-num">{{ stats.worldbuilding }}</div>
              <div class="stat-label">{{ $t('nav.worldbuilding') }}</div>
            </div>
            <div class="stat-tile">
              <div class="stat-num">{{ stats.trashTotal }}</div>
              <div class="stat-label">{{ $t('settings.about.inTrashLabel') }}</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">{{ $t('settings.about.shortcutsCardTitle') }}</div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:8px 18px;font-size:12.5px">
            <kbd class="kbd-pill">⌘F</kbd><span>{{ $t('settings.about.shortcutFocusSearch') }}</span>
            <kbd class="kbd-pill">⌘\</kbd><span>{{ $t('sidebar.tooltips.toggleSidebar') }}</span>
            <kbd class="kbd-pill">⌘Z</kbd><span>{{ $t('settings.about.shortcutUndo') }}</span>
            <kbd class="kbd-pill">⌘⇧Z / ⌘Y</kbd><span>{{ $t('common.redo') }}</span>
          </div>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>

<style scoped>
.cover-frame {
  width: 100%;
  max-width: 140px;
  aspect-ratio: 2 / 3;
  border-radius: 6px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  display: grid; place-items: center;
  overflow: hidden;
  box-shadow: var(--shadow-2);
}
.cover-frame.empty {
  border-style: dashed;
  color: var(--muted);
}
.cover-frame img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
/* Theme tiles */
.theme-tile {
  appearance: none;
  display: grid;
  grid-template-columns: 56px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: 10px;
  text-align: left;
  cursor: default;
}
.theme-tile:hover { border-color: var(--border-strong); }
.theme-tile.active { border-color: var(--accent); background: var(--accent-soft); }
.theme-preview {
  width: 56px; height: 38px;
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  gap: 4px;
  border: 1px solid var(--border);
}
.theme-preview[data-mode="light"] { background: oklch(0.985 0.004 85); }
.theme-preview[data-mode="dark"]  { background: oklch(0.18 0.005 250); }
.theme-preview[data-mode="split"] {
  background: linear-gradient(90deg, oklch(0.985 0.004 85) 50%, oklch(0.18 0.005 250) 50%);
}
.theme-preview .dot { width: 8px; height: 8px; border-radius: 50%; }
.theme-preview[data-mode="light"] .dot-bg   { background: oklch(0.93 0.005 85); }
.theme-preview[data-mode="light"] .dot-surf { background: white; border: 1px solid oklch(0.86 0.006 85); }
.theme-preview[data-mode="light"] .dot-ink  { background: oklch(0.22 0.008 85); }
.theme-preview[data-mode="dark"]  .dot-bg   { background: oklch(0.26 0.006 250); }
.theme-preview[data-mode="dark"]  .dot-surf { background: oklch(0.36 0.007 250); }
.theme-preview[data-mode="dark"]  .dot-ink  { background: oklch(0.85 0.005 85); }
.theme-preview[data-mode="split"] .dot-bg   { background: oklch(0.86 0.006 85); }
.theme-preview[data-mode="split"] .dot-surf { background: white; }
.theme-preview[data-mode="split"] .dot-ink  { background: oklch(0.85 0.005 85); }

/* Accent swatches */
.accent-swatch {
  width: 28px; height: 28px;
  border-radius: 50%;
  border: 2px solid var(--border);
  display: grid; place-items: center;
  color: var(--on-accent);
  padding: 0;
}
.accent-swatch.active { border-color: var(--ink); transform: scale(1.08); }
.accent-swatch:hover { border-color: var(--border-strong); }

/* Preset tiles */
.preset-tile {
  position: relative;
  appearance: none; text-align: left; cursor: pointer;
  display: flex; flex-direction: column; gap: 3px;
  padding: 12px 14px; border-radius: 10px;
  border: 1px solid var(--border); background: var(--surface);
}
.preset-tile b { font-size: 13px; }
.preset-tile span { font-size: 11px; line-height: 1.4; }
.preset-tile:hover { border-color: var(--border-strong); }
.preset-tile.active { border-color: var(--accent); background: var(--accent-soft); }
.preset-tile.active b { color: var(--accent-ink); }
.preset-tile .preset-check { position: absolute; top: 10px; right: 10px; color: var(--accent); }
.preset-tile.is-saved { cursor: pointer; }
.preset-actions { position: absolute; top: 8px; right: 8px; display: flex; gap: 4px; opacity: 0; transition: opacity .1s ease; }
.preset-tile.is-saved:hover .preset-actions,
.preset-tile.is-saved:focus-within .preset-actions { opacity: 1; }
.preset-act {
  width: 22px; height: 22px; padding: 0; border-radius: 6px;
  display: grid; place-items: center; cursor: pointer;
  color: var(--muted); background: var(--surface-2); border: 1px solid var(--border);
}
.preset-act:hover { color: var(--ink); background: var(--surface-3); }
.preset-act.danger:hover { color: var(--danger, #c0392b); }
.preset-tile.is-save { cursor: pointer; border-style: dashed; gap: 4px; color: var(--muted); }
.preset-tile.is-save b { color: var(--ink); }
.preset-tile.is-save:hover { border-color: var(--accent); color: var(--accent-ink); }

.inline-paper-row { margin-top: 16px; }
.inline-paper-row label {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 12.5px; cursor: pointer; color: var(--ink);
}

/* Custom-colour swatch — a small rainbow-conic affordance with a hidden
   native color input overlaid; clicking the swatch opens the picker. */
.tint-swatch.tint-custom {
  position: relative; overflow: hidden;
  background: conic-gradient(from 180deg, #e15454, #d6a32f, #6fb45d, #4f9ec9, #8a6acd, #d166a3, #e15454);
}
.tint-swatch.tint-custom input[type="color"] {
  position: absolute; inset: 0; width: 100%; height: 100%;
  border: 0; padding: 0; opacity: 0; cursor: pointer;
}
.tint-swatch.tint-custom :deep(svg) { color: #fff; filter: drop-shadow(0 0 1px rgba(0,0,0,.5)); }

/* Sizing for connected segmented controls in Appearance rows. UiSegmented
   owns the visual variant via variant="connected"; these classes only size
   the control within the .size-row flex container. */
.size-row { display: flex; align-items: center; gap: 12px; margin-top: 14px; flex-wrap: wrap; }
.size-seg { flex: 1; min-width: 280px; }
.size-seg-narrow { min-width: 0; flex: 0 1 auto; }

/* Pairing tiles */
.pairing-tile {
  appearance: none; text-align: left; cursor: pointer;
  display: flex; align-items: center; gap: 11px;
  padding: 10px 12px; border-radius: 10px;
  border: 1px solid var(--border); background: var(--surface);
}
.pairing-tile:hover { border-color: var(--border-strong); }
.pairing-tile.active { border-color: var(--accent); background: var(--accent-soft); }
.pairing-sample {
  width: 38px; height: 38px; flex-shrink: 0;
  display: grid; place-items: center;
  font-size: 22px; line-height: 1; color: var(--ink);
  background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px;
}

/* Swatch rows */
.swatch-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.swatch-label {
  width: 86px; flex-shrink: 0;
  font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--muted);
}
.tint-swatch {
  width: 30px; height: 24px; padding: 0;
  border-radius: 6px; cursor: pointer;
  border: 1px solid var(--border-strong);
  display: grid; place-items: center; color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--shadow-soft);
}
.tint-swatch:hover { transform: scale(1.06); }
.tint-swatch.active { outline: 2px solid var(--accent); outline-offset: 1px; }

/* Font field selects */
.field { display: flex; flex-direction: column; gap: 5px; min-width: 180px; }
.field-l { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
.field-hint { font-size: 10.5px; color: var(--muted); line-height: 1.4; margin: 1px 0 0; }

/* Size-row hint — wraps to its own line beneath the segmented control. */
.size-hint {
  flex: 0 0 100%; margin: 4px 0 0; padding: 0;
  font-size: 10.5px; color: var(--muted); line-height: 1.4;
}
.size-hint em { font-style: italic; color: var(--ink-2); }

/* Editor-layout segmented control */
.seg2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.seg2 button {
  appearance: none; text-align: left; cursor: pointer;
  display: flex; flex-direction: column; gap: 3px;
  padding: 12px 14px; border-radius: 10px;
  border: 1px solid var(--border); background: var(--surface);
}
.seg2 button b { font-size: 13px; }
.seg2 button span { font-size: 11px; line-height: 1.4; color: var(--muted); }
.seg2 button:hover { border-color: var(--border-strong); }
.seg2 button.active { border-color: var(--accent); background: var(--accent-soft); }
.seg2 button.active b { color: var(--accent-ink); }

/* Live preview — reflects every appearance knob: backgrounds, fonts,
   ink palette, accent/gold, section-heading + menu-item style/size,
   and the editor layout (full vs paged with running head, drop cap,
   and a gold scene rule). */
.appear-preview {
  display: grid; grid-template-columns: 168px 1fr;
  border: 1px solid var(--border); border-radius: 12px; overflow: hidden;
  min-height: 220px; background: var(--app-bg);
}
.ap-side {
  background: var(--sidebar-bg); border-right: 1px solid var(--border);
  padding: 14px 12px; display: flex; flex-direction: column; gap: 2px;
}
.ap-brand { font-family: var(--font-serif); font-size: 15px; font-weight: 600; margin-bottom: 8px; }
.ap-section {
  font-family: var(--nav-section-font, var(--font-ui));
  font-size: var(--nav-section-size, 10px);
  font-weight: var(--nav-section-weight, 600);
  font-style: var(--nav-section-style, normal);
  text-transform: var(--nav-section-transform, uppercase);
  letter-spacing: var(--nav-section-letter-spacing, 0.08em);
  color: var(--muted);
  padding: 8px 6px 3px;
}
.ap-section:first-of-type { padding-top: 2px; }
.ap-nav {
  font-family: var(--nav-item-font, var(--font-ui));
  font-size: var(--nav-item-size, 12.5px);
  font-weight: var(--nav-item-weight, 400);
  font-style: var(--nav-item-style, normal);
  letter-spacing: var(--nav-item-letter-spacing, 0);
  color: var(--ink-2);
  padding: 3px 8px; border-radius: 5px;
}
.ap-nav.active {
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-weight: var(--nav-item-active-weight, 500);
}
.ap-main { background: var(--editor-paper); padding: 18px 20px; }
.appear-preview[data-layout="page"] .ap-main { background: var(--app-bg); padding: 12px; }
.appear-preview[data-layout="page"] .ap-page {
  background: var(--editor-paper);
  border: 1px solid var(--border);
  border-radius: 4px;
  box-shadow: 0 4px 12px -4px var(--shadow-medium);
  padding: 18px 22px 18px;
}
.ap-runninghead {
  text-align: center;
  font-family: var(--font-mono);
  font-size: 8px; letter-spacing: 0.28em;
  text-transform: uppercase; color: var(--subtle);
  margin: 0 0 14px;
}
.ap-eyebrow { font-family: var(--font-mono); font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); }
.appear-preview[data-layout="page"] .ap-eyebrow { text-align: center; }
.ap-h { font-family: var(--font-serif); font-size: 21px; font-weight: 600; margin: 4px 0 8px; }
.ap-h::after {
  /* Gold scene-rule under the chapter title — visible in both editor
     layouts so the gold hue is obvious here too. */
  content: ""; display: block;
  width: 44px; height: 3px;
  margin: 8px 0 12px;
  background: var(--gold);
  border-radius: 2px;
}
.appear-preview[data-layout="page"] .ap-h {
  text-align: center; font-weight: 400; font-style: italic;
}
.appear-preview[data-layout="page"] .ap-h::after { margin: 6px auto 12px; }

/* Gold scene-break ornament after the prose — second visible gold
   element so a hue change shows up clearly in both layouts. */
.ap-ornament {
  font-family: var(--font-serif);
  font-size: 14px; color: var(--gold);
  margin: 8px 0;
}
.appear-preview[data-layout="page"] .ap-ornament { text-align: center; }
.ap-prose {
  font-family: var(--editor-body-font, var(--font-serif));
  font-size: 14px;
  line-height: var(--editor-body-line-height, 1.6);
  color: var(--ink-2);
  margin: 0; max-width: 52ch;
  /* Preview shows indent on every paragraph (including the first) so the
     setting is unambiguous — the manuscript's "skip indent on the first
     paragraph of a chapter" convention is intentionally not mirrored here. */
  text-indent: var(--editor-body-para-indent, 0);
}
.ap-prose + .ap-prose { margin-top: var(--editor-body-para-spacing, 0); }
/* Drop cap intentionally not previewed — it's disabled in the editor
   by default. See tokens.css "Drop cap on the first paragraph". */
.ap-controls { display: flex; gap: 8px; margin-top: 12px; align-items: center; }

/* About → workspace stat tiles */
.stat-tile {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
}
.stat-num {
  font-family: var(--font-serif);
  font-size: 22px;
  font-weight: 600;
  color: var(--ink);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.stat-label {
  margin-top: 4px;
  font-size: 11px;
  color: var(--muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.kbd-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 5px;
  background: var(--surface-3);
  color: var(--ink-2);
  border: 1px solid var(--border);
  font-family: var(--font-mono);
  font-size: 11px;
  white-space: nowrap;
}

.danger-card { border-color: var(--danger-line); }

/* Debug section */
.debug-tools { display: flex; flex-direction: column; gap: 8px; }
.debug-tile {
  display: grid;
  grid-template-columns: 40px 1fr 16px;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  text-decoration: none;
  color: var(--ink);
}
.debug-tile:hover { border-color: var(--border-strong); background: var(--surface-2); }
.debug-tile-icon {
  width: 40px; height: 40px;
  border-radius: 8px;
  display: grid; place-items: center;
  background: var(--accent-soft);
  color: var(--accent-ink);
}
.debug-tile-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.debug-tile-body b { font-size: 13.5px; }
.debug-tile-body .t-muted { font-size: 11.5px; line-height: 1.45; }
.debug-tile-route {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 10.5px;
  color: var(--muted);
  margin-top: 2px;
  align-self: flex-start;
  padding: 1px 6px;
  background: var(--surface-3);
  border-radius: 4px;
}

/* ── AI usage panel ─────────────────────────────────────────────── */
.pill-row { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
.usage-section { margin-top: 18px; }
.usage-section-h {
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--muted); font-weight: 600;
  margin-bottom: 8px;
}
.usage-dt { font-size: 12px; font-variant-numeric: tabular-nums; }

/* Settings = horizontal tab strip on top + full-width content (matches JV). */
.settings-layout { display: flex; flex-direction: column; gap: 18px; }
.set-tabs { display: flex; flex-wrap: wrap; gap: 2px; border-bottom: 1px solid var(--border); }
.set-tab { appearance: none; background: none; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; padding: 10px 16px; font: inherit; font-size: 13px; font-weight: 600; color: var(--ink-2); cursor: pointer; }
.set-tab:hover { color: var(--ink); }
.set-tab.on { color: var(--ink); border-bottom-color: var(--accent); }

@media (max-width: 900px) {
  /* Mode tiles (3 cols) → 2 cols */
  .settings-mode-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
  /* About stats (3 cols) → 2 cols */
  .settings-stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
  /* AI quick-tips (2 cols) → 1 col */
  .settings-tips-grid { grid-template-columns: 1fr !important; }
  /* Provider row (auto 1fr auto auto auto) → allow wrap */
  .provider-row { grid-template-columns: auto 1fr !important; }
  .provider-row .provider-actions { grid-column: 1 / -1; display: flex; gap: 8px; justify-content: flex-end; }
}

.set-desc {
  font-size: 14px; line-height: 1.55; color: var(--muted);
  margin: 0 0 18px;
}
.set-desc strong { color: var(--ink-2); font-weight: 600; }
</style>
