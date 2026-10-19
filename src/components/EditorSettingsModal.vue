<script setup>
// Writing settings panel (font, size, spacing, indent, capitalize, spell
// check). Edits a local draft; Save commits to the ui store (which applies
// the CSS vars globally), Back discards.
import { computed, reactive } from "vue";
import { useUiStore } from "../stores/ui.js";
import { useProjectStore } from "../stores/project.js";
import { languageName } from "@delebash/ui";
import {
  EDITOR_FONTS, LINE_SPACING_OPTIONS, PARAGRAPH_SPACING_OPTIONS, DEFAULT_EDITOR_SETTINGS,
} from "../services/editorSettings.js";
import { AppModal } from "@delebash/ui";
import { UiButton } from "@delebash/ui";
import { UiSelect } from "@delebash/ui";
import { UiSegmented } from "@delebash/ui";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

// Options for the segmented controls below. `null` means "follow the
// project's theme default" for the three tri-state fields (font size,
// indent, line/paragraph spacing). The boolean fields are two-state.
// Computed, so the words follow a language switch (2026-10-18: they were English literals, and
// a Spanish screen showed "theme", "enabled", "disabled").
const FONT_SIZE_OPTS = computed(() => [
  { value: null,     label: t("editorSettings.optTheme") },
  { value: "small",  label: t("editorSettings.optSmall") },
  { value: "medium", label: t("editorSettings.optMedium") },
  { value: "big",    label: t("editorSettings.optBig") },
]);
const INDENT_OPTS = computed(() => [
  { value: null,  label: t("editorSettings.optTheme") },
  { value: true,  label: t("editorSettings.optEnabled") },
  { value: false, label: t("editorSettings.optDisabled") },
]);
const BOOL_OPTS = computed(() => [
  { value: true,  label: t("editorSettings.optEnabled") },
  { value: false, label: t("editorSettings.optDisabled") },
]);
const LINE_SPACING_OPTS = computed(() => [{ value: null, label: t("editorSettings.optTheme") }, ...LINE_SPACING_OPTIONS.map((o) => ({ value: o, label: o }))]);
const PARA_SPACING_OPTS = computed(() => [{ value: null, label: t("editorSettings.optTheme") }, ...PARAGRAPH_SPACING_OPTIONS.map((o) => ({ value: o, label: o }))]);

// The prose highlights' switches; their lists are English, so a book in another language says so.
const PROSE_HIGHLIGHTS = [
  { field: "highlightFilterWords", labelKey: "editorSettings.highlightFilterWords" },
  { field: "highlightAdverbs", labelKey: "editorSettings.highlightAdverbs" },
  { field: "highlightAiTells", labelKey: "editorSettings.highlightAiTells" },
];
const project = useProjectStore();
const bookLanguage = computed(() => project.project?.language || "en");
const englishBook = computed(() => /^en(-|$)/i.test(bookLanguage.value));

const emit = defineEmits(["close"]);
const ui = useUiStore();
const draft = reactive({ ...DEFAULT_EDITOR_SETTINGS, ...ui.editorSettings });

function save() { ui.setEditorSettings({ ...draft }); emit("close"); }
function back() { emit("close"); }
</script>

<template>
  <AppModal :title="$t('editorSettings.title')" @close="back">
    <div class="es-body">
      <div class="es-row">
        <span class="es-label">{{ $t("editorSettings.font") }}</span>
        <UiSelect class="es-select" v-model="draft.font"
          :options="EDITOR_FONTS.map(f => ({ label: f.labelKey ? t(f.labelKey) : f.label, value: f.label }))" />
      </div>

      <div class="es-row">
        <span class="es-label">{{ $t("editorSettings.fontSize") }}</span>
        <UiSegmented v-model="draft.fontSize" :options="FONT_SIZE_OPTS" :aria-label="$t('editorSettings.fontSize')" />
      </div>

      <div class="es-row">
        <span class="es-label">{{ $t("editorSettings.paragraphIndent") }}</span>
        <UiSegmented v-model="draft.paragraphIndent" :options="INDENT_OPTS" :aria-label="$t('editorSettings.paragraphIndent')" />
      </div>

      <div class="es-row">
        <span class="es-label">{{ $t("editorSettings.capitalize") }}</span>
        <UiSegmented v-model="draft.capitalize" :options="BOOL_OPTS" :aria-label="$t('editorSettings.capitalize')" />
      </div>

      <div class="es-row">
        <span class="es-label">{{ $t("editorSettings.lineSpacing") }}</span>
        <UiSegmented v-model="draft.lineSpacing" :options="LINE_SPACING_OPTS" :aria-label="$t('editorSettings.lineSpacing')" />
      </div>

      <div class="es-row">
        <span class="es-label">{{ $t("editorSettings.paragraphSpacing") }}</span>
        <UiSegmented v-model="draft.paragraphSpacing" :options="PARA_SPACING_OPTS" :aria-label="$t('editorSettings.paragraphSpacing')" />
      </div>

      <div class="es-row">
        <span class="es-label">{{ $t("editorSettings.spellCheck") }}</span>
        <UiSegmented v-model="draft.spellCheck" :options="BOOL_OPTS" :aria-label="$t('editorSettings.spellCheck')" />
      </div>

      <div class="es-row">
        <span class="es-label">{{ $t("editorSettings.keepStrikethrough") }}</span>
        <UiSegmented v-model="draft.keepStrikethroughOnAccept" :options="BOOL_OPTS"
          :aria-label="$t('editorSettings.keepStrikethrough')" />
      </div>

      <div class="es-row">
        <span class="es-label">{{ $t("editorSettings.highlightAiText") }}</span>
        <UiSegmented v-model="draft.highlightAiText" :options="BOOL_OPTS"
          :aria-label="$t('editorSettings.highlightAiText')" />
      </div>

      <!-- Prose highlights (2026-10-18): Analysis' English lists, marked as you write. -->
      <div v-for="h in PROSE_HIGHLIGHTS" :key="h.field" class="es-row">
        <span class="es-label">{{ $t(h.labelKey) }}</span>
        <UiSegmented v-model="draft[h.field]" :options="BOOL_OPTS" :aria-label="$t(h.labelKey)" />
      </div>
      <p v-if="!englishBook" class="es-note">
        {{ $t("editorSettings.highlightsEnglishOnly", { language: languageName(bookLanguage) }) }}
      </p>
    </div>

    <template #footer>
      <UiButton intent="primary" @click="save">{{ $t("editorSettings.save") }}</UiButton>
      <UiButton intent="ghost" @click="back">{{ $t("editorSettings.back") }}</UiButton>
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
.es-note { margin: -4px 0 0 226px; max-width: 60ch; font-size: 11.5px; line-height: 1.45; color: var(--muted); }
/* A phone (Quasar's xs, under 600px): each label over its control — the two columns cut the
   controls off at 390px (seen 2026-10-18). */
@media (max-width: 599.98px) {
  .es-row { grid-template-columns: minmax(0, 1fr); gap: 6px; }
  .es-label { text-align: left; }
  .es-note { margin-left: 0; }
}
</style>
