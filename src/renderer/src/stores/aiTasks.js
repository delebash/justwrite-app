// Global registry for in-flight AI chat-stream calls.
//
// Hoisting task state into a store (rather than each call site owning
// its own AbortController + refs) is what lets a call survive the
// component that started it. A view can unmount mid-stream and the
// task keeps running; results land in whatever Pinia store the caller
// writes to (project, studio, etc.) regardless of mounted state.
//
// The header AI status button + slide-in panel observe this store to
// show every in-flight call from anywhere in the app, with cancel.
//
// Status phases:
//   "connecting" — task started, no token yet (network in flight, model loading)
//   "streaming"  — first delta has arrived; tokens flowing
//   "done"       — completed successfully; archived to history
//   "cancelled"  — aborted by user; archived to history
//   "error"      — threw; archived to history with .error
//
// Stalled detection (UI concern, not stored): a streaming task whose
// lastDeltaAt is more than ~5s in the past looks stalled; >30s likely
// stuck. The store exposes `now` (live-ticked) so a computed in any
// view can derive the freshness signal without each view spinning its
// own setInterval.

import { defineStore } from "pinia";
import { markRaw } from "vue";
import { pushToast } from "@delebash/llm-ui";

const HISTORY_LIMIT = 30;

let nextId = 1;
let tickHandle = null;

export const useAiTasksStore = defineStore("aiTasks", {
  state: () => ({
    // tasks: { [id]: AiTask }. AiTask shape:
    //   { id, feature, label, meta, status, startedAt, firstDeltaAt,
    //     lastDeltaAt, finishedAt, tokensIn, tokensOut, chars, preview,
    //     providerId, model, error, _controller }
    tasks: {},
    // Insertion order of currently-running task ids. Drives the panel list.
    order: [],
    // Finished task summaries (most recent first). Capped at HISTORY_LIMIT.
    history: [],
    // Live-ticked clock for elapsed / stall computed properties.
    now: Date.now(),
    // Status panel open state.
    panelOpen: false,
  }),

  getters: {
    runningTasks: (s) => s.order.map((id) => s.tasks[id]).filter(Boolean),
    runningCount() { return this.runningTasks.length; },
    taskById: (s) => (id) => s.tasks[id] || null,
    // True while the named task id is still running. Lets a view show
    // "task is in flight" UI without holding a local ref.
    isRunning: (s) => (id) => {
      const t = s.tasks[id];
      return !!t && (t.status === "connecting" || t.status === "streaming");
    },
  },

  actions: {
    _ensureTicker() {
      if (tickHandle) return;
      tickHandle = setInterval(() => { this.now = Date.now(); }, 500);
    },
    _maybeStopTicker() {
      if (!this.order.length && tickHandle) {
        clearInterval(tickHandle);
        tickHandle = null;
      }
    },

    // Begin a new task. Returns a handle the caller threads into the
    // underlying chat stream: { id, signal, onDelta, markStreaming,
    // finish, fail, cancel }.
    start({ feature, label, meta }) {
      const id = `aitask-${nextId++}`;
      const now = Date.now();
      const controller = new AbortController();
      this.tasks[id] = {
        id,
        feature: feature || "ai",
        label: label || feature || "AI call",
        meta: meta || {},
        status: "connecting",
        startedAt: now,
        firstDeltaAt: 0,
        lastDeltaAt: 0,
        finishedAt: 0,
        tokensIn: 0,
        tokensOut: 0,
        chars: 0,
        preview: "",
        providerId: null,
        model: null,
        error: null,
        // The controller is non-reactive — Vue tracking on it is wasted
        // work and complicates devtools introspection.
        _controller: markRaw(controller),
      };
      this.order.push(id);
      this.now = now;
      this._ensureTicker();
      return {
        id,
        signal: controller.signal,
        onDelta: (delta, content) => this._recordDelta(id, delta, content),
        markStreaming: () => this._markStreaming(id),
        finish: (result) => this._finish(id, result),
        fail: (err) => this._fail(id, err),
        cancel: () => this.cancel(id),
      };
    },

    _markStreaming(id) {
      const t = this.tasks[id];
      if (t && t.status === "connecting") t.status = "streaming";
    },

    _recordDelta(id, delta, content) {
      const t = this.tasks[id];
      if (!t) return;
      const now = Date.now();
      if (!t.firstDeltaAt) t.firstDeltaAt = now;
      t.lastDeltaAt = now;
      if (t.status === "connecting") t.status = "streaming";
      if (typeof content === "string") {
        t.preview = content;
        t.chars = content.length;
      } else if (typeof delta === "string") {
        t.preview = (t.preview || "") + delta;
        t.chars = t.preview.length;
      }
    },

    _finish(id, result) {
      const t = this.tasks[id];
      if (!t) return;
      const now = Date.now();
      t.status = "done";
      t.finishedAt = now;
      if (result?.usage) {
        t.tokensIn = result.usage.promptTokens || t.tokensIn;
        t.tokensOut = result.usage.completionTokens || t.tokensOut;
      }
      if (result?.providerId) t.providerId = result.providerId;
      if (result?.model) t.model = result.model;
      this._archiveAndRemove(id);
      const seconds = ((t.finishedAt - t.startedAt) / 1000).toFixed(1);
      // Tokens are the single best size/cost signal. Local providers
      // sometimes omit usage on the final chunk; falling back to a
      // chars-÷-4 estimate would read as exact in the toast, so we
      // suppress it entirely when we don't have a real count.
      const tokensStr = t.tokensOut ? ` · ${t.tokensOut.toLocaleString()} tokens` : "";
      const open = () => this.openPanel();
      pushToast({
        message: `${t.label} — done in ${seconds}s${tokensStr}`,
        action: { label: "View", fn: open },
      });
    },

    _fail(id, err) {
      const t = this.tasks[id];
      if (!t) return;
      const now = Date.now();
      t.status = "error";
      t.error = err?.message || String(err || "Unknown error");
      t.finishedAt = now;
      this._archiveAndRemove(id);
      const open = () => this.openPanel();
      pushToast({
        message: `${t.label} — failed: ${t.error}`,
        action: { label: "View", fn: open },
      });
    },

    cancel(id) {
      const t = this.tasks[id];
      if (!t) return;
      if (t.status !== "connecting" && t.status !== "streaming") return;
      try { t._controller?.abort?.(); } catch {}
      t.status = "cancelled";
      t.finishedAt = Date.now();
      this._archiveAndRemove(id);
      // No toast — the user just clicked Cancel, telling them so again
      // is noise. The history entry in the panel records it.
    },

    cancelAll() {
      // Snapshot ids — cancel mutates this.order.
      const ids = [...this.order];
      for (const id of ids) this.cancel(id);
    },

    _archiveAndRemove(id) {
      const t = this.tasks[id];
      if (!t) return;
      this.history.unshift({
        id: t.id,
        feature: t.feature,
        label: t.label,
        status: t.status,
        startedAt: t.startedAt,
        finishedAt: t.finishedAt,
        durationMs: Math.max(0, t.finishedAt - t.startedAt),
        tokensIn: t.tokensIn,
        tokensOut: t.tokensOut,
        providerId: t.providerId,
        model: t.model,
        error: t.error,
      });
      if (this.history.length > HISTORY_LIMIT) {
        this.history.length = HISTORY_LIMIT;
      }
      delete this.tasks[id];
      this.order = this.order.filter((x) => x !== id);
      this._maybeStopTicker();
    },

    dismissHistory(historyId) {
      this.history = this.history.filter((h) => h.id !== historyId);
    },
    clearHistory() { this.history = []; },

    openPanel()   { this.panelOpen = true; },
    closePanel()  { this.panelOpen = false; },
    togglePanel() { this.panelOpen = !this.panelOpen; },
  },
});
