<script setup>
import { copyToClipboard } from "quasar";
// The Brainstorm page — names, titles, plot moves, anything: a list at a time, steered by
// thumbs-up and More like these. The categories and the prompt (services/brainstorm.js), the
// rounds (composables/useBrainstorm.js) and the list (components/BrainstormResults.vue) are
// shared with the Brainstorm panel where each is used (2026-10-11, the AI drafting plan Task 10;
// 2026-10-28, its seed field too — components/BrainstormSeed.vue, the seed required here).
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { AiTaskStrip, Icon, PaneHeader, pageFill, UiBanner, UiButton, UiSelect } from "@delebash/ui";
import { useUiStore } from "../stores/ui.js";
import AiFeatureChip from "../components/AiFeatureChip.vue";
import BrainstormResults from "../components/BrainstormResults.vue";
import BrainstormSeed from "../components/BrainstormSeed.vue";
import { useBrainstorm } from "../composables/useBrainstorm.js";
import { BRAINSTORM_CATEGORIES, brainstormAction, brainstormPrompt } from "../services/brainstorm.js";

const { t } = useI18n();
const ui = useUiStore();

const category = ref("character_name");
const seed = ref("");
const categoryOptions = computed(() => BRAINSTORM_CATEGORIES.map((c) => ({
  value: c.value, label: t(`brainstorm.categories.${c.value}.label`),
})));

const { results, error, myTask, running, generate, moreLikeThese, toggleLike, clear } = useBrainstorm({
  request: ({ liked, seen }) => {
    const { action, variables } = brainstormAction(category.value);
    return { action, variables: { ...variables, user_content: brainstormPrompt({ category: category.value, seed: seed.value, liked, seen }) } };
  },
  meta: () => ({ category: category.value }),
  label: t("brainstorm.title"),
});
const canGenerate = computed(() => seed.value.trim().length > 0 && !running.value);

async function copy(text) {
  try {
    await copyToClipboard(text);
    ui.showToast({ message: t("brainstorm.copied", { text }) });
  } catch {
    ui.showToast({ message: t("brainstorm.copyFailed") });
  }
}
</script>

<template>
  <q-page :style-fn="pageFill" class="main">
    <div class="brainstorm-view">
      <PaneHeader :eyebrow="$t('panes.plotBoard.eyebrow')" :title="$t('brainstorm.title')" help-key="brainstorm">
        <AiFeatureChip feature="brainstorm" :label="$t('brainstorm.title')" editable />
      </PaneHeader>

      <div class="brainstorm-controls">
        <i18n-t keypath="brainstorm.intro" tag="p" class="bs-desc" scope="global">
          <template #brainstorm><strong>{{ $t("brainstorm.title") }}</strong></template>
          <template #moreLikeThese><strong>{{ $t("brainstorm.moreLikeThese") }}</strong></template>
        </i18n-t>
        <div class="brainstorm-field">
          <label class="brainstorm-label">{{ $t("brainstorm.categoryLabel") }}</label>
          <UiSelect
            width="fit"
            v-model="category"
            :options="categoryOptions"
            :placeholder="$t('brainstorm.categoryPlaceholder')"
          />
          <p class="brainstorm-cat-purpose">{{ $t(`brainstorm.categories.${category}.purpose`) }}</p>
        </div>

        <BrainstormSeed v-model="seed" :category="category" :rows="4" :disabled="running" :hint="$t('brainstorm.seedHint')" />

        <AiTaskStrip :task="myTask" />

        <div class="brainstorm-actions">
          <UiButton
            intent="primary"
            :label="$t('brainstorm.generate')"
            :loading="running"
            :disabled="!canGenerate"
            v-tooltip.bottom="canGenerate ? $t('brainstorm.generateTooltip') : $t('brainstorm.generateDisabledTooltip')"
            @click="generate"
          />
          <UiButton
            v-if="results.length > 0"
            intent="ghost"
            :label="$t('common.clear')"
            :disabled="running"
            @click="clear"
          />
        </div>

        <UiBanner v-if="error">{{ error }}</UiBanner>
      </div>

      <div v-if="results.length > 0" class="brainstorm-results">
        <BrainstormResults :items="results" :running="running" @like="toggleLike" @more="moreLikeThese">
          <template #actions="{ item }">
            <UiButton intent="ghost" size="icon" :aria-label="$t('brainstorm.copyToClipboard')"
              v-tooltip.bottom="$t('brainstorm.copyToClipboard')" @click="copy(item.text)">
              <Icon name="Copy" :size="14" />
            </UiButton>
          </template>
        </BrainstormResults>
      </div>

      <div v-else-if="!running && !error" class="brainstorm-empty">
        <p>{{ $t("brainstorm.emptyHint") }}</p>
      </div>

      <div v-if="running && results.length === 0" class="brainstorm-empty">
        <p class="brainstorm-generating">{{ $t("brainstorm.generating") }}</p>
      </div>
    </div>
  </q-page>
</template>

<style scoped>
.bs-desc {
  font-size: 14px; line-height: 1.55; color: var(--muted);
  margin: 0;
}
.bs-desc strong { color: var(--ink-2); font-weight: 600; }

.brainstorm-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.brainstorm-controls {
  padding: 16px 20px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-bottom: 1px solid var(--border);
}

.brainstorm-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.brainstorm-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.brainstorm-cat-purpose {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: var(--ink-2);
  font-style: italic;
  line-height: 1.5;
}


.brainstorm-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.brainstorm-results {
  flex: 1;
  overflow-y: auto;
  padding: 12px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.brainstorm-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.brainstorm-empty p {
  font-size: 13px;
  color: var(--muted);
  margin: 0;
  max-width: 300px;
}

.brainstorm-generating {
  font-style: italic;
}
</style>
