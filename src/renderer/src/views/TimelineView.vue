<script setup>
import { useProjectStore } from "../stores/project.js";
import PaneHeader from "../components/PaneHeader.vue";

const project = useProjectStore();
</script>

<template>
  <PaneHeader eyebrow="Planning" title="Timeline" />
  <div class="pane-card">
  <div class="scrollarea" style="padding:22px;overflow:auto">
    <div style="display:grid;grid-auto-flow:column;grid-auto-columns:240px;gap:16px;align-items:start">
      <div v-for="c in project.allChapters.slice(0, 10)" :key="c.id" style="min-width:240px">
        <div style="font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--muted);padding-bottom:8px;border-bottom:1px solid var(--border);margin-bottom:10px">
          <div style="display:flex;justify-content:space-between"><span>Ch. {{ c.num }}</span><span class="t-num" style="color:var(--border-strong)">{{ c.scenes }} sc</span></div>
          <div style="font-family:var(--font-serif);font-size:13px;font-weight:600;color:var(--ink);text-transform:none;margin-top:4px">{{ c.title }}</div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:10px">
          <div style="font-size:12.5px;font-weight:500">Scene {{ c.scenes > 0 ? 1 : "—" }}</div>
          <div class="t-muted" style="font-size:11px;margin-top:4px">Coastal sequence</div>
        </div>
      </div>
    </div>
  </div>
  </div>
</template>
