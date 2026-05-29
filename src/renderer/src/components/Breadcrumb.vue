<script setup>
// Breadcrumb trail rendered in place of a pane-eyebrow. Each segment is
// { label, to?, onClick? }: a segment with a `to` route or an `onClick`
// handler is clickable; the trailing (current) segment usually omits both
// and renders as plain text. `onClick` covers non-route navigation (e.g.
// switching a local view mode).
import { useRouter } from "vue-router";

defineProps({
  segments: { type: Array, required: true },
});

const router = useRouter();
function activate(seg) {
  if (typeof seg.onClick === "function") seg.onClick();
  else if (seg.to) router.push(seg.to);
}
</script>

<template>
  <nav class="breadcrumb">
    <template v-for="(seg, i) in segments" :key="i">
      <button v-if="seg.to || seg.onClick" type="button" class="breadcrumb-link" @click="activate(seg)">{{ seg.label }}</button>
      <span v-else class="breadcrumb-current">{{ seg.label }}</span>
      <span v-if="i < segments.length - 1" class="breadcrumb-sep" aria-hidden="true">·</span>
    </template>
  </nav>
</template>

<style scoped>
.breadcrumb {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  font-size: 10.5px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--muted);
}
.breadcrumb-link {
  appearance: none; background: none; border: 0; padding: 0; cursor: pointer;
  font: inherit; letter-spacing: inherit; text-transform: inherit;
  color: var(--muted);
}
.breadcrumb-link:hover { color: var(--accent); text-decoration: underline; }
.breadcrumb-current { color: var(--muted); }
.breadcrumb-sep { color: var(--border-strong); }
</style>
