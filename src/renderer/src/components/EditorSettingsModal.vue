<script setup>
// Writing settings panel (font, size, spacing, indent, capitalize, spell
// check). Edits a local draft; Save commits to the ui store (which applies
// the CSS vars globally), Back discards.
import { reactive } from "vue";
import { useUiStore } from "../stores/ui.js";
import {
  EDITOR_FONTS, LINE_SPACING_OPTIONS, PARAGRAPH_SPACING_OPTIONS, DEFAULT_EDITOR_SETTINGS,
} from "../services/editorSettings.js";
import AppModal from "./AppModal.vue";

const emit = defineEmits(["close"]);
const ui = useUiStore();
const draft = reactive({ ...DEFAULT_EDITOR_SETTINGS, ...ui.editorSettings });

function save() { ui.setEditorSettings({ ...draft }); emit("close"); }
function back() { emit("close"); }
</script>

<template>
  <AppModal title="Settings" @close="back">
    <div class="es-body">
      <div class="es-row">
        <span class="es-label">Font</span>
        <select class="input es-select" v-model="draft.font">
          <option v-for="f in EDITOR_FONTS" :key="f.label" :value="f.label">{{ f.label }}</option>
        </select>
      </div>

      <div class="es-row">
        <span class="es-label">Font size</span>
        <div class="seg">
          <button :class="{ active: draft.fontSize == null }" @click="draft.fontSize = null">theme</button>
          <button v-for="o in ['small', 'medium', 'big']" :key="o" :class="{ active: draft.fontSize === o }" @click="draft.fontSize = o">{{ o }}</button>
        </div>
      </div>

      <div class="es-row">
        <span class="es-label">Paragraph indent</span>
        <div class="seg">
          <button :class="{ active: draft.paragraphIndent == null }" @click="draft.paragraphIndent = null">theme</button>
          <button :class="{ active: draft.paragraphIndent === true }" @click="draft.paragraphIndent = true">enabled</button>
          <button :class="{ active: draft.paragraphIndent === false }" @click="draft.paragraphIndent = false">disabled</button>
        </div>
      </div>

      <div class="es-row">
        <span class="es-label">Capitalize first letter of sentences</span>
        <div class="seg">
          <button :class="{ active: draft.capitalize }" @click="draft.capitalize = true">enabled</button>
          <button :class="{ active: !draft.capitalize }" @click="draft.capitalize = false">disabled</button>
        </div>
      </div>

      <div class="es-row">
        <span class="es-label">Line spacing</span>
        <div class="seg">
          <button :class="{ active: draft.lineSpacing == null }" @click="draft.lineSpacing = null">theme</button>
          <button v-for="o in LINE_SPACING_OPTIONS" :key="o" :class="{ active: draft.lineSpacing === o }" @click="draft.lineSpacing = o">{{ o }}</button>
        </div>
      </div>

      <div class="es-row">
        <span class="es-label">Paragraph spacing</span>
        <div class="seg">
          <button :class="{ active: draft.paragraphSpacing == null }" @click="draft.paragraphSpacing = null">theme</button>
          <button v-for="o in PARAGRAPH_SPACING_OPTIONS" :key="o" :class="{ active: draft.paragraphSpacing === o }" @click="draft.paragraphSpacing = o">{{ o }}</button>
        </div>
      </div>

      <div class="es-row">
        <span class="es-label">Spell check</span>
        <div class="seg">
          <button :class="{ active: draft.spellCheck }" @click="draft.spellCheck = true">enabled</button>
          <button :class="{ active: !draft.spellCheck }" @click="draft.spellCheck = false">disabled</button>
        </div>
      </div>
    </div>

    <template #footer>
      <button class="btn primary" @click="save">save</button>
      <button class="btn ghost" @click="back">back</button>
    </template>
  </AppModal>
</template>

<style scoped>
.es-body { display: flex; flex-direction: column; gap: 14px; }
.es-row {
  display: grid; grid-template-columns: 210px 1fr;
  align-items: center; gap: 16px;
}
.es-label { font-size: 12.5px; font-weight: 600; color: var(--ink-2); text-align: right; line-height: 1.3; }
.es-select { max-width: 260px; }

.seg {
  display: inline-flex; align-self: start;
  border: 1px solid var(--border); border-radius: 8px;
  overflow: hidden; background: var(--surface);
}
.seg button {
  appearance: none; border: 0; background: transparent;
  padding: 6px 13px; font: inherit; font-size: 12px;
  color: var(--ink-2); cursor: pointer;
  border-right: 1px solid var(--border);
}
.seg button:last-child { border-right: 0; }
.seg button:hover { background: var(--surface-2); color: var(--ink); }
.seg button.active { background: var(--accent-soft); color: var(--accent-ink); font-weight: 600; }
</style>
