<script setup>
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import PaneHeader from "../components/PaneHeader.vue";
import Icon from "../components/Icon.vue";
import { parseFile, normalizeHtml } from "../services/import/index.js";
import EntitySweepModal from "../components/EntitySweepModal.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";

const router = useRouter();
const project = useProjectStore();
const ui = useUiStore();

// Wizard steps: "intent" → "preview" → done (navigates away).
const step = ref("intent");

// User intent — drives where ingest lands.
//   "edit"   — chapters append to the current project for continued writing.
//   "new"    — create a fresh project from the imported chapters.
//   "narrate" — create a fresh project AND jump to Studio Cast for TTS.
// Both "new" and "narrate" preserve the current project; the new one
// becomes active.
const intent = ref("edit");

// "edit" mode option — append to last part vs. land in a new part.
const newPart = ref(false);
const partTitle = ref("");

// "new" mode — title and author of the new project. Title auto-fills
// from the filename when a file is loaded; author is optional.
const newBookTitle = ref("");
const newBookAuthor = ref("");

// Offer to scan imported chapters for new entities after ingest. On by
// default for "new" / "narrate" (fresh project = whole cast unmapped);
// off for "edit" (appending to a project that already has a story bible).
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
  return t.length > 220 ? t.slice(0, 220) + "…" : t;
}

async function onPickFile(e) {
  const file = (e.target.files || [])[0];
  e.target.value = "";
  if (!file) return;
  await loadFile(file);
}

async function onDrop(e) {
  e.preventDefault();
  const file = (e.dataTransfer?.files || [])[0];
  if (!file) return;
  await loadFile(file);
}

async function loadFile(file) {
  parseError.value = "";
  warnings.value = [];
  chapters.value = [];
  fileName.value = file.name;
  parsing.value = true;
  try {
    const result = await parseFile(file);
    warnings.value = result.warnings || [];
    let parsed = result.chapters || [];
    if (normalize.value) {
      parsed = parsed.map((c) => ({ ...c, html: normalizeHtml(c.html || "") }));
    }
    chapters.value = parsed.map((c, i) => ({
      title: c.title || `Chapter ${i + 1}`,
      html: c.html || "",
      drop: false,
    }));
    if (!chapters.value.length) {
      parseError.value = "No content found in this file.";
    } else {
      // Seed the title fields from the filename so the wizard isn't a
      // blank box. The user can edit before confirming.
      const stem = file.name.replace(/\.[^.]+$/, "");
      if (newPart.value && !partTitle.value) partTitle.value = stem;
      if (!newBookTitle.value) newBookTitle.value = stem;
      scanAfterImport.value = false;
      step.value = "preview";
    }
  } catch (err) {
    parseError.value = err?.message || String(err);
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

  if (intent.value === "new" || intent.value === "narrate") {
    const title = newBookTitle.value.trim() || fileName.value.replace(/\.[^.]+$/, "") || "Imported book";
    project.createProject({ title, author: newBookAuthor.value.trim() });
    chapterIds = project.importChapters({ chapters: list, status: "draft" }).chapterIds;
    if (intent.value === "narrate") {
      nav = "/studio/cast";
      toast = `Started "${title}" — opening Studio.`;
    } else {
      nav = chapterIds[0] ? `/chapters/${chapterIds[0]}` : "/chapters";
      toast = `Started "${title}" with ${count} chapter${plural}.`;
    }
  } else {
    // "edit" — append to current project.
    chapterIds = project.importChapters({
      chapters: list,
      partTitle: newPart.value ? (partTitle.value || fileName.value || "Imported") : "",
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
  <PaneHeader eyebrow="Manuscript" title="Import">
    <router-link to="/" custom v-slot="{ navigate }">
      <JwButton intent="ghost" size="small" @click="navigate">Cancel</JwButton>
    </router-link>
  </PaneHeader>

  <div class="pane-card">
    <div class="scrollarea">
      <!-- ── STEP 1: Intent + file picker ────────────────────────── -->
      <div v-if="step === 'intent'" class="wiz">
        <section class="wiz-section">
          <h2 class="wiz-h">How will you use this manuscript?</h2>
          <div class="intent-grid">
            <label class="intent-card" :class="{ active: intent === 'edit' }">
              <input type="radio" v-model="intent" value="edit" />
              <Icon name="Quote" :size="20" />
              <div class="intent-body">
                <div class="intent-title">Resume editing</div>
                <div class="intent-sub">Append chapters to your <em>current</em> project for continued writing or revising.</div>
              </div>
            </label>
            <label class="intent-card" :class="{ active: intent === 'new' }">
              <input type="radio" v-model="intent" value="new" />
              <Icon name="Book" :size="20" />
              <div class="intent-body">
                <div class="intent-title">Start a new book</div>
                <div class="intent-sub">Create a fresh project from this file. Your current project stays untouched.</div>
              </div>
            </label>
            <label class="intent-card" :class="{ active: intent === 'narrate' }">
              <input type="radio" v-model="intent" value="narrate" />
              <Icon name="Play" :size="20" />
              <div class="intent-body">
                <div class="intent-title">Narrate as audiobook</div>
                <div class="intent-sub">Create a fresh project from this file, then drop into Studio Cast for TTS.</div>
              </div>
            </label>
          </div>
        </section>

        <section class="wiz-section" v-if="intent === 'new' || intent === 'narrate'">
          <h2 class="wiz-h">New project details</h2>
          <div class="opt-row">
            <span class="opt-label">Title</span>
            <input class="part-input" v-model="newBookTitle" placeholder="Book title (defaults to file name)" />
          </div>
          <div class="opt-row">
            <span class="opt-label">Author</span>
            <input class="part-input" v-model="newBookAuthor" placeholder="Author (optional)" />
          </div>
          <div class="opt-row">
            <label class="opt">
              <input type="checkbox" v-model="normalize" />
              <span>Clean up smart quotes, em-dashes, ellipses, whitespace</span>
            </label>
          </div>
        </section>

        <section class="wiz-section" v-else-if="intent === 'edit'">
          <h2 class="wiz-h">Where should the chapters land?</h2>
          <div class="opt-row">
            <label class="opt">
              <input type="checkbox" v-model="newPart" />
              <span>Add to a new part</span>
            </label>
            <input v-if="newPart"
              class="part-input"
              v-model="partTitle"
              placeholder="Part title (defaults to file name)" />
            <span v-else class="t-muted opt-hint">Appends to the last existing part.</span>
          </div>
          <div class="opt-row">
            <label class="opt">
              <input type="checkbox" v-model="normalize" />
              <span>Clean up smart quotes, em-dashes, ellipses, whitespace</span>
            </label>
          </div>
        </section>

        <section class="wiz-section">
          <h2 class="wiz-h">Choose a file</h2>
          <label class="dropzone"
            @dragover.prevent @drop="onDrop">
            <input ref="fileRef" type="file"
              accept=".docx,.epub,.odt,.txt,.md,.markdown"
              style="display:none"
              @change="onPickFile" />
            <Icon name="Plus" :size="22" />
            <div class="dz-title">Drop a file here, or click to choose</div>
            <div class="dz-sub">Supports <code>.docx</code> · <code>.epub</code> · <code>.odt</code> · <code>.txt</code> · <code>.md</code></div>
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
                <div class="ps-lbl">{{ validChapters.length === 1 ? "chapter" : "chapters" }}</div>
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
            <JwButton intent="ghost" size="small" @click="restart">
              <Icon name="ChevRight" :size="11" style="transform:rotate(180deg)" />
              Choose a different file
            </JwButton>
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
          <h2 class="wiz-h">Detected chapters</h2>
          <p class="t-muted" style="font-size:12.5px;margin:0 0 12px">
            Edit titles, or drop chapters you don't want.
          </p>
          <ol class="ch-list">
            <li v-for="(c, i) in chapters" :key="i" class="ch-row" :class="{ dropped: c.drop }">
              <span class="ch-num">{{ i + 1 }}</span>
              <input class="ch-title" v-model="c.title" placeholder="Untitled chapter" :disabled="c.drop" />
              <span class="ch-words">{{ wordCount(c.html).toLocaleString() }} w</span>
              <JwButton intent="ghost" size="small" class="ch-drop"
                @click="dropChapter(i)"
                :title="c.drop ? 'Keep this chapter' : 'Drop this chapter'">
                <Icon :name="c.drop ? 'Plus' : 'Trash'" :size="12" />
                {{ c.drop ? "Keep" : "Drop" }}
              </JwButton>
              <div class="ch-preview" v-if="!c.drop">{{ preview(c.html) }}</div>
              <div class="ch-preview ch-dropped-msg" v-else>Will not be imported.</div>
            </li>
          </ol>
        </section>

        <section class="wiz-section">
          <h2 class="wiz-h">After import</h2>
          <label class="opt">
            <input type="checkbox" v-model="scanAfterImport" />
            <span>Scan the imported chapters for new characters, locations, and objects</span>
          </label>
          <span class="t-muted opt-hint" v-if="scanAfterImport">
            Slower for long books — runs one LLM call per chapter. You'll review every proposal before anything is added.
          </span>
        </section>

        <section class="wiz-section wiz-actions">
          <JwButton intent="ghost" @click="restart">Start over</JwButton>
          <JwButton intent="primary" :disabled="!validChapters.length" @click="ingest">
            <Icon name="Check" :size="13" />
            {{ intent === "narrate" ? "Import & open Studio"
              : intent === "new" ? "Create book"
              : "Import chapters" }}
          </JwButton>
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
.intent-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
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
.opt { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
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

@media (max-width: 900px) {
  .intent-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 720px) {
  .intent-grid { grid-template-columns: 1fr; }
  .ps-stats { gap: 18px; }
}
</style>
