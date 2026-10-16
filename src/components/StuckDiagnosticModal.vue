<script setup>
// Stuck-on-this-chapter diagnostic modal — the "I'm blocked" menu: the shared ideas window
// (IdeaListModal.vue) with Unstuck's five moves.
//
// Sends the prose tail to generateUnstuckMoves() when the writer presses Get unstuck — never on
// open, so the routing chip can be changed before anything is spent — and shows the five moves
// as cards. Each card's "Write this" hands the move back (useMove); the page runs
// runGuidedContinue on the editor with its instruction. Regenerate asks for a fresh five.

import { useAiStore } from "../stores/ai.js";
import {
  generateUnstuckMoves,
  MOVE_BLURB_I18N,
  MOVE_KIND_I18N,
} from "../services/stuckDiagnostic.js";
import IdeaListModal from "./IdeaListModal.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps({
  // Plain-text prose tail leading up to the writer's cursor.
  contextText: { type: String, required: true },
  // Chapter context for the prompt header (cosmetic).
  chapterTitle: { type: String, default: "" },
  chapterNum: { type: [Number, null], default: null },
});
const emit = defineEmits(["close", "useMove"]);

const ai = useAiStore();

// Each move kind's colour on its card.
const KIND_ACCENT = {
  "goal-shift": "var(--accent)",
  interrupt: "var(--gold)",
  setting: "var(--status-revise, var(--gold))",
  reveal: "var(--marker-thread, var(--accent))",
  timeframe: "var(--status-done)",
};

async function run() {
  if (!ai.providerForFeature("unstuck")) throw new Error(t("stuck.err.noProvider"));
  let result;
  try {
    result = await generateUnstuckMoves({
      contextText: props.contextText,
      chapterTitle: props.chapterTitle,
      chapterNum: props.chapterNum,
      task: { label: t("stuck.taskLabel"), meta: {} },
    });
  } catch (e) {
    const msg = String(e?.message || e || "");
    if (e?.name === "AbortError" || /abort/i.test(msg)) throw e;
    throw new Error(/provider|api key|configure/i.test(msg) ? t("stuck.err.noProvider") : msg || t("stuck.err.failed"));
  }
  return result.moves.map((m) => ({
    id: m.id,
    title: m.label,
    text: m.instruction,
    kindLabel: MOVE_KIND_I18N[m.kind] ? t(MOVE_KIND_I18N[m.kind]) : m.kind,
    kindBlurb: MOVE_BLURB_I18N[m.kind] ? t(MOVE_BLURB_I18N[m.kind]) : "",
    accent: KIND_ACCENT[m.kind],
    move: m,
  }));
}
</script>

<template>
  <IdeaListModal :eyebrow="$t('stuck.eyebrow')" :title="$t('stuck.title')" :lede="$t('stuck.blurb')"
    feature="unstuck" :chip-label="$t('stuck.chipLabel')"
    :idle-text="$t('stuck.idleBlurb')" :start-label="$t('stuck.action')"
    :pick-label="$t('stuck.writeThis')" :empty-text="$t('stuck.err.empty')" :run="run"
    @pick="(it) => emit('useMove', it.move)" @close="emit('close')" />
</template>
