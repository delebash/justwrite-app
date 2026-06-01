// Shared progress tracker for AI calls.
//
// Wraps the common bookkeeping every AI call site needs:
//   - elapsed-time ticker (live, updates each 250ms)
//   - AbortController for cancel
//   - delta-text accumulation (optional, drives streaming previews)
//   - char counter (until real token count lands on the final chunk)
//   - first-token latency (ms from start to first delta)
//   - tokens in / out from the final usage payload
//
// Usage:
//   const p = useAiProgress();
//   p.start();
//   await someService({ signal: p.signal, onDelta: p.onDelta });
//   p.finish();                  // success path
//   // or p.cancel() to abort.

import { ref, computed, onBeforeUnmount } from "vue";

export function useAiProgress() {
  const running = ref(false);
  const startedAt = ref(0);
  const finishedAt = ref(0);
  const firstDeltaAt = ref(0);
  const elapsed = ref(0);          // ms — live while running, frozen on finish/cancel
  const chars = ref(0);
  const tokensIn = ref(0);
  const tokensOut = ref(0);
  const preview = ref("");         // accumulated assistant content (when delta is recorded)
  const cancelled = ref(false);
  let controller = null;
  let tickHandle = null;

  function tick() {
    if (!running.value) return;
    elapsed.value = Date.now() - startedAt.value;
  }

  function clearTimer() {
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
  }

  function start() {
    running.value = true;
    cancelled.value = false;
    startedAt.value = Date.now();
    finishedAt.value = 0;
    firstDeltaAt.value = 0;
    elapsed.value = 0;
    chars.value = 0;
    tokensIn.value = 0;
    tokensOut.value = 0;
    preview.value = "";
    controller = new AbortController();
    clearTimer();
    tickHandle = setInterval(tick, 250);
  }

  // Hand this to any service that takes an onDelta callback. Captures
  // the first-token latency, accumulates the preview text, and bumps
  // the char counter — used as a "tokens received so far" proxy until
  // the real usage payload arrives at the end.
  function onDelta(delta, content) {
    if (!running.value) return;
    if (!firstDeltaAt.value) firstDeltaAt.value = Date.now();
    if (typeof content === "string") {
      preview.value = content;
      chars.value = content.length;
    } else if (typeof delta === "string") {
      preview.value += delta;
      chars.value = preview.value.length;
    }
  }

  // Optional — services that surface usage mid-stream can push it in.
  // Most call sites set this once on the final chunk via recordCall().
  function onUsage(usage) {
    if (!usage) return;
    tokensIn.value  = usage.prompt_tokens     || tokensIn.value;
    tokensOut.value = usage.completion_tokens || tokensOut.value;
  }

  function finish(usage) {
    if (usage) onUsage(usage);
    running.value = false;
    finishedAt.value = Date.now();
    elapsed.value = finishedAt.value - startedAt.value;
    clearTimer();
  }

  function cancel() {
    if (!running.value) return;
    cancelled.value = true;
    try { controller?.abort(); } catch {}
    running.value = false;
    finishedAt.value = Date.now();
    elapsed.value = finishedAt.value - startedAt.value;
    clearTimer();
  }

  function reset() {
    if (running.value) cancel();
    startedAt.value = 0;
    finishedAt.value = 0;
    firstDeltaAt.value = 0;
    elapsed.value = 0;
    chars.value = 0;
    tokensIn.value = 0;
    tokensOut.value = 0;
    preview.value = "";
    cancelled.value = false;
  }

  // Make sure we don't leak a timer if the parent unmounts mid-call.
  onBeforeUnmount(() => clearTimer());

  // Derived display values — keep formatting in one place so every
  // progress UI shows the same thing.
  const elapsedSeconds = computed(() => (elapsed.value / 1000).toFixed(1));
  const firstTokenMs = computed(() => firstDeltaAt.value ? firstDeltaAt.value - startedAt.value : 0);
  // Char-count when usage hasn't landed yet, real token count otherwise.
  // ~4 chars per token is a reasonable English estimate; we surface the
  // approximation as such so the user sees "~120 tokens" until the real
  // figure arrives.
  const tokensApprox = computed(() => {
    if (tokensOut.value) return { value: tokensOut.value, exact: true };
    return { value: Math.max(0, Math.round(chars.value / 4)), exact: false };
  });

  // The signal a service should pass into its fetch / chatStream.
  const signal = computed(() => controller?.signal || null);

  return {
    // state
    running,
    cancelled,
    elapsed,
    elapsedSeconds,
    firstTokenMs,
    chars,
    tokensIn,
    tokensOut,
    tokensApprox,
    preview,
    // controls
    start,
    onDelta,
    onUsage,
    finish,
    cancel,
    reset,
    // hand to services
    get signal() { return controller?.signal || null; },
  };
}
