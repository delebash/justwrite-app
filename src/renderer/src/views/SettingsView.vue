<script setup>
import { ref, computed, watch, watchEffect } from "vue";
import { useAiStore } from "../stores/ai.js";
import { useProjectStore } from "../stores/project.js";
import { useStudioStore } from "../stores/studio.js";
import { useUiStore } from "../stores/ui.js";
import { saveImage, urlFor, hasNativeImages } from "../services/imageStore.js";
import { promptDialog, confirmDialog } from "../services/dialog.js";
import { getItem, setItem, clearPrefix, flushPending } from "../services/storage.js";
import { indexStatus } from "../services/rag/indexer.js";
import { buildVoiceFingerprint } from "../services/voiceFingerprint.js";
import { pushToast } from "../services/toastBridge.js";
import PaneHeader from "../components/PaneHeader.vue";
import Icon from "../components/Icon.vue";
import SettingsProviderForm from "./SettingsProviderForm.vue";
import StatPill from "../components/StatPill.vue";
import RenderPresetsCard from "../components/RenderPresetsCard.vue";
import Combobox from "../components/Combobox.vue";
import JwInput from "@renderer/components/ui/JwInput.vue";
import JwTextarea from "@renderer/components/ui/JwTextarea.vue";
import JwCheckbox from "@renderer/components/ui/JwCheckbox.vue";
import JwNumber from "@renderer/components/ui/JwNumber.vue";
import JwSelect from "@renderer/components/ui/JwSelect.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";
import JwColorPicker from "@renderer/components/ui/JwColorPicker.vue";
import {
  ACCENT_PRESETS, GOLD_PRESETS, FUNCTIONAL_PRESETS, PAIRINGS, SURFACE_TINTS, PAPER_TINTS,
  THEME_PRESETS, UI_FONTS, DISPLAY_FONTS, INK_PALETTES, UI_SCALES,
  SIDEBAR_HEADING_STYLES, SIDEBAR_HEADING_SIZES,
  NAV_ITEM_STYLES, NAV_ITEM_SIZES,
  BUTTON_RADIUS_OPTIONS, BUTTON_DENSITY_OPTIONS, BUTTON_LABEL_CASE_OPTIONS,
} from "../services/appearance.js";
import { AVAILABLE_LOCALES, setLocale as setI18nLocale } from "../i18n/index.js";
import { useI18n } from "vue-i18n";
import { useModelList } from "../composables/useModelList.js";

import JwTag from "@renderer/components/ui/JwTag.vue";
import JwTable from "@renderer/components/ui/JwTable.vue";
import JwSegmented from "@renderer/components/ui/JwSegmented.vue";

const props = defineProps({ section: { type: String, default: "" } });

const ai = useAiStore();
const project = useProjectStore();
const studio = useStudioStore();
const ui = useUiStore();

async function confirmClearSpeakerCorrections() {
  const n = studio.corrections?.length || 0;
  if (!n) return;
  const yes = await confirmDialog({
    title: `Clear ${n} speaker correction${n === 1 ? "" : "s"}?`,
    body: "Future Re-analyze runs will stop using your past speaker overrides as worked examples. Existing scripts (and the lines you've already fixed) are not touched — only the learning memory is wiped.",
    confirmLabel: "Clear corrections",
    danger: true,
  });
  if (!yes) return;
  studio.clearCorrections();
  pushToast({ message: `Cleared ${n} speaker correction${n === 1 ? "" : "s"}.` });
}

// ── Voice canon ────────────────────────────────────────────────────
// Chapter picker for the writer's voice canon. Selected chapters
// are passed to buildVoiceFingerprint which generates the sample +
// style summary writerAI injects into every prose generation.
const canonChapterOptions = computed(() =>
  project.allChapters
    .filter((c) => (c.words || 0) > 50)
    .map((c) => ({ id: c.id, num: c.num, title: c.title, words: c.words || 0 })),
);
function canonHas(id) {
  return (project.voiceCanonChapterIds || []).includes(id);
}
function toggleCanon(id) {
  project.toggleVoiceCanonChapter(id);
}
function clearCanon() {
  project.clearVoiceCanon();
}
const voicePreview = computed(() => buildVoiceFingerprint(project, { targetWords: 600 }));

// Per-feature LLM pin UI. Two selects per feature: provider AND model,
// independent of the global default. Model list is fetched live from
// the chosen provider's /v1/models endpoint (cached per-provider by
// useModelList); if the provider isn't reachable, the model list is
// empty and the user falls back to the provider's saved chatModel.
const { modelsFor: featureModelsFor, refreshModels: refreshFeatureModels, ensureModels: ensureFeatureModels } = useModelList();

const AI_FEATURES = [
  { key: "chat",        label: "Manuscript chat", hint: "\"Ask the book\" RAG question/answer mode in the chat panel." },
  { key: "critique",    label: "Critique",        hint: "The Critique modal — line-level notes (flags / suggestions / observations) and the structural pass (tension, hook, pacing, ending)." },
  { key: "entitySweep", label: "Entity sweep",    hint: "Scans chapters for new characters / locations / objects." },
  { key: "writerAI",    label: "Writer actions",  hint: "The AI dropdown in each scene's strip — Rewrite, Expand, Tighten, Continue, Describe, plus all Line edits." },
  { key: "brainstorm",  label: "Brainstorm",      hint: "The Brainstorm view — name / title / freeform idea generation with thumbs-up steering." },
  { key: "briefing",    label: "Resume briefing", hint: "Generates the Home \"Previously on your novel\" recap card." },
  { key: "recap",       label: "Session recap",   hint: "End-of-day \"Wrap up session\" recap + open-thread suggestions." },
  { key: "foreshadowing", label: "Foreshadowing scan", hint: "Whole-book scan for setups that may not have paid off." },
  { key: "readerKnowledge", label: "Reader knowledge", hint: "Tracks dramatic irony — what the reader knows vs. what the POV character knows, chapter by chapter." },
  { key: "voiceDrift",      label: "Voice drift explainer", hint: "Diagnoses what shifted between an outlier chapter and the writer's baseline voice in the Analysis dashboard." },
  { key: "unstuck",         label: "Unstuck moves",   hint: "The AI dropdown's \"Unstuck — five ways out\" diagnostic that proposes goal shift / interrupt / setting / reveal / time cut." },
  { key: "sensory",         label: "Sensory research", hint: "The AI dropdown's \"Research feel…\" modal — structured sensory pack for a selected subject." },
  { key: "characterAudit",  label: "Character audit",  hint: "Per-character consistency audit (profile + their scenes → flagged actions) on the Characters view." },
  { key: "reverseOutline",  label: "Reverse outline",  hint: "Reads the whole draft and produces the act structure the book actually has — plot points, act breaks, per-chapter beats." },
  { key: "beatSheet",       label: "Beat sheet overlay", hint: "Maps your draft to Save the Cat, Hero's Journey, or 7-Point Story Structure beats." },
  { key: "plotHoles",       label: "Plot-hole audit",  hint: "Whole-book continuity scan for contradictions, timeline issues, and character-knowledge errors." },
  { key: "characterChat",   label: "Character chat",   hint: "The chat panel's \"Talk to a character\" mode — first-person, in-voice answers from your cast." },
  { key: "relationshipArc", label: "Relationship arc", hint: "Chapter-by-chapter warmth / tension / power tracking for a pair of characters." },
  { key: "marketingPack",   label: "Marketing pack",   hint: "Logline, back-cover blurbs, synopsis, and elevator pitch for querying and pitching." },
  { key: "multiReader",     label: "Multi-reader panel", hint: "Four distinct reader personas (genre reader / literary critic / agent intern / book-club reader) react to a chapter in parallel." },
  { key: "smartCast",       label: "Studio · Smart-assign", hint: "Studio → Cast tab. Matches each character to a TTS voice based on role and tone." },
  { key: "speakerAnalysis", label: "Studio · Speaker analysis", hint: "Studio → Script tab. Tags each paragraph with its speaker (narrator vs character) for the audiobook render." },
];
const INHERIT = "__inherit__";

// Per-feature production configs are managed through Speaker Lab (and,
// eventually, Smart-Assign Lab). Each feature has a list of saved named
// configs + an active pointer in the ai store. Default (= tier-resolved
// built-ins) is implicit, represented by activeConfig[key] === null.
// This list is just the Settings card metadata — the lab UI is the
// authoritative editing surface; Settings shows what's active and lets
// you switch without leaving.
const PROMOTABLE_FEATURES = [
  {
    key: "speakerAnalysis",
    label: "Studio · Speaker analysis",
    labPath: "/speaker-lab",
    labLabel: "Speaker Lab",
    labReady: true,
  },
  {
    key: "smartCast",
    label: "Studio · Smart-assign",
    labPath: "/speaker-lab",       // placeholder until Smart-Assign Lab ships
    labLabel: "Smart-Assign Lab",
    labReady: false,
  },
];

// Each feature has one "production-ready" mode (e.g. speakerAnalysis →
// inline, smartCast → cast). The active production preset lives in
// that mode's preset list inside ai.labPresets.
const PRODUCTION_MODE_OF = { speakerAnalysis: "inline", smartCast: "cast" };

function activeConfigName(key) {
  return ai.activeProduction?.[key] || "Default";
}
function activeConfigEntry(key) {
  const name = ai.activeProduction?.[key];
  if (!name) return null;
  const modeKey = PRODUCTION_MODE_OF[key];
  const list = ai.labPresets?.[key]?.[modeKey] || [];
  return list.find((c) => c.name === name) || null;
}
function configOptionsFor(key) {
  const opts = [{ value: "Default", label: "Default (tier-resolved)" }];
  const modeKey = PRODUCTION_MODE_OF[key];
  for (const c of ai.labPresets?.[key]?.[modeKey] || []) {
    opts.push({ value: c.name, label: c.name });
  }
  return opts;
}
function setActiveConfigByPickerValue(key, value) {
  ai.setActiveProduction(key, value === "Default" ? null : value);
}
function truncatePrompt(s, n = 140) {
  const v = String(s || "").trim();
  return v.length > n ? v.slice(0, n) + "…" : v;
}
function fmtAgo(ts) {
  if (!ts) return "";
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Provider select options — "Inherit default" plus every configured
// provider. The model column only enables once a specific provider is
// chosen (inherit means "use the global default's provider AND model").
const featureProviderOptions = computed(() => {
  const out = [{ value: INHERIT, label: `Inherit default · ${ai.llmProvider?.name || "—"}` }];
  for (const p of ai.readyLlmProviders) out.push({ value: p.id, label: p.name });
  return out;
});

function featureProviderValue(key) {
  return ai.featurePins?.[key]?.providerId || INHERIT;
}
function featureModelValue(key) {
  return ai.featurePins?.[key]?.model || "";
}

function setFeatureProvider(key, providerId) {
  if (!providerId || providerId === INHERIT) { ai.setFeaturePin(key, null); return; }
  // New pin: default the model to the provider's saved chatModel so the
  // pin is immediately usable. User can refine via the model select.
  const provider = ai.providerById(providerId);
  ai.setFeaturePin(key, { providerId, model: provider?.chatModel || "" });
  ensureFeatureModels(providerId); // fetches only when the cache is empty
}
function setFeatureModel(key, model) {
  const pin = ai.featurePins?.[key];
  if (!pin?.providerId) return;
  ai.setFeaturePin(key, { providerId: pin.providerId, model: model || pin.model });
}

// Model options for one feature row. Empty list when the provider is
// inheriting; otherwise the provider's saved chatModel comes first
// (always selectable even if the live fetch failed), then any models
// the live fetch surfaced. De-duplicated by id.
function featureModelOptions(key) {
  const providerId = featureProviderValue(key);
  if (providerId === INHERIT) return [];
  const provider = ai.providerById(providerId);
  const list = featureModelsFor(providerId);
  const seen = new Set();
  const out = [];
  if (provider?.chatModel) {
    out.push({ value: provider.chatModel, label: `${provider.chatModel} (configured default)` });
    seen.add(provider.chatModel);
  }
  for (const m of list) {
    if (m.id && !seen.has(m.id)) { out.push({ value: m.id, label: m.id }); seen.add(m.id); }
  }
  return out;
}

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
  { id: "audio",      label: t("settings.sections.audio") },
  { id: "usage",      label: t("settings.sections.usage") },
  { id: "appearance", label: t("settings.sections.appearance") },
  { id: "backups",    label: t("settings.sections.backups") },
  { id: "debug",      label: t("settings.sections.debug") },
  { id: "about",      label: t("settings.sections.about") },
]);

// Debug tools surfaced in the Debug section. Add new entries here as more
// internal lab/inspector views are built.
const DEBUG_TOOLS = [
  {
    id: "speaker-lab",
    name: "Speaker Lab",
    description: "Test entity extraction & quote attribution against any OpenAI-compatible LLM. Side-by-side runs, two-stage pipelines, live streaming, prompt editing, saved presets.",
    route: "/speaker-lab",
    icon: "Sparkle",
  },
  {
    id: "writer-lab",
    name: "Writer Lab — model compare",
    description: "Test writerAI actions, line edits, and analysis pipelines against any OpenAI-compatible LLM. Up to 4 columns running in parallel for side-by-side model comparison. Same base controls as the user-facing Writer Lab.",
    route: "/debug/writer-lab",
    icon: "Sparkle",
  },
];

const active = ref(props.section || "project");
watch(() => props.section, (s) => { if (s) active.value = s; });

// Lazily fetch model lists for any features that already have a pinned
// provider when the AI section opens (so the model select isn't blank
// on first render even though we haven't refreshed yet).
watchEffect(() => {
  if (active.value !== "audio") return;
  for (const f of AI_FEATURES) {
    const pid = ai.featurePins?.[f.key]?.providerId;
    if (pid) ensureFeatureModels(pid);
  }
});

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

// Wraps ai.setDefaultEmbedding so changing providers mid-session doesn't
// silently strand the existing RAG index. If the active project has an
// index built with a different embedding model than the new provider's
// model, surface a heads-up — the user can either Rebuild from the chat
// panel (re-embeds everything against the new model) or switch back.
function chooseDefaultEmbedding(id) {
  const prev = ai.defaultEmbeddingId;
  ai.setDefaultEmbedding(id);
  if (id === prev) return;
  const newProvider = ai.providerById(id);
  const newModel = newProvider?.embeddingModel || "";
  const status = indexStatus();
  if (status.exists && status.entryCount > 0 && newModel && status.model && status.model !== newModel) {
    pushToast({
      message: `Embedding model changed. Your manuscript index was built with “${status.model}” — it will keep working with the old model. Hit Rebuild in the chat panel to re-embed against “${newModel}”.`,
    }, 9000);
  }
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

// ── Segmented-control option arrays ───────────────────────────────────
// Each maps existing constants to { value, label, sublabel? } so JwSegmented
// can consume them without needing to know internal key shapes.
const UI_SCALE_OPTIONS = UI_SCALES.map((s) => ({
  value: s.value, label: s.label, sublabel: `${Math.round(s.value * 100)}%`,
}));
const SH_STYLE_OPTIONS = SIDEBAR_HEADING_STYLE_LIST.map((s) => ({ value: s.key, label: s.label }));
const SH_SIZE_OPTIONS  = SIDEBAR_HEADING_SIZES.map((s) => ({ value: s.value, label: s.label }));
const NAV_STYLE_OPTIONS = NAV_ITEM_STYLE_LIST.map((s) => ({ value: s.key, label: s.label }));
const NAV_SIZE_OPTIONS  = NAV_ITEM_SIZES.map((s) => ({ value: s.value, label: s.label }));
const FONT_SIZE_OPTIONS = EDITOR_FONT_SIZES.map((s) => ({ value: s.value, label: s.label, sublabel: s.px }));
const LINE_OPTIONS  = EDITOR_LINE_OPTIONS.map((v) => ({ value: v, label: String(v) }));
const PARA_OPTIONS  = EDITOR_PARA_OPTIONS.map((v) => ({ value: v, label: v === 0 ? "0" : `${v}em` }));
const INDENT_OPTIONS = [
  { value: true,  label: "Indent" },
  { value: false, label: "No indent" },
];

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
const recentGlobalQuery = ref("");
function onRecentInput(e) {
  recentGlobalQuery.value = e.target.value;
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
// Parse the hue number out of an oklch() string emitted by JwColorPicker,
// since worldbuilding categories store hue as a bare number (the render
// code reassembles oklch with its own clamped L and C).
function parseHueFromOklch(s) {
  const m = String(s || "").match(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/);
  return m ? Math.round(parseFloat(m[1])) % 360 : 200;
}
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

// ── AI Usage table column defs ──────────────────────────────────────
const byFeatureColumns = [
  { accessorKey: "key",              header: "Feature",    sortable: true, headerStyle: "min-width:160px", cellStyle: "min-width:160px" },
  { accessorKey: "calls",            header: "Calls",      sortable: true, headerStyle: "text-align:right;width:70px", cellStyle: "text-align:right;width:70px" },
  { accessorKey: "promptTokens",     header: "Prompt",     sortable: true, headerStyle: "text-align:right;width:90px", cellStyle: "text-align:right;width:90px" },
  { accessorKey: "completionTokens", header: "Completion", sortable: true, headerStyle: "text-align:right;width:100px", cellStyle: "text-align:right;width:100px" },
  { accessorKey: "cost",             header: "Cost",       sortable: true, headerStyle: "text-align:right;width:80px", cellStyle: "text-align:right;width:80px" },
];
const byProviderColumns = [
  { accessorKey: "key",              header: "Provider",   sortable: true, headerStyle: "min-width:160px", cellStyle: "min-width:160px" },
  { accessorKey: "calls",            header: "Calls",      sortable: true, headerStyle: "text-align:right;width:70px", cellStyle: "text-align:right;width:70px" },
  { accessorKey: "promptTokens",     header: "Prompt",     sortable: true, headerStyle: "text-align:right;width:90px", cellStyle: "text-align:right;width:90px" },
  { accessorKey: "completionTokens", header: "Completion", sortable: true, headerStyle: "text-align:right;width:100px", cellStyle: "text-align:right;width:100px" },
  { accessorKey: "cost",             header: "Cost",       sortable: true, headerStyle: "text-align:right;width:80px", cellStyle: "text-align:right;width:80px" },
];
const recentColumns = [
  { accessorKey: "at",          header: "Time",    sortable: true, headerStyle: "width:110px",    cellStyle: "width:110px" },
  { accessorKey: "feature",     header: "Feature", sortable: true, headerStyle: "min-width:120px", cellStyle: "min-width:120px" },
  { accessorKey: "model",       header: "Model",   sortable: true, headerStyle: "min-width:130px", cellStyle: "min-width:130px" },
  { accessorKey: "totalTokens", header: "Tokens",  sortable: true, headerStyle: "text-align:right;width:80px", cellStyle: "text-align:right;width:80px" },
  { accessorKey: "cost",        header: "Cost",    sortable: true, headerStyle: "text-align:right;width:80px", cellStyle: "text-align:right;width:80px" },
];
</script>

<template>
  <PaneHeader :eyebrow="$t('settings.eyebrow')" :title="$t('settings.title')" />
  <div class="pane-card">
    <div class="scrollarea" style="padding:22px">
    <p class="set-desc">
      <strong>Settings</strong> is divided into sections — <strong>Project</strong> (metadata,
      goals, statuses, deadlines), <strong>AI &amp; Audio engines</strong> (provider setup and
      per-feature routing), <strong>Appearance</strong> (themes, fonts, colours, density),
      <strong>Backups</strong> (autosave path and manual snapshots), and a
      <strong>Danger zone</strong> for resetting the workspace. Nothing here touches your
      manuscript prose.
    </p>
    <div class="settings-layout" style="display:grid;grid-template-columns:220px minmax(0,1fr);gap:22px;max-width:1100px">
      <!-- Section nav -->
      <nav style="display:flex;flex-direction:column;gap:2px">
        <button v-for="s in SECTIONS" :key="s.id"
          class="nav-item" :class="{ active: active === s.id }"
          style="grid-template-columns:1fr"
          @click="active = s.id">{{ s.label }}</button>
      </nav>

      <!-- ── PROJECT ─────────────────────────────── -->
      <div v-if="active === 'project'" style="display:flex;flex-direction:column;gap:14px;min-width:0">
        <div class="card">
          <div class="card-title">{{ $t('settings.project.cardTitle') }}</div>
          <p class="t-muted" style="font-size:12px;margin:0 0 14px;line-height:1.55">
            Edits flow through the same undo/redo history as your manuscript — ⌘Z restores the previous value.
          </p>
          <div style="display:grid;grid-template-columns:160px minmax(0,1fr);gap:10px 14px;font-size:13px;align-items:center">
            <span class="t-muted">{{ $t('settings.project.fieldTitle') }}</span>
            <JwInput :model-value="project.project.title"
              @update:model-value="(v) => setMeta('title', v)" placeholder="Working title" />
            <span class="t-muted">{{ $t('settings.project.fieldAuthor') }}</span>
            <JwInput :model-value="project.project.author"
              @update:model-value="(v) => setMeta('author', v)" placeholder="Pen name or legal name" />
            <span class="t-muted">{{ $t('settings.project.fieldSubtitle') }}</span>
            <JwInput :model-value="project.project.subtitle"
              @update:model-value="(v) => setMeta('subtitle', v)" placeholder="Optional" />
            <span class="t-muted">{{ $t('settings.project.fieldGenre') }}</span>
            <JwInput :model-value="project.project.genre"
              @update:model-value="(v) => setMeta('genre', v)" placeholder="Literary, mystery, sci-fi…" />
            <span class="t-muted">{{ $t('settings.project.fieldStarted') }}</span>
            <JwInput :model-value="project.project.startedOn"
              @update:model-value="(v) => setMeta('startedOn', v)" placeholder="e.g. March 11, 2026" />
            <span class="t-muted">{{ $t('settings.project.fieldDeadline') }}</span>
            <JwInput :model-value="project.project.deadline"
              @update:model-value="(v) => setMeta('deadline', v)" placeholder="e.g. December 1, 2026" />
            <span class="t-muted" style="align-self:start;padding-top:6px">{{ $t('settings.project.fieldPremise') }}</span>
            <JwTextarea auto-resize rows="3" :model-value="project.project.premise"
              @update:model-value="(v) => setMeta('premise', v)"
              placeholder="One- or two-sentence pitch. Used on the Home dashboard and exports." />
          </div>
        </div>
        <div class="card">
          <div class="card-title">{{ $t('settings.goals.cardTitle') }}</div>
          <div style="display:grid;grid-template-columns:160px minmax(0,1fr);gap:10px 14px;font-size:13px;align-items:center">
            <span class="t-muted" style="align-self:start;padding-top:8px">{{ $t('settings.goals.wordGoal') }}</span>
            <div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0">
              <JwNumber :min="0" :step="500" style="max-width:160px"
                :model-value="project.project.wordsGoal"
                @update:model-value="(v) => setMetaNumber('wordsGoal', v)" />
              <span class="t-muted" style="font-size:11.5px">{{ $t('settings.goals.wordGoalHint') }}</span>
            </div>
            <span class="t-muted" style="align-self:start;padding-top:8px">{{ $t('settings.goals.dailyTarget') }}</span>
            <div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0">
              <JwNumber :min="0" :step="50" style="max-width:160px"
                :model-value="project.project.dailyTarget ?? 1200"
                @update:model-value="(v) => setMetaNumber('dailyTarget', v)" />
              <span class="t-muted" style="font-size:11.5px">{{ $t('settings.goals.dailyTargetHint') }}</span>
            </div>
          </div>
        </div>

        <!-- ── Preferences (user-level, not project-specific) ─── -->
        <div class="card">
          <div class="card-title">{{ $t('settings.preferences.cardTitle') }}</div>
          <div style="display:grid;grid-template-columns:160px minmax(0,1fr);gap:10px 14px;font-size:13px;align-items:center">
            <span class="t-muted" style="align-self:start;padding-top:6px">{{ $t("settings.language.label") }}</span>
            <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
              <JwSelect
                style="max-width:240px"
                :model-value="ui.locale || activeI18nLocale"
                @update:model-value="onLocaleChange"
                :options="LOCALE_OPTIONS"
                option-label="label"
                option-value="value"
              />
              <span class="t-muted" style="font-size:11.5px">{{ $t("settings.language.hint") }}</span>
            </div>
          </div>
        </div>

        <!-- ── Statuses ─────────────────────────────────────── -->
        <div class="card">
          <div class="card-title">{{ $t('settings.statuses.cardTitle') }}</div>
          <p class="t-muted" style="font-size:12.5px;margin:0 0 14px;line-height:1.55">
            A shared palette used by chapters, architecture, the story-world entities, and narrative strands. Each status shows in its color beside items in the sidebar. Rename, recolor, or remove freely — deleting one leaves items that used it unset.
          </p>
          <div style="display:flex;flex-direction:column;gap:8px">
            <div v-for="s in project.statuses" :key="s.id" style="display:flex;align-items:center;gap:10px">
              <div style="position:relative">
                <button type="button" v-tooltip.bottom="'Change color'"
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
              <JwInput style="max-width:220px" :model-value="s.label"
                @update:model-value="(v) => renameStatus(s.id, v)" placeholder="Status name" />
              <span :style="`font-size:11px;font-weight:600;text-transform:lowercase;color:${s.color}`">{{ s.label }}</span>
              <JwButton intent="ghost" size="small" style="margin-left:auto" v-tooltip.bottom="'Delete status'" @click="deleteStatus(s)">
                <template #icon><Icon name="Trash" :size="13" /></template>
              </JwButton>
            </div>
            <div v-if="!project.statuses.length" class="t-muted" style="font-size:12.5px;font-style:italic">No statuses yet — add one below.</div>
          </div>
          <JwButton label="Add status" intent="ghost" style="margin-top:12px" @click="addStatus">
            <template #icon><Icon name="Plus" :size="13" /></template>
          </JwButton>
        </div>

        <!-- ── Worldbuilding categories ─────────────────────── -->
        <div class="card">
          <div class="card-title">{{ $t('settings.wbCategories.cardTitle') }}</div>
          <p class="t-muted" style="font-size:12.5px;margin:0 0 14px;line-height:1.55">
            Group your worldbuilding articles — these drive the sidebar sections and the category picker. Pick a color for each. Deleting one moves its articles into another category.
          </p>
          <div style="display:flex;flex-direction:column;gap:8px">
            <div v-for="c in project.worldbuildingCategories" :key="c.id" style="display:flex;align-items:center;gap:10px">
              <JwInput style="max-width:220px" :model-value="c.label"
                @update:model-value="(v) => renameCategory(c.id, v)" placeholder="Category name" />
              <JwColorPicker
                :model-value="`oklch(0.62 0.13 ${c.hue})`"
                aria-label="Category color"
                @update:model-value="(v) => recolorCategory(c.id, parseHueFromOklch(v))" />
              <JwButton intent="ghost" size="small" style="margin-left:auto" v-tooltip.bottom="'Delete category'" @click="deleteCategory(c)">
                <template #icon><Icon name="Trash" :size="13" /></template>
              </JwButton>
            </div>
            <div v-if="!project.worldbuildingCategories.length" class="t-muted" style="font-size:12.5px;font-style:italic">No categories yet — add one below.</div>
          </div>
          <JwButton label="Add category" intent="ghost" style="margin-top:12px" @click="addCategory">
            <template #icon><Icon name="Plus" :size="13" /></template>
          </JwButton>
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
                  <JwInput style="max-width:280px" :model-value="t.label"
                    @update:model-value="(v) => project.renameTagVocab(kind.key, t.id, v)"
                    :placeholder="$t('settings.tagVocabularies.placeholder')" />
                  <JwButton intent="ghost" size="small" style="margin-left:auto"
                    v-tooltip.bottom="$t('common.remove')"
                    @click="project.removeTagVocab(kind.key, t.id)">
                    <template #icon><Icon name="Trash" :size="13" /></template>
                  </JwButton>
                </div>
                <div v-if="!project.tagVocabularies[kind.key].length"
                  class="t-muted" style="font-size:12.5px;font-style:italic">
                  {{ $t('settings.tagVocabularies.empty') }}
                </div>
              </div>
              <JwButton :label="$t('settings.tagVocabularies.addTag')" intent="ghost"
                size="small" style="margin-top:8px"
                @click="project.addTagVocab(kind.key)">
                <template #icon><Icon name="Plus" :size="13" /></template>
              </JwButton>
            </div>
          </div>
        </div>

        <!-- ── Cover image ──────────────────────────────────── -->
        <div class="card">
          <div class="card-title">{{ $t('settings.coverImage.cardTitle') }}</div>
          <p class="t-muted" style="font-size:12.5px;margin:0 0 14px;line-height:1.55">
            Shows up as the book cover in EPUB and PDF exports. Recommended size: 1600 × 2400 px (2:3 ratio), JPEG or PNG.
          </p>

          <div style="display:grid;grid-template-columns:minmax(0,140px) minmax(0,1fr);gap:18px;align-items:start">
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
                <JwButton as="label" intent="primary" :disabled="coverUploading">
                  <Icon name="Image" :size="13" />
                  {{ coverUploading ? "Uploading…" : (project.project.coverImage ? "Replace…" : "Choose image…") }}
                  <input type="file" accept="image/*" style="display:none" @change="onPickCover" :disabled="coverUploading" />
                </JwButton>
                <JwButton v-if="project.project.coverImage" label="Remove" intent="ghost" @click="removeCover" />
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
      <div v-else-if="active === 'audio'" style="display:flex;flex-direction:column;gap:14px;min-width:0">
        <div class="card">
          <div class="card-title">{{ $t('settings.audio.defaultsCardTitle') }}</div>
          <div style="font-size:13px;color:var(--ink-2);margin-bottom:12px">
            Pick which provider handles writing assistance (LLM) and which handles audio (TTS). Both follow the OpenAI HTTP standard — anything that speaks it works here.
          </div>
          <div style="display:grid;grid-template-columns:160px minmax(0,1fr);gap:10px 14px;align-items:center;font-size:13px">
            <span class="t-muted">{{ $t('settings.audio.fieldDefaultLlm') }}</span>
            <Combobox
              :model-value="ai.defaultLlmId"
              @update:model-value="ai.setDefaultLlm"
              :items="ai.llmProviders"
              item-value="id" item-label="name"
              :searchable="false"
              placeholder="Pick a provider"
              chev-title="Choose default LLM provider" />
            <span class="t-muted">{{ $t('settings.audio.fieldDefaultTts') }}</span>
            <Combobox
              :model-value="ai.defaultTtsId"
              @update:model-value="ai.setDefaultTts"
              :items="ai.ttsProviders"
              item-value="id" item-label="name"
              :searchable="false"
              placeholder="Pick a provider"
              chev-title="Choose default TTS provider" />
            <span class="t-muted">{{ $t('settings.audio.fieldDefaultEmbedding') }}</span>
            <Combobox
              :model-value="ai.defaultEmbeddingId"
              @update:model-value="chooseDefaultEmbedding"
              :items="ai.embeddingProviders"
              item-value="id" item-label="name"
              :searchable="false"
              placeholder="Pick a provider"
              chev-title="Choose default embedding provider" />
            <span class="t-muted">{{ $t('settings.audio.fieldAutoRebuild') }}</span>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <JwCheckbox :model-value="ai.autoRebuildRagIndex"
                @update:model-value="ai.setAutoRebuildRagIndex" />
              <span style="color:var(--ink-2);font-size:12.5px;line-height:1.45">
                Embed new and changed scenes a minute after the last edit. Costs nothing on local embedding providers; cloud embeddings will accrue tokens.
              </span>
            </label>

            <span class="t-muted">Guess voice gender with LLM</span>
            <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer">
              <JwCheckbox :model-value="ai.useLlmVoiceGender"
                @update:model-value="ai.setUseLlmVoiceGender" style="margin-top:2px" />
              <span style="color:var(--ink-2);font-size:12.5px;line-height:1.45">
                After Studio fetches voices, any name the built-in dictionary doesn't recognise (Gianna, Axel, fantasy names) gets sent in one batch to your default LLM, which labels each as female / male / neutral. Smart-assign uses these to match characters to voices. Off by default — a no-network alternative is to click the <b>❓</b> chip in Studio's voice library and cycle to the right gender. Manual settings persist across re-fetches; only the truly unknown rows are ever sent to the LLM.
              </span>
            </label>
          </div>
        </div>

        <RenderPresetsCard />

        <div class="card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <div class="card-title" style="margin:0">{{ $t('settings.audio.providersCardTitle') }}</div>
            <span class="t-muted" style="font-size:12px">{{ ai.providers.length }} configured</span>
            <JwButton :label="$t('settings.audio.addProvider')" intent="primary" size="small" style="margin-left:auto" @click="startNew">
              <template #icon><Icon name="Plus" :size="12" /></template>
            </JwButton>
          </div>

          <div style="display:flex;flex-direction:column;gap:8px">
            <!-- New-provider edit row (only when adding) -->
            <SettingsProviderForm v-if="editing === 'new' && draft"
              :draft="draft" editing-key="new"
              @save="saveDraft" @cancel="cancelEdit" />

            <template v-for="p in ai.providers" :key="p.id">
              <!-- Read row -->
              <div v-if="editing !== p.id" style="display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;gap:14px;align-items:center;padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--surface)">
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
                <JwButton label="Test" intent="secondary" size="small" @click="pingProvider(p.id)" />
                <JwButton label="Edit" intent="primary" size="small" @click="startEdit(p)" />
              </div>

              <!-- Edit row -->
              <SettingsProviderForm v-else
                :draft="draft" :editing-key="editing"
                @save="saveDraft" @cancel="cancelEdit" />
            </template>
          </div>
        </div>

        <div class="card">
          <div class="card-title">{{ $t('settings.audio.routingCardTitle') }}</div>
          <p class="t-muted" style="font-size:12.5px;margin:0 0 14px;line-height:1.55">
            The AI layer acts as an aggregator: each feature can route to any configured provider and model independently. Pick "Inherit default" to fall back to the global Default LLM above. The model list is fetched live from the provider — it'll be empty until you save an API key (or for local providers, until the server is reachable).
          </p>
          <!-- Header row -->
          <div style="display:grid;grid-template-columns:minmax(180px,200px) minmax(140px,1fr) minmax(140px,1.4fr);gap:8px 14px;align-items:center;font-size:11px;font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);padding-bottom:6px;border-bottom:1px solid var(--border-soft)">
            <span>Feature</span>
            <span>Provider</span>
            <span>Model</span>
          </div>
          <div style="display:grid;grid-template-columns:minmax(180px,200px) minmax(140px,1fr) minmax(140px,1.4fr);gap:10px 14px;align-items:center;font-size:13px;margin-top:10px">
            <template v-for="f in AI_FEATURES" :key="f.key">
              <div>
                <div style="font-weight:500;color:var(--ink)">{{ f.label }}</div>
                <div class="t-muted" style="font-size:11.5px;margin-top:2px;line-height:1.4">{{ f.hint }}</div>
              </div>
              <JwSelect
                :model-value="featureProviderValue(f.key)"
                @update:model-value="(v) => setFeatureProvider(f.key, v)"
                :options="featureProviderOptions" />
              <div style="display:flex;align-items:center;gap:6px;min-width:0">
                <JwSelect
                  style="flex:1;min-width:0"
                  :model-value="featureModelValue(f.key)"
                  @update:model-value="(v) => setFeatureModel(f.key, v)"
                  :options="featureModelOptions(f.key)"
                  :disabled="featureProviderValue(f.key) === '__inherit__'"
                  :placeholder="featureProviderValue(f.key) === '__inherit__' ? 'Follows default' : 'Pick a model'" />
                <JwButton
                  intent="ghost" size="small"
                  v-tooltip.bottom="'Refresh model list from the provider'"
                  :disabled="featureProviderValue(f.key) === '__inherit__'"
                  @click="refreshFeatureModels(featureProviderValue(f.key))">
                  <template #icon><Icon name="Refresh" :size="12" /></template>
                </JwButton>
              </div>
            </template>
          </div>
        </div>

        <!-- Three-alternative streaming — opt-in cost control for the
             "always show 3 variations" mode. Off by default; the writer
             can also force variations per-call with shift-click on any
             AI dropdown item regardless of this toggle. -->
        <div class="card">
          <div class="card-title">Three-alternative streaming</div>
          <p class="t-muted" style="font-size:12.5px;margin:0 0 14px;line-height:1.55">
            When on, every <strong>Rewrite</strong>, <strong>Expand</strong>, <strong>Tighten</strong>,
            <strong>Continue</strong>, <strong>Describe</strong>, <strong>line edit</strong>, and
            <strong>Continue with direction</strong> runs as three parallel streams (varied
            temperature, more conservative ↔ more inventive). Pick the column that reads best;
            the other two are discarded. <strong>Off by default</strong> — variations mode triples
            token cost. Whether the toggle is on or off, <strong>shift-click any AI dropdown
            item</strong> to opt in to variations for that one call.
          </p>
          <label style="display:flex;gap:10px;align-items:flex-start;padding:8px;cursor:pointer;border-radius:6px"
                 :style="ui.showVariations ? 'background:var(--accent-soft)' : ''">
            <JwCheckbox
              :model-value="ui.showVariations"
              @update:model-value="ui.setShowVariations" />
            <span style="color:var(--ink-2);font-size:13px;line-height:1.45">
              <strong style="color:var(--ink)">Show 3 variations on every AI action.</strong><br />
              <span style="color:var(--muted);font-size:12px">
                Triples token cost on cloud providers. Free on local. The writer can still
                shift-click for one-off variations even when this is off.
              </span>
            </span>
          </label>
        </div>

        <!-- Production prompt configs. Each feature has a list of saved
             named configs + an active pointer. "Default" is the built-in
             tier-resolved entry, always available. The active config is
             what services actually use; switching it here takes effect
             immediately. Saving new configs is done in the lab. -->
        <div class="card">
          <div class="card-title">Production prompt configs</div>
          <p class="t-muted" style="font-size:12.5px;margin:0 0 14px;line-height:1.55">
            Each AI feature has a list of named production configs and a single <strong>active</strong>
            one. The active config is what production calls actually run against. <strong>Default</strong>
            is the built-in entry — it uses the tier-resolved prompts and settings for whatever model
            the feature is routed to. Switch active here, or open the feature's Lab to tune and save
            new configs.
          </p>
          <div style="display:flex;flex-direction:column;gap:10px">
            <div v-for="f in PROMOTABLE_FEATURES" :key="f.key"
                 style="padding:12px 14px;border:1px solid var(--border-soft);border-radius:8px;background:var(--surface)">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <div style="flex:1;min-width:140px">
                  <div style="font-weight:600;font-size:13px;color:var(--ink)">{{ f.label }}</div>
                  <div class="t-muted" style="font-size:11px;margin-top:2px">
                    Active: <b style="color:var(--accent-ink)">{{ activeConfigName(f.key) }}</b>
                    <span v-if="activeConfigEntry(f.key)?.source">
                      · from {{ activeConfigEntry(f.key).source }}
                    </span>
                    <span v-if="activeConfigEntry(f.key)?.savedAt">
                      · saved {{ fmtAgo(activeConfigEntry(f.key).savedAt) }}
                    </span>
                  </div>
                </div>
                <JwSelect
                  :model-value="activeConfigName(f.key)"
                  @update:model-value="(v) => setActiveConfigByPickerValue(f.key, v)"
                  :options="configOptionsFor(f.key)"
                  style="min-width:200px"
                  v-tooltip.bottom="'Switch which config powers production calls. Default falls back to tier-resolved built-ins.'" />
                <router-link :to="f.labPath" custom v-slot="{ navigate }">
                  <JwButton intent="ghost" size="small" @click="navigate"
                            v-tooltip.bottom="f.labReady ? `Open ${f.labLabel} to tune and save new configs` : `${f.labLabel} is on the roadmap — no UI to manage smartCast configs yet`">
                    <Icon name="Sparkle" :size="11" /> {{ f.labReady ? "Manage in " + f.labLabel : "Lab coming soon" }}
                  </JwButton>
                </router-link>
              </div>
              <!-- Preview: show what the active config will run with.
                   Default has no settings stored — make that explicit
                   instead of rendering an empty grid. -->
              <div v-if="!activeConfigEntry(f.key)"
                   style="margin-top:10px;padding:10px 14px;border-top:1px solid var(--border-soft);font-size:11.5px;color:var(--muted);font-style:italic">
                Default · uses the tier-resolved prompts and settings for whichever model the feature is routed to. No fixed values to display.
              </div>
              <div v-else
                   style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border-soft);display:grid;grid-template-columns:130px 1fr;gap:6px 12px;font-size:11.5px;line-height:1.5">
                <template v-if="activeConfigEntry(f.key).settings?.temperature !== undefined">
                  <span class="t-muted">temperature</span>
                  <code style="font-family:var(--font-mono)">{{ activeConfigEntry(f.key).settings.temperature }}</code>
                </template>
                <template v-if="activeConfigEntry(f.key).settings?.propagate !== undefined">
                  <span class="t-muted">anchor propagation</span>
                  <code style="font-family:var(--font-mono)">{{ activeConfigEntry(f.key).settings.propagate ? "on" : "off" }}</code>
                </template>
                <template v-if="activeConfigEntry(f.key).settings?.useFloor !== undefined">
                  <span class="t-muted">confidence floor</span>
                  <code style="font-family:var(--font-mono)">{{ activeConfigEntry(f.key).settings.useFloor ? activeConfigEntry(f.key).settings.confidenceFloor : "off" }}</code>
                </template>
                <template v-if="activeConfigEntry(f.key).settings?.think !== undefined">
                  <span class="t-muted">think (Ollama)</span>
                  <code style="font-family:var(--font-mono)">{{ activeConfigEntry(f.key).settings.think ? "on" : "off" }}</code>
                </template>
                <template v-if="activeConfigEntry(f.key).settings?.systemPrompt">
                  <span class="t-muted">system</span>
                  <code style="font-family:var(--font-mono);color:var(--ink-2);white-space:pre-wrap;word-break:break-word">{{ truncatePrompt(activeConfigEntry(f.key).settings.systemPrompt) }}</code>
                </template>
                <template v-if="activeConfigEntry(f.key).settings?.userTemplate">
                  <span class="t-muted">user</span>
                  <code style="font-family:var(--font-mono);color:var(--ink-2);white-space:pre-wrap;word-break:break-word">{{ truncatePrompt(activeConfigEntry(f.key).settings.userTemplate) }}</code>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- Studio · Speaker corrections — per-project memory of dialogue-line
             overrides the writer made in Studio's Script tab. Fed back into
             Re-analyze as worked examples. This card surfaces the count and
             lets the writer wipe it (e.g. after a major character rename or
             POV change that invalidates old examples). -->
        <div class="card">
          <div style="display:flex;align-items:flex-start;gap:14px">
            <div style="flex:1;min-width:0">
              <div class="card-title" style="margin-bottom:6px">Studio · Speaker corrections</div>
              <p class="t-muted" style="font-size:12.5px;margin:0;line-height:1.55">
                Every time you fix a dialogue speaker in Studio → Script, the line and the correct
                character are remembered. The 12 most recent are sent as worked examples on the next
                Re-analyze so the AI stops repeating the same mistakes. Clearing wipes the memory only —
                existing scripts and the lines you've already fixed are untouched.
              </p>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0">
              <div style="font-family:var(--font-mono);font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em">stored</div>
              <div style="font-size:22px;font-weight:600;color:var(--ink);line-height:1">{{ studio.corrections?.length || 0 }}</div>
              <JwButton intent="danger" size="small"
                        :disabled="!(studio.corrections?.length)"
                        @click="confirmClearSpeakerCorrections">
                <Icon name="Trash" :size="11" /> Clear corrections
              </JwButton>
            </div>
          </div>
        </div>

        <!-- Voice canon — chapters that represent the writer's established
             voice. The fingerprint service builds a sample + style summary
             from them and injects it into every writer action's system
             prompt so Rewrite / Expand / Continue / Describe / line edits
             match the writer's voice without per-call guidance. -->
        <div class="card">
          <div class="card-title">Voice canon</div>
          <p class="t-muted" style="font-size:12.5px;margin:0 0 14px;line-height:1.55">
            Pick the chapters JustWrite should treat as your "voice canon" — the prose that
            represents how you write at your best. Every <strong>Rewrite</strong>,
            <strong>Expand</strong>, <strong>Tighten</strong>, <strong>Continue</strong>,
            <strong>Describe</strong>, and line-edit pass will inject a short sample from these
            chapters plus a measured style summary into the model's instructions, so the result
            matches your voice without per-call guidance. Two or three middle-of-book chapters
            work best — opening chapters often have structural quirks that distort the fingerprint.
          </p>
          <div v-if="canonChapterOptions.length === 0" class="t-muted" style="font-size:12.5px;font-style:italic">
            No chapters with prose yet. Once you've drafted a few chapters, come back here.
          </div>
          <template v-else>
            <div style="display:flex;flex-direction:column;gap:4px;max-height:280px;overflow-y:auto;padding:6px 4px;border:1px solid var(--border-soft);border-radius:6px">
              <label v-for="c in canonChapterOptions" :key="c.id"
                     style="display:flex;gap:10px;align-items:center;padding:6px 10px;cursor:pointer;border-radius:4px"
                     :style="canonHas(c.id) ? 'background:var(--accent-soft)' : ''">
                <JwCheckbox
                  :model-value="canonHas(c.id)"
                  @update:model-value="toggleCanon(c.id)" />
                <span style="font-family:var(--font-mono);font-size:11px;color:var(--muted);min-width:48px">Ch. {{ c.num }}</span>
                <span style="flex:1;color:var(--ink-2);font-size:13px">{{ c.title || 'Untitled' }}</span>
                <span style="font-family:var(--font-mono);font-size:10.5px;color:var(--muted)">{{ c.words.toLocaleString() }} w</span>
              </label>
            </div>
            <div style="margin-top:12px;display:flex;align-items:center;gap:10px;font-family:var(--font-mono);font-size:11px;color:var(--muted)">
              <span>{{ project.voiceCanonChapterIds?.length || 0 }} chapter{{ (project.voiceCanonChapterIds?.length || 0) === 1 ? '' : 's' }} in canon</span>
              <span v-if="voicePreview.sampleWordCount">· ~{{ voicePreview.sampleWordCount }} word sample</span>
              <span style="flex:1"></span>
              <JwButton v-if="project.voiceCanonChapterIds?.length" intent="ghost" size="small" @click="clearCanon">
                Clear all
              </JwButton>
            </div>
            <details v-if="voicePreview.block" style="margin-top:14px">
              <summary style="cursor:pointer;font-family:var(--font-mono);font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:var(--muted)">
                Preview the fingerprint that will be injected
              </summary>
              <div style="margin-top:8px;padding:12px 14px;background:var(--surface-2);border-radius:6px;font-family:var(--font-serif);font-size:12.5px;line-height:1.6;color:var(--ink-2);white-space:pre-wrap;max-height:300px;overflow:auto">{{ voicePreview.block }}</div>
            </details>
          </template>
        </div>

        <div class="card">
          <div class="card-title">Quick setup tips</div>
          <div class="settings-tips-grid" style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:14px;font-size:12.5px;color:var(--ink-2)">
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
                Install <b>devnen/Chatterbox-TTS-Server</b> (portable Windows build at <a href="https://github.com/devnen/Chatterbox-TTS-Server/releases" target="_blank" rel="noopener" style="color:var(--accent)">github.com/devnen/Chatterbox-TTS-Server/releases</a> — unzip, double-click <code style="background:var(--surface-3);padding:1px 5px;border-radius:3px">start.bat</code>). Base URL <code style="background:var(--surface-3);padding:1px 5px;border-radius:3px">http://localhost:8004/v1</code>. Three swappable models — Base, <b>Turbo</b> (fast + paralinguistic tags like <code style="background:var(--surface-3);padding:1px 5px;border-radius:3px">[laugh]</code>), Multilingual (23 languages) — picked from the provider editor; <i>Apply</i> hot-swaps without restarting. Voices come from <b>both</b> the server's <code style="background:var(--surface-3);padding:1px 5px;border-radius:3px">voices/</code> folder (predefined) <b>and</b> <code style="background:var(--surface-3);padding:1px 5px;border-radius:3px">reference_audio/</code> (clones, marked "(clone)" in the picker). Engine knobs — exaggeration, cfg_weight, temperature — live in the provider editor's Engine params section.
              </p>
            </div>
            <div>
              <b style="font-size:12.5px;color:var(--ink)">Dia</b>
              <p style="margin:4px 0 0;line-height:1.55">
                Install <b>devnen/Dia-TTS-Server</b> (same author as Chatterbox — see <a href="https://github.com/devnen/Dia-TTS-Server" target="_blank" rel="noopener" style="color:var(--accent)">github.com/devnen/Dia-TTS-Server</a>). Base URL <code style="background:var(--surface-3);padding:1px 5px;border-radius:3px">http://localhost:8003/v1</code>. Three hot-swappable models — <b>Dia 1.6B</b> (proven, ~4.4 GB VRAM), <b>Dia2-1B</b> (streaming, lightest), <b>Dia2-2B</b> (highest quality, ~5–6 GB VRAM) — picked from the provider editor; <i>Apply</i> hot-swaps without restarting. Bundled predefined voices plus reference clips (dropped into <code style="background:var(--surface-3);padding:1px 5px;border-radius:3px">reference_audio/</code> — the web UI's Import button puts them there too) appear alongside the synthetic <b>S1</b> / <b>S2</b> dialogue-mode tokens. Cast different characters on S1 vs S2 to get distinct voices without uploading clips.
              </p>
            </div>
            <div>
              <b style="font-size:12.5px;color:var(--ink)">Microsoft Edge TTS</b>
              <p style="margin:4px 0 0;line-height:1.55">
                Built in — ~400 neural voices across ~140 locales, free, no API key, no account. Routed through JustWrite's Rust backend (the renderer can't reach Microsoft's WebSocket directly). Desktop app only — <code style="background:var(--surface-3);padding:1px 5px;border-radius:3px">npm run dev:vite</code> in a browser doesn't have it. Add the preset, hit <b>Fetch voices</b>, you're done. Microsoft's endpoint is unofficial and has broken before — keep one local engine configured as a fallback if you rely on TTS.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- ── AI USAGE ──────────────────────────────── -->
      <div v-else-if="active === 'usage'" style="display:flex;flex-direction:column;gap:14px">
        <div class="card">
          <div class="card-title">
            {{ $t('settings.usage.cardTitle') }}
            <JwButton :label="$t('settings.usage.resetLedger')" intent="ghost" size="small" style="margin-left:auto" @click="resetUsageLog"
              v-tooltip.bottom="'Clear every recorded call. Future calls start tallying from zero.'" />
          </div>
          <p class="t-muted" style="font-size:12.5px;margin:0 0 14px;line-height:1.55">
            Tokens and estimated cost across every AI call — writer actions, critique, brainstorm, entity sweep,
            Studio smart-cast and speaker analysis, the chat panel, and every analysis pass. Local providers
            (Ollama, LM Studio, llama.cpp) are recorded at $0 — pricing only applies to cloud models in the
            built-in price table.
          </p>

          <div v-if="ai.usageTotals.calls === 0" class="t-muted" style="font-size:12px;text-align:center;padding:22px 0;background:var(--surface-2);border-radius:8px;font-style:italic">
            No AI calls yet. Run something from the scene-strip AI dropdown, the Critique modal, or any analysis feature and it'll show up here.
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
              <div class="usage-section-h">{{ $t('settings.usage.byFeature') }}</div>
              <JwTable :data="usageByFeature" data-key="key" :columns="byFeatureColumns" class="usage-dt">
                <template #calls="{ value }">{{ value.toLocaleString() }}</template>
                <template #promptTokens="{ value }">{{ value.toLocaleString() }}</template>
                <template #completionTokens="{ value }">{{ value.toLocaleString() }}</template>
                <template #cost="{ value }">{{ fmtUsd(value) }}</template>
              </JwTable>
            </div>

            <!-- By provider -->
            <div class="usage-section">
              <div class="usage-section-h">{{ $t('settings.usage.byProvider') }}</div>
              <JwTable :data="usageByProvider" data-key="key" :columns="byProviderColumns" class="usage-dt">
                <template #key="{ value }">{{ providerLabel(value) }}</template>
                <template #calls="{ value }">{{ value.toLocaleString() }}</template>
                <template #promptTokens="{ value }">{{ value.toLocaleString() }}</template>
                <template #completionTokens="{ value }">{{ value.toLocaleString() }}</template>
                <template #cost="{ value }">{{ fmtUsd(value) }}</template>
              </JwTable>
            </div>

            <!-- Recent calls -->
            <div class="usage-section">
              <div class="usage-section-h">
                {{ $t('settings.usage.recentCalls') }}
                <span class="t-muted" style="font-weight:400;font-size:11px;margin-left:6px">{{ recentUsageRows.length }}</span>
              </div>
              <div class="wb-toolbar" style="margin-bottom:10px">
                <span class="wb-search">
                  <Icon name="Search" :size="13" class="wb-search-icon" />
                  <JwInput :value="recentGlobalQuery" placeholder="Search calls…" @input="onRecentInput" class="wb-search-input" />
                </span>
              </div>
              <JwTable
                :data="recentUsageRows"
                data-key="id"
                :global-filter="recentGlobalQuery"
                :global-filter-fields="['feature', 'model', 'providerName']"
                :columns="recentColumns"
                class="usage-dt"
                :pagination="{ pageSize: 25, pageSizeOptions: [10, 25, 50] }"
                :default-sort="{ id: 'at', desc: true }"
              >
                <template #at="{ value }">{{ fmtTime(value) }}</template>
                <template #model="{ value }">{{ value || "—" }}</template>
                <template #totalTokens="{ value }">{{ value.toLocaleString() }}</template>
                <template #cost="{ value }">{{ fmtUsd(value) }}</template>
              </JwTable>
            </div>
          </template>
        </div>
      </div>

      <!-- ── APPEARANCE ────────────────────────────── -->
      <div v-else-if="active === 'appearance'" style="display:flex;flex-direction:column;gap:14px">

        <!-- Presets -->
        <div class="card">
          <div class="card-title">{{ $t('settings.appearance.presetCardTitle') }}
            <JwButton :label="$t('settings.appearance.resetToDefaults')" intent="ghost" size="small" style="margin-left:auto" @click="resetAppearance"
              v-tooltip.bottom="'Reset every appearance setting to the default look'">
              <template #icon><Icon name="Refresh" :size="12" /></template>
            </JwButton>
          </div>
          <p class="t-muted" style="font-size:12px;margin:0 0 12px">Start from a curated look, then fine-tune anything below.</p>
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
              <span class="t-muted">Saved preset</span>
              <div class="preset-actions">
                <button class="preset-act" v-tooltip.bottom="'Rename'" @click.stop="renameCustomPreset(p)"><Icon name="Pencil" :size="12" /></button>
                <button class="preset-act danger" v-tooltip.bottom="'Delete'" @click.stop="removeCustomPreset(p)"><Icon name="Trash" :size="12" /></button>
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
          <div class="card-title">{{ $t('settings.appearance.previewCardTitle') }}</div>
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
                  <JwButton intent="primary" size="small">Accent</JwButton>
                  <span class="chip" style="background:var(--accent-soft);color:var(--accent-ink);border-color:var(--accent-line)">Selected</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Mode -->
        <div class="card">
          <div class="card-title">{{ $t('settings.appearance.modeCardTitle') }}</div>
          <div class="settings-mode-grid" style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:10px" role="radiogroup" aria-label="Theme">
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
              <JwSelect :model-value="ap.uiFont" @update:model-value="(v) => setAp({ uiFont: v })"
                :options="UI_FONTS.map(f => ({ label: f.label, value: f.label }))"
                optionLabel="label" optionValue="value" />
              <span class="field-hint">Buttons, menus, and labels.</span>
            </label>
            <label class="field"><span class="field-l">Display font</span>
              <JwSelect :model-value="ap.displayFont" @update:model-value="(v) => setAp({ displayFont: v })"
                :options="DISPLAY_FONTS.map(f => ({ label: f.label, value: f.label }))"
                optionLabel="label" optionValue="value" />
              <span class="field-hint">Page titles, big numbers, serif headings.</span>
            </label>
            <label class="field"><span class="field-l">Editor body font</span>
              <JwSelect :model-value="ap.editorBodyFont" @update:model-value="(v) => setAp({ editorBodyFont: v })"
                :options="DISPLAY_FONTS.map(f => ({ label: f.label, value: f.label }))"
                optionLabel="label" optionValue="value" />
              <span class="field-hint">Manuscript prose. Per-document choice can override this in the editor's ⚙ Writing settings.</span>
            </label>
          </div>
          <div class="size-row">
            <span class="field-l">Size</span>
            <JwSegmented
              class="size-seg" variant="connected"
              :model-value="ap.uiScale"
              :options="UI_SCALE_OPTIONS"
              aria-label="UI scale"
              @update:model-value="setAp({ uiScale: $event })" />
            <p class="size-hint">Scales every label, control, and the prose together.</p>
          </div>
          <div class="size-row">
            <span class="field-l">Section heading</span>
            <JwSegmented
              class="size-seg" variant="connected"
              :model-value="ap.sidebarHeadingStyle"
              :options="SH_STYLE_OPTIONS"
              aria-label="Sidebar heading style"
              @update:model-value="setAp({ sidebarHeadingStyle: $event })" />
            <JwSegmented
              class="size-seg size-seg-narrow" variant="connected"
              :model-value="ap.sidebarHeadingSize"
              :options="SH_SIZE_OPTIONS"
              aria-label="Sidebar heading size"
              @update:model-value="setAp({ sidebarHeadingSize: $event })" />
            <p class="size-hint">The small labels that group the sidebar nav (e.g. <em>Manuscript</em>, <em>Story world</em>).</p>
          </div>
          <div class="size-row">
            <span class="field-l">Menu item</span>
            <JwSegmented
              class="size-seg" variant="connected"
              :model-value="ap.navItemStyle"
              :options="NAV_STYLE_OPTIONS"
              aria-label="Menu item style"
              @update:model-value="setAp({ navItemStyle: $event })" />
            <JwSegmented
              class="size-seg size-seg-narrow" variant="connected"
              :model-value="ap.navItemSize"
              :options="NAV_SIZE_OPTIONS"
              aria-label="Menu item size"
              @update:model-value="setAp({ navItemSize: $event })" />
            <p class="size-hint">Each sidebar entry — <em>Home</em>, <em>Chapters</em>, <em>Characters</em>, and so on.</p>
          </div>
        </div>

        <!-- Accents (primary + second) -->
        <div class="card">
          <div class="card-title">{{ $t('settings.appearance.accentsCardTitle') }}</div>
          <p class="t-muted" style="font-size:12px;margin:0 0 12px">Accent drives selection, the active nav item, buttons and links. Accent 2 is the secondary — rings, rules, peak markers, and the <code>accent2</code> intent on buttons and tags.</p>
          <div class="swatch-row" role="radiogroup" aria-label="Accent">
            <span class="swatch-label">Accent</span>
            <button v-for="p in ACCENT_PRESETS" :key="p.hue"
              role="radio" :aria-checked="ap.accentHue === p.hue" :aria-label="p.name"
              class="accent-swatch" :class="{ active: ap.accentHue === p.hue }"
              :title="p.name" :style="`background: oklch(0.55 0.13 ${p.hue})`"
              @click="setAp({ accentHue: p.hue })">
              <Icon v-if="ap.accentHue === p.hue" name="Check" :size="12" />
            </button>
            <JwNumber :min="0" :max="360" style="width:74px"
              :model-value="ap.accentHue" @update:model-value="(v) => setAp({ accentHue: clampHue(v) })" />
          </div>
          <div class="swatch-row" style="margin-top:8px" role="radiogroup" aria-label="Accent 2">
            <span class="swatch-label">Accent 2</span>
            <button v-for="p in GOLD_PRESETS" :key="p.hue"
              role="radio" :aria-checked="ap.goldHue === p.hue" :aria-label="p.name"
              class="accent-swatch" :class="{ active: ap.goldHue === p.hue }"
              :title="p.name" :style="`background: oklch(0.62 0.1 ${p.hue})`"
              @click="setAp({ goldHue: p.hue })">
              <Icon v-if="ap.goldHue === p.hue" name="Check" :size="12" />
            </button>
            <JwNumber :min="0" :max="360" style="width:74px"
              :model-value="ap.goldHue" @update:model-value="(v) => setAp({ goldHue: clampHue(v) })" />
          </div>
          <!-- Live preview — the button + tag both track the Accent 2 hue. -->
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:14px;padding-top:12px;border-top:1px solid var(--border-soft)">
            <JwButton intent="accent2" size="small" label="Accent 2" />
            <JwTag intent="accent2" value="Accent 2" />
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
            <JwNumber :min="0" :max="360" style="width:74px"
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
            <JwNumber :min="0" :max="360" style="width:74px"
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
            <JwNumber :min="0" :max="360" style="width:74px"
              :model-value="ap.infoHue" @update:model-value="(v) => setAp({ infoHue: clampHue(v) })" />
          </div>
          <!-- Live preview — buttons and tags re-skin from the hues above (banners + status chips use the same shades). -->
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:16px;padding-top:14px;border-top:1px solid var(--border-soft)">
            <JwButton intent="success" size="small" label="Success" />
            <JwButton intent="danger" size="small" label="Danger" />
            <JwButton intent="info" size="small" label="Info" />
            <span style="width:8px" />
            <JwTag intent="success" value="Done" />
            <JwTag intent="danger" value="Error" />
            <JwTag intent="info" value="Note" />
          </div>
        </div>

        <!-- Buttons — every intent the app uses, one of each. -->
        <div class="card">
          <div class="card-title">{{ $t('settings.appearance.buttonIntentsCardTitle') }}</div>
          <p class="t-muted" style="font-size:12px;margin:0 0 12px" v-html="$t('settings.appearance.buttonIntentsHint')"></p>
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
            <JwButton intent="primary"   size="small" label="Primary" />
            <JwButton intent="secondary" size="small" label="Secondary" />
            <JwButton intent="ghost"     size="small" label="Ghost" />
            <JwButton intent="success"   size="small" label="Success" />
            <JwButton intent="danger"    size="small" label="Danger" />
            <JwButton intent="info"      size="small" label="Info" />
            <JwButton intent="accent2"   size="small" label="Accent 2" />
          </div>
        </div>

        <!-- Backgrounds -->
        <div class="card">
          <div class="card-title">{{ $t('settings.appearance.backgroundsCardTitle') }}</div>
          <p class="t-muted" style="font-size:12px;margin:0 0 12px" v-html="$t('settings.appearance.backgroundsHint')"></p>
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
              <JwCheckbox :model-value="ap.inlinePaper"
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
          <p class="t-muted" style="font-size:11px;margin:12px 0 0" v-html="$t('settings.appearance.editorLayoutOverrideNote')"></p>
        </div>

        <!-- Editor writing -->
        <div class="card">
          <div class="card-title">{{ $t('settings.appearance.editorWritingCardTitle') }}</div>
          <p class="t-muted" style="font-size:12px;margin:0 0 12px">{{ $t('settings.appearance.editorWritingHint') }}</p>
          <div class="size-row">
            <span class="field-l">{{ $t('settings.appearance.editorFontSizeLabel') }}</span>
            <JwSegmented
              class="size-seg" variant="connected"
              :model-value="ap.editorFontSize"
              :options="FONT_SIZE_OPTIONS"
              :aria-label="$t('settings.appearance.editorFontSizeLabel')"
              @update:model-value="setAp({ editorFontSize: $event })" />
          </div>
          <div class="size-row">
            <span class="field-l">{{ $t('settings.appearance.editorLineSpacingLabel') }}</span>
            <JwSegmented
              class="size-seg" variant="connected"
              :model-value="ap.editorLineSpacing"
              :options="LINE_OPTIONS"
              :aria-label="$t('settings.appearance.editorLineSpacingLabel')"
              @update:model-value="setAp({ editorLineSpacing: $event })" />
          </div>
          <div class="size-row">
            <span class="field-l">{{ $t('settings.appearance.editorParaSpacingLabel') }}</span>
            <JwSegmented
              class="size-seg" variant="connected"
              :model-value="ap.editorParaSpacing"
              :options="PARA_OPTIONS"
              :aria-label="$t('settings.appearance.editorParaSpacingLabel')"
              @update:model-value="setAp({ editorParaSpacing: $event })" />
          </div>
          <div class="size-row">
            <span class="field-l">{{ $t('settings.appearance.editorParaIndentLabel') }}</span>
            <JwSegmented
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
            <JwSegmented
              class="size-seg" variant="connected"
              :model-value="ap.btnRadius"
              :options="BUTTON_RADIUS_OPTIONS"
              :aria-label="$t('settings.appearance.btnCornerRadiusLabel')"
              @update:model-value="setAp({ btnRadius: $event })" />
          </div>
          <div class="size-row">
            <span class="field-l">{{ $t('settings.appearance.btnDensityLabel') }}</span>
            <JwSegmented
              class="size-seg" variant="connected"
              :model-value="ap.btnDensity"
              :options="BUTTON_DENSITY_OPTIONS"
              :aria-label="$t('settings.appearance.btnDensityLabel')"
              @update:model-value="setAp({ btnDensity: $event })" />
          </div>
          <div class="size-row">
            <span class="field-l">{{ $t('settings.appearance.btnLabelCasingLabel') }}</span>
            <JwSegmented
              class="size-seg" variant="connected"
              :model-value="ap.btnLabelCase"
              :options="BUTTON_LABEL_CASE_OPTIONS"
              :aria-label="$t('settings.appearance.btnLabelCasingLabel')"
              @update:model-value="setAp({ btnLabelCase: $event })" />
          </div>
          <div style="display:flex;gap:10px;align-items:center;margin-top:14px;padding-top:14px;border-top:1px solid var(--border-soft)">
            <span class="t-muted" style="font-size:11.5px;font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.08em">{{ $t('settings.appearance.previewLabel') }}</span>
            <JwButton intent="primary" label="Save" />
            <JwButton intent="secondary" label="Cancel" />
            <JwButton intent="ghost" label="Skip" />
            <JwButton intent="danger" label="Delete" />
          </div>
        </div>

      </div>

      <!-- ── BACKUPS ───────────────────────────────── -->
      <div v-else-if="active === 'backups'" style="display:flex;flex-direction:column;gap:14px">
        <div v-if="autosaveDir" class="card">
          <div class="card-title">{{ $t('settings.backups.autosaveCardTitle') }}</div>
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
            <JwButton :label="autosaveListShown ? 'Hide autosaves' : 'Restore from autosave…'" intent="primary" :disabled="autosaveListBusy" @click="toggleAutosaveList">
              <template #icon><Icon name="Folder" :size="13" /></template>
            </JwButton>
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
                <JwButton label="Restore" intent="primary" @click="restoreFromAutosave(entry)" />
              </li>
            </ul>
          </div>
        </div>

        <div class="card">
          <div class="card-title">{{ $t('settings.backups.snapshotCardTitle') }}</div>
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
            <JwButton :label="backupBusy ? 'Exporting…' : 'Export backup…'" intent="primary" :disabled="backupBusy" @click="exportBackup">
              <template #icon><Icon name="Export" :size="13" /></template>
            </JwButton>
            <JwButton as="label" intent="secondary">
              <Icon name="Folder" :size="13" />
              Import backup…
              <input type="file" accept="application/json,.json" style="display:none" @change="onImportFile" />
            </JwButton>
          </div>
        </div>

        <div class="card danger-card">
          <div class="card-title" style="color: var(--danger-ink)">{{ $t('settings.backups.dangerCardTitle') }}</div>
          <p class="t-muted" style="font-size:12.5px;margin:0 0 12px;line-height:1.55">
            Wipes every <code>justwrite:*</code> key from IndexedDB — project, history, AI providers, voice cast, sessions — and reloads with the demo seed. Take a backup first.
          </p>
          <JwButton label="Reset workspace" intent="danger" @click="resetWorkspace">
            <template #icon><Icon name="Alert" :size="13" /></template>
          </JwButton>
        </div>
      </div>

      <!-- ── DEBUG ─────────────────────────────────── -->
      <div v-else-if="active === 'debug'" style="display:flex;flex-direction:column;gap:14px">
        <div class="card">
          <div class="card-title">{{ $t('settings.debug.cardTitle') }}</div>
          <p style="font-size:12.5px;color:var(--muted);margin:0 0 12px;line-height:1.5">
            Internal lab views for testing pipelines and inspecting state. Hidden from the sidebar — reach them from here.
          </p>
          <div class="debug-tools">
            <router-link
              v-for="tool in DEBUG_TOOLS"
              :key="tool.id"
              :to="tool.route"
              class="debug-tile"
            >
              <span class="debug-tile-icon"><Icon :name="tool.icon" :size="18" /></span>
              <span class="debug-tile-body">
                <b>{{ tool.name }}</b>
                <span class="t-muted">{{ tool.description }}</span>
                <code class="debug-tile-route">#{{ tool.route }}</code>
              </span>
              <Icon name="ChevRight" :size="14" />
            </router-link>
          </div>
        </div>
      </div>

      <!-- ── ABOUT ─────────────────────────────────── -->
      <div v-else-if="active === 'about'" style="display:flex;flex-direction:column;gap:14px">
        <div class="card">
          <div class="card-title">{{ $t('settings.about.appCardTitle') }}</div>
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
          <div class="card-title">{{ $t('settings.about.workspaceCardTitle') }}</div>
          <div class="settings-stats-grid" style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:14px">
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
          <div class="card-title">{{ $t('settings.about.shortcutsCardTitle') }}</div>
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

/* Sizing for connected segmented controls in Appearance rows. JwSegmented
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

@media (max-width: 900px) {
  /* Collapse side-nav + content from 220px 1fr → stacked */
  .settings-layout { grid-template-columns: 1fr !important; }
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

/* wb-toolbar / wb-search reused from WorldbuildingView pattern */
.wb-toolbar { display: flex; align-items: center; gap: 10px; }
.wb-search { position: relative; flex: 1; max-width: 360px; }
.wb-search-icon {
  position: absolute; left: 10px; top: 50%;
  transform: translateY(-50%);
  color: var(--muted); pointer-events: none;
}
.wb-search-input { width: 100%; padding-left: 30px !important; }

.set-desc {
  font-size: 14px; line-height: 1.55; color: var(--muted);
  margin: 0 0 18px;
}
.set-desc strong { color: var(--ink-2); font-weight: 600; }
</style>
