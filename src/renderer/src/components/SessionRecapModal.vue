<script setup>
// End-of-session recap modal — "Wrap up your day".
//
// One LLM call returns:
//   - a 150-300 word recap of what the writer did today
//   - a list of "open threads" — verbatim snippets worth marking as
//     Loose threads going into tomorrow's session
//
// The recap text persists on the project as a dailyRecap so the next
// day's resume briefing can fold yesterday's wrap-up into the
// orientation. Per-thread "Add as marker" buttons drop a Loose-thread
// pin into the scene at the matching snippet (uses
// addMarkerToSceneHtml — no editor instance required).

import { ref, computed, onMounted } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useSessionsStore } from "../stores/sessions.js";
import { useAiStore } from "../stores/ai.js";
import { useAiTasksStore } from "../stores/aiTasks.js";
import { generateSessionRecap } from "../services/sessionRecap.js";
import { addMarkerToSceneHtml } from "../services/markers.js";
import Icon from "./Icon.vue";
import AiTaskStrip from "./AiTaskStrip.vue";
import AiFeatureChip from "./AiFeatureChip.vue";
import AppModal from "./AppModal.vue";
import { UiButton } from "@delebash/llm-ui";

const emit = defineEmits(["close"]);

const project = useProjectStore();
const ui = useUiStore();
const sessions = useSessionsStore();
const ai = useAiStore();
const aiTasks = useAiTasksStore();

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const myTask = computed(() => aiTasks.runningTasks.find((t) => t.feature === "recap"));
const running = computed(() => !!myTask.value);
function isAbort(e) { return e?.name === "AbortError" || /abort/i.test(e?.message || ""); }
const err = ref("");
const liveResult = ref(null);

// Thread state — { [threadId]: 'pending' | 'added' | 'unavailable' }.
const threadStatus = ref({});

const cached = computed(() => project.getDailyRecap(todayKey()));
const recap = computed(() => liveResult.value || cached.value);
const threads = computed(() => recap.value?.threads || []);

const eligibilityText = computed(() => {
  if (!sessions.todayChapterId && !sessions.lastWrite?.chapterId) {
    return "No writing recorded today yet — open a chapter and write a bit first.";
  }
  return "";
});

async function runRecap() {
  err.value = "";
  if (!ai.providerForFeature("recap")) {
    err.value = "Configure an AI provider in Settings → AI to generate the recap.";
    return;
  }
  liveResult.value = null;
  threadStatus.value = {};
  try {
    const result = await generateSessionRecap({
      project, sessions,
      task: { label: "Session recap", meta: {} },
    });
    liveResult.value = result;
    // Persist immediately so closing without "Save" still keeps it —
    // recaps are append-only and the writer expects them to stick once
    // generated.
    project.setDailyRecap(result.day, {
      text: result.text,
      threads: result.threads,
      chapterId: result.chapterId,
      chapterNum: result.chapterNum,
      chapterTitle: result.chapterTitle,
      totalWords: result.totalWords,
      generatedAt: result.generatedAt,
      model: result.model,
      providerId: result.providerId,
    });
  } catch (e) {
    if (!isAbort(e)) {
      const msg = String(e?.message || e || "");
      err.value = /provider|api key|configure/i.test(msg)
        ? "Configure an AI provider in Settings → AI to generate the recap."
        : msg || "Couldn't generate recap.";
    }
  }
}

function regenerate() {
  project.clearDailyRecap(todayKey());
  runRecap();
}

function addThreadMarker(thread) {
  if (!thread || threadStatus.value[thread.id] === "added") return;
  const scene = (project.scenesFor(thread.chapterId) || [])
    .find((s) => s.id === thread.sceneId);
  if (!scene) {
    threadStatus.value = { ...threadStatus.value, [thread.id]: "unavailable" };
    return;
  }
  const nextHtml = addMarkerToSceneHtml(scene.body || "", thread.snippet, {
    category: "thread",
    label: thread.label || "",
  });
  if (!nextHtml) {
    threadStatus.value = { ...threadStatus.value, [thread.id]: "unavailable" };
    return;
  }
  project.setSceneBody(thread.chapterId, thread.sceneId, nextHtml);
  threadStatus.value = { ...threadStatus.value, [thread.id]: "added" };
  ui.showToast({ message: "Loose thread pinned in chapter." });
}

function addAllMarkers() {
  for (const t of threads.value) {
    if (threadStatus.value[t.id]) continue;
    addThreadMarker(t);
  }
}

function clearAndClose() {
  project.clearDailyRecap(todayKey());
  emit("close");
}

const recapText = computed(() => {
  if (running.value) return myTask.value?.preview || "";
  return recap.value?.text || "";
});

const headerStats = computed(() => {
  const r = recap.value;
  if (r) {
    return {
      words: r.totalWords ?? sessions.todayWords,
      chapter: r.chapterNum != null ? `Ch. ${r.chapterNum}${r.chapterTitle ? ` — ${r.chapterTitle}` : ""}` : "",
    };
  }
  return {
    words: sessions.todayWords,
    chapter: sessions.todayChapterId
      ? (() => {
          const c = project.chapterById(sessions.todayChapterId);
          return c ? `Ch. ${c.num}${c.title ? ` — ${c.title}` : ""}` : "";
        })()
      : "",
  };
});

onMounted(() => {
  // Deliberately no auto-run: the user should see the AI routing chip
  // in the header and have the option to change provider or model before
  // spending tokens. The empty-state CTA below kicks off the run when
  // they're ready.
});
</script>

<template>
  <AppModal
    eyebrow="End of session"
    title="Wrap up your day"
    :closable="!running"
    @close="emit('close')"
  >
    <template #header>
      <div class="recap-titleblock">
        <div class="t-eyebrow">End of session</div>
        <h2 class="modal-title">Wrap up your day</h2>
      </div>
      <div class="recap-header-actions">
        <AiFeatureChip feature="recap" label="Recap" />
      </div>
    </template>

    <div class="recap-stats">
      <div class="recap-stat">
        <div class="recap-stat-v">{{ headerStats.words.toLocaleString() }}</div>
        <div class="recap-stat-k">words today</div>
      </div>
      <div v-if="headerStats.chapter" class="recap-stat recap-stat-wide">
        <div class="recap-stat-v">{{ headerStats.chapter }}</div>
        <div class="recap-stat-k">most recent chapter</div>
      </div>
      <div v-if="recap?.model" class="recap-stat recap-stat-model">
        <div class="recap-stat-v">{{ recap.model }}</div>
        <div class="recap-stat-k">model</div>
      </div>
    </div>

    <div v-if="eligibilityText" class="recap-empty">
      <Icon name="Alert" :size="14" />
      <span>{{ eligibilityText }}</span>
    </div>

    <div v-else-if="err" class="recap-error">
      <Icon name="Alert" :size="14" />
      <span>{{ err }}</span>
      <UiButton intent="ghost" size="small" @click="runRecap">
        <Icon name="Refresh" :size="12" /> Retry
      </UiButton>
    </div>

    <div v-else-if="!recap && !running" class="recap-cta-empty">
      <Icon name="Sparkle" :size="20" />
      <p class="recap-cta-text">
        Summarise today's writing and surface open threads worth pinning.
        Change the provider in the chip above first if you want.
      </p>
      <UiButton intent="primary" @click="runRecap">
        <Icon name="Sparkle" :size="13" /> Generate session recap
      </UiButton>
    </div>

    <template v-else>
      <section class="recap-section">
        <div class="recap-h">Today's recap</div>
        <p v-if="recapText" class="recap-body">{{ recapText }}</p>
        <AiTaskStrip v-else-if="running" :task="myTask" />
      </section>

      <section v-if="threads.length" class="recap-section">
        <div class="recap-h">
          Open threads
          <span class="recap-h-count">{{ threads.length }}</span>
          <span class="recap-h-spacer" />
          <UiButton intent="ghost" size="small"
                    :disabled="threads.every(t => threadStatus[t.id])"
                    @click="addAllMarkers"
                    v-tooltip.bottom="'Drop Loose-thread markers on all unmarked snippets'">
            <Icon name="Pin" :size="12" /> Pin all
          </UiButton>
        </div>
        <p class="recap-threads-blurb">
          Snippets the AI flagged as setup-without-payoff in today's writing. Pin one to drop a
          <strong>Loose thread</strong> marker into the chapter so tomorrow's resume briefing
          surfaces it.
        </p>
        <ul class="recap-threads">
          <li v-for="t in threads" :key="t.id" class="recap-thread">
            <div class="recap-thread-main">
              <p class="recap-thread-snippet">"{{ t.snippet }}"</p>
              <p v-if="t.label" class="recap-thread-label">{{ t.label }}</p>
            </div>
            <div class="recap-thread-actions">
              <UiButton v-if="!threadStatus[t.id]" intent="ghost" size="small"
                        :disabled="!t.locatable"
                        @click="addThreadMarker(t)"
                        v-tooltip.bottom="t.locatable ? 'Drop a Loose-thread marker on this phrase in the chapter' : 'Snippet not found in current prose — cannot pin'">
                <Icon name="Pin" :size="12" /> Pin
              </UiButton>
              <span v-else-if="threadStatus[t.id] === 'added'" class="recap-thread-status added">
                <Icon name="Check" :size="12" /> Pinned
              </span>
              <span v-else class="recap-thread-status unavailable">
                Not found
              </span>
            </div>
          </li>
        </ul>
      </section>
    </template>

    <template #footer>
      <div class="recap-foot">
        <UiButton v-if="recap" intent="ghost" size="small"
                  :disabled="running"
                  @click="regenerate">
          <Icon name="Refresh" :size="12" /> Regenerate
        </UiButton>
        <UiButton v-if="cached" intent="ghost" size="small"
                  :disabled="running"
                  @click="clearAndClose">
          Discard recap
        </UiButton>
        <span class="recap-foot-spacer" />
        <UiButton intent="primary"
                  :disabled="running"
                  @click="emit('close')">
          Done
        </UiButton>
      </div>
    </template>
  </AppModal>
</template>

<style scoped>
.recap-stats {
  display: flex; gap: 24px; flex-wrap: wrap;
  padding: 14px 0 18px;
  border-bottom: 1px solid var(--border-soft);
  margin-bottom: 18px;
}
.recap-stat { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.recap-stat-wide { flex: 1; min-width: 200px; }
.recap-stat-v {
  font-family: var(--font-serif); font-size: 22px; font-weight: 500;
  color: var(--ink); line-height: 1.1;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.recap-stat-k {
  font-family: var(--font-mono); font-size: 9.5px;
  letter-spacing: 0.15em; text-transform: uppercase; color: var(--muted);
}
.recap-stat-model .recap-stat-v {
  font-family: var(--font-mono); font-size: 12px; color: var(--muted);
}

.recap-section + .recap-section { margin-top: 22px; }
.recap-h {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--font-mono);
  font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--muted);
  margin: 0 0 12px;
}
.recap-h-count {
  font-family: var(--font-ui); letter-spacing: 0; text-transform: none;
  font-size: 10.5px; color: var(--accent);
  background: var(--accent-soft); border-radius: 999px; padding: 2px 8px;
}
.recap-h-spacer { flex: 1; height: 1px; background: var(--border-soft); margin: 0 4px; }

.recap-body {
  margin: 0; max-width: 70ch;
  font-family: var(--font-serif); font-size: 14.5px; line-height: 1.7;
  color: var(--ink-2);
  white-space: pre-wrap;
}
.recap-loading {
  display: flex; align-items: center; gap: 10px;
  font-size: 12.5px; color: var(--muted); font-style: italic;
  min-height: 50px;
}
.recap-spinner {
  display: inline-block; width: 12px; height: 12px;
  border: 2px solid var(--surface-3); border-top-color: var(--accent);
  border-radius: 50%; animation: recap-spin 0.9s linear infinite;
}
@keyframes recap-spin { to { transform: rotate(360deg); } }

.recap-threads-blurb {
  margin: 0 0 12px; max-width: 68ch;
  font-size: 12.5px; color: var(--muted); line-height: 1.55;
}
.recap-threads { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.recap-thread {
  display: flex; gap: 14px; align-items: flex-start;
  padding: 12px 14px;
  background: var(--surface-2); border-radius: 8px;
  border-left: 3px solid var(--marker-thread, var(--accent));
}
.recap-thread-main { flex: 1; min-width: 0; }
.recap-thread-snippet {
  margin: 0; font-family: var(--font-serif); font-style: italic;
  font-size: 13.5px; line-height: 1.55; color: var(--ink-2);
}
.recap-thread-label {
  margin: 6px 0 0; font-size: 12px; color: var(--muted); line-height: 1.5;
}
.recap-thread-actions { flex-shrink: 0; }
.recap-thread-status {
  display: inline-flex; align-items: center; gap: 4px;
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.04em;
}
.recap-thread-status.added { color: var(--status-done); }
.recap-thread-status.unavailable { color: var(--muted); font-style: italic; }

.recap-cta-empty {
  display: flex; flex-direction: column; align-items: center;
  gap: 14px; padding: 32px 18px;
  background: var(--surface-2);
  border-radius: 10px;
  text-align: center;
}
.recap-cta-empty > :first-child { color: var(--accent); }
.recap-cta-text {
  margin: 0; max-width: 56ch;
  font-size: 13px; line-height: 1.55; color: var(--ink-2);
}

.recap-empty,
.recap-error {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px;
  background: var(--surface-2); border-radius: 6px;
  font-size: 13px; color: var(--ink-2);
}
.recap-error :deep(svg) { color: var(--danger); flex-shrink: 0; }
.recap-empty :deep(svg) { color: var(--muted); flex-shrink: 0; }

.recap-foot { display: flex; align-items: center; gap: 10px; width: 100%; }
.recap-foot-spacer { flex: 1; }

.recap-titleblock { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.recap-titleblock h2 { font-family: var(--font-serif); font-size: 22px; font-weight: 600; margin: 4px 0 0; }
.recap-header-actions { display: flex; gap: 8px; flex-shrink: 0; align-items: center; }
</style>
