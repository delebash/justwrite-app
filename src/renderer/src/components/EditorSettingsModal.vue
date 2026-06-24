<script setup>
// Writing settings panel (font, size, spacing, indent, capitalize, spell
// check). Edits a local draft; Save commits to the ui store (which applies
// the CSS vars globally), Back discards.
import { reactive } from "vue";
import { useUiStore } from "../stores/ui.js";
import {
  EDITOR_FONTS, LINE_SPACING_OPTIONS, PARAGRAPH_SPACING_OPTIONS, DEFAULT_EDITOR_SETTINGS,
} from "../services/editorSettings.js";
import { AppModal } from "@delebash/llm-ui";
import { UiButton } from "@delebash/llm-ui";
import { UiSelect } from "@delebash/llm-ui";
import { UiSegmented } from "@delebash/llm-ui";

// Options for the segmented controls below. `null` means "follow the
// project's theme default" for the three tri-state fields (font size,
// indent, line/paragraph spacing). The boolean fields are two-state.
const FONT_SIZE_OPTS = [
  { value: null,     label: "theme" },
  { value: "small",  label: "small" },
  { value: "medium", label: "medium" },
  { value: "big",    label: "big" },
];
const INDENT_OPTS = [
  { value: null,  label: "theme" },
  { value: true,  label: "enabled" },
  { value: false, label: "disabled" },
];
const BOOL_OPTS = [
  { value: true,  label: "enabled" },
  { value: false, label: "disabled" },
];
const LINE_SPACING_OPTS  = [{ value: null, label: "theme" }, ...LINE_SPACING_OPTIONS.map((o) => ({ value: o, label: o }))];
const PARA_SPACING_OPTS  = [{ value: null, label: "theme" }, ...PARAGRAPH_SPACING_OPTIONS.map((o) => ({ value: o, label: o }))];

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
        <UiSelect class="es-select" v-model="draft.font"
          :options="EDITOR_FONTS.map(f => ({ label: f.label, value: f.label }))" />
      </div>

      <div class="es-row">
        <span class="es-label">Font size</span>
        <UiSegmented v-model="draft.fontSize" :options="FONT_SIZE_OPTS" aria-label="Font size" />
      </div>

      <div class="es-row">
        <span class="es-label">Paragraph indent</span>
        <UiSegmented v-model="draft.paragraphIndent" :options="INDENT_OPTS" aria-label="Paragraph indent" />
      </div>

      <div class="es-row">
        <span class="es-label">Capitalize first letter of sentences</span>
        <UiSegmented v-model="draft.capitalize" :options="BOOL_OPTS" aria-label="Capitalize first letter of sentences" />
      </div>

      <div class="es-row">
        <span class="es-label">Line spacing</span>
        <UiSegmented v-model="draft.lineSpacing" :options="LINE_SPACING_OPTS" aria-label="Line spacing" />
      </div>

      <div class="es-row">
        <span class="es-label">Paragraph spacing</span>
        <UiSegmented v-model="draft.paragraphSpacing" :options="PARA_SPACING_OPTS" aria-label="Paragraph spacing" />
      </div>

      <div class="es-row">
        <span class="es-label">Spell check</span>
        <UiSegmented v-model="draft.spellCheck" :options="BOOL_OPTS" aria-label="Spell check" />
      </div>
    </div>

    <template #footer>
      <UiButton intent="primary" @click="save">save</UiButton>
      <UiButton intent="ghost" @click="back">back</UiButton>
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
</style>
