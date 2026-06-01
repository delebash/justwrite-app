<script setup>
// Manuscript-RAG chat panel.
//
// Slide-in panel from the right. User types a question, we embed it,
// look up top-K scenes via the vector store, build a prompt with
// retrieved excerpts as context, then stream the LLM answer.
//
// Single-turn for v1 — every Ask resets the answer + citations. Multi-
// turn would persist a chat history thread; deferred.

import { ref, computed, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useAiStore } from "../stores/ai.js";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useAiProgress } from "../composables/useAiProgress.js";
import { askManuscript } from "../services/rag/chat.js";
import { indexStatus } from "../services/rag/indexer.js";
import IndexBuildModal from "./IndexBuildModal.vue";
import AiProgressBar from "./AiProgressBar.vue";
import Icon from "./Icon.vue";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue"]);

const router = useRouter();
const ai = useAiStore();
const project = useProjectStore();
const ui = useUiStore();
const progress = useAiProgress();

const question = ref("");
const answer = ref("");
const citations = ref([]);   // [{ index, chunk, score }]
const error = ref("");
const indexModalMode = ref(null); // "build" | "rebuild" | null
const inputRef = ref(null);

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});

const status = computed(() => indexStatus());
const hasIndex = computed(() => status.value.exists && status.value.entryCount > 0);

// When the panel opens, focus the question input.
watch(open, (v) => {
  if (v) nextTick(() => inputRef.value?.focus());
});

async function ask() {
  const q = question.value.trim();
  if (!q || progress.running.value) return;
  error.value = "";
  answer.value = "";
  citations.value = [];
  progress.start();
  try {
    const result = await askManuscript({
      question: q,
      k: 6,
      signal: progress.signal,
      onDelta: (delta, content) => {
        progress.onDelta(delta, content);
        answer.value = content;
      },
    });
    answer.value = result.answer || answer.value;
    citations.value = result.citations || [];
    progress.finish();
  } catch (e) {
    if (!progress.cancelled.value) error.value = e?.message || String(e);
    progress.finish();
  }
}

function cancel() {
  progress.cancel();
}

function clearAnswer() {
  answer.value = "";
  citations.value = [];
  error.value = "";
}

function close() {
  open.value = false;
}

function onIndexBuilt() {
  indexModalMode.value = null;
  // status is computed off indexStatus() which reads storage each call,
  // so reactivity picks up the change next tick.
}

function openCitation(c) {
  if (!c?.chunk?.chapterId) return;
  router.push(`/chapters/${c.chunk.chapterId}`);
  close();
}

defineExpose({ open: () => { open.value = true; }, close });
</script>

<template>
  <transition name="cp-slide">
    <aside v-if="open" class="chat-panel" role="dialog" aria-label="Ask the manuscript">
      <header class="cp-head">
        <div>
          <div class="t-eyebrow">Ask the manuscript</div>
          <h2>Chat with your book</h2>
        </div>
        <button class="btn ghost sm" @click="close">
          <Icon name="Close" :size="12" /> Close
        </button>
      </header>

      <div v-if="!hasIndex" class="cp-empty">
        <Icon name="Sparkle" :size="22" />
        <h3>No index yet</h3>
        <p>Build a manuscript index so the assistant can search and quote your scenes. One LLM call per scene.</p>
        <button class="btn primary" @click="indexModalMode = 'build'">
          <Icon name="Sparkle" :size="13" /> Build index
        </button>
      </div>

      <template v-else>
        <!-- Index status strip -->
        <div class="cp-status">
          <Icon name="Check" :size="11" />
          <span><b>{{ status.entryCount }}</b> scenes indexed</span>
          <span class="cp-status-sep">·</span>
          <span class="cp-status-model"><code>{{ status.model || "?" }}</code></span>
          <span class="cp-status-spacer"></span>
          <button class="btn ghost sm" @click="indexModalMode = 'build'" title="Embed any scenes added or edited since last build">
            <Icon name="Refresh" :size="11" /> Update
          </button>
          <button class="btn ghost sm" @click="indexModalMode = 'rebuild'" title="Wipe and re-embed everything">
            <Icon name="Refresh" :size="11" /> Rebuild
          </button>
        </div>

        <!-- Question input -->
        <div class="cp-input-row">
          <textarea
            ref="inputRef"
            v-model="question"
            class="cp-textarea"
            rows="2"
            placeholder="Ask anything about your book — characters, scenes, threads…"
            @keydown.enter.exact.prevent="ask"
            @keydown.escape="close"
          />
          <div class="cp-input-actions">
            <span class="t-muted" style="font-size:10.5px">⏎ to send · ⇧⏎ for newline</span>
            <button class="btn primary sm" :disabled="!question.trim() || progress.running.value" @click="ask">
              <Icon name="Sparkle" :size="12" /> Ask
            </button>
          </div>
        </div>

        <!-- Progress / error -->
        <AiProgressBar :progress="progress" label="Searching + answering…" />
        <div v-if="error" class="cp-error">
          <Icon name="Alert" :size="13" /> {{ error }}
        </div>

        <!-- Answer -->
        <div v-if="answer || progress.running.value" class="cp-answer-wrap">
          <div class="cp-answer-head">
            <div class="t-eyebrow">Answer</div>
            <button v-if="answer && !progress.running.value" class="tb-btn tb-text" @click="clearAnswer">Clear</button>
          </div>
          <div class="cp-answer">{{ answer || "…" }}</div>
        </div>

        <!-- Citations -->
        <div v-if="citations.length" class="cp-cites">
          <div class="t-eyebrow">Sources</div>
          <ol class="cp-cite-list">
            <li v-for="c in citations" :key="c.index" class="cp-cite" @click="openCitation(c)">
              <span class="cp-cite-num">[{{ c.index }}]</span>
              <span class="cp-cite-meta">
                <b>Ch. {{ c.chunk.chapterNum }}</b>
                <span class="cp-cite-ch">{{ c.chunk.chapterTitle || "Untitled" }}</span>
                <span v-if="c.chunk.sceneTitle || c.chunk.sceneIdx != null" class="cp-cite-sc">
                  · {{ c.chunk.sceneTitle || `Scene ${c.chunk.sceneIdx + 1}` }}
                </span>
              </span>
              <span class="cp-cite-score">{{ (c.score * 100).toFixed(0) }}%</span>
            </li>
          </ol>
        </div>
      </template>

      <IndexBuildModal v-if="indexModalMode"
        :mode="indexModalMode"
        @close="indexModalMode = null"
        @built="onIndexBuilt" />
    </aside>
  </transition>
</template>

<style scoped>
.chat-panel {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 80;
  width: min(440px, 100vw);
  background: var(--surface);
  border-left: 1px solid var(--border);
  box-shadow: -8px 0 24px rgba(0, 0, 0, .14);
  display: flex; flex-direction: column;
  padding: 18px 22px;
  gap: 12px;
  overflow-y: auto;
}
.cp-slide-enter-active, .cp-slide-leave-active {
  transition: transform .22s cubic-bezier(.4, .0, .2, 1), opacity .22s;
}
.cp-slide-enter-from, .cp-slide-leave-to {
  transform: translateX(110%);
  opacity: 0;
}

.cp-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; }
.cp-head h2 { font-family: var(--font-serif); font-size: 18px; font-weight: 600; margin: 3px 0 0; }

.cp-empty {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 32px 16px; text-align: center;
  background: var(--surface-2); border-radius: 10px;
}
.cp-empty h3 { font-family: var(--font-serif); font-size: 16px; font-weight: 600; margin: 0; }
.cp-empty p { color: var(--muted); font-size: 12.5px; line-height: 1.5; margin: 0 0 6px; max-width: 28em; }

.cp-status {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding: 6px 10px; border-radius: 6px;
  background: var(--surface-2);
  font-size: 11.5px; color: var(--muted);
}
.cp-status b { color: var(--ink); font-variant-numeric: tabular-nums; }
.cp-status-sep { color: var(--subtle); }
.cp-status-spacer { flex: 1; }
.cp-status-model code {
  font-family: var(--font-mono); font-size: 10.5px;
  padding: 1px 5px; border-radius: 3px;
  background: var(--surface-3); color: var(--ink-2);
}

.cp-input-row {
  display: flex; flex-direction: column; gap: 8px;
  border: 1px solid var(--border); border-radius: 8px;
  padding: 10px 12px;
  background: var(--surface);
}
.cp-input-row:focus-within { border-color: var(--accent); }
.cp-textarea {
  width: 100%; box-sizing: border-box;
  appearance: none; border: 0; outline: 0; background: transparent; resize: vertical;
  font-family: var(--font-ui); font-size: 13.5px; line-height: 1.5;
  color: var(--ink);
  min-height: 42px;
}
.cp-textarea::placeholder { color: var(--muted); }
.cp-input-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; }

.cp-error {
  display: flex; gap: 8px; align-items: center;
  padding: 8px 12px; border-radius: 6px;
  background: color-mix(in oklab, var(--danger-ink, #b91c1c) 12%, transparent);
  color: var(--danger-ink, #b91c1c);
  font-size: 12px;
}

.cp-answer-wrap { display: flex; flex-direction: column; gap: 6px; }
.cp-answer-head { display: flex; align-items: center; justify-content: space-between; }
.cp-answer {
  font-family: var(--font-serif); font-size: 14px; line-height: 1.6;
  color: var(--ink-2);
  white-space: pre-wrap;
  padding: 12px 14px;
  background: var(--surface-2); border-radius: 8px;
  border-left: 3px solid var(--accent-line);
}

.cp-cites { display: flex; flex-direction: column; gap: 6px; }
.cp-cite-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.cp-cite {
  display: grid; grid-template-columns: auto 1fr auto;
  align-items: baseline; gap: 8px;
  padding: 6px 10px; border-radius: 6px;
  background: var(--surface-2);
  font-size: 12px; cursor: pointer;
  border: 1px solid transparent;
}
.cp-cite:hover { background: var(--surface-3); border-color: var(--border-soft); }
.cp-cite-num {
  font-family: var(--font-mono); font-size: 10.5px;
  color: var(--accent-ink); font-weight: 600;
}
.cp-cite-meta { display: flex; align-items: baseline; gap: 5px; min-width: 0; overflow: hidden; }
.cp-cite-meta b { font-family: var(--font-mono); font-size: 10.5px; color: var(--ink); }
.cp-cite-ch {
  font-family: var(--font-serif);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--ink-2);
}
.cp-cite-sc { color: var(--muted); white-space: nowrap; }
.cp-cite-score {
  font-family: var(--font-mono); font-size: 10px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
</style>
