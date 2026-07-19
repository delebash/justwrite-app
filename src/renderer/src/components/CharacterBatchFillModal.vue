<script setup>
// Batch "Fill from book" — draft profile + voice for MANY characters at once,
// from the scenes that feature each (2026-07-19).
//
// Four phases: pick → run → review → done.
//   PICK  — a character checklist (mains pre-checked, zero-scene rows disabled),
//           All/None, the auto-apply-empty-only toggle, and a cost line.
//   RUN   — sequential per character (single-slot honesty, like the sweep's C2),
//           profile then voice, each wrapped in the sweep's per-call watchdog.
//           A failure marks that character failed and the batch continues.
//   REVIEW— (auto-apply OFF only) one grouped review; empty-current default tick.
//   DONE  — summary + Retry-failed.
//
// RULE #1 precedents: EntitySweepModal (pick list · per-row progress · footer
// CTA · All/None `.tb-btn` · watchdog) and CharacterProfileFillModal (row shape,
// grouped review, empty-only ticks). The field-defs / draft-rows / apply layer
// is shared with the single modal (characterProfile.js, WS-A — QC-35).
//
// Undo note: each applied character is 1–2 store actions; a large batch writes
// many `characters`-domain history entries and may evict older undo history
// (HISTORY_LIMIT). Accepted — durable rollback is the server autosave, not undo.

import { computed, onMounted, ref } from "vue";
import { useProjectStore } from "../stores/project.js";
import { AppModal, Icon, UiButton, UiCheckbox, UiTextarea, friendlyAiError } from "@delebash/llm-ui";
import {
  profileFromBook, voiceFromBook,
  profileFieldDefs, voiceFieldDefs, draftRows, emptyOnlyPicks, applyProfileDrafts,
} from "../services/analysis/characterProfile.js";
import { characterSceneCount } from "../services/analysis/characterAudit.js";
import { watchdogTimeoutMs } from "../services/analysis/entitySweep.js";
import AiFeatureChip from "./AiFeatureChip.vue";

const props = defineProps({
  // When set (from the sweep-accept chain), pre-check exactly these ids.
  // Otherwise the mains (with linked scenes) are pre-checked.
  preCheckedIds: { type: Array, default: null },
});
const emit = defineEmits(["close"]);

const project = useProjectStore();
const phase = ref("pick"); // pick | run | review | done

// ── PICK ────────────────────────────────────────────────────────────────
const pickRows = ref([]); // { id, name, role, scenes, checked, disabled }
const autoApply = ref(false);

function buildPickRows() {
  const chars = [...(project.characters || [])];
  chars.sort((a, b) => (Number(!!b.main) - Number(!!a.main)) || (a.name || "").localeCompare(b.name || ""));
  pickRows.value = chars.map((c) => {
    const scenes = characterSceneCount(project, c.id);
    return { id: c.id, name: c.name || "Unnamed", role: c.role || "", scenes, checked: false, disabled: scenes === 0 };
  });
  const pre = props.preCheckedIds;
  const mainOf = new Map((project.characters || []).map((c) => [c.id, !!c.main]));
  for (const r of pickRows.value) {
    if (r.disabled) { r.checked = false; continue; }
    r.checked = pre ? pre.includes(r.id) : mainOf.get(r.id) === true;
  }
}
onMounted(buildPickRows);

const checkedCount = computed(() => pickRows.value.filter((r) => r.checked && !r.disabled).length);
function setAllPicks(on) { for (const r of pickRows.value) if (!r.disabled) r.checked = on; }

// ── RUN ─────────────────────────────────────────────────────────────────
const runs = ref([]); // { id, name, status, error, fieldsFilled, draft, voiceFailed }
const batchAbort = ref(null);
const cancelled = ref(false);
const appliedTotal = ref(0);

// One AI call under the sweep's watchdog: a per-call controller mirroring the
// batch signal + a timeout that scales with the rolling median call time.
async function callWithWatchdog(fn, signal, durations) {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal.addEventListener("abort", onAbort);
  const t0 = Date.now();
  const timer = setTimeout(() => ctrl.abort(), watchdogTimeoutMs(durations));
  try {
    const out = await fn(ctrl.signal);
    durations.push(Date.now() - t0);
    return out;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

function isAbort(e) { return e?.name === "AbortError" || /abort|cancel/i.test(e?.message || ""); }

async function runBatch() {
  phase.value = "run";
  cancelled.value = false;
  batchAbort.value = new AbortController();
  const signal = batchAbort.value.signal;
  const durations = [];

  for (const row of runs.value) {
    if (row.status !== "pending") continue; // already done in a prior round (retry)
    if (cancelled.value) { row.status = "skipped"; continue; }

    row.status = "profile";
    let profile = null;
    try {
      profile = await callWithWatchdog((sig) => profileFromBook({ project, characterId: row.id, signal: sig }), signal, durations);
    } catch (e) {
      if (cancelled.value) { row.status = "cancelled"; break; }
      row.status = "failed"; row.error = friendlyAiError(e); continue; // no profile → skip voice
    }
    if (!profile) { row.status = "failed"; row.error = "No linked scenes to draft from."; continue; }

    row.status = "voice";
    let voice = null;
    try {
      voice = await callWithWatchdog((sig) => voiceFromBook({ project, characterId: row.id, signal: sig }), signal, durations);
    } catch (e) {
      if (cancelled.value) { row.status = "cancelled"; break; }
      row.voiceFailed = true; // profile stands; voice is best-effort
    }
    finishRow(row, profile, voice);
  }

  if (cancelled.value) for (const r of runs.value) if (r.status === "pending" || r.status === "profile" || r.status === "voice") r.status = "skipped";

  if (autoApply.value) { phase.value = "done"; return; }
  buildReview();
  phase.value = reviewGroups.value.length ? "review" : "done";
}

function finishRow(row, profile, voice) {
  if (autoApply.value) {
    const c = (project.characters || []).find((x) => x.id === row.id) || {};
    const x = project.characterExtras?.[row.id] || {};
    const picks = [
      ...emptyOnlyPicks(profileFieldDefs(c, x), profile.fields),
      ...(voice ? emptyOnlyPicks(voiceFieldDefs(x), voice.fields) : []),
    ];
    row.fieldsFilled = applyProfileDrafts(project, row.id, picks);
    appliedTotal.value += row.fieldsFilled;
  } else {
    row.draft = { profile: profile.fields, voice: voice ? voice.fields : null };
  }
  row.status = "done";
}

function startRun() {
  const chosen = pickRows.value.filter((r) => r.checked && !r.disabled);
  if (!chosen.length) return;
  appliedTotal.value = 0;
  runs.value = chosen.map((r) => ({ id: r.id, name: r.name, status: "pending", error: "", fieldsFilled: 0, draft: null, voiceFailed: false }));
  runBatch();
}

function cancelBatch() { cancelled.value = true; batchAbort.value?.abort(); }

const failedCount = computed(() => runs.value.filter((r) => r.status === "failed").length);
const doneCount = computed(() => runs.value.filter((r) => r.status === "done").length);
function retryFailed() {
  for (const r of runs.value) if (r.status === "failed") { r.status = "pending"; r.error = ""; r.voiceFailed = false; }
  reviewGroups.value = [];
  runBatch();
}

function statusText(row) {
  switch (row.status) {
    case "pending": return "Waiting…";
    case "profile": return "Drafting profile…";
    case "voice": return "Drafting voice…";
    case "cancelled": return "Cancelled";
    case "skipped": return "Skipped";
    case "failed": return row.error || "Failed";
    case "done": return autoApply.value
      ? `${row.fieldsFilled} field${row.fieldsFilled === 1 ? "" : "s"} filled${row.voiceFailed ? " · voice skipped" : ""}`
      : `drafted${row.voiceFailed ? " · voice skipped" : ""}`;
    default: return "";
  }
}

// ── REVIEW (auto-apply OFF) ──────────────────────────────────────────────
const reviewGroups = ref([]); // [{ id, name, rows: [{ key,label,current,proposed,accept,section }] }]

function buildReview() {
  const out = [];
  for (const row of runs.value) {
    if (row.status !== "done" || !row.draft) continue;
    const c = (project.characters || []).find((x) => x.id === row.id) || {};
    const x = project.characterExtras?.[row.id] || {};
    const rr = [
      ...draftRows(profileFieldDefs(c, x), row.draft.profile).map((r) => ({ ...r, section: "Profile" })),
      ...(row.draft.voice ? draftRows(voiceFieldDefs(x), row.draft.voice).map((r) => ({ ...r, section: "Voice" })) : []),
    ];
    if (rr.length) out.push({ id: row.id, name: row.name, rows: rr });
  }
  reviewGroups.value = out;
}

const reviewTicked = computed(() => reviewGroups.value.reduce((n, g) => n + g.rows.filter((r) => r.accept).length, 0));
const reviewTotal = computed(() => reviewGroups.value.reduce((n, g) => n + g.rows.length, 0));
function setAllReview(on) { for (const g of reviewGroups.value) for (const r of g.rows) r.accept = on; }
function setGroup(g, on) { for (const r of g.rows) r.accept = on; }

function reviewApply() {
  let total = 0;
  for (const g of reviewGroups.value) {
    const picked = g.rows.filter((r) => r.accept);
    if (picked.length) total += applyProfileDrafts(project, g.id, picked);
  }
  appliedTotal.value = total;
  // consume the drafts so a later Retry round's review shows only new work.
  for (const row of runs.value) if (row.status === "done") row.draft = null;
  phase.value = "done";
}

function onClose() { batchAbort.value?.abort(); emit("close"); }
</script>

<template>
  <AppModal wide eyebrow="Fill from book" title="Draft many characters"
    :closable="phase !== 'run'" @close="onClose">
    <template #header-extra>
      <AiFeatureChip feature="characterProfile" label="Character profile" editable />
    </template>

    <!-- ── PICK ────────────────────────────────────────────────── -->
    <template v-if="phase === 'pick'">
      <p class="cbf-desc">
        Runs the same two passes as a single character's Fill from book — profile, then voice —
        for every character you tick, one at a time. Characters with no linked scenes can't be
        drafted from.
      </p>
      <div class="cbf-bar">
        <span class="t-muted">{{ checkedCount }} of {{ pickRows.length }} selected</span>
        <div class="cbf-bar-actions">
          <button type="button" class="tb-btn wide" @click="setAllPicks(true)">All</button>
          <button type="button" class="tb-btn wide" @click="setAllPicks(false)">None</button>
        </div>
      </div>
      <div class="cbf-list">
        <label v-for="r in pickRows" :key="r.id" class="cbf-pick-row" :class="{ off: r.disabled }">
          <UiCheckbox v-model="r.checked" :disabled="r.disabled" />
          <span class="cbf-pick-name">{{ r.name }}</span>
          <span v-if="r.role" class="cbf-pick-role">{{ r.role }}</span>
          <span class="cbf-pick-scenes">{{ r.disabled ? "no linked scenes" : `${r.scenes} scene${r.scenes === 1 ? "" : "s"}` }}</span>
        </label>
      </div>
      <label class="cbf-toggle">
        <UiCheckbox v-model="autoApply" />
        <span>
          Apply automatically — empty fields only (skip review)
          <span class="cbf-toggle-hint">Nothing you've written is ever overwritten. Proposals land as each character finishes; review mode is the default.</span>
        </span>
      </label>
    </template>

    <!-- ── RUN ─────────────────────────────────────────────────── -->
    <template v-else-if="phase === 'run'">
      <p class="cbf-desc">
        {{ autoApply ? "Drafting and filling empty fields as each character finishes." : "Drafting — you'll review everything before anything saves." }}
      </p>
      <div class="cbf-list">
        <div v-for="row in runs" :key="row.id" class="cbf-run-row">
          <Icon :name="row.status === 'done' ? 'Check' : row.status === 'failed' ? 'Alert' : 'Sparkle'" :size="14"
            :class="['cbf-run-icon', row.status, { spin: row.status === 'profile' || row.status === 'voice' }]" />
          <span class="cbf-pick-name">{{ row.name }}</span>
          <span class="cbf-run-status" :class="row.status">{{ statusText(row) }}</span>
        </div>
      </div>
    </template>

    <!-- ── REVIEW ──────────────────────────────────────────────── -->
    <template v-else-if="phase === 'review'">
      <div class="cbf-bar">
        <span class="t-muted">{{ reviewTicked }} of {{ reviewTotal }} selected</span>
        <div class="cbf-bar-actions">
          <button type="button" class="tb-btn wide" @click="setAllReview(true)">All</button>
          <button type="button" class="tb-btn wide" @click="setAllReview(false)">None</button>
        </div>
      </div>
      <div class="cbf-review">
        <div v-for="g in reviewGroups" :key="g.id" class="cbf-group">
          <div class="cbf-group-h">
            <span class="cbf-group-name">{{ g.name }}</span>
            <span style="flex:1" />
            <button type="button" class="tb-btn wide" @click="setGroup(g, true)">All</button>
            <button type="button" class="tb-btn wide" @click="setGroup(g, false)">None</button>
          </div>
          <div v-for="r in g.rows" :key="r.key" class="cpf-row" :class="{ dropped: !r.accept }">
            <UiCheckbox v-model="r.accept" class="cpf-check" />
            <div class="cpf-fields">
              <div class="cpf-label">
                {{ r.label }}
                <span v-if="r.current" class="cpf-overwrite">replaces what you wrote</span>
              </div>
              <div v-if="r.current" class="cpf-current">{{ r.current }}</div>
              <UiTextarea fluid auto-resize :rows="2" v-model="r.proposed" :disabled="!r.accept" />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ── DONE ────────────────────────────────────────────────── -->
    <template v-else>
      <div class="cbf-done">
        <Icon name="Check" :size="20" class="cbf-done-icon" />
        <p>
          {{ autoApply
            ? `Drafted ${doneCount} of ${runs.length} characters — ${appliedTotal} field${appliedTotal === 1 ? "" : "s"} filled.`
            : `Applied ${appliedTotal} field${appliedTotal === 1 ? "" : "s"} across ${doneCount} character${doneCount === 1 ? "" : "s"}.` }}
          <span v-if="failedCount" class="cbf-done-failed">{{ failedCount }} failed.</span>
        </p>
      </div>
      <div v-if="failedCount" class="cbf-list">
        <div v-for="row in runs.filter((r) => r.status === 'failed')" :key="row.id" class="cbf-run-row">
          <Icon name="Alert" :size="14" class="cbf-run-icon failed" />
          <span class="cbf-pick-name">{{ row.name }}</span>
          <span class="cbf-run-status failed">{{ row.error }}</span>
        </div>
      </div>
    </template>

    <template #footer>
      <!-- PICK -->
      <template v-if="phase === 'pick'">
        <span class="t-muted">{{ checkedCount }} selected · {{ checkedCount * 2 }} model calls</span>
        <span style="flex:1" />
        <UiButton intent="ghost" @click="onClose">Close</UiButton>
        <UiButton intent="primary" :disabled="!checkedCount" @click="startRun">
          <Icon name="Book" :size="13" /> Fill {{ checkedCount }} character{{ checkedCount === 1 ? "" : "s" }}
        </UiButton>
      </template>
      <!-- RUN -->
      <template v-else-if="phase === 'run'">
        <span class="t-muted">{{ doneCount }} of {{ runs.length }} done</span>
        <span style="flex:1" />
        <UiButton intent="ghost" @click="cancelBatch">Cancel</UiButton>
      </template>
      <!-- REVIEW -->
      <template v-else-if="phase === 'review'">
        <span style="flex:1" />
        <UiButton intent="ghost" @click="onClose">Discard</UiButton>
        <UiButton intent="primary" :disabled="!reviewTicked" @click="reviewApply">
          <Icon name="Check" :size="13" /> Apply {{ reviewTicked }} field{{ reviewTicked === 1 ? "" : "s" }}
        </UiButton>
      </template>
      <!-- DONE -->
      <template v-else>
        <span style="flex:1" />
        <UiButton v-if="failedCount" intent="secondary" @click="retryFailed">Retry {{ failedCount }} failed</UiButton>
        <UiButton intent="primary" @click="onClose">Done</UiButton>
      </template>
    </template>
  </AppModal>
</template>

<style scoped>
.cbf-desc { font-size: 12px; line-height: 1.55; color: var(--muted); margin: 0 0 12px; }
.cbf-bar { display: flex; align-items: center; gap: 8px; padding: 0 2px 6px; }
.cbf-bar-actions { display: flex; gap: 4px; margin-left: auto; }
.cbf-list {
  border: 1px solid var(--border-soft); border-radius: 8px;
  background: var(--surface-2); max-height: 46vh; overflow-y: auto;
}
.cbf-pick-row {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 12px; border-bottom: 1px solid var(--border-soft);
  cursor: pointer; transition: opacity .15s;
}
.cbf-pick-row:last-child { border-bottom: none; }
.cbf-pick-row:hover { background: var(--surface-3); }
.cbf-pick-row.off { opacity: 0.5; cursor: default; }
.cbf-pick-name { font-size: 13px; color: var(--ink); }
.cbf-pick-role { font-size: 12px; color: var(--muted); }
.cbf-pick-scenes {
  margin-left: auto; font-family: var(--font-mono); font-size: 11px; color: var(--muted);
  white-space: nowrap;
}
.cbf-toggle {
  display: flex; align-items: flex-start; gap: 8px; margin-top: 14px; cursor: pointer;
  font-size: 13px; color: var(--ink-2);
}
.cbf-toggle-hint { display: block; font-size: 11.5px; color: var(--muted); margin-top: 3px; line-height: 1.5; }

.cbf-run-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px; border-bottom: 1px solid var(--border-soft);
}
.cbf-run-row:last-child { border-bottom: none; }
.cbf-run-icon { color: var(--muted); flex: none; }
.cbf-run-icon.done { color: var(--status-done, var(--accent)); }
.cbf-run-icon.failed { color: var(--danger-ink, #b91c1c); }
.cbf-run-icon.spin { color: var(--accent); animation: cbf-spin 1.1s linear infinite; }
@keyframes cbf-spin { to { transform: rotate(360deg); } }
.cbf-run-status { margin-left: auto; font-size: 12px; color: var(--muted); }
.cbf-run-status.failed { color: var(--danger-ink, #b91c1c); }
.cbf-run-status.done { color: var(--ink-2); }

.cbf-review { display: flex; flex-direction: column; gap: 16px; max-height: 56vh; overflow-y: auto; padding-right: 2px; }
.cbf-group { display: flex; flex-direction: column; gap: 8px; }
.cbf-group-h { display: flex; align-items: center; gap: 4px; }
.cbf-group-name { font-family: var(--font-serif); font-weight: 600; font-size: 15px; }

.cbf-done { display: flex; align-items: center; gap: 12px; padding: 14px 4px 18px; }
.cbf-done-icon { color: var(--status-done, var(--accent)); flex: none; }
.cbf-done p { margin: 0; font-size: 14px; color: var(--ink); }
.cbf-done-failed { color: var(--danger-ink, #b91c1c); margin-left: 6px; }

/* Review-row shape — same class NAMES as CharacterProfileFillModal (scoped
   styles don't cross components; keep names identical for grep-ability). */
.cpf-row {
  display: grid; grid-template-columns: auto 1fr; gap: 12px;
  padding: 10px 12px; border: 1px solid var(--border-soft); border-radius: 8px;
  background: var(--surface); transition: opacity .15s, background .15s;
}
.cpf-row.dropped { opacity: 0.55; background: var(--surface-2); }
.cpf-check { display: flex; align-items: flex-start; padding-top: 4px; cursor: pointer; }
.cpf-fields { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.cpf-label {
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted);
  display: flex; align-items: center; gap: 8px;
}
.cpf-overwrite {
  font-family: var(--font-ui); text-transform: none; letter-spacing: 0;
  font-size: 11px; color: var(--danger-ink, #b91c1c);
}
.cpf-current {
  font-size: 12px; color: var(--muted); line-height: 1.5;
  padding: 6px 9px; border-radius: 6px; background: var(--surface-2); white-space: pre-wrap;
}
</style>
