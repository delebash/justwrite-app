<script setup>
// QC-45 — docked scene-notes side panel (the user's "N-B side panel" pick).
//
// Replaces ChapterNotesModal. The whole point: adding and editing a note
// happens IN PLACE, right here beside the editor — the old modal's "Add note"
// router-pushed to /notes/<id> (a fresh editor, no way back, chapter list +
// note label), which the user called confusing. Nothing here navigates except
// the single deliberate footer link ("Manage all notes ↗").
//
// Docked, not overlaid: this renders as a flex sibling of the editor column
// inside ChaptersView's edit-mode card, so the prose shrinks to make room.
//
// Scope:
//   "scene"   → one section: the active scene's notes (project.notesForScene).
//   "chapter" → the old modal's chapter-wide view reborn: a "Chapter-level"
//               section (chapter-anchored, not scene-anchored) then a section
//               per scene in order. Each section carries its own composer so
//               every add is unambiguous about the scope it pins to.

import { computed, nextTick, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { htmlToText, textToHtml } from "../services/text.js";
import { useProjectStore } from "../stores/project.js";
import { Icon } from "@delebash/llm-ui";
import { UiButton } from "@delebash/llm-ui";
import { UiTextarea } from "@delebash/llm-ui";

const props = defineProps({
  chapterId: { type: String, required: true },
  // "scene" → active-scene notes only · "chapter" → chapter-level + per scene.
  scope: { type: String, default: "scene" },
  // The active scene id, when scope === "scene".
  sceneId: { type: String, default: "" },
});
const emit = defineEmits(["close"]);

const project = useProjectStore();
const router = useRouter();

const ch = computed(() => project.chapterById(props.chapterId));
const scenes = computed(() => (ch.value ? project.scenesFor(ch.value.id) : []));
const isScene = computed(() => props.scope === "scene");

const activeScene = computed(() =>
  isScene.value && props.sceneId
    ? scenes.value.find((s) => s.id === props.sceneId) || null
    : null,
);
const activeSceneIdx = computed(() =>
  activeScene.value ? scenes.value.indexOf(activeScene.value) : -1,
);

const panelTitle = computed(() => (isScene.value ? "Scene notes" : "Chapter notes"));
const scopeLine = computed(() => {
  if (isScene.value) {
    if (!activeScene.value) return "Scene";
    return `Scene ${activeSceneIdx.value + 1}${activeScene.value.title ? ` · ${activeScene.value.title}` : ""}`;
  }
  return ch.value ? `Ch. ${ch.value.num}${ch.value.title ? ` · ${ch.value.title}` : ""}` : "";
});
const footerScopeWord = computed(() => (isScene.value ? "this scene" : "this chapter"));

// Chapter-level notes = chapter-anchored but NOT scene-anchored (scenes own
// their own section below).
const chapterLevelNotes = computed(() =>
  project.notesForChapter(props.chapterId).filter((n) => !n.anchor?.sceneId),
);

// The sections rendered in the single scroller. `key` also keys that section's
// composer draft below.
const sections = computed(() => {
  if (isScene.value) {
    if (!activeScene.value) return [];
    return [{
      key: activeScene.value.id,
      label: `Scene ${activeSceneIdx.value + 1}`,
      sub: activeScene.value.title || "",
      anchor: { chapterId: props.chapterId, sceneId: activeScene.value.id },
      placeholder: "Jot a note on this scene…",
      notes: project.notesForScene(activeScene.value.id),
    }];
  }
  const out = [{
    key: "__chapter__",
    label: "Chapter-level",
    sub: "",
    anchor: { chapterId: props.chapterId },
    placeholder: "Jot a chapter-level note…",
    notes: chapterLevelNotes.value,
  }];
  scenes.value.forEach((s, i) => {
    out.push({
      key: s.id,
      label: `Scene ${i + 1}`,
      sub: s.title || "",
      anchor: { chapterId: props.chapterId, sceneId: s.id },
      placeholder: "Jot a note on this scene…",
      notes: project.notesForScene(s.id),
    });
  });
  return out;
});

// Chapter scope names each section with a header; scene scope's one section is
// already named by the scope line, so no redundant header there.
const showSectionHeaders = computed(() => !isScene.value);

// ── HTML ↔ plain text ────────────────────────────────────────────────
// note.body is HTML (NotesView authors it through RichEditor). This panel is a
// plain-text quick surface: display strips tags keeping block boundaries as
// newlines (the shared htmlToText's blockNewlines mode), and saving wraps each
// line back into <p> (the shared textToHtml's lineAsParagraph grammar) so a
// note still round-trips through NotesView. Rich formatting authored in
// NotesView is flattened if edited here — acceptable for a quick scene-note
// surface.
const noteText = (html) => htmlToText(html, { blockNewlines: true });
const noteHtml = (text) => textToHtml(text, { lineAsParagraph: true });
// Title from the note's first line — first ~8 words, no ellipsis. Only shown in
// NotesView's table (the cards here show the body); derived once, at creation.
function deriveTitle(text) {
  const first = (text || "").split(/\n/).map((l) => l.trim()).find(Boolean) || "";
  const words = first.split(/\s+/).filter(Boolean).slice(0, 8);
  return words.join(" ") || "Untitled note";
}
function bodyText(n) {
  return noteText(n.body) || "Empty note.";
}

// ── Add (one composer per section) ───────────────────────────────────
const drafts = reactive({});
function addFromDraft(section) {
  const text = (drafts[section.key] || "").trim();
  if (!text) return;
  // No toast, no naming popup, no navigation: the composer IS the form, and the
  // new card appears in place below.
  project.addNote({
    title: deriveTitle(text),
    body: noteHtml(text),
    anchor: section.anchor,
  });
  drafts[section.key] = "";
}
function onComposerKeydown(e, section) {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    addFromDraft(section);
  }
}

// ── Edit in place (swap the card body for a textarea) ────────────────
const panelEl = ref(null);
const editingId = ref("");
const editingText = ref("");
async function startEdit(n) {
  editingId.value = n.id;
  editingText.value = noteText(n.body);
  await nextTick();
  panelEl.value?.querySelector(".sp-note-edit")?.focus();
}
function commitEdit(n) {
  if (editingId.value !== n.id) return;
  const next = noteHtml(editingText.value);
  if (next !== (n.body || "")) project.updateNote(n.id, { body: next });
  editingId.value = "";
  editingText.value = "";
}
function cancelEdit() {
  editingId.value = "";
  editingText.value = "";
}
function onEditKeydown(e, n) {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    commitEdit(n);
  } else if (e.key === "Escape") {
    e.preventDefault();
    cancelEdit();
  }
}

// Delete (user's order, 2026-07-10: "need to be delete a note not detach") —
// a soft delete to Trash via removeNote, no confirm (NotesView's own delete
// has none) and no toast (QC-37): the card visibly leaves, and the note is
// recoverable from the Trash view. Unanchoring still lives in the Notes
// view's anchor picker ("Story-wide").
function removeNote(n) {
  project.removeNote(n.id);
}

// The one deliberate navigation.
function manageAll() {
  emit("close");
  router.push("/notes");
}
</script>

<template>
  <aside ref="panelEl" class="sp" aria-label="Scene notes">
    <header class="sp-h">
      <b class="sp-title">{{ panelTitle }}</b>
      <UiButton class="sp-close" intent="ghost" size="small"
        v-tooltip.bottom="'Close notes'" aria-label="Close notes"
        @click="emit('close')">
        <template #icon><Icon name="Close" :size="14" /></template>
      </UiButton>
    </header>
    <div class="sp-scope">{{ scopeLine }}</div>

    <div class="sp-body scrollarea">
      <template v-for="section in sections" :key="section.key">
        <div v-if="showSectionHeaders" class="sp-section-h">
          <span class="sp-section-label">{{ section.label }}<span v-if="section.sub" class="sp-section-sub"> · {{ section.sub }}</span></span>
          <span class="sp-section-count">{{ section.notes.length }}</span>
        </div>

        <div class="sp-composer">
          <UiTextarea
            v-model="drafts[section.key]"
            auto-resize
            :min-height-px="52"
            :rows="2"
            :placeholder="section.placeholder"
            @keydown="(e) => onComposerKeydown(e, section)" />
          <div class="sp-addrow">
            <UiButton intent="primary" size="small"
              :disabled="!(drafts[section.key] || '').trim()"
              @click="addFromDraft(section)">
              Add note
            </UiButton>
          </div>
        </div>

        <div v-for="n in section.notes" :key="n.id" class="sp-note">
          <UiTextarea v-if="editingId === n.id"
            class="sp-note-edit"
            v-model="editingText"
            auto-resize
            :min-height-px="48"
            :rows="2"
            @keydown="(e) => onEditKeydown(e, n)"
            @blur="commitEdit(n)" />
          <template v-else>
            <button type="button" class="sp-note-body" @click="startEdit(n)">{{ bodyText(n) }}</button>
            <div class="sp-note-meta">
              <span class="sp-note-date">{{ n.updated }}</span>
              <span class="sp-note-acts">
                <button type="button" class="sp-note-act"
                  v-tooltip.bottom="'Edit note'" aria-label="Edit note"
                  @click="startEdit(n)">
                  <Icon name="Pencil" :size="12" />
                </button>
                <button type="button" class="sp-note-act"
                  v-tooltip.bottom="'Delete note'" aria-label="Delete note"
                  @click="removeNote(n)">
                  <Icon name="Trash" :size="12" />
                </button>
              </span>
            </div>
          </template>
        </div>
      </template>
    </div>

    <footer class="sp-foot">
      Notes stay pinned to {{ footerScopeWord }} ·
      <button type="button" class="sp-manage" @click="manageAll">Manage all notes ↗</button>
    </footer>
  </aside>
</template>

<style scoped>
/* Docked inspector — a fixed-width flex sibling of the editor column. The card
   it sits in (.pane-card) clips the rounded corner; a left border + faint
   shadow separate it from the prose. */
.sp {
  flex: 0 0 336px;
  min-height: 0;
  display: flex; flex-direction: column;
  background: var(--surface-2);
  border-left: 1px solid var(--border);
  box-shadow: -6px 0 18px rgb(0 0 0 / 0.04);
}

.sp-h {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 13px 12px 10px 16px;
  border-bottom: 1px solid var(--border-soft);
  flex-shrink: 0;
}
.sp-title {
  font-family: var(--font-serif);
  font-size: 15px; font-weight: 600; color: var(--ink);
}
.sp-close { margin: -4px -4px -4px 0; }

.sp-scope {
  padding: 10px 16px 2px;
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted);
  flex-shrink: 0;
}

/* The one scroller. */
.sp-body {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: 8px 16px 16px;
  display: flex; flex-direction: column; gap: 10px;
}

.sp-section-h {
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  margin-top: 6px; padding-bottom: 4px;
  border-bottom: 1px solid var(--border-soft);
}
.sp-section-h:first-child { margin-top: 0; }
.sp-section-label {
  font-family: var(--font-mono); font-size: 10px; font-weight: 600;
  letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-2);
}
.sp-section-sub { color: var(--muted); font-weight: 400; text-transform: none; letter-spacing: 0; }
.sp-section-count {
  font-family: var(--font-mono); font-size: 10px; color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.sp-composer { display: flex; flex-direction: column; gap: 8px; }
.sp-composer :deep(.ui-textarea),
.sp-note-edit { font-size: 12.5px; line-height: 1.5; }
.sp-addrow { display: flex; justify-content: flex-end; }

.sp-note {
  border: 1px solid var(--border-soft); background: var(--surface);
  border-radius: 8px; padding: 9px 11px;
  display: flex; flex-direction: column; gap: 6px;
}
.sp-note-body {
  appearance: none; border: 0; background: none; padding: 0; margin: 0;
  display: block; width: 100%; text-align: left; font: inherit; cursor: text;
  font-size: 12.5px; line-height: 1.5; color: var(--ink);
  white-space: pre-wrap; word-break: break-word;
}
.sp-note-body:hover { color: var(--accent-ink); }
.sp-note-meta {
  display: flex; align-items: center; justify-content: space-between;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--muted);
}
.sp-note-date { font-variant-numeric: tabular-nums; }
.sp-note-acts { display: inline-flex; align-items: center; gap: 2px; }
.sp-note-act {
  appearance: none; border: 0; background: none; cursor: pointer; padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; border-radius: 4px; color: var(--muted);
}
.sp-note-act:hover { background: var(--surface-3); color: var(--ink); }

.sp-foot {
  margin-top: auto; flex-shrink: 0;
  padding: 11px 16px;
  border-top: 1px solid var(--border-soft);
  font-size: 11.5px; color: var(--muted); line-height: 1.5;
}
.sp-manage {
  appearance: none; border: 0; background: none; padding: 0; font: inherit;
  font-size: 11.5px; color: var(--muted); cursor: pointer;
  text-decoration: underline; text-underline-offset: 2px;
}
.sp-manage:hover { color: var(--accent-ink); }
</style>
