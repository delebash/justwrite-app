<script setup>
import { computed, ref, watch } from "vue";
import { UiInput, pageFill } from "@delebash/ui";
import { UiButton } from "@delebash/ui";
import { UiSelect } from "@delebash/ui";
import { UiTag } from "@delebash/ui";
import EntityIndex from "../components/EntityIndex.vue";
import { noteDate, useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRouter } from "vue-router";
import { Icon } from "@delebash/ui";
import RichEditor from "../components/RichEditor.vue";
import { PaneHeader } from "@delebash/ui";
import { parseFile } from "../services/import/index.js";
import { useSelectNewName } from "../composables/useSelectNewName.js";
import { useEntityPage } from "../composables/useEntityPage.js";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const { open, openFirst, onRowClick } = useEntityPage("notes");
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

// "+ New" lands here with ?new=1: the header's name is selected, ready to type over.
const header = ref(null);
useSelectNewName(header);

function addNote() {
  open(project.addNote(), { isNew: true });
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
        const baseName = file.name.replace(/\.[^.]+$/, "") || t("notes.importedFallback");
        const sections = (parsed.chapters || []).filter((c) => c && (c.html || c.title));
        if (!sections.length) {
          failures.push(t("notes.importEmptyFile", { file: file.name }));
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
      ui.showToast({ message: failures.length ? t("notes.importFailed", { reason: failures[0] }) : t("notes.nothingToImport") });
      return;
    }
    const { noteIds } = project.importNotes({ notes: noteInputs });
    if (!noteIds.length) {
      ui.showToast({ message: t("notes.nothingToImport") });
      return;
    }
    for (const w of warnings.slice(0, 2)) ui.showToast({ message: w });
    for (const f of failures.slice(0, 2)) ui.showToast({ message: t("notes.importSkipped", { reason: f }) });
    ui.select("notes", noteIds[0]);
    router.push(`/notes/${noteIds[0]}`);
  } finally {
    importing.value = false;
  }
}

// ── Anchor ───────────────────────────────────────────────────────────
const anchorOptions = computed(() => {
  const opts = [{ label: t("common.storyWideNoAnchor"), value: "" }];
  for (const c of project.allChapters) {
    opts.push({ label: t("common.chapterRefTitled", { num: c.num, title: c.title || t("common.untitled") }), value: `ch:${c.id}` });
    const scenes = project.scenesFor(c.id);
    scenes.forEach((s, i) => {
      opts.push({
        label: `   ${s.title ? t("common.sceneRefTitled", { num: c.num, scene: i + 1, title: s.title }) : t("common.sceneRef", { num: c.num, scene: i + 1 })}`,
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
  if (!a) return t("notes.storyWide");
  const c = project.chapterById(a.chapterId);
  if (!c) return t("notes.staleAnchor");
  if (!a.sceneId) return t("common.chapterShort", { num: c.num });
  const scenes = project.scenesFor(c.id);
  const idx = scenes.findIndex((s) => s.id === a.sceneId);
  return idx >= 0 ? t("common.sceneRef", { num: c.num, scene: idx + 1 }) : t("common.chapterShort", { num: c.num });
}

function deleteNote() {
  if (!n.value) return;
  project.removeNote(n.value.id);
  openFirst(project.notes);
}

// ── List mode ────────────────────────────────────────────────────────
const allTags = computed(() => {
  const set = new Set();
  for (const note of project.notes) if (note.tag) set.add(note.tag);
  return [...set].sort();
});

const rows = computed(() => project.notes);
// Declarative facets for the shared EntityIndex — the filtering, the chip markup
// and the clear-all now live there (components/EntityIndex.vue), not in a private
// copy per view. Anchor's options are static, so its row always renders; a note
// carries ONE `tag`, so the multi-select tests equality, not array membership.
const facets = computed(() => [
  {
    key: "anchor", label: t("notes.anchor"),
    options: [
      { value: "storywide", label: t("notes.storyWide") },
      { value: "anchored", label: t("notes.anchored") },
    ],
    match: (row, v) => (v === "storywide" ? !row.anchor : !!row.anchor),
  },
  {
    key: "tags", label: t("common.tags"), multi: true,
    options: allTags.value.map((t) => ({ value: t, label: t })),
    match: (row, tag) => row.tag === tag,
  },
]);

const columns = computed(() => [
  { accessorKey: "title",   header: t("common.title"),   sortable: true,  headerStyle: "min-width: 200px" },
  { accessorKey: "tag",     header: t("notes.colTag"),     sortable: true,  headerStyle: "min-width: 120px" },
  { accessorKey: "anchor",  header: t("notes.anchor"),  sortable: false, headerStyle: "min-width: 140px" },
  { accessorKey: "updated", header: t("notes.colUpdated"), sortable: true,  headerStyle: "min-width: 110px" },
]);
</script>

<template>
  <q-page :style-fn="pageFill" class="main">
    <!-- ── List mode (no id in URL) ─────────────────────────────── -->
    <template v-if="!n && !id">
      <PaneHeader :eyebrow="$t('panes.notes.eyebrow')" :title="$t('nav.notes')" help-key="notes-and-search#notes">
        <UiButton intent="ghost" size="small" :disabled="importing" @click="pickNoteFile"
          v-tooltip.bottom="$t('notes.importTooltip')">
          <Icon name="Note" :size="13" /> {{ importing ? $t("notes.importing") : $t("notes.importFiles") }}
        </UiButton>
        <UiButton :label="$t('notes.newNote')" intent="primary" size="small" @click="addNote">
          <template #icon><Icon name="Plus" :size="14" /></template>
        </UiButton>
      </PaneHeader>

      <div v-if="project.notes.length === 0" class="pane-card" style="display:grid;place-items:center;padding:60px">
        <div class="t-muted" style="text-align:center;max-width:420px">
          <div style="font-size:14px;color:var(--ink);margin-bottom:6px">{{ $t("notes.emptyTitle") }}</div>
          <div style="font-size:12.5px;margin-bottom:14px">{{ $t("notes.emptyBody") }}</div>
          <div style="display:inline-flex;gap:8px">
            <UiButton intent="primary" @click="addNote"><Icon name="Plus" :size="14" /> {{ $t("notes.createFirst") }}</UiButton>
            <UiButton intent="secondary" :disabled="importing" @click="pickNoteFile"><Icon name="Note" :size="14" /> {{ $t("notes.importFromFiles") }}</UiButton>
          </div>
        </div>
      </div>

      <EntityIndex v-else
        :rows="rows"
        :columns="columns"
        :facets="facets"
        :search-fields="['title', 'tag']"
        :search-placeholder="t('notes.searchPlaceholder')"
        :empty-text="t('notes.searchEmpty')"
        @row-click="onRowClick">
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
          <span>{{ noteDate(row.updated) }}</span>
        </template>
      </EntityIndex>
    </template>

    <!-- ── Detail mode (id present, note found) ─────────────────── -->
    <template v-else-if="n">
      <PaneHeader ref="header" :crumbs="[{ label: $t('notes.breadcrumb'), to: '/notes' }]"
        editable :title="n.title" :placeholder="$t('notes.titlePlaceholder')"
        @update:title="(v) => update('title', v)">
        <div class="note-anchor-wrap" v-tooltip.bottom="$t('notes.anchorTooltip')">
          <Icon name="Pin" :size="11" class="note-anchor-icon" />
          <UiSelect class="note-anchor-select"
            :model-value="anchorValue"
            @update:model-value="anchorValue = $event"
            :options="anchorOptions"
            :aria-label="$t('notes.anchorAriaLabel')" />
        </div>
        <div class="note-tag-wrap">
          <UiInput fluid :placeholder="$t('notes.tagPlaceholder')"
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
        <span class="t-muted" style="font-size:12px;padding:0 8px">{{ $t("notes.updated", { when: noteDate(n.updated) }) }}</span>
        <UiButton intent="ghost" size="small" @click="deleteNote">{{ $t("common.delete") }}</UiButton>
        <UiButton intent="primary" size="small" @click="addNote"><Icon name="Plus" :size="14" /> {{ $t("notes.newNote") }}</UiButton>
      </PaneHeader>

      <div class="pane-card">
        <p class="entity-desc note-desc">
          {{ $t("notes.intro", { noteTerm: $t("notes.noteTerm") }) }}
        </p>
        <RichEditor
          :model-value="n.body"
          :placeholder="$t('notes.bodyPlaceholder')"
          @change="(html) => update('body', html)"
        />
      </div>
    </template>

    <!-- ── id in URL but note not found ─────────────────────────── -->
    <template v-else>
      <PaneHeader :crumbs="[{ label: $t('notes.breadcrumb'), to: '/notes' }]" :title="$t('notes.notFound')">
        <UiButton intent="primary" size="small" @click="addNote"><Icon name="Plus" :size="14" /> {{ $t("notes.newNote") }}</UiButton>
      </PaneHeader>
      <div class="pane-card" style="display:grid;place-items:center;padding:60px">
        <div class="t-muted" style="text-align:center">
          {{ $t("notes.notFoundBody") }}<br />
          <UiButton intent="ghost" style="margin-top:14px" @click="router.push('/notes')">{{ $t("notes.backToNotes") }}</UiButton>
        </div>
      </div>
    </template>

    <input ref="fileInput" type="file" multiple accept=".docx,.txt,.md,.markdown,.odt,.epub"
      style="display:none" @change="onFileChange" />
  </q-page>
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
  box-shadow: 0 8px 24px var(--shadow-medium);
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
