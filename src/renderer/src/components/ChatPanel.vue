<script setup>
// Manuscript-RAG chat panel.
//
// Slide-in panel from the right. Maintains a multi-turn thread per project,
// persisted server-side (/v1/chat) so closing the panel doesn't lose context.
// Each user question is embedded (with the prior user turn prepended for
// pronoun/entity context), top-K scenes are retrieved, and the LLM streams an
// answer with citations.
//
// NO-INDEX mode (2026-07-18, user decision): chat is never blocked — without
// an index the services answer from story-bible pins alone (zero embedding
// calls), and the status strip becomes the "story bible only" notice with the
// Build-index upgrade inline. The old EmptyState hard gate is gone.

import { ref, computed, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useAiTasksStore, AiTaskStrip, HelpTrigger, Icon, UiButton, UiTextarea, UiSelect, confirmDialog, usePanelDismiss } from "@delebash/llm-ui";
import { useUiStore } from "../stores/ui.js";
import { askManuscript } from "../services/rag/chat.js";
import { askAsCharacter } from "../services/rag/characterChat.js";
import { citationLabel } from "../services/rag/excerpts.js";
import { indexStatus } from "../services/rag/indexer.js";
import { autoIndexRunning } from "../services/rag/autoIndex.js";
import { fetchThread, putThread, deleteThread } from "../services/chatApi.js";
import IndexBuildModal from "./IndexBuildModal.vue";
import AiFeatureChip from "./AiFeatureChip.vue";

// One thread per (project, mode, character) combo, persisted server-side
// (/v1/chat) so closing the panel doesn't lose context. Book mode uses an
// empty character id.
//
// Cap persisted threads at the last 30 messages — long threads waste storage
// and the model already truncates history to MAX_HISTORY_MESSAGES.
const MAX_PERSISTED = 30;

async function loadThread(projectId, mode, characterId) {
  if (!projectId) return [];
  if (mode === "character" && !characterId) return [];
  try {
    return await fetchThread({ projectId, mode, characterId: characterId || "" });
  } catch (err) {
    console.error("ChatPanel.loadThread failed:", err);
    return [];
  }
}

// Persist a settled thread (replace-all). Only completed turns are stored — a
// half-streamed assistant message (pending) is never written, so a mid-stream
// close just restores the last settled state on reload (no "in flight" turn).
function persistThread(projectId, mode, characterId, items) {
  if (!projectId) return;
  if (mode === "character" && !characterId) return;
  const messages = items.filter((m) => !m.pending).slice(-MAX_PERSISTED);
  putThread({ projectId, mode, characterId: characterId || "", messages });
}

const props = defineProps({
  modelValue: { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue"]);

const router = useRouter();
const project = useProjectStore();
const aiTasks = useAiTasksStore();
const ui = useUiStore();

// Task lookup covers both chat modes — book mode uses "chat", character
// mode uses "characterChat". We match whichever is currently running.
const myTask = computed(() => aiTasks.runningTasks.find(
  (t) => t.feature === "chat" || t.feature === "characterChat"
));
const running = computed(() => !!myTask.value);

function isAbort(e) { return e?.name === "AbortError" || /abort/i.test(e?.message || ""); }

const question = ref("");
// "book" = Ask the book (the original chat). "character" = talk
// to a specific character in the writer's cast (first-person, in-voice).
const chatMode = ref("book");
const selectedCharacterId = ref(null);

// The in-panel provider+model PICKER is gone (B5-1, §7.2 — the user: "i am
// not sure if we even want a provider model selector in the app besides what
// we have for task and feature" → REMOVE). The header AiFeatureChip is now a
// read-only "runs on" provenance chip; routing is edited on the Tasks tab.
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
const thread = ref([]);
const indexModalMode = ref(null); // "build" | "rebuild" | null
const inputRef = ref(null);
const threadRef = ref(null);
const panelRef = ref(null);

// Thread hydration is async (a server fetch) and the user can switch
// project/mode/character faster than a fetch resolves — a stale load must not
// clobber a newer one. A monotonic token guards the assignment: only the most
// recent hydrate writes to `thread`.
let loadToken = 0;
async function hydrateThread() {
  const my = ++loadToken;
  const loaded = await loadThread(project.activeProjectId, chatMode.value, selectedCharacterId.value);
  if (my === loadToken) thread.value = loaded;
}
hydrateThread();

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});

// Pre-scoping: openChatPanelFor() stages a target on the ui store and
// opens the panel. Watching the target itself (not `open`) means the
// switch lands even when the panel was already open.
watch(() => ui.chatRequestedTarget, (target) => {
  if (!target) return;
  if (target.mode === "character" && target.characterId) {
    chatMode.value = "character";
    selectedCharacterId.value = target.characterId;
  } else if (target.mode === "book") {
    chatMode.value = "book";
  }
  if (target.question) {
    question.value = target.question;
    nextTick(() => inputRef.value?.focus());
  }
  ui.consumeChatRequestedTarget();
}, { immediate: true });

// indexStatus() now queries the server, so `status` is a ref refreshed on the
// triggers that change the index (project switch / build / rebuild / clear /
// auto-rebuild finish) rather than a recomputed local cache read.
const status = ref({ exists: false, entryCount: 0, model: "", dims: 0 });
async function refreshStatus() { status.value = await indexStatus(); }
const hasIndex = computed(() => status.value.exists && status.value.entryCount > 0);
const hasThread = computed(() => thread.value.length > 0);
const isIndexing = computed(() => autoIndexRunning.value);
watch(autoIndexRunning, (running) => { if (!running) refreshStatus(); });
refreshStatus();

// Reset (and rehydrate) the thread whenever the active project, mode,
// or selected character changes — each combo has its own persisted
// thread so closing and re-opening preserves wherever the writer was.
watch(() => project.activeProjectId, () => {
  hydrateThread();
  refreshStatus();
});
watch([chatMode, selectedCharacterId], () => {
  hydrateThread();
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

// Auto-scroll to the bottom on new content (new turns or streamed deltas).
// Persistence is NOT here: a streamed delta fires this on every token, and a
// thread save is a whole-thread replace — we persist only when a turn settles
// (see ask / newThread) so streaming doesn't hammer the server.
watch(thread, () => {
  nextTick(() => {
    const el = threadRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
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

  // Identity of the thread this turn belongs to — captured now so a mid-stream
  // switch to another thread doesn't persist this turn under the wrong key.
  const pid = project.activeProjectId;
  const mode = chatMode.value;
  const cid = selectedCharacterId.value;

  // Snapshot history (everything sent BEFORE this turn) for the API call.
  const history = thread.value
    .filter((m) => !m.pending && !m.error)
    .map((m) => ({ role: m.role, content: m.content }));

  thread.value.push({ role: "user", content: q });
  thread.value.push({ role: "assistant", content: "", citations: [], pending: true });
  // Mutate the turn through the array's REACTIVE proxy: writes on the raw
  // pushed object bypass Vue's set trap, so the settle (citations/pending)
  // could land without ever triggering a re-render — the answer then looked
  // stuck "pending, no citations" until some unrelated update repainted
  // (surfaced by the rag-probe's instant stub stream, 2026-07-11).
  const assistantMsg = thread.value[thread.value.length - 1];
  question.value = "";

  try {
    const askArgs = {
      question: q,
      history,
      k: 6,
      onDelta: (_delta, content) => {
        assistantMsg.content = content;
      },
      task: { label: chatMode.value === "character"
        ? `Character chat · ${(project.characters || []).find(c => c.id === selectedCharacterId.value)?.name || "Character"}`
        : "Ask the book",
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
  } finally {
    // Persist only if the user hasn't switched threads mid-stream — otherwise
    // thread.value now belongs to a different thread (this turn's array is
    // detached) and persisting it would clobber the wrong key.
    if (pid === project.activeProjectId && mode === chatMode.value && cid === selectedCharacterId.value) {
      persistThread(pid, mode, cid, thread.value);
    }
  }
}

// "New chat" (#46 — renamed from "New thread"): clear and start fresh.
function newChat() {
  thread.value = [];
  question.value = "";
  // Wipe the persisted copy too, so the empty state survives a panel close.
  persistThread(project.activeProjectId, chatMode.value, selectedCharacterId.value, []);
  nextTick(() => inputRef.value?.focus());
}

// "Delete chat" (#46): remove this conversation's stored record entirely —
// destructive, so it confirms first. One chat per (project, mode, character)
// combo today, so this deletes the CURRENT combo's conversation.
async function deleteChat() {
  const yes = await confirmDialog({
    title: "Delete this chat?",
    message: chatMode.value === "character"
      ? `Delete the saved conversation with ${selectedCharacter.value?.name || "this character"}? This can't be undone.`
      : "Delete the saved Ask-the-book conversation? This can't be undone.",
    confirmLabel: "Delete chat",
    danger: true,
  });
  if (!yes) return;
  thread.value = [];
  question.value = "";
  deleteThread({ projectId: project.activeProjectId, mode: chatMode.value, characterId: selectedCharacterId.value });
  nextTick(() => inputRef.value?.focus());
}

function close() {
  ui.closeChatPanel();
}

// Esc + click-outside dismissal comes from the shared kit composable
// (usePanelDismiss, extracted from THIS component 2026-07-19 so the AI-tasks
// panel and every future panel dismiss identically). The mousedown-not-click
// reasoning and the toggle / portal exemptions live in the composable's own
// comments — read them there; this panel needs no extra exemptions.
usePanelDismiss(open, panelRef, close);

function onIndexBuilt() {
  // Don't auto-close the modal — yanking it via v-if before the leave
  // transition finishes skips AppModal's close timing dance (see
  // AppModal.vue). The user dismisses with the Done button.
  //
  // Refresh status against the freshly written server index — otherwise
  // hasIndex stays stuck at false and the chat panel keeps showing the
  // "No index yet" empty state under the modal.
  refreshStatus();
}

// A story-bible card citation navigates to the entity's own page (Move 1);
// architecture doc ids ARE the route param (/architecture/premise). Scene
// citations keep the chapter navigation.
const CARD_ROUTES = {
  character: "characters", location: "locations", object: "objects",
  group: "groups", worldbuilding: "worldbuilding", note: "notes",
  strand: "strands", architecture: "architecture",
};
function openCitation(c) {
  const chunk = c?.chunk;
  if (chunk?.kind && CARD_ROUTES[chunk.kind]) {
    router.push(`/${CARD_ROUTES[chunk.kind]}/${chunk.entityId}`);
    close();
    return;
  }
  if (!chunk?.chapterId) return;
  router.push(`/chapters/${chunk.chapterId}`);
  close();
}

defineExpose({ open: () => { open.value = true; }, close });
</script>

<template>
  <transition name="cp-slide">
    <aside v-if="open" ref="panelRef" class="chat-panel" role="dialog" aria-label="Ask the book">
      <header class="cp-head">
        <div>
          <div class="t-eyebrow">{{ chatMode === "character" ? "Talk to a character" : "Ask the book" }}</div>
          <h2>
            <template v-if="chatMode === 'character'">
              {{ selectedCharacter?.name || "Pick a character" }}
            </template>
            <template v-else>Chat with your book</template>
          </h2>
        </div>
        <div class="cp-head-actions">
          <AiFeatureChip v-if="chatMode === 'character'" feature="characterChat" label="Talk to character" editable />
          <AiFeatureChip v-else feature="chat" label="Ask the book" editable />
          <UiButton intent="ghost" size="small" @click="close">
            <Icon name="Close" :size="12" /> Close
          </UiButton>
          <HelpTrigger slug="notes-and-search" label="Ask the book" />
        </div>
      </header>

      <!-- Mode + character picker. The character dropdown only shows
           in character mode. Switching either resets the thread to the
           one persisted under that (mode, character) combo. -->
      <div class="cp-mode-row">
        <UiSelect v-model="chatMode" :options="MODE_OPTIONS" />
        <UiSelect v-if="chatMode === 'character'"
                  v-model="selectedCharacterId"
                  :options="characterOptions"
                  :placeholder="characterOptions.length ? 'Pick a character' : 'No characters yet'"
                  :disabled="!characterOptions.length" />
      </div>

      <!-- Index status strip (indexed) OR the story-bible-only notice (no
           index — chat still works; answers ground on bible pins alone). -->
      <div v-if="hasIndex" class="cp-status">
        <Icon name="Check" :size="11" />
        <span><b>{{ status.entryCount }}</b> scenes indexed</span>
        <span class="cp-status-sep">·</span>
        <span class="cp-status-model"><code>{{ status.model || "?" }}</code></span>
        <span v-if="isIndexing" class="cp-indexing" v-tooltip.bottom="'Auto-rebuild is updating the index'">
          <span class="cp-indexing-dot"></span> indexing…
        </span>
        <span class="cp-status-spacer"></span>
        <UiButton v-if="hasThread" intent="ghost" size="small" @click="newChat" v-tooltip.bottom="'Clear and start fresh'">
          <Icon name="Plus" :size="11" /> New chat
        </UiButton>
        <UiButton v-if="hasThread" intent="ghost" size="small" @click="deleteChat" v-tooltip.bottom="'Delete this saved conversation'">
          <Icon name="Trash" :size="11" /> Delete chat
        </UiButton>
        <UiButton intent="ghost" size="small" @click="indexModalMode = 'build'" v-tooltip.bottom="'Embed any scenes added or edited since last build'">
          <Icon name="Refresh" :size="11" /> Update
        </UiButton>
        <UiButton intent="ghost" size="small" @click="indexModalMode = 'rebuild'" v-tooltip.bottom="'Wipe and re-embed everything'">
          <Icon name="Refresh" :size="11" /> Rebuild
        </UiButton>
      </div>
      <div v-else class="cp-status cp-status-bible">
        <Icon name="Sparkle" :size="11" />
        <span>Answering from your <b>story bible</b> only — build the index so chat can search and quote your scenes.</span>
        <span class="cp-status-spacer"></span>
        <UiButton v-if="hasThread" intent="ghost" size="small" @click="newChat" v-tooltip.bottom="'Clear and start fresh'">
          <Icon name="Plus" :size="11" /> New chat
        </UiButton>
        <UiButton v-if="hasThread" intent="ghost" size="small" @click="deleteChat" v-tooltip.bottom="'Delete this saved conversation'">
          <Icon name="Trash" :size="11" /> Delete chat
        </UiButton>
        <UiButton intent="secondary" size="small" @click="indexModalMode = 'build'" v-tooltip.bottom="'Embed your scenes so answers can quote the manuscript'">
          <Icon name="Sparkle" :size="11" /> Build index
        </UiButton>
      </div>

      <!-- Thread (user + assistant turns) — renders in BOTH modes -->
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
                    <!-- ONE label source: citationLabel(chunk) — the same string the
                         LLM saw before its excerpt (the old inline chapter template
                         was a drifted duplicate; converged, Move 1). -->
                    <li v-for="c in m.citations" :key="c.index" class="cp-cite" @click="openCitation(c)">
                      <span class="cp-cite-num">[{{ c.index }}]</span>
                      <span class="cp-cite-meta">{{ citationLabel(c.chunk) }}</span>
                      <span v-if="c.pinned" class="cp-cite-score" title="Pinned from the story bible">pinned</span>
                      <span v-else class="cp-cite-score">{{ (c.score * 100).toFixed(0) }}%</span>
                    </li>
                  </ol>
                </div>
              </template>
            </div>
          </template>
        </div>

        <!-- Question input (pinned to the bottom of the panel) -->
        <div class="cp-input-row">
          <UiTextarea
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
            <UiButton intent="primary" size="small" :disabled="!question.trim() || running"
              v-tooltip.bottom="question.trim() ? 'Send your question' : 'Type a question to ask'"
              @click="ask">
              <Icon name="Sparkle" :size="12" /> Ask
            </UiButton>
          </div>
        </div>

      <AiTaskStrip :task="myTask" />

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

.cp-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; flex-shrink: 0; flex-wrap: wrap; }
.cp-head > :first-child { flex: 1 1 auto; min-width: 0; }
.cp-head h2 {
  font-family: var(--font-serif); font-size: 18px; font-weight: 600; margin: 3px 0 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
/* Actions row sits next to the title when there's space, wraps onto its
   own line when the chip + Close button can't share the row with the
   ~120px headline. flex-wrap on .cp-head handles the layout flip. */
.cp-head-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; flex-wrap: wrap; }
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
/* The story-bible-only notice reuses the status strip's geometry with the
   accent tint — an upgrade offer, not an error. */
.cp-status-bible { background: var(--accent-soft); color: var(--accent-ink); }
.cp-status-bible b { color: var(--accent-ink); }
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
