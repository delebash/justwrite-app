<script setup>
// A brainstorm list (2026-10-11, the AI drafting plan Task 10) — the Brainstorm page's results and
// Name ideas' list are this one component, fed by useBrainstorm. Each idea has its thumbs-up (a
// steer for the next round, not a save) and, under the list, **More like these**. `pickable`
// makes each idea a button that emits `pick` (Name ideas: a click sets the name); the `actions`
// slot adds a row's own controls (the page's Copy).
import { computed } from "vue";
import { Icon, UiButton } from "@delebash/ui";

const props = defineProps({
  items: { type: Array, required: true }, // [{ text, liked }]
  running: { type: Boolean, default: false },
  pickable: { type: Boolean, default: false },
});
const emit = defineEmits(["like", "pick", "more"]);

const likedCount = computed(() => props.items.filter((i) => i.liked).length);
const canMore = computed(() => likedCount.value > 0 && !props.running);
</script>

<template>
  <div class="bsr">
    <ul class="bsr-list">
      <li v-for="(item, i) in items" :key="i" class="bsr-item" :class="{ 'is-liked': item.liked }">
        <UiButton v-if="pickable" intent="ghost" align="left" class="bsr-text bsr-pick" @click="emit('pick', item.text)">{{ item.text }}</UiButton>
        <span v-else class="bsr-text">{{ item.text }}</span>
        <div class="bsr-actions">
          <UiButton intent="ghost" size="icon" :class="{ 'is-active': item.liked }" :aria-pressed="item.liked ? 'true' : 'false'"
            :aria-label="item.liked ? $t('brainstorm.unlike') : $t('brainstorm.like')"
            v-tooltip.bottom="item.liked ? $t('brainstorm.unlike') : $t('brainstorm.like')" @click="emit('like', item)">
            <Icon name="ThumbUp" :size="14" :fill="item.liked" />
          </UiButton>
          <slot name="actions" :item="item" />
        </div>
      </li>
    </ul>

    <div class="bsr-more">
      <UiButton intent="accent2" :label="$t('brainstorm.moreLikeThese')" :loading="running" :disabled="!canMore"
        v-tooltip.bottom="canMore ? $t('brainstorm.moreLikeTooltip') : $t('brainstorm.moreLikeDisabledTooltip')"
        @click="emit('more')" />
      <span v-if="!likedCount && !running" class="bsr-hint">{{ $t("brainstorm.thumbHint") }}</span>
    </div>
  </div>
</template>

<style scoped>
.bsr { display: flex; flex-direction: column; gap: 12px; }
.bsr-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.bsr-item {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 4px 4px 4px 10px;
  border-radius: var(--radius-sm, 6px);
  background: var(--surface-raised, var(--surface));
  border: 1px solid var(--border);
  transition: border-color 0.15s;
}
.bsr-item.is-liked {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 6%, var(--surface-raised, var(--surface)));
}
.bsr-text { flex: 1; font-size: 13.5px; color: var(--ink); line-height: 1.4; }
/* A pickable idea is a button (left-aligned: QBtn's align) that reads as the row's text. */
.bsr-pick.ui-btn { font-weight: 400; padding: 4px 6px; margin-left: -6px; }
.bsr-actions { display: flex; gap: 2px; flex-shrink: 0; }
.bsr-actions .is-active { color: var(--accent); }
.bsr-more { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.bsr-hint { font-size: 12px; color: var(--muted); }
</style>
