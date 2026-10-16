<script setup>
// The window that lists AI ideas for where the prose goes next, each with a button that writes it
// (extracted from StuckDiagnosticModal.vue 2026-10-16, when the editor's AI menu gained Next plot
// beats and Plot twists — the AI drafting plan 2026-10-15, Task P2): it runs `run`, shows each
// idea as a card and hands the picked one back (`pick`) — the page drafts the next paragraphs
// from it. Progress and Cancel ride the shared AiTaskStrip; the window can't close mid-run;
// Regenerate asks again. Its users: Unstuck (StuckDiagnosticModal.vue) and the editor's plot
// ideas (ChaptersPage.vue).
import { computed, onMounted, ref } from "vue";
import { useAiTasksStore, AiTaskStrip, AppModal, Icon, UiBanner, UiButton } from "@delebash/llm-ui";
import AiFeatureChip from "./AiFeatureChip.vue";

const props = defineProps({
  eyebrow: { type: String, default: "" },
  title: { type: String, default: "" },
  lede: { type: String, default: "" },
  // The routed feature (the header's model chip) and the meta its run carries, which picks out
  // this window's task among the running ones.
  feature: { type: String, required: true },
  chipLabel: { type: String, required: true },
  taskMeta: { type: Object, default: () => ({}) },
  // Run on open — or wait for the start button under `idleText`, so the model can be changed in
  // the chip before anything is spent.
  autoRun: { type: Boolean, default: false },
  idleText: { type: String, default: "" },
  startLabel: { type: String, default: "" },
  // The button on each idea.
  pickLabel: { type: String, required: true },
  // What the window says when a run returns no ideas.
  emptyText: { type: String, default: "" },
  // async (signal) → the ideas ({ id, text, title?, kindLabel?, kindBlurb?, accent? }).
  run: { type: Function, required: true },
});
const emit = defineEmits(["close", "pick"]);

const aiTasks = useAiTasksStore();
const myTask = computed(() => aiTasks.runningTasks.find((task) => task.feature === props.feature
  && Object.entries(props.taskMeta).every(([k, v]) => task.meta?.[k] === v)));

const loading = ref(false);
const error = ref("");
const items = ref([]);
let abort = null;

const isAbort = (e) => e?.name === "AbortError" || /abort|cancel/i.test(e?.message || "");

async function go() {
  loading.value = true;
  error.value = "";
  items.value = [];
  try {
    abort = new AbortController();
    items.value = await props.run(abort.signal);
    if (!items.value.length) error.value = props.emptyText;
  } catch (e) {
    if (!isAbort(e)) error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}
onMounted(() => { if (props.autoRun) go(); });

function onClose() {
  abort?.abort();
  emit("close");
}
</script>

<template>
  <AppModal :lede="lede" :eyebrow="eyebrow" :title="title" :closable="!loading" @close="onClose">
    <template #header-extra>
      <AiFeatureChip :feature="feature" :label="chipLabel" editable />
    </template>

    <UiBanner v-if="error">
      {{ error }}
      <template #action>
        <UiButton intent="ghost" size="small" @click="go">
          <Icon name="Refresh" :size="12" /> {{ $t("common.retry") }}
        </UiButton>
      </template>
    </UiBanner>

    <AiTaskStrip v-if="loading" :task="myTask" />

    <div v-else-if="!items.length && !error" class="il-empty">
      <Icon name="Sparkle" :size="20" />
      <p v-if="idleText" class="il-empty-text">{{ idleText }}</p>
      <UiButton intent="primary" @click="go">
        <Icon name="Sparkle" :size="13" /> {{ startLabel }}
      </UiButton>
    </div>

    <ul v-else-if="items.length" class="il-items">
      <li v-for="it in items" :key="it.id" class="il-item" :style="it.accent ? { borderLeftColor: it.accent } : null">
        <div v-if="it.kindLabel" class="il-item-head">
          <span class="il-kind">{{ it.kindLabel }}</span>
          <span class="il-kind-blurb">{{ it.kindBlurb }}</span>
        </div>
        <h4 v-if="it.title" class="il-item-title">{{ it.title }}</h4>
        <div class="il-item-body">
          <p class="il-item-text">{{ it.text }}</p>
          <UiButton intent="primary" size="small" class="il-pick" @click="emit('pick', it)">
            <Icon name="Play" :size="12" /> {{ pickLabel }}
          </UiButton>
        </div>
      </li>
    </ul>

    <template #footer>
      <UiButton intent="ghost" :disabled="loading" @click="go">
        <Icon name="Refresh" :size="12" /> {{ $t("common.regenerate") }}
      </UiButton>
      <span class="il-foot-spacer" />
      <UiButton intent="ghost" @click="onClose">{{ $t("common.close") }}</UiButton>
    </template>
  </AppModal>
</template>

<style scoped>
.il-empty {
  display: flex; flex-direction: column; align-items: center;
  gap: 14px; padding: 32px 18px;
  background: var(--surface-2);
  border-radius: 10px;
  text-align: center;
}
.il-empty > :first-child { color: var(--accent); }
.il-empty-text {
  margin: 0; max-width: 56ch;
  font-size: 13px; line-height: 1.55; color: var(--ink-2);
}

.il-items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.il-item {
  padding: 14px 16px;
  background: var(--surface-2); border-radius: 8px;
  border-left: 3px solid var(--accent);
}

.il-item-head {
  display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
  margin-bottom: 6px;
}
.il-kind {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--accent-ink);
}
.il-kind-blurb {
  font-size: 11.5px; color: var(--muted);
}
.il-item-title {
  margin: 0 0 6px;
  font-family: var(--font-serif); font-size: 15px; font-weight: 500;
  color: var(--ink); letter-spacing: -0.005em;
}
/* The idea and its button share a row; the button drops under a long idea on a narrow window. */
.il-item-body { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; }
.il-item-text {
  flex: 1 1 32ch; margin: 0; max-width: 70ch;
  font-size: 13px; line-height: 1.6; color: var(--ink-2);
}
.il-pick { margin-left: auto; }

.il-foot-spacer { flex: 1; }
</style>
