<script setup>
// Writer Lab — debug/compare view at /#/debug/writer-lab
//
// Multi-column model compare. Each column has its own provider/model picker
// and runs independently. Columns share the same input + action picker via
// WriterLabBase.

import { ref, computed } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useAiStore } from "../stores/ai.js";
import { useAiTasksStore } from "../stores/aiTasks.js";
import PaneHeader from "../components/PaneHeader.vue";
import { Icon } from "@delebash/llm-ui";
import AiTaskStrip from "../components/AiTaskStrip.vue";
import ModelPicker from "../components/ModelPicker.vue";
import ProviderSelect from "../components/ProviderSelect.vue";
import WriterLabBase from "../components/WriterLabBase.vue";

import { PACING_LABELS, ENDING_LABELS } from "../services/analysis/critique.js";
import { dispatchRun, reconstructPrompt, textToHtml, fmtMs } from "../services/writerLab.js";
import { UiButton } from "@delebash/llm-ui";
import { UiCheckbox } from "@delebash/llm-ui";

const project = useProjectStore();
const ai      = useAiStore();
const aiTasks = useAiTasksStore();

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

// ─── Columns ─────────────────────────────────────────────────────────────
const COL_LABELS = ["A", "B", "C", "D"];

function makeColumn() {
  return {
    id:         `col_${Math.random().toString(36).slice(2, 8)}`,
    providerId: ai.defaultLlmId,
    model:      "",
    // Per-run id stamped into the task meta so we can find this column's
    // task in the global store. Cleared after the run ends; the column
    // owns the lastRun snapshot for post-completion footer stats.
    runId:      null,
    startedAt:  0,
    lastRun:    { elapsedMs: 0, tokensIn: 0, tokensOut: 0 },
    result:     null,
    error:      "",
  };
}

const columns = ref([makeColumn()]);

function colTask(col) {
  return col.runId
    ? aiTasks.runningTasks.find((t) => t.meta?.writerLabRunId === col.runId)
    : null;
}
function colRunning(col) { return !!colTask(col); }
function colElapsed(col) {
  const t = colTask(col);
  return t ? aiTasks.now - t.startedAt : col.lastRun.elapsedMs;
}
function colTokensIn(col)  { return colTask(col)?.tokensIn  ?? col.lastRun.tokensIn; }
function colTokensOut(col) { return colTask(col)?.tokensOut ?? col.lastRun.tokensOut; }

function addColumn() {
  if (columns.value.length >= 4) return;
  columns.value.push(makeColumn());
}

function removeColumn(col) {
  const t = colTask(col);
  if (t) aiTasks.cancel(t.id);
  columns.value = columns.value.filter((c) => c !== col);
}

// ─── Per-column helpers ───────────────────────────────────────────────────
function colRawResponse(col) {
  const t = colTask(col);
  if (!col.result) return t?.preview || "";
  if (col.result.raw) return col.result.raw;
  return t?.preview || "";
}

function colResultModel(col) {
  const provider = ai.providerById(col.providerId);
  return col.model || provider?.defaultModel || ai.llmProvider?.defaultModel || "—";
}

function isAbort(e) { return e?.name === "AbortError" || /abort/i.test(e?.message || ""); }

// ─── Run dispatch ─────────────────────────────────────────────────────────
const anyRunning = computed(() => columns.value.some((c) => colRunning(c)));

const canRunAll = computed(() =>
  base.value.inputText.trim() && selectedAction.value && !anyRunning.value,
);

async function runOneColumn(col) {
  col.result = null;
  col.error  = "";

  const html     = textToHtml(base.value.inputText);
  const provider = ai.providerById(col.providerId);
  const model    = col.model || undefined;
  const runId = `wld_${Math.random().toString(36).slice(2, 10)}`;
  col.runId = runId;
  col.startedAt = Date.now();

  try {
    const res = await dispatchRun(selectedAction.value, {
      html,
      provider,
      model,
      project,
      task: {
        label: `Writer Lab · ${selectedAction.value.label} · ${col.model || provider?.defaultModel || "default"}`,
        meta: { writerLab: true, writerLabRunId: runId, columnId: col.id, actionKey: selectedAction.value.key },
      },
    });
    col.result = res;
    col.lastRun = {
      elapsedMs: Date.now() - col.startedAt,
      tokensIn:  res?.usage?.prompt_tokens     || 0,
      tokensOut: res?.usage?.completion_tokens || 0,
    };
  } catch (e) {
    if (!isAbort(e)) col.error = e?.message || String(e);
  } finally {
    col.runId = null;
  }
}

function runAll() {
  if (!canRunAll.value) return;
  for (const col of columns.value) col.error = "";
  Promise.all(columns.value.map(runOneColumn));
}

// ─── Copy helpers ─────────────────────────────────────────────────────────
function copyHtml(col) {
  if (col.result?.html) navigator.clipboard?.writeText(col.result.html).catch(() => {});
}

function copyRaw(col) {
  const text = colRawResponse(col);
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
  <PaneHeader :eyebrow="$t('panes.writerLabDebug.eyebrow')" :title="$t('panes.writerLabDebug.title')" help-key="writer-lab" />

  <div class="pane-card">
   <div class="scrollarea lab">

    <!-- ── SHARED INPUT + ACTION PICKER ──────────────────────────────── -->
    <WriterLabBase v-model="base" />

    <!-- ── PROMPT PREVIEW (shared across all columns) ─────────────────── -->
    <div v-if="promptPreview" class="result-panel prompt-panel">
      <div class="result-eyebrow">Reconstructed prompt</div>
      <div class="result-note">Approximation — identical for every column.</div>
      <pre class="mono-pre">{{ promptPreview }}</pre>
    </div>

    <!-- ── COLUMNS TOOLBAR ────────────────────────────────────────────── -->
    <div class="run-row">
      <UiButton intent="primary" @click="runAll" :disabled="!canRunAll">
        <Icon name="Sparkle" :size="13" />
        Run all{{ columns.length > 1 ? ` (${columns.length})` : "" }}
      </UiButton>
      <UiButton intent="secondary" size="small" @click="addColumn" :disabled="columns.length >= 4">
        <Icon name="Plus" :size="12" /> Add column
      </UiButton>
      <span v-if="!selectedAction" class="t-muted" style="font-size:12px">
        Select an operation above.
      </span>
    </div>

    <!-- ── COLUMNS ────────────────────────────────────────────────────── -->
    <div :class="['columns', `cols-${columns.length}`]">
      <div v-for="(col, idx) in columns" :key="col.id" class="col-wrap">

        <!-- Column header -->
        <div class="col-header">
          <span class="col-label">Column {{ COL_LABELS[idx] }}</span>
          <ProviderSelect
            v-model="col.providerId"
            kind="llm"
            @update:modelValue="col.model = ''"
          />
          <ModelPicker v-model="col.model" :provider-id="col.providerId" />
          <UiCheckbox
            v-model="base.showPreview"
            class="toggle-label"
            :class="{ 'toggle-label--dim': !isProseAction }"
            :title="isProseAction ? 'Show preview while streaming' : 'Preview only available for prose actions'"
            :disabled="!isProseAction"
          >Preview</UiCheckbox>
          <UiButton
            intent="ghost"
            size="small"
            @click="removeColumn(col)"
            :disabled="columns.length <= 1"
            v-tooltip.bottom="'Remove column'"
          >
            <template #icon><Icon name="Trash" :size="13" /></template>
          </UiButton>
        </div>

        <!-- Progress bar -->
        <AiTaskStrip :task="colTask(col)" />

        <!-- Error -->
        <div v-if="col.error" class="error-strip">
          <Icon name="Close" :size="13" />
          {{ col.error }}
        </div>

        <!-- Empty state -->
        <div
          v-if="!col.result && !colRawResponse(col) && !colRunning(col) && !col.error"
          class="empty-state"
        >
          Press Run to compare against this model.
        </div>

        <!-- Result panels -->
        <template v-if="col.result || colRawResponse(col)">

          <!-- Raw response -->
          <div class="result-panel">
            <div class="result-eyebrow">
              Raw response
              <button class="copy-btn" @click="copyRaw(col)" v-tooltip.bottom="'Copy raw response'">Copy</button>
            </div>
            <pre class="mono-pre">{{ colRawResponse(col) || "(streaming…)" }}</pre>
          </div>

          <!-- Parsed result -->
          <div class="result-panel">
            <div class="result-eyebrow">Parsed result</div>

            <!-- Prose actions: rendered HTML -->
            <template v-if="col.result && (selectedAction?.kind === 'writerAction' || selectedAction?.kind === 'rule')">
              <div class="prose-result-header">
                <span class="t-muted" style="font-size:11.5px">Rendered output</span>
                <button class="copy-btn" @click="copyHtml(col)">Copy HTML</button>
              </div>
              <div class="prose-render" v-html="col.result.html" />
            </template>

            <!-- Critique notes -->
            <template v-else-if="col.result && selectedAction?.key === 'critique'">
              <div v-if="!col.result.notes?.length" class="t-muted" style="font-size:12px;padding:8px 12px">No notes returned.</div>
              <div v-for="group in notesByGroup(col.result.notes)" :key="group.severity" class="note-group">
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
            <template v-else-if="col.result && selectedAction?.key === 'structure'">
              <div class="struct-grid">
                <div class="struct-row">
                  <span class="struct-label">Tension</span>
                  <span class="struct-val">{{ col.result.tension }} / 10</span>
                </div>
                <div class="struct-row">
                  <span class="struct-label">Hook quality</span>
                  <span class="struct-val">{{ col.result.hookQuality }} / 10</span>
                </div>
                <div class="struct-row">
                  <span class="struct-label">Pacing</span>
                  <span class="struct-val">{{ PACING_LABELS[col.result.pacing] || col.result.pacing }}</span>
                </div>
                <div class="struct-row">
                  <span class="struct-label">Ending</span>
                  <span class="struct-val">{{ ENDING_LABELS[col.result.endingClass] || col.result.endingClass }}</span>
                </div>
                <div v-if="col.result.summary" class="struct-summary">{{ col.result.summary }}</div>
              </div>
            </template>

            <!-- Entity extraction -->
            <template v-else-if="col.result && selectedAction?.key === 'entities'">
              <div class="entity-section">
                <div class="entity-section-title">Characters ({{ col.result.characters?.length || 0 }})</div>
                <div v-if="!col.result.characters?.length" class="t-muted" style="font-size:12px">None proposed.</div>
                <div v-for="c in col.result.characters" :key="c.name" class="entity-item">
                  <span class="entity-name">{{ c.name }}</span>
                  <span class="entity-role">{{ c.role }}</span>
                  <div class="entity-evidence">{{ c.oneLiner }}</div>
                  <div v-if="c.evidence" class="entity-quote">"{{ c.evidence }}"</div>
                </div>
              </div>
              <div class="entity-section">
                <div class="entity-section-title">Locations ({{ col.result.locations?.length || 0 }})</div>
                <div v-if="!col.result.locations?.length" class="t-muted" style="font-size:12px">None proposed.</div>
                <div v-for="l in col.result.locations" :key="l.name" class="entity-item">
                  <span class="entity-name">{{ l.name }}</span>
                  <span class="entity-role">{{ l.kind }}</span>
                  <div class="entity-evidence">{{ l.note }}</div>
                  <div v-if="l.evidence" class="entity-quote">"{{ l.evidence }}"</div>
                </div>
              </div>
              <div class="entity-section">
                <div class="entity-section-title">Objects ({{ col.result.objects?.length || 0 }})</div>
                <div v-if="!col.result.objects?.length" class="t-muted" style="font-size:12px">None proposed.</div>
                <div v-for="o in col.result.objects" :key="o.name" class="entity-item">
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

          <!-- Column footer: timing + tokens -->
          <div class="col-footer">
            <span class="footer-stat"><b>Elapsed:</b> {{ fmtMs(colElapsed(col)) }}</span>
            <span class="footer-stat" v-if="colTokensIn(col)">
              <b>In:</b> {{ colTokensIn(col).toLocaleString() }}
            </span>
            <span class="footer-stat" v-if="colTokensOut(col)">
              <b>Out:</b> {{ colTokensOut(col).toLocaleString() }}
            </span>
            <span class="footer-stat"><b>Model:</b> {{ colResultModel(col) }}</span>
          </div>

        </template>
      </div>
    </div>

   </div>
  </div>
</template>

<style scoped>
/* ── Layout ─────────────────────────────────────────────────────────── */
.lab {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 22px 26px 60px;
}
/* Flex children don't shrink — otherwise the scrollarea never overflows
   and the bottom sections (Analysis group, results) get clipped. */
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

/* ── Toggle ──────────────────────────────────────────────────────────── */
.toggle-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--ink);
  cursor: pointer;
  white-space: nowrap;
}

.toggle-label--dim {
  opacity: 0.45;
  pointer-events: none;
}

/* ── Columns grid ────────────────────────────────────────────────────── */
.columns {
  display: grid;
  gap: 14px;
}

.columns.cols-1 { grid-template-columns: 1fr; }
.columns.cols-2 { grid-template-columns: 1fr 1fr; }
.columns.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
.columns.cols-4 { grid-template-columns: 1fr 1fr 1fr 1fr; }

@media (max-width: 1100px) {
  .columns { grid-template-columns: 1fr !important; }
}

.col-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

/* ── Column header ───────────────────────────────────────────────────── */
.col-header {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  flex-wrap: wrap;
}

.col-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--muted);
  white-space: nowrap;
  margin-right: 2px;
}

.icon-btn {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface);
  display: grid;
  place-items: center;
  color: var(--muted);
  cursor: pointer;
  flex-shrink: 0;
}

.icon-btn:hover:not(:disabled) {
  color: var(--ink);
  border-color: var(--border-strong);
}

.icon-btn:disabled {
  opacity: 0.35;
  cursor: default;
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
  max-height: 320px;
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

/* ── Column footer ───────────────────────────────────────────────────── */
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
