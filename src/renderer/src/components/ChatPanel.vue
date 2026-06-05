<script setup>
// Manuscript-RAG chat panel.
//
// Slide-in panel from the right. Maintains a multi-turn thread per project,
// persisted to IDB so closing the panel doesn't lose context. Each user
// question is embedded (with the prior user turn prepended for pronoun
// /entity context), top-K scenes are retrieved, and the LLM streams an
// answer with citations. "New thread" clears.

import { ref, computed, watch, nextTick, onBeforeUnmount } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useAiStore } from "../stores/ai.js";
import { useAiTasksStore } from "../stores/aiTasks.js";
import { askManuscript } from "../services/rag/chat.js";
import { askAsCharacter } from "../services/rag/characterChat.js";
import { indexStatus } from "../services/rag/indexer.js";
import { autoIndexRunning } from "../services/rag/autoIndex.js";
import { getItem, setItem } from "../services/storage.js";
import IndexBuildModal from "./IndexBuildModal.vue";
import AiTaskStrip from "./AiTaskStrip.vue";
import AiFeatureChip from "./AiFeatureChip.vue";
import EmptyState from "./EmptyState.vue";
import Icon from "./Icon.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";
import JwTextarea from "@renderer/components/ui/JwTextarea.vue";
import JwSelect from "@renderer/components/ui/JwSelect.vue";
import { useModelList } from "../composables/useModelList.js";

// One thread per (project, mode, character) combo. Book mode is
// keyed without a character id (preserves the pre-character-mode key
// shape so older threads load unchanged).
const THREAD_KEY = (pid, mode, characterId) => {
  if (mode === "character" && characterId) {
    return `justwrite:rag:thread:${pid}:char:${characterId}`;
  }
  return `justwrite:rag:thread:${pid}`;
};
// Cap persisted threads at the last 30 messages — long threads waste
// storage and the model already truncates history to MAX_HISTORY_MESSAGES.
const MAX_PERSISTED = 30;

function loadThread(projectId, mode, characterId) {
  if (!projectId) return [];
  if (mode === "character" && !characterId) return [];
  try {
    const raw = getItem(THREAD_KEY(projectId, mode, characterId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    // A pending assistant message persisted from a previous session was
    // an aborted stream — drop the trailing user+pending pair so the
    // restored thread doesn't show a question "in flight" forever.
    let trimmed = [...arr];
    while (trimmed.length && trimmed[trimmed.length - 1]?.pending) {
      trimmed.pop();
      if (trimmed.length && trimmed[trimmed.length - 1]?.role === "user") trimmed.pop();
    }
    return trimmed;
  } catch { return []; }
}

function saveThread(projectId, mode, characterId, items) {
  if (!projectId) return;
  if (mode === "character" && !characterId) return;
  try {
    const trimmed = items.slice(-MAX_PERSISTED);
    setItem(THREAD_KEY(projectId, mode, characterId), JSON.stringify(trimmed));
  } catch (err) {
    console.error("ChatPanel.saveThread failed:", err);
  }
}

const props = defineProps({
  modelValue: { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue"]);

const router = useRouter();
const project = useProjectStore();
const ai = useAiStore();
const aiTasks = useAiTasksStore();

// Task lookup covers both chat modes — book mode uses "chat", character
// mode uses "characterChat". We match whichever is currently running.
const myTask = computed(() => aiTasks.runningTasks.find(
  (t) => t.feature === "chat" || t.feature === "characterChat"
));
const running = computed(() => !!myTask.value);

function isAbort(e) { return e?.name === "AbortError" || /abort/i.test(e?.message || ""); }

// Per-thread provider+model picker. Writes to ai.featurePins.chat —
// the same key Settings → AI → Feature routing edits. Two selects mirror
// the aggregator pattern: pick provider, then pick model.
const { modelsFor: chatModelsFor, refreshModels: refreshChatModels, ensureModels: ensureChatModels } = useModelList();
const INHERIT_CHAT = "__inherit__";

const chatProviderOptions = computed(() => {
  const out = [{ value: INHERIT_CHAT, label: `Default · ${ai.llmProvider?.name || "—"}` }];
  for (const p of ai.readyLlmProviders) out.push({ value: p.id, label: p.name });
  return out;
});
const chatProviderValue = computed({
  get() { return ai.featurePins?.chat?.providerId || INHERIT_CHAT; },
  set(v) {
    if (!v || v === INHERIT_CHAT) { ai.setFeaturePin("chat", null); return; }
    const p = ai.providerById(v);
    ai.setFeaturePin("chat", { providerId: v, model: p?.chatModel || "" });
    ensureChatModels(v);
  },
});
const chatModelValue = computed({
  get() { return ai.featurePins?.chat?.model || ""; },
  set(v) {
    const pin = ai.featurePins?.chat;
    if (!pin?.providerId) return;
    ai.setFeaturePin("chat", { providerId: pin.providerId, model: v || pin.model });
  },
});
const chatModelOptions = computed(() => {
  const pid = chatProviderValue.value;
  if (pid === INHERIT_CHAT) return [];
  const provider = ai.providerById(pid);
  const list = chatModelsFor(pid);
  const seen = new Set();
  const out = [];
  if (provider?.chatModel) {
    out.push({ value: provider.chatModel, label: `${provider.chatModel} (default)` });
    seen.add(provider.chatModel);
  }
  for (const m of list) {
    if (m.id && !seen.has(m.id)) { out.push({ value: m.id, label: m.id }); seen.add(m.id); }
  }
  return out;
});
const showModelPicker = computed(() => ai.readyLlmProviders.length > 1);

const question = ref("");
// "book" = Ask the manuscript (the original chat). "character" = talk
// to a specific character in the writer's cast (first-person, in-voice).
const chatMode = ref("book");
const selectedCharacterId = ref(null);
const MODE_OPTIONS = [
  { value: "book", label: "Ask the book" },
  { value: "character", label: "Talk to a character" },
];
const characterOptions = computed(() => {
  const main = (project.characters || []).filter((c) => c.main);
  const rest = (project.characters || []).filter((c) => !c.main);
  return [...main, ...rest].map((c) => ({ value: c.id, label: c.name + (c.role ? ` — ${c.role}` : "") }));
});
const selectedCharacter = computed(
  () => (project.characters || []).find((c) => c.id === selectedCharacterId.value) || null,
);

// thread items:
//   { role: "user",      content }
//   { role: "assistant", content, citations: [...], pending?: bool, error?: string }
const thread = ref(loadThread(project.activeProjectId, "book", null));
const indexModalMode = ref(null); // "build" | "rebuild" | null
const inputRef = ref(null);
const threadRef = ref(null);
const panelRef = ref(null);

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});

// When the panel opens with a pre-existing chat pin, make sure the
// model list is populated. ensureChatModels only hits the network when
// the cache is empty — repeat opens are free.
watch(open, (v) => {
  if (!v) return;
  const pid = ai.featurePins?.chat?.providerId;
  if (pid) ensureChatModels(pid);
}, { immediate: true });

// indexStatus() reads the (non-reactive) IDB cache directly, so the computed
// has no signal to recompute when the vector store changes. Bump indexBump
// from places that mutate the index (build / rebuild / clear / auto-rebuild
// finish) and touch it inside the computed.
const indexBump = ref(0);
const status = computed(() => {
  indexBump.value; // touch — forces recompute when bumped
  return indexStatus();
});
const hasIndex = computed(() => status.value.exists && status.value.entryCount > 0);
const hasThread = computed(() => thread.value.length > 0);
// Wrap the imported ref so the template gets a guaranteed-unwrapped value.
// Bump indexBump when an auto-rebuild finishes so the scenes-indexed count
// in the status strip reflects new chunks.
const isIndexing = computed(() => autoIndexRunning.value);
watch(autoIndexRunning, (running) => { if (!running) indexBump.value++; });

// Reset (and rehydrate) the thread whenever the active project, mode,
// or selected character changes — each combo has its own persisted
// thread so closing and re-opening preserves wherever the writer was.
watch(() => project.activeProjectId, (pid) => {
  thread.value = loadThread(pid, chatMode.value, selectedCharacterId.value);
});
watch([chatMode, selectedCharacterId], () => {
  thread.value = loadThread(project.activeProjectId, chatMode.value, selectedCharacterId.value);
  question.value = "";
});

// Auto-pick a default character on first switch into character mode so
// the writer doesn't have to fish through the dropdown to start chatting.
watch(chatMode, (mode) => {
  if (mode !== "character") return;
  if (selectedCharacterId.value) return;
  const list = project.characters || [];
  const first = list.find((c) => c.main) || list[0];
  if (first) selectedCharacterId.value = first.id;
});

// When the panel opens, focus the question input.
watch(open, (v) => {
  if (v) nextTick(() => inputRef.value?.focus());
});

// Auto-scroll to the bottom on new content (new turns or streamed deltas)
// and persist the thread snapshot. Saving on every keystroke of a streamed
// delta is fine — setItem is a sync IDB-cached write, cheap at this size.
watch(thread, () => {
  nextTick(() => {
    const el = threadRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
  saveThread(project.activeProjectId, chatMode.value, selectedCharacterId.value, thread.value);
}, { deep: true });

async function ask() {
  const q = question.value.trim();
  if (!q || running.value) return;
  if (chatMode.value === "character" && !selectedCharacterId.value) {
    // Defensive: shouldn't happen since the dropdown auto-selects, but
    // surface a clear hint if it does rather than failing silently.
    thread.value.push({ role: "assistant", content: "", error: "Pick a character first.", pending: false });
    return;
  }

  // Snapshot history (everything sent BEFORE this turn) for the API call.
  const history = thread.value
    .filter((m) => !m.pending && !m.error)
    .map((m) => ({ role: m.role, content: m.content }));

  thread.value.push({ role: "user", content: q });
  const assistantMsg = { role: "assistant", content: "", citations: [], pending: true };
  thread.value.push(assistantMsg);
  question.value = "";

  try {
    const askArgs = {
      question: q,
      history,
      k: 6,
      onDelta: (delta, content) => {
        assistantMsg.content = content;
      },
      task: { label: chatMode.value === "character"
        ? `Character chat · ${(project.characters || []).find(c => c.id === selectedCharacterId.value)?.name || "Character"}`
        : "Ask the manuscript",
        meta: { mode: chatMode.value, characterId: selectedCharacterId.value } },
    };
    const result = chatMode.value === "character"
      ? await askAsCharacter({ ...askArgs, characterId: selectedCharacterId.value })
      : await askManuscript(askArgs);
    assistantMsg.content   = result.answer || assistantMsg.content;
    assistantMsg.citations = result.citations || [];
    assistantMsg.pending   = false;
  } catch (e) {
    assistantMsg.pending = false;
    if (!isAbort(e)) assistantMsg.error = e?.message || String(e);
  }
}

function newThread() {
  thread.value = [];
  question.value = "";
  // Wipe the persisted copy too, so the empty state survives a panel close.
  saveThread(project.activeProjectId, chatMode.value, selectedCharacterId.value, []);
  nextTick(() => inputRef.value?.focus());
}

function close() {
  open.value = false;
}

function onDocKeydown(e) {
  if (e.key === "Escape" && open.value) {
    e.stopPropagation();
    close();
  }
}
// Click-outside dismissal. Runs in the click bubble phase, so any in-panel
// @click (and the sidebar "Ask the book" toggle, which fires on its own
// target first) has already executed by the time we see the event — that's
// why the sidebar toggle works as a true toggle: it flips open → false
// before we get here. Exemptions:
//   - [data-chat-toggle] — the sidebar trigger, so clicking it while
//     closed doesn't immediately re-close after it just opened.
//   - [role="dialog"]    — portaled modals (IndexBuildModal via AppModal)
//     teleport outside the panel; clicks inside them aren't "outside".
//   - [role="listbox"]   — Reka Select popover content (model picker).
function onDocClick(e) {
  if (!open.value) return;
  const target = e.target;
  if (!target || !panelRef.value) return;
  if (panelRef.value.contains(target)) return;
  if (target.closest?.("[data-chat-toggle]")) return;
  if (target.closest?.('[role="dialog"], [role="listbox"]')) return;
  close();
}
document.addEventListener("keydown", onDocKeydown);
document.addEventListener("click", onDocClick);
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onDocKeydown);
  document.removeEventListener("click", onDocClick);
});

function onIndexBuilt() {
  // Don't auto-close the modal — yanking it via v-if before the leave
  // transition finishes skips AppModal's close timing dance (see
  // AppModal.vue). The user dismisses with the Done button.
  //
  // Bump indexBump so the status computed re-evaluates against the freshly
  // written IDB store — otherwise hasIndex stays stuck at false and the
  // chat panel keeps showing the "No index yet" empty state under the modal.
  indexBump.value++;
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
    <aside v-if="open" ref="panelRef" class="chat-panel" role="dialog" aria-label="Ask the manuscript">
      <header class="cp-head">
        <div>
          <div class="t-eyebrow">{{ chatMode === "character" ? "Talk to a character" : "Ask the manuscript" }}</div>
          <h2>
            <template v-if="chatMode === 'character'">
              {{ selectedCharacter?.name || "Pick a character" }}
            </template>
            <template v-else>Chat with your book</template>
          </h2>
        </div>
        <div class="cp-head-actions">
          <AiFeatureChip v-if="chatMode === 'character'" feature="characterChat" label="Talk to character" />
          <AiFeatureChip v-else feature="chat" label="Ask the book" />
          <JwButton intent="ghost" size="small" @click="close">
            <Icon name="Close" :size="12" /> Close
          </JwButton>
        </div>
      </header>

      <!-- Mode + character picker. The character dropdown only shows
           in character mode. Switching either resets the thread to the
           one persisted under that (mode, character) combo. -->
      <div class="cp-mode-row">
        <JwSelect v-model="chatMode" :options="MODE_OPTIONS" />
        <JwSelect v-if="chatMode === 'character'"
                  v-model="selectedCharacterId"
                  :options="characterOptions"
                  :placeholder="characterOptions.length ? 'Pick a character' : 'No characters yet'"
                  :disabled="!characterOptions.length" />
      </div>

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
          <span v-if="isIndexing" class="cp-indexing" v-tooltip.bottom="'Auto-rebuild is updating the index'">
            <span class="cp-indexing-dot"></span> indexing…
          </span>
          <span class="cp-status-spacer"></span>
          <JwButton v-if="hasThread" intent="ghost" size="small" @click="newThread" v-tooltip.bottom="'Clear and start fresh'">
            <Icon name="Plus" :size="11" /> New thread
          </JwButton>
          <JwButton intent="ghost" size="small" @click="indexModalMode = 'build'" v-tooltip.bottom="'Embed any scenes added or edited since last build'">
            <Icon name="Refresh" :size="11" /> Update
          </JwButton>
          <JwButton intent="ghost" size="small" @click="indexModalMode = 'rebuild'" v-tooltip.bottom="'Wipe and re-embed everything'">
            <Icon name="Refresh" :size="11" /> Rebuild
          </JwButton>
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
          <div v-if="showModelPicker" class="cp-model-pick">
            <JwSelect v-model="chatProviderValue" :options="chatProviderOptions" />
            <div style="display:flex;align-items:center;gap:4px;min-width:0">
              <JwSelect
                style="flex:1;min-width:0"
                v-model="chatModelValue"
                :options="chatModelOptions"
                :disabled="chatProviderValue === '__inherit__'"
                :placeholder="chatProviderValue === '__inherit__' ? 'Follows default' : 'Model'" />
              <JwButton
                intent="ghost" size="small"
                v-tooltip.bottom="'Refresh model list from the provider'"
                :disabled="chatProviderValue === '__inherit__'"
                @click="refreshChatModels(chatProviderValue)">
                <template #icon><Icon name="Refresh" :size="11" /></template>
              </JwButton>
            </div>
          </div>
          <JwTextarea
            ref="inputRef"
            v-model="question"
            class="cp-textarea"
            :rows="2"
            :placeholder="hasThread ? 'Ask a follow-up…' : 'Ask anything about your book — characters, scenes, threads…'"
            auto-resize
            @keydown.enter.exact.prevent="ask"
            @keydown.escape="close"
          />
          <div class="cp-input-actions">
            <span class="cp-hint">
              <kbd class="cp-kbd">⏎</kbd> to send
              <span class="cp-hint-sep">·</span>
              <kbd class="cp-kbd">⇧⏎</kbd> for newline
            </span>
            <JwButton intent="primary" size="small" :disabled="!question.trim() || running" @click="ask">
              <Icon name="Sparkle" :size="12" /> Ask
            </JwButton>
          </div>
        </div>

        <AiTaskStrip :task="myTask" />
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
  position: fixed; top: 16px; right: 16px; bottom: 32px; z-index: 80;
  width: min(440px, calc(100vw - 32px));
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-window);
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
.cp-head-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.cp-mode-row {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
  margin-top: 12px; flex-shrink: 0;
}
.cp-mode-row > * { min-width: 0; }

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
.cp-indexing {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 1px 7px 1px 6px; border-radius: 999px;
  background: var(--accent-soft); color: var(--accent-ink);
  font-size: 10.5px; font-weight: 500;
}
.cp-indexing-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--accent);
  animation: cp-indexing-pulse 1.4s ease-in-out infinite;
}
@keyframes cp-indexing-pulse {
  0%, 100% { opacity: 0.35; transform: scale(0.9); }
  50%      { opacity: 1;    transform: scale(1.1); }
}

/* Thread — scrollable area between the status strip and the input row.
   min-height: 0 lets flex shrink this past its content's natural size so
   the input row + progress bar stay pinned to the bottom regardless of how
   many turns are in the thread (without it the thread's content-min would
   push them out of the panel). */
.cp-thread {
  flex: 1 1 auto;
  min-height: 0;
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
.cp-model-pick {
  display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
  padding-bottom: 6px; margin-bottom: 2px;
  border-bottom: 1px solid var(--border-soft);
}
.cp-model-pick :deep(.jw-select-trigger) { padding: 4px 8px; font-size: 12.5px; }
.cp-textarea {
  width: 100%; box-sizing: border-box;
  appearance: none; border: 0; outline: 0; background: transparent; resize: none;
  font-family: var(--font-ui); font-size: 13.5px; line-height: 1.5;
  color: var(--ink);
  min-height: 42px;
}
.cp-textarea::placeholder { color: var(--muted); }
.cp-input-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.cp-hint {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11.5px; color: var(--ink-2);
}
.cp-hint-sep { color: var(--muted); }
.cp-kbd {
  font-family: var(--font-mono); font-size: 10.5px;
  color: var(--ink-2); background: var(--surface);
  border: 1px solid var(--border-soft); border-radius: 4px;
  padding: 1px 5px; line-height: 14px;
}

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
