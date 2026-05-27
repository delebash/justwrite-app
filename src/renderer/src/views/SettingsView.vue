<script setup>
import { ref, computed, watchEffect } from "vue";
import { useAiStore } from "../stores/ai.js";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { saveImage, urlFor, hasNativeImages } from "../services/imageStore.js";
import { getParamSchema } from "../domain/providerParams.js";
import { promptDialog, confirmDialog } from "../services/dialog.js";
import { getItem, setItem, clearPrefix, flushPending } from "../services/storage.js";
import PaneHeader from "../components/PaneHeader.vue";
import Icon from "../components/Icon.vue";

const props = defineProps({ section: { type: String, default: "" } });

const ai = useAiStore();
const project = useProjectStore();
const ui = useUiStore();

const SECTIONS = [
  { id: "project",    label: "Project" },
  { id: "audio",      label: "AI & Audio engines" },
  { id: "appearance", label: "Appearance" },
  { id: "backups",    label: "Backups" },
  { id: "about",      label: "About" },
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

// ── Engine-specific param fields ──────────────────────────────────
const paramSchema = computed(() => getParamSchema(draft.value));

function getParam(key) {
  return draft.value?.params?.[key];
}
function setParam(key, value) {
  if (!draft.value) return;
  const next = { ...(draft.value.params || {}) };
  if (value === undefined || value === "" || Number.isNaN(value)) {
    delete next[key];
  } else {
    next[key] = value;
  }
  draft.value.params = next;
}
function resetParam(key) { setParam(key, undefined); }

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
const THEMES = [
  { id: "system", label: "Match system", hint: "Follow your OS dark/light preference." },
  { id: "light",  label: "Light",        hint: "Bright surfaces, warm neutrals." },
  { id: "dark",   label: "Dark",         hint: "Deep slate surfaces for night writing." },
];
const ACCENT_PRESETS = [
  { hue: 200, name: "Teal" },
  { hue: 25,  name: "Rose" },
  { hue: 75,  name: "Amber" },
  { hue: 120, name: "Olive" },
  { hue: 270, name: "Indigo" },
  { hue: 320, name: "Plum" },
];

// ── Backups ────────────────────────────────────────────────────────
const backupBusy = ref(false);
const backupError = ref(null);
const importMessage = ref(null);
const importFile = ref(null);
const lastBackupAt = ref(getItem("justwrite:lastBackupAt") || null);

function safeFilename(title) {
  const base = (title || "justwrite").replace(/[^\w\d-]+/g, "_").replace(/^_+|_+$/g, "");
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return `${base || "justwrite"}-${stamp}.json`;
}

async function exportBackup() {
  backupBusy.value = true; backupError.value = null;
  try {
    const snap = project.exportSnapshot();
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
    project.loadSnapshot(snap);
    importMessage.value = `Imported "${snap.project.title || "project"}" — ${Object.keys(snap.chapterBody || {}).length} chapters.`;
    ui.showToast({ message: "Backup imported." });
  } catch (err) {
    backupError.value = err.message || String(err);
  }
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
</script>

<template>
  <PaneHeader eyebrow="Project" title="Settings" />
  <div class="scrollarea" style="flex:1;padding:22px">
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
            <input class="input" :value="project.project.title"
              @input="setMeta('title', $event.target.value)" placeholder="Working title" />
            <span class="t-muted">Author</span>
            <input class="input" :value="project.project.author"
              @input="setMeta('author', $event.target.value)" placeholder="Pen name or legal name" />
            <span class="t-muted">Subtitle</span>
            <input class="input" :value="project.project.subtitle"
              @input="setMeta('subtitle', $event.target.value)" placeholder="Optional" />
            <span class="t-muted">Genre</span>
            <input class="input" :value="project.project.genre"
              @input="setMeta('genre', $event.target.value)" placeholder="Literary, mystery, sci-fi…" />
            <span class="t-muted">Started</span>
            <input class="input" :value="project.project.startedOn"
              @input="setMeta('startedOn', $event.target.value)" placeholder="e.g. March 11, 2026" />
            <span class="t-muted">Deadline</span>
            <input class="input" :value="project.project.deadline"
              @input="setMeta('deadline', $event.target.value)" placeholder="e.g. December 1, 2026" />
            <span class="t-muted" style="align-self:start;padding-top:6px">Premise</span>
            <textarea class="input" rows="3" :value="project.project.premise"
              @input="setMeta('premise', $event.target.value)"
              placeholder="One- or two-sentence pitch. Used on the Home dashboard and exports."></textarea>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Goals</div>
          <div style="display:grid;grid-template-columns:160px 1fr;gap:10px 14px;font-size:13px;align-items:center">
            <span class="t-muted">Word goal</span>
            <div style="display:flex;align-items:center;gap:8px">
              <input class="input" type="number" min="0" step="500" style="max-width:160px"
                :value="project.project.wordsGoal"
                @input="setMetaNumber('wordsGoal', $event.target.value)" />
              <span class="t-muted" style="font-size:11.5px">total words for the manuscript</span>
            </div>
            <span class="t-muted">Daily target</span>
            <div style="display:flex;align-items:center;gap:8px">
              <input class="input" type="number" min="0" step="50" style="max-width:160px"
                :value="project.project.dailyTarget ?? 1200"
                @input="setMetaNumber('dailyTarget', $event.target.value)" />
              <span class="t-muted" style="font-size:11.5px">words/day — drives the Home streak ring</span>
            </div>
          </div>
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
                <button v-if="project.project.coverImage" class="btn ghost" @click="removeCover">Remove</button>
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
            <select class="input" :value="ai.defaultLlmId" @change="ai.setDefaultLlm($event.target.value)">
              <option v-for="p in ai.llmProviders" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <span class="t-muted">Default TTS</span>
            <select class="input" :value="ai.defaultTtsId" @change="ai.setDefaultTts($event.target.value)">
              <option v-for="p in ai.ttsProviders" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
        </div>

        <div class="card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <div class="card-title" style="margin:0">Providers</div>
            <span class="t-muted" style="font-size:12px">{{ ai.providers.length }} configured</span>
            <button class="btn sm primary" style="margin-left:auto" @click="startNew">
              <Icon name="Plus" :size="12" /> Add provider
            </button>
          </div>

          <div style="display:flex;flex-direction:column;gap:8px">
            <!-- New-provider edit row (only when adding) -->
            <div v-if="editing === 'new' && draft" style="padding:14px;border:1.5px solid var(--accent);border-radius:10px;background:var(--accent-soft)">
              <div style="display:grid;grid-template-columns:120px 1fr;gap:8px 12px;font-size:12.5px;align-items:center">
                <span class="t-muted">ID</span>
                <input class="input" v-model="draft.id" placeholder="e.g. my-ollama" />
                <span class="t-muted">Name</span>
                <input class="input" v-model="draft.name" placeholder="Display name" />
                <span class="t-muted">Kind</span>
                <select class="input" v-model="draft.kind">
                  <option value="llm">LLM only</option>
                  <option value="tts">TTS only</option>
                  <option value="both">LLM + TTS</option>
                </select>
                <span class="t-muted">Base URL</span>
                <input class="input" v-model="draft.baseUrl" placeholder="http://localhost:11434/v1" />
                <span class="t-muted">API key</span>
                <input class="input" v-model="draft.apiKey" type="password" placeholder="Optional — leave blank for local providers" />
                <template v-if="draft.kind === 'llm' || draft.kind === 'both'">
                  <span class="t-muted">Chat model</span>
                  <input class="input" v-model="draft.chatModel" placeholder="llama3.1:8b, gpt-4o-mini, …" />
                </template>
                <template v-if="draft.kind === 'tts' || draft.kind === 'both'">
                  <span class="t-muted">TTS model</span>
                  <input class="input" v-model="draft.ttsModel" placeholder="tts-1, gpt-4o-mini-tts, …" />
                  <span class="t-muted">Voices</span>
                  <input class="input" :value="draft.ttsVoices?.join(', ') || ''"
                    @input="draft.ttsVoices = $event.target.value.split(',').map(v => v.trim()).filter(Boolean)"
                    placeholder="comma-separated · e.g. alloy, echo, nova" />

                  <template v-if="paramSchema.length">
                    <div style="grid-column:1/-1;display:flex;align-items:baseline;gap:8px;margin-top:8px;padding-top:10px;border-top:1px dashed var(--border)">
                      <span class="t-eyebrow" style="font-size:10.5px">Engine parameters</span>
                      <span class="t-muted" style="font-size:11px">Blank = let the server use its default.</span>
                    </div>
                    <template v-for="f in paramSchema" :key="f.key">
                      <span class="t-muted" :title="f.help || ''"
                        :style="f.help ? 'cursor:help;text-decoration:underline dotted var(--border-strong);text-underline-offset:3px' : ''">
                        {{ f.label }}
                      </span>
                      <div style="display:flex;gap:6px;align-items:center">
                        <input v-if="f.type === 'number'" class="input" type="number"
                          :min="f.min" :max="f.max" :step="f.step"
                          :placeholder="f.placeholder || (f.default !== undefined ? `default ${f.default}` : '')"
                          :value="getParam(f.key) ?? ''"
                          @input="setParam(f.key, $event.target.value === '' ? undefined : Number($event.target.value))" />
                        <select v-else-if="f.type === 'select'" class="input"
                          :value="getParam(f.key) ?? f.default ?? ''"
                          @change="setParam(f.key, $event.target.value)">
                          <option v-for="opt in f.options" :key="opt" :value="opt">
                            {{ f.optionLabels?.[opt] ?? (opt === '' ? '— default —' : opt) }}
                          </option>
                        </select>
                        <label v-else-if="f.type === 'boolean'" style="display:flex;align-items:center;gap:6px;font-size:12.5px">
                          <input type="checkbox"
                            :checked="getParam(f.key) ?? f.default ?? false"
                            @change="setParam(f.key, $event.target.checked)" />
                          <span class="t-muted">{{ (getParam(f.key) ?? f.default) ? 'on' : 'off' }}</span>
                        </label>
                        <textarea v-else-if="f.type === 'textarea'" class="input"
                          rows="2" :placeholder="f.placeholder || ''"
                          :value="getParam(f.key) ?? ''"
                          @input="setParam(f.key, $event.target.value || undefined)" />
                        <input v-else class="input"
                          :placeholder="f.placeholder || ''"
                          :value="getParam(f.key) ?? ''"
                          @input="setParam(f.key, $event.target.value || undefined)" />
                        <button v-if="getParam(f.key) !== undefined" type="button"
                          class="btn sm ghost" :title="`Reset ${f.label}`"
                          style="padding:4px 8px" @click="resetParam(f.key)">↺</button>
                      </div>
                    </template>
                  </template>
                </template>
              </div>
              <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">
                <button class="btn ghost" @click="cancelEdit">Cancel</button>
                <button class="btn primary" @click="saveDraft">Save</button>
              </div>
            </div>

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
                    <template v-if="p.ttsModel">tts: <b>{{ p.ttsModel }}</b> · </template>
                    <template v-if="p.ttsVoices?.length">{{ p.ttsVoices.length }} voices · </template>
                    {{ p.apiKey ? "API key set" : "no key" }}
                  </div>
                </div>
                <span style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px">
                  <span :style="`width:8px;height:8px;border-radius:50%;background:${statusColor(ai.status[p.id])}`" />
                  {{ statusLabel(ai.status[p.id]) }}
                </span>
                <button class="btn sm" @click="pingProvider(p.id)">Test</button>
                <button class="btn sm" @click="startEdit(p)">Edit</button>
              </div>

              <!-- Edit row -->
              <div v-else style="padding:14px;border:1.5px solid var(--accent);border-radius:10px;background:var(--accent-soft)">
                <div style="display:grid;grid-template-columns:120px 1fr;gap:8px 12px;font-size:12.5px;align-items:center">
                  <span class="t-muted">ID</span>
                  <input class="input" v-model="draft.id" :readonly="editing !== 'new'" placeholder="e.g. my-ollama" />
                  <span class="t-muted">Name</span>
                  <input class="input" v-model="draft.name" placeholder="Display name" />
                  <span class="t-muted">Kind</span>
                  <select class="input" v-model="draft.kind">
                    <option value="llm">LLM only</option>
                    <option value="tts">TTS only</option>
                    <option value="both">LLM + TTS</option>
                  </select>
                  <span class="t-muted">Base URL</span>
                  <input class="input" v-model="draft.baseUrl" placeholder="http://localhost:11434/v1" />
                  <span class="t-muted">API key</span>
                  <input class="input" v-model="draft.apiKey" type="password" placeholder="Optional — leave blank for local providers" />
                  <template v-if="draft.kind === 'llm' || draft.kind === 'both'">
                    <span class="t-muted">Chat model</span>
                    <input class="input" v-model="draft.chatModel" placeholder="llama3.1:8b, gpt-4o-mini, …" />
                  </template>
                  <template v-if="draft.kind === 'tts' || draft.kind === 'both'">
                    <span class="t-muted">TTS model</span>
                    <input class="input" v-model="draft.ttsModel" placeholder="tts-1, gpt-4o-mini-tts, …" />
                    <span class="t-muted">Voices</span>
                    <input class="input" :value="draft.ttsVoices?.join(', ') || ''"
                      @input="draft.ttsVoices = $event.target.value.split(',').map(v => v.trim()).filter(Boolean)"
                      placeholder="comma-separated · e.g. alloy, echo, nova" />

                    <!-- Engine-specific params (Kokoro / VibeVoice / Chatterbox / XTTS / OpenAI) -->
                    <template v-if="paramSchema.length">
                      <div style="grid-column:1/-1;display:flex;align-items:baseline;gap:8px;margin-top:8px;padding-top:10px;border-top:1px dashed var(--border)">
                        <span class="t-eyebrow" style="font-size:10.5px">Engine parameters</span>
                        <span class="t-muted" style="font-size:11px">Blank = let the server use its default.</span>
                      </div>
                      <template v-for="f in paramSchema" :key="f.key">
                        <span class="t-muted" :title="f.help || ''"
                          :style="f.help ? 'cursor:help;text-decoration:underline dotted var(--border-strong);text-underline-offset:3px' : ''">
                          {{ f.label }}
                        </span>
                        <div style="display:flex;gap:6px;align-items:center">
                          <input v-if="f.type === 'number'" class="input" type="number"
                            :min="f.min" :max="f.max" :step="f.step"
                            :placeholder="f.placeholder || (f.default !== undefined ? `default ${f.default}` : '')"
                            :value="getParam(f.key) ?? ''"
                            @input="setParam(f.key, $event.target.value === '' ? undefined : Number($event.target.value))" />
                          <select v-else-if="f.type === 'select'" class="input"
                            :value="getParam(f.key) ?? f.default ?? ''"
                            @change="setParam(f.key, $event.target.value)">
                            <option v-for="opt in f.options" :key="opt" :value="opt">
                              {{ f.optionLabels?.[opt] ?? (opt === '' ? '— default —' : opt) }}
                            </option>
                          </select>
                          <label v-else-if="f.type === 'boolean'" style="display:flex;align-items:center;gap:6px;font-size:12.5px">
                            <input type="checkbox"
                              :checked="getParam(f.key) ?? f.default ?? false"
                              @change="setParam(f.key, $event.target.checked)" />
                            <span class="t-muted">{{ (getParam(f.key) ?? f.default) ? 'on' : 'off' }}</span>
                          </label>
                          <textarea v-else-if="f.type === 'textarea'" class="input"
                            rows="2" :placeholder="f.placeholder || ''"
                            :value="getParam(f.key) ?? ''"
                            @input="setParam(f.key, $event.target.value || undefined)" />
                          <input v-else class="input"
                            :placeholder="f.placeholder || ''"
                            :value="getParam(f.key) ?? ''"
                            @input="setParam(f.key, $event.target.value || undefined)" />
                          <button v-if="getParam(f.key) !== undefined" type="button"
                            class="btn sm ghost" :title="`Reset ${f.label}`"
                            style="padding:4px 8px" @click="resetParam(f.key)">↺</button>
                        </div>
                      </template>
                    </template>
                  </template>
                </div>
                <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">
                  <button class="btn ghost" @click="cancelEdit">Cancel</button>
                  <button class="btn primary" @click="saveDraft">Save</button>
                </div>
              </div>
            </template>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Quick setup tips</div>
          <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:14px;font-size:12.5px;color:var(--ink-2)">
            <div>
              <b style="font-size:12.5px;color:var(--ink)">Ollama</b>
              <p style="margin:4px 0 0;line-height:1.55">
                Install from <code>ollama.com</code>, then run <code style="background:var(--surface-3);padding:1px 5px;border-radius:3px">ollama pull llama3.1:8b</code>.
                Base URL <code style="background:var(--surface-3);padding:1px 5px;border-radius:3px">http://localhost:11434/v1</code>. No API key needed.
              </p>
            </div>
            <div>
              <b style="font-size:12.5px;color:var(--ink)">LM Studio</b>
              <p style="margin:4px 0 0;line-height:1.55">
                Open LM Studio, load a model, start the local server (default port 1234). Base URL <code style="background:var(--surface-3);padding:1px 5px;border-radius:3px">http://localhost:1234/v1</code>.
              </p>
            </div>
            <div>
              <b style="font-size:12.5px;color:var(--ink)">OpenAI</b>
              <p style="margin:4px 0 0;line-height:1.55">
                Add your key. Both chat and TTS are supported (only OpenAI-style provider here that exposes TTS).
              </p>
            </div>
            <div>
              <b style="font-size:12.5px;color:var(--ink)">Local TTS (openedai-speech)</b>
              <p style="margin:4px 0 0;line-height:1.55">
                Run an OpenAI-compatible TTS server locally — wraps XTTS, Piper, Kokoro, etc. and exposes <code>/v1/audio/speech</code>. Point JustWrite at its URL.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- ── APPEARANCE ────────────────────────────── -->
      <div v-else-if="active === 'appearance'" style="display:flex;flex-direction:column;gap:14px">
        <div class="card">
          <div class="card-title">Theme</div>
          <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px">
            <button v-for="t in THEMES" :key="t.id"
              class="theme-tile" :class="{ active: ui.theme === t.id }"
              @click="ui.setTheme(t.id)">
              <div class="theme-preview" :data-mode="t.id === 'system' ? 'split' : t.id">
                <span class="dot dot-bg" /><span class="dot dot-surf" /><span class="dot dot-ink" />
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-start;gap:2px">
                <b style="font-size:12.5px">{{ t.label }}</b>
                <span class="t-muted" style="font-size:11px;line-height:1.4">{{ t.hint }}</span>
              </div>
              <Icon v-if="ui.theme === t.id" name="Check" :size="14" style="margin-left:auto;color:var(--accent)" />
            </button>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Accent color</div>
          <p class="t-muted" style="font-size:12px;margin:0 0 12px">Used for selection, the active nav item, and link-style controls.</p>
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
            <button v-for="p in ACCENT_PRESETS" :key="p.hue"
              class="accent-swatch" :class="{ active: ui.accentHue === p.hue }"
              :title="p.name"
              :style="`background: oklch(0.62 0.1 ${p.hue})`"
              @click="ui.setAccentHue(p.hue)">
              <Icon v-if="ui.accentHue === p.hue" name="Check" :size="12" />
            </button>
            <span class="t-muted" style="font-size:11.5px;margin-left:12px">or</span>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px" class="t-muted">
              hue
              <input type="number" class="input" min="0" max="360" style="width:80px"
                :value="ui.accentHue" @input="ui.setAccentHue($event.target.value)" />
            </label>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Preview</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            <button class="btn">Button</button>
            <button class="btn primary">Primary</button>
            <button class="btn accent">Accent</button>
            <span class="chip"><span class="dot" />Chip</span>
            <span class="chip" style="background:var(--accent-soft);color:var(--accent-ink);border-color:var(--accent-line)">Selected</span>
            <input class="input" placeholder="An input field" style="max-width:200px" />
          </div>
        </div>
      </div>

      <!-- ── BACKUPS ───────────────────────────────── -->
      <div v-else-if="active === 'backups'" style="display:flex;flex-direction:column;gap:14px">
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
            <button class="btn primary" :disabled="backupBusy" @click="exportBackup">
              <Icon name="Export" :size="13" />
              {{ backupBusy ? "Exporting…" : "Export backup…" }}
            </button>
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
          <button class="btn btn-danger" @click="resetWorkspace">
            <Icon name="Alert" :size="13" />
            Reset workspace
          </button>
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
.btn-danger {
  border-color: var(--danger-line);
  color: var(--danger-ink);
  background: var(--surface);
}
.btn-danger:hover {
  background: var(--danger-bg);
}
</style>
