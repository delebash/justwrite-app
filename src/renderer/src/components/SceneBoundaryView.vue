<script setup>
// NodeView for the SceneBoundary atom node. Renders the typographic
// divider (rule + * * *) plus an inline editable title that lets the
// writer rename the scene without leaving the continuous-chapter
// editor. The title change flows through TipTap's updateAttributes,
// fires the editor's `change` event, splits via services/chapterStitch,
// and applies via project.applyStitchedChapter — same round-trip as a
// scene body edit, just touching the title field instead of body.

import { computed, ref, nextTick } from "vue";
import { NodeViewWrapper, nodeViewProps } from "@tiptap/vue-3";

const props = defineProps(nodeViewProps);

// Track the live attribute value so the input stays a controlled-input
// without fighting reactive updates while the user is typing.
const titleInput = ref(null);
const title = computed({
  get() { return props.node.attrs.sceneTitle || ""; },
  set(v) { props.updateAttributes({ sceneTitle: v }); },
});

const placeholder = computed(() => {
  const idx = Number(props.node.attrs.sceneIdx ?? 0);
  return `Scene ${idx + 1} — untitled`;
});

// Esc / Enter blur the input — both commit (v-model already writes on
// every keystroke; blur just returns focus to the prose for typing).
function onKeydown(e) {
  if (e.key === "Enter" || e.key === "Escape") {
    e.preventDefault();
    titleInput.value?.blur();
    nextTick(() => props.editor?.commands.focus());
  }
}

// When the input gains focus, prevent the wrapper's contenteditable=false
// from swallowing keystrokes. The input is the only editable thing in
// the NodeView; the rest of the wrapper is decorative.
function onFocus() {
  // No-op — the input naturally handles its own input events.
}

// We swallow the input's default mousedown so the editor doesn't try to
// select the surrounding atom node (the boundary), then explicitly
// focus the input ourselves. Without this dance, ProseMirror grabs the
// click, treats the boundary as a NodeSelection, and the bubble menu
// briefly flashes over the title.
function focusInput() {
  titleInput.value?.focus();
}
</script>

<template>
  <NodeViewWrapper as="div" class="scene-boundary scene-boundary-node" contenteditable="false">
    <input
      ref="titleInput"
      class="scene-boundary-title-input"
      type="text"
      v-model="title"
      :placeholder="placeholder"
      spellcheck="false"
      @keydown="onKeydown"
      @focus="onFocus"
      @mousedown.stop.prevent="focusInput"
      @click.stop
      @pointerdown.stop
    />
  </NodeViewWrapper>
</template>
