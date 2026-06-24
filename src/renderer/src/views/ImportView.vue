<script setup>
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import PaneHeader from "../components/PaneHeader.vue";
import { Icon } from "@delebash/llm-ui";
import { parseFile, normalizeHtml } from "../services/import/index.js";
import EntitySweepModal from "../components/EntitySweepModal.vue";
import { UiButton } from "@delebash/llm-ui";
import { UiInput } from "@delebash/llm-ui";
import { UiCheckbox } from "@delebash/llm-ui";
import JwSelect from "@renderer/components/ui/JwSelect.vue";

const NEW_PART = "__new__";

const router = useRouter();
const project = useProjectStore();
const ui = useUiStore();

// Wizard steps: "intent" → "preview" → done (navigates away).
const step = ref("intent");

// User intent — drives where ingest lands.
//   "edit"   — chapters append to the current project for continued writing.
//   "new"    — create a fresh project from the imported chapters.
//   "notes"  — file's sections become notes in the current project.
// "new" preserves the current project; the new one becomes active.
const intent = ref("edit");

// Notes intent uses the same parser (one detected section = one note), so
// "chapters" in this view doubles as the note list when intent === "notes".
// Keep label helpers in one place so the wizard reads naturally either way.
const itemLabel = computed(() => intent.value === "notes" ? "note" : "chapter");
const itemLabelPlural = computed(() => intent.value === "notes" ? "notes" : "chapters");

// "notes" intent options — applied to every imported note.
const notesTag = ref("note");
// notesAnchor encodes the same scheme as NotesView's JwSelect:
//   ""                       → story-wide (null)
//   "ch:<id>"                → { chapterId }
//   "scn:<chId>:<sceneId>"   → { chapterId, sceneId }
const notesAnchor = ref("");
const notesAnchorOptions = computed(() => {
  const opts = [{ label: "Story-wide (no anchor)", value: "" }];
  for (const c of project.allChapters || []) {
    opts.push({ label: `Ch. ${c.num} · ${c.title || "Untitled"}`, value: `ch:${c.id}` });
    const scenes = project.scenesFor(c.id) || [];
    scenes.forEach((s, i) => {
      opts.push({
        label: `   Ch. ${c.num} · Scene ${i + 1}${s.title ? ` — ${s.title}` : ""}`,
        value: `scn:${c.id}:${s.id}`,
      });
    });
  }
  return opts;
});
const notesTagSuggestions = computed(() => {
  const all = (project.notes || []).map((x) => x.tag).filter(Boolean);
  return Array.from(new Set(all));
});
function anchorFromKey(key) {
  if (!key) return null;
  if (key.startsWith("scn:")) {
    const [, chapterId, sceneId] = key.split(":");
    return { chapterId, sceneId };
  }
  if (key.startsWith("ch:")) {
    const [, chapterId] = key.split(":");
    return { chapterId };
  }
  return null;
}

// "edit" mode option — pick an existing part to append to, or NEW_PART
// to create one. Defaults to the last existing part (or NEW_PART when the
// current project has no parts yet).
const partOptions = computed(() => {
  const opts = (project.parts || []).map((p) => ({
    label: p.title || "Untitled part",
    value: p.id,
  }));
  opts.push({ label: "New part…", value: NEW_PART });
  return opts;
});
const partChoice = ref(
  project.parts?.length
    ? project.parts[project.parts.length - 1].id
    : NEW_PART,
);
const partTitle = ref("");

// "new" mode — title and author of the new project. Title auto-fills
// from the filename when a file is loaded; author is optional.
const newBookTitle = ref("");
const newBookAuthor = ref("");

// Offer to scan imported chapters for new entities after ingest. On by
// default for "new" (fresh project = empty story bible); off for "edit"
// (appending to a project that already has a story bible).
const scanAfterImport = ref(false);

// IDs of chapters just imported, handed to the sweep modal so it scans
// only the new ones rather than the whole project. Triggers the modal
// when set; cleared on the modal's close event.
const sweepChapterIds = ref(null);

// Normalize text on ingest (smart quotes, em-dashes, ellipses, NFC).
const normalize = ref(true);

// Parsing state.
const fileRef = ref(null);
const fileName = ref("");
const parsing = ref(false);
const parseError = ref("");
const warnings = ref([]);
const chapters = ref([]); // [{ title, html, drop }]

const validChapters = computed(() => chapters.value.filter((c) => !c.drop));
const totalWords = computed(() =>
  validChapters.value.reduce((sum, c) => sum + wordCount(c.html), 0));

function wordCount(html) {
  if (!html) return 0;
  const t = String(html).replace(/<[^>]+>/g, " ").trim();
  return t ? t.split(/\s+/).length : 0;
}

function preview(html) {
  if (!html) return "";
  const t = String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return t.length > 220 ? `${t.slice(0, 220)}…` : t;
}

async function onPickFile(e) {
  const files = Array.from(e.target.files || []);
  e.target.value = "";
  if (!files.length) return;
  await loadFiles(files);
}

async function onDrop(e) {
  e.preventDefault();
  const files = Array.from(e.dataTransfer?.files || []);
  if (!files.length) return;
  await loadFiles(files);
}

async function loadFiles(files) {
  parseError.value = "";
  warnings.value = [];
  chapters.value = [];
  fileName.value = files.length === 1
    ? files[0].name
    : `${files.length} files`;
  parsing.value = true;
  const errors = [];
  const accumulated = [];
  try {
    for (const file of files) {
      try {
        const result = await parseFile(file);
        for (const w of (result.warnings || [])) {
          warnings.value.push(files.length > 1 ? `${file.name}: ${w}` : w);
        }
        let parsed = result.chapters || [];
        if (normalize.value) {
          parsed = parsed.map((c) => ({ ...c, html: normalizeHtml(c.html || "") }));
        }
        const stemForUntitled = file.name.replace(/\.[^.]+$/, "") || "Untitled";
        const mapped = parsed.map((c, i) => ({
          title: c.title || (intent.value === "notes"
            ? (parsed.length === 1 ? stemForUntitled : `${stemForUntitled} ${i + 1}`)
            : `Chapter ${i + 1}`),
          html: c.html || "",
          drop: false,
        }));
        accumulated.push(...mapped);
      } catch (err) {
        errors.push(`${file.name}: ${err?.message || String(err)}`);
      }
    }
    chapters.value = accumulated;
    if (errors.length) {
      // Surface per-file errors without blocking the rest of the import.
      parseError.value = errors.join(" · ");
    }
    if (!chapters.value.length) {
      if (!errors.length) parseError.value = "No content found.";
    } else {
      // Seed the title fields from the first file so the wizard isn't a
      // blank box. The user can edit before confirming.
      const stem = files[0].name.replace(/\.[^.]+$/, "");
      if (partChoice.value === NEW_PART && !partTitle.value) partTitle.value = stem;
      if (!newBookTitle.value) newBookTitle.value = stem;
      scanAfterImport.value = false;
      step.value = "preview";
    }
  } finally {
    parsing.value = false;
  }
}

function dropChapter(idx) {
  chapters.value[idx].drop = !chapters.value[idx].drop;
}

function restart() {
  step.value = "intent";
  chapters.value = [];
  warnings.value = [];
  parseError.value = "";
  fileName.value = "";
}

// Holds the post-ingest navigation target so the entity-sweep flow can
// still land the user where they expected after the modal closes.
const pendingNav = ref(null);

function ingest() {
  const list = validChapters.value;
  if (!list.length) return;
  const count = list.length;
  const plural = count === 1 ? "" : "s";
  let chapterIds = [];
  let nav = "/chapters";
  let toast = "";

  if (intent.value === "notes") {
    const { noteIds } = project.importNotes({
      notes: list,
      tag: (notesTag.value || "note").trim() || "note",
      anchor: anchorFromKey(notesAnchor.value),
    });
    nav = noteIds[0] ? `/notes/${noteIds[0]}` : "/notes";
    toast = `Imported ${count} note${plural}.`;
    ui.showToast({ message: toast });
    router.push(nav);
    return;
  }

  if (intent.value === "new") {
    const title = newBookTitle.value.trim() || fileName.value.replace(/\.[^.]+$/, "") || "Imported book";
    project.createProject({ title, author: newBookAuthor.value.trim() });
    chapterIds = project.importChapters({ chapters: list, status: "draft" }).chapterIds;
    nav = chapterIds[0] ? `/chapters/${chapterIds[0]}` : "/chapters";
    toast = `Started "${title}" with ${count} chapter${plural}.`;
  } else {
    // "edit" — append to current project.
    const makeNewPart = partChoice.value === NEW_PART;
    chapterIds = project.importChapters({
      chapters: list,
      partId: makeNewPart ? "" : partChoice.value,
      partTitle: makeNewPart ? (partTitle.value || fileName.value || "Imported") : "",
      status: "draft",
    }).chapterIds;
    nav = chapterIds[0] ? `/chapters/${chapterIds[0]}` : "/chapters";
    toast = `Imported ${count} chapter${plural}.`;
  }

  if (scanAfterImport.value && chapterIds.length) {
    // Show the sweep modal in-place; nav happens when its review is
    // dismissed (committed or closed).
    pendingNav.value = { route: nav, toast };
    sweepChapterIds.value = chapterIds;
    return;
  }

  ui.showToast({ message: toast });
  router.push(nav);
}

function finishAfterSweep() {
  sweepChapterIds.value = null;
  const target = pendingNav.value;
  pendingNav.value = null;
  if (target) {
    if (target.toast) ui.showToast({ message: target.toast });
    router.push(target.route);
  }
}
</script>

<template>
  <PaneHeader :eyebrow="$t('panes.import.eyebrow')" :title="$t('nav.import')" help-key="import-and-export#import">
    <router-link to="/" custom v-slot="{ navigate }">
      <UiButton intent="ghost" size="small" @click="navigate">Cancel</UiButton>
    </router-link>
  </PaneHeader>

  <div class="pane-card">
    <div class="scrollarea">
      <p class="im-desc">
        <strong>Import</strong> brings outside files into your project — <code>.docx</code>,
        <code>.epub</code>, <code>.odt</code>, <code>.md</code>, <code>.txt</code>. Choose a mode
        (add to your current draft, start a new book, or bring sections
        in as notes), drop the file, review the parser's chapter split, confirm. Embedded images
        are extracted automatically.
      </p>

      <!-- ── STEP 1: Intent + file picker ────────────────────────── -->
      <div v-if="step === 'intent'" class="wiz">
        <section class="wiz-section">
          <h2 class="wiz-h">How will you use this file?</h2>
          <div class="intent-grid" role="radiogroup" aria-label="Import intent">
            <label class="intent-card" :class="{ active: intent === 'edit' }"
              role="radio" :aria-checked="intent === 'edit'">
              <input type="radio" v-model="intent" value="edit" />
              <Icon name="Quote" :size="20" />
              <div class="intent-body">
                <div class="intent-title">Add existing</div>
                <div class="intent-sub">Append chapters to your <em>current</em> project for continued writing or revising.</div>
              </div>
            </label>
            <label class="intent-card" :class="{ active: intent === 'new' }"
              role="radio" :aria-checked="intent === 'new'">
              <input type="radio" v-model="intent" value="new" />
              <Icon name="Book" :size="20" />
              <div class="intent-body">
                <div class="intent-title">Start a new book</div>
                <div class="intent-sub">Create a fresh project from this file. Your current project stays untouched.</div>
              </div>
            </label>
            <label class="intent-card" :class="{ active: intent === 'notes' }"
              role="radio" :aria-checked="intent === 'notes'">
              <input type="radio" v-model="intent" value="notes" />
              <Icon name="Note" :size="20" />
              <div class="intent-body">
                <div class="intent-title">Add notes</div>
                <div class="intent-sub">Bring sections of this file in as notes on your <em>current</em> project. Each heading becomes one note; a flat file becomes one.</div>
              </div>
            </label>
          </div>
        </section>

        <section class="wiz-section" v-if="intent === 'new'">
          <h2 class="wiz-h">New project details</h2>
          <div class="opt-row">
            <span class="opt-label">Title</span>
            <UiInput class="part-input" v-model="newBookTitle" placeholder="Book title (defaults to file name)" />
          </div>
          <div class="opt-row">
            <span class="opt-label">Author</span>
            <UiInput class="part-input" v-model="newBookAuthor" placeholder="Author (optional)" />
          </div>
          <div class="opt-row">
            <UiCheckbox v-model="normalize">Clean up smart quotes, em-dashes, ellipses, whitespace</UiCheckbox>
          </div>
        </section>

        <section class="wiz-section" v-else-if="intent === 'edit'">
          <h2 class="wiz-h">Where should the chapters land?</h2>
          <div class="opt-row">
            <span class="opt-label">Add to part</span>
            <JwSelect class="part-input"
              v-model="partChoice"
              :options="partOptions"
              placeholder="Choose a part" />
            <UiInput v-if="partChoice === NEW_PART"
              class="part-input"
              v-model="partTitle"
              placeholder="Part title (defaults to file name)" />
          </div>
          <div class="opt-row">
            <UiCheckbox v-model="normalize">Clean up smart quotes, em-dashes, ellipses, whitespace</UiCheckbox>
          </div>
        </section>

        <section class="wiz-section" v-else-if="intent === 'notes'">
          <h2 class="wiz-h">Notes options</h2>
          <div class="opt-row">
            <span class="opt-label">Tag</span>
            <UiInput class="part-input" v-model="notesTag" placeholder="note" list="jw-notes-tag-list" />
            <datalist id="jw-notes-tag-list">
              <option v-for="t in notesTagSuggestions" :key="t" :value="t" />
            </datalist>
          </div>
          <div class="opt-row">
            <span class="opt-label">Pin to</span>
            <JwSelect class="part-input"
              v-model="notesAnchor"
              :options="notesAnchorOptions"
              placeholder="Story-wide" />
          </div>
          <div class="opt-row">
            <UiCheckbox v-model="normalize">Clean up smart quotes, em-dashes, ellipses, whitespace</UiCheckbox>
          </div>
        </section>

        <section class="wiz-section">
          <h2 class="wiz-h">Choose a file</h2>
          <label class="dropzone"
            @dragover.prevent @drop="onDrop">
            <input ref="fileRef" type="file"
              accept=".docx,.epub,.odt,.txt,.md,.markdown"
              multiple
              style="display:none"
              @change="onPickFile" />
            <Icon name="Plus" :size="22" />
            <div class="dz-title">Drop {{ intent === "notes" ? "files" : "a file" }} here, or click to choose</div>
            <div class="dz-sub">
              Supports <code>.docx</code> · <code>.epub</code> · <code>.odt</code> · <code>.txt</code> · <code>.md</code>
              <span v-if="intent === 'notes'"> — drop multiple files to import them in one batch</span>
            </div>
          </label>

          <div v-if="parsing" class="wiz-status">
            <Icon name="Refresh" :size="14" /> Parsing {{ fileName }}…
          </div>
          <div v-if="parseError" class="wiz-error">
            <Icon name="Alert" :size="14" /> {{ parseError }}
          </div>
        </section>
      </div>

      <!-- ── STEP 2: Preview ─────────────────────────────────────── -->
      <div v-else-if="step === 'preview'" class="wiz">
        <section class="wiz-section">
          <div class="preview-summary">
            <div class="ps-stats">
              <div class="ps-stat">
                <div class="ps-num">{{ validChapters.length }}</div>
                <div class="ps-lbl">{{ validChapters.length === 1 ? itemLabel : itemLabelPlural }}</div>
              </div>
              <div class="ps-stat">
                <div class="ps-num">{{ totalWords.toLocaleString() }}</div>
                <div class="ps-lbl">words</div>
              </div>
              <div class="ps-stat">
                <div class="ps-num">{{ fileName }}</div>
                <div class="ps-lbl">source</div>
              </div>
            </div>
            <UiButton intent="ghost" size="small" @click="restart">
              <Icon name="ChevRight" :size="11" style="transform:rotate(180deg)" />
              Choose a different file
            </UiButton>
          </div>

          <div v-if="warnings.length" class="wiz-warnings">
            <Icon name="Alert" :size="13" />
            <div>
              <div style="font-weight:600">Notes from the parser</div>
              <ul>
                <li v-for="(w, i) in warnings" :key="i">{{ w }}</li>
              </ul>
            </div>
          </div>
        </section>

        <section class="wiz-section">
          <h2 class="wiz-h">Detected {{ itemLabelPlural }}</h2>
          <p class="t-muted" style="font-size:12.5px;margin:0 0 12px">
            Edit titles, or drop {{ itemLabelPlural }} you don't want.
          </p>
          <ol class="ch-list">
            <li v-for="(c, i) in chapters" :key="i" class="ch-row" :class="{ dropped: c.drop }">
              <span class="ch-num">{{ i + 1 }}</span>
              <UiInput class="ch-title" v-model="c.title" :placeholder="`Untitled ${itemLabel}`" :disabled="c.drop" />
              <span class="ch-words">{{ wordCount(c.html).toLocaleString() }} w</span>
              <UiButton intent="ghost" size="small" class="ch-drop"
                @click="dropChapter(i)"
                v-tooltip.bottom="c.drop ? `Keep this ${itemLabel}` : `Drop this ${itemLabel}`">
                <Icon :name="c.drop ? 'Plus' : 'Trash'" :size="12" />
                {{ c.drop ? "Keep" : "Drop" }}
              </UiButton>
              <div class="ch-preview" v-if="!c.drop">{{ preview(c.html) }}</div>
              <div class="ch-preview ch-dropped-msg" v-else>Will not be imported.</div>
            </li>
          </ol>
        </section>

        <section class="wiz-section" v-if="intent !== 'notes'">
          <h2 class="wiz-h">After import</h2>
          <UiCheckbox v-model="scanAfterImport">Scan the imported chapters for new characters, locations, and objects</UiCheckbox>
          <span class="t-muted opt-hint" v-if="scanAfterImport">
            Slower for long books — runs one LLM call per chapter. You'll review every proposal before anything is added.
          </span>
        </section>

        <section class="wiz-section wiz-actions">
          <UiButton intent="ghost" @click="restart">Start over</UiButton>
          <UiButton intent="primary" :disabled="!validChapters.length" @click="ingest">
            <Icon name="Check" :size="13" />
            {{ intent === "new" ? "Create book"
              : intent === "notes" ? "Import notes"
              : "Import chapters" }}
          </UiButton>
        </section>
      </div>
    </div>
  </div>

  <EntitySweepModal v-if="sweepChapterIds"
    :chapter-ids="sweepChapterIds"
    @close="finishAfterSweep"
    @committed="finishAfterSweep" />
</template>

<style scoped>
.wiz { padding: 8px 4px 32px; display: flex; flex-direction: column; gap: 32px; }
.wiz-section { display: flex; flex-direction: column; gap: 12px; }
.wiz-h {
  font-family: var(--font-mono);
  font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--muted);
  margin: 0;
  display: flex; align-items: center; gap: 10px;
}
.wiz-h::after { content: ""; flex: 1; height: 1px; background: var(--border); }

/* Intent cards */
.intent-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.intent-card {
  display: grid; grid-template-columns: auto 1fr; gap: 14px;
  align-items: flex-start;
  padding: 16px 18px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  cursor: pointer;
  transition: border-color .15s, background .15s;
}
.intent-card:hover { border-color: var(--accent-line); }
.intent-card.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.intent-card input { display: none; }
.intent-body { min-width: 0; }
.intent-title { font-family: var(--font-serif); font-size: 16px; font-weight: 600; }
.intent-sub { font-size: 12.5px; color: var(--muted); line-height: 1.45; margin-top: 4px; }

/* Options */
.opt-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.opt-hint { font-size: 12px; color: var(--muted); font-style: italic; }
.opt-label {
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--muted);
  min-width: 56px;
}
.part-input {
  flex: 1; min-width: 200px;
  font-family: var(--font-serif); font-size: 14px;
  padding: 6px 10px;
  border: 1px solid var(--border); border-radius: 6px;
  background: var(--surface);
  color: var(--ink);
}
.part-input:focus { border-color: var(--accent); outline: none; box-shadow: 0 0 0 3px var(--accent-soft); }

/* Dropzone */
.dropzone {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; padding: 40px 20px;
  border: 2px dashed var(--border);
  border-radius: 12px;
  background: var(--surface-2);
  cursor: pointer;
  transition: border-color .15s, background .15s;
}
.dropzone:hover { border-color: var(--accent); background: var(--accent-soft); }
.dz-title { font-family: var(--font-serif); font-size: 15px; }
.dz-sub { font-size: 12px; color: var(--muted); }
.dz-sub code {
  font-family: var(--font-mono); font-size: 11px;
  padding: 1px 5px; border-radius: 3px;
  background: var(--surface-3);
}

.wiz-status, .wiz-error {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 12.5px; padding: 8px 12px; border-radius: 6px;
}
.wiz-status { color: var(--muted); background: var(--surface-2); }
.wiz-error  { color: var(--danger-ink, #c33); background: color-mix(in oklab, var(--danger-ink, #c33) 12%, transparent); }

/* Preview summary */
.preview-summary {
  display: flex; justify-content: space-between; align-items: center;
  gap: 16px; padding: 14px 16px;
  border: 1px solid var(--border-soft); border-radius: 10px;
  background: var(--surface-2);
}
.ps-stats { display: flex; gap: 28px; }
.ps-stat { min-width: 0; }
.ps-num {
  font-family: var(--font-serif); font-size: 22px; font-weight: 500;
  line-height: 1; letter-spacing: -0.01em;
  max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ps-lbl { font-family: var(--font-mono); font-size: 10.5px; color: var(--muted); letter-spacing: 0.08em; text-transform: uppercase; margin-top: 4px; }

.wiz-warnings {
  display: flex; gap: 10px; align-items: flex-start;
  padding: 10px 14px;
  border-radius: 8px;
  background: color-mix(in oklab, var(--gold) 12%, transparent);
  color: var(--ink-2);
  font-size: 12.5px;
}
.wiz-warnings ul { margin: 4px 0 0; padding-left: 16px; }
.wiz-warnings li { margin: 2px 0; }

/* Chapter list */
.ch-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.ch-row {
  display: grid;
  grid-template-columns: 32px 1fr auto auto;
  grid-template-areas:
    "num title  words drop"
    "num prev   prev  prev";
  gap: 6px 12px; align-items: center;
  padding: 12px 14px;
  border: 1px solid var(--border-soft); border-radius: 8px;
  background: var(--surface);
  transition: opacity .15s, background .15s;
}
.ch-row.dropped { opacity: 0.55; background: var(--surface-2); }
.ch-num {
  grid-area: num;
  font-family: var(--font-mono); font-size: 12px; color: var(--muted);
  text-align: center;
}
.ch-title {
  grid-area: title;
  font-family: var(--font-serif); font-size: 15px; font-weight: 500;
  padding: 4px 8px; margin-left: -8px;
  border: 1px solid transparent; border-radius: 4px;
  background: transparent; color: var(--ink);
  min-width: 0;
}
.ch-title:hover { border-color: var(--border-soft); }
.ch-title:focus { border-color: var(--accent); background: var(--surface-2); outline: none; }
.ch-title:disabled { color: var(--muted); text-decoration: line-through; }
.ch-words {
  grid-area: words;
  font-family: var(--font-mono); font-size: 11px; color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.ch-drop { grid-area: drop; }
.ch-preview {
  grid-area: prev;
  font-family: var(--font-serif); font-size: 12.5px; color: var(--muted);
  font-style: italic; line-height: 1.5;
  padding-left: 2px; max-width: 78ch;
}
.ch-dropped-msg { font-style: normal; color: var(--danger-ink, #c33); font-family: var(--font-ui); }

/* Actions */
.wiz-actions { flex-direction: row; justify-content: flex-end; gap: 10px; margin-top: 8px; }

@media (max-width: 720px) {
  .intent-grid { grid-template-columns: 1fr; }
  .ps-stats { gap: 18px; }
}

.im-desc {
  font-size: 14px; line-height: 1.55; color: var(--muted);
  margin: 0 0 18px;
  padding: 16px 4px 0;
}
.im-desc strong { color: var(--ink-2); font-weight: 600; }
.im-desc code { font-family: var(--font-mono); font-size: 0.92em; padding: 0 4px; background: var(--surface-3); border-radius: 4px; }
</style>
