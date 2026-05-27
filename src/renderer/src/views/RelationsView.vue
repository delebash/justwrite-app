<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useProjectStore } from "../stores/project.js";
import PaneHeader from "../components/PaneHeader.vue";
import Icon from "../components/Icon.vue";

const project = useProjectStore();

const nodes = [
  { id: "elen",  label: "Elen Vael",   cls: "character", x: 380, y: 250, r: 38 },
  { id: "idris", label: "Idris Vael",  cls: "character", x: 220, y: 130, r: 30 },
  { id: "june",  label: "June Asari",  cls: "character", x: 560, y: 160, r: 30 },
  { id: "renn",  label: "Renn",        cls: "character", x: 600, y: 360, r: 30 },
  { id: "house", label: "Halden House", cls: "location", x: 100, y: 100, r: 26 },
  { id: "cove",  label: "Brackish Cove", cls: "location", x: 670, y: 470, r: 28 },
];
const edges = [
  ["elen", "idris"], ["elen", "june"], ["elen", "renn"],
  ["elen", "house"], ["june", "cove"],
];
const find = (id) => nodes.find((n) => n.id === id);

// ── Pan / zoom ─────────────────────────────────────────────
// Transform is applied to an inner <g> as translate(tx, ty) scale(z).
// Wheel zooms cursor-anchored; left-click-drag on empty canvas pans.
const CONTENT_W = 760;
const CONTENT_H = 520;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

const wrapRef = ref(null);
const svgRef = ref(null);
const zoom = ref(1);
const tx = ref(0);
const ty = ref(0);
const isPanning = ref(false);

function clientToSvgPoint(e) {
  // Convert client coords to the svg's internal coordinate system
  // *before* our transform is applied — this lets us anchor zoom on
  // the cursor regardless of current pan/zoom.
  const svg = svgRef.value;
  if (!svg) return { x: 0, y: 0 };
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const inv = ctm.inverse();
  return pt.matrixTransform(inv);
}

function applyZoom(delta, cx, cy) {
  const oldZ = zoom.value;
  const newZ = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZ * (1 + delta)));
  if (newZ === oldZ) return;
  // Keep the SVG point under the cursor stationary:
  //   new_translate = cursor - (cursor - old_translate) * (newZ / oldZ)
  const ratio = newZ / oldZ;
  tx.value = cx - (cx - tx.value) * ratio;
  ty.value = cy - (cy - ty.value) * ratio;
  zoom.value = newZ;
}

function onWheel(e) {
  e.preventDefault();
  const pt = clientToSvgPoint(e);
  // deltaY > 0 means scroll down → zoom out. Tune step to feel right.
  const step = e.deltaY > 0 ? -0.12 : 0.12;
  applyZoom(step, pt.x, pt.y);
}

let panStart = null;
function onPointerDown(e) {
  // Only pan on a primary-button click that didn't land on a node.
  if (e.button !== 0) return;
  // If a node was clicked, let it handle its own thing later — for
  // now nodes don't have click handlers, so this is just a safety net.
  if (e.target.closest?.("[data-node]")) return;
  isPanning.value = true;
  panStart = { x: e.clientX, y: e.clientY, tx: tx.value, ty: ty.value };
  svgRef.value?.setPointerCapture?.(e.pointerId);
}
function onPointerMove(e) {
  if (!isPanning.value || !panStart) return;
  // Translate in SCREEN pixels, then divide by the SVG's screen scale
  // so panning feels 1:1 with the cursor regardless of viewBox stretch.
  const ctm = svgRef.value?.getScreenCTM();
  const sx = ctm ? ctm.a : 1;
  const sy = ctm ? ctm.d : 1;
  tx.value = panStart.tx + (e.clientX - panStart.x) / sx;
  ty.value = panStart.ty + (e.clientY - panStart.y) / sy;
}
function onPointerUp(e) {
  if (isPanning.value) {
    isPanning.value = false;
    panStart = null;
    svgRef.value?.releasePointerCapture?.(e.pointerId);
  }
}

function zoomIn()  { const c = centerSvgPoint(); applyZoom(+0.2, c.x, c.y); }
function zoomOut() { const c = centerSvgPoint(); applyZoom(-0.2, c.x, c.y); }
function resetView() { zoom.value = 1; tx.value = 0; ty.value = 0; }
function fitView() {
  // Fit a small margin around the content's nominal extents.
  if (!wrapRef.value || !svgRef.value) { resetView(); return; }
  const svg = svgRef.value;
  const rect = svg.getBoundingClientRect();
  if (!rect.width || !rect.height) { resetView(); return; }
  const ctm = svg.getScreenCTM();
  if (!ctm) { resetView(); return; }
  // The viewBox already maps 0..760 / 0..520 to the rendered area, so
  // a zoom of 1 with no translate IS the "fit" state. resetView covers it.
  resetView();
}
function centerSvgPoint() {
  const svg = svgRef.value;
  if (!svg) return { x: CONTENT_W / 2, y: CONTENT_H / 2 };
  const rect = svg.getBoundingClientRect();
  const pt = svg.createSVGPoint();
  pt.x = rect.left + rect.width / 2;
  pt.y = rect.top + rect.height / 2;
  const inv = svg.getScreenCTM()?.inverse();
  return inv ? pt.matrixTransform(inv) : { x: CONTENT_W / 2, y: CONTENT_H / 2 };
}

// Keyboard shortcuts while the relations pane is focused.
function onKey(e) {
  if (!wrapRef.value?.matches?.(":hover") && document.activeElement !== wrapRef.value) return;
  if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomIn(); }
  else if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomOut(); }
  else if (e.key === "0") { e.preventDefault(); resetView(); }
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <PaneHeader eyebrow="Planning" title="Relations">
    <div class="relations-toolbar">
      <button class="btn ghost icon sm" title="Zoom out (−)" @click="zoomOut">
        <Icon name="ChevRight" :size="12" style="transform:rotate(180deg)" />
      </button>
      <span class="relations-zoom-label">{{ Math.round(zoom * 100) }}%</span>
      <button class="btn ghost icon sm" title="Zoom in (+)" @click="zoomIn">
        <Icon name="ChevRight" :size="12" />
      </button>
      <button class="btn ghost sm" title="Reset view (0)" @click="resetView">Reset</button>
    </div>
  </PaneHeader>

  <div ref="wrapRef" class="relations-canvas" tabindex="0"
    :class="{ panning: isPanning }">
    <svg ref="svgRef"
      :viewBox="`0 0 ${CONTENT_W} ${CONTENT_H}`"
      preserveAspectRatio="xMidYMid meet"
      width="100%" height="100%"
      @wheel.prevent="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp">
      <g :transform="`translate(${tx} ${ty}) scale(${zoom})`">
        <line v-for="([a, b], i) in edges" :key="i"
          :x1="find(a).x" :y1="find(a).y" :x2="find(b).x" :y2="find(b).y"
          style="stroke: var(--border-strong)" stroke-width="1.2" />
        <g v-for="n in nodes" :key="n.id" data-node>
          <circle :cx="n.x" :cy="n.y" :r="n.r"
            :style="`fill: var(${n.cls === 'character' ? '--mm-character-bg' : '--mm-location-bg'}); stroke: var(${n.cls === 'character' ? '--mm-character-line' : '--mm-location-line'})`"
            stroke-width="1.5" />
          <text :x="n.x" :y="n.y + 4" :font-size="n.r > 28 ? 12 : 11"
            text-anchor="middle" style="fill: var(--ink); pointer-events: none">{{ n.label }}</text>
        </g>
      </g>
    </svg>

    <div class="relations-hint">
      <kbd>Wheel</kbd> zoom · <kbd>Drag</kbd> pan · <kbd>+</kbd>/<kbd>−</kbd>/<kbd>0</kbd>
    </div>
  </div>
</template>

<style scoped>
.relations-toolbar {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 4px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 7px;
}
.relations-zoom-label {
  display: inline-block;
  min-width: 42px;
  text-align: center;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  color: var(--ink-2);
}

.relations-canvas {
  flex: 1;
  position: relative;
  background:
    radial-gradient(circle at 14px 14px, var(--border-soft) 1px, transparent 1px) 0 0/28px 28px,
    var(--surface);
  overflow: hidden;
  outline: none;
  cursor: grab;
}
.relations-canvas.panning { cursor: grabbing; }
.relations-canvas svg { display: block; touch-action: none; }

.relations-hint {
  position: absolute;
  left: 14px;
  bottom: 14px;
  pointer-events: none;
  font-size: 11px;
  color: var(--muted);
  background: color-mix(in oklab, var(--surface), transparent 20%);
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--border-soft);
  display: flex; align-items: center; gap: 6px;
}
.relations-hint kbd {
  font-family: var(--font-mono);
  font-size: 10.5px;
  padding: 1px 5px;
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 3px;
  background: var(--surface-2);
  color: var(--ink-2);
}
</style>
