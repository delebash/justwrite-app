<script setup>
// A draft's review list — each proposed field beside its current value, a tick to keep it, the
// proposal editable inline; All / None over every row; rows grouped under their `section` when
// they carry one. The parent owns the rows (`{ key, label, current, proposed, accept, section? }`,
// characterProfile.js draftRows) and applies the ticked ones. Moved out of CharacterDraftModal.vue
// 2026-10-16, when the location, object and group sheets gained a review window
// (SheetDraftModal.vue). The `notice` slot sits between the bar and the rows.
// RULE #1 precedent: EntityReviewModal — UiCheckbox rows, editable proposals, select-all.
import { computed } from "vue";
import { UiButton, UiCheckbox, UiTextarea } from "@delebash/llm-ui";

const props = defineProps({
  rows: { type: Array, required: true },
});

const acceptCount = computed(() => props.rows.filter((r) => r.accept).length);
function setAll(on) { for (const r of props.rows) r.accept = on; }

// [{ section, rows }] in insertion order.
const groupedRows = computed(() => {
  const out = [];
  for (const r of props.rows) {
    const g = out[out.length - 1];
    if (g && g.section === r.section) g.rows.push(r);
    else out.push({ section: r.section, rows: [r] });
  }
  return out;
});
</script>

<template>
  <div class="cpf-rows">
    <div v-if="rows.length" class="cpf-selectbar">
      <span class="t-muted">{{ $t("common.selectedOf", { selected: acceptCount, total: rows.length }) }}</span>
      <span class="cpf-spacer" />
      <UiButton intent="ghost" size="small" @click="setAll(true)">{{ $t("common.all") }}</UiButton>
      <UiButton intent="ghost" size="small" @click="setAll(false)">{{ $t("common.none") }}</UiButton>
    </div>
    <slot name="notice" />
    <template v-for="(g, gi) in groupedRows" :key="g.section || gi">
      <div v-if="g.section" class="cpf-section">{{ g.section }}</div>
      <div v-for="r in g.rows" :key="r.key" class="cpf-row" :class="{ dropped: !r.accept }">
        <UiCheckbox v-model="r.accept" class="cpf-check" :aria-label="r.label" />
        <div class="cpf-fields">
          <div class="cpf-label">
            {{ r.label }}
            <span v-if="r.current" class="cpf-overwrite">{{ $t("characterProfile.overwriteWarning") }}</span>
          </div>
          <div v-if="r.current" class="cpf-current">{{ r.current }}</div>
          <UiTextarea fluid auto-resize :rows="2" v-model="r.proposed" :disabled="!r.accept" />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.cpf-rows { display: flex; flex-direction: column; gap: 8px; }
.cpf-selectbar { display: flex; align-items: center; gap: 8px; padding: 0 2px 2px; }
.cpf-spacer { flex: 1; }
.cpf-section {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted);
  margin: 6px 0 0; display: flex; align-items: center; gap: 10px;
}
.cpf-section::after { content: ""; flex: 1; height: 1px; background: var(--border-soft); }
.cpf-row {
  display: grid; grid-template-columns: auto 1fr; gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border-soft); border-radius: 8px;
  background: var(--surface);
  transition: opacity .15s, background .15s;
}
.cpf-row.dropped { opacity: 0.55; background: var(--surface-2); }
.cpf-check { display: flex; align-items: flex-start; padding-top: 4px; cursor: pointer; }
.cpf-fields { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.cpf-label {
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted);
  display: flex; align-items: center; gap: 8px;
}
.cpf-overwrite {
  font-family: var(--font-ui); text-transform: none; letter-spacing: 0;
  font-size: 11px; color: var(--danger-ink, #b91c1c);
}
.cpf-current {
  font-size: 12px; color: var(--muted); line-height: 1.5;
  padding: 6px 9px; border-radius: 6px; background: var(--surface-2);
  white-space: pre-wrap;
}
</style>
