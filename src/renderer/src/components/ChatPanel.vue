<script setup>
// Manuscript-RAG chat panel.
//
// Slide-in panel from the right. Maintains a multi-turn thread per session:
// each user question is embedded (with the prior user turn prepended for
// pronoun/entity context), top-K scenes are retrieved, and the LLM streams
// an answer with citations. The thread is kept in-memory and stays for the
// life of the panel; "New thread" clears it.

import { ref, computed, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useAiProgress } from "../composables/useAiProgress.js";
import { askManuscript } from "../services/rag/chat.js";
import { indexStatus } from "../services/rag/indexer.js";
import IndexBuildModal from "./IndexBuildModal.vue";
import AiProgressBar from "./AiProgressBar.vue";
import EmptyState from "./EmptyState.vue";
import Icon from "./Icon.vue";
import Button from "primevue/button";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue"]);

const router = useRouter();
const project = useProjectStore();
const progress = useAiProgress();

const question = ref("");
// thread items:
//   { role: "user",      content }
//   { role: "assistant", content, citations: [...], pending?: bool, error?: string }
const thread = ref([]);
const indexModalMode = ref(null); // "build" | "rebuild" | null
const inputRef = ref(null);
const threadRef = ref(null);

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});

const status = computed(() => indexStatus());
const hasIndex = computed(() => status.value.exists && status.value.entryCount > 0);
const hasThread = computed(() => thread.value.length > 0);

// Reset the thread whenever the active project changes — old citations
// won't make sense in a different manuscript.
watch(() => project.activeProjectId, () => { thread.value = []; });

// When the panel opens, focus the question input.
watch(open, (v) => {
  if (v) nextTick(() => inputRef.value?.focus());
});

// Auto-scroll to the bottom on new content (new turns or streamed deltas).
watch(thread, () => {
  nextTick(() => {
    const el = threadRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}, { deep: true });

async function ask() {
  const q = question.value.trim();
  if (!q || progress.running.value) return;

  // Snapshot history (everything sent BEFORE this turn) for the API call.
  const history = thread.value
    .filter((m) => !m.pending && !m.error)
    .map((m) => ({ role: m.role, content: m.content }));

  thread.value.push({ role: "user", content: q });
  const assistantMsg = { role: "assistant", content: "", citations: [], pending: true };
  thread.value.push(assistantMsg);
  question.value = "";

  progress.start();
  try {
    const result = await askManuscript({
      question: q,
      history,
      k: 6,
      signal: progress.signal,
      onDelta: (delta, content) => {
        progress.onDelta(delta, content);
        assistantMsg.content = content;
      },
    });
    assistantMsg.content   = result.answer || assistantMsg.content;
    assistantMsg.citations = result.citations || [];
    assistantMsg.pending   = false;
    progress.finish();
  } catch (e) {
    assistantMsg.pending = false;
    if (!progress.cancelled.value) assistantMsg.error = e?.message || String(e);
    progress.finish();
  }
}

function cancel() {
  progress.cancel();
}

function newThread() {
  thread.value = [];
  question.value = "";
  nextTick(() => inputRef.value?.focus());
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
        <Button severity="secondary" text size="small" @click="close">
          <Icon name="Close" :size="12" /> Close
        </Button>
      </header>

      <EmptyState v-if="!hasIndex"
        icon="Sparkle"
        title="No index yet"
        message="Build a manuscript index so the assistant can search and quote your scenes. One LLM call per scene."
        action-label="Build index"
        @action="indexModalMode = 'build'" />

      <template v-else>
        <!-- Index status strip -->
        <div class="cp-status">
          <Icon name="Check" :size="11" />
          <span><b>{{ status.entryCount }}</b> scenes indexed</span>
          <span class="cp-status-sep">·</span>
          <span class="cp-status-model"><code>{{ status.model || "?" }}</code></span>
          <span class="cp-status-spacer"></span>
          <Button v-if="hasThread" severity="secondary" text size="small" @click="newThread" v-tooltip.bottom="'Clear and start fresh'">
            <Icon name="Plus" :size="11" /> New thread
          </Button>
          <Button severity="secondary" text size="small" @click="indexModalMode = 'build'" v-tooltip.bottom="'Embed any scenes added or edited since last build'">
            <Icon name="Refresh" :size="11" /> Update
          </Button>
          <Button severity="secondary" text size="small" @click="indexModalMode = 'rebuild'" v-tooltip.bottom="'Wipe and re-embed everything'">
            <Icon name="Refresh" :size="11" /> Rebuild
          </Button>
        </div>

        <!-- Thread (user + assistant turns) -->
        <div ref="threadRef" class="cp-thread">
          <div v-if="!hasThread" class="cp-empty-hint">
            <Icon name="Sparkle" :size="14" />
            <span>Ask anything about your book — characters, scenes, threads. Follow-ups remember the conversation.</span>
          </div>

          <template v-for="(m, i) in thread" :key="i">
            <!-- User bubble -->
            <div v-if="m.role === 'user'" class="cp-msg cp-msg-user">
              <div class="cp-bubble cp-bubble-user">{{ m.content }}</div>
            </div>

            <!-- Assistant bubble -->
            <div v-else class="cp-msg cp-msg-assistant">
              <div v-if="m.error" class="cp-error">
                <Icon name="Alert" :size="13" /> {{ m.error }}
              </div>
              <template v-else>
                <div class="cp-bubble cp-bubble-assistant">{{ m.content || (m.pending ? "…" : "") }}</div>
                <div v-if="m.citations && m.citations.length" class="cp-cites">
                  <ol class="cp-cite-list">
                    <li v-for="c in m.citations" :key="c.index" class="cp-cite" @click="openCitation(c)">
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
            </div>
          </template>
        </div>

        <!-- Question input (pinned to the bottom of the panel) -->
        <div class="cp-input-row">
          <textarea
            ref="inputRef"
            v-model="question"
            class="cp-textarea"
            rows="2"
            :placeholder="hasThread ? 'Ask a follow-up…' : 'Ask anything about your book — characters, scenes, threads…'"
            @keydown.enter.exact.prevent="ask"
            @keydown.escape="close"
          />
          <div class="cp-input-actions">
            <span class="t-muted" style="font-size:10.5px">⏎ to send · ⇧⏎ for newline</span>
            <Button v-if="progress.running.value" severity="secondary" size="small" @click="cancel">
              <Icon name="Close" :size="12" /> Cancel
            </Button>
            <Button v-else severity="primary" size="small" :disabled="!question.trim()" @click="ask">
              <Icon name="Sparkle" :size="12" /> Ask
            </Button>
          </div>
        </div>

        <AiProgressBar :progress="progress" label="Searching + answering…" />
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
}
.cp-slide-enter-active, .cp-slide-leave-active {
  transition: transform .22s cubic-bezier(.4, .0, .2, 1), opacity .22s;
}
.cp-slide-enter-from, .cp-slide-leave-to {
  transform: translateX(110%);
  opacity: 0;
}

.cp-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; flex-shrink: 0; }
.cp-head h2 { font-family: var(--font-serif); font-size: 18px; font-weight: 600; margin: 3px 0 0; }

.cp-status {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding: 6px 10px; border-radius: 6px;
  background: var(--surface-2);
  font-size: 11.5px; color: var(--muted);
  flex-shrink: 0;
}
.cp-status b { color: var(--ink); font-variant-numeric: tabular-nums; }
.cp-status-sep { color: var(--subtle); }
.cp-status-spacer { flex: 1; }
.cp-status-model code {
  font-family: var(--font-mono); font-size: 10.5px;
  padding: 1px 5px; border-radius: 3px;
  background: var(--surface-3); color: var(--ink-2);
}

/* Thread — scrollable area between the status strip and the input row. */
.cp-thread {
  flex: 1 1 auto;
  overflow-y: auto;
  display: flex; flex-direction: column; gap: 12px;
  padding: 4px 2px 8px;
}
.cp-empty-hint {
  display: flex; gap: 8px; align-items: flex-start;
  padding: 10px 12px;
  color: var(--muted);
  font-size: 12.5px; line-height: 1.5;
  background: var(--surface-2); border-radius: 8px;
}
.cp-empty-hint :first-child { flex-shrink: 0; margin-top: 2px; }

.cp-msg { display: flex; flex-direction: column; gap: 6px; }
.cp-msg-user      { align-items: flex-end;   }
.cp-msg-assistant { align-items: flex-start; }
.cp-bubble {
  max-width: 92%;
  padding: 10px 13px;
  border-radius: 10px;
  font-size: 13.5px; line-height: 1.55;
  white-space: pre-wrap; word-break: break-word;
}
.cp-bubble-user {
  background: var(--accent-soft);
  color: var(--accent-ink);
  border: 1px solid var(--accent-line);
  font-family: var(--font-ui);
}
.cp-bubble-assistant {
  background: var(--surface-2);
  color: var(--ink-2);
  border-left: 3px solid var(--accent-line);
  font-family: var(--font-serif);
  font-size: 14px;
  line-height: 1.6;
  width: 100%; max-width: 100%; box-sizing: border-box;
}

.cp-input-row {
  display: flex; flex-direction: column; gap: 8px;
  border: 1px solid var(--border); border-radius: 8px;
  padding: 10px 12px;
  background: var(--surface);
  flex-shrink: 0;
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

.cp-cites { display: flex; flex-direction: column; gap: 6px; width: 100%; }
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
