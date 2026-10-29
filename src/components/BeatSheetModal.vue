<script setup>
// Beat-sheet overlay modal.
//
// User picks a framework (Save the Cat / Hero's Journey / 7-Point).
// The model maps each chapter to one or more beats and flags any
// beats the book doesn't cover. Each beat row shows: name, definition,
// mapped chapter (clickable jump) or MISSING badge, and a one-line
// justification from the model.
//
// Mappings persist per-template on project.beatSheets, so a writer can
// keep all three frameworks mapped at once and compare.

import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useAiStore } from "../stores/ai.js";
import { useSurfaceTask, Icon, AiTaskStrip, AppModal, UiButton, UiSelect, UiBanner } from "@delebash/ui";
import {
  mapToBeatSheet,
  BEAT_TEMPLATES,
  TEMPLATE_OPTIONS,
} from "../services/analysis/beatSheet.js";
import AiFeatureChip from "./AiFeatureChip.vue";
import { useI18n } from "vue-i18n";
import { relativeTime } from "@delebash/ui";

const { t } = useI18n();

const emit = defineEmits(["close"]);

const project = useProjectStore();
const ai = useAiStore();
const router = useRouter();
const error = ref("");

const myTask = useSurfaceTask("beatSheet");
const running = computed(() => !!myTask.value);

function isAbort(e) { return e?.name === "AbortError" || /abort/i.test(e?.message || ""); }

const selectedTemplate = ref(TEMPLATE_OPTIONS[0].value);
const mapping = computed(() => project.beatSheets?.[selectedTemplate.value] || null);
const currentTemplate = computed(() => BEAT_TEMPLATES[selectedTemplate.value]);
const templateOptions = computed(() => TEMPLATE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) })));
// A mapped beat's name or description in the interface language, by its key (a mapping saved
// before 2026-10-13 also carries an English copy, the fallback).
function beatWord(b, field, saved) {
  const beat = currentTemplate.value?.beats.find((x) => x.key === b.beatKey);
  return beat ? t(beat[field]) : saved || "";
}

async function run() {
  error.value = "";
  if (running.value) return;
  if (!ai.providerForFeature("beatSheet")) {
    error.value = t("beatSheet.err.noProvider");
    return;
  }
  try {
    const result = await mapToBeatSheet({
      project,
      templateKey: selectedTemplate.value,
      task: { label: t("beatSheet.taskLabel"), meta: { templateKey: selectedTemplate.value } },
    });
    project.setBeatSheet(selectedTemplate.value, result);
  } catch (e) {
    if (!isAbort(e)) {
      const msg = String(e?.message || e || "");
      error.value = /provider|api key|configure/i.test(msg)
        ? t("beatSheet.err.noProvider")
        : msg || t("beatSheet.err.failed");
    }
  }
}

function regenerate() {
  project.clearBeatSheet(selectedTemplate.value);
  run();
}

function clearCurrent() {
  project.clearBeatSheet(selectedTemplate.value);
}

function jumpToChapter(num) {
  const ch = project.allChapters.find((c) => c.num === num);
  if (ch) router.push(`/chapters/${ch.id}`);
}

// Switching template kicks a fresh fetch if we don't have a cache for
// that template yet.
watch(selectedTemplate, () => {
  error.value = "";
  if (!mapping.value && !running.value) run();
});

// First open should fetch if nothing cached yet.
if (!mapping.value) run();
</script>

<template>
  <AppModal :eyebrow="$t('beatSheet.eyebrow')" :title="$t('beatSheet.title')"
    wide
    :closable="!running"
    @close="emit('close')"
  >
    <template #header-extra>
      <AiFeatureChip feature="beatSheet" :label="$t('beatSheet.eyebrow')" editable />
    </template>

    <template #lede>
      <i18n-t keypath="beatSheet.blurb" scope="global">
        <template #missing><strong>{{ $t("beatSheet.missingTag") }}</strong></template>
      </i18n-t>
    </template>

    <div class="bs-controls">
      <div class="bs-picker">
        <label class="bs-label">{{ $t("beatSheet.frameworkLabel") }}</label>
        <UiSelect
          v-model="selectedTemplate"
          :options="templateOptions"
          option-label="label"
          option-value="value"
        />
      </div>
      <p v-if="currentTemplate" class="bs-blurb-template">{{ t(currentTemplate.blurbKey) }}</p>
    </div>

    <UiBanner v-if="error">
      {{ error }}
      <template #action>
        <UiButton intent="ghost" size="small" @click="run">
          <Icon name="Refresh" :size="12" /> {{ $t("common.retry") }}
        </UiButton>
      </template>
    </UiBanner>

    <AiTaskStrip v-if="running" :task="myTask" />

    <div v-else-if="!mapping && !error" class="bs-loading">
      <q-spinner class="bs-spinner" size="14px" />
      <span>{{ $t("beatSheet.mapping") }}</span>
    </div>

    <template v-else-if="mapping">
      <div class="bs-head">
        <span class="bs-pill bs-pill-coverage">
          {{ $t("beatSheet.coverage", { covered: mapping.totalBeats - mapping.missingCount, total: mapping.totalBeats }) }}
        </span>
        <span v-if="mapping.missingCount" class="bs-pill bs-pill-missing">
          {{ $t("beatSheet.missingCount", { n: mapping.missingCount }) }}
        </span>
        <span class="result-stamp">
          {{ $t("beatSheet.generatedAgo", { when: relativeTime(mapping.generatedAt) }) }}
          <template v-if="mapping.model"> {{ $t("beatSheet.viaModel", { model: mapping.model }) }}</template>
        </span>
      </div>

      <p v-if="mapping.summary" class="bs-summary">{{ mapping.summary }}</p>

      <ol class="bs-beats">
        <li v-for="b in mapping.mapping" :key="b.beatKey"
            class="bs-beat" :class="{ missing: b.missing }">
          <div class="bs-beat-head">
            <span class="bs-beat-name">{{ beatWord(b, 'nameKey', b.beatName) }}</span>
            <span v-if="b.missing" class="bs-missing-tag">
              <Icon name="Alert" :size="11" /> {{ $t("beatSheet.missingTag") }}
            </span>
            <button v-else-if="b.chapterNum" class="bs-beat-jump"
                    @click="jumpToChapter(b.chapterNum)"
                    v-tooltip.bottom="$t('common.openThisChapter')">
              {{ $t("common.chapterShort", { num: b.chapterNum }) }}
            </button>
          </div>
          <p class="bs-beat-desc">{{ beatWord(b, 'descKey', b.beatDesc) }}</p>
          <p v-if="b.justification" class="bs-beat-just">
            <span class="bs-just-label">{{ b.missing ? $t('beatSheet.whyMissing') : $t('beatSheet.onThePage') }}</span>
            {{ b.justification }}
          </p>
        </li>
      </ol>
    </template>

    <template #footer>
      <UiButton v-if="mapping && !running" intent="ghost" @click="clearCurrent">
        {{ $t("beatSheet.clearMapping") }}
      </UiButton>
      <span class="bs-foot-spacer" />
      <UiButton v-if="mapping && !running" intent="ghost" @click="regenerate">
        <Icon name="Refresh" :size="12" /> {{ $t("common.regenerate") }}
      </UiButton>
      <UiButton intent="primary" @click="emit('close')">{{ $t("common.done") }}</UiButton>
    </template>
  </AppModal>
</template>

<style scoped>
.bs-controls {
  display: flex; flex-direction: column; gap: 8px;
  margin-bottom: 18px;
}
.bs-picker { display: flex; flex-direction: column; gap: 4px; max-width: 280px; }
.bs-label {
  font-family: var(--font-mono); font-size: 9.5px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted);
}
.bs-blurb-template {
  margin: 0; max-width: 78ch;
  font-size: 12px; color: var(--muted); font-style: italic;
}

.bs-loading {
  display: flex; align-items: center; gap: 12px;
  font-size: 13px; color: var(--muted); font-style: italic;
  min-height: 100px;
}
.bs-spinner { color: var(--accent); }

.bs-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.bs-pill {
  font-family: var(--font-mono); font-size: 10.5px;
  padding: 4px 12px; border-radius: 999px;
}
.bs-pill-coverage { background: color-mix(in oklab, var(--status-done) 16%, transparent); color: var(--ink); }
.bs-pill-missing  { background: color-mix(in oklab, var(--danger) 16%, transparent); color: var(--ink); }

.bs-summary {
  margin: 0 0 22px; max-width: 78ch;
  font-family: var(--font-serif); font-size: 14px; line-height: 1.65;
  color: var(--ink-2); font-style: italic;
  padding-left: 14px; border-left: 2px solid var(--accent-line);
}

.bs-beats { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.bs-beat {
  padding: 12px 14px;
  background: var(--surface-2); border-radius: 8px;
  border-left: 3px solid var(--accent);
}
.bs-beat.missing { border-left-color: var(--danger); opacity: 0.95; }

.bs-beat-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 4px; }
.bs-beat-name {
  font-family: var(--font-serif); font-size: 14.5px; font-weight: 600;
  color: var(--ink);
}
.bs-beat-jump {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--accent-ink);
  padding: 0; margin-left: auto;
}
.bs-beat-jump:hover { color: var(--accent); text-decoration: underline; }
.bs-missing-tag {
  margin-left: auto;
  display: inline-flex; align-items: center; gap: 4px;
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--danger);
  padding: 2px 8px; border-radius: 999px;
  background: color-mix(in oklab, var(--danger) 14%, transparent);
}
.bs-beat-desc {
  margin: 0 0 6px; max-width: 70ch;
  font-size: 12px; color: var(--muted); line-height: 1.5;
  font-style: italic;
}
.bs-beat-just {
  margin: 6px 0 0; max-width: 70ch;
  font-size: 13px; color: var(--ink-2); line-height: 1.55;
}
.bs-just-label {
  font-family: var(--font-mono); font-size: 9.5px;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--muted); margin-right: 6px;
}

.bs-foot-spacer { flex: 1; }
</style>
