<script setup>
// Per-chapter critique modal.
//
// Two LLM calls (text critique + structural analysis) feed into a
// chapter.critique object that persists on the chapter. Both can be
// re-run independently; freshness is shown via a "generated 5m ago"
// timestamp so the user can tell stale notes from a recent run.

import { ref, computed } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { runCritique, runStructuralAnalysis, PACING_LABELS, ENDING_LABELS } from "../services/analysis/critique.js";
import { extractEntities } from "../services/analysis/entityExtraction.js";
import { confirmDialog } from "../services/dialog.js";
import { useAiProgress } from "../composables/useAiProgress.js";
import Icon from "./Icon.vue";
import EntityReviewModal from "./EntityReviewModal.vue";
import EntitySweepModal from "./EntitySweepModal.vue";
import AiProgressBar from "./AiProgressBar.vue";

const props = defineProps({
  chapterId: { type: String, required: true },
});
const emit = defineEmits(["close"]);

const project = useProjectStore();
const ui = useUiStore();

const ch = computed(() => project.chapterById(props.chapterId));
const critique = computed(() => ch.value?.critique || null);
const structure = computed(() => critique.value?.structure || null);
const notes = computed(() => critique.value?.notes || []);

const runningNotes = ref(false);
const runningStruct = ref(false);
const runningEntities = ref(false);
const entityProposals = ref(null);
const sweepOpen = ref(false);
const err = ref("");

// One progress tracker per concurrent call site. They live independently
// because the user can in principle run notes / structure / entities at
// the same time — each has its own elapsed time, token count, and cancel.
const notesProgress    = useAiProgress();
const structProgress   = useAiProgress();
const entitiesProgress = useAiProgress();

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

async function runNotes() {
  if (!ch.value) return;
  err.value = "";
  runningNotes.value = true;
  notesProgress.start();
  try {
    const html = project.chapterBody[ch.value.id] || "";
    const result = await runCritique({
      html,
      chapterTitle: ch.value.title,
      chapterNum: ch.value.num,
      meta: { chapterId: ch.value.id, kind: "notes" },
      signal: notesProgress.signal,
      onDelta: notesProgress.onDelta,
    });
    // Merge with existing structure if present.
    project.setChapterCritique(ch.value.id, {
      ...critique.value,
      generatedAt: result.generatedAt,
      model: result.model,
      notes: result.notes,
    });
    notesProgress.finish();
  } catch (e) {
    if (!notesProgress.cancelled.value) err.value = e?.message || String(e);
    notesProgress.finish();
  } finally {
    runningNotes.value = false;
  }
}

async function runStruct() {
  if (!ch.value) return;
  err.value = "";
  runningStruct.value = true;
  structProgress.start();
  try {
    const html = project.chapterBody[ch.value.id] || "";
    const result = await runStructuralAnalysis({
      html,
      chapterTitle: ch.value.title,
      chapterNum: ch.value.num,
      meta: { chapterId: ch.value.id, kind: "structure" },
      signal: structProgress.signal,
      onDelta: structProgress.onDelta,
    });
    const next = { ...(critique.value || {}), structure: result };
    // Stamp generatedAt at the topmost level too so the panel header has
    // something to show even when only structure has been generated.
    if (!next.generatedAt) next.generatedAt = result.generatedAt;
    if (!next.model) next.model = result.model;
    project.setChapterCritique(ch.value.id, next);
    structProgress.finish();
  } catch (e) {
    if (!structProgress.cancelled.value) err.value = e?.message || String(e);
    structProgress.finish();
  } finally {
    runningStruct.value = false;
  }
}

async function findEntities() {
  if (!ch.value) return;
  err.value = "";
  runningEntities.value = true;
  entitiesProgress.start();
  try {
    const html = project.chapterBody[ch.value.id] || "";
    const proposals = await extractEntities({
      html,
      chapterTitle: ch.value.title,
      chapterNum: ch.value.num,
      existingCharacters: project.characters,
      existingLocations:  project.locations,
      existingObjects:    project.objects,
      meta: { chapterId: ch.value.id },
      signal: entitiesProgress.signal,
      onDelta: entitiesProgress.onDelta,
    });
    const total = proposals.characters.length + proposals.locations.length + proposals.objects.length;
    if (total === 0) {
      ui.showToast({ message: "No new entities — your story bible already covers this chapter." });
    } else {
      entityProposals.value = proposals;
    }
    entitiesProgress.finish();
  } catch (e) {
    if (!entitiesProgress.cancelled.value) err.value = e?.message || String(e);
    entitiesProgress.finish();
  } finally {
    runningEntities.value = false;
  }
}

async function clearAll() {
  const yes = await confirmDialog({
    title: "Clear this chapter's critique?",
    message: "The notes and structural analysis will be removed. You can re-run them anytime.",
    confirmLabel: "Clear",
    danger: true,
  });
  if (!yes) return;
  project.clearChapterCritique(props.chapterId);
  ui.showToast({ message: "Critique cleared." });
}

const SEVERITY_META = {
  flag:    { icon: "Alert",   label: "Flags",       color: "var(--danger-ink, #b91c1c)" },
  suggest: { icon: "Sparkle", label: "Suggestions", color: "var(--accent-ink)" },
  info:    { icon: "Check",   label: "Observations",color: "var(--muted)" },
};
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal critique-modal">
      <header class="ck-header">
        <div>
          <div class="t-eyebrow">Chapter critique</div>
          <h2>{{ ch ? `Ch. ${ch.num} · ${ch.title}` : "" }}</h2>
        </div>
        <div class="ck-header-actions">
          <button v-if="critique" class="btn ghost sm" @click="clearAll">
            <Icon name="Trash" :size="12" /> Clear
          </button>
          <button class="btn ghost sm" @click="emit('close')">
            <Icon name="Close" :size="12" /> Close
          </button>
        </div>
      </header>

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
          <button class="btn ghost sm" :disabled="runningStruct" @click="runStruct">
            <Icon name="Refresh" :size="12" />
            {{ structure ? "Re-analyze" : (runningStruct ? "Analyzing…" : "Analyze") }}
          </button>
        </header>

        <AiProgressBar :progress="structProgress" label="Analyzing structure…" />
        <div v-if="structure && !structProgress.running" class="struct-grid">
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
        <p v-else-if="!structure && !structProgress.running" class="ck-empty">
          Run a structural pass to see tension, hook, pacing, and ending classification.
        </p>
      </section>

      <!-- ── Entity extraction ─────────────────────────────────────── -->
      <section class="ck-section">
        <header>
          <h3>Story bible</h3>
          <div style="display:flex;gap:6px">
            <button class="btn ghost sm" :disabled="runningEntities" @click="findEntities">
              <Icon name="Refresh" :size="12" />
              {{ runningEntities ? "Scanning…" : "This chapter" }}
            </button>
            <button class="btn ghost sm" :disabled="runningEntities" @click="sweepOpen = true" title="Scan every chapter for new entities (slower)">
              <Icon name="Sparkle" :size="12" />
              Whole book
            </button>
          </div>
        </header>
        <AiProgressBar :progress="entitiesProgress" label="Scanning for entities…" />
        <p class="ck-empty" v-if="!entitiesProgress.running">
          Scan for new named characters, locations, and objects to add to the story bible. Choose <b>This chapter</b> for a quick scan, or <b>Whole book</b> to walk every chapter (slower but catches the whole cast at once). You'll review every proposal before anything is added.
        </p>
      </section>

      <!-- ── Text critique ──────────────────────────────────────────── -->
      <section class="ck-section">
        <header>
          <h3>Notes</h3>
          <button class="btn ghost sm" :disabled="runningNotes" @click="runNotes">
            <Icon name="Refresh" :size="12" />
            {{ notes.length ? "Re-run notes" : (runningNotes ? "Drafting notes…" : "Run notes") }}
          </button>
        </header>

        <AiProgressBar :progress="notesProgress" label="Drafting notes…" />
        <div v-if="notes.length && !notesProgress.running" class="notes-list">
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
        <p v-else-if="!notesProgress.running" class="ck-empty">
          Run notes to get a list of flags, suggestions, and observations.
        </p>
      </section>
    </div>

    <EntityReviewModal v-if="entityProposals"
      :proposals="entityProposals"
      :chapter-title="ch ? `Ch. ${ch.num} · ${ch.title}` : ''"
      @close="entityProposals = null" />

    <EntitySweepModal v-if="sweepOpen"
      @close="sweepOpen = false"
      @committed="sweepOpen = false" />
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; z-index: 100;
  background: color-mix(in oklab, black 40%, transparent);
  display: grid; place-items: center;
  padding: 24px;
}
.critique-modal {
  background: var(--surface); color: var(--ink);
  border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.3);
  width: min(720px, 100%); max-height: 86vh;
  overflow-y: auto;
  padding: 22px 26px 26px;
  display: flex; flex-direction: column; gap: 16px;
}

.ck-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.ck-header h2 { font-family: var(--font-serif); font-size: 22px; font-weight: 600; margin: 4px 0 0; }
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
.struct-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
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
