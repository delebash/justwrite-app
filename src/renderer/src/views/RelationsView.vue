<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import PaneHeader from "../components/PaneHeader.vue";
import Icon from "../components/Icon.vue";

const project = useProjectStore();
const router = useRouter();

// ── Graph derivation ──────────────────────────────────────
// Nodes are characters + locations + objects from the project store,
// distributed across concentric rings:
//   • Inner ring:   main characters
//   • Middle ring:  secondary characters
//   • Outer ring:   locations + objects (interleaved)
// Edges come from two sources:
//   1. Group co-membership — any two entities in the same group's
//      member-list (groups can mix kinds, so character⇄location etc.).
//   2. Scene co-occurrence — any two entities whose ids appear in the
//      same scene's Links selection (characters, locations, or objects
//      arrays).
// The edge map dedups undirected pairs and records source labels so a
// hover tooltip can explain *why* two nodes are connected.

const CONTENT_W = 900;
const CONTENT_H = 640;
const CENTER_X = CONTENT_W / 2;
const CENTER_Y = CONTENT_H / 2;
const RING_MAIN     = 110;   // main characters
const RING_SECOND   = 190;   // secondary characters
const RING_OUTER    = 280;   // locations + objects
const NODE_R_MAIN   = 36;
const NODE_R_SECOND = 26;
const NODE_R_OUTER  = 24;

function ringPlace(items, ringRadius, mapFn) {
  const out = [];
  const n = items.length;
  if (n === 0) return out;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2 - Math.PI / 2;
    out.push(mapFn(items[i], {
      x: CENTER_X + Math.cos(t) * ringRadius,
      y: CENTER_Y + Math.sin(t) * ringRadius,
    }));
  }
  return out;
}

// Toggleable kind filters — checked kinds appear in the graph.
const showCharacters = ref(true);
const showLocations  = ref(true);
const showObjects    = ref(true);

const nodes = computed(() => {
  const chars = showCharacters.value ? (project.characters || []) : [];
  const main = chars.filter((c) => c.main);
  const other = chars.filter((c) => !c.main);
  const locs = showLocations.value ? (project.locations || []) : [];
  const objs = showObjects.value   ? (project.objects   || []) : [];

  // Inner: main characters
  const mainNodes = ringPlace(main, RING_MAIN, (c, p) => ({
    id: c.id, label: c.name, sub: c.role,
    cls: "character", main: true,
    x: p.x, y: p.y, r: NODE_R_MAIN,
  }));

  // Middle: secondary characters
  const secondNodes = ringPlace(other, RING_SECOND, (c, p) => ({
    id: c.id, label: c.name, sub: c.role,
    cls: "character", main: false,
    x: p.x, y: p.y, r: NODE_R_SECOND,
  }));

  // Outer: locations + objects interleaved. Interleaving keeps colours
  // mixed around the ring instead of clustering all greens on one side.
  const outer = [];
  const maxLen = Math.max(locs.length, objs.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < locs.length) outer.push({ kind: "location", entity: locs[i] });
    if (i < objs.length) outer.push({ kind: "object",   entity: objs[i] });
  }
  const outerNodes = ringPlace(outer, RING_OUTER, (item, p) => ({
    id: item.entity.id,
    label: item.entity.name,
    sub: item.entity.kind || "",
    cls: item.kind,
    main: false,
    x: p.x, y: p.y, r: NODE_R_OUTER,
  }));

  return [...mainNodes, ...secondNodes, ...outerNodes];
});

const nodeById = computed(() => {
  const m = new Map();
  for (const n of nodes.value) m.set(n.id, n);
  return m;
});

// Build the edge set restricted to a `known` ID set. Factored out so we
// can compute both the live (filtered) graph AND an unfiltered total for
// the legend counts without duplicating the rule logic below.
function buildEdges(known) {
  // Map<"id1|id2", { a, b, reasons: Set<string> }> where id1 < id2
  // so an undirected pair only appears once regardless of input order.
  const map = new Map();

  function add(a, b, reason) {
    if (!a || !b || a === b) return;
    if (!known.has(a) || !known.has(b)) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    let edge = map.get(key);
    if (!edge) {
      edge = { a: a < b ? a : b, b: a < b ? b : a, reasons: new Set() };
      map.set(key, edge);
    }
    edge.reasons.add(reason);
  }

  function addAllPairs(ids, reason) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        add(ids[i], ids[j], reason);
      }
    }
  }

  // 1. Group co-membership — connect every pair of members in the
  //    group, regardless of kind (character/location/object).
  for (const g of (project.groups || [])) {
    const ids = (g.members || [])
      .filter((m) => m.kind === "character" || m.kind === "location" || m.kind === "object")
      .map((m) => m.id);
    addAllPairs(ids, `Group: ${g.name}`);
  }

  // 2. Scene co-occurrence — the scene's Links page captures characters,
  //    locations, and objects in separate arrays; connect every pair
  //    across all three so a character ⇄ location edge appears when
  //    they share a scene.
  //    While we walk the scenes, also accumulate per-strand sets so
  //    rule 3 below can connect everything that touches the same strand.
  const strandMembers = new Map();   // strandId → Set<entityId>
  for (const part of (project.parts || [])) {
    for (const ch of (part.chapters || [])) {
      const scenes = project.scenesFor(ch.id);
      for (const scn of scenes) {
        const ids = [
          ...(Array.isArray(scn.characters) ? scn.characters : []),
          ...(Array.isArray(scn.locations)  ? scn.locations  : []),
          ...(Array.isArray(scn.objects)    ? scn.objects    : []),
        ];
        addAllPairs(ids, `Scene: ${scn.title || `Ch.${ch.num}`}`);
        for (const strandId of (scn.strands || [])) {
          let set = strandMembers.get(strandId);
          if (!set) { set = new Set(); strandMembers.set(strandId, set); }
          for (const id of ids) set.add(id);
        }
      }
    }
  }

  // 3. Strand membership — every entity that appears in any scene
  //    tagged with the same strand gets connected to every other
  //    entity in that strand's set.
  const strandsById = new Map((project.strands || []).map((s) => [s.id, s]));
  for (const [strandId, set] of strandMembers) {
    if (set.size < 2) continue;
    const strand = strandsById.get(strandId);
    addAllPairs([...set], `Narrative strand: ${strand?.name || strandId}`);
  }

  return [...map.values()].map((e) => ({
    ...e,
    reasonList: [...e.reasons],
  }));
}

// Live (filtered) edges — feeds the rendered graph.
const edges = computed(() => buildEdges(nodeById.value));

// Defensive: only emit edges whose both endpoints are still visible.
// The add() guard inside buildEdges already enforces this, but keeping
// an explicit filter makes the dependency on the visibility flags
// obvious at the render site.
const visibleEdges = computed(() =>
  edges.value.filter((e) => nodeById.value.has(e.a) && nodeById.value.has(e.b))
);

// Unfiltered edges over every character/location/object — used to
// label each legend row with its "total reachable" edge count so the
// number is stable as the user toggles filters.
const allEdges = computed(() => {
  const all = new Set();
  for (const c of (project.characters || [])) all.add(c.id);
  for (const l of (project.locations  || [])) all.add(l.id);
  for (const o of (project.objects    || [])) all.add(o.id);
  return buildEdges(all);
});

const allEntityKind = computed(() => {
  const m = new Map();
  for (const c of (project.characters || [])) m.set(c.id, "character");
  for (const l of (project.locations  || [])) m.set(l.id, "location");
  for (const o of (project.objects    || [])) m.set(o.id, "object");
  return m;
});

// An edge "touches" a kind when either endpoint is of that kind.
const edgeCounts = computed(() => {
  const out = { character: 0, location: 0, object: 0 };
  const kindOf = allEntityKind.value;
  for (const e of allEdges.value) {
    const ka = kindOf.get(e.a);
    const kb = kindOf.get(e.b);
    if (ka && out[ka] !== undefined) out[ka]++;
    if (kb && kb !== ka && out[kb] !== undefined) out[kb]++;
  }
  return out;
});

function nodeStroke(n) {
  if (n.cls === "location") return "var(--mm-location-line)";
  if (n.cls === "object")   return "var(--mm-object-line)";
  return "var(--mm-character-line)";
}
function nodeFill(n) {
  if (n.cls === "location") return "var(--mm-location-bg)";
  if (n.cls === "object")   return "var(--mm-object-bg)";
  return "var(--mm-character-bg)";
}
function edgeTitle(e) {
  const a = nodeById.value.get(e.a)?.label || e.a;
  const b = nodeById.value.get(e.b)?.label || e.b;
  return `${a} ⇄ ${b}\n${e.reasonList.join("\n")}`;
}
function openNode(n) {
  if (!n) return;
  if (n.cls === "location") router.push(`/locations/${n.id}`);
  else if (n.cls === "object") router.push(`/objects/${n.id}`);
  else router.push(`/characters/${n.id}`);
}

// ── Pan / zoom ─────────────────────────────────────────────
// Transform is applied to an inner <g> as translate(tx, ty) scale(z).
// Wheel zooms cursor-anchored; left-click-drag on empty canvas pans.
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
  // The viewBox already maps 0..CONTENT_W / 0..CONTENT_H to the rendered
  // area, so a zoom of 1 with no translate IS the "fit" state.
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

  <div ref="wrapRef" class="pane-card relations-canvas" tabindex="0"
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
        <!-- Edges -->
        <line v-for="e in visibleEdges" :key="`${e.a}|${e.b}`"
          :x1="nodeById.get(e.a)?.x" :y1="nodeById.get(e.a)?.y"
          :x2="nodeById.get(e.b)?.x" :y2="nodeById.get(e.b)?.y"
          :stroke-width="Math.min(3, 1 + e.reasonList.length * 0.6)"
          class="relations-edge">
          <title>{{ edgeTitle(e) }}</title>
        </line>

        <!-- Nodes -->
        <g v-for="n in nodes" :key="n.id" data-node class="relations-node"
          :transform="`translate(${n.x} ${n.y})`"
          @click="openNode(n)">
          <title>{{ n.label }}{{ n.sub ? ` — ${n.sub}` : "" }}</title>
          <circle :r="n.r"
            :style="`fill: ${nodeFill(n)}; stroke: ${nodeStroke(n)}`"
            :stroke-width="n.main ? 2 : 1.5" />
          <text :y="4" :font-size="n.r > 30 ? 12 : 11"
            text-anchor="middle"
            style="fill: var(--ink); pointer-events: none; font-weight: 500;">
            {{ n.label }}
          </text>
        </g>
      </g>
    </svg>

    <!-- Empty state -->
    <div v-if="nodes.length === 0" class="relations-empty">
      <p>Nothing to connect yet — add characters, locations, or objects to see relationships here.</p>
    </div>

    <!-- Legend — colored dots double as toggles; each row shows the
         total edge count touching that kind. -->
    <div class="relations-legend">
      <div class="legend-head">
        <span>Type</span>
        <span class="legend-head-count">Edges</span>
      </div>
      <label>
        <input type="checkbox" v-model="showCharacters" />
        <i class="dot character" />
        <span class="legend-label">Character</span>
        <span class="legend-count">{{ edgeCounts.character }}</span>
      </label>
      <label>
        <input type="checkbox" v-model="showLocations" />
        <i class="dot location" />
        <span class="legend-label">Location</span>
        <span class="legend-count">{{ edgeCounts.location }}</span>
      </label>
      <label>
        <input type="checkbox" v-model="showObjects" />
        <i class="dot object" />
        <span class="legend-label">Object</span>
        <span class="legend-count">{{ edgeCounts.object }}</span>
      </label>
    </div>

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
  position: relative;
  background:
    radial-gradient(circle at 14px 14px, var(--border-soft) 1px, transparent 1px) 0 0/28px 28px,
    var(--surface);
  outline: none;
  cursor: grab;
}
.relations-canvas.panning { cursor: grabbing; }
.relations-canvas svg { display: block; touch-action: none; }

.relations-edge {
  stroke: var(--border-strong);
  opacity: 0.6;
  transition: opacity .12s ease, stroke .12s ease;
}
.relations-edge:hover { opacity: 1; stroke: var(--accent); }

.relations-node { cursor: pointer; }
.relations-node circle {
  transition: filter .12s ease, transform .08s ease;
}
.relations-node:hover circle {
  filter: drop-shadow(0 0 6px var(--accent-soft));
}
.relations-node:active circle { transform: scale(0.96); transform-box: fill-box; transform-origin: center; }

.relations-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
}
.relations-empty p {
  font-size: 13px;
  color: var(--muted);
  font-style: italic;
  background: color-mix(in oklab, var(--surface), transparent 15%);
  padding: 14px 20px;
  border-radius: 10px;
  border: 1px dashed var(--border-strong);
  max-width: 360px;
  text-align: center;
}

.relations-legend {
  position: absolute;
  top: 14px;
  right: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: var(--ink-2);
  background: color-mix(in oklab, var(--surface), transparent 15%);
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-soft);
}
.relations-legend label {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  padding: 2px 0;
}
.relations-legend input[type="checkbox"] {
  margin: 0;
  accent-color: var(--accent);
  cursor: pointer;
}
.relations-legend .dot {
  width: 18px; height: 18px;
  border-radius: 4px;
  border: 1px solid;
  flex-shrink: 0;
}
.relations-legend .dot.character {
  background: var(--mm-character-line);
  border-color: var(--mm-character-line);
}
.relations-legend .dot.location {
  background: var(--mm-location-line);
  border-color: var(--mm-location-line);
}
.relations-legend .dot.object {
  background: var(--mm-object-line);
  border-color: var(--mm-object-line);
}
.relations-legend .legend-label { white-space: nowrap; }
.relations-legend .legend-count {
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  font-size: 10.5px;
  min-width: 24px;
  text-align: right;
}
.relations-legend .legend-head {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  gap: 8px;
  align-items: center;
  font-size: 9.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  padding-bottom: 4px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--border-soft);
}
.relations-legend .legend-head > span:first-child { grid-column: 3; }
.relations-legend .legend-head-count {
  grid-column: 4;
  min-width: 24px;
  text-align: right;
}

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
