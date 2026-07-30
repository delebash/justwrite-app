<script setup>
// AI-tell phrase scanner modal.
//
// Pure-deterministic scan of every chapter's prose for known AI-tell
// phrases — stock catalog verbs ("delved into", "tapestry of"),
// body-language clichés ("eyes sparkled"), hedges, cadence
// signatures, out-of-genre register. The phrase library lives in
// services/analysis/aiTellScanner.js and is hand-curated.
//
// Findings are grouped by chapter with kind badges + the sentence
// the match falls in. No LLM call — this runs instantly on mount,
// re-runs on demand.

import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { scanAiTells, TELL_KINDS } from "../services/analysis/aiTellScanner.js";
import { Icon } from "@delebash/llm-ui";
import { AppModal } from "@delebash/llm-ui";
import { UiButton } from "@delebash/llm-ui";
import { EmptyState } from "@delebash/llm-ui";

const emit = defineEmits(["close"]);

const project = useProjectStore();
const router = useRouter();

const result = ref(null);
const activeKind = ref(null);

function runScan() {
  result.value = scanAiTells(project);
}

const groupedByChapter = computed(() => {
  if (!result.value?.findings.length) return [];
  const list = activeKind.value
    ? result.value.findings.filter((f) => f.kind === activeKind.value)
    : result.value.findings;
  const map = new Map();
  for (const f of list) {
    const key = f.chapterId;
    if (!map.has(key)) map.set(key, { chapterId: f.chapterId, chapterNum: f.chapterNum, chapterTitle: f.chapterTitle, items: [] });
    map.get(key).items.push(f);
  }
  return Array.from(map.values()).sort((a, b) => (a.chapterNum || 0) - (b.chapterNum || 0));
});

const totalFindings = computed(() => result.value?.findings?.length || 0);
const filteredFindings = computed(() => activeKind.value
  ? (result.value?.findings || []).filter((f) => f.kind === activeKind.value)
  : (result.value?.findings || []),
);

function jumpToScene(chapterId, sceneId) {
  router.push(`/chapters/${chapterId}/${sceneId}`);
}

function highlight(snippet, phrase) {
  if (!snippet || !phrase) return snippet;
  // Highlight the matched phrase in the sentence.
  const idx = snippet.toLowerCase().indexOf(phrase.toLowerCase());
  if (idx < 0) return snippet;
  return [
    snippet.slice(0, idx),
    `__HL_START__${snippet.slice(idx, idx + phrase.length)}__HL_END__`,
    snippet.slice(idx + phrase.length),
  ].join("");
}

const KIND_KEYS = Object.keys(TELL_KINDS);

// Deliberately no auto-run on mount: the user should be able to see
// the modal before the scan fires. The empty-state CTA below kicks
// off the deterministic scan when they're ready.
</script>

<template>
  <AppModal
    :eyebrow="$t('aiTell.eyebrow')"
    :title="$t('aiTell.title')"
    wide
    @close="emit('close')"
  >
    <i18n-t keypath="aiTell.blurb" tag="p" class="at-blurb" scope="global">
      <template #noAiCall><strong>{{ $t("aiTell.noAiCall") }}</strong></template>
    </i18n-t>

    <div v-if="!result" class="at-empty">
      <Icon name="Sparkle" :size="20" />
      <p class="at-empty-text">
        {{ $t("aiTell.idleBlurb") }}
      </p>
      <UiButton intent="primary" @click="runScan">
        <Icon name="Sparkle" :size="13" /> {{ $t("aiTell.action") }}
      </UiButton>
    </div>

    <template v-else>
      <div class="at-stats">
        <span class="at-pill" :class="{ active: !activeKind }" @click="activeKind = null"
              role="button" tabindex="0">
          {{ $t("common.all") }} <span class="at-count">{{ totalFindings }}</span>
        </span>
        <span v-for="key in KIND_KEYS" :key="key"
              class="at-pill"
              :class="{ active: activeKind === key, dim: !(result.countsByKind[key] || 0) }"
              :style="{ '--at-kind-c': TELL_KINDS[key].colour }"
              @click="(result.countsByKind[key] || 0) && (activeKind = activeKind === key ? null : key)"
              role="button" tabindex="0">
          <span class="at-dot" :style="{ background: TELL_KINDS[key].colour }" />
          {{ TELL_KINDS[key].label }}
          <span class="at-count">{{ result.countsByKind[key] || 0 }}</span>
        </span>
        <span class="at-spacer" />
        <span class="at-meta">
          {{ $t("aiTell.scannedMeta", { scanned: result.scannedChapters, total: result.totalChapters }) }}
        </span>
      </div>

      <EmptyState v-if="!totalFindings"
        icon="Check"
        :title="$t('aiTell.cleanTitle')"
        :message="$t('aiTell.cleanMessage')" />

      <EmptyState v-else-if="!filteredFindings.length"
        icon="Eye"
        :title="$t('aiTell.emptyCategoryTitle')"
        :message="$t('aiTell.emptyCategoryMessage')" />

      <div v-else class="at-groups">
        <section v-for="g in groupedByChapter" :key="g.chapterId" class="at-group">
          <header class="at-group-h">
            <button class="at-group-jump" @click="jumpToScene(g.chapterId, g.items[0].sceneId)"
                    v-tooltip.bottom="$t('aiTell.openChapter')">
              {{ $t("aiTell.chapterChip", { num: g.chapterNum }) }}<span v-if="g.chapterTitle"> — {{ g.chapterTitle }}</span>
            </button>
            <span class="at-group-count">{{ $t("count.finding", { n: g.items.length }, g.items.length) }}</span>
          </header>
          <ul class="at-list">
            <li v-for="f in g.items" :key="f.id" class="at-item">
              <div class="at-item-head">
                <span class="at-kind-chip" :style="{ background: TELL_KINDS[f.kind].colour }">
                  {{ TELL_KINDS[f.kind].label }}
                </span>
                <span class="at-phrase">"{{ f.phrase }}"</span>
                <button class="at-jump" @click="jumpToScene(f.chapterId, f.sceneId)"
                        v-tooltip.bottom="$t('aiTell.openScene')">
                  {{ $t("aiTell.sceneChip", { n: f.sceneIdx + 1 }) }}
                </button>
              </div>
              <p class="at-snippet" v-html="highlight(f.snippet, f.phrase).replace(/__HL_START__/g, '<mark>').replace(/__HL_END__/g, '</mark>')"></p>
              <p class="at-blurb-line">{{ f.blurb }}</p>
            </li>
          </ul>
        </section>
      </div>
    </template>

    <template #footer>
      <UiButton intent="ghost" @click="runScan">
        <Icon name="Refresh" :size="12" /> {{ $t("aiTell.rescan") }}
      </UiButton>
      <span class="at-foot-spacer" />
      <UiButton intent="primary" @click="emit('close')">{{ $t("common.done") }}</UiButton>
    </template>
  </AppModal>
</template>

<style scoped>
.at-blurb {
  margin: 0 0 16px; max-width: 82ch;
  font-size: 12.5px; line-height: 1.55; color: var(--muted);
}
.at-blurb strong { color: var(--ink-2); font-weight: 600; }

.at-empty {
  display: flex; flex-direction: column; align-items: center;
  gap: 14px; padding: 32px 18px;
  background: var(--surface-2);
  border-radius: 10px;
  text-align: center;
}
.at-empty > :first-child { color: var(--accent); }
.at-empty-text {
  margin: 0; max-width: 56ch;
  font-size: 13px; line-height: 1.55; color: var(--ink-2);
}

.at-stats {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  margin-bottom: 18px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-soft);
}
.at-pill {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-mono); font-size: 11px;
  padding: 4px 12px; border-radius: 999px;
  background: var(--surface-2); color: var(--muted);
  border: 1px solid var(--border-soft);
  cursor: pointer; user-select: none;
}
.at-pill:hover:not(.dim) { color: var(--ink-2); }
.at-pill.dim { opacity: 0.45; cursor: default; }
.at-pill.active { background: var(--accent-soft); color: var(--accent-ink); border-color: var(--accent-line); }
.at-dot { width: 8px; height: 8px; border-radius: 50%; }
.at-count {
  font-family: var(--font-ui); font-size: 10.5px;
  background: var(--surface-3); padding: 1px 7px; border-radius: 999px;
  color: var(--ink-2);
}
.at-spacer { flex: 1; }
.at-meta { font-family: var(--font-mono); font-size: 10.5px; color: var(--muted); }

.at-groups { display: flex; flex-direction: column; gap: 16px; }
.at-group { display: flex; flex-direction: column; gap: 8px; }
.at-group-h {
  display: flex; align-items: baseline; gap: 10px;
  padding-bottom: 4px; border-bottom: 1px solid var(--border-soft);
}
.at-group-jump {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  font-family: var(--font-mono); font-size: 11px; color: var(--accent-ink);
  padding: 0;
}
.at-group-jump:hover { color: var(--accent); text-decoration: underline; }
.at-group-count {
  margin-left: auto;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--muted);
}

.at-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.at-item {
  padding: 10px 14px;
  background: var(--surface-2); border-radius: 6px;
}
.at-item-head {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  margin-bottom: 6px;
}
.at-kind-chip {
  font-family: var(--font-mono); font-size: 9.5px;
  letter-spacing: 0.08em;
  padding: 2px 8px; border-radius: 999px;
  color: white; text-shadow: 0 1px 0 rgba(0,0,0,0.25);
}
.at-phrase {
  font-family: var(--font-serif); font-style: italic;
  font-size: 13.5px; color: var(--ink-2);
}
.at-jump {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--accent-ink);
  padding: 0; margin-left: auto;
}
.at-jump:hover { color: var(--accent); text-decoration: underline; }
.at-snippet {
  margin: 0 0 6px;
  font-family: var(--font-serif); font-size: 13px; line-height: 1.6;
  color: var(--ink-2);
}
.at-snippet :deep(mark) {
  background: color-mix(in oklab, var(--gold) 32%, transparent);
  color: var(--ink); padding: 1px 3px; border-radius: 3px;
}
.at-blurb-line {
  margin: 0;
  font-size: 11.5px; color: var(--muted); font-style: italic;
}

.at-foot-spacer { flex: 1; }
</style>
