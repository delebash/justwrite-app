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
import { useAiTasksStore, Icon, AppModal, UiButton } from "@delebash/llm-ui";
import {
  runMultiReaderPanel,
  PERSONAS,
} from "../services/analysis/multiReaderCritique.js";
import AiFeatureChip from "./AiFeatureChip.vue";

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
const liveColumns = ref(null);  // null until first run; map { personaKey: 'running' | 'done' | 'error' }

// Find every persona task currently running for THIS chapter. Each of
// the 4 personas registers its own task in the global aiTasks store
// (feature "multiReader" + meta.chapterId + meta.personaKey), so we
// filter by chapter and let the modal aggregate.
const myTasks = computed(() =>
  aiTasks.runningTasks.filter(
    (t) => t.feature === "multiReader" && t.meta?.chapterId === props.chapterId
  )
);
const running = computed(() => myTasks.value.length > 0);

const panel = computed(() => cached.value?.panel || []);

function isAbort(e) { return e?.name === "AbortError" || /abort/i.test(e?.message || ""); }

async function run() {
  error.value = "";
  if (running.value) return;
  if (!ai.providerForFeature("multiReader")) {
    error.value = "Configure an AI provider in Settings → AI to run the multi-reader panel.";
    return;
  }
  const html = project.chapterBody[props.chapterId];
  if (!html?.trim()) {
    error.value = "This chapter has no prose to read yet.";
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
        ? "Configure an AI provider in Settings → AI to run the multi-reader panel."
        : msg || "Couldn't run the panel.";
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
  // Cancel every running persona task for this chapter — each is its
  // own entry in the aiTasks store. Snapshot ids first because cancel
  // mutates the running list.
  const ids = myTasks.value.map((t) => t.id);
  for (const id of ids) aiTasks.cancel(id);
  liveColumns.value = null;
}

const ago = (ts) => {
  if (!ts) return "";
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// Deliberately no auto-run on mount: the user should see the chip and
// have the option to change the AI provider/model before spending tokens
// on 4 persona calls. The "Read this chapter" CTA in the empty state
// kicks off the run when they're ready.
</script>

<template>
  <AppModal
    eyebrow="Multi-reader panel"
    :title="ch ? `Chapter ${ch.num} — ${ch.title || 'Untitled'}` : 'Multi-reader panel'"
    wide
    :closable="!running"
    @close="emit('close')"
  >
    <template #header>
      <div class="mr-titleblock">
        <div class="t-eyebrow">Multi-reader panel</div>
        <h2 class="modal-title">{{ ch ? `Chapter ${ch.num} — ${ch.title || "Untitled"}` : "Multi-reader panel" }}</h2>
      </div>
      <div class="mr-header-actions">
        <AiFeatureChip feature="multiReader" label="Multi-reader" />
      </div>
    </template>

    <p class="mr-blurb">
      Four distinct readers each read this chapter through a different lens — a
      <strong>genre-savvy reader</strong> encountering it cold, a <strong>literary critic</strong>
      reading for prose craft, an <strong>agent's intern</strong> deciding whether to flag it for
      their boss, and a <strong>book-club reader</strong> deciding what to discuss. Where the
      standard Critique modal gives one editorial pass, the panel gives four perspectives — see
      where the chapter works for each kind of reader and where it doesn't.
    </p>

    <div v-if="error" class="mr-error">
      <Icon name="Alert" :size="13" /> {{ error }}
      <UiButton intent="ghost" size="small" @click="run">
        <Icon name="Refresh" :size="12" /> Retry
      </UiButton>
    </div>

    <div v-else-if="running && !cached" class="mr-loading">
      <span class="mr-spinner" />
      <span>
        Reading with four lenses in parallel —
        <template v-for="(state, key, i) in (liveColumns || {})" :key="key">
          <span v-if="i > 0">, </span>
          <span :class="{ done: state === 'done', err: state === 'error' }">
            {{ PERSONAS.find(p => p.key === key)?.label || key }}
          </span>
        </template>
      </span>
    </div>

    <div v-else-if="!cached && !running" class="mr-empty">
      <Icon name="Sparkle" :size="20" />
      <p class="mr-empty-text">
        Send this chapter to four reader lenses in parallel — a
        <strong>genre-savvy reader</strong>, a <strong>literary critic</strong>, an
        <strong>agent's intern</strong>, and a <strong>book-club reader</strong>.
        Change the provider in the chip above first if you want.
      </p>
      <UiButton intent="primary" @click="run">
        <Icon name="Sparkle" :size="13" /> Read this chapter
      </UiButton>
    </div>

    <div v-else-if="cached" class="mr-grid">
      <article v-for="p in panel" :key="p.personaKey" class="mr-col" :data-key="p.personaKey">
        <header class="mr-col-h">
          <div>
            <div class="mr-col-label">{{ p.label }}</div>
            <div class="mr-col-blurb">{{ p.blurb }}</div>
          </div>
        </header>
        <div class="mr-col-body">
          <p v-if="p.error" class="mr-col-error">
            <Icon name="Alert" :size="12" /> {{ p.error }}
          </p>
          <p v-else-if="p.reaction" class="mr-reaction">{{ p.reaction }}</p>
          <p v-else class="mr-empty">(no reaction returned)</p>

          <div v-if="p.suggestions?.length" class="mr-suggestions">
            <div class="mr-suggestions-h">Their suggestions</div>
            <ul>
              <li v-for="(s, i) in p.suggestions" :key="i">{{ s }}</li>
            </ul>
          </div>
        </div>
      </article>
    </div>

    <div v-if="cached" class="mr-meta-line">
      generated {{ ago(cached.generatedAt) }}
    </div>

    <template #footer>
      <UiButton v-if="cached && !running" intent="ghost" @click="clearPanel">
        Clear panel
      </UiButton>
      <span class="mr-foot-spacer" />
      <UiButton v-if="running" intent="danger" @click="cancel">
        <Icon name="Close" :size="12" /> Cancel
      </UiButton>
      <UiButton v-else-if="cached" intent="ghost" @click="regenerate">
        <Icon name="Refresh" :size="12" /> Re-run panel
      </UiButton>
      <UiButton intent="primary" @click="emit('close')">Done</UiButton>
    </template>
  </AppModal>
</template>

<style scoped>
.mr-titleblock { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.mr-titleblock h2 { font-family: var(--font-serif); font-size: 22px; font-weight: 600; margin: 4px 0 0; }
.mr-header-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.mr-blurb {
  margin: 0 0 16px; max-width: 82ch;
  font-size: 12.5px; line-height: 1.55; color: var(--muted);
}
.mr-blurb strong { color: var(--ink-2); font-weight: 600; }

.mr-error {
  display: flex; gap: 10px; align-items: center;
  padding: 10px 14px; border-radius: 6px;
  background: color-mix(in oklab, var(--danger-ink, #b91c1c) 12%, transparent);
  color: var(--danger-ink, #b91c1c);
  font-size: 12.5px;
}

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
.mr-spinner {
  display: inline-block; width: 14px; height: 14px;
  border: 2px solid var(--surface-3); border-top-color: var(--accent);
  border-radius: 50%; animation: mr-spin 0.9s linear infinite;
}
@keyframes mr-spin { to { transform: rotate(360deg); } }

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
  font-family: var(--font-mono); font-size: 10.5px; color: var(--muted);
}

.mr-foot-spacer { flex: 1; }
</style>
