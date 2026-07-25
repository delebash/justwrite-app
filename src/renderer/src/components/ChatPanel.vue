<script setup>
// Manuscript-RAG chat panel.
//
// Slide-in panel from the right. A project holds a flat LIST of chat sessions
// (the claude.ai / ChatGPT History pattern), persisted server-side
// (/v1/chat/sessions). "New chat" MINTS a new session — the previous
// conversation stays in History instead of being wiped (2026-07-20: fixes the
// destructive New-chat/Delete-chat defect where the combo's only thread was the
// only thread). Each user question is embedded, top-K scenes are retrieved, and
// the LLM streams an answer with citations.
//
// SESSIONS ARE STORAGE ONLY — they change nothing about per-request cost. The
// context a run sees is still the last 8 turns + retrieval (rag/chat.js
// MAX_HISTORY_MESSAGES); there is no "context management" layer here.
//
// NO-INDEX mode (2026-07-18): chat is never blocked — without an index the
// services answer from story-bible pins alone (zero embedding calls), and the
// status strip becomes the "story bible only" notice with the Build-index
// upgrade inline.

import { ref, computed, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useAiTasksStore, AiTaskStrip, HelpTrigger, Icon, UiButton, UiTextarea, UiSelect, confirmDialog, promptDialog, usePanelDismiss } from "@delebash/llm-ui";
import { useUiStore } from "../stores/ui.js";
import { askManuscript } from "../services/rag/chat.js";
import { askAsCharacter } from "../services/rag/characterChat.js";
import { citationLabel } from "../services/rag/excerpts.js";
import { indexStatus } from "../services/rag/indexer.js";
import { autoIndexRunning } from "../services/rag/autoIndex.js";
import {
  listSessions, fetchSession, putSession, deleteSession, mintSessionId, deriveSessionTitle,
} from "../services/chatApi.js";
import IndexBuildModal from "./IndexBuildModal.vue";
import AiFeatureChip from "./AiFeatureChip.vue";

// Cap persisted turns at the last 30 — long threads waste storage and the model
// already truncates history to MAX_HISTORY_MESSAGES. (Enforced server-side too.)
const MAX_PERSISTED = 30;

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

// The in-panel provider+model PICKER is gone (B5-1, §7.2). The header
// AiFeatureChip is a read-only "runs on" provenance chip.
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
// A session whose character was deleted is still viewable, but you can't add to
// it — the input is disabled with a hint and the character select shows its
// placeholder (the deleted id isn't in the options).
const orphanedCharacter = computed(
  () => chatMode.value === "character" && !!selectedCharacterId.value && !selectedCharacter.value,
);

// thread items:
//   { role: "user",      content }
//   { role: "assistant", content, citations: [...], pending?: bool, error?: string }
const thread = ref([]);
// The project's session list — light rows { id, mode, characterId, title,
// updatedAt, messageCount }, no messages. `currentSessionId` is null while an
// unsaved (empty) session is in the thread view; it is minted + persisted only
// once the first turn settles (empty sessions are never persisted).
const sessions = ref([]);
const currentSessionId = ref(null);
const view = ref("thread"); // "thread" | "history"
const indexModalMode = ref(null); // "build" | "rebuild" | null
const inputRef = ref(null);
const threadRef = ref(null);
const panelRef = ref(null);

const hasThread = computed(() => thread.value.length > 0);
const sortedSessions = computed(() =>
  [...sessions.value].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")),
);
const inputDisabled = computed(() => running.value || orphanedCharacter.value);

// ── Session list bookkeeping ───────────────────────────────────────────────
function upsertSessionRow(row) {
  const rest = sessions.value.filter((s) => s.id !== row.id);
  sessions.value = [row, ...rest];
}
function removeSessionRow(id) {
  sessions.value = sessions.value.filter((s) => s.id !== id);
}
function latestSessionForScope() {
  const mode = chatMode.value;
  const cid = mode === "character" ? (selectedCharacterId.value || "") : "";
  return sortedSessions.value.find((s) => s.mode === mode && (s.characterId || "") === cid) || null;
}
function scopeLabel(s) {
  if (s.mode !== "character") return "Book";
  const c = (project.characters || []).find((x) => x.id === s.characterId);
  return c ? c.name : "removed character";
}

// Relative time, Intl-based (matches the app's toLocale* formatting elsewhere):
// recent items read "3h ago", older ones fall back to an absolute date.
const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = then - Date.now(); // negative = past
  const abs = Math.abs(diff);
  const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  if (abs < MIN) return "just now";
  if (abs < HOUR) return RELATIVE.format(Math.round(diff / MIN), "minute");
  if (abs < DAY) return RELATIVE.format(Math.round(diff / HOUR), "hour");
  if (abs < 7 * DAY) return RELATIVE.format(Math.round(diff / DAY), "day");
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ── Async load guards ──────────────────────────────────────────────────────
// A monotonic token guards message hydration: the user can switch sessions /
// scopes faster than a fetch resolves, and a stale load must not clobber a
// newer one. `scopeSetByCode` suppresses the scope watcher while we set the
// dropdowns programmatically (opening a session from History), so it doesn't
// fight us by resuming the scope's LATEST session over the one we just opened.
let loadToken = 0;
let scopeSetByCode = false;

async function reloadSessions() {
  try {
    sessions.value = await listSessions(project.activeProjectId);
  } catch (err) {
    console.error("ChatPanel.reloadSessions failed:", err);
    sessions.value = [];
  }
}

async function loadSessionMessages(id) {
  const my = ++loadToken;
  try {
    const full = await fetchSession(id);
    if (my !== loadToken) return;
    thread.value = full.messages || [];
    currentSessionId.value = id;
  } catch (err) {
    console.error("ChatPanel.loadSessionMessages failed:", err);
    if (my === loadToken) { thread.value = []; currentSessionId.value = id; }
  }
}

// The messenger rule: switching scope loads the MOST RECENT session for it (or
// an empty unsaved thread if none) — preserving today's "reopen where you were".
function resumeLatestForScope() {
  const latest = latestSessionForScope();
  if (latest) { loadSessionMessages(latest.id); return; }
  ++loadToken; // cancel any in-flight load
  currentSessionId.value = null;
  thread.value = [];
}

async function openFromHistory(s) {
  scopeSetByCode = true;
  chatMode.value = s.mode;
  selectedCharacterId.value = s.characterId || null;
  await nextTick();
  scopeSetByCode = false;
  await loadSessionMessages(s.id);
  view.value = "thread";
  nextTick(() => inputRef.value?.focus());
}

// "New chat": start a FRESH unsaved session for the current scope. The previous
// conversation is already persisted and stays in History — nothing is wiped.
function newChat() {
  ++loadToken; // cancel any in-flight load
  currentSessionId.value = null;
  thread.value = [];
  question.value = "";
  view.value = "thread";
  nextTick(() => inputRef.value?.focus());
}

function toggleHistory() {
  view.value = view.value === "history" ? "thread" : "history";
}

async function renameSession(s) {
  const title = await promptDialog({
    title: "Rename chat",
    label: "Chat name",
    defaultValue: s.title,
    confirmLabel: "Rename",
  });
  if (title == null) return;
  const trimmed = title.trim();
  if (!trimmed || trimmed === s.title) return;
  // Meta-only PUT (no `messages`) — the stored turns stay put, updatedAt kept so
  // a rename doesn't reorder the list. A renamed title never auto-regenerates.
  putSession({
    id: s.id, projectId: project.activeProjectId, mode: s.mode,
    characterId: s.characterId || "", title: trimmed, updatedAt: s.updatedAt,
  });
  const idx = sessions.value.findIndex((x) => x.id === s.id);
  if (idx >= 0) sessions.value[idx] = { ...sessions.value[idx], title: trimmed };
}

async function deleteSessionRow(s) {
  const yes = await confirmDialog({
    title: "Delete this chat?",
    message: `Delete "${s.title || "this chat"}"? This can't be undone.`,
    confirmLabel: "Delete chat",
    danger: true,
  });
  if (!yes) return;
  deleteSession(s.id);
  removeSessionRow(s.id);
  if (currentSessionId.value === s.id) resumeLatestForScope();
}

// ── Boot + scope changes ───────────────────────────────────────────────────
async function initPanel() {
  await reloadSessions();
  resumeLatestForScope();
}
initPanel();

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});

// Pre-scoping: openChatPanelFor() stages a target on the ui store and opens the
// panel. Watching the target (not `open`) lands the switch even when the panel
// was already open. Setting the scope triggers the scope watcher below, which
// resumes that scope's latest session (today's "chat with X" behavior).
watch(() => ui.chatRequestedTarget, (target) => {
  if (!target) return;
  view.value = "thread";
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

// indexStatus() queries the server; `status` is a ref refreshed on the triggers
// that change the index rather than a recomputed local cache read.
const status = ref({ exists: false, entryCount: 0, model: "", dims: 0 });
async function refreshStatus() { status.value = await indexStatus(); }
const hasIndex = computed(() => status.value.exists && status.value.entryCount > 0);
const isIndexing = computed(() => autoIndexRunning.value);
watch(autoIndexRunning, (running) => { if (!running) refreshStatus(); });
refreshStatus();

// Switching project reloads its session list and resumes the current scope.
watch(() => project.activeProjectId, async () => {
  await reloadSessions();
  resumeLatestForScope();
  refreshStatus();
});

// Switching mode/character resumes the most recent session for the new scope —
// unless we set the dropdowns ourselves (opening a session from History).
watch([chatMode, selectedCharacterId], () => {
  if (scopeSetByCode) return;
  question.value = "";
  resumeLatestForScope();
});

// Auto-pick a default character on first switch into character mode so the
// writer doesn't have to fish through the dropdown. (A deleted-character id is
// truthy, so opening an orphaned session is left untouched.)
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
// Persistence is NOT here: we persist only when a turn settles (see ask).
watch(thread, () => {
  nextTick(() => {
    const el = threadRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}, { deep: true });

// Persist a settled turn under a CAPTURED session id + items array (race-proof):
// a mid-stream session switch reassigns thread.value but not `items`, so the
// turn lands on the right session. Empty sessions are never persisted.
function persistSettledTurn({ pid, sessionId, mode, cid, items }) {
  const messages = items.filter((m) => !m.pending).slice(-MAX_PERSISTED);
  if (!messages.length) return;
  const existing = sessions.value.find((s) => s.id === sessionId);
  const title = existing?.title || deriveSessionTitle(messages);
  const updatedAt = new Date().toISOString();
  putSession({ id: sessionId, projectId: pid, mode, characterId: cid || "", title, updatedAt, messages });
  upsertSessionRow({ id: sessionId, projectId: pid, mode, characterId: cid || "", title, updatedAt, messageCount: messages.length });
}

async function ask() {
  const q = question.value.trim();
  if (!q || running.value || orphanedCharacter.value) return;
  if (chatMode.value === "character" && !selectedCharacterId.value) {
    // Defensive: shouldn't happen (the dropdown auto-selects), but surface a
    // clear hint if it does rather than failing silently.
    thread.value.push({ role: "assistant", content: "", error: "Pick a character first.", pending: false });
    return;
  }

  // Identity captured now. The session id is minted here for an unsaved session
  // so the first settled turn can persist it (the captured-sessionId guard —
  // simpler + race-proof vs. the old pid/mode/cid guard).
  const pid = project.activeProjectId;
  const mode = chatMode.value;
  const cid = selectedCharacterId.value;
  const sessionId = currentSessionId.value || mintSessionId();
  if (!currentSessionId.value) currentSessionId.value = sessionId;
  const charName = (project.characters || []).find((c) => c.id === cid)?.name || "Character";

  // The array this turn is pushed into — captured so a mid-stream switch (which
  // reassigns thread.value) still persists THIS session's turns.
  const items = thread.value;
  const history = items
    .filter((m) => !m.pending && !m.error)
    .map((m) => ({ role: m.role, content: m.content }));

  items.push({ role: "user", content: q });
  items.push({ role: "assistant", content: "", citations: [], pending: true });
  // Mutate the turn through the array's REACTIVE proxy so the settle triggers a
  // re-render (raw-object writes bypass Vue's set trap — see the rag-probe note).
  const assistantMsg = items[items.length - 1];
  question.value = "";

  try {
    const askArgs = {
      question: q,
      history,
      k: 6,
      onDelta: (_delta, content) => { assistantMsg.content = content; },
      task: {
        label: mode === "character" ? `Character chat · ${charName}` : "Ask the book",
        meta: { mode, characterId: cid },
      },
    };
    const result = mode === "character"
      ? await askAsCharacter({ ...askArgs, characterId: cid })
      : await askManuscript(askArgs);
    assistantMsg.content   = result.answer || assistantMsg.content;
    assistantMsg.citations = result.citations || [];
    assistantMsg.pending   = false;
  } catch (e) {
    assistantMsg.pending = false;
    if (!isAbort(e)) assistantMsg.error = e?.message || String(e);
  } finally {
    persistSettledTurn({ pid, sessionId, mode, cid, items });
  }
}

function close() {
  ui.closeChatPanel();
}

// Esc + click-outside dismissal comes from the shared kit composable
// (usePanelDismiss). The mousedown-not-click reasoning and the toggle / portal
// exemptions live in the composable's own comments.
usePanelDismiss(open, panelRef, close);

function onIndexBuilt() {
  // Refresh status against the freshly written server index (the user dismisses
  // the modal with Done — see AppModal close timing).
  refreshStatus();
}

// A story-bible card citation navigates to the entity's own page; scene
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
        <!-- Help sits at the top-right corner, aligned with the title (user
             ruling 2026-07-21). The action row wraps to its own line below. -->
        <HelpTrigger slug="notes-and-search" label="Ask the book" />
        <div class="cp-head-actions">
          <AiFeatureChip v-if="chatMode === 'character'" feature="characterChat" label="Talk to character" editable />
          <AiFeatureChip v-else feature="chat" label="Ask the book" editable />
          <UiButton intent="info" size="small" :aria-pressed="view === 'history'"
            v-tooltip.bottom="'Chat history'" aria-label="Chat history" @click="toggleHistory">
            <template #icon><Icon name="History" :size="13" /></template>
            Chat history
          </UiButton>
          <UiButton intent="success" size="small"
            v-tooltip.bottom="'New chat'" aria-label="New chat" @click="newChat">
            <template #icon><Icon name="Plus" :size="13" /></template>
            New chat
          </UiButton>
          <UiButton intent="ghost" size="small"
            v-tooltip.bottom="'Close'" aria-label="Close" @click="close">
            <template #icon><Icon name="Close" :size="12" /></template>
          </UiButton>
        </div>
      </header>

      <!-- Mode + character picker. Switching either resumes that scope's most
           recent session (or an empty unsaved thread if none). -->
      <div class="cp-mode-row">
        <UiSelect v-model="chatMode" :options="MODE_OPTIONS" />
        <UiSelect v-if="chatMode === 'character'"
                  v-model="selectedCharacterId"
                  :options="characterOptions"
                  :placeholder="characterOptions.length ? 'Pick a character' : 'No characters yet'"
                  :disabled="!characterOptions.length" />
      </div>

      <!-- Index status strip (indexed) OR the story-bible-only notice (no index).
           New chat / Delete chat / History are header + per-row now — the strip
           is index-only again. -->
      <div v-if="hasIndex" class="cp-status">
        <Icon name="Check" :size="11" />
        <span><b>{{ status.entryCount }}</b> scenes indexed</span>
        <span class="cp-status-sep">·</span>
        <span class="cp-status-model"><code>{{ status.model || "?" }}</code></span>
        <span v-if="isIndexing" class="cp-indexing" v-tooltip.bottom="'Auto-rebuild is updating the index'">
          <span class="cp-indexing-dot"></span> indexing…
        </span>
        <span class="cp-status-spacer"></span>
        <UiButton intent="secondary" size="small" @click="indexModalMode = 'build'" v-tooltip.bottom="'Embed any scenes added or edited since last build'">
          <template #icon><Icon name="Refresh" :size="11" /></template>
          Update
        </UiButton>
        <UiButton intent="secondary" size="small" @click="indexModalMode = 'rebuild'" v-tooltip.bottom="'Wipe and re-embed everything'">
          <template #icon><Icon name="Refresh" :size="11" /></template>
          Rebuild
        </UiButton>
      </div>
      <div v-else class="cp-status cp-status-bible">
        <Icon name="Sparkle" :size="11" />
        <span>Answering from your <b>story bible</b> only — build the index so chat can search and quote your scenes.</span>
        <span class="cp-status-spacer"></span>
        <UiButton intent="primary" size="small" @click="indexModalMode = 'build'" v-tooltip.bottom="'Embed your scenes so answers can quote the manuscript'">
          <template #icon><Icon name="Sparkle" :size="11" /></template>
          Build index
        </UiButton>
      </div>

      <!-- HISTORY VIEW — replaces the thread + input area (the list↔conversation
           pattern; 440px is too narrow for a popover). -->
      <div v-if="view === 'history'" ref="threadRef" class="cp-history">
        <div v-if="!sortedSessions.length" class="cp-empty-hint">
          <Icon name="History" :size="14" />
          <span>No saved chats yet. Ask a question to start one — every conversation lands here.</span>
        </div>
        <ul v-else class="cp-hist-list">
          <li v-for="s in sortedSessions" :key="s.id"
            class="cp-hist-row" :class="{ current: s.id === currentSessionId }"
            :aria-current="s.id === currentSessionId ? 'true' : undefined"
            @click="openFromHistory(s)">
            <span class="cp-hist-badge" :class="{ char: s.mode === 'character' }">{{ scopeLabel(s) }}</span>
            <span class="cp-hist-title">{{ s.title || "Untitled chat" }}</span>
            <span class="cp-hist-time">{{ relativeTime(s.updatedAt) }}</span>
            <span class="cp-hist-actions">
              <UiButton intent="info" size="small" aria-label="Rename chat"
                v-tooltip.bottom="'Rename'" @click.stop="renameSession(s)">
                <template #icon><Icon name="Pencil" :size="12" /></template>
              </UiButton>
              <UiButton intent="danger" size="small" aria-label="Delete chat"
                v-tooltip.bottom="'Delete'" @click.stop="deleteSessionRow(s)">
                <template #icon><Icon name="Trash" :size="12" /></template>
              </UiButton>
            </span>
          </li>
        </ul>
      </div>

      <!-- THREAD VIEW (user + assistant turns) + input — renders in BOTH modes -->
      <template v-else>
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

        <!-- Orphaned-character notice (the session's character was deleted). -->
        <div v-if="orphanedCharacter" class="cp-orphan-hint">
          <Icon name="Alert" :size="13" /> This character was deleted — start a new chat.
        </div>

        <!-- Question input (pinned to the bottom of the panel) -->
        <div class="cp-input-row">
          <UiTextarea
            ref="inputRef"
            v-model="question"
            class="cp-textarea"
            :rows="2"
            :disabled="inputDisabled"
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
            <UiButton intent="primary" size="small" :disabled="!question.trim() || inputDisabled"
              v-tooltip.bottom="question.trim() ? 'Send your question' : 'Type a question to ask'"
              @click="ask">
              <template #icon><Icon name="Sparkle" :size="12" /></template>
              Ask
            </UiButton>
          </div>
        </div>
      </template>

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
/* Help rides the title row at the top-right corner (space-between pushes it to
   the far edge). The rest of the actions take their own full-width row under the
   title (the panel is only 440px — the chip + labelled History/New chat/Close
   don't fit beside a headline). `flex: 1 1 100%` bounds the row to the header
   width so the inner flex-wrap actually engages instead of overflowing the panel
   edge; the wide chip claims its own line and the labelled buttons wrap below it,
   right-aligned. */
.cp-head-actions {
  display: flex; align-items: center; gap: 6px;
  flex: 1 1 100%; min-width: 0; flex-wrap: wrap; justify-content: flex-end;
}
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

/* Thread — scrollable area between the status strip and the input row. */
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

/* History list — session rows (badge · title · time · rename · delete). */
.cp-history {
  flex: 1 1 auto; min-height: 0; overflow-y: auto;
  padding: 4px 2px 8px;
}
.cp-hist-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.cp-hist-row {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
}
.cp-hist-row:hover { background: var(--surface-2); border-color: var(--border-soft); }
.cp-hist-row.current { background: var(--accent-soft); border-color: var(--accent-line); }
.cp-hist-badge {
  flex: none;
  font-family: var(--font-mono); font-size: 9.5px; font-weight: 600;
  letter-spacing: .03em; text-transform: uppercase;
  padding: 2px 6px; border-radius: 5px;
  background: var(--surface-3); color: var(--ink-2);
  max-width: 108px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cp-hist-badge.char { background: var(--accent-soft); color: var(--accent-ink); }
.cp-hist-title {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 13px; color: var(--ink);
}
.cp-hist-time { flex: none; font-size: 10.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
.cp-hist-actions { display: inline-flex; align-items: center; gap: 2px; flex: none; }

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

.cp-orphan-hint {
  display: flex; gap: 8px; align-items: center;
  padding: 8px 12px; border-radius: 6px; flex-shrink: 0;
  background: var(--surface-2); color: var(--muted);
  font-size: 12px;
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
