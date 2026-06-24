<script setup>
// Right-side slide-in panel showing all in-flight AI tasks + recent history.
//
// Per running task: feature/label, status phase (connecting / streaming /
// stalled), elapsed, first-token latency, tokens-per-second, tokens out,
// last-token delay (the "stuck vs. processing" signal), an expandable
// streaming preview, and a cancel button.
//
// Recent history shows the last 30 finished tasks with duration, tokens,
// and outcome (done / cancelled / errored).
//
// The store ticks `now` every 500ms so every elapsed / freshness number
// stays live without each row registering its own setInterval.

import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useAiTasksStore } from "../stores/aiTasks.js";
import { Icon } from "@delebash/llm-ui";
import { UiButton } from "@delebash/llm-ui";

const tasks = useAiTasksStore();
const openPreviews = ref(new Set());

// Click-outside dismissal. Exemptions:
//   - inside the panel itself
//   - any [data-ai-status-toggle] element (header chip, in-modal Details
//     buttons — anywhere a click is meant to open the panel)
//   - any teleported dialog/listbox surfaces (Reka popovers)
//   - sonner toasts (the View action on a completion toast calls
//     openPanel; without this the click would bubble here and close
//     the panel it just opened)
function onDocClick(e) {
  if (!tasks.panelOpen) return;
  const target = e.target;
  if (!target) return;
  if (target.closest?.(".aip")) return;
  if (target.closest?.("[data-ai-status-toggle]")) return;
  if (target.closest?.('[role="dialog"], [role="listbox"]')) return;
  if (target.closest?.("[data-sonner-toast], [data-sonner-toaster]")) return;
  tasks.closePanel();
}
function onDocKeydown(e) {
  if (e.key === "Escape" && tasks.panelOpen) {
    e.stopPropagation();
    tasks.closePanel();
  }
}
onMounted(() => {
  document.addEventListener("click", onDocClick);
  document.addEventListener("keydown", onDocKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener("click", onDocClick);
  document.removeEventListener("keydown", onDocKeydown);
});

function togglePreview(id) {
  const next = new Set(openPreviews.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  openPreviews.value = next;
}

function fmtSeconds(ms) {
  if (!ms || ms < 0) return "0.0s";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function fmtAgo(ts, now) {
  if (!ts) return "—";
  const m = Math.floor((now - ts) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Live values driven by tasks.now (the 500ms ticker).
function elapsedMs(task) {
  return Math.max(0, tasks.now - task.startedAt);
}
function lastDeltaAgoMs(task) {
  if (!task.lastDeltaAt) return null;
  return Math.max(0, tasks.now - task.lastDeltaAt);
}
function firstTokenMs(task) {
  if (!task.firstDeltaAt) return null;
  return task.firstDeltaAt - task.startedAt;
}
// Tokens-per-second since first delta. Uses chars/4 as a proxy when
// the real token count hasn't landed yet (usage arrives on the final chunk).
function tokensPerSecond(task) {
  const first = task.firstDeltaAt;
  if (!first) return null;
  const liveSpanMs = Math.max(1, tasks.now - first);
  const tokens = task.tokensOut || Math.max(0, Math.round(task.chars / 4));
  if (!tokens) return null;
  return (tokens / (liveSpanMs / 1000)).toFixed(1);
}
// Freshness class for the last-token indicator.
// fresh < 3s · stalling 3-10s · stuck > 10s.
function freshness(task) {
  if (task.status !== "streaming") return null;
  const ago = lastDeltaAgoMs(task);
  if (ago == null) return null;
  if (ago < 3000) return "fresh";
  if (ago < 10000) return "stalling";
  return "stuck";
}

const phaseLabel = {
  connecting: "Connecting",
  streaming:  "Streaming",
};
</script>

<template>
  <!-- Teleport to body so the panel escapes .app-stage's stacking context
       (created by its `position: fixed`). Without this, an AppModal — which
       Reka portals to body — paints above the entire app-stage subtree
       regardless of the panel's local z-index, leaving the panel blurred
       under the modal's backdrop-filter. With Teleport, both the panel
       and the modal-overlay live as siblings of body and stack by their
       own z-index values. -->
  <Teleport to="body">
    <transition name="aip-slide">
      <aside v-if="tasks.panelOpen" class="aip" role="dialog" aria-label="AI tasks">
      <header class="aip-head">
        <div>
          <div class="t-eyebrow">Status</div>
          <h2>AI tasks</h2>
        </div>
        <UiButton intent="ghost" size="small" @click="tasks.closePanel()">
          <Icon name="Close" :size="12" /> Close
        </UiButton>
      </header>

      <!-- Running tasks ────────────────────────────────────────────── -->
      <section class="aip-section">
        <div class="aip-section-h">
          <span>Running</span>
          <span class="aip-section-count">{{ tasks.runningCount }}</span>
          <span class="aip-section-spacer" />
          <UiButton v-if="tasks.runningCount > 1" intent="ghost" size="small" @click="tasks.cancelAll()">
            <Icon name="Close" :size="11" /> Cancel all
          </UiButton>
        </div>

        <div v-if="!tasks.runningCount" class="aip-empty">
          Nothing running. Start a critique, smart-cast, or any AI feature and you'll see it here with live status.
        </div>

        <div v-for="t in tasks.runningTasks" :key="t.id" class="aip-task">
          <div class="aip-task-h">
            <span class="aip-task-label">{{ t.label }}</span>
            <span class="aip-task-feature">{{ t.feature }}</span>
            <span class="aip-task-spacer" />
            <UiButton intent="danger" size="small" @click="tasks.cancel(t.id)">
              <template #icon><Icon name="Close" :size="11" /></template>
              Cancel
            </UiButton>
          </div>

          <div class="aip-task-stats">
            <span class="aip-stat" :data-phase="t.status">
              <span class="aip-stat-dot" />
              {{ phaseLabel[t.status] || t.status }}
            </span>
            <span class="aip-stat">
              <Icon name="Clock" :size="10" />
              {{ fmtSeconds(elapsedMs(t)) }}
            </span>
            <span v-if="firstTokenMs(t) != null" class="aip-stat" v-tooltip.bottom="'Latency from request to first streamed token'">
              first {{ (firstTokenMs(t) / 1000).toFixed(1) }}s
            </span>
            <span v-if="t.tokensOut || t.chars" class="aip-stat" v-tooltip.bottom="t.tokensOut ? 'Exact output tokens (from the model)' : 'Approximate from streamed characters (~4 chars/token)'">
              <template v-if="t.tokensOut">{{ t.tokensOut }} tok</template>
              <template v-else>~{{ Math.round(t.chars / 4) }} tok</template>
            </span>
            <span v-if="tokensPerSecond(t)" class="aip-stat">
              {{ tokensPerSecond(t) }} tok/s
            </span>
            <span v-if="freshness(t)" class="aip-stat" :data-fresh="freshness(t)" v-tooltip.bottom="freshness(t) === 'stuck' ? 'No tokens received in 10+ seconds — likely stuck' : freshness(t) === 'stalling' ? 'No tokens in the last few seconds' : 'Streaming live'">
              <span class="aip-stat-dot" />
              <template v-if="freshness(t) === 'fresh'">live</template>
              <template v-else-if="freshness(t) === 'stalling'">stalling · {{ fmtSeconds(lastDeltaAgoMs(t)) }}</template>
              <template v-else>stuck · {{ fmtSeconds(lastDeltaAgoMs(t)) }}</template>
            </span>
          </div>

          <div v-if="t.preview" class="aip-task-preview-row">
            <UiButton intent="ghost" size="small" @click="togglePreview(t.id)">
              <Icon :name="openPreviews.has(t.id) ? 'ChevDown' : 'ChevRight'" :size="11" />
              {{ openPreviews.has(t.id) ? "Hide preview" : "Show preview" }}
              <span class="t-muted" style="font-size:10.5px;margin-left:4px">· {{ t.chars }} chars</span>
            </UiButton>
            <div v-if="openPreviews.has(t.id)" class="aip-preview">
              <pre>{{ t.preview }}</pre>
            </div>
          </div>

          <div v-if="t.providerId || t.model" class="aip-task-foot">
            <code v-if="t.model">{{ t.model }}</code>
          </div>
        </div>
      </section>

      <!-- Recent history ──────────────────────────────────────────── -->
      <section class="aip-section">
        <div class="aip-section-h">
          <span>Recent</span>
          <span class="aip-section-count">{{ tasks.history.length }}</span>
          <span class="aip-section-spacer" />
          <UiButton v-if="tasks.history.length" intent="ghost" size="small" @click="tasks.clearHistory()">
            <Icon name="Trash" :size="11" /> Clear
          </UiButton>
        </div>

        <div v-if="!tasks.history.length" class="aip-empty aip-empty-small">
          No completed tasks yet.
        </div>

        <div v-for="h in tasks.history" :key="h.id" class="aip-hist-row" :data-status="h.status">
          <div class="aip-hist-icon">
            <Icon v-if="h.status === 'done'" name="Check" :size="11" />
            <Icon v-else-if="h.status === 'cancelled'" name="Close" :size="11" />
            <Icon v-else name="Alert" :size="11" />
          </div>
          <div class="aip-hist-body">
            <div class="aip-hist-line">
              <span class="aip-hist-label">{{ h.label }}</span>
              <span class="aip-hist-ago">{{ fmtAgo(h.finishedAt, tasks.now) }}</span>
            </div>
            <div class="aip-hist-meta">
              <span>{{ fmtSeconds(h.durationMs) }}</span>
              <span v-if="h.tokensOut">· {{ h.tokensOut }} tok out</span>
              <span v-if="h.model">· <code>{{ h.model }}</code></span>
            </div>
            <div v-if="h.error" class="aip-hist-error">{{ h.error }}</div>
          </div>
        </div>
      </section>
      </aside>
    </transition>
  </Teleport>
</template>

<style scoped>
.aip {
  /* z-index sits above .modal-overlay (100) so opening the panel from
     inside a modal (the Details button in any in-modal AiTaskStrip)
     floats it above the modal's backdrop blur, not behind it.

     `pointer-events: auto` is required: when an AppModal is open,
     Reka's DismissableLayer sets `body { pointer-events: none }` to
     enforce modality and only re-enables it on the dialog content.
     The Teleported panel is also in body and inherits `none` — without
     this override, clicks pass through to whatever's behind. */
  position: fixed; top: 56px; right: 16px; bottom: 32px; z-index: 120;
  pointer-events: auto;
  width: min(420px, calc(100vw - 32px));
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-window);
  display: flex; flex-direction: column;
  padding: 16px 18px 4px;
  gap: 12px;
  overflow: hidden;
}
.aip-slide-enter-active, .aip-slide-leave-active {
  transition: transform .22s cubic-bezier(.4, .0, .2, 1), opacity .22s;
}
.aip-slide-enter-from, .aip-slide-leave-to {
  transform: translateX(110%); opacity: 0;
}

.aip-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; flex-shrink: 0; }
.aip-head h2 { font-family: var(--font-serif); font-size: 18px; font-weight: 600; margin: 3px 0 0; }

.aip-section { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
.aip-section + .aip-section {
  border-top: 1px solid var(--border-soft);
  padding-top: 12px;
  margin-top: 4px;
}
.aip-section-h {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--font-mono);
  font-size: 10px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--muted);
  font-weight: 600;
}
.aip-section-count {
  font-variant-numeric: tabular-nums;
  color: var(--ink-2);
  font-weight: 500;
}
.aip-section-spacer { flex: 1; }
.aip-empty {
  font-size: 12.5px; color: var(--muted); font-style: italic;
  padding: 12px 14px;
  background: var(--surface-2);
  border-radius: 8px;
}
.aip-empty.aip-empty-small { padding: 8px 12px; font-size: 11.5px; }

/* Running task card */
.aip-task {
  display: flex; flex-direction: column; gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--accent-line);
  border-radius: 9px;
  background: var(--accent-soft);
}
.aip-task-h { display: flex; align-items: center; gap: 8px; }
.aip-task-label { font-weight: 600; font-size: 13px; color: var(--accent-ink); }
.aip-task-feature {
  font-family: var(--font-mono); font-size: 10px;
  color: var(--muted); letter-spacing: 0.05em;
}
.aip-task-spacer { flex: 1; }

.aip-task-stats {
  display: flex; flex-wrap: wrap; gap: 6px 10px;
  font-family: var(--font-mono); font-size: 10.5px;
  color: var(--accent-ink); opacity: 0.92;
  font-variant-numeric: tabular-nums;
}
.aip-stat { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.aip-stat-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--muted);
}
.aip-stat[data-phase="connecting"] .aip-stat-dot { background: var(--info-ink, #2563eb); animation: aip-blink 1.2s ease-in-out infinite; }
.aip-stat[data-phase="streaming"]  .aip-stat-dot { background: var(--success-ink, #15803d); }
.aip-stat[data-fresh="fresh"]      .aip-stat-dot { background: var(--success-ink, #15803d); }
.aip-stat[data-fresh="stalling"]   .aip-stat-dot { background: var(--gold, #d97706); animation: aip-blink 1.2s ease-in-out infinite; }
.aip-stat[data-fresh="stuck"]      .aip-stat-dot { background: var(--danger-ink, #b91c1c); animation: aip-blink 1.2s ease-in-out infinite; }
.aip-stat[data-fresh="stalling"]   { color: var(--gold, #d97706); }
.aip-stat[data-fresh="stuck"]      { color: var(--danger-ink, #b91c1c); }
@keyframes aip-blink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.35; }
}

.aip-task-preview-row { display: flex; flex-direction: column; gap: 6px; }
.aip-preview {
  background: var(--surface);
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  max-height: 180px;
  overflow: auto;
  padding: 8px 10px;
}
.aip-preview pre {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 12px; line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--ink-2);
}

.aip-task-foot {
  font-family: var(--font-mono); font-size: 9.5px;
  color: var(--muted); letter-spacing: 0.05em;
}
.aip-task-foot code {
  font-family: var(--font-mono); font-size: 9.5px;
  background: transparent;
  color: var(--muted);
}

/* History row */
.aip-hist-row {
  display: grid; grid-template-columns: 20px 1fr;
  gap: 8px;
  padding: 6px 4px;
  border-bottom: 1px solid var(--border-soft);
}
.aip-hist-row:last-child { border-bottom: 0; }
.aip-hist-icon {
  display: grid; place-items: center;
  width: 20px; height: 20px;
  border-radius: 50%;
  color: var(--surface);
  flex-shrink: 0;
  margin-top: 1px;
}
.aip-hist-row[data-status="done"]      .aip-hist-icon { background: var(--success-ink, #15803d); }
.aip-hist-row[data-status="cancelled"] .aip-hist-icon { background: var(--muted); }
.aip-hist-row[data-status="error"]     .aip-hist-icon { background: var(--danger-ink, #b91c1c); }
.aip-hist-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.aip-hist-line { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
.aip-hist-label { font-size: 12.5px; font-weight: 500; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.aip-hist-ago {
  font-family: var(--font-mono); font-size: 10px;
  color: var(--muted); white-space: nowrap;
}
.aip-hist-meta {
  font-family: var(--font-mono); font-size: 10px;
  color: var(--muted); font-variant-numeric: tabular-nums;
  display: flex; gap: 4px; flex-wrap: wrap;
}
.aip-hist-meta code { font-family: var(--font-mono); color: var(--muted); background: transparent; }
.aip-hist-error { font-size: 11px; color: var(--danger-ink, #b91c1c); margin-top: 2px; }
</style>
