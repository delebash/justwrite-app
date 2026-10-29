<script setup>
// Multi-reader panel critique modal.
//
// Four distinct reader personas (genre-savvy reader, literary critic,
// agent's intern, book-club reader) read the same chapter in parallel
// and each return a first-person reaction + 1-3 concrete suggestions.
// Where the standard CritiqueModal gives a single editorial pass, this
// surfaces FOUR perspectives so the writer sees where the chapter
// works for each kind of reader and where it doesn't.
//
// Persists on chapter.multiReader so re-opening reads from cache.

import { ref, computed, onMounted } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useAiStore } from "../stores/ai.js";
import { useAiTasksStore, useSurfaceTask, Icon, AiTaskStrip, AppModal, UiButton, UiBanner } from "@delebash/ui";
import {
  runMultiReaderPanel,
  PERSONAS,
} from "../services/analysis/multiReaderCritique.js";
import AiFeatureChip from "./AiFeatureChip.vue";
import { useI18n } from "vue-i18n";
import { relativeTime } from "@delebash/ui";

const { t } = useI18n();

const props = defineProps({
  chapterId: { type: String, required: true },
});
const emit = defineEmits(["close"]);

const project = useProjectStore();
const ai = useAiStore();
const aiTasks = useAiTasksStore();

const ch = computed(() => project.chapterById(props.chapterId));
const cached = computed(() => ch.value?.multiReader || null);

const error = ref("");
// A persona's label or blurb in the interface language, found by its key (older saved panels
// also carry an English copy, the fallback).
function personaWord(key, field) {
  const p = PERSONAS.find((x) => x.key === key);
  return p ? t(p[field]) : "";
}
const liveColumns = ref(null);  // null until first run; map { personaKey: 'running' | 'done' | 'error' }

// This chapter's multi-reader task. QC-31 (#229): the whole 4-persona panel is
// ONE task entry (feature "multiReader" + meta.chapterId), not four; QC-30b: the
// shared strip is THE progress surface.
const myTask = useSurfaceTask("multiReader", () => ({ chapterId: props.chapterId }));
const running = computed(() => !!myTask.value);

const panel = computed(() => cached.value?.panel || []);

function isAbort(e) { return e?.name === "AbortError" || /abort/i.test(e?.message || ""); }

async function run() {
  error.value = "";
  if (running.value) return;
  if (!ai.providerForFeature("multiReader")) {
    error.value = t("multiReader.err.noProvider");
    return;
  }
  const html = project.chapterBody[props.chapterId];
  if (!html?.trim()) {
    error.value = t("multiReader.err.noProse");
    return;
  }
  liveColumns.value = Object.fromEntries(PERSONAS.map((p) => [p.key, "pending"]));
  try {
    const result = await runMultiReaderPanel({
      html,
      chapterTitle: ch.value?.title,
      chapterNum: ch.value?.num,
      onPersonaPhase: (key, phase) => {
        liveColumns.value = { ...liveColumns.value, [key]: phase };
      },
      meta: { chapterId: props.chapterId },
    });
    project.setChapterMultiReader(props.chapterId, result);
  } catch (e) {
    if (!isAbort(e)) {
      const msg = String(e?.message || e || "");
      error.value = /provider|api key|configure/i.test(msg)
        ? t("multiReader.err.noProvider")
        : msg || t("multiReader.err.failed");
    }
  } finally {
    liveColumns.value = null;
  }
}

function regenerate() {
  project.clearChapterMultiReader(props.chapterId);
  run();
}
function clearPanel() {
  project.clearChapterMultiReader(props.chapterId);
}
function cancel() {
  // The panel's one task: its signal aborts all four personas (QC-31).
  if (myTask.value) aiTasks.cancel(myTask.value.id);
  liveColumns.value = null;
}

// Deliberately no auto-run on mount: the user should see the chip and
// have the option to change the AI provider/model before spending tokens
// on 4 persona calls. The "Read this chapter" CTA in the empty state
// kicks off the run when they're ready.
</script>

<template>
  <AppModal :eyebrow="$t('multiReader.eyebrow')" :title="ch ? $t('multiReader.chapterTitle', { num: ch.num, title: ch.title || $t('multiReader.untitled') }) : $t('multiReader.eyebrow')"
    wide
    :closable="!running"
    @close="emit('close')"
  >
    <template #header-extra>
      <AiFeatureChip feature="multiReader" :label="$t('multiReader.chipLabel')" editable />
    </template>

    <template #lede>
      <i18n-t keypath="multiReader.blurb" scope="global">
        <template #genre><strong>{{ $t("multiReader.genreTerm") }}</strong></template>
        <template #critic><strong>{{ $t("multiReader.criticTerm") }}</strong></template>
        <template #intern><strong>{{ $t("multiReader.internTerm") }}</strong></template>
        <template #bookClub><strong>{{ $t("multiReader.bookClubTerm") }}</strong></template>
      </i18n-t>
    </template>

    <AiTaskStrip :task="myTask" />

    <UiBanner v-if="error">
      {{ error }}
      <template #action>
        <UiButton intent="ghost" size="small" @click="run">
          <Icon name="Refresh" :size="12" /> {{ $t("common.retry") }}
        </UiButton>
      </template>
    </UiBanner>

    <div v-else-if="running && !cached" class="mr-loading">
      <span>
        {{ $t("multiReader.loadingPrefix") }}
        <template v-for="(state, key, i) in (liveColumns || {})" :key="key">
          <span v-if="i > 0">, </span>
          <span :class="{ done: state === 'done', err: state === 'error' }">
            {{ personaWord(key, "labelKey") || key }}
          </span>
        </template>
      </span>
    </div>

    <div v-else-if="!cached && !running" class="mr-empty">
      <Icon name="Sparkle" :size="20" />
      <i18n-t keypath="multiReader.idleBlurb" tag="p" class="mr-empty-text" scope="global">
        <template #genre><strong>{{ $t("multiReader.genreTerm") }}</strong></template>
        <template #critic><strong>{{ $t("multiReader.criticTerm") }}</strong></template>
        <template #intern><strong>{{ $t("multiReader.internTerm") }}</strong></template>
        <template #bookClub><strong>{{ $t("multiReader.bookClubTerm") }}</strong></template>
      </i18n-t>
      <UiButton intent="primary" @click="run">
        <Icon name="Sparkle" :size="13" /> {{ $t("multiReader.action") }}
      </UiButton>
    </div>

    <div v-else-if="cached" class="mr-grid">
      <article v-for="p in panel" :key="p.personaKey" class="mr-col" :data-key="p.personaKey">
        <header class="mr-col-h">
          <div>
            <div class="mr-col-label">{{ personaWord(p.personaKey, "labelKey") || p.label }}</div>
            <div class="mr-col-blurb">{{ personaWord(p.personaKey, "blurbKey") || p.blurb }}</div>
          </div>
        </header>
        <div class="mr-col-body">
          <p v-if="p.error" class="mr-col-error">
            <Icon name="Alert" :size="12" /> {{ p.error }}
          </p>
          <p v-else-if="p.reaction" class="mr-reaction">{{ p.reaction }}</p>
          <p v-else class="mr-empty">{{ $t("multiReader.noReaction") }}</p>

          <div v-if="p.suggestions?.length" class="mr-suggestions">
            <div class="mr-suggestions-h">{{ $t("multiReader.theirSuggestions") }}</div>
            <ul>
              <li v-for="(s, i) in p.suggestions" :key="i">{{ s }}</li>
            </ul>
          </div>
        </div>
      </article>
    </div>

    <div v-if="cached" class="mr-meta-line result-stamp">
      {{ $t("multiReader.generatedAgo", { when: relativeTime(cached.generatedAt) }) }}
    </div>

    <template #footer>
      <UiButton v-if="cached && !running" intent="ghost" @click="clearPanel">
        {{ $t("multiReader.clearPanel") }}
      </UiButton>
      <span class="mr-foot-spacer" />
      <UiButton v-if="running" intent="danger" @click="cancel">
        <Icon name="Close" :size="12" /> {{ $t("common.cancel") }}
      </UiButton>
      <UiButton v-else-if="cached" intent="ghost" @click="regenerate">
        <Icon name="Refresh" :size="12" /> {{ $t("multiReader.rerunPanel") }}
      </UiButton>
      <UiButton intent="primary" @click="emit('close')">{{ $t("common.done") }}</UiButton>
    </template>
  </AppModal>
</template>

<style scoped>
/* the strip above is the spinner; this line says which readers are done */
.mr-loading {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  font-size: 12.5px; color: var(--muted); font-style: italic;
  padding: 16px 0;
}

/* Empty state — shown before any panel has been generated AND there's
   no run in flight. Gives the user a beat to change the chip routing
   before spending tokens on four parallel persona calls. */
.mr-empty {
  display: flex; flex-direction: column; align-items: center;
  gap: 14px; padding: 32px 18px;
  background: var(--surface-2);
  border-radius: 10px;
  text-align: center;
}
.mr-empty > :first-child { color: var(--accent); }
.mr-empty-text {
  margin: 0; max-width: 56ch;
  font-size: 13px; line-height: 1.55; color: var(--ink-2);
}
.mr-empty-text strong { color: var(--ink); font-weight: 600; }
.mr-loading .done { color: var(--status-done); font-weight: 600; font-style: normal; }
.mr-loading .err { color: var(--danger); font-style: normal; }

.mr-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
@media (max-width: 720px) { .mr-grid { grid-template-columns: 1fr; } }

.mr-col {
  display: flex; flex-direction: column;
  background: var(--surface-2); border-radius: 8px;
  border: 1px solid var(--border-soft);
  overflow: hidden;
}
.mr-col[data-key="genre-reader"]   { border-left: 3px solid var(--accent); }
.mr-col[data-key="literary-critic"] { border-left: 3px solid var(--gold); }
.mr-col[data-key="agent-intern"]   { border-left: 3px solid var(--marker-thread, var(--danger)); }
.mr-col[data-key="book-club"]      { border-left: 3px solid var(--status-done); }

.mr-col-h {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-soft);
  background: var(--surface);
}
.mr-col-label {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--accent-ink);
}
.mr-col-blurb {
  margin-top: 4px;
  font-size: 12px; color: var(--muted); font-style: italic; line-height: 1.5;
}

.mr-col-body { padding: 14px 16px; flex: 1; }
.mr-reaction {
  margin: 0 0 12px;
  font-family: var(--font-serif); font-size: 13.5px; line-height: 1.65;
  color: var(--ink-2);
  white-space: pre-wrap;
}
.mr-col-error {
  margin: 0; display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--danger);
}
.mr-empty { margin: 0; font-size: 12px; color: var(--muted); font-style: italic; }

.mr-suggestions {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border-soft);
}
.mr-suggestions-h {
  font-family: var(--font-mono); font-size: 9.5px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted);
  margin-bottom: 6px;
}
.mr-suggestions ul {
  list-style: none; padding: 0; margin: 0;
  display: flex; flex-direction: column; gap: 4px;
}
.mr-suggestions li {
  font-size: 12.5px; line-height: 1.55; color: var(--ink-2);
  padding-left: 14px; position: relative;
}
.mr-suggestions li::before {
  content: "·"; position: absolute; left: 4px;
  color: var(--accent); font-weight: 700;
}

.mr-meta-line {
  margin-top: 14px;
  text-align: right;
}

.mr-foot-spacer { flex: 1; }
</style>
