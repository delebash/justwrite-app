<script setup>
// Per-chapter critique modal.
//
// Two LLM calls (text critique + structural analysis) feed into a
// chapter.critique object that persists on the chapter. Both can be
// re-run independently; freshness is shown via a "generated 5m ago"
// timestamp so the user can tell stale notes from a recent run.
//
// Entity extraction (find new characters/locations/objects from the
// prose) used to live here too but moved out — see the "Find new
// entities" button on CharactersView / LocationsView / ObjectsView,
// which opens EntitySweepModal directly.

import { ref, computed } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useAiTasksStore, Icon, AiTaskStrip, AppModal, UiButton } from "@delebash/llm-ui";
import { runCritique, runStructuralAnalysis, PACING_LABELS, ENDING_LABELS } from "../services/analysis/critique.js";
import AiFeatureChip from "./AiFeatureChip.vue";

const props = defineProps({
  chapterId: { type: String, required: true },
});
const emit = defineEmits(["close"]);

const project = useProjectStore();
const aiTasks = useAiTasksStore();

const ch = computed(() => project.chapterById(props.chapterId));
const critique = computed(() => ch.value?.critique || null);
const structure = computed(() => critique.value?.structure || null);
const notes = computed(() => critique.value?.notes || []);

const err = ref("");

// Tasks for the two concurrent critique calls. Looked up from the global
// aiTasks store by feature + chapter id + meta.kind. When the call
// finishes, the task leaves runningTasks and these computeds turn null,
// which hides the inline strips automatically.
const notesTask  = computed(() => aiTasks.runningTasks.find(
  (t) => t.feature === "critique" && t.meta?.chapterId === props.chapterId && t.meta?.kind === "notes"
));
const structTask = computed(() => aiTasks.runningTasks.find(
  (t) => t.feature === "critique" && t.meta?.chapterId === props.chapterId && t.meta?.kind === "structure"
));
const runningNotes  = computed(() => !!notesTask.value);
const runningStruct = computed(() => !!structTask.value);

const ago = (ts) => {
  if (!ts) return "";
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// Group notes by severity so the user reads the flags first, then the
// suggestions, then the observations.
const grouped = computed(() => {
  const byKey = { flag: [], suggest: [], info: [] };
  for (const n of notes.value) {
    (byKey[n.severity] || byKey.info).push(n);
  }
  return byKey;
});

// User clicked Cancel → the task store aborted the controller → the
// chat-stream throws an AbortError. friendlyAiError passes aborts
// through unchanged, so detecting one is a name/message check. Don't
// surface "aborted" as an inline error — the cancellation is already
// recorded in the AI task panel.
function isAbort(e) {
  return e?.name === "AbortError" || /abort/i.test(e?.message || "");
}

async function runNotes() {
  if (!ch.value || runningNotes.value) return;
  err.value = "";
  try {
    const html = project.chapterBody[ch.value.id] || "";
    const chapterId = ch.value.id;
    const result = await runCritique({
      html,
      chapterTitle: ch.value.title,
      chapterNum: ch.value.num,
      meta: { chapterId, kind: "notes" },
      task: { label: `Chapter critique notes · Ch. ${ch.value.num ?? "?"}`, meta: { chapterId, kind: "notes" } },
    });
    // A non-empty completion that yielded zero notes is a parse miss —
    // surface it instead of falling back to the empty-state placeholder
    // (which reads like the run never happened). The raw text is on
    // result.raw if we ever want to expose a "show raw" toggle.
    if (!result.notes.length && (result.raw || "").trim().length > 0) {
      console.warn("[critique] notes parse returned 0 items. Raw model output:", result.raw);
      err.value = "Couldn't parse notes from the model's reply. Try re-running, or switch the critique model in Settings.";
    }
    // Merge with existing structure if present.
    project.setChapterCritique(chapterId, {
      ...critique.value,
      generatedAt: result.generatedAt,
      model: result.model,
      notes: result.notes,
    });
  } catch (e) {
    if (!isAbort(e)) err.value = e?.message || String(e);
  }
}

async function runStruct() {
  if (!ch.value || runningStruct.value) return;
  err.value = "";
  try {
    const html = project.chapterBody[ch.value.id] || "";
    const chapterId = ch.value.id;
    const result = await runStructuralAnalysis({
      html,
      chapterTitle: ch.value.title,
      chapterNum: ch.value.num,
      meta: { chapterId, kind: "structure" },
      task: { label: `Chapter structure · Ch. ${ch.value.num ?? "?"}`, meta: { chapterId, kind: "structure" } },
    });
    const next = { ...(critique.value || {}), structure: result };
    // Stamp generatedAt at the topmost level too so the panel header has
    // something to show even when only structure has been generated.
    if (!next.generatedAt) next.generatedAt = result.generatedAt;
    if (!next.model) next.model = result.model;
    project.setChapterCritique(chapterId, next);
  } catch (e) {
    if (!isAbort(e)) err.value = e?.message || String(e);
  }
}

function clearAll() {
  project.clearChapterCritique(props.chapterId);
}

const SEVERITY_META = {
  flag:    { icon: "Alert",   label: "Flags",       color: "var(--danger-ink, #b91c1c)" },
  suggest: { icon: "Sparkle", label: "Suggestions", color: "var(--accent-ink)" },
  info:    { icon: "Check",   label: "Observations",color: "var(--muted)" },
};
</script>

<template>
  <AppModal
    eyebrow="Chapter critique"
    :title="ch ? `Ch. ${ch.num} · ${ch.title}` : ''"
    :closable="!runningNotes && !runningStruct"
    @close="emit('close')"
  >
    <template #header>
      <div class="ck-titleblock">
        <div class="t-eyebrow">Chapter critique</div>
        <h2 class="modal-title">{{ ch ? `Ch. ${ch.num} · ${ch.title}` : "" }}</h2>
      </div>
      <div class="ck-header-actions">
        <AiFeatureChip feature="critique" label="Critique" editable />
        <UiButton v-if="critique" intent="ghost" size="small" @click="clearAll">
          <Icon name="Trash" :size="12" /> Clear
        </UiButton>
      </div>
    </template>

    <div v-if="critique?.generatedAt" class="ck-stamp">
      <Icon name="Sparkle" :size="11" />
      Generated {{ ago(critique.generatedAt) }} · {{ critique.model || "unknown model" }}
    </div>

    <div v-if="err" class="ck-error">
      <Icon name="Alert" :size="13" /> {{ err }}
    </div>

    <!-- ── Structural analysis ───────────────────────────────────── -->
    <section class="ck-section">
      <header>
        <h3>Structure</h3>
        <UiButton intent="ghost" size="small" :disabled="runningStruct" @click="runStruct"
          v-tooltip.bottom="'Score tension, hook, pacing, and ending — one LLM call'">
          <Icon name="Refresh" :size="12" />
          {{ structure ? "Re-analyze" : (runningStruct ? "Analyzing…" : "Analyze") }}
        </UiButton>
      </header>
      <p class="ck-section-desc">
        Scores the chapter as a whole — tension (rising stakes), hook strength (opening pull),
        pacing (rushed vs. measured), and how the ending lands (cliffhanger, resolved, transition).
      </p>

      <AiTaskStrip :task="structTask" />
      <div v-if="structure && !runningStruct" class="struct-grid">
        <div class="struct-metric">
          <div class="sm-num">{{ structure.tension }}<small>/10</small></div>
          <div class="sm-lbl">Tension</div>
          <div class="sm-meter"><div class="sm-meter-fill" :style="`width:${structure.tension * 10}%`" /></div>
        </div>
        <div class="struct-metric">
          <div class="sm-num">{{ structure.hookQuality }}<small>/10</small></div>
          <div class="sm-lbl">Hook</div>
          <div class="sm-meter"><div class="sm-meter-fill" :style="`width:${structure.hookQuality * 10}%`" /></div>
        </div>
        <div class="struct-metric">
          <div class="sm-num sm-text">{{ PACING_LABELS[structure.pacing] }}</div>
          <div class="sm-lbl">Pacing</div>
        </div>
        <div class="struct-metric">
          <div class="sm-num sm-text">{{ ENDING_LABELS[structure.endingClass] }}</div>
          <div class="sm-lbl">Ending</div>
        </div>
      </div>
      <p v-if="structure?.summary" class="struct-summary">{{ structure.summary }}</p>
      <p v-else-if="!structure && !runningStruct" class="ck-empty">
        Run a structural pass to see tension, hook, pacing, and ending classification.
      </p>
    </section>

    <!-- ── Text critique ──────────────────────────────────────────── -->
    <section class="ck-section">
      <header>
        <h3>Notes</h3>
        <UiButton intent="ghost" size="small" :disabled="runningNotes" @click="runNotes"
          v-tooltip.bottom="'Generate line-level editorial notes — one LLM call'">
          <Icon name="Refresh" :size="12" />
          {{ notes.length ? "Re-run notes" : (runningNotes ? "Drafting notes…" : "Run notes") }}
        </UiButton>
      </header>
      <p class="ck-section-desc">
        Line-level editor notes across categories like pacing, voice, dialogue, POV, and clarity —
        grouped into <strong>flags</strong> (clear problems), <strong>suggestions</strong>
        (concrete revisions), and <strong>observations</strong> (worth noting, no action).
      </p>

      <AiTaskStrip :task="notesTask" />
      <div v-if="notes.length && !runningNotes" class="notes-list">
        <div v-for="sev in ['flag', 'suggest', 'info']" :key="sev"
          v-show="grouped[sev].length"
          class="notes-group">
          <div class="notes-group-h" :style="`color: ${SEVERITY_META[sev].color}`">
            <Icon :name="SEVERITY_META[sev].icon" :size="12" />
            {{ SEVERITY_META[sev].label }}
            <span class="t-muted" style="font-weight:400">· {{ grouped[sev].length }}</span>
          </div>
          <div v-for="n in grouped[sev]" :key="n.id" class="note-row">
            <span class="note-cat">{{ n.category }}</span>
            <span class="note-msg">{{ n.message }}</span>
          </div>
        </div>
      </div>
      <p v-else-if="!runningNotes" class="ck-empty">
        Run notes to get a list of flags, suggestions, and observations.
      </p>
    </section>

  </AppModal>
</template>

<style scoped>
.ck-titleblock { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.ck-titleblock h2 { font-family: var(--font-serif); font-size: 22px; font-weight: 600; margin: 4px 0 0; }
.ck-header-actions { display: flex; gap: 8px; flex-shrink: 0; }

.ck-stamp {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.06em;
  color: var(--muted);
  margin-top: -4px;
}
.ck-error {
  display: flex; gap: 8px; align-items: center;
  padding: 8px 12px; border-radius: 6px;
  background: color-mix(in oklab, var(--danger-ink, #b91c1c) 12%, transparent);
  color: var(--danger-ink, #b91c1c);
  font-size: 12.5px;
}
.ck-empty {
  font-size: 12.5px; color: var(--muted); font-style: italic;
  padding: 14px 16px; background: var(--surface-2); border-radius: 8px;
}
.ck-section-desc {
  font-size: 12px; line-height: 1.55; color: var(--muted);
  margin: -2px 0 0;
}
.ck-section-desc strong { color: var(--ink-2); font-weight: 600; }

.ck-section { display: flex; flex-direction: column; gap: 10px; }
.ck-section > header {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding-bottom: 6px; border-bottom: 1px solid var(--border-soft);
}
.ck-section > header h3 {
  font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--muted);
  margin: 0; font-weight: 600;
}

/* Structure grid */
.struct-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.struct-metric {
  padding: 14px 12px; border-radius: 8px;
  background: var(--surface-2); border: 1px solid var(--border-soft);
}
.sm-num { font-family: var(--font-serif); font-size: 26px; line-height: 1; font-weight: 500; font-variant-numeric: tabular-nums; }
.sm-num small { font-family: var(--font-mono); font-size: 11px; color: var(--muted); font-weight: 400; }
.sm-num.sm-text { font-size: 18px; }
.sm-lbl { font-family: var(--font-mono); font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-top: 6px; }
.sm-meter { margin-top: 8px; height: 4px; border-radius: 999px; background: var(--surface-3); overflow: hidden; }
.sm-meter-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--gold)); }
.struct-summary {
  font-family: var(--font-serif); font-style: italic; font-size: 13.5px; line-height: 1.55;
  color: var(--ink-2); margin: 6px 0 0;
  padding: 10px 14px; border-left: 3px solid var(--accent-line);
  background: var(--surface-2);
  border-radius: 0 6px 6px 0;
}

/* Notes list */
.notes-list { display: flex; flex-direction: column; gap: 14px; }
.notes-group { display: flex; flex-direction: column; gap: 4px; }
.notes-group-h {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.12em;
  text-transform: uppercase; font-weight: 600;
  margin-bottom: 2px;
}
.note-row {
  display: grid; grid-template-columns: 120px 1fr; gap: 12px;
  padding: 7px 10px; border-radius: 6px;
  font-size: 12.5px; line-height: 1.5;
}
.note-row:hover { background: var(--surface-2); }
.note-cat {
  font-family: var(--font-mono); font-size: 10.5px;
  color: var(--muted); padding-top: 2px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.note-msg { color: var(--ink-2); }

@media (max-width: 640px) {
  .struct-grid { grid-template-columns: 1fr 1fr; }
  .note-row { grid-template-columns: 1fr; gap: 2px; }
  .note-cat { padding-top: 0; }
}
</style>
