<script setup>
// Per-chapter notes panel.
//
// Surfaces every note anchored anywhere in this chapter — header-level
// notes first, then a section per scene in order. Each row clicks
// through to the global NotesView for full editing; quick-add creates
// a new note pre-anchored to the right scope and jumps to it.
//
// Opened from two places:
//   - The chapter pane header's "Notes" button (initialFocus = "chapter")
//   - The scene strip's note glyph (initialFocus = sceneId)
// initialFocus only scrolls; the modal always shows the full chapter.

import { ref, computed, nextTick, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import Icon from "./Icon.vue";
import AppModal from "./AppModal.vue";
import { UiButton } from "@delebash/llm-ui";

const props = defineProps({
  chapterId: { type: String, required: true },
  // "chapter" → scroll to chapter-level section; a sceneId → scroll to
  // that scene's section.
  initialFocus: { type: String, default: "chapter" },
});
const emit = defineEmits(["close"]);

const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();

const ch = computed(() => project.chapterById(props.chapterId));
const scenes = computed(() => ch.value ? project.scenesFor(ch.value.id) : []);

// initialFocus "chapter" → full chapter view (chapter-level + every scene).
// initialFocus = a sceneId → scene-only view: just that scene's section.
// Set by the caller: the chapter-pane Notes button passes "chapter", the
// scene-strip Notes button passes the active scene's id.
const focusedSceneId = computed(() =>
  props.initialFocus && props.initialFocus !== "chapter" ? props.initialFocus : null
);
const focusedScene = computed(() => {
  if (!focusedSceneId.value) return null;
  return scenes.value.find((s) => s.id === focusedSceneId.value) || null;
});
const focusedSceneIdx = computed(() =>
  focusedScene.value ? scenes.value.indexOf(focusedScene.value) : -1
);

// Chapter-level notes = anchored to this chapter but NOT to any scene.
// Scene notes are owned by their per-scene section below.
const chapterNotes = computed(() => project.notesForChapter(props.chapterId)
  .filter((n) => !n.anchor?.sceneId));

function sceneNotes(sceneId) {
  return project.notesForScene(sceneId);
}

function snippet(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  const t = (div.textContent || "").trim();
  return t.length > 120 ? `${t.slice(0, 120)}…` : t;
}

function openNote(n) {
  ui.select("notes", n.id);
  router.push(`/notes/${n.id}`);
  emit("close");
}

function addChapterNote() {
  const id = project.addNote({
    title: `Note on Ch. ${ch.value.num}`,
    anchor: { chapterId: props.chapterId },
  });
  openNote({ id });
}
function addSceneNote(scene, sceneIdx) {
  const id = project.addNote({
    title: `Note on Ch. ${ch.value.num} · Scene ${sceneIdx + 1}`,
    anchor: { chapterId: props.chapterId, sceneId: scene.id },
  });
  openNote({ id });
}

function unanchor(n) {
  project.updateNote(n.id, { anchor: null });
}

const scrollRoot = ref(null);
onMounted(async () => {
  await nextTick();
  // Scene-focus mode renders only the focused scene's section, so there's
  // nothing to scroll into view. Only the chapter-wide view needs the
  // jump-to-section behavior.
  if (focusedSceneId.value) return;
  const root = scrollRoot.value;
  if (!root) return;
  const el = root.querySelector('[data-section="chapter"]');
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
});
</script>

<template>
  <AppModal
    :eyebrow="focusedScene ? 'Scene notes' : 'Chapter notes'"
    :title="focusedScene
      ? `Ch. ${ch?.num} · Scene ${focusedSceneIdx + 1}${focusedScene.title ? ' · ' + focusedScene.title : ''}`
      : (ch ? `Ch. ${ch.num} · ${ch.title}` : '')"
    @close="emit('close')"
  >
    <p v-if="!focusedScene" class="cn-desc">
      Notes pinned to this chapter — at the <strong>chapter level</strong> or to a specific
      <strong>scene</strong>. Click a row to open it for editing; new notes are pre-anchored
      to the right scope.
    </p>

    <div ref="scrollRoot" class="cn-scroll">
      <!-- Scene-focus mode: only the focused scene's section -->
      <template v-if="focusedScene">
        <section class="cn-section" :data-section="`scene-${focusedScene.id}`">
          <header class="cn-section-h">
            <Icon name="Quote" :size="13" />
            <h3>Scene {{ focusedSceneIdx + 1 }}<span v-if="focusedScene.title" class="t-muted"> · {{ focusedScene.title }}</span></h3>
            <span class="t-muted">{{ sceneNotes(focusedScene.id).length }} {{ sceneNotes(focusedScene.id).length === 1 ? "note" : "notes" }}</span>
            <UiButton class="cn-add" intent="ghost" size="small" @click="addSceneNote(focusedScene, focusedSceneIdx)">
              <Icon name="Plus" :size="12" /> Add note
            </UiButton>
          </header>
          <div v-if="sceneNotes(focusedScene.id).length" class="cn-list">
            <button v-for="n in sceneNotes(focusedScene.id)" :key="n.id"
              type="button" class="cn-row" @click="openNote(n)">
              <span class="cn-row-title">{{ n.title || "Untitled note" }}</span>
              <span class="cn-row-snippet">{{ snippet(n.body) || "Empty note." }}</span>
              <span class="cn-row-meta">
                <span v-if="n.tag" class="cn-tag">{{ n.tag }}</span>
                <span class="cn-updated">{{ n.updated }}</span>
                <span class="cn-unanchor" v-tooltip.bottom="'Detach from scene'"
                  @click.stop="unanchor(n)">
                  <Icon name="Close" :size="11" />
                </span>
              </span>
            </button>
          </div>
          <p v-else class="cn-empty">No notes on this scene yet.</p>
        </section>
      </template>

      <!-- Chapter-wide view: chapter-level section + a section per scene -->
      <template v-else>
        <section class="cn-section" data-section="chapter">
          <header class="cn-section-h">
            <Icon name="Book" :size="13" />
            <h3>Chapter-level</h3>
            <span class="t-muted">{{ chapterNotes.length }} {{ chapterNotes.length === 1 ? "note" : "notes" }}</span>
            <UiButton class="cn-add" intent="ghost" size="small" @click="addChapterNote">
              <Icon name="Plus" :size="12" /> Add note
            </UiButton>
          </header>
          <div v-if="chapterNotes.length" class="cn-list">
            <button v-for="n in chapterNotes" :key="n.id"
              type="button" class="cn-row" @click="openNote(n)">
              <span class="cn-row-title">{{ n.title || "Untitled note" }}</span>
              <span class="cn-row-snippet">{{ snippet(n.body) || "Empty note." }}</span>
              <span class="cn-row-meta">
                <span v-if="n.tag" class="cn-tag">{{ n.tag }}</span>
                <span class="cn-updated">{{ n.updated }}</span>
                <span class="cn-unanchor" v-tooltip.bottom="'Detach from chapter'"
                  @click.stop="unanchor(n)">
                  <Icon name="Close" :size="11" />
                </span>
              </span>
            </button>
          </div>
          <p v-else class="cn-empty">No chapter-level notes yet.</p>
        </section>

        <section v-for="(scn, si) in scenes" :key="scn.id"
          class="cn-section" :data-section="`scene-${scn.id}`">
          <header class="cn-section-h">
            <Icon name="Quote" :size="13" />
            <h3>Scene {{ si + 1 }}<span v-if="scn.title" class="t-muted"> · {{ scn.title }}</span></h3>
            <span class="t-muted">{{ sceneNotes(scn.id).length }} {{ sceneNotes(scn.id).length === 1 ? "note" : "notes" }}</span>
            <UiButton class="cn-add" intent="ghost" size="small" @click="addSceneNote(scn, si)">
              <Icon name="Plus" :size="12" /> Add note
            </UiButton>
          </header>
          <div v-if="sceneNotes(scn.id).length" class="cn-list">
            <button v-for="n in sceneNotes(scn.id)" :key="n.id"
              type="button" class="cn-row" @click="openNote(n)">
              <span class="cn-row-title">{{ n.title || "Untitled note" }}</span>
              <span class="cn-row-snippet">{{ snippet(n.body) || "Empty note." }}</span>
              <span class="cn-row-meta">
                <span v-if="n.tag" class="cn-tag">{{ n.tag }}</span>
                <span class="cn-updated">{{ n.updated }}</span>
                <span class="cn-unanchor" v-tooltip.bottom="'Detach from scene'"
                  @click.stop="unanchor(n)">
                  <Icon name="Close" :size="11" />
                </span>
              </span>
            </button>
          </div>
          <p v-else class="cn-empty">No notes on this scene yet.</p>
        </section>
      </template>
    </div>
  </AppModal>
</template>

<style scoped>
.cn-desc {
  font-size: 12px; line-height: 1.55; color: var(--muted);
  margin: 0;
}
.cn-desc strong { color: var(--ink-2); font-weight: 600; }

.cn-scroll {
  display: flex; flex-direction: column; gap: 22px;
  max-height: 62vh; overflow-y: auto;
  padding-right: 4px;
}

.cn-section { display: flex; flex-direction: column; gap: 8px; }
.cn-section-h {
  display: flex; align-items: center; gap: 8px;
  padding-bottom: 6px; border-bottom: 1px solid var(--border-soft);
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted);
}
.cn-section-h h3 {
  margin: 0; font-size: 11px; font-weight: 600; color: var(--ink);
  letter-spacing: inherit; text-transform: inherit;
}
.cn-section-h h3 .t-muted {
  font-weight: 400; text-transform: none; letter-spacing: 0;
  font-family: var(--font-ui); font-size: 12px;
}
.cn-section-h .t-muted { font-weight: 400; }
.cn-section-h .cn-add { margin-left: auto; }

.cn-list { display: flex; flex-direction: column; gap: 6px; }
.cn-row {
  appearance: none; text-align: left; font: inherit; cursor: pointer;
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  gap: 2px 12px;
  padding: 8px 12px;
  border: 1px solid var(--border-soft); border-radius: 8px;
  background: var(--surface);
  transition: background .12s, border-color .12s;
}
.cn-row:hover { background: var(--surface-2); border-color: var(--border); }
.cn-row-title {
  font-family: var(--font-serif); font-size: 13.5px; font-weight: 500;
  color: var(--ink);
}
.cn-row-snippet {
  grid-column: 1 / 2;
  font-size: 12px; line-height: 1.4; color: var(--muted);
  overflow: hidden; text-overflow: ellipsis;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.cn-row-meta {
  grid-column: 2 / 3; grid-row: 1 / 3;
  display: flex; align-items: center; gap: 8px;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--muted);
}
.cn-tag {
  padding: 2px 6px; border-radius: 4px;
  background: var(--accent-soft); color: var(--accent-ink);
}
.cn-updated { font-variant-numeric: tabular-nums; }
.cn-unanchor {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border-radius: 4px;
  color: var(--muted); cursor: pointer;
}
.cn-unanchor:hover { background: var(--surface-3); color: var(--ink); }

.cn-empty {
  font-size: 12px; color: var(--muted); font-style: italic;
  padding: 10px 12px; margin: 0;
  background: var(--surface-2); border-radius: 6px;
}
</style>
