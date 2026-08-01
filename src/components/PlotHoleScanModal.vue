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
import { useAiTasksStore, Icon, AiTaskStrip, AppModal, UiButton, EmptyState } from "@delebash/llm-ui";
import { scanPlotHoles } from "../services/analysis/plotHoleScan.js";
import AiFeatureChip from "./AiFeatureChip.vue";

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

// These label section headers, so the keys hold the PLURAL words outright. The old shape was a
// singular English label run through `severityPlural: "{label}s"` — an English-only rule applied
// to a label that was itself never translated.
const SEVERITY_META = {
  flag:    { i18n: "plotHoles.severity.flag",    icon: "Alert",   color: "var(--danger)" },
  suggest: { i18n: "plotHoles.severity.suggest", icon: "Sparkle", color: "var(--accent)" },
  info:    { i18n: "plotHoles.severity.info",    icon: "Check",   color: "var(--muted)" },
};
// Kind badges. These were English strings in plotHoleScan.js — a display label in the service
// layer, where i18n cannot reach it. The service keeps KIND_LIST, which is the wire contract
// with the model and must stay English; only the rendering moved here.
const KIND_I18N = {
  contradiction:         "plotHoles.kinds.contradiction",
  timeline:              "plotHoles.kinds.timeline",
  continuity:            "plotHoles.kinds.continuity",
  "character-knowledge": "plotHoles.kinds.characterKnowledge",
  object:                "plotHoles.kinds.object",
  other:                 "plotHoles.kinds.other",
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
    :eyebrow="$t('plotHoles.eyebrow')"
    :title="$t('plotHoles.title')"
    wide
    :closable="!running"
    @close="emit('close')"
  >
    <template #header>
      <div class="ph-titleblock">
        <div class="t-eyebrow">{{ $t("plotHoles.eyebrow") }}</div>
        <h2 class="modal-title">{{ $t("plotHoles.title") }}</h2>
      </div>
      <div class="ph-header-actions">
        <AiFeatureChip feature="plotHoles" :label="$t('plotHoles.chipLabel')" editable />
      </div>
    </template>

    <i18n-t keypath="plotHoles.blurb" tag="p" class="ph-blurb" scope="global">
      <template #contradictions><strong>{{ $t("plotHoles.contradictionsTerm") }}</strong></template>
      <template #knowledgeErrors><strong>{{ $t("plotHoles.knowledgeErrorsTerm") }}</strong></template>
    </i18n-t>

    <!-- World rules — optional extra constraint set the audit enforces. -->
    <details class="ph-rules" :open="worldRulesOpen" @toggle="(e) => worldRulesOpen = e.target.open">
      <summary>
        {{ $t("plotHoles.worldRulesSummary") }}
        <span v-if="project.worldRules?.trim()" class="ph-rules-pill">{{ $t("plotHoles.on") }}</span>
        <span v-else class="ph-rules-pill muted">{{ $t("plotHoles.off") }}</span>
      </summary>
      <i18n-t keypath="plotHoles.worldRulesHelp" tag="p" class="ph-rules-help" scope="global">
        <template #rules><strong>{{ $t("plotHoles.worldRulesTerm") }}</strong></template>
        <template #earns><em>{{ $t("plotHoles.earnsException") }}</em></template>
      </i18n-t>
      <textarea
        v-model="worldRulesDraft"
        @blur="saveWorldRules"
        class="ph-rules-textarea"
        rows="6"
        :placeholder="$t('plotHoles.worldRulesPlaceholder')">
      </textarea>
    </details>

    <div v-if="error" class="ph-error">
      <Icon name="Alert" :size="13" /> {{ error }}
      <UiButton intent="ghost" size="small" @click="run">
        <Icon name="Refresh" :size="12" /> {{ $t("common.retry") }}
      </UiButton>
    </div>

    <AiTaskStrip v-if="running" :task="myTask" />

    <div v-else-if="!audit" class="ph-empty">
      <Icon name="Sparkle" :size="20" />
      <p class="ph-empty-text">
        {{ $t("plotHoles.idleBlurb") }}
      </p>
      <UiButton intent="primary" @click="run">
        <Icon name="Sparkle" :size="13" /> {{ $t("plotHoles.action") }}
      </UiButton>
    </div>

    <template v-else-if="audit">
      <div class="ph-head">
        <span class="ph-pill">
          {{ $t("count.finding", { n: findings.length }, findings.length) }}
        </span>
        <span v-if="dismissedCount" class="ph-pill muted">
          {{ $t("plotHoles.dismissedCount", { n: dismissedCount }) }}
        </span>
        <span class="ph-meta">
          {{ $t("plotHoles.generatedAgo", { when: ago(audit.generatedAt) }) }}
          <template v-if="audit.model"> {{ $t("plotHoles.viaModel", { model: audit.model }) }}</template>
        </span>
        <UiButton v-if="dismissedCount" intent="ghost" size="small"
                  @click="showDismissed = !showDismissed"
                  style="margin-left:auto">
          {{ showDismissed ? $t("plotHoles.hideDismissed") : $t("plotHoles.showDismissed") }}
        </UiButton>
      </div>

      <p v-if="audit.summary" class="ph-summary">{{ audit.summary }}</p>

      <EmptyState v-if="!findings.length"
        icon="Check"
        :title="$t('plotHoles.cleanTitle')"
        :message="$t('plotHoles.cleanMessage')" />

      <EmptyState v-else-if="!visibleFindings.length"
        icon="Eye"
        :title="$t('plotHoles.allDismissedTitle')"
        :message="$t('plotHoles.allDismissedMessage')" />

      <template v-else>
        <section v-for="g in groups" :key="g.key" class="ph-section">
          <div class="ph-section-h" :style="{ color: SEVERITY_META[g.key].color }">
            <Icon :name="SEVERITY_META[g.key].icon" :size="13" />
            {{ $t(SEVERITY_META[g.key].i18n) }}
            <span class="ph-section-count">{{ g.items.length }}</span>
          </div>
          <ul class="ph-list">
            <li v-for="f in g.items" :key="f.id"
                class="ph-item" :class="{ dismissed: f.dismissed }"
                :data-sev="f.severity">
              <div class="ph-item-head">
                <span class="ph-kind">{{ KIND_I18N[f.kind] ? $t(KIND_I18N[f.kind]) : f.kind }}</span>
                <span class="ph-chapter-list">
                  <template v-for="(num, i) in f.chapterNums" :key="num">
                    <button class="ph-chap-jump" @click="jumpToChapter(num)"
                            v-tooltip.bottom="$t('common.openThisChapter')">
                      {{ $t("common.chapterShort", { num }) }}
                    </button>
                    <span v-if="i < f.chapterNums.length - 1" class="ph-sep">·</span>
                  </template>
                </span>
              </div>
              <p class="ph-summary-line">{{ f.summary }}</p>
              <blockquote v-if="f.evidence" class="ph-evidence">"{{ f.evidence }}"</blockquote>
              <p v-if="f.fix" class="ph-fix">
                <span class="ph-fix-label">{{ $t("plotHoles.cheapestFix") }}</span> {{ f.fix }}
              </p>
              <div class="ph-item-actions">
                <UiButton v-if="!f.dismissed" intent="ghost" size="small" @click="dismiss(f.id)">
                  {{ $t("plotHoles.dismiss") }}
                </UiButton>
                <UiButton v-else intent="ghost" size="small" @click="undismiss(f.id)">
                  {{ $t("plotHoles.undismiss") }}
                </UiButton>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </template>

    <template #footer>
      <UiButton v-if="audit && !running" intent="ghost" @click="clearAll">
        {{ $t("plotHoles.clearAudit") }}
      </UiButton>
      <span class="ph-foot-spacer" />
      <UiButton v-if="audit && !running" intent="ghost" @click="regenerate">
        <Icon name="Refresh" :size="12" /> {{ $t("plotHoles.rerun") }}
      </UiButton>
      <UiButton intent="primary" @click="emit('close')">{{ $t("common.done") }}</UiButton>
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
