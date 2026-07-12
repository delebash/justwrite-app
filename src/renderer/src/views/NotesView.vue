<script setup>
import { computed, ref, watch } from "vue";
import { UiInput } from "@delebash/llm-ui";
import { UiButton } from "@delebash/llm-ui";
import { UiSelect } from "@delebash/llm-ui";
import { UiTag } from "@delebash/llm-ui";
import { UiTable } from "@delebash/llm-ui";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRouter } from "vue-router";
import { Icon } from "@delebash/llm-ui";
import RichEditor from "../components/RichEditor.vue";
import { Breadcrumb } from "@delebash/llm-ui";
import PaneHeader from "../components/PaneHeader.vue";
import { promptDialog } from "@delebash/llm-ui";
import { NEW_ENTITY_META } from "../services/entityMeta.js";
import { parseFile } from "../services/import/index.js";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();

const n = computed(() => props.id ? project.noteById(props.id) : null);

function update(k, v) { project.updateNote(n.value.id, { [k]: v }); }

// ── Tag typeahead ────────────────────────────────────────────────────
const tagSuggestOpen = ref(false);
const tagSuggestIndex = ref(0);
const tagSuggestions = computed(() => {
  if (!n.value) return [];
  const q = String(n.value.tag || "").trim().toLowerCase();
  const all = project.notes.map((x) => x.tag).filter(Boolean);
  const uniq = Array.from(new Set(all));
  return uniq
    .filter((t) => t !== n.value.tag)
    .filter((t) => !q || t.toLowerCase().includes(q))
    .slice(0, 8);
});
function onTagFocus() { tagSuggestOpen.value = true; tagSuggestIndex.value = 0; }
function onTagBlur() { setTimeout(() => { tagSuggestOpen.value = false; }, 120); }

watch(() => n.value?.id, () => {
  tagSuggestOpen.value = false;
  tagSuggestIndex.value = 0;
});
function pickTag(t) { update("tag", t); tagSuggestOpen.value = false; }
function onTagKeydown(e) {
  const list = tagSuggestions.value;
  if (e.key === "ArrowDown" && list.length) {
    e.preventDefault();
    tagSuggestOpen.value = true;
    tagSuggestIndex.value = (tagSuggestIndex.value + 1) % list.length;
  } else if (e.key === "ArrowUp" && list.length) {
    e.preventDefault();
    tagSuggestOpen.value = true;
    tagSuggestIndex.value = (tagSuggestIndex.value - 1 + list.length) % list.length;
  } else if (e.key === "Enter" && tagSuggestOpen.value && list.length) {
    e.preventDefault();
    pickTag(list[tagSuggestIndex.value]);
  } else if (e.key === "Escape" && tagSuggestOpen.value) {
    e.preventDefault();
    tagSuggestOpen.value = false;
  }
}

async function addNote() {
  const title = await promptDialog(NEW_ENTITY_META.notes);
  if (!title) return;
  const id = project.addNote({ title }); ui.select("notes", id); router.push(`/notes/${id}`);
}

const fileInput = ref(null);
const importing = ref(false);
function pickNoteFile() { fileInput.value?.click(); }
async function onFileChange(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  if (!files.length) return;
  importing.value = true;
  const noteInputs = [];
  const failures = [];
  const warnings = [];
  try {
    for (const file of files) {
      try {
        const parsed = await parseFile(file);
        const baseName = file.name.replace(/\.[^.]+$/, "") || "Imported note";
        const sections = (parsed.chapters || []).filter((c) => c && (c.html || c.title));
        if (!sections.length) {
          failures.push(`${file.name} — empty`);
          continue;
        }
        for (let i = 0; i < sections.length; i++) {
          const c = sections[i];
          noteInputs.push({
            title: (c.title || "").trim() || (sections.length > 1 ? `${baseName} — ${i + 1}` : baseName),
            html: c.html || "",
          });
        }
        for (const w of parsed.warnings || []) warnings.push(w);
      } catch (err) {
        failures.push(`${file.name} — ${err.message || err}`);
      }
    }
    if (!noteInputs.length) {
      ui.showToast({ message: failures.length ? `Couldn't import: ${failures[0]}` : "Nothing to import." });
      return;
    }
    const { noteIds } = project.importNotes({ notes: noteInputs });
    if (!noteIds.length) {
      ui.showToast({ message: "Nothing to import." });
      return;
    }
    for (const w of warnings.slice(0, 2)) ui.showToast({ message: w });
    for (const f of failures.slice(0, 2)) ui.showToast({ message: `Skipped ${f}` });
    ui.select("notes", noteIds[0]);
    router.push(`/notes/${noteIds[0]}`);
  } finally {
    importing.value = false;
  }
}

// ── Anchor ───────────────────────────────────────────────────────────
const anchorOptions = computed(() => {
  const opts = [{ label: "Story-wide (no anchor)", value: "" }];
  for (const c of project.allChapters) {
    opts.push({ label: `Ch. ${c.num} · ${c.title || "Untitled"}`, value: `ch:${c.id}` });
    const scenes = project.scenesFor(c.id);
    scenes.forEach((s, i) => {
      opts.push({
        label: `   Ch. ${c.num} · Scene ${i + 1}${s.title ? ` — ${s.title}` : ""}`,
        value: `scn:${c.id}:${s.id}`,
      });
    });
  }
  return opts;
});
const anchorValue = computed({
  get() {
    const a = n.value?.anchor;
    if (!a) return "";
    if (a.sceneId) return `scn:${a.chapterId}:${a.sceneId}`;
    return `ch:${a.chapterId}`;
  },
  set(v) {
    if (!n.value) return;
    if (!v) { project.updateNote(n.value.id, { anchor: null }); return; }
    if (v.startsWith("scn:")) {
      const [, chapterId, sceneId] = v.split(":");
      project.updateNote(n.value.id, { anchor: { chapterId, sceneId } });
    } else if (v.startsWith("ch:")) {
      const [, chapterId] = v.split(":");
      project.updateNote(n.value.id, { anchor: { chapterId } });
    }
  },
});

function anchorLabelFor(note) {
  const a = note?.anchor;
  if (!a) return "Story-wide";
  const c = project.chapterById(a.chapterId);
  if (!c) return "Stale anchor";
  if (!a.sceneId) return `Ch. ${c.num}`;
  const scenes = project.scenesFor(c.id);
  const idx = scenes.findIndex((s) => s.id === a.sceneId);
  return idx >= 0 ? `Ch. ${c.num} · Scene ${idx + 1}` : `Ch. ${c.num}`;
}

function deleteNote() {
  if (!n.value) return;
  project.removeNote(n.value.id);
  const next = project.notes[0];
  if (next) { ui.select("notes", next.id); router.push(`/notes/${next.id}`); } else router.push("/notes");
}

// ── List mode ────────────────────────────────────────────────────────
const globalQuery = ref("");
const selectedTags = ref(new Set());
const selectedAnchor = ref(null);

function onGlobalInput(e) { globalQuery.value = e.target.value; }
function toggleTag(t) {
  const next = new Set(selectedTags.value);
  if (next.has(t)) next.delete(t); else next.add(t);
  selectedTags.value = next;
}
function clearAllFilters() {
  globalQuery.value = "";
  selectedTags.value = new Set();
  selectedAnchor.value = null;
}

const allTags = computed(() => {
  const set = new Set();
  for (const note of project.notes) if (note.tag) set.add(note.tag);
  return [...set].sort();
});

const rows = computed(() => project.notes);
const filteredRows = computed(() => {
  const rs = rows.value;
  if (selectedTags.value.size === 0 && !selectedAnchor.value) return rs;
  return rs.filter((r) => {
    if (selectedTags.value.size > 0 && !selectedTags.value.has(r.tag)) return false;
    if (selectedAnchor.value === "storywide" && r.anchor) return false;
    if (selectedAnchor.value === "anchored" && !r.anchor) return false;
    return true;
  });
});

const hasActiveFacets = computed(() =>
  selectedTags.value.size > 0 || !!selectedAnchor.value,
);

const columns = [
  { accessorKey: "title",   header: "Title",   sortable: true,  headerStyle: "min-width: 200px" },
  { accessorKey: "tag",     header: "Tag",     sortable: true,  headerStyle: "min-width: 120px" },
  { accessorKey: "anchor",  header: "Anchor",  sortable: false, headerStyle: "min-width: 140px" },
  { accessorKey: "updated", header: "Updated", sortable: true,  headerStyle: "min-width: 110px" },
];

function onRowClick(event) {
  const id = event?.data?.id;
  if (id) { ui.select("notes", id); router.push(`/notes/${id}`); }
}
</script>

<template>
  <!-- ── List mode (no id in URL) ─────────────────────────────── -->
  <template v-if="!n && !id">
    <PaneHeader :eyebrow="$t('panes.notes.eyebrow')" :title="$t('nav.notes')" help-key="notes-and-search#notes">
      <UiButton intent="ghost" size="small" :disabled="importing" @click="pickNoteFile"
        v-tooltip.bottom="'Import one or more .docx, .txt, .md, .odt, or .epub files as notes'">
        <Icon name="Note" :size="13" /> {{ importing ? "Importing…" : "Import files" }}
      </UiButton>
      <UiButton label="New note" intent="primary" size="small" @click="addNote">
        <template #icon><Icon name="Plus" :size="14" /></template>
      </UiButton>
    </PaneHeader>

    <div v-if="project.notes.length === 0" class="pane-card" style="display:grid;place-items:center;padding:60px">
      <div class="t-muted" style="text-align:center;max-width:420px">
        <div style="font-size:14px;color:var(--ink);margin-bottom:6px">No notes yet.</div>
        <div style="font-size:12.5px;margin-bottom:14px">Scratch-pad jottings — pin them to chapters or scenes and they surface in the editor's Notes panel for that spot.</div>
        <div style="display:inline-flex;gap:8px">
          <UiButton intent="primary" @click="addNote"><Icon name="Plus" :size="14" /> Create your first note</UiButton>
          <UiButton intent="secondary" :disabled="importing" @click="pickNoteFile"><Icon name="Note" :size="14" /> Import from files</UiButton>
        </div>
      </div>
    </div>

    <div v-else class="pane-card">
      <div class="scrollarea" style="padding:18px 22px 40px">
        <div class="entity-toolbar">
          <span class="entity-search">
            <Icon name="Search" :size="13" class="entity-search-icon" />
            <UiInput
              :value="globalQuery"
              placeholder="Search notes…"
              @input="onGlobalInput"
              class="entity-search-input"
            />
          </span>
          <UiButton v-if="globalQuery || hasActiveFacets" label="Clear filters" intent="ghost" size="small" @click="clearAllFilters" />
          <span class="entity-count">{{ filteredRows.length }} of {{ rows.length }}</span>
        </div>

        <div class="entity-facets">
          <div class="entity-facet">
            <span class="entity-facet-label">Anchor</span>
            <button class="entity-chip" :class="{ active: selectedAnchor === null }" @click="selectedAnchor = null">All</button>
            <button class="entity-chip" :class="{ active: selectedAnchor === 'storywide' }" @click="selectedAnchor = selectedAnchor === 'storywide' ? null : 'storywide'">Story-wide</button>
            <button class="entity-chip" :class="{ active: selectedAnchor === 'anchored' }" @click="selectedAnchor = selectedAnchor === 'anchored' ? null : 'anchored'">Anchored</button>
          </div>
          <div v-if="allTags.length" class="entity-facet">
            <span class="entity-facet-label">Tags</span>
            <button v-for="t in allTags" :key="t"
              class="entity-chip" :class="{ active: selectedTags.has(t) }"
              @click="toggleTag(t)">
              {{ t }}
            </button>
          </div>
        </div>

        <UiTable
          :data="filteredRows"
          :columns="columns"
          data-key="id"
          row-hover
          :global-filter="globalQuery"
          :global-filter-fields="['title', 'tag']"
          :pagination="{ pageSize: 20, pageSizeOptions: [10, 20, 50, 100] }"
          class="entity-table"
          @row-click="onRowClick"
        >
          <template #empty>
            <div class="entity-empty">No notes match your search.</div>
          </template>

          <template #title="{ row }">
            <div class="entity-cell-title">
              <span class="entity-cell-title-text">{{ row.title }}</span>
            </div>
          </template>

          <template #tag="{ row }">
            <UiTag v-if="row.tag" :value="row.tag" intent="secondary" />
            <span v-else class="entity-status-empty">—</span>
          </template>

          <template #anchor="{ row }">
            <span class="notes-anchor-cell">{{ anchorLabelFor(row) }}</span>
          </template>

          <template #updated="{ row }">
            <span>{{ row.updated }}</span>
          </template>
        </UiTable>
      </div>
    </div>
  </template>

  <!-- ── Detail mode (id present, note found) ─────────────────── -->
  <template v-else-if="n">
    <header class="pane-header entity-pane-header">
      <div class="pane-title">
        <Breadcrumb :segments="[{ label: 'Note', to: '/notes' }]" />
        <input class="entity-name"
          :value="n.title"
          placeholder="Note title"
          @input="update('title', $event.target.value)" />
      </div>
      <div class="pane-actions">
        <div class="note-anchor-wrap" v-tooltip.bottom="'Pin this note to a chapter or scene — it appears in that chapter\'s Notes panel'">
          <Icon name="Pin" :size="11" class="note-anchor-icon" />
          <UiSelect class="note-anchor-select"
            :model-value="anchorValue"
            @update:model-value="anchorValue = $event"
            :options="anchorOptions"
            aria-label="Note anchor" />
        </div>
        <div class="note-tag-wrap">
          <UiInput fluid placeholder="tag"
            :model-value="n.tag"
            @update:model-value="update('tag', $event)"
            @focus="onTagFocus"
            @blur="onTagBlur"
            @keydown="onTagKeydown" />
          <ul v-if="tagSuggestOpen && tagSuggestions.length" class="note-tag-suggest" role="listbox">
            <li v-for="(t, i) in tagSuggestions" :key="t"
              class="note-tag-suggest-item"
              :class="{ active: i === tagSuggestIndex }"
              role="option"
              :aria-selected="i === tagSuggestIndex"
              @mouseenter="tagSuggestIndex = i"
              @mousedown.prevent="pickTag(t)">
              {{ t }}
            </li>
          </ul>
        </div>
        <span class="t-muted" style="font-size:12px;padding:0 8px">Updated {{ n.updated }}</span>
        <UiButton intent="ghost" size="small" @click="deleteNote">Delete</UiButton>
        <UiButton intent="primary" size="small" @click="addNote"><Icon name="Plus" :size="14" /> New note</UiButton>
      </div>
    </header>

    <div class="pane-card">
      <p class="entity-desc note-desc">
        A <strong>note</strong> is anything that doesn't fit one of the structured surfaces —
        research clippings, half-formed scene ideas, cut prose, beta feedback, a thought you want
        to come back to. Tag it to find it later; pin it to a chapter or scene above so it
        surfaces there too.
      </p>
      <RichEditor
        :model-value="n.body"
        placeholder="Start writing the note…"
        @change="(html) => update('body', html)"
      />
    </div>
  </template>

  <!-- ── id in URL but note not found ─────────────────────────── -->
  <template v-else>
    <header class="pane-header entity-pane-header">
      <div class="pane-title">
        <Breadcrumb :segments="[{ label: 'Note', to: '/notes' }]" />
        <h1 class="pane-h1">Note not found</h1>
      </div>
      <div class="pane-actions">
        <UiButton intent="primary" size="small" @click="addNote"><Icon name="Plus" :size="14" /> New note</UiButton>
      </div>
    </header>
    <div class="pane-card" style="display:grid;place-items:center;padding:60px">
      <div class="t-muted" style="text-align:center">
        This note no longer exists.<br />
        <UiButton intent="ghost" style="margin-top:14px" @click="router.push('/notes')">Back to notes</UiButton>
      </div>
    </div>
  </template>

  <input ref="fileInput" type="file" multiple accept=".docx,.txt,.md,.markdown,.odt,.epub"
    style="display:none" @change="onFileChange" />
</template>

<style scoped>
/* Shared shapes = global .entity-*; note-desc composes its padding on top. */
.note-desc { padding: 16px 22px 0; }

.note-anchor-wrap {
  position: relative;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 8px 0 10px;
  border: 1px solid var(--border-soft); border-radius: 6px;
  background: var(--surface);
  max-width: 240px;
  color: var(--muted);
}
.note-anchor-wrap:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.note-anchor-icon { flex-shrink: 0; }
.note-anchor-select { border: none; background: transparent; min-width: 160px; }
.note-anchor-select :deep(button) {
  border: none !important; background: transparent !important;
  padding: 5px 0 !important;
  box-shadow: none !important;
  font-size: 12.5px;
}

.note-tag-wrap { position: relative; max-width: 120px; }
.note-tag-suggest {
  position: absolute; top: calc(100% + 4px); right: 0;
  margin: 0; padding: 4px; list-style: none;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .14);
  min-width: 140px; max-width: 240px;
  z-index: 40;
  max-height: 240px; overflow-y: auto;
}
.note-tag-suggest-item {
  padding: 5px 10px; border-radius: 5px;
  font-size: 13px; color: var(--ink);
  cursor: pointer;
}
.note-tag-suggest-item.active { background: var(--accent-soft); color: var(--accent-ink); }

.notes-anchor-cell { font-size: 12.5px; color: var(--muted); }
</style>
