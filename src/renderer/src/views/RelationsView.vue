<script setup>
import { useProjectStore } from "../stores/project.js";
import PaneHeader from "../components/PaneHeader.vue";

const project = useProjectStore();
const nodes = [
  { id: "elen",  label: "Elen Vael",  cls: "character", x: 380, y: 250, r: 38 },
  { id: "idris", label: "Idris Vael", cls: "character", x: 220, y: 130, r: 30 },
  { id: "june",  label: "June Asari", cls: "character", x: 560, y: 160, r: 30 },
  { id: "renn",  label: "Renn",       cls: "character", x: 600, y: 360, r: 30 },
  { id: "house", label: "Halden House", cls: "location", x: 100, y: 100, r: 26 },
  { id: "cove",  label: "Brackish Cove", cls: "location", x: 670, y: 470, r: 28 },
];
const edges = [
  ["elen","idris"], ["elen","june"], ["elen","renn"],
  ["elen","house"], ["june","cove"],
];
const find = (id) => nodes.find((n) => n.id === id);
</script>

<template>
  <PaneHeader eyebrow="Planning" title="Relations" />
  <div style="flex:1;position:relative;background:radial-gradient(circle at 14px 14px, var(--border-soft) 1px, transparent 1px) 0 0/28px 28px var(--surface)">
    <svg viewBox="0 0 760 520" preserveAspectRatio="xMidYMid meet" width="100%" height="100%">
      <line v-for="([a, b], i) in edges" :key="i"
        :x1="find(a).x" :y1="find(a).y" :x2="find(b).x" :y2="find(b).y"
        style="stroke: var(--border-strong)" stroke-width="1.2" />
      <g v-for="n in nodes" :key="n.id">
        <circle :cx="n.x" :cy="n.y" :r="n.r"
          :style="`fill: var(${n.cls === 'character' ? '--mm-character-bg' : '--mm-location-bg'}); stroke: var(${n.cls === 'character' ? '--mm-character-line' : '--mm-location-line'})`"
          stroke-width="1.5" />
        <text :x="n.x" :y="n.y + 4" :font-size="n.r > 28 ? 12 : 11" text-anchor="middle" style="fill: var(--ink)">{{ n.label }}</text>
      </g>
    </svg>
  </div>
</template>
