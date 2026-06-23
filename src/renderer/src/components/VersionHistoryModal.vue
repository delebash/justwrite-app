<script setup>
// Per-chapter version history. Save a named snapshot of the chapter's
// scenes, then restore or delete it later. Snapshots live in the
// versions store (separate from undo), scoped to the active project.
//
// The modal has two surfaces:
//   - "list"  — newest-first roster of saved versions with save/restore/delete
//   - "diff"  — rendered comparison between two snapshots, or one snapshot
//               vs the working copy ("current"). Reuses the visual
//               language of Phase 2's AI diff marks (green/red).

import { ref, computed } from "vue";
import { useVersionsStore } from "../stores/versions.js";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { diffVersions, renderDiffHtml, diffStats } from "../services/versionDiff.js";
import Icon from "./Icon.vue";
import AppModal from "./AppModal.vue";
import EmptyState from "./EmptyState.vue";
import { UiButton } from "@delebash/llm-ui";
import { UiInput } from "@delebash/llm-ui";

const props = defineProps({
  chapterId: { type: String, required: true },
  chapterTitle: { type: String, default: "" },
});
const emit = defineEmits(["close"]);

const versions = useVersionsStore();
const project = useProjectStore();
const ui = useUiStore();

const label = ref("");
const list = computed(() => versions.versionsFor(props.chapterId));
// Versions are hydrated per project on demand — pull them in when the modal
// opens so the roster reflects the server's saved snapshots, not an empty list.
versions.ensureLoaded();

// Modes:
//   "list" — default roster
//   "pick" — pick A and B before opening the diff
//   "diff" — rendered comparison panel
const mode = ref("list");

// A and B for two-version compare. Each is either a version id (string)
// or the sentinel "current" meaning the live working copy.
const pickA = ref(null);
const pickB = ref(null);

// Toasts include the chapter title + label/date so the user can confirm
// the action hit the right snapshot. Truncate long strings so the toast
// stays single-line.
function clip(s, n = 30) {
  const v = (s || "").trim();
  return v.length > n ? `${v.slice(0, n - 1)}…` : v;
}
function shortStamp(iso) {
  try {
    const d = new Date(iso);
    const date = d.toLocaleString(undefined, { month: "short", day: "numeric" });
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${date}, ${time}`;
  } catch { return iso || ""; }
}
function chapterLabel() {
  return clip(props.chapterTitle) || "this chapter";
}
function versionLabel(v) {
  return v.label ? `“${clip(v.label)}”` : `version from ${shortStamp(v.savedAt)}`;
}

function save() {
  const userLabel = label.value;
  versions.saveVersion(props.chapterId, userLabel);
  label.value = "";
  const message = userLabel
    ? `Saved “${clip(userLabel)}” — ${chapterLabel()}`
    : `Saved version of ${chapterLabel()}`;
  ui.showToast({ message });
}

function restore(v) {
  versions.restoreVersion(props.chapterId, v.id);
  ui.showToast({ message: `Restored ${versionLabel(v)}` });
  emit("close");
}

function remove(v) {
  const snapshot = { ...v };
  versions.deleteVersion(props.chapterId, v.id);
  ui.showToast({
    message: `Deleted ${versionLabel(snapshot)}`,
    action: { label: "Undo", fn: () => versions.addVersion(props.chapterId, snapshot) },
  });
}

function when(iso) { try { return new Date(iso).toLocaleString(); } catch { return iso; } }

// Build a synthetic "current" version object from the live scenes so
// the diff machinery treats the working copy the same as a saved row.
function currentSnapshot() {
  const scenes = project.scenesFor(props.chapterId).map((s) => ({
    id: s.id,
    title: s.title || "",
    body: s.body || "",
  }));
  return { id: "current", label: "Current draft", savedAt: null, scenes };
}

function getVersionById(id) {
  if (id === "current") return currentSnapshot();
  return list.value.find((v) => v.id === id) || null;
}

// ─── Diff view ──────────────────────────────────────────────────────
const diffData = computed(() => {
  if (mode.value !== "diff") return null;
  const left = getVersionById(pickA.value);
  const right = getVersionById(pickB.value);
  if (!left || !right) return null;
  return {
    left, right,
    entries: diffVersions(left, right),
  };
});
const diffHtml = computed(() => diffData.value ? renderDiffHtml(diffData.value.entries) : "");
const diffSummary = computed(() => diffData.value ? diffStats(diffData.value.entries) : null);

function compareWithCurrent(v) {
  pickA.value = v.id;
  pickB.value = "current";
  mode.value = "diff";
}
function startPickTwo() {
  pickA.value = null;
  pickB.value = null;
  mode.value = "pick";
}
function pickAs(slot, id) {
  if (slot === "A") {
    pickA.value = id === pickA.value ? null : id;
    if (pickA.value === pickB.value) pickB.value = null;
  } else {
    pickB.value = id === pickB.value ? null : id;
    if (pickA.value === pickB.value) pickA.value = null;
  }
}
function runPickedCompare() {
  if (!pickA.value || !pickB.value) return;
  mode.value = "diff";
}
function backToList() {
  mode.value = "list";
  pickA.value = null;
  pickB.value = null;
}

function labelFor(id) {
  if (id === "current") return "Current draft";
  const v = list.value.find((x) => x.id === id);
  return v ? (v.label || "Untitled version") : "—";
}
function whenFor(id) {
  if (id === "current") return "live working copy";
  const v = list.value.find((x) => x.id === id);
  return v ? when(v.savedAt) : "";
}
</script>

<template>
  <AppModal
    eyebrow="Version history"
    :title="chapterTitle || 'Chapter'"
    :wide="mode === 'diff'"
    @close="emit('close')"
  >
    <!-- ── LIST mode ────────────────────────────────────────────── -->
    <div v-if="mode === 'list'" class="vh-list-mode">
      <div class="vh-save">
        <UiInput v-model="label" placeholder="Label this version (optional)…" @keydown.enter="save" />
        <UiButton intent="primary" @click="save"><Icon name="History" :size="14" /> Save version</UiButton>
      </div>
      <p class="t-muted" style="font-size:11.5px;margin:10px 0 6px">
        Snapshots of this chapter's scenes, kept on this device. Newest first.
      </p>
      <div v-if="list.length" class="vh-list">
        <div v-for="v in list" :key="v.id" class="vh-row">
          <div class="vh-main">
            <div class="vh-label">{{ v.label || "Untitled version" }}</div>
            <div class="vh-meta">{{ when(v.savedAt) }} · {{ v.words.toLocaleString() }} words · {{ v.scenes.length }} scene{{ v.scenes.length === 1 ? "" : "s" }}</div>
          </div>
          <UiButton intent="secondary" size="small" @click="compareWithCurrent(v)" v-tooltip.bottom="'See what\'s changed since this version'">
            <Icon name="Replace" :size="12" /> Compare
          </UiButton>
          <UiButton intent="primary" size="small" @click="restore(v)">Restore</UiButton>
          <button class="vh-del" v-tooltip.bottom="'Delete version'" @click="remove(v)"><Icon name="Trash" :size="13" /></button>
        </div>
      </div>
      <EmptyState v-else compact
        icon="History"
        title="No versions saved yet"
        message="Save one before a big revision so you can roll back." />
      <div v-if="list.length >= 2" class="vh-foot">
        <UiButton intent="ghost" size="small" @click="startPickTwo">
          <Icon name="Replace" :size="12" /> Compare two saved versions…
        </UiButton>
      </div>
    </div>

    <!-- ── PICK mode (choose A and B) ───────────────────────────── -->
    <div v-else-if="mode === 'pick'" class="vh-pick-mode">
      <div class="vh-pick-head">
        <UiButton intent="ghost" size="small" @click="backToList">
          <Icon name="ChevRight" :size="12" style="transform:rotate(180deg)" />
          Back
        </UiButton>
        <span class="t-muted" style="font-size:12px">Pick two versions to compare. A is the older / baseline, B is the newer.</span>
      </div>
      <div class="vh-pick-summary">
        <div><span class="t-eyebrow">A</span><b>{{ pickA ? labelFor(pickA) : "(not selected)" }}</b></div>
        <Icon name="ChevRight" :size="14" />
        <div><span class="t-eyebrow">B</span><b>{{ pickB ? labelFor(pickB) : "(not selected)" }}</b></div>
        <UiButton intent="primary" size="small" :disabled="!pickA || !pickB" @click="runPickedCompare">
          <Icon name="Replace" :size="12" /> Compare
        </UiButton>
      </div>
      <div class="vh-list">
        <div class="vh-row vh-row--current">
          <div class="vh-main">
            <div class="vh-label">Current draft</div>
            <div class="vh-meta">live working copy</div>
          </div>
          <UiButton intent="ghost" size="small" class="vh-pick-btn" :class="{ active: pickA === 'current' }" @click="pickAs('A', 'current')">A</UiButton>
          <UiButton intent="ghost" size="small" class="vh-pick-btn" :class="{ active: pickB === 'current' }" @click="pickAs('B', 'current')">B</UiButton>
        </div>
        <div v-for="v in list" :key="v.id" class="vh-row">
          <div class="vh-main">
            <div class="vh-label">{{ v.label || "Untitled version" }}</div>
            <div class="vh-meta">{{ when(v.savedAt) }} · {{ v.words.toLocaleString() }} words</div>
          </div>
          <UiButton intent="ghost" size="small" class="vh-pick-btn" :class="{ active: pickA === v.id }" @click="pickAs('A', v.id)">A</UiButton>
          <UiButton intent="ghost" size="small" class="vh-pick-btn" :class="{ active: pickB === v.id }" @click="pickAs('B', v.id)">B</UiButton>
        </div>
      </div>
    </div>

    <!-- ── DIFF mode ────────────────────────────────────────────── -->
    <div v-else class="vh-diff-mode">
      <div class="vh-diff-head">
        <UiButton intent="ghost" size="small" @click="backToList">
          <Icon name="ChevRight" :size="12" style="transform:rotate(180deg)" />
          Back
        </UiButton>
        <div class="vh-diff-route">
          <span class="vh-diff-route-side">
            <span class="t-eyebrow">From</span>
            <b>{{ labelFor(pickA) }}</b>
            <span class="t-muted" style="font-size:11px">{{ whenFor(pickA) }}</span>
          </span>
          <Icon name="ChevRight" :size="14" />
          <span class="vh-diff-route-side">
            <span class="t-eyebrow">To</span>
            <b>{{ labelFor(pickB) }}</b>
            <span class="t-muted" style="font-size:11px">{{ whenFor(pickB) }}</span>
          </span>
        </div>
        <div v-if="diffSummary" class="vh-diff-stats">
          <span class="vh-stat vh-stat--ins">+{{ diffSummary.ins }}</span>
          <span class="vh-stat vh-stat--del">−{{ diffSummary.del }}</span>
          <span class="t-muted" style="font-size:11px">paragraphs</span>
          <span class="vh-stat-sep">·</span>
          <span class="t-muted" style="font-size:11px">
            {{ diffSummary.scenesChanged }} modified ·
            {{ diffSummary.scenesAdded }} added ·
            {{ diffSummary.scenesRemoved }} removed
          </span>
        </div>
      </div>
      <div class="vh-diff" v-html="diffHtml"></div>
    </div>
  </AppModal>
</template>

<style scoped>
.vh-save { display: flex; gap: 8px; align-items: center; }
.vh-save .input { flex: 1; }
.vh-list { display: flex; flex-direction: column; gap: 6px; overflow: auto; }
.vh-row { display: flex; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); padding: 8px 10px; }
.vh-row--current { background: var(--accent-soft); border-color: var(--accent-line); }
.vh-main { flex: 1; min-width: 0; }
.vh-label { font-size: 13px; font-weight: 500; color: var(--ink); }
.vh-meta { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; margin-top: 2px; }
.vh-del { width: 32px; height: 30px; display: grid; place-items: center; border: 1px solid var(--border); border-radius: 7px; background: var(--surface); color: var(--muted); }
.vh-del:hover { color: var(--danger-ink, #c0392b); border-color: var(--border-strong); }
.vh-foot { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border-soft); display: flex; justify-content: center; }

/* Pick mode */
.vh-pick-head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.vh-pick-summary {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; margin-bottom: 12px;
  background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 8px;
}
.vh-pick-summary > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.vh-pick-summary > div .t-eyebrow { font-size: 9.5px; }
.vh-pick-summary button { margin-left: auto; flex-shrink: 0; }
.vh-pick-btn { min-width: 28px; padding: 0 8px !important; font-family: var(--font-mono); font-weight: 600; }
.vh-pick-btn.active { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }

/* Diff view */
.vh-diff-mode { display: flex; flex-direction: column; gap: 14px; overflow: hidden; }
.vh-diff-head {
  display: flex; flex-direction: column; gap: 10px;
  padding-bottom: 10px; border-bottom: 1px solid var(--border);
}
.vh-diff-route {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 8px;
}
.vh-diff-route-side { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.vh-diff-route-side b { font-size: 13px; }
.vh-diff-route-side .t-eyebrow { font-size: 9.5px; }
.vh-diff-stats { display: flex; align-items: center; gap: 8px; font-size: 12px; font-variant-numeric: tabular-nums; }
.vh-stat { font-family: var(--font-mono); font-weight: 600; }
.vh-stat--ins { color: var(--status-done); }
.vh-stat--del { color: var(--danger-ink, #c0392b); }
.vh-stat-sep { color: var(--muted); margin: 0 4px; }

.vh-diff {
  overflow: auto; flex: 1;
  padding: 18px 20px;
  background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 8px;
  font-family: var(--font-serif); font-size: 14px; line-height: 1.6;
  color: var(--ink-2);
}
.vh-diff :deep(.vdiff-scene) { padding: 6px 0 14px; border-bottom: 1px dashed var(--border-soft); margin-bottom: 14px; }
.vh-diff :deep(.vdiff-scene:last-child) { border-bottom: 0; margin-bottom: 0; }
.vh-diff :deep(.vdiff-scene-title) {
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted);
  margin: 0 0 8px; font-weight: 600;
}
.vh-diff :deep(.vdiff-scene--ins) {
  background: color-mix(in oklab, var(--status-done) 10%, transparent);
  padding: 12px 14px; border-radius: 8px;
}
.vh-diff :deep(.vdiff-scene--del) {
  background: color-mix(in oklab, var(--danger-ink, #b91c1c) 10%, transparent);
  padding: 12px 14px; border-radius: 8px;
  opacity: 0.85;
}
.vh-diff :deep(.vdiff-row) { margin: 4px 0; padding: 4px 8px; border-radius: 4px; }
.vh-diff :deep(.vdiff-row--ins) { background: color-mix(in oklab, var(--status-done) 14%, transparent); }
.vh-diff :deep(.vdiff-row--del) { background: color-mix(in oklab, var(--danger-ink, #b91c1c) 12%, transparent); }
.vh-diff :deep(.vdiff-row--mod) {
  background: color-mix(in oklab, var(--accent) 8%, transparent);
  border-left: 3px solid var(--accent-line);
  padding-left: 10px;
}
.vh-diff :deep(.vdiff-ins) {
  text-decoration: none;
  border-bottom: 2px solid color-mix(in oklab, var(--status-done) 60%, transparent);
}
.vh-diff :deep(.vdiff-del) {
  text-decoration: line-through;
  text-decoration-color: color-mix(in oklab, var(--danger-ink, #b91c1c) 60%, transparent);
  color: var(--muted);
}
.vh-diff :deep(.vdiff-empty) {
  text-align: center; font-style: italic; color: var(--muted);
  padding: 40px 20px;
}
</style>
