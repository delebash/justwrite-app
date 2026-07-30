<script setup>
import { ref, watch } from "vue";

const props = defineProps({
  items: { type: Array, default: () => [] },
  command: { type: Function, required: true },
});

const selected = ref(0);
watch(() => props.items, () => { selected.value = 0; });

function choose(i) {
  const item = props.items[i];
  if (item) props.command({ id: item.id, label: item.label, kind: item.kind });
}

// Called by the suggestion renderer (see editorMentions.js) so arrow /
// enter keys drive the list while the dropdown is open.
function onKeyDown({ event }) {
  if (!props.items.length) return false;
  if (event.key === "ArrowDown") {
    selected.value = (selected.value + 1) % props.items.length;
    return true;
  }
  if (event.key === "ArrowUp") {
    selected.value = (selected.value + props.items.length - 1) % props.items.length;
    return true;
  }
  if (event.key === "Enter") {
    choose(selected.value);
    return true;
  }
  return false;
}

defineExpose({ onKeyDown });
</script>

<template>
  <div class="mention-list" role="listbox" :aria-label="$t('editor.mentions.ariaLabel')">
    <button
      v-for="(item, i) in items"
      :key="item.kind + ':' + item.id"
      type="button"
      role="option"
      :aria-selected="i === selected"
      class="mention-item"
      :class="{ active: i === selected }"
      @mousedown.prevent="choose(i)"
      @mouseenter="selected = i">
      <span class="mention-item-dot" :data-kind="item.kind"></span>
      <span class="mention-item-label">{{ item.label }}</span>
      <span class="mention-item-type">{{ item.kind }}</span>
    </button>
    <div v-if="!items.length" class="mention-empty">{{ $t("editor.mentions.noMatches") }}</div>
  </div>
</template>