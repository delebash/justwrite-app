<script setup>
// Character-action consistency audit modal.
//
// Walks every main character one at a time (sequential — gentle on
// local models) and runs auditCharacter() on each. The modal has two
// phases:
//   - scanning: a list of characters with status as the sweep walks them
//   - review:   per-character expansion showing concerns with severity,
//               chapter ref, evidence quote, and a one-line fix
//
// Results persist on character.audit so re-opening the modal reads from
// cache. "Re-audit" forces a fresh sweep; "Clear" wipes saved results.

import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useAiStore } from "../stores/ai.js";
import { useAiTasksStore } from "../stores/aiTasks.js";
import { auditAllCharacters } from "../services/analysis/characterAudit.js";
import { Icon } from "@delebash/llm-ui";
import AiFeatureChip from "./AiFeatureChip.vue";
import { AppModal } from "@delebash/llm-ui";
import StatusRow from "./StatusRow.vue";
import AiTaskStrip from "./AiTaskStrip.vue";
import EmptyState from "./EmptyState.vue";
import { UiButton } from "@delebash/llm-ui";

const emit = defineEmits(["close"]);

const project = useProjectStore();
const ui = useUiStore();
const ai = useAiStore();
const router = useRouter();
const aiTasks = useAiTasksStore();

const myTask = computed(() => aiTasks.runningTasks.find(
  (t) => t.feature === "characterAudit"
));
const running = computed(() => !!myTask.value);

function isAbort(e) { return e?.name === "AbortError" || /abort/i.test(e?.message || ""); }

const error = ref("");

// Per-character row state for the scanning phase.
const rows = ref([]);
const rowById = ref(new Map());
const completedCount = ref(0);
const expanded = ref(new Set()); // character ids expanded in review phase

function initRows() {
  rows.value = (project.characters || []).filter((c) => c.main).map((c) => ({
    id: c.id,
    name: c.name,
    status: c.audit ? "done" : "pending",
    reason: c.audit ? `${c.audit.noteCount} concern${c.audit.noteCount === 1 ? "" : "s"}` : "",
  }));
  rowById.value = new Map(rows.value.map((r) => [r.id, r]));
  completedCount.value = rows.value.filter((r) => r.status === "done").length;
}

function cancelSweep() {
  if (myTask.value) aiTasks.cancel(myTask.value.id);
  for (const r of rows.value) {
    if (r.status === "scanning") { r.status = "skipped"; r.reason = "cancelled"; }
  }
}

// Are we currently running OR have we never started?
const everRan = computed(() => rows.value.some((r) => project.characters.find((c) => c.id === r.id)?.audit));
const phase = computed(() => {
  if (running.value) return "scanning";
  if (everRan.value) return "review";
  return "scanning";
});

async function runSweep(force = false) {
  error.value = "";
  if (running.value) return;
  if (!ai.providerForFeature("characterAudit")) {
    error.value = "Configure an AI provider in Settings → AI to run the audit.";
    return;
  }
  if (force) project.clearAllCharacterAudits();
  initRows();
  if (!rows.value.length) {
    error.value = "No main characters to audit. Mark a character as 'main' in their detail page first.";
    return;
  }
  try {
    await auditAllCharacters({
      project,
      task: { label: "Character consistency audit", meta: { feature: "characterAudit" } },
      onProgress: ({ phase: ph, character, completed, result, reason }) => {
        const row = rowById.value.get(character.id);
        if (row) {
          if (ph === "start") row.status = "scanning";
          else if (ph === "done") {
            row.status = "done";
            row.reason = `${result.noteCount} concern${result.noteCount === 1 ? "" : "s"}`;
            // Persist per-character so partial sweeps survive cancel.
            project.setCharacterAudit(character.id, result);
          } else if (ph === "error") {
            row.status = "error";
            row.reason = reason || "";
          }
        }
        completedCount.value = completed;
      },
    });
  } catch (e) {
    if (!isAbort(e)) {
      const msg = String(e?.message || e || "");
      error.value = /provider|api key|configure/i.test(msg)
        ? "Configure an AI provider in Settings → AI to run the audit."
        : msg || "Couldn't complete the audit.";
    } else {
      for (const r of rows.value) {
        if (r.status === "scanning") { r.status = "skipped"; r.reason = "cancelled"; }
      }
    }
  }
}

function clearAll() {
  project.clearAllCharacterAudits();
  rows.value = rows.value.map((r) => ({ ...r, status: "pending", reason: "" }));
  expanded.value = new Set();
  ui.showToast({ message: "Audit cleared." });
}

function toggleExpand(id) {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  expanded.value = next;
}

function jumpToChapter(num) {
  const ch = project.allChapters.find((c) => c.num === num);
  if (ch) router.push(`/chapters/${ch.id}`);
}
function jumpToCharacter(id) {
  router.push(`/characters/${id}`);
}

// The reviewable list — characters that have an audit on them.
const reviewCharacters = computed(() => {
  return (project.characters || [])
    .filter((c) => c.main && c.audit)
    .map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role || "",
      audit: c.audit,
    }));
});

const totalConcerns = computed(() =>
  reviewCharacters.value.reduce((s, c) => s + (c.audit?.noteCount || 0), 0),
);

const SEVERITY_META = {
  flag:    { icon: "Alert",   label: "Flag",       color: "var(--danger)" },
  suggest: { icon: "Sparkle", label: "Suggestion", color: "var(--accent)" },
  info:    { icon: "Check",   label: "Note",       color: "var(--muted)" },
};
const VERDICT_LABELS = {
  consistent: "Consistent",
  "minor-drift": "Minor drift",
  "significant-drift": "Significant drift",
  "no-scenes": "No scenes yet",
};
const VERDICT_COLOURS = {
  consistent: "var(--status-done)",
  "minor-drift": "var(--gold)",
  "significant-drift": "var(--danger)",
  "no-scenes": "var(--muted)",
};

onMounted(() => {
  initRows();
  // Deliberately no auto-run: the user should see the AI routing chip
  // in the header and have the option to change provider or model before
  // spending tokens on each character. The empty-state CTA kicks off
  // the run when they're ready.
});
</script>

<template>
  <AppModal
    eyebrow="Character audit"
    title="Consistency audit"
    wide
    :closable="!running"
    @close="emit('close')"
  >
    <template #header>
      <div class="ca-titleblock">
        <div class="t-eyebrow">Character audit</div>
        <h2 class="modal-title">Consistency audit</h2>
      </div>
      <div class="ca-header-actions">
        <AiFeatureChip feature="characterAudit" label="Character audit" />
      </div>
    </template>

    <p class="ca-blurb">
      For each main character, JustWrite sends their profile (role, one-liner, voice, arc, motivation,
      backstory, established voice samples) plus the prose of every scene that features them. The model
      flags <strong>actions, reactions, or dialogue</strong> that look inconsistent with the established
      psychology — not earned by what you've set up about them. Concerns are evidence-cited; small,
      borderline drifts get a softer flag than out-of-character breaks.
    </p>

    <div v-if="error" class="ca-error">
      <Icon name="Alert" :size="13" /> {{ error }}
      <UiButton intent="ghost" size="small" @click="runSweep(false)">
        <Icon name="Refresh" :size="12" /> Retry
      </UiButton>
    </div>

    <AiTaskStrip :task="myTask" />

    <!-- ── Scanning phase ────────────────────────────────────── -->
    <div v-if="running" class="ca-rows">
      <StatusRow v-for="row in rows" :key="row.id"
        :status="row.status"
        :left="row.name?.[0]?.toUpperCase() || '?'"
        :main="row.name"
        :right="row.reason ? `${row.status} · ${row.reason}` : row.status" />
    </div>

    <div v-else-if="!reviewCharacters.length && !rows.length" class="ca-rows">
      <EmptyState
        icon="Users"
        title="No main characters"
        message="Mark a character as 'main' in their detail page, then re-open this modal." />
    </div>

    <div v-else-if="!reviewCharacters.length" class="ca-empty">
      <Icon name="Sparkle" :size="20" />
      <p class="ca-empty-text">
        Read every scene this character appears in and audit for consistency against their profile.
        Change the provider in the chip above first if you want.
      </p>
      <UiButton intent="primary" @click="runSweep(false)">
        <Icon name="Sparkle" :size="13" /> Audit this character
      </UiButton>
    </div>

    <!-- ── Review phase ──────────────────────────────────────── -->
    <template v-else>
      <div class="ca-summary">
        <span class="ca-pill"><strong>{{ totalConcerns }}</strong> total concerns across {{ reviewCharacters.length }} main characters</span>
      </div>

      <ul class="ca-cards">
        <li v-for="c in reviewCharacters" :key="c.id" class="ca-card">
          <header class="ca-card-h" @click="toggleExpand(c.id)">
            <span class="ca-name">
              <button class="ca-name-jump" @click.stop="jumpToCharacter(c.id)" v-tooltip.bottom="'Open character page'">
                {{ c.name }}
              </button>
              <span class="ca-role">{{ c.role }}</span>
            </span>
            <span class="ca-card-meta">
              <span class="ca-verdict" :style="{ background: VERDICT_COLOURS[c.audit.verdict] }">
                {{ VERDICT_LABELS[c.audit.verdict] || c.audit.verdict }}
              </span>
              <span class="ca-count">
                {{ c.audit.noteCount }} concern{{ c.audit.noteCount === 1 ? '' : 's' }}
              </span>
              <Icon :name="expanded.has(c.id) ? 'ChevDown' : 'ChevRight'" :size="14" />
            </span>
          </header>

          <div v-if="expanded.has(c.id)" class="ca-concerns">
            <p v-if="!c.audit.concerns?.length" class="ca-no-concerns">
              No consistency issues across the {{ c.audit.sceneCount }} scene{{ c.audit.sceneCount === 1 ? '' : 's' }} this character appears in.
            </p>
            <ul v-else class="ca-concern-list">
              <li v-for="cn in c.audit.concerns" :key="cn.id" class="ca-concern" :data-sev="cn.severity">
                <div class="ca-concern-head">
                  <span class="ca-sev" :style="{ color: SEVERITY_META[cn.severity]?.color }">
                    <Icon :name="SEVERITY_META[cn.severity]?.icon" :size="12" />
                    {{ SEVERITY_META[cn.severity]?.label }}
                  </span>
                  <button v-if="cn.chapterNum" class="ca-chap-jump"
                          @click="jumpToChapter(cn.chapterNum)"
                          v-tooltip.bottom="'Open this chapter'">
                    Ch. {{ cn.chapterNum }}<span v-if="cn.sceneSummary"> · {{ cn.sceneSummary }}</span>
                  </button>
                </div>
                <p class="ca-issue">{{ cn.issue }}</p>
                <blockquote v-if="cn.quote" class="ca-quote">"{{ cn.quote }}"</blockquote>
                <p v-if="cn.reason" class="ca-reason"><span class="ca-label">Why:</span> {{ cn.reason }}</p>
                <p v-if="cn.fix" class="ca-fix"><span class="ca-label">Cheapest fix:</span> {{ cn.fix }}</p>
              </li>
            </ul>
          </div>
        </li>
      </ul>
    </template>

    <template #footer>
      <UiButton v-if="reviewCharacters.length && !running" intent="ghost" @click="clearAll">
        Clear saved audit
      </UiButton>
      <span class="ca-foot-spacer" />
      <UiButton v-if="!running" intent="ghost" @click="runSweep(true)">
        <Icon name="Refresh" :size="12" />
        {{ reviewCharacters.length ? "Re-audit" : "Run audit" }}
      </UiButton>
      <UiButton v-else intent="danger" @click="cancelSweep">
        <Icon name="Close" :size="13" /> Cancel
      </UiButton>
      <UiButton intent="primary" @click="emit('close')">Done</UiButton>
    </template>
  </AppModal>
</template>

<style scoped>
.ca-blurb {
  margin: 0 0 16px; max-width: 82ch;
  font-size: 12.5px; line-height: 1.55; color: var(--muted);
}
.ca-blurb strong { color: var(--ink-2); font-weight: 600; }

.ca-error {
  display: flex; gap: 10px; align-items: center;
  padding: 10px 14px; border-radius: 6px;
  background: color-mix(in oklab, var(--danger-ink, #b91c1c) 12%, transparent);
  color: var(--danger-ink, #b91c1c);
  font-size: 12.5px;
  margin-bottom: 10px;
}

.ca-empty {
  display: flex; flex-direction: column; align-items: center;
  gap: 14px; padding: 32px 18px;
  background: var(--surface-2);
  border-radius: 10px;
  text-align: center;
}
.ca-empty > :first-child { color: var(--accent); }
.ca-empty-text {
  margin: 0; max-width: 56ch;
  font-size: 13px; line-height: 1.55; color: var(--ink-2);
}

.ca-rows {
  display: flex; flex-direction: column;
  border: 1px solid var(--border-soft); border-radius: 8px;
  background: var(--surface-2);
  margin-top: 8px;
}

.ca-summary { display: flex; gap: 8px; margin-bottom: 14px; }
.ca-pill {
  font-family: var(--font-mono); font-size: 11px; color: var(--muted);
  padding: 4px 12px; border-radius: 999px; background: var(--surface-2);
}
.ca-pill strong { color: var(--ink); font-weight: 600; }

.ca-cards { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.ca-card {
  background: var(--surface-2); border-radius: 8px;
  overflow: hidden;
}
.ca-card-h {
  display: flex; align-items: center; gap: 16px;
  padding: 12px 16px;
  cursor: pointer;
}
.ca-card-h:hover { background: color-mix(in oklab, var(--accent) 8%, transparent); }
.ca-name { display: flex; align-items: baseline; gap: 12px; flex: 1; min-width: 0; }
.ca-name-jump {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  font-family: var(--font-serif); font-size: 15px; font-weight: 600;
  color: var(--ink); padding: 0;
}
.ca-name-jump:hover { color: var(--accent); text-decoration: underline; }
.ca-role { font-size: 12px; color: var(--muted); }

.ca-card-meta { display: flex; align-items: center; gap: 12px; }
.ca-verdict {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.06em;
  padding: 3px 10px; border-radius: 999px;
  color: white;
  text-shadow: 0 1px 0 rgba(0,0,0,0.25);
}
.ca-count { font-family: var(--font-mono); font-size: 11px; color: var(--muted); }

.ca-concerns { padding: 0 16px 16px; }
.ca-no-concerns {
  margin: 4px 0 0;
  font-size: 12.5px; color: var(--muted); font-style: italic;
}
.ca-concern-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.ca-concern {
  padding: 12px 14px;
  background: var(--surface); border-radius: 6px;
  border-left: 3px solid var(--accent);
}
.ca-concern[data-sev="flag"]    { border-left-color: var(--danger); }
.ca-concern[data-sev="suggest"] { border-left-color: var(--accent); }
.ca-concern[data-sev="info"]    { border-left-color: var(--muted); }
.ca-concern-head {
  display: flex; align-items: center; gap: 14px;
  margin-bottom: 6px;
}
.ca-sev {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.08em; text-transform: uppercase;
}
.ca-chap-jump {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--accent-ink);
  padding: 0;
}
.ca-chap-jump:hover { color: var(--accent); text-decoration: underline; }
.ca-issue {
  margin: 0 0 6px;
  font-size: 13px; line-height: 1.55; color: var(--ink-2); font-weight: 500;
}
.ca-quote {
  margin: 0 0 6px;
  padding-left: 12px; border-left: 2px solid var(--accent-line);
  font-family: var(--font-serif); font-style: italic;
  font-size: 12.5px; line-height: 1.6; color: var(--ink-2);
}
.ca-reason, .ca-fix {
  margin: 0; padding: 4px 0;
  font-size: 12px; line-height: 1.55; color: var(--ink-2);
}
.ca-label {
  font-family: var(--font-mono); font-size: 9.5px;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--muted); margin-right: 6px;
}

.ca-foot-spacer { flex: 1; }

.ca-titleblock { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.ca-titleblock h2 { font-family: var(--font-serif); font-size: 22px; font-weight: 600; margin: 4px 0 0; }
.ca-header-actions { display: flex; gap: 8px; flex-shrink: 0; align-items: center; }
</style>
