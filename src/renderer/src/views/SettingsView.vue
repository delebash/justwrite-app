<script setup>
import { ref, computed, watchEffect } from "vue";
import { useAiStore } from "../stores/ai.js";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { saveImage, urlFor, hasNativeImages } from "../services/imageStore.js";
import { promptDialog, confirmDialog } from "../services/dialog.js";
import { getItem, setItem, clearPrefix, flushPending } from "../services/storage.js";
import PaneHeader from "../components/PaneHeader.vue";
import Icon from "../components/Icon.vue";
import SettingsProviderForm from "./SettingsProviderForm.vue";
import StatPill from "../components/StatPill.vue";
import Combobox from "../components/Combobox.vue";
import InputText from "primevue/inputtext";
import InputNumber from "primevue/inputnumber";
import Checkbox from "primevue/checkbox";
import Select from "primevue/select";
import Textarea from "primevue/textarea";
import Button from "primevue/button";
import {
  ACCENT_PRESETS, GOLD_PRESETS, PAIRINGS, SURFACE_TINTS, PAPER_TINTS,
  THEME_PRESETS, UI_FONTS, DISPLAY_FONTS, INK_PALETTES, UI_SCALES,
  SIDEBAR_HEADING_STYLES, SIDEBAR_HEADING_SIZES,
  NAV_ITEM_STYLES, NAV_ITEM_SIZES,
} from "../services/appearance.js";

import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Tag from "primevue/tag";
import { FilterMatchMode } from "@primevue/core/api";

const props = defineProps({ section: { type: String, default: "" } });

const ai = useAiStore();
const project = useProjectStore();
const ui = useUiStore();

const SECTIONS = [
  { id: "project",    label: "Project" },
  { id: "audio",      label: "AI & Audio engines" },
  { id: "usage",      label: "AI usage" },
  { id: "appearance", label: "Appearance" },
  { id: "backups",    label: "Backups" },
  { id: "debug",      label: "Debug" },
  { id: "about",      label: "About" },
];

// Debug tools surfaced in the Debug section. Add new entries here as more
// internal lab/inspector views are built.
const DEBUG_TOOLS = [
  {
    id: "speaker-lab",
    name: "Speaker Lab",
    description: "Test entity extraction & quote attribution against any OpenAI-compatible LLM. Side-by-side runs, two-stage pipelines, live streaming, prompt editing, saved presets.",
    route: "/debug/speaker-lab",
    icon: "Sparkle",
  },
  {
    id: "writer-lab",
    name: "Writer Lab — model compare",
    description: "Test writerAI actions, prose passes, and analysis pipelines against any OpenAI-compatible LLM. Up to 4 columns running in parallel for side-by-side model comparison. Same base controls as the user-facing Writer Lab.",
    route: "/debug/writer-lab",
    icon: "Sparkle",
  },
];

const active = ref(props.section || "project");

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
    coverError.value = "That doesn't look like an image file.";
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
    title: "Remove the book cover image?",
    confirmLabel: "Remove cover",
    danger: true,
  });
  if (!yes) return;
  project.clearCoverImage();
}

const editing = ref(null);   // id of provider being edited (or "new")
const draft = ref(null);     // working copy

function startEdit(provider) {
  editing.value = provider.id;
  draft.value = { ...provider, params: { ...(provider.params || {}) } };
}

function startNew() {
  editing.value = "new";
  draft.value = {
    id: "",
    name: "",
    kind: "llm",
    baseUrl: "",
    apiKey: "",
    chatModel: "",
    ttsModel: "",
    ttsVoices: [],
    params: {},
  };
}

function saveDraft() {
  if (!draft.value.id || !draft.value.name || !draft.value.baseUrl) return;
  // Prune empty / undefined params so we don't ship junk to the engine.
  const params = {};
  for (const [k, v] of Object.entries(draft.value.params || {})) {
    if (v === undefined || v === null || v === "") continue;
    params[k] = v;
  }
  const patch = { ...draft.value, params };
  if (editing.value === "new") {
    ai.addProvider(patch);
  } else {
    ai.updateProvider(editing.value, patch);
  }
  editing.value = null;
  draft.value = null;
}

function cancelEdit() { editing.value = null; draft.value = null; }

async function pingProvider(id) {
  await ai.ping(id);
}

const statusColor = (s) => ({
  ok: "var(--success)",
  down: "var(--danger)",
  checking: "var(--status-draft)",
})[s] || "var(--border-strong)";

const statusLabel = (s) => ({
  ok: "Online", down: "Offline", checking: "Checking…",
})[s] || "Not checked";

// ── Appearance ─────────────────────────────────────────────────────
// Curated tables (presets, pairings, tints, ACCENT/GOLD_PRESETS) are
// imported from services/appearance.js so Settings offers exactly what the
// apply step understands. `ap` is the live appearance config.
const ap = computed(() => ui.appearance);
const THEMES = [
  { id: "system", label: "Match system", hint: "Follow your OS dark/light preference." },
  { id: "light",  label: "Light",        hint: "Bright surfaces, warm neutrals." },
  { id: "dark",   label: "Dark",         hint: "Deep slate surfaces for night writing." },
];
const SURFACE_TINT_LIST = Object.entries(SURFACE_TINTS).map(([key, t]) => ({ key, ...t }));
const PAPER_TINT_LIST = Object.entries(PAPER_TINTS).map(([key, t]) => ({ key, ...t }));
const INK_PALETTE_LIST = Object.entries(INK_PALETTES).map(([key, t]) => ({ key, ...t }));
const SIDEBAR_HEADING_STYLE_LIST = Object.entries(SIDEBAR_HEADING_STYLES).map(([key, t]) => ({ key, ...t }));
const NAV_ITEM_STYLE_LIST = Object.entries(NAV_ITEM_STYLES).map(([key, t]) => ({ key, ...t }));
const EDITOR_FONT_SIZES = [
  { value: "small",  label: "Small",  px: "15px" },
  { value: "medium", label: "Medium", px: "18px" },
  { value: "big",    label: "Big",    px: "21px" },
];
const EDITOR_LINE_OPTIONS = [1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2];
const EDITOR_PARA_OPTIONS = [0, 0.3, 0.5, 0.8, 1];

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
  const name = await promptDialog({ title: "Save preset", label: "Preset name", placeholder: "e.g. Night Study", confirmLabel: "Save preset" });
  if (!name) return;
  ui.saveCustomPreset(name);
}
async function renameCustomPreset(p) {
  const name = await promptDialog({ title: "Rename preset", label: "Preset name", defaultValue: p.name, confirmLabel: "Rename" });
  if (!name) return;
  ui.renameCustomPreset(p.id, name);
}
async function removeCustomPreset(p) {
  const yes = await confirmDialog({ title: `Delete "${p.name}"?`, message: "Removes this custom preset. Your current appearance stays as it is.", confirmLabel: "Delete", danger: true });
  if (!yes) return;
  ui.deleteCustomPreset(p.id);
}
async function resetAppearance() {
  const yes = await confirmDialog({
    title: "Reset appearance to defaults?",
    message: "Returns every appearance setting — including light/dark mode — to the default look. Your saved custom presets are kept.",
    confirmLabel: "Reset",
  });
  if (!yes) return;
  ui.resetAppearance();
}

// ── Backups ────────────────────────────────────────────────────────
const backupBusy = ref(false);
const backupError = ref(null);
const importMessage = ref(null);
const importFile = ref(null);
const lastBackupAt = ref(getItem("justwrite:lastBackupAt") || null);
const lastAutosaveAt = ref(getItem("justwrite:lastAutosaveAt") || null);
const autosaveDir = ref(null);

// Resolve the autosave folder path so users can see where their work
// is being mirrored to disk. Only populated under Tauri.
(async () => {
  try {
    const res = await window.justwrite?.project?.autosaveDir?.();
    if (typeof res === "string") autosaveDir.value = res;
    else if (res && res.ok !== false && typeof res.path === "string") autosaveDir.value = res.path;
  } catch {}
})();

// Re-read the timestamp on every tab switch into Backups so the user
// doesn't see a stale "Never" right after the first autosave fires.
watchEffect(() => {
  if (active.value === "backups") {
    lastAutosaveAt.value = getItem("justwrite:lastAutosaveAt") || null;
  }
});

function safeFilename(title) {
  const base = (title || "justwrite").replace(/[^\w\d-]+/g, "_").replace(/^_+|_+$/g, "");
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return `${base || "justwrite"}-${stamp}.json`;
}

async function exportBackup() {
  backupBusy.value = true; backupError.value = null;
  try {
    const snap = project.exportFullBackup();
    const name = safeFilename(project.project.title);
    const jw = window.justwrite;
    if (jw?.project?.save) {
      // Tauri build — show the native save dialog so users pick where it lands.
      const res = await jw.project.save(snap, name);
      if (res && res.ok === false && !res.cancelled) {
        throw new Error(res.error || "Save failed");
      }
    } else {
      // Browser fallback — synthesize a download.
      const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    const now = new Date().toISOString();
    setItem("justwrite:lastBackupAt", now);
    lastBackupAt.value = now;
    ui.showToast({ message: "Backup saved." });
  } catch (err) {
    backupError.value = err.message || String(err);
  } finally {
    backupBusy.value = false;
  }
}

async function onImportFile(e) {
  const file = (e.target.files || [])[0];
  e.target.value = "";
  if (!file) return;
  backupError.value = null;
  importMessage.value = null;
  try {
    const text = await file.text();
    const snap = JSON.parse(text);
    if (!snap || typeof snap !== "object" || !snap.project) {
      throw new Error("This doesn't look like a JustWrite backup (missing `project` field).");
    }
    const yes = await confirmDialog({
      title: `Replace workspace with "${snap.project.title || "untitled"}"?`,
      message: "Your current data will be overwritten. Export it first if you want to keep it.",
      confirmLabel: "Replace workspace",
      danger: true,
    });
    if (!yes) return;
    const { workspaceRestored } = project.loadSnapshot(snap) || {};
    const chapterCount = Array.isArray(snap.parts)
      ? snap.parts.reduce((n, p) => n + (p.chapters?.length || 0), 0)
      : Object.keys(snap.scenes || snap.chapterBody || {}).length;
    importMessage.value = `Imported "${snap.project.title || "project"}" — ${chapterCount} chapters.`;
    ui.showToast({ message: "Backup imported." });
    if (workspaceRestored) scheduleWorkspaceReload();
  } catch (err) {
    backupError.value = err.message || String(err);
  }
}

// AI / studio / sessions stores only hydrate from IndexedDB at boot, so
// after restoring workspace keys we need a reload for them to take effect.
// Flush any pending IDB writes first so the reload sees the new values.
function scheduleWorkspaceReload() {
  ui.showToast({ message: "Reloading to apply workspace settings…" });
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
  if (!window.justwrite?.project?.autosaveList) return;
  autosaveListBusy.value = true; backupError.value = null;
  try {
    const res = await window.justwrite.project.autosaveList();
    autosaveList.value = Array.isArray(res) ? res : (res?.ok === false ? [] : (res || []));
  } catch (err) {
    backupError.value = err.message || String(err);
  } finally {
    autosaveListBusy.value = false;
  }
}

async function restoreFromAutosave(entry) {
  backupError.value = null;
  const when = entry.savedAt ? new Date(entry.savedAt).toLocaleString() : "unknown time";
  const yes = await confirmDialog({
    title: `Restore "${entry.title || "project"}" from ${entry.generation}?`,
    message: `Saved at ${when}. Your current workspace will be overwritten — every project, chapter body, AI provider, and voice cast assignment. Export a backup first if you want to keep what you have.`,
    confirmLabel: "Restore from autosave",
    danger: true,
  });
  if (!yes) return;
  try {
    const snap = await window.justwrite.project.autosaveRead(entry.path);
    if (!snap || typeof snap !== "object" || snap.ok === false || !snap.project) {
      throw new Error(snap?.error || "Couldn't read the autosave file.");
    }
    const { workspaceRestored } = project.loadSnapshot(snap) || {};
    ui.showToast({ message: `Restored "${snap.project.title || "project"}".` });
    if (workspaceRestored) scheduleWorkspaceReload();
  } catch (err) {
    backupError.value = err.message || String(err);
  }
}

function autosaveLabel(when) {
  if (!when) return "Unknown time";
  try { return new Date(when).toLocaleString(); } catch { return when; }
}
function generationLabel(gen) {
  if (gen === "current") return "Current";
  if (gen === "prev")    return "Previous";
  if (gen === "prev2")   return "Earlier";
  return gen || "";
}

// ── AI usage helpers ────────────────────────────────────────────────
function fmtUsd(cost) {
  if (!cost || !isFinite(cost)) return "$0.00";
  if (cost < 0.01) return "<$0.01";
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}
function fmtTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function providerLabel(id) {
  return ai.providerById(id)?.name || id || "unknown";
}
const usageByFeature = computed(() =>
  Object.entries(ai.usageTotals.byFeature || {})
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.cost - a.cost || b.calls - a.calls)
);
const usageByProvider = computed(() =>
  Object.entries(ai.usageTotals.byProvider || {})
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.cost - a.cost || b.calls - a.calls)
);
const recentUsageRows = computed(() =>
  [...(ai.usageLog || [])].reverse().map((r) => ({
    ...r,
    totalTokens: (r.promptTokens || 0) + (r.completionTokens || 0),
    providerName: providerLabel(r.providerId),
  }))
);
const recentFilters = ref({
  global: { value: null, matchMode: FilterMatchMode.CONTAINS },
});
const recentGlobalQuery = ref("");
function onRecentInput(e) {
  recentGlobalQuery.value = e.target.value;
  recentFilters.value.global.value = e.target.value || null;
}

async function resetUsageLog() {
  const yes = await confirmDialog({
    title: "Reset the AI usage ledger?",
    message: "Clears every recorded call and aggregate. Doesn't affect AI providers or your project data.",
    confirmLabel: "Reset",
    danger: true,
  });
  if (!yes) return;
  ai.clearUsage();
}

async function resetWorkspace() {
  const yes = await confirmDialog({
    title: "Reset the workspace?",
    message: "This clears ALL local data — project, chapters, AI providers, voice cast — and reloads the app with the demo seed. This cannot be undone.",
    confirmLabel: "Continue",
    danger: true,
  });
  if (!yes) return;
  const typed = await promptDialog({
    title: "Type RESET to confirm",
    label: "Confirmation",
    placeholder: "RESET",
    confirmLabel: "Reset workspace",
    requireMatch: "RESET",
    danger: true,
  });
  if (typed !== "RESET") return;
  try {
    flushPending();
    await clearPrefix("justwrite:");
  } catch {}
  location.reload();
}

const lastBackupLabel = computed(() => {
  if (!lastBackupAt.value) return "Never";
  try { return new Date(lastBackupAt.value).toLocaleString(); } catch { return lastBackupAt.value; }
});

const lastAutosaveLabel = computed(() => {
  if (!lastAutosaveAt.value) return "Pending — will fire within 10s of the next edit.";
  try { return new Date(lastAutosaveAt.value).toLocaleString(); } catch { return lastAutosaveAt.value; }
});

// `window` is not on Vue's template proxy — referencing it in the template
// throws and breaks the render. Expose the bits we need via setup.
const hasNativeSave = computed(() => !!window.justwrite?.project?.save);

// ── About ──────────────────────────────────────────────────────────
const platformLabel = computed(() => {
  const jw = window.justwrite;
  if (jw?.platform === "tauri") return `Tauri (${jw.version || "2"})`;
  return "Browser";
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
    title: `Delete status "${s.label}"?`,
    message: "Items using it will show as unset in the sidebar. No items are deleted.",
    confirmLabel: "Delete status",
    danger: true,
  });
  if (!yes) return;
  project.removeStatusDef(s.id);
}

// ── Worldbuilding categories (user-definable) ──────────────────────
const WB_HUES = [30, 60, 95, 130, 170, 200, 250, 290, 320, 0];
const WB_ICONS = [
  "Sparkle", "Pin", "Calendar", "Users", "GroupIcon",
  "Quote", "Building", "Cube", "Book", "Note",
  "Star", "Network", "Timeline", "Chart",
];
const wbEditing = ref(null); // { id, kind: 'hue' | 'icon' } | null
function wbToggle(id, kind) {
  wbEditing.value = wbEditing.value && wbEditing.value.id === id && wbEditing.value.kind === kind
    ? null : { id, kind };
}
function addCategory() {
  project.addWorldbuildingCategory({
    label: "New category",
    icon: "Sparkle",
    hue: WB_HUES[project.worldbuildingCategories.length % WB_HUES.length],
  });
  wbEditing.value = null;
}
function renameCategory(id, label) { project.updateWorldbuildingCategory(id, { label }); }
function recolorCategory(id, hue) { project.updateWorldbuildingCategory(id, { hue }); wbEditing.value = null; }
function setCategoryIcon(id, icon) { project.updateWorldbuildingCategory(id, { icon }); wbEditing.value = null; }
async function deleteCategory(c) {
  if (project.worldbuildingCategories.length <= 1) {
    ui.showToast({ message: "Keep at least one category." });
    return;
  }
  const count = project.worldbuilding.filter((a) => a.category === c.id).length;
  const into = project.worldbuildingCategories.find((x) => x.id !== c.id)?.label;
  const yes = await confirmDialog({
    title: `Delete category "${c.label}"?`,
    message: count ? `Its ${count} article${count === 1 ? "" : "s"} will move to "${into}".` : "It has no articles.",
    confirmLabel: "Delete category",
    danger: true,
  });
  if (!yes) return;
  project.removeWorldbuildingCategory(c.id);
}
</script>

<template>
  <PaneHeader eyebrow="Project" title="Settings" />
  <div class="pane-card">
    <div class="scrollarea" style="padding:22px">
    <div style="display:grid;grid-template-columns:220px 1fr;gap:22px;max-width:1100px">
      <!-- Section nav -->
      <nav style="display:flex;flex-direction:column;gap:2px">
        <button v-for="s in SECTIONS" :key="s.id"
          class="nav-item" :class="{ active: active === s.id }"
          style="grid-template-columns:1fr"
          @click="active = s.id">{{ s.label }}</button>
      </nav>

      <!-- ── PROJECT ─────────────────────────────── -->
      <div v-if="active === 'project'" style="display:flex;flex-direction:column;gap:14px">
        <div class="card">
          <div class="card-title">Project</div>
          <p class="t-muted" style="font-size:12px;margin:0 0 14px;line-height:1.55">
            Edits flow through the same undo/redo history as your manuscript — ⌘Z restores the previous value.
          </p>
          <div style="display:grid;grid-template-columns:160px 1fr;gap:10px 14px;font-size:13px;align-items:center">
            <span class="t-muted">Title</span>
            <InputText :model-value="project.project.title"
              @update:model-value="(v) => setMeta('title', v)" placeholder="Working title" />
            <span class="t-muted">Author</span>
            <InputText :model-value="project.project.author"
              @update:model-value="(v) => setMeta('author', v)" placeholder="Pen name or legal name" />
            <span class="t-muted">Subtitle</span>
            <InputText :model-value="project.project.subtitle"
              @update:model-value="(v) => setMeta('subtitle', v)" placeholder="Optional" />
            <span class="t-muted">Genre</span>
            <InputText :model-value="project.project.genre"
              @update:model-value="(v) => setMeta('genre', v)" placeholder="Literary, mystery, sci-fi…" />
            <span class="t-muted">Started</span>
            <InputText :model-value="project.project.startedOn"
              @update:model-value="(v) => setMeta('startedOn', v)" placeholder="e.g. March 11, 2026" />
            <span class="t-muted">Deadline</span>
            <InputText :model-value="project.project.deadline"
              @update:model-value="(v) => setMeta('deadline', v)" placeholder="e.g. December 1, 2026" />
            <span class="t-muted" style="align-self:start;padding-top:6px">Premise</span>
            <Textarea auto-resize rows="3" :model-value="project.project.premise"
              @update:model-value="(v) => setMeta('premise', v)"
              placeholder="One- or two-sentence pitch. Used on the Home dashboard and exports." />
          </div>
        </div>
        <div class="card">
          <div class="card-title">Goals</div>
          <div style="display:grid;grid-template-columns:160px 1fr;gap:10px 14px;font-size:13px;align-items:center">
            <span class="t-muted">Word goal</span>
            <div style="display:flex;align-items:center;gap:8px">
              <InputNumber :min="0" :step="500" style="max-width:160px"
                :model-value="project.project.wordsGoal"
                @update:model-value="(v) => setMetaNumber('wordsGoal', v)" />
              <span class="t-muted" style="font-size:11.5px">total words for the manuscript</span>
            </div>
            <span class="t-muted">Daily target</span>
            <div style="display:flex;align-items:center;gap:8px">
              <InputNumber :min="0" :step="50" style="max-width:160px"
                :model-value="project.project.dailyTarget ?? 1200"
                @update:model-value="(v) => setMetaNumber('dailyTarget', v)" />
              <span class="t-muted" style="font-size:11.5px">words/day — drives the Home streak ring</span>
            </div>
          </div>
        </div>

        <!-- ── Statuses ─────────────────────────────────────── -->
        <div class="card">
          <div class="card-title">Statuses</div>
          <p class="t-muted" style="font-size:12.5px;margin:0 0 14px;line-height:1.55">
            A shared palette used by chapters, architecture, the story-world entities, and narrative strands. Each status shows in its color beside items in the sidebar. Rename, recolor, or remove freely — deleting one leaves items that used it unset.
          </p>
          <div style="display:flex;flex-direction:column;gap:8px">
            <div v-for="s in project.statuses" :key="s.id" style="display:flex;align-items:center;gap:10px">
              <div style="position:relative">
                <button type="button" title="Change color"
                  :style="`width:24px;height:24px;border-radius:6px;border:1px solid var(--border);cursor:pointer;background:${s.color}`"
                  @click="editingColorId = editingColorId === s.id ? null : s.id" />
                <div v-if="editingColorId === s.id"
                  style="position:absolute;top:calc(100% + 5px);left:0;z-index:20;display:grid;grid-template-columns:repeat(5,20px);gap:5px;padding:8px;background:var(--surface);border:1px solid var(--border-strong);border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.18)">
                  <button v-for="c in STATUS_SWATCHES" :key="c" type="button"
                    :style="`width:20px;height:20px;border-radius:5px;border:0;cursor:pointer;background:${c};box-shadow:${c === s.color ? '0 0 0 2px var(--surface),0 0 0 4px var(--accent)' : 'inset 0 0 0 1px rgba(0,0,0,.08)'}`"
                    @click="recolorStatus(s.id, c)" />
                  <label title="Custom color"
                    style="position:relative;width:20px;height:20px;border-radius:5px;display:grid;place-items:center;border:1px dashed var(--border-strong);cursor:pointer;color:var(--muted)">
                    <input type="color" style="position:absolute;inset:0;opacity:0;cursor:pointer;border:0;padding:0"
                      @input="recolorStatus(s.id, $event.target.value)" />
                    <Icon name="Plus" :size="11" />
                  </label>
                </div>
              </div>
              <InputText style="max-width:220px" :model-value="s.label"
                @update:model-value="(v) => renameStatus(s.id, v)" placeholder="Status name" />
              <span :style="`font-size:11px;font-weight:600;text-transform:lowercase;color:${s.color}`">{{ s.label }}</span>
              <Button severity="secondary" text size="small" style="margin-left:auto" title="Delete status" @click="deleteStatus(s)">
                <template #icon><Icon name="Trash" :size="13" /></template>
              </Button>
            </div>
            <div v-if="!project.statuses.length" class="t-muted" style="font-size:12.5px;font-style:italic">No statuses yet — add one below.</div>
          </div>
          <Button label="Add status" severity="secondary" text style="margin-top:12px" @click="addStatus">
            <template #icon><Icon name="Plus" :size="13" /></template>
          </Button>
        </div>

        <!-- ── Worldbuilding categories ─────────────────────── -->
        <div class="card">
          <div class="card-title">Worldbuilding categories</div>
          <p class="t-muted" style="font-size:12.5px;margin:0 0 14px;line-height:1.55">
            Group your worldbuilding articles — these drive the sidebar sections and the category picker. Pick an icon and color for each. Deleting one moves its articles into another category.
          </p>
          <div style="display:flex;flex-direction:column;gap:8px">
            <div v-for="c in project.worldbuildingCategories" :key="c.id" style="display:flex;align-items:center;gap:10px">
              <!-- icon tile -->
              <div style="position:relative">
                <button type="button" title="Change icon"
                  :style="`width:30px;height:30px;border-radius:8px;border:0;cursor:pointer;display:grid;place-items:center;background:oklch(var(--tile-bg-l) var(--tile-bg-c) ${c.hue});color:oklch(var(--tile-ink-l) var(--tile-ink-c) ${c.hue})`"
                  @click="wbToggle(c.id, 'icon')">
                  <Icon :name="c.icon" :size="15" />
                </button>
                <div v-if="wbEditing && wbEditing.id === c.id && wbEditing.kind === 'icon'"
                  style="position:absolute;top:calc(100% + 5px);left:0;z-index:20;display:grid;grid-template-columns:repeat(5,28px);gap:4px;padding:8px;background:var(--surface);border:1px solid var(--border-strong);border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.18)">
                  <button v-for="ic in WB_ICONS" :key="ic" type="button"
                    :style="`width:28px;height:28px;border-radius:6px;border:0;cursor:pointer;display:grid;place-items:center;color:var(--ink-2);background:${ic === c.icon ? 'var(--accent-soft)' : 'var(--surface-2)'}`"
                    @click="setCategoryIcon(c.id, ic)">
                    <Icon :name="ic" :size="14" />
                  </button>
                </div>
              </div>
              <!-- hue swatch -->
              <div style="position:relative">
                <button type="button" title="Change color"
                  :style="`width:24px;height:24px;border-radius:6px;border:1px solid var(--border);cursor:pointer;background:oklch(0.62 0.13 ${c.hue})`"
                  @click="wbToggle(c.id, 'hue')" />
                <div v-if="wbEditing && wbEditing.id === c.id && wbEditing.kind === 'hue'"
                  style="position:absolute;top:calc(100% + 5px);left:0;z-index:20;display:grid;grid-template-columns:repeat(5,20px);gap:5px;padding:8px;background:var(--surface);border:1px solid var(--border-strong);border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.18)">
                  <button v-for="h in WB_HUES" :key="h" type="button"
                    :style="`width:20px;height:20px;border-radius:5px;border:0;cursor:pointer;background:oklch(0.62 0.13 ${h});box-shadow:${h === c.hue ? '0 0 0 2px var(--surface),0 0 0 4px var(--accent)' : 'inset 0 0 0 1px rgba(0,0,0,.08)'}`"
                    @click="recolorCategory(c.id, h)" />
                </div>
              </div>
              <InputText style="max-width:220px" :model-value="c.label"
                @update:model-value="(v) => renameCategory(c.id, v)" placeholder="Category name" />
              <Button severity="secondary" text size="small" style="margin-left:auto" title="Delete category" @click="deleteCategory(c)">
                <template #icon><Icon name="Trash" :size="13" /></template>
              </Button>
            </div>
            <div v-if="!project.worldbuildingCategories.length" class="t-muted" style="font-size:12.5px;font-style:italic">No categories yet — add one below.</div>
          </div>
          <Button label="Add category" severity="secondary" text style="margin-top:12px" @click="addCategory">
            <template #icon><Icon name="Plus" :size="13" /></template>
          </Button>
        </div>

        <!-- ── Cover image ──────────────────────────────────── -->
        <div class="card">
          <div class="card-title">Cover image</div>
          <p class="t-muted" style="font-size:12.5px;margin:0 0 14px;line-height:1.55">
            Shows up as the book cover in EPUB and PDF exports. Recommended size: 1600 × 2400 px (2:3 ratio), JPEG or PNG.
          </p>

          <div style="display:grid;grid-template-columns:140px 1fr;gap:18px;align-items:start">
            <!-- Preview -->
            <div class="cover-frame" :class="{ empty: !coverSrc }">
              <img v-if="coverSrc" :src="coverSrc" alt="Book cover" />
              <Icon v-else name="Image" :size="32" />
            </div>

            <div style="display:flex;flex-direction:column;gap:10px">
              <div v-if="project.project.coverImage" style="font-size:12.5px">
                <div><b>{{ project.project.coverImage.name || "cover" }}</b></div>
                <div class="t-muted" style="font-size:11.5px;margin-top:2px">
                  {{ project.project.coverImage.path ? "Saved to disk" : "Stored inline" }}
                </div>
              </div>
              <div v-else class="t-muted" style="font-size:12.5px;font-style:italic">
                No cover set — the EPUB will export without a cover page.
              </div>

              <div v-if="coverError" class="banner danger">
                {{ coverError }}
              </div>

              <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
                <label class="btn primary" :class="{ disabled: coverUploading }">
                  <Icon name="Image" :size="13" />
                  {{ coverUploading ? "Uploading…" : (project.project.coverImage ? "Replace…" : "Choose image…") }}
                  <input type="file" accept="image/*" style="display:none" @change="onPickCover" :disabled="coverUploading" />
                </label>
                <Button v-if="project.project.coverImage" label="Remove" severity="secondary" text @click="removeCover" />
              </div>

              <div class="t-muted" style="font-size:11px;display:inline-flex;gap:5px;align-items:center;font-family:var(--font-mono)">
                <Icon :name="hasNativeImages ? 'Check' : 'Alert'" :size="11" />
                {{ hasNativeImages ? "Cover is saved to your app folder." : "Browser preview — cover lives in IndexedDB as a data URL." }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── AI & AUDIO ────────────────────────────── -->
      <div v-else-if="active === 'audio'" style="display:flex;flex-direction:column;gap:14px">
        <div class="card">
          <div class="card-title">Defaults</div>
          <div style="font-size:13px;color:var(--ink-2);margin-bottom:12px">
            Pick which provider handles writing assistance (LLM) and which handles audio (TTS). Both follow the OpenAI HTTP standard — anything that speaks it works here.
          </div>
          <div style="display:grid;grid-template-columns:160px 1fr;gap:10px 14px;align-items:center;font-size:13px">
            <span class="t-muted">Default LLM</span>
            <Combobox
              :model-value="ai.defaultLlmId"
              @update:model-value="ai.setDefaultLlm"
              :items="ai.llmProviders"
              item-value="id" item-label="name"
              :searchable="false"
              placeholder="Pick a provider"
              chev-title="Choose default LLM provider" />
            <span class="t-muted">Default TTS</span>
            <Combobox
              :model-value="ai.defaultTtsId"
              @update:model-value="ai.setDefaultTts"
              :items="ai.ttsProviders"
              item-value="id" item-label="name"
              :searchable="false"
              placeholder="Pick a provider"
              chev-title="Choose default TTS provider" />
          </div>
        </div>

        <div class="card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <div class="card-title" style="margin:0">Providers</div>
            <span class="t-muted" style="font-size:12px">{{ ai.providers.length }} configured</span>
            <Button label="Add provider" severity="primary" size="small" style="margin-left:auto" @click="startNew">
              <template #icon><Icon name="Plus" :size="12" /></template>
            </Button>
          </div>

          <div style="display:flex;flex-direction:column;gap:8px">
            <!-- New-provider edit row (only when adding) -->
            <SettingsProviderForm v-if="editing === 'new' && draft"
              :draft="draft" editing-key="new"
              @save="saveDraft" @cancel="cancelEdit" />

            <template v-for="p in ai.providers" :key="p.id">
              <!-- Read row -->
              <div v-if="editing !== p.id" style="display:grid;grid-template-columns:auto 1fr auto auto auto;gap:14px;align-items:center;padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--surface)">
                <span style="width:36px;height:36px;border-radius:8px;background:var(--surface-3);color:var(--ink-2);display:grid;place-items:center">
                  <Icon :name="p.kind === 'tts' ? 'Headphones' : p.kind === 'both' ? 'Sparkle' : 'Cpu'" :size="16" />
                </span>
                <div style="min-width:0">
                  <div style="display:flex;gap:8px;align-items:center">
                    <b style="font-size:13.5px">{{ p.name }}</b>
                    <span style="font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;background:var(--surface-3);color:var(--muted);text-transform:uppercase;letter-spacing:0.05em">{{ p.kind }}</span>
                    <span v-if="p.builtIn" class="chip" style="font-size:10px">built-in</span>
                  </div>
                  <div class="t-muted" style="font-family:var(--font-mono);font-size:11px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ p.baseUrl }}</div>
                  <div class="t-muted" style="font-size:11px;margin-top:2px">
                    <template v-if="p.chatModel">chat: <b>{{ p.chatModel }}</b> · </template>
                    <template v-if="p.embeddingModel">embed: <b>{{ p.embeddingModel }}</b> · </template>
                    <template v-if="p.ttsModel">tts: <b>{{ p.ttsModel }}</b> · </template>
                    <template v-if="p.ttsVoices?.length">{{ p.ttsVoices.length }} voices · </template>
                    {{ p.apiKey ? "API key set" : "no key" }}
                  </div>
                </div>
                <span style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px">
                  <span :style="`width:8px;height:8px;border-radius:50%;background:${statusColor(ai.status[p.id])}`" />
                  {{ statusLabel(ai.status[p.id]) }}
                </span>
                <Button label="Test" size="small" @click="pingProvider(p.id)" />
                <Button label="Edit" size="small" @click="startEdit(p)" />
              </div>

              <!-- Edit row -->
              <SettingsProviderForm v-else
                :draft="draft" :editing-key="editing"
                @save="saveDraft" @cancel="cancelEdit" />
            </template>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Quick setup tips</div>
          <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:14px;font-size:12.5px;color:var(--ink-2)">
            <div>
              <b style="font-size:12.5px;color:var(--ink)">OpenAI-compatible (local)</b>
              <p style="margin:4px 0 0;line-height:1.55">
                Point at any local server that speaks the OpenAI HTTP API — Ollama (<code style="background:var(--surface-3);padding:1px 5px;border-radius:3px">:11434/v1</code>), LM Studio (<code style="background:var(--surface-3);padding:1px 5px;border-radius:3px">:1234/v1</code>), llama.cpp (<code style="background:var(--surface-3);padding:1px 5px;border-radius:3px">:8080/v1</code>). Update the Base URL accordingly. No API key needed.
              </p>
            </div>
            <div>
              <b style="font-size:12.5px;color:var(--ink)">OpenAI</b>
              <p style="margin:4px 0 0;line-height:1.55">
                Add your key. Both chat and TTS are supported.
              </p>
            </div>
            <div>
              <b style="font-size:12.5px;color:var(--ink)">Claude (Anthropic)</b>
              <p style="margin:4px 0 0;line-height:1.55">
                Get an API key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" style="color:var(--accent)">console.anthropic.com/settings/keys</a> and paste it here. LLM only — no TTS. Default model <code style="background:var(--surface-3);padding:1px 5px;border-radius:3px">claude-haiku-4-5</code> is the cheapest; swap to <code style="background:var(--surface-3);padding:1px 5px;border-radius:3px">claude-sonnet-4-6</code> or <code style="background:var(--surface-3);padding:1px 5px;border-radius:3px">claude-opus-4-7</code> for higher quality. Uses Anthropic's OpenAI-compatible endpoint, so a few advanced fields (<code style="background:var(--surface-3);padding:1px 5px;border-radius:3px">response_format</code>, <code style="background:var(--surface-3);padding:1px 5px;border-radius:3px">seed</code>, etc.) are silently ignored.
              </p>
            </div>
            <div>
              <b style="font-size:12.5px;color:var(--ink)">Chatterbox</b>
              <p style="margin:4px 0 0;line-height:1.55">
                Install <b>devnen/Chatterbox-TTS-Server</b> (portable Windows build at <a href="https://github.com/devnen/Chatterbox-TTS-Server/releases" target="_blank" rel="noopener" style="color:var(--accent)">github.com/devnen/Chatterbox-TTS-Server/releases</a> — unzip, double-click <code style="background:var(--surface-3);padding:1px 5px;border-radius:3px">start.bat</code>). Base URL <code style="background:var(--surface-3);padding:1px 5px;border-radius:3px">http://localhost:8004/v1</code>. To add a voice, drop a 6–20s reference clip (WAV or MP3) directly into the server's <code style="background:var(--surface-3);padding:1px 5px;border-radius:3px">voices/</code> folder — it'll show up by filename in the cast picker. Note: the web UI's upload form puts files in <code style="background:var(--surface-3);padding:1px 5px;border-radius:3px">reference_audio/</code> instead, which JustWrite doesn't see — move them to <code style="background:var(--surface-3);padding:1px 5px;border-radius:3px">voices/</code> if you upload that way.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- ── AI USAGE ──────────────────────────────── -->
      <div v-else-if="active === 'usage'" style="display:flex;flex-direction:column;gap:14px">
        <div class="card">
          <div class="card-title">
            AI usage
            <Button label="Reset ledger" severity="secondary" text size="small" style="margin-left:auto" @click="resetUsageLog"
              title="Clear every recorded call. Future calls start tallying from zero." />
          </div>
          <p class="t-muted" style="font-size:12.5px;margin:0 0 14px;line-height:1.55">
            Tokens and estimated cost across every AI call routed through writerAI, critique, structural analysis,
            and entity extraction. Local providers (Ollama, LM Studio, llama.cpp) are recorded at $0 — pricing only
            applies to cloud models in the built-in price table.
          </p>

          <div v-if="ai.usageTotals.calls === 0" class="t-muted" style="font-size:12px;text-align:center;padding:22px 0;background:var(--surface-2);border-radius:8px;font-style:italic">
            No AI calls yet. Run something from Critique, the bubble menu, or Writer Lab and it'll show up here.
          </div>

          <template v-else>
            <!-- Rollup pills -->
            <div class="pill-row">
              <StatPill :value="ai.usageTotals.calls.toLocaleString()" label="calls" />
              <StatPill :value="ai.totalTokens.toLocaleString()" label="tokens" />
              <StatPill :value="ai.usageTotals.promptTokens.toLocaleString()" label="prompt" />
              <StatPill :value="ai.usageTotals.completionTokens.toLocaleString()" label="completion" />
              <StatPill :value="fmtUsd(ai.totalCost)" label="est. cost" />
            </div>

            <!-- By feature -->
            <div class="usage-section">
              <div class="usage-section-h">By feature</div>
              <DataTable :value="usageByFeature" data-key="key" class="usage-dt" size="small">
                <Column field="key" header="Feature" sortable style="min-width:160px" />
                <Column field="calls" header="Calls" sortable data-type="numeric" style="text-align:right;width:70px">
                  <template #body="{ data }">{{ data.calls.toLocaleString() }}</template>
                </Column>
                <Column field="promptTokens" header="Prompt" sortable data-type="numeric" style="text-align:right;width:90px">
                  <template #body="{ data }">{{ data.promptTokens.toLocaleString() }}</template>
                </Column>
                <Column field="completionTokens" header="Completion" sortable data-type="numeric" style="text-align:right;width:100px">
                  <template #body="{ data }">{{ data.completionTokens.toLocaleString() }}</template>
                </Column>
                <Column field="cost" header="Cost" sortable data-type="numeric" style="text-align:right;width:80px">
                  <template #body="{ data }">{{ fmtUsd(data.cost) }}</template>
                </Column>
              </DataTable>
            </div>

            <!-- By provider -->
            <div class="usage-section">
              <div class="usage-section-h">By provider</div>
              <DataTable :value="usageByProvider" data-key="key" class="usage-dt" size="small">
                <Column field="key" header="Provider" sortable style="min-width:160px">
                  <template #body="{ data }">{{ providerLabel(data.key) }}</template>
                </Column>
                <Column field="calls" header="Calls" sortable data-type="numeric" style="text-align:right;width:70px">
                  <template #body="{ data }">{{ data.calls.toLocaleString() }}</template>
                </Column>
                <Column field="promptTokens" header="Prompt" sortable data-type="numeric" style="text-align:right;width:90px">
                  <template #body="{ data }">{{ data.promptTokens.toLocaleString() }}</template>
                </Column>
                <Column field="completionTokens" header="Completion" sortable data-type="numeric" style="text-align:right;width:100px">
                  <template #body="{ data }">{{ data.completionTokens.toLocaleString() }}</template>
                </Column>
                <Column field="cost" header="Cost" sortable data-type="numeric" style="text-align:right;width:80px">
                  <template #body="{ data }">{{ fmtUsd(data.cost) }}</template>
                </Column>
              </DataTable>
            </div>

            <!-- Recent calls -->
            <div class="usage-section">
              <div class="usage-section-h">
                Recent calls
                <span class="t-muted" style="font-weight:400;font-size:11px;margin-left:6px">{{ recentUsageRows.length }}</span>
              </div>
              <div class="wb-toolbar" style="margin-bottom:10px">
                <span class="wb-search">
                  <Icon name="Search" :size="13" class="wb-search-icon" />
                  <InputText :value="recentGlobalQuery" placeholder="Search calls…" @input="onRecentInput" class="wb-search-input" />
                </span>
              </div>
              <DataTable
                :value="recentUsageRows"
                data-key="id"
                v-model:filters="recentFilters"
                :global-filter-fields="['feature', 'model', 'providerName']"
                class="usage-dt"
                size="small"
                paginator
                :rows="25"
                :rows-per-page-options="[10, 25, 50]"
                sort-field="at"
                :sort-order="-1"
              >
                <Column field="at" header="Time" sortable style="width:110px">
                  <template #body="{ data }">{{ fmtTime(data.at) }}</template>
                </Column>
                <Column field="feature" header="Feature" sortable style="min-width:120px" />
                <Column field="model" header="Model" sortable style="min-width:130px">
                  <template #body="{ data }">{{ data.model || "—" }}</template>
                </Column>
                <Column field="totalTokens" header="Tokens" sortable data-type="numeric" style="text-align:right;width:80px">
                  <template #body="{ data }">{{ data.totalTokens.toLocaleString() }}</template>
                </Column>
                <Column field="cost" header="Cost" sortable data-type="numeric" style="text-align:right;width:80px">
                  <template #body="{ data }">{{ fmtUsd(data.cost) }}</template>
                </Column>
              </DataTable>
            </div>
          </template>
        </div>
      </div>

      <!-- ── APPEARANCE ────────────────────────────── -->
      <div v-else-if="active === 'appearance'" style="display:flex;flex-direction:column;gap:14px">

        <!-- Presets -->
        <div class="card">
          <div class="card-title">Theme preset
            <Button label="Reset to defaults" severity="secondary" text size="small" style="margin-left:auto" @click="resetAppearance"
              title="Reset every appearance setting to the default look">
              <template #icon><Icon name="Refresh" :size="12" /></template>
            </Button>
          </div>
          <p class="t-muted" style="font-size:12px;margin:0 0 12px">Start from a curated look, then fine-tune anything below.</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:10px">
            <button v-for="p in THEME_PRESETS" :key="p.id"
              class="preset-tile" :class="{ active: ap.preset === p.id }"
              @click="applyPreset(p)">
              <b>{{ p.name }}</b>
              <span class="t-muted">{{ p.hint }}</span>
              <Icon v-if="ap.preset === p.id" name="Check" :size="13" class="preset-check" />
            </button>

            <div v-for="p in ui.customPresets" :key="p.id"
              class="preset-tile is-saved" :class="{ active: ap.preset === p.id }"
              @click="applyPreset(p)">
              <b>{{ p.name }}</b>
              <span class="t-muted">Saved preset</span>
              <div class="preset-actions">
                <button class="preset-act" title="Rename" @click.stop="renameCustomPreset(p)"><Icon name="Pencil" :size="12" /></button>
                <button class="preset-act danger" title="Delete" @click.stop="removeCustomPreset(p)"><Icon name="Trash" :size="12" /></button>
              </div>
            </div>

            <button v-if="ap.preset === 'custom'" class="preset-tile is-save" @click="saveCurrentPreset">
              <Icon name="Plus" :size="15" />
              <b>Save current…</b>
              <span class="t-muted">Keep this mix as a preset</span>
            </button>
          </div>
        </div>

        <!-- Preview — sits right under the preset row so a preset click
             is immediately reflected without scrolling. -->
        <div class="card">
          <div class="card-title">Preview</div>
          <div class="appear-preview" :data-layout="ap.editorLayout">
            <div class="ap-side">
              <div class="ap-brand">JustWrite</div>
              <div class="ap-section">Manuscript</div>
              <div class="ap-nav active">Chapters</div>
              <div class="ap-nav">Characters</div>
              <div class="ap-section">Project</div>
              <div class="ap-nav">Settings</div>
            </div>
            <div class="ap-main">
              <div class="ap-page">
                <div v-if="ap.editorLayout === 'page'" class="ap-runninghead">The Cartographer's Daughter</div>
                <div class="ap-eyebrow">Chapter 12</div>
                <div class="ap-h">The First Crossing</div>
                <p class="ap-prose">She pressed her thumb to the vellum where the coastline should have been, and felt only the cold weave of the cloth.</p>
                <p class="ap-prose">Above her, the deck complained in its joints — and the fog, she now understood, was not weather.</p>
                <div class="ap-ornament">✦&nbsp;&nbsp;✦&nbsp;&nbsp;✦</div>
                <div class="ap-controls">
                  <button class="btn accent sm">Accent</button>
                  <span class="chip" style="background:var(--accent-soft);color:var(--accent-ink);border-color:var(--accent-line)">Selected</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Mode -->
        <div class="card">
          <div class="card-title">Mode</div>
          <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px">
            <button v-for="t in THEMES" :key="t.id"
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
          <div class="card-title">Typography</div>
          <p class="t-muted" style="font-size:12px;margin:0 0 12px">Choose the typeface for each part of the app, scale the overall size, and tune the sidebar's heading + menu styles.</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px">
            <button v-for="p in PAIRINGS" :key="p.id"
              class="pairing-tile" :class="{ active: ap.fontPairing === p.id }"
              @click="setAp({ fontPairing: p.id, uiFont: p.ui, displayFont: p.display, editorBodyFont: p.display })">
              <span class="pairing-sample" :style="{ fontFamily: dispStack(p.display) }">Ag</span>
              <div style="display:flex;flex-direction:column;min-width:0">
                <b style="font-size:12.5px">{{ p.name }}</b>
                <span class="t-muted" style="font-size:10.5px">{{ p.display }} · {{ p.ui }}</span>
              </div>
              <Icon v-if="ap.fontPairing === p.id" name="Check" :size="13" style="margin-left:auto;color:var(--accent)" />
            </button>
          </div>
          <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:14px">
            <label class="field"><span class="field-l">UI font</span>
              <Select :model-value="ap.uiFont" @update:model-value="(v) => setAp({ uiFont: v })"
                :options="UI_FONTS.map(f => ({ label: f.label, value: f.label }))"
                optionLabel="label" optionValue="value" />
              <span class="field-hint">Buttons, menus, and labels.</span>
            </label>
            <label class="field"><span class="field-l">Display font</span>
              <Select :model-value="ap.displayFont" @update:model-value="(v) => setAp({ displayFont: v })"
                :options="DISPLAY_FONTS.map(f => ({ label: f.label, value: f.label }))"
                optionLabel="label" optionValue="value" />
              <span class="field-hint">Page titles, big numbers, serif headings.</span>
            </label>
            <label class="field"><span class="field-l">Editor body font</span>
              <Select :model-value="ap.editorBodyFont" @update:model-value="(v) => setAp({ editorBodyFont: v })"
                :options="DISPLAY_FONTS.map(f => ({ label: f.label, value: f.label }))"
                optionLabel="label" optionValue="value" />
              <span class="field-hint">Manuscript prose. Per-document choice can override this in the editor's ⚙ Writing settings.</span>
            </label>
          </div>
          <div class="size-row">
            <span class="field-l">Size</span>
            <div class="size-seg">
              <button v-for="s in UI_SCALES" :key="s.value"
                :class="{ active: ap.uiScale === s.value }"
                @click="setAp({ uiScale: s.value })">
                <b>{{ s.label }}</b><span>{{ Math.round(s.value * 100) }}%</span>
              </button>
            </div>
            <p class="size-hint">Scales every label, control, and the prose together.</p>
          </div>
          <div class="size-row">
            <span class="field-l">Section heading</span>
            <div class="size-seg">
              <button v-for="s in SIDEBAR_HEADING_STYLE_LIST" :key="s.key"
                :class="{ active: ap.sidebarHeadingStyle === s.key }"
                @click="setAp({ sidebarHeadingStyle: s.key })">
                <b>{{ s.label }}</b>
              </button>
            </div>
            <div class="size-seg size-seg-narrow">
              <button v-for="s in SIDEBAR_HEADING_SIZES" :key="s.value"
                :class="{ active: ap.sidebarHeadingSize === s.value }"
                @click="setAp({ sidebarHeadingSize: s.value })">
                <b>{{ s.label }}</b>
              </button>
            </div>
            <p class="size-hint">The small labels that group the sidebar nav (e.g. <em>Manuscript</em>, <em>Story world</em>).</p>
          </div>
          <div class="size-row">
            <span class="field-l">Menu item</span>
            <div class="size-seg">
              <button v-for="s in NAV_ITEM_STYLE_LIST" :key="s.key"
                :class="{ active: ap.navItemStyle === s.key }"
                @click="setAp({ navItemStyle: s.key })">
                <b>{{ s.label }}</b>
              </button>
            </div>
            <div class="size-seg size-seg-narrow">
              <button v-for="s in NAV_ITEM_SIZES" :key="s.value"
                :class="{ active: ap.navItemSize === s.value }"
                @click="setAp({ navItemSize: s.value })">
                <b>{{ s.label }}</b>
              </button>
            </div>
            <p class="size-hint">Each sidebar entry — <em>Home</em>, <em>Chapters</em>, <em>Characters</em>, and so on.</p>
          </div>
        </div>

        <!-- Accent & gold -->
        <div class="card">
          <div class="card-title">Accent &amp; gold</div>
          <p class="t-muted" style="font-size:12px;margin:0 0 12px">Accent drives selection, the active nav item, buttons and links. Gold is the secondary — rings, rules, peak markers.</p>
          <div class="swatch-row">
            <span class="swatch-label">Accent</span>
            <button v-for="p in ACCENT_PRESETS" :key="p.hue"
              class="accent-swatch" :class="{ active: ap.accentHue === p.hue }"
              :title="p.name" :style="`background: oklch(0.55 0.13 ${p.hue})`"
              @click="setAp({ accentHue: p.hue })">
              <Icon v-if="ap.accentHue === p.hue" name="Check" :size="12" />
            </button>
            <InputNumber :min="0" :max="360" style="width:74px"
              :model-value="ap.accentHue" @update:model-value="(v) => setAp({ accentHue: clampHue(v) })" />
          </div>
          <div class="swatch-row" style="margin-top:8px">
            <span class="swatch-label">Gold</span>
            <button v-for="p in GOLD_PRESETS" :key="p.hue"
              class="accent-swatch" :class="{ active: ap.goldHue === p.hue }"
              :title="p.name" :style="`background: oklch(0.62 0.1 ${p.hue})`"
              @click="setAp({ goldHue: p.hue })">
              <Icon v-if="ap.goldHue === p.hue" name="Check" :size="12" />
            </button>
            <InputNumber :min="0" :max="360" style="width:74px"
              :model-value="ap.goldHue" @update:model-value="(v) => setAp({ goldHue: clampHue(v) })" />
          </div>
        </div>

        <!-- Backgrounds -->
        <div class="card">
          <div class="card-title">Backgrounds</div>
          <p class="t-muted" style="font-size:12px;margin:0 0 12px">Tint each area independently — every option is tuned to stay legible. Pick a curated swatch or click <b>Custom</b> for any colour. The <b>Text</b> row picks the text-colour family used across the app.</p>
          <div class="swatch-row">
            <span class="swatch-label">App</span>
            <button v-for="t in SURFACE_TINT_LIST" :key="t.key"
              class="tint-swatch" :class="{ active: ap.appBg === t.key }"
              :title="t.label" :style="{ background: tintColor(t) }"
              @click="setAp({ appBg: t.key })">
              <Icon v-if="ap.appBg === t.key" name="Check" :size="12" />
            </button>
            <label class="tint-swatch tint-custom" :class="{ active: isCustomHex(ap.appBg) }" title="Custom colour">
              <input type="color" :value="isCustomHex(ap.appBg) ? ap.appBg : '#dcd6c4'"
                @input="setAp({ appBg: $event.target.value })" />
              <Icon v-if="isCustomHex(ap.appBg)" name="Check" :size="12" />
            </label>
          </div>
          <div class="swatch-row" style="margin-top:8px">
            <span class="swatch-label">Sidebar</span>
            <button v-for="t in SURFACE_TINT_LIST" :key="t.key"
              class="tint-swatch" :class="{ active: ap.sidebarBg === t.key }"
              :title="t.label" :style="{ background: tintColor(t) }"
              @click="setAp({ sidebarBg: t.key })">
              <Icon v-if="ap.sidebarBg === t.key" name="Check" :size="12" />
            </button>
            <label class="tint-swatch tint-custom" :class="{ active: isCustomHex(ap.sidebarBg) }" title="Custom colour">
              <input type="color" :value="isCustomHex(ap.sidebarBg) ? ap.sidebarBg : '#dcd6c4'"
                @input="setAp({ sidebarBg: $event.target.value })" />
              <Icon v-if="isCustomHex(ap.sidebarBg)" name="Check" :size="12" />
            </label>
          </div>
          <div class="swatch-row" style="margin-top:8px">
            <span class="swatch-label">Editor paper</span>
            <button v-for="t in PAPER_TINT_LIST" :key="t.key"
              class="tint-swatch" :class="{ active: ap.editorPaper === t.key }"
              :title="t.label" :style="{ background: tintColor(t) }"
              @click="setAp({ editorPaper: t.key })">
              <Icon v-if="ap.editorPaper === t.key" name="Check" :size="12" />
            </button>
            <label class="tint-swatch tint-custom" :class="{ active: isCustomHex(ap.editorPaper) }" title="Custom paper colour">
              <input type="color" :value="isCustomHex(ap.editorPaper) ? ap.editorPaper : '#f4ecd8'"
                @input="setAp({ editorPaper: $event.target.value })" />
              <Icon v-if="isCustomHex(ap.editorPaper)" name="Check" :size="12" />
            </label>
          </div>
          <div class="swatch-row" style="margin-top:14px">
            <span class="swatch-label">Text</span>
            <button v-for="t in INK_PALETTE_LIST" :key="t.key"
              class="tint-swatch" :class="{ active: ap.inkPalette === t.key }"
              :title="t.label" :style="{ background: inkSwatch(t) }"
              @click="setAp({ inkPalette: t.key })">
              <Icon v-if="ap.inkPalette === t.key" name="Check" :size="12" style="color:#fff" />
            </button>
          </div>
          <div class="inline-paper-row">
            <label>
              <Checkbox binary :model-value="ap.inlinePaper"
                @update:model-value="(v) => setAp({ inlinePaper: v })" />
              <span>Apply editor paper to inline fields</span>
            </label>
            <p class="t-muted" style="font-size:11px;margin:4px 0 0;padding-left:22px">Character, note &amp; worldbuilding rich-text fields pick up the paper tint instead of the surface.</p>
          </div>
        </div>

        <!-- Editor layout -->
        <div class="card">
          <div class="card-title">Editor layout</div>
          <p class="t-muted" style="font-size:12px;margin:0 0 12px">How the manuscript editor presents your prose while you write.</p>
          <div class="seg2">
            <button :class="{ active: ap.editorLayout === 'full' }" @click="setAp({ editorLayout: 'full' })">
              <b>Full width</b><span>Edge-to-edge writing surface.</span>
            </button>
            <button :class="{ active: ap.editorLayout === 'page' }" @click="setAp({ editorLayout: 'page' })">
              <b>Page</b><span>Centered sheet with margins, running head &amp; drop cap.</span>
            </button>
          </div>
          <p class="t-muted" style="font-size:11px;margin:12px 0 0">Per-document overrides for any of these live in the editor's ⚙ Writing settings — pick <em>theme</em> there to fall back to the theme default.</p>
        </div>

        <!-- Editor writing -->
        <div class="card">
          <div class="card-title">Editor writing</div>
          <p class="t-muted" style="font-size:12px;margin:0 0 12px">Defaults for the manuscript prose — font size, line spacing, paragraph spacing, and first-line indent. Per-document choices in the editor's ⚙ Writing settings override these.</p>
          <div class="size-row">
            <span class="field-l">Font size</span>
            <div class="size-seg">
              <button v-for="o in EDITOR_FONT_SIZES" :key="o.value"
                :class="{ active: ap.editorFontSize === o.value }"
                @click="setAp({ editorFontSize: o.value })">
                <b>{{ o.label }}</b><span>{{ o.px }}</span>
              </button>
            </div>
          </div>
          <div class="size-row">
            <span class="field-l">Line spacing</span>
            <div class="size-seg">
              <button v-for="o in EDITOR_LINE_OPTIONS" :key="o"
                :class="{ active: ap.editorLineSpacing === o }"
                @click="setAp({ editorLineSpacing: o })">
                <b>{{ o }}</b>
              </button>
            </div>
          </div>
          <div class="size-row">
            <span class="field-l">Paragraph spacing</span>
            <div class="size-seg">
              <button v-for="o in EDITOR_PARA_OPTIONS" :key="o"
                :class="{ active: ap.editorParaSpacing === o }"
                @click="setAp({ editorParaSpacing: o })">
                <b>{{ o === 0 ? '0' : o + 'em' }}</b>
              </button>
            </div>
          </div>
          <div class="size-row">
            <span class="field-l">First-line indent</span>
            <div class="size-seg">
              <button :class="{ active: ap.editorParaIndent === true }" @click="setAp({ editorParaIndent: true })"><b>Indent</b></button>
              <button :class="{ active: ap.editorParaIndent === false }" @click="setAp({ editorParaIndent: false })"><b>No indent</b></button>
            </div>
          </div>
        </div>

      </div>

      <!-- ── BACKUPS ───────────────────────────────── -->
      <div v-else-if="active === 'backups'" style="display:flex;flex-direction:column;gap:14px">
        <div v-if="autosaveDir" class="card">
          <div class="card-title">Auto-save to disk</div>
          <p class="t-muted" style="font-size:12.5px;margin:0 0 12px;line-height:1.55">
            Every edit is also mirrored to a JSON file on disk within ~10s. Two prior generations
            are kept (<code>.prev.json</code> / <code>.prev2.json</code>) so a bad write or accidental
            reset can be recovered without a manual export. Each file is a full workspace bundle —
            project, AI providers, voice cast, sessions — so restoring one file brings everything back.
            Anything OneDrive / Time Machine / your backup tool watches in this folder will pick it up
            automatically.
          </p>
          <div style="display:grid;grid-template-columns:140px 1fr;gap:10px 14px;font-size:13px;align-items:center;margin-bottom:12px">
            <span class="t-muted">Folder</span>
            <code style="word-break:break-all">{{ autosaveDir }}</code>
            <span class="t-muted">Last autosave</span>
            <span>{{ lastAutosaveLabel }}</span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <Button :label="autosaveListShown ? 'Hide autosaves' : 'Restore from autosave…'" :disabled="autosaveListBusy" @click="toggleAutosaveList">
              <template #icon><Icon name="Folder" :size="13" /></template>
            </Button>
          </div>
          <div v-if="autosaveListShown" style="margin-top:12px">
            <div v-if="autosaveListBusy" class="t-muted" style="font-size:12.5px">Loading…</div>
            <div v-else-if="!autosaveList.length" class="t-muted" style="font-size:12.5px">
              No autosaves on disk yet. They start appearing after the first edit.
            </div>
            <ul v-else style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:6px">
              <li
                v-for="entry in autosaveList"
                :key="entry.path"
                style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border, #ddd);border-radius:6px;font-size:13px"
              >
                <div style="flex:1;min-width:0">
                  <div><b>{{ entry.title || "Untitled" }}</b> <span class="t-muted">— {{ generationLabel(entry.generation) }}</span></div>
                  <div class="t-muted" style="font-size:12px">{{ autosaveLabel(entry.savedAt) }}</div>
                </div>
                <Button label="Restore" @click="restoreFromAutosave(entry)" />
              </li>
            </ul>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Snapshot</div>
          <p class="t-muted" style="font-size:12.5px;margin:0 0 14px;line-height:1.55">
            Your work auto-saves to this device's local storage on every change. To survive a browser reset
            or move between machines, export a JSON snapshot — it includes every chapter body, every character, the trash bin, and your cast assignments.
          </p>
          <div style="display:grid;grid-template-columns:140px 1fr;gap:10px 14px;font-size:13px;align-items:center;margin-bottom:12px">
            <span class="t-muted">Stored locally</span>
            <span><b>justwrite:project</b> + sibling keys in <code>IndexedDB</code></span>
            <span class="t-muted">Last backup</span>
            <span>{{ lastBackupLabel }}</span>
            <span class="t-muted">Platform save</span>
            <span>{{ hasNativeSave ? "Native file dialog (Tauri)" : "Browser download" }}</span>
          </div>
          <div v-if="backupError" class="banner danger" style="margin-bottom:10px">{{ backupError }}</div>
          <div v-if="importMessage" class="banner success" style="margin-bottom:10px">{{ importMessage }}</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <Button :label="backupBusy ? 'Exporting…' : 'Export backup…'" severity="primary" :disabled="backupBusy" @click="exportBackup">
              <template #icon><Icon name="Export" :size="13" /></template>
            </Button>
            <label class="btn">
              <Icon name="Folder" :size="13" />
              Import backup…
              <input type="file" accept="application/json,.json" style="display:none" @change="onImportFile" />
            </label>
          </div>
        </div>

        <div class="card danger-card">
          <div class="card-title" style="color: var(--danger-ink)">Danger zone</div>
          <p class="t-muted" style="font-size:12.5px;margin:0 0 12px;line-height:1.55">
            Wipes every <code>justwrite:*</code> key from IndexedDB — project, history, AI providers, voice cast, sessions — and reloads with the demo seed. Take a backup first.
          </p>
          <Button label="Reset workspace" severity="danger" @click="resetWorkspace">
            <template #icon><Icon name="Alert" :size="13" /></template>
          </Button>
        </div>
      </div>

      <!-- ── DEBUG ─────────────────────────────────── -->
      <div v-else-if="active === 'debug'" style="display:flex;flex-direction:column;gap:14px">
        <div class="card">
          <div class="card-title">Debug tools</div>
          <p style="font-size:12.5px;color:var(--muted);margin:0 0 12px;line-height:1.5">
            Internal lab views for testing pipelines and inspecting state. Hidden from the sidebar — reach them from here.
          </p>
          <div class="debug-tools">
            <router-link
              v-for="t in DEBUG_TOOLS"
              :key="t.id"
              :to="t.route"
              class="debug-tile"
            >
              <span class="debug-tile-icon"><Icon :name="t.icon" :size="18" /></span>
              <span class="debug-tile-body">
                <b>{{ t.name }}</b>
                <span class="t-muted">{{ t.description }}</span>
                <code class="debug-tile-route">#{{ t.route }}</code>
              </span>
              <Icon name="ChevRight" :size="14" />
            </router-link>
          </div>
        </div>
      </div>

      <!-- ── ABOUT ─────────────────────────────────── -->
      <div v-else-if="active === 'about'" style="display:flex;flex-direction:column;gap:14px">
        <div class="card">
          <div class="card-title">JustWrite</div>
          <p style="font-size:13px;margin:0 0 12px;line-height:1.6">
            A local-first writing studio for novels — chapters, cast, world, and audio rendering, all stored on your machine.
          </p>
          <div style="display:grid;grid-template-columns:160px 1fr;gap:8px 14px;font-size:13px">
            <span class="t-muted">Runtime</span><span>{{ platformLabel }}</span>
            <span class="t-muted">Renderer</span><span>Vue 3 + Pinia</span>
            <span class="t-muted">Image storage</span><span>{{ hasNativeImages ? "Native file system" : "IndexedDB data URLs" }}</span>
          </div>
        </div>

        <div class="card">
          <div class="card-title">This workspace</div>
          <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:14px">
            <div class="stat-tile">
              <div class="stat-num">{{ stats.chapters }}</div>
              <div class="stat-label">Chapters</div>
            </div>
            <div class="stat-tile">
              <div class="stat-num">{{ stats.characters }}</div>
              <div class="stat-label">Characters</div>
            </div>
            <div class="stat-tile">
              <div class="stat-num">{{ stats.locations }}</div>
              <div class="stat-label">Locations</div>
            </div>
            <div class="stat-tile">
              <div class="stat-num">{{ stats.objects }}</div>
              <div class="stat-label">Objects</div>
            </div>
            <div class="stat-tile">
              <div class="stat-num">{{ stats.worldbuilding }}</div>
              <div class="stat-label">Worldbuilding</div>
            </div>
            <div class="stat-tile">
              <div class="stat-num">{{ stats.trashTotal }}</div>
              <div class="stat-label">In trash</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Keyboard shortcuts</div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:8px 18px;font-size:12.5px">
            <kbd class="kbd-pill">⌘F</kbd><span>Focus search</span>
            <kbd class="kbd-pill">⌘\</kbd><span>Toggle sidebar</span>
            <kbd class="kbd-pill">⌘Z</kbd><span>Undo (outside the rich editor)</span>
            <kbd class="kbd-pill">⌘⇧Z / ⌘Y</kbd><span>Redo</span>
          </div>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>

<style scoped>
.cover-frame {
  width: 140px;
  height: 210px;
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
.btn.disabled { opacity: 0.55; pointer-events: none; }
.btn input[type="file"] { display: none; }

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
  color: white;
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

/* UI size segmented control (Typography → Size) */
.size-row { display: flex; align-items: center; gap: 12px; margin-top: 14px; flex-wrap: wrap; }
.size-seg {
  display: inline-flex; flex: 1; min-width: 280px;
  padding: 2px; gap: 2px;
  border: 1px solid var(--border); border-radius: 9px; background: var(--surface-2);
}
.size-seg button {
  flex: 1;
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  padding: 6px 4px; border: 0; border-radius: 7px;
  background: transparent; color: var(--ink-2); cursor: pointer;
}
.size-seg button:hover { background: var(--surface-3); color: var(--ink); }
.size-seg button.active {
  background: var(--surface); color: var(--accent-ink);
  box-shadow: 0 0 0 1px var(--border), 0 1px 2px rgba(0, 0, 0, .04);
}
.size-seg button b { font-size: 12px; }
.size-seg button span { font-size: 10px; color: var(--muted); }
.size-seg button.active span { color: var(--accent-ink); opacity: .8; }
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
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.04);
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
  box-shadow: 0 4px 12px -4px rgba(0, 0, 0, 0.12);
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
.appear-preview[data-layout="page"] .ap-prose::first-letter {
  font-family: var(--font-serif); font-weight: 500;
  font-size: 2.4em; line-height: 0.82;
  float: left; margin: 0.04em 0.08em -0.06em 0;
  color: var(--accent);
}
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

/* wb-toolbar / wb-search reused from WorldbuildingView pattern */
.wb-toolbar { display: flex; align-items: center; gap: 10px; }
.wb-search { position: relative; flex: 1; max-width: 360px; }
.wb-search-icon {
  position: absolute; left: 10px; top: 50%;
  transform: translateY(-50%);
  color: var(--muted); pointer-events: none;
}
.wb-search-input { width: 100%; padding-left: 30px !important; }
</style>
