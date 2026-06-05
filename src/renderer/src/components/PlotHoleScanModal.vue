<script setup>
// Plot-hole / continuity audit modal.
//
// One LLM call across the whole-book digest (summaries + 300-word
// chapter tails) returns a list of findings grouped by severity. Each
// finding has a kind (contradiction / timeline / continuity / etc.),
// the chapter(s) whose content collides, a verbatim evidence quote,
// and a one-line "cheapest fix" suggestion. The writer can dismiss
// individual findings (they stay on the project but are filtered out
// of the default view) or clear the whole audit and re-run.

import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useAiStore } from "../stores/ai.js";
import { useAiTasksStore } from "../stores/aiTasks.js";
import { scanPlotHoles, KIND_LABELS } from "../services/analysis/plotHoleScan.js";
import Icon from "./Icon.vue";
import AiTaskStrip from "./AiTaskStrip.vue";
import AiFeatureChip from "./AiFeatureChip.vue";
import AppModal from "./AppModal.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";
import EmptyState from "./EmptyState.vue";

const emit = defineEmits(["close"]);

const project = useProjectStore();
const ai = useAiStore();
const router = useRouter();
const aiTasks = useAiTasksStore();
const error = ref("");

const myTask = computed(() => aiTasks.runningTasks.find(
  (t) => t.feature === "plotHoles"
));
const running = computed(() => !!myTask.value);

function isAbort(e) { return e?.name === "AbortError" || /abort/i.test(e?.message || ""); }
const showDismissed = ref(false);

const audit = computed(() => project.plotHoles);

// World rules — explicit constraints the audit should enforce in
// addition to the usual contradiction / timeline / continuity passes.
// Closes the SFF gap: writers can declare magic-system rules, hard SF
// physics, technology limits, or social structures and have the audit
// flag any violations of them. Persisted on the project, so the writer
// fills this in once per project and the audit picks it up forever.
const worldRulesOpen = ref(!!project.worldRules);
const worldRulesDraft = ref(project.worldRules || "");
function saveWorldRules() {
  project.setWorldRules(worldRulesDraft.value);
}
const findings = computed(() => audit.value?.findings || []);
const visibleFindings = computed(() =>
  showDismissed.value ? findings.value : findings.value.filter((f) => !f.dismissed),
);
const dismissedCount = computed(() => findings.value.filter((f) => f.dismissed).length);

// Group visible findings by severity for display.
const groups = computed(() => {
  const order = ["flag", "suggest", "info"];
  const byKey = { flag: [], suggest: [], info: [] };
  for (const f of visibleFindings.value) {
    (byKey[f.severity] || byKey.info).push(f);
  }
  return order
    .map((key) => ({ key, items: byKey[key] }))
    .filter((g) => g.items.length > 0);
});

async function run() {
  error.value = "";
  if (running.value) return;
  if (!ai.providerForFeature("plotHoles")) {
    error.value = "Configure an AI provider in Settings → AI to run the audit.";
    return;
  }
  try {
    const result = await scanPlotHoles({
      project,
      task: { label: "Plot-hole / continuity audit", meta: {} },
    });
    project.setPlotHoles(result);
  } catch (e) {
    if (!isAbort(e)) {
      const msg = String(e?.message || e || "");
      error.value = /provider|api key|configure/i.test(msg)
        ? "Configure an AI provider in Settings → AI to run the audit."
        : msg || "Couldn't run the audit.";
    }
  }
}

function regenerate() {
  project.clearPlotHoles();
  run();
}
function clearAll() {
  project.clearPlotHoles();
}
function dismiss(id) {
  project.dismissPlotHole(id);
}
function undismiss(id) {
  project.undismissPlotHole(id);
}
function jumpToChapter(num) {
  const ch = project.allChapters.find((c) => c.num === num);
  if (ch) router.push(`/chapters/${ch.id}`);
}

const SEVERITY_META = {
  flag:    { label: "Flag",       icon: "Alert",   color: "var(--danger)" },
  suggest: { label: "Suggestion", icon: "Sparkle", color: "var(--accent)" },
  info:    { label: "Note",       icon: "Check",   color: "var(--muted)" },
};

const ago = (ts) => {
  if (!ts) return "";
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// Deliberately no auto-run on mount: the user should see the AI
// routing chip in the header and have the option to change provider
// or model before spending tokens on the whole-book pass. The
// empty-state CTA below kicks off the run when they're ready.
</script>

<template>
  <AppModal
    eyebrow="Plot holes"
    title="Continuity audit"
    wide
    :closable="!running"
    @close="emit('close')"
  >
    <template #header>
      <div class="ph-titleblock">
        <div class="t-eyebrow">Plot holes</div>
        <h2 class="modal-title">Continuity audit</h2>
      </div>
      <div class="ph-header-actions">
        <AiFeatureChip feature="plotHoles" label="Plot-holes" />
      </div>
    </template>

    <p class="ph-blurb">
      One pass over the whole-book digest plus a tail of each chapter's prose looks for
      <strong>contradictions, timeline impossibilities, continuity drift</strong>, and
      <strong>character-knowledge errors</strong>. The model is told to be selective — a clean
      audit is meaningful, padded findings are noise. Dismissed findings stay on the project
      but drop out of the default view.
    </p>

    <!-- World rules — optional extra constraint set the audit enforces. -->
    <details class="ph-rules" :open="worldRulesOpen" @toggle="(e) => worldRulesOpen = e.target.open">
      <summary>
        World rules to enforce
        <span v-if="project.worldRules?.trim()" class="ph-rules-pill">on</span>
        <span v-else class="ph-rules-pill muted">off</span>
      </summary>
      <p class="ph-rules-help">
        Free-text <strong>rules the writer has explicitly stated this world enforces</strong> —
        magic-system constraints ("blood magic costs a year of life per use"), hard SF physics
        ("FTL drives need 48 hours to recharge"), technology limits, social structures. When
        non-empty, the audit checks each chapter against these in the same pass. If a chapter
        breaks a rule but the prose <em>earns the exception</em> (a cost paid, a workaround,
        a stated bypass), it's not flagged. Leave blank for non-SFF projects — the rest of the
        audit runs identically.
      </p>
      <textarea
        v-model="worldRulesDraft"
        @blur="saveWorldRules"
        class="ph-rules-textarea"
        rows="6"
        placeholder="e.g. Magic requires a physical cost — wounds, age, exhaustion. No magic is free.&#10;FTL drives need 48 hours between jumps; characters mid-flight cannot communicate.&#10;Vows sworn on the Star Stone cannot be broken without the swearer's death.">
      </textarea>
    </details>

    <div v-if="error" class="ph-error">
      <Icon name="Alert" :size="13" /> {{ error }}
      <JwButton intent="ghost" size="small" @click="run">
        <Icon name="Refresh" :size="12" /> Retry
      </JwButton>
    </div>

    <AiTaskStrip v-if="running" :task="myTask" />

    <div v-else-if="!audit" class="ph-empty">
      <Icon name="Sparkle" :size="20" />
      <p class="ph-empty-text">
        Scan the whole book for continuity contradictions, timeline issues, and
        character-knowledge errors. Change the provider in the chip above first if you want.
      </p>
      <JwButton intent="primary" @click="run">
        <Icon name="Sparkle" :size="13" /> Scan for plot holes
      </JwButton>
    </div>

    <template v-else-if="audit">
      <div class="ph-head">
        <span class="ph-pill">
          {{ findings.length }} finding{{ findings.length === 1 ? '' : 's' }}
        </span>
        <span v-if="dismissedCount" class="ph-pill muted">
          {{ dismissedCount }} dismissed
        </span>
        <span class="ph-meta">
          generated {{ ago(audit.generatedAt) }}
          <template v-if="audit.model"> · via {{ audit.model }}</template>
        </span>
        <JwButton v-if="dismissedCount" intent="ghost" size="small"
                  @click="showDismissed = !showDismissed"
                  style="margin-left:auto">
          {{ showDismissed ? "Hide dismissed" : "Show dismissed" }}
        </JwButton>
      </div>

      <p v-if="audit.summary" class="ph-summary">{{ audit.summary }}</p>

      <EmptyState v-if="!findings.length"
        icon="Check"
        title="Clean audit"
        message="The model found no contradictions, timeline issues, or continuity drift across the manuscript." />

      <EmptyState v-else-if="!visibleFindings.length"
        icon="Eye"
        title="All findings dismissed"
        message="Toggle 'Show dismissed' above to bring them back." />

      <template v-else>
        <section v-for="g in groups" :key="g.key" class="ph-section">
          <div class="ph-section-h" :style="{ color: SEVERITY_META[g.key].color }">
            <Icon :name="SEVERITY_META[g.key].icon" :size="13" />
            {{ SEVERITY_META[g.key].label }}s
            <span class="ph-section-count">{{ g.items.length }}</span>
          </div>
          <ul class="ph-list">
            <li v-for="f in g.items" :key="f.id"
                class="ph-item" :class="{ dismissed: f.dismissed }"
                :data-sev="f.severity">
              <div class="ph-item-head">
                <span class="ph-kind">{{ KIND_LABELS[f.kind] || f.kind }}</span>
                <span class="ph-chapter-list">
                  <template v-for="(num, i) in f.chapterNums" :key="num">
                    <button class="ph-chap-jump" @click="jumpToChapter(num)"
                            v-tooltip.bottom="'Open this chapter'">
                      Ch. {{ num }}
                    </button>
                    <span v-if="i < f.chapterNums.length - 1" class="ph-sep">·</span>
                  </template>
                </span>
              </div>
              <p class="ph-summary-line">{{ f.summary }}</p>
              <blockquote v-if="f.evidence" class="ph-evidence">"{{ f.evidence }}"</blockquote>
              <p v-if="f.fix" class="ph-fix">
                <span class="ph-fix-label">Cheapest fix:</span> {{ f.fix }}
              </p>
              <div class="ph-item-actions">
                <JwButton v-if="!f.dismissed" intent="ghost" size="small" @click="dismiss(f.id)">
                  Dismiss
                </JwButton>
                <JwButton v-else intent="ghost" size="small" @click="undismiss(f.id)">
                  Undismiss
                </JwButton>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </template>

    <template #footer>
      <JwButton v-if="audit && !running" intent="ghost" @click="clearAll">
        Clear audit
      </JwButton>
      <span class="ph-foot-spacer" />
      <JwButton v-if="audit && !running" intent="ghost" @click="regenerate">
        <Icon name="Refresh" :size="12" /> Re-run
      </JwButton>
      <JwButton intent="primary" @click="emit('close')">Done</JwButton>
    </template>
  </AppModal>
</template>

<style scoped>
.ph-blurb {
  margin: 0 0 16px; max-width: 82ch;
  font-size: 12.5px; line-height: 1.55; color: var(--muted);
}
.ph-blurb strong { color: var(--ink-2); font-weight: 600; }

.ph-error {
  display: flex; gap: 10px; align-items: center;
  padding: 10px 14px; border-radius: 6px;
  background: color-mix(in oklab, var(--danger-ink, #b91c1c) 12%, transparent);
  color: var(--danger-ink, #b91c1c);
  font-size: 12.5px;
}

.ph-empty {
  display: flex; flex-direction: column; align-items: center;
  gap: 14px; padding: 32px 18px;
  background: var(--surface-2);
  border-radius: 10px;
  text-align: center;
}
.ph-empty > :first-child { color: var(--accent); }
.ph-empty-text {
  margin: 0; max-width: 56ch;
  font-size: 13px; line-height: 1.55; color: var(--ink-2);
}

.ph-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.ph-pill {
  font-family: var(--font-mono); font-size: 10.5px;
  padding: 4px 12px; border-radius: 999px;
  background: var(--accent-soft); color: var(--accent-ink);
}
.ph-pill.muted { background: var(--surface-3); color: var(--muted); }
.ph-meta { font-family: var(--font-mono); font-size: 10.5px; color: var(--muted); }

.ph-summary {
  margin: 0 0 22px; max-width: 78ch;
  font-family: var(--font-serif); font-size: 14px; line-height: 1.65;
  color: var(--ink-2); font-style: italic;
  padding-left: 14px; border-left: 2px solid var(--accent-line);
}

.ph-section + .ph-section { margin-top: 18px; }
.ph-section-h {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.16em; text-transform: uppercase;
  margin: 0 0 10px;
}
.ph-section-count {
  font-family: var(--font-ui); letter-spacing: 0;
  font-size: 10.5px; padding: 2px 8px; border-radius: 999px;
  background: var(--surface-3); color: var(--muted);
}

.ph-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.ph-item {
  padding: 12px 14px;
  background: var(--surface-2); border-radius: 8px;
  border-left: 3px solid var(--accent);
}
.ph-item[data-sev="flag"]    { border-left-color: var(--danger); }
.ph-item[data-sev="suggest"] { border-left-color: var(--accent); }
.ph-item[data-sev="info"]    { border-left-color: var(--muted); }
.ph-item.dismissed { opacity: 0.55; }

.ph-item-head {
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 6px;
}
.ph-kind {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--accent-ink);
  padding: 2px 8px; border-radius: 999px;
  background: var(--accent-soft);
}
.ph-chapter-list { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-left: auto; }
.ph-chap-jump {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--accent-ink);
  padding: 0;
}
.ph-chap-jump:hover { color: var(--accent); text-decoration: underline; }
.ph-sep { color: var(--subtle); font-family: var(--font-mono); font-size: 10.5px; }

.ph-summary-line {
  margin: 0 0 6px; font-size: 13.5px; line-height: 1.55;
  color: var(--ink-2); font-weight: 500;
}
.ph-evidence {
  margin: 0 0 6px;
  padding-left: 12px; border-left: 2px solid var(--accent-line);
  font-family: var(--font-serif); font-style: italic;
  font-size: 12.5px; line-height: 1.6; color: var(--ink-2);
}
.ph-fix {
  margin: 0 0 8px;
  font-size: 12px; line-height: 1.55; color: var(--ink-2);
}
.ph-fix-label {
  font-family: var(--font-mono); font-size: 9.5px;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--muted); margin-right: 6px;
}
.ph-item-actions { display: flex; justify-content: flex-end; }

.ph-rules {
  margin: 0 0 16px;
  background: var(--surface-2); border: 1px solid var(--border-soft);
  border-radius: 8px; padding: 10px 14px;
}
.ph-rules > summary {
  cursor: pointer;
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted);
  display: flex; align-items: center; gap: 10px;
}
.ph-rules-pill {
  font-family: var(--font-ui); letter-spacing: 0; text-transform: none;
  font-size: 10.5px; padding: 2px 9px; border-radius: 999px;
  background: var(--accent-soft); color: var(--accent-ink);
}
.ph-rules-pill.muted { background: var(--surface-3); color: var(--muted); }
.ph-rules-help {
  margin: 10px 0 8px; font-size: 12px; line-height: 1.55; color: var(--muted);
  max-width: 78ch;
}
.ph-rules-help strong { color: var(--ink-2); font-weight: 600; }
.ph-rules-textarea {
  width: 100%; box-sizing: border-box;
  padding: 10px 12px;
  background: var(--surface); border: 1px solid var(--border-soft); border-radius: 6px;
  font-family: var(--font-mono); font-size: 12.5px; line-height: 1.55;
  color: var(--ink-2);
  resize: vertical;
}
.ph-rules-textarea:focus {
  outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft);
}

.ph-foot-spacer { flex: 1; }

.ph-titleblock { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.ph-titleblock h2 { font-family: var(--font-serif); font-size: 22px; font-weight: 600; margin: 4px 0 0; }
.ph-header-actions { display: flex; gap: 8px; flex-shrink: 0; align-items: center; }
</style>
