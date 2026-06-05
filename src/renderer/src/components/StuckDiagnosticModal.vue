<script setup>
// Stuck-on-this-chapter diagnostic modal — the "I'm blocked" menu.
//
// On open, sends the prose tail to generateUnstuckMoves() and shows the
// five returned moves as cards. Each card has a "Use this" button that
// closes the modal and runs runGuidedContinue on the editor with that
// move's instruction prepended. Regenerate asks for a fresh five.

import { ref, computed, onMounted } from "vue";
import { useAiStore } from "../stores/ai.js";
import { useAiTasksStore } from "../stores/aiTasks.js";
import {
  generateUnstuckMoves,
  MOVE_KIND_BLURBS,
  MOVE_KIND_LABELS,
} from "../services/stuckDiagnostic.js";
import Icon from "./Icon.vue";
import AiTaskStrip from "./AiTaskStrip.vue";
import AppModal from "./AppModal.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";

const props = defineProps({
  // Plain-text prose tail leading up to the writer's cursor.
  contextText: { type: String, required: true },
  // Chapter context for the prompt header (cosmetic).
  chapterTitle: { type: String, default: "" },
  chapterNum: { type: [Number, null], default: null },
});
const emit = defineEmits(["close", "useMove"]);

const ai = useAiStore();
const aiTasks = useAiTasksStore();
const moves = ref([]);
const error = ref("");

const myTask = computed(() => aiTasks.runningTasks.find((t) => t.feature === "unstuck"));
const running = computed(() => !!myTask.value);

function isAbort(e) { return e?.name === "AbortError" || /abort/i.test(e?.message || ""); }

async function run() {
  error.value = "";
  if (!ai.providerForFeature("unstuck")) {
    error.value = "Configure an AI provider in Settings → AI to generate Unstuck moves.";
    return;
  }
  moves.value = [];
  try {
    const result = await generateUnstuckMoves({
      contextText: props.contextText,
      chapterTitle: props.chapterTitle,
      chapterNum: props.chapterNum,
      task: { label: "Unstuck moves", meta: {} },
    });
    moves.value = result.moves;
    if (!moves.value.length) {
      error.value = "The model didn't return any usable moves. Try regenerating.";
    }
  } catch (e) {
    if (!isAbort(e)) {
      const msg = String(e?.message || e || "");
      error.value = /provider|api key|configure/i.test(msg)
        ? "Configure an AI provider in Settings → AI to generate Unstuck moves."
        : msg || "Couldn't generate moves.";
    }
  }
}

function useMove(move) {
  emit("useMove", move);
}

onMounted(run);
</script>

<template>
  <AppModal
    eyebrow="Stuck?"
    title="Five ways to unblock this scene"
    :closable="!running"
    @close="emit('close')"
  >
    <p class="su-blurb">
      Five distinct moves the scene could take from here. Each one belongs to a different category so
      you get a real menu, not five variations of the same idea. Pick one and JustWrite drafts the
      next 2–4 paragraphs in that direction.
    </p>

    <div v-if="error" class="su-error">
      <Icon name="Alert" :size="13" /> {{ error }}
      <JwButton intent="ghost" size="small" @click="run">
        <Icon name="Refresh" :size="12" /> Retry
      </JwButton>
    </div>

    <AiTaskStrip v-if="running" :task="myTask" />

    <ul v-else-if="moves.length" class="su-moves">
      <li v-for="m in moves" :key="m.id" class="su-move" :data-kind="m.kind">
        <div class="su-move-head">
          <span class="su-kind">{{ MOVE_KIND_LABELS[m.kind] }}</span>
          <span class="su-kind-blurb">{{ MOVE_KIND_BLURBS[m.kind] }}</span>
        </div>
        <h4 class="su-move-label">{{ m.label }}</h4>
        <p class="su-move-instr">{{ m.instruction }}</p>
        <div class="su-move-actions">
          <JwButton intent="primary" size="small" @click="useMove(m)">
            <Icon name="Play" :size="12" /> Write this
          </JwButton>
        </div>
      </li>
    </ul>

    <template #footer>
      <JwButton intent="ghost"
                :disabled="running"
                @click="run">
        <Icon name="Refresh" :size="12" /> Regenerate
      </JwButton>
      <span class="su-foot-spacer" />
      <JwButton intent="ghost" @click="emit('close')">Close</JwButton>
    </template>
  </AppModal>
</template>

<style scoped>
.su-blurb {
  margin: 0 0 16px; max-width: 76ch;
  font-size: 12.5px; line-height: 1.55; color: var(--muted);
}

.su-error {
  display: flex; gap: 10px; align-items: center;
  padding: 10px 14px; border-radius: 6px;
  background: color-mix(in oklab, var(--danger-ink, #b91c1c) 12%, transparent);
  color: var(--danger-ink, #b91c1c);
  font-size: 12.5px;
}

.su-loading {
  display: flex; align-items: center; gap: 12px;
  font-size: 13px; color: var(--muted); font-style: italic;
  min-height: 80px;
}
.su-spinner {
  display: inline-block; width: 14px; height: 14px;
  border: 2px solid var(--surface-3); border-top-color: var(--accent);
  border-radius: 50%; animation: su-spin 0.9s linear infinite;
}
@keyframes su-spin { to { transform: rotate(360deg); } }

.su-moves { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.su-move {
  padding: 14px 16px;
  background: var(--surface-2); border-radius: 8px;
  border-left: 3px solid var(--accent);
}
.su-move[data-kind="goal-shift"] { border-left-color: var(--accent); }
.su-move[data-kind="interrupt"]  { border-left-color: var(--gold); }
.su-move[data-kind="setting"]    { border-left-color: var(--status-revise, var(--gold)); }
.su-move[data-kind="reveal"]     { border-left-color: var(--marker-thread, var(--accent)); }
.su-move[data-kind="timeframe"]  { border-left-color: var(--status-done); }

.su-move-head {
  display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
  margin-bottom: 6px;
}
.su-kind {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--accent-ink);
}
.su-kind-blurb {
  font-size: 11.5px; color: var(--muted);
}
.su-move-label {
  margin: 0 0 6px;
  font-family: var(--font-serif); font-size: 15px; font-weight: 500;
  color: var(--ink); letter-spacing: -0.005em;
}
.su-move-instr {
  margin: 0 0 10px; max-width: 70ch;
  font-size: 13px; line-height: 1.6; color: var(--ink-2);
}
.su-move-actions { display: flex; justify-content: flex-end; }

.su-foot-spacer { flex: 1; }
</style>
