<script setup>
// Marketing pack modal ("Shrink Ray" equivalent).
//
// One LLM call over a whole-book digest produces four artifacts for
// the query / pitch / back-cover stack: logline, three back-cover
// blurbs (hook / character / premise angles), one-page synopsis, and
// a 3-paragraph elevator pitch. Each artifact has a copy button.
//
// Persists on project.marketingPack so re-opening reads from cache.

import { ref, computed, onMounted } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useAiStore } from "../stores/ai.js";
import { useAiTasksStore } from "../stores/aiTasks.js";
import { generateMarketingPack } from "../services/analysis/marketingPack.js";
import Icon from "./Icon.vue";
import AiTaskStrip from "./AiTaskStrip.vue";
import AiFeatureChip from "./AiFeatureChip.vue";
import AppModal from "./AppModal.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";

const emit = defineEmits(["close"]);

const project = useProjectStore();
const ui = useUiStore();
const ai = useAiStore();
const aiTasks = useAiTasksStore();
const error = ref("");

const myTask = computed(() => aiTasks.runningTasks.find(
  (t) => t.feature === "marketingPack"
));
const running = computed(() => !!myTask.value);

function isAbort(e) { return e?.name === "AbortError" || /abort/i.test(e?.message || ""); }

const pack = computed(() => project.marketingPack);

async function run() {
  error.value = "";
  if (running.value) return;
  if (!ai.providerForFeature("marketingPack")) {
    error.value = "Configure an AI provider in Settings → AI to generate the marketing pack.";
    return;
  }
  try {
    const result = await generateMarketingPack({
      project,
      task: { label: "Marketing pack", meta: {} },
    });
    project.setMarketingPack(result);
  } catch (e) {
    if (!isAbort(e)) {
      const msg = String(e?.message || e || "");
      error.value = /provider|api key|configure/i.test(msg)
        ? "Configure an AI provider in Settings → AI to generate the marketing pack."
        : msg || "Couldn't generate the marketing pack.";
    }
  }
}
function regenerate() {
  project.clearMarketingPack();
  run();
}
function clearAll() {
  project.clearMarketingPack();
}

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    ui.showToast({ message: `${label} copied to clipboard.` });
  } catch {
    ui.showToast({ message: "Couldn't copy — your browser may have blocked the clipboard." });
  }
}

const ago = (ts) => {
  if (!ts) return "";
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

function wordCount(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).length;
}

function formatComps(comps) {
  if (!Array.isArray(comps) || !comps.length) return "";
  return comps.map((c) => {
    const head = [c.title, c.author && `by ${c.author}`, c.year && `(${c.year})`].filter(Boolean).join(" ");
    return `- ${head}${c.rationale ? ` — ${c.rationale}` : ""}`;
  }).join("\n");
}

onMounted(() => {
  if (!pack.value) run();
});
</script>

<template>
  <AppModal
    eyebrow="Marketing pack"
    title="Logline, blurbs, synopsis, pitch"
    wide
    :closable="!running"
    @close="emit('close')"
  >
    <template #header>
      <div class="mp-titleblock">
        <div class="t-eyebrow">Marketing pack</div>
        <h2 class="modal-title">Logline, blurbs, synopsis, pitch</h2>
      </div>
      <div class="mp-header-actions">
        <AiFeatureChip feature="marketingPack" label="Marketing" />
      </div>
    </template>

    <p class="mp-blurb">
      One LLM call returns the four artifacts a writer needs to query and pitch: a
      <strong>logline</strong> (one sentence), three <strong>back-cover blurb variants</strong>
      from different angles, a one-page <strong>synopsis</strong> (including the ending — agents
      need it), and a three-paragraph <strong>elevator pitch</strong>. Best after a complete
      draft. Each artifact has a copy button.
    </p>

    <div v-if="error" class="mp-error">
      <Icon name="Alert" :size="13" /> {{ error }}
      <JwButton intent="ghost" size="small" @click="run">
        <Icon name="Refresh" :size="12" /> Retry
      </JwButton>
    </div>

    <AiTaskStrip v-if="running" :task="myTask" />

    <div v-else-if="!pack" class="mp-loading">
      <span class="mp-spinner" />
      <span>Reading the whole book…</span>
    </div>

    <template v-else-if="pack">
      <div class="mp-head">
        <span class="mp-meta">
          {{ pack.totalChapters }} chapters · generated {{ ago(pack.generatedAt) }}
          <template v-if="pack.model"> · via {{ pack.model }}</template>
        </span>
      </div>

      <!-- Logline -->
      <section class="mp-section">
        <div class="mp-section-h">
          <span>Logline</span>
          <span class="mp-section-meta">{{ wordCount(pack.logline) }} words</span>
          <span class="mp-spacer" />
          <JwButton intent="ghost" size="small" @click="copyText(pack.logline, 'Logline')">
            <Icon name="Plus" :size="12" /> Copy
          </JwButton>
        </div>
        <p class="mp-logline">{{ pack.logline || "(no logline returned)" }}</p>
      </section>

      <!-- Blurbs -->
      <section class="mp-section">
        <div class="mp-section-h">
          <span>Back-cover blurbs</span>
          <span class="mp-section-meta">3 angles</span>
        </div>
        <div class="mp-blurbs">
          <article v-for="b in pack.blurbs" :key="b.angle" class="mp-blurb-card">
            <header class="mp-blurb-h">
              <span class="mp-blurb-angle">{{ b.label }}</span>
              <span class="mp-section-meta">{{ wordCount(b.text) }} words</span>
              <span class="mp-spacer" />
              <JwButton intent="ghost" size="small" @click="copyText(b.text, b.label + ' blurb')">
                <Icon name="Plus" :size="12" /> Copy
              </JwButton>
            </header>
            <p class="mp-blurb-desc">{{ b.description }}</p>
            <p class="mp-blurb-text">{{ b.text || "(no blurb returned)" }}</p>
          </article>
        </div>
      </section>

      <!-- Synopsis -->
      <section class="mp-section">
        <div class="mp-section-h">
          <span>One-page synopsis</span>
          <span class="mp-section-meta">{{ wordCount(pack.synopsis) }} words · includes ending</span>
          <span class="mp-spacer" />
          <JwButton intent="ghost" size="small" @click="copyText(pack.synopsis, 'Synopsis')">
            <Icon name="Plus" :size="12" /> Copy
          </JwButton>
        </div>
        <p class="mp-prose">{{ pack.synopsis || "(no synopsis returned)" }}</p>
      </section>

      <!-- Pitch -->
      <section class="mp-section">
        <div class="mp-section-h">
          <span>Elevator pitch</span>
          <span class="mp-section-meta">{{ wordCount(pack.pitch) }} words · 3 paragraphs</span>
          <span class="mp-spacer" />
          <JwButton intent="ghost" size="small" @click="copyText(pack.pitch, 'Elevator pitch')">
            <Icon name="Plus" :size="12" /> Copy
          </JwButton>
        </div>
        <p class="mp-prose">{{ pack.pitch || "(no pitch returned)" }}</p>
      </section>

      <!-- Comp titles -->
      <section v-if="pack.comps?.length" class="mp-section">
        <div class="mp-section-h">
          <span>Comp titles</span>
          <span class="mp-section-meta">{{ pack.comps.length }} suggested</span>
          <span class="mp-spacer" />
          <JwButton intent="ghost" size="small" @click="copyText(formatComps(pack.comps), 'Comp titles')">
            <Icon name="Plus" :size="12" /> Copy as list
          </JwButton>
        </div>
        <p class="mp-comp-warning">
          <Icon name="Alert" :size="12" />
          <span>
            <strong>Verify these before sending anywhere.</strong> Models confidently invent comp
            titles that don't exist or misattribute them. Confidence labels are the model's own
            self-assessment — treat as a starting point for research, not a finished list. Agents
            want comps published in the last 5 years; if a suggestion is older, reach for a more
            recent equivalent.
          </span>
        </p>
        <ul class="mp-comps">
          <li v-for="c in pack.comps" :key="c.id" class="mp-comp" :data-confidence="c.confidence">
            <div class="mp-comp-head">
              <span class="mp-comp-title">{{ c.title || "(untitled)" }}</span>
              <span v-if="c.author" class="mp-comp-author">— {{ c.author }}</span>
              <span v-if="c.year" class="mp-comp-year">({{ c.year }})</span>
              <span class="mp-spacer" />
              <span class="mp-comp-conf" :data-confidence="c.confidence">
                {{ c.confidence }} confidence
              </span>
            </div>
            <p v-if="c.rationale" class="mp-comp-rationale">{{ c.rationale }}</p>
          </li>
        </ul>
      </section>
    </template>

    <template #footer>
      <JwButton v-if="pack && !running" intent="ghost" @click="clearAll">
        Clear pack
      </JwButton>
      <span class="mp-foot-spacer" />
      <JwButton v-if="pack && !running" intent="ghost" @click="regenerate">
        <Icon name="Refresh" :size="12" /> Regenerate
      </JwButton>
      <JwButton intent="primary" @click="emit('close')">Done</JwButton>
    </template>
  </AppModal>
</template>

<style scoped>
.mp-blurb {
  margin: 0 0 16px; max-width: 80ch;
  font-size: 12.5px; line-height: 1.55; color: var(--muted);
}
.mp-blurb strong { color: var(--ink-2); font-weight: 600; }

.mp-error {
  display: flex; gap: 10px; align-items: center;
  padding: 10px 14px; border-radius: 6px;
  background: color-mix(in oklab, var(--danger-ink, #b91c1c) 12%, transparent);
  color: var(--danger-ink, #b91c1c);
  font-size: 12.5px;
}

.mp-loading {
  display: flex; align-items: center; gap: 12px;
  font-size: 13px; color: var(--muted); font-style: italic;
  min-height: 100px;
}
.mp-spinner {
  display: inline-block; width: 14px; height: 14px;
  border: 2px solid var(--surface-3); border-top-color: var(--accent);
  border-radius: 50%; animation: mp-spin 0.9s linear infinite;
}
@keyframes mp-spin { to { transform: rotate(360deg); } }

.mp-head { margin-bottom: 16px; }
.mp-meta { font-family: var(--font-mono); font-size: 10.5px; color: var(--muted); }

.mp-section + .mp-section { margin-top: 22px; }
.mp-section-h {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 10px;
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted);
}
.mp-section-meta {
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0; text-transform: none;
  color: var(--subtle);
}
.mp-spacer { flex: 1; }

.mp-logline {
  margin: 0;
  font-family: var(--font-serif); font-size: 16px; line-height: 1.5;
  color: var(--ink); font-style: italic;
  padding: 14px 18px;
  background: color-mix(in oklab, var(--accent) 10%, var(--surface-2));
  border-left: 3px solid var(--accent);
  border-radius: 6px;
}

.mp-blurbs { display: flex; flex-direction: column; gap: 12px; }
.mp-blurb-card {
  padding: 14px 16px;
  background: var(--surface-2); border-radius: 8px;
  border-left: 3px solid var(--accent);
}
.mp-blurb-h {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 4px;
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.08em; color: var(--muted);
}
.mp-blurb-angle {
  text-transform: uppercase;
  color: var(--accent-ink);
}
.mp-blurb-desc {
  margin: 0 0 10px;
  font-size: 11.5px; color: var(--muted); font-style: italic;
}
.mp-blurb-text {
  margin: 0; max-width: 70ch;
  font-family: var(--font-serif); font-size: 14px; line-height: 1.65;
  color: var(--ink-2);
  white-space: pre-wrap;
}

.mp-prose {
  margin: 0; max-width: 78ch;
  font-family: var(--font-serif); font-size: 13.5px; line-height: 1.7;
  color: var(--ink-2);
  white-space: pre-wrap;
  padding: 14px 16px;
  background: var(--surface-2); border-radius: 8px;
}

.mp-comp-warning {
  display: flex; gap: 10px;
  margin: 0 0 14px;
  padding: 10px 14px;
  background: color-mix(in oklab, var(--danger) 8%, var(--surface-2));
  border-left: 3px solid var(--danger);
  border-radius: 6px;
  font-size: 12.5px; line-height: 1.55; color: var(--ink-2);
  max-width: 80ch;
}
.mp-comp-warning :deep(svg) { color: var(--danger); flex-shrink: 0; margin-top: 3px; }
.mp-comp-warning strong { color: var(--ink); font-weight: 600; }

.mp-comps { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.mp-comp {
  padding: 12px 14px;
  background: var(--surface-2); border-radius: 6px;
  border-left: 3px solid var(--accent);
}
.mp-comp[data-confidence="medium"] { border-left-color: var(--gold); }
.mp-comp[data-confidence="low"]    { border-left-color: var(--danger); }

.mp-comp-head { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
.mp-comp-title {
  font-family: var(--font-serif); font-size: 14.5px; font-weight: 600;
  color: var(--ink); font-style: italic;
}
.mp-comp-author { color: var(--ink-2); font-size: 13px; }
.mp-comp-year { font-family: var(--font-mono); font-size: 11px; color: var(--muted); }
.mp-comp-conf {
  font-family: var(--font-mono); font-size: 9.5px;
  letter-spacing: 0.12em; text-transform: uppercase;
  padding: 2px 8px; border-radius: 999px;
  background: var(--surface-3); color: var(--muted);
}
.mp-comp-conf[data-confidence="high"] { background: color-mix(in oklab, var(--status-done) 18%, transparent); color: var(--ink); }
.mp-comp-conf[data-confidence="medium"] { background: color-mix(in oklab, var(--gold) 22%, transparent); color: var(--ink); }
.mp-comp-conf[data-confidence="low"] { background: color-mix(in oklab, var(--danger) 18%, transparent); color: var(--ink); }
.mp-comp-rationale {
  margin: 0; max-width: 70ch;
  font-size: 12.5px; line-height: 1.55; color: var(--ink-2);
}

.mp-foot-spacer { flex: 1; }

.mp-titleblock { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.mp-titleblock h2 { font-family: var(--font-serif); font-size: 22px; font-weight: 600; margin: 4px 0 0; }
.mp-header-actions { display: flex; gap: 8px; flex-shrink: 0; align-items: center; }
</style>
