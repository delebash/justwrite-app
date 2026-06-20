<script setup>
// Compact color picker: a small colored swatch trigger that opens a
// floating popover with 12 preset squares + a "Custom color" affordance
// that fires the browser-native color picker for users who want a
// specific brand color or anything off-palette.
//
// Presets live in services/categoricalColors.js — the picker is just
// the chrome.

import { ref, computed, nextTick, onBeforeUnmount } from "vue";
import { computePosition, autoUpdate, offset, flip, shift } from "@floating-ui/dom";
import { PRESET_COLORS } from "@renderer/services/categoricalColors.js";

const props = defineProps({
  modelValue: { type: String, default: "" },
  ariaLabel:  { type: String, default: "Color" },
  size:       { type: Number, default: 24 },
});
const emit = defineEmits(["update:modelValue"]);

const presets = PRESET_COLORS;

const open = ref(false);
const triggerEl = ref(null);
const popEl = ref(null);
let cleanupPos = null;

function tearDownPos() {
  if (cleanupPos) { cleanupPos(); cleanupPos = null; }
}
function setUpPos() {
  tearDownPos();
  if (!triggerEl.value || !popEl.value) return;
  cleanupPos = autoUpdate(triggerEl.value, popEl.value, () => {
    computePosition(triggerEl.value, popEl.value, {
      strategy: "fixed",
      placement: "bottom-start",
      middleware: [offset(6), flip(), shift({ padding: 6 })],
    }).then(({ x, y }) => {
      if (!popEl.value) return;
      popEl.value.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    });
  });
}

function toggle() {
  open.value = !open.value;
  if (open.value) nextTick(setUpPos);
  else tearDownPos();
}
function close() { open.value = false; tearDownPos(); }

function pickPreset(color) {
  emit("update:modelValue", color);
  close();
}

// Native <input type="color"> only speaks #RRGGBB hex. Use canvas to
// translate the current oklch (or named) value to hex so the picker's
// starting color matches what the user already sees. The browser does
// the color-space conversion via fillStyle normalization.
const customHexValue = computed(() => {
  const v = String(props.modelValue || "");
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const ctx = c.getContext("2d");
    ctx.fillStyle = v || "#888";
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    const hex = (n) => n.toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  } catch {
    return "#888888";
  }
});

function onCustomChange(e) {
  emit("update:modelValue", e.target.value);
  close();
}

function onDocMousedown(e) {
  if (!open.value) return;
  const inTrigger = triggerEl.value?.contains(e.target);
  const inPop     = popEl.value?.contains(e.target);
  if (!inTrigger && !inPop) close();
}
function onKeydown(e) {
  if (e.key === "Escape" && open.value) { close(); e.stopPropagation(); }
}

document.addEventListener("mousedown", onDocMousedown);
onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDocMousedown);
  tearDownPos();
});
</script>

<template>
  <div class="jw-color-picker" @keydown="onKeydown">
    <button
      ref="triggerEl"
      type="button"
      class="jw-color-swatch"
      :class="{ open }"
      :style="{ background: modelValue, width: `${size}px`, height: `${size}px` }"
      :aria-label="ariaLabel"
      :aria-expanded="open"
      @click="toggle" />

    <Teleport to="body">
      <div v-if="open" ref="popEl" class="jw-color-pop" @keydown="onKeydown">
        <div class="jw-color-presets">
          <button
            v-for="(c, i) in presets" :key="c"
            type="button"
            class="jw-color-preset"
            :class="{ active: c === modelValue }"
            :style="{ background: c }"
            :aria-label="`Preset ${i + 1}`"
            @click="pickPreset(c)" />
        </div>
        <label class="jw-color-custom">
          <span class="jw-color-custom-swatch"></span>
          <span class="jw-color-custom-label">Custom color</span>
          <input
            type="color"
            class="jw-color-custom-input"
            :value="customHexValue"
            :aria-label="`${ariaLabel} — custom`"
            @change="onCustomChange" />
        </label>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.jw-color-picker { display: inline-block; line-height: 0; }

.jw-color-swatch {
  appearance: none; border: 1px solid var(--border);
  border-radius: 6px; cursor: pointer; padding: 0;
  box-shadow: inset 0 0 0 1px var(--shadow-soft);
  transition: transform .08s ease, box-shadow .12s ease;
}
.jw-color-swatch:hover { transform: scale(1.08); }
.jw-color-swatch.open {
  box-shadow: inset 0 0 0 1px var(--shadow-soft), 0 0 0 2px var(--surface), 0 0 0 3px var(--accent);
}
.jw-color-swatch:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 1px var(--shadow-soft), 0 0 0 3px var(--accent-soft);
}

.jw-color-pop {
  position: fixed; top: 0; left: 0; z-index: 250;
  width: 240px; padding: 12px;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  box-shadow: 0 12px 36px var(--shadow-medium);
}
.jw-color-presets {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
  margin-bottom: 12px;
}
.jw-color-preset {
  appearance: none; border: 0;
  width: 100%; aspect-ratio: 1;
  border-radius: 5px; cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--shadow-soft);
  transition: transform .08s ease;
}
.jw-color-preset:hover { transform: scale(1.08); }
.jw-color-preset.active {
  box-shadow: inset 0 0 0 1px var(--shadow-soft), 0 0 0 2px var(--surface), 0 0 0 3px var(--accent);
}
.jw-color-preset:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.jw-color-custom {
  position: relative;
  display: flex; align-items: center; gap: 10px;
  padding: 6px 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  transition: background .12s ease, border-color .12s ease;
}
.jw-color-custom:hover { background: var(--surface-2); border-color: var(--border-strong); }
.jw-color-custom-swatch {
  width: 22px; height: 22px; border-radius: 5px;
  background: conic-gradient(from 0deg,
    oklch(0.65 0.18 25),
    oklch(0.75 0.16 60),
    oklch(0.85 0.15 90),
    oklch(0.80 0.16 130),
    oklch(0.65 0.14 165),
    oklch(0.65 0.12 200),
    oklch(0.55 0.18 250),
    oklch(0.55 0.20 290),
    oklch(0.65 0.20 330),
    oklch(0.65 0.18 25));
  box-shadow: inset 0 0 0 1px var(--shadow-soft);
  flex-shrink: 0;
}
.jw-color-custom-label {
  font-size: 13px; color: var(--ink);
  font-family: inherit;
}
.jw-color-custom-input {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  opacity: 0; cursor: pointer;
  border: 0; padding: 0; margin: 0;
}
</style>
