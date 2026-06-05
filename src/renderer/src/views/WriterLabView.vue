<script setup>
// Writer Lab — user-facing view at /#/writer-lab
//
// Single-result panel running against the default LLM.
// No provider or model picker — the user configures that in Settings.

import { ref, computed } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useAiTasksStore } from "../stores/aiTasks.js";
import PaneHeader from "../components/PaneHeader.vue";
import Icon from "../components/Icon.vue";
import AiTaskStrip from "../components/AiTaskStrip.vue";
import WriterLabBase from "../components/WriterLabBase.vue";

import { PACING_LABELS, ENDING_LABELS } from "../services/analysis/critique.js";
import { dispatchRun, reconstructPrompt, textToHtml, fmtMs } from "../services/writerLab.js";
import JwButton from "@renderer/components/ui/JwButton.vue";

const project = useProjectStore();
const aiTasks = useAiTasksStore();

// Each Run gets a fresh runId so we can find this view's task in the
// global aiTasks store. The underlying service auto-registers a task
// when it sees task.meta — we just inject the runId to disambiguate
// from any other concurrent writerAI / critique / entities task.
const currentRunId = ref(null);
const myTask = computed(() => currentRunId.value
  ? aiTasks.runningTasks.find((t) => t.meta?.writerLabRunId === currentRunId.value)
  : null
);
// Terminal stats are snapshot here on finish so the diagnostic footer
// (Elapsed / In / Out) still shows useful numbers after the call ends
// — the live task gets archived out of `runningTasks` at finish time.
const lastRun = ref({ elapsedMs: 0, tokensIn: 0, tokensOut: 0 });

// ─── Base component state (v-model object) ────────────────────────────────
const base = ref({
  inputText: "",
  loadedChapterId: "",
  selectedAction: null,
  showPreview: false,
});

const selectedAction = computed(() => base.value.selectedAction);
const isProseAction  = computed(() =>
  selectedAction.value?.kind === "writerAction" || selectedAction.value?.kind === "rule",
);

// ─── Run state ────────────────────────────────────────────────────────────
const result = ref(null);
const error  = ref("");

const running = computed(() => !!myTask.value);
const canRun = computed(() =>
  base.value.inputText.trim() && selectedAction.value && !running.value,
);

function rawResponse() {
  if (!result.value) return myTask.value?.preview || "";
  if (result.value.raw) return result.value.raw;
  return myTask.value?.preview || "";
}

function isAbort(e) { return e?.name === "AbortError" || /abort/i.test(e?.message || ""); }

async function run() {
  if (!canRun.value) return;
  result.value = null;
  error.value  = "";

  const html = textToHtml(base.value.inputText);
  const runId = `wl_${Math.random().toString(36).slice(2, 10)}`;
  currentRunId.value = runId;
  const startedAt = Date.now();

  try {
    const res = await dispatchRun(selectedAction.value, {
      html,
      // provider + model intentionally omitted → service uses default LLM
      project,
      task: {
        label: `Writer Lab · ${selectedAction.value.label}`,
        meta: { writerLab: true, writerLabRunId: runId, actionKey: selectedAction.value.key },
      },
    });
    result.value = res;
    lastRun.value = {
      elapsedMs: Date.now() - startedAt,
      tokensIn:  res?.usage?.prompt_tokens     || 0,
      tokensOut: res?.usage?.completion_tokens || 0,
    };
  } catch (e) {
    if (!isAbort(e)) error.value = e?.message || String(e);
  }
}

function cancelRun() {
  if (myTask.value) aiTasks.cancel(myTask.value.id);
}

// Live elapsed while the task is running; frozen lastRun value after it
// ends. Same shape for `tokensIn` / `tokensOut`.
const elapsedDisplay = computed(() => {
  if (myTask.value) return aiTasks.now - myTask.value.startedAt;
  return lastRun.value.elapsedMs;
});
const tokensInDisplay  = computed(() => myTask.value?.tokensIn  ?? lastRun.value.tokensIn);
const tokensOutDisplay = computed(() => myTask.value?.tokensOut ?? lastRun.value.tokensOut);

// ─── Copy helpers ─────────────────────────────────────────────────────────
function copyHtml() {
  if (result.value?.html) navigator.clipboard?.writeText(result.value.html).catch(() => {});
}

function copyRaw() {
  const text = rawResponse();
  if (text) navigator.clipboard?.writeText(text).catch(() => {});
}

// ─── Prompt preview ───────────────────────────────────────────────────────
const promptPreview = computed(() => {
  const p = reconstructPrompt(selectedAction.value, base.value.inputText);
  if (!p) return "";
  return `System: ${p.system}\n\nUser:\n${p.user}`;
});

// ─── Critique helpers ─────────────────────────────────────────────────────
const NOTE_SEVERITY_ORDER  = ["flag", "suggest", "info"];
const NOTE_SEVERITY_LABELS = { flag: "Flag", suggest: "Suggest", info: "Info" };

function notesByGroup(notes) {
  const groups = {};
  for (const n of notes || []) {
    const s = n.severity || "info";
    if (!groups[s]) groups[s] = [];
    groups[s].push(n);
  }
  return NOTE_SEVERITY_ORDER.filter((s) => groups[s]).map((s) => ({ severity: s, notes: groups[s] }));
}
</script>

<template>
  <PaneHeader :eyebrow="$t('panes.writerLab.eyebrow')" :title="$t('panes.writerLab.title')" />

  <div class="pane-card">
   <div class="scrollarea lab">

    <!-- ── PAGE DESCRIPTOR ───────────────────────────────────────────── -->
    <p class="wl-desc">
      <strong>Writer Lab</strong> is a scratch-pad AI workbench — paste any passage of prose (or
      load a chapter), then run rewrite, expand, tighten, continue, line-edits, critique,
      structural analysis, or entity extraction. Output stays in the lab; nothing writes back
      into your manuscript without your explicit copy-paste.
    </p>

    <!-- ── SHARED INPUT + ACTION PICKER ──────────────────────────────── -->
    <WriterLabBase v-model="base" />

    <!-- ── PROMPT PREVIEW ─────────────────────────────────────────────── -->
    <div v-if="promptPreview" class="result-panel prompt-panel">
      <div class="result-eyebrow">Reconstructed prompt</div>
      <div class="result-note">Approximation of what the service builds internally.</div>
      <pre class="mono-pre">{{ promptPreview }}</pre>
    </div>

    <!-- ── RUN BUTTON ─────────────────────────────────────────────────── -->
    <div class="run-row">
      <JwButton intent="primary" @click="run" :disabled="!canRun">
        <Icon name="Sparkle" :size="13" />
        Run
      </JwButton>
      <JwButton v-if="running" intent="secondary" size="small" @click="cancelRun">
        Cancel
      </JwButton>
      <span v-if="!selectedAction" class="t-muted" style="font-size:12px">
        Select an operation above.
      </span>
    </div>

    <!-- ── PROGRESS ───────────────────────────────────────────────────── -->
    <AiTaskStrip :task="myTask" />

    <!-- ── ERROR ──────────────────────────────────────────────────────── -->
    <div v-if="error" class="error-strip">
      <Icon name="Close" :size="13" />
      {{ error }}
    </div>

    <!-- ── EMPTY STATE ────────────────────────────────────────────────── -->
    <div
      v-if="!result && !rawResponse() && !running && !error"
      class="empty-state"
    >
      Pick an operation above and press Run.
    </div>

    <!-- ── RESULTS ────────────────────────────────────────────────────── -->
    <template v-if="result || rawResponse()">

      <!-- Raw response -->
      <div class="result-panel">
        <div class="result-eyebrow">
          Raw response
          <button class="copy-btn" @click="copyRaw" v-tooltip.bottom="'Copy raw response'">Copy</button>
        </div>
        <pre class="mono-pre">{{ rawResponse() || "(streaming…)" }}</pre>
      </div>

      <!-- Parsed result -->
      <div class="result-panel">
        <div class="result-eyebrow">Parsed result</div>

        <!-- Prose actions: rendered HTML -->
        <template v-if="result && isProseAction">
          <div class="prose-result-header">
            <span class="t-muted" style="font-size:11.5px">Rendered output</span>
            <button class="copy-btn" @click="copyHtml">Copy HTML</button>
          </div>
          <div class="prose-render" v-html="result.html" />
        </template>

        <!-- Critique notes -->
        <template v-else-if="result && selectedAction?.key === 'critique'">
          <div v-if="!result.notes?.length" class="t-muted" style="font-size:12px;padding:8px 12px">No notes returned.</div>
          <div v-for="group in notesByGroup(result.notes)" :key="group.severity" class="note-group">
            <div class="note-severity" :class="`note-severity--${group.severity}`">
              {{ NOTE_SEVERITY_LABELS[group.severity] }}
            </div>
            <div v-for="note in group.notes" :key="note.id" class="note-item">
              <span class="note-category">{{ note.category }}</span>
              {{ note.message }}
            </div>
          </div>
        </template>

        <!-- Structural analysis -->
        <template v-else-if="result && selectedAction?.key === 'structure'">
          <div class="struct-grid">
            <div class="struct-row">
              <span class="struct-label">Tension</span>
              <span class="struct-val">{{ result.tension }} / 10</span>
            </div>
            <div class="struct-row">
              <span class="struct-label">Hook quality</span>
              <span class="struct-val">{{ result.hookQuality }} / 10</span>
            </div>
            <div class="struct-row">
              <span class="struct-label">Pacing</span>
              <span class="struct-val">{{ PACING_LABELS[result.pacing] || result.pacing }}</span>
            </div>
            <div class="struct-row">
              <span class="struct-label">Ending</span>
              <span class="struct-val">{{ ENDING_LABELS[result.endingClass] || result.endingClass }}</span>
            </div>
            <div v-if="result.summary" class="struct-summary">{{ result.summary }}</div>
          </div>
        </template>

        <!-- Entity extraction -->
        <template v-else-if="result && selectedAction?.key === 'entities'">
          <div class="entity-section">
            <div class="entity-section-title">Characters ({{ result.characters?.length || 0 }})</div>
            <div v-if="!result.characters?.length" class="t-muted" style="font-size:12px;padding:4px 0">None proposed.</div>
            <div v-for="c in result.characters" :key="c.name" class="entity-item">
              <span class="entity-name">{{ c.name }}</span>
              <span class="entity-role">{{ c.role }}</span>
              <div class="entity-evidence">{{ c.oneLiner }}</div>
              <div v-if="c.evidence" class="entity-quote">"{{ c.evidence }}"</div>
            </div>
          </div>
          <div class="entity-section">
            <div class="entity-section-title">Locations ({{ result.locations?.length || 0 }})</div>
            <div v-if="!result.locations?.length" class="t-muted" style="font-size:12px;padding:4px 0">None proposed.</div>
            <div v-for="l in result.locations" :key="l.name" class="entity-item">
              <span class="entity-name">{{ l.name }}</span>
              <span class="entity-role">{{ l.kind }}</span>
              <div class="entity-evidence">{{ l.note }}</div>
              <div v-if="l.evidence" class="entity-quote">"{{ l.evidence }}"</div>
            </div>
          </div>
          <div class="entity-section">
            <div class="entity-section-title">Objects ({{ result.objects?.length || 0 }})</div>
            <div v-if="!result.objects?.length" class="t-muted" style="font-size:12px;padding:4px 0">None proposed.</div>
            <div v-for="o in result.objects" :key="o.name" class="entity-item">
              <span class="entity-name">{{ o.name }}</span>
              <span class="entity-role">{{ o.kind }}</span>
              <div class="entity-evidence">{{ o.note }}</div>
              <div v-if="o.evidence" class="entity-quote">"{{ o.evidence }}"</div>
            </div>
          </div>
        </template>

        <div v-else class="t-muted" style="font-size:12px;padding:8px 12px">
          Run an operation to see parsed output here.
        </div>
      </div>

      <!-- Footer: timing + tokens -->
      <div class="col-footer">
        <span class="footer-stat"><b>Elapsed:</b> {{ fmtMs(elapsedDisplay) }}</span>
        <span class="footer-stat" v-if="tokensInDisplay">
          <b>In:</b> {{ tokensInDisplay.toLocaleString() }}
        </span>
        <span class="footer-stat" v-if="tokensOutDisplay">
          <b>Out:</b> {{ tokensOutDisplay.toLocaleString() }}
        </span>
      </div>

    </template>

   </div>
  </div>
</template>

<style scoped>
/* ── Page descriptor ─────────────────────────────────────────────────── */
.wl-desc {
  font-size: 14px; line-height: 1.55; color: var(--muted);
  margin: 0;
}
.wl-desc strong { color: var(--ink-2); font-weight: 600; }

/* ── Layout ─────────────────────────────────────────────────────────── */
.lab {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 22px 26px 60px;
}
/* The lab is both a flex column AND a scroll container. Without
   flex-shrink: 0 on the children, flex compresses them to fit and the
   scrollbar never appears — so the bottom sections (Analysis action
   group, results) get clipped instead of becoming scrollable. */
.lab > * { flex-shrink: 0; }

/* ── Prompt panel ────────────────────────────────────────────────────── */
.prompt-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}

/* ── Run row ─────────────────────────────────────────────────────────── */
.run-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* ── Empty state ─────────────────────────────────────────────────────── */
.empty-state {
  padding: 28px 16px;
  text-align: center;
  font-size: 12.5px;
  color: var(--muted);
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: 10px;
}

/* ── Error strip ─────────────────────────────────────────────────────── */
.error-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 8px;
  background: color-mix(in oklab, var(--danger-ink, #b91c1c) 10%, transparent);
  border: 1px solid color-mix(in oklab, var(--danger-ink, #b91c1c) 30%, transparent);
  color: var(--danger-ink, #b91c1c);
  font-size: 13px;
}

/* ── Result panels ───────────────────────────────────────────────────── */
.result-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.result-eyebrow {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--muted);
  padding: 9px 12px 7px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  display: flex;
  align-items: center;
  gap: 8px;
}

.result-note {
  font-size: 10.5px;
  color: var(--muted);
  padding: 5px 12px 0;
  font-style: italic;
}

.mono-pre {
  margin: 0;
  padding: 10px 12px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 1.55;
  max-height: 320px;
  overflow: auto;
  flex: 1;
  color: var(--ink);
}

/* ── Copy button ─────────────────────────────────────────────────────── */
.copy-btn {
  margin-left: auto;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
  font-family: inherit;
  letter-spacing: 0;
  text-transform: none;
}

.copy-btn:hover {
  background: var(--surface-2);
  color: var(--ink);
}

/* ── Prose render ────────────────────────────────────────────────────── */
.prose-result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
}

.prose-render {
  padding: 12px 14px;
  font-family: var(--font-serif);
  font-size: 14px;
  line-height: 1.7;
  color: var(--ink);
  overflow: auto;
  max-height: 400px;
}

.prose-render :deep(p) {
  margin: 0 0 0.8em;
}

.prose-render :deep(p:last-child) {
  margin-bottom: 0;
}

/* ── Critique notes ──────────────────────────────────────────────────── */
.note-group {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}

.note-group:last-child {
  border-bottom: 0;
}

.note-severity {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 6px;
  padding: 2px 6px;
  border-radius: 4px;
  display: inline-block;
}

.note-severity--flag {
  background: color-mix(in oklab, var(--danger-ink, #b91c1c) 15%, transparent);
  color: var(--danger-ink, #b91c1c);
}

.note-severity--suggest {
  background: var(--suggest-bg);
  color: var(--suggest-ink);
}

.note-severity--info {
  background: var(--surface-2);
  color: var(--muted);
}

.note-item {
  font-size: 12px;
  color: var(--ink);
  line-height: 1.5;
  margin-bottom: 6px;
  padding-left: 8px;
  border-left: 2px solid var(--border);
}

.note-item:last-child {
  margin-bottom: 0;
}

.note-category {
  font-size: 10.5px;
  font-weight: 600;
  font-family: var(--font-mono);
  color: var(--muted);
  margin-right: 6px;
  text-transform: uppercase;
}

/* ── Structural analysis ─────────────────────────────────────────────── */
.struct-grid {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.struct-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.struct-label {
  color: var(--muted);
  font-size: 12px;
}

.struct-val {
  font-family: var(--font-mono);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink);
}

.struct-summary {
  font-size: 12.5px;
  color: var(--ink);
  line-height: 1.55;
  padding-top: 8px;
  border-top: 1px solid var(--border);
  margin-top: 4px;
}

/* ── Entity extraction ───────────────────────────────────────────────── */
.entity-section {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}

.entity-section:last-child {
  border-bottom: 0;
}

.entity-section-title {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 8px;
}

.entity-item {
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

.entity-item:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: 0;
}

.entity-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  margin-right: 6px;
}

.entity-role {
  font-size: 11px;
  color: var(--muted);
  font-family: var(--font-mono);
}

.entity-evidence {
  font-size: 12px;
  color: var(--ink);
  line-height: 1.45;
  margin-top: 3px;
}

.entity-quote {
  font-size: 11.5px;
  color: var(--muted);
  margin-top: 2px;
  font-style: italic;
}

/* ── Footer ──────────────────────────────────────────────────────────── */
.col-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 6px 2px;
  font-size: 11.5px;
  color: var(--muted);
  border-top: 1px solid var(--border);
}

.footer-stat b {
  color: var(--ink);
  font-weight: 600;
}
</style>
