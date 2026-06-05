<script setup>
// Reverse outline modal ("StorySnap").
//
// Single LLM call reads chapter summaries + tension/pacing/ending data
// and returns the act structure the book actually has. Renders:
//   - structureName chip + 2-3 sentence "shape" summary
//   - plot points list (Inciting incident, Midpoint, Climax, etc.)
//     with chapter-jump links
//   - per-chapter beat strip with act-break dividers
//
// Result persists on project.reverseOutline so re-opening the modal
// reads from cache. Regenerate forces a fresh pass.

import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useAiStore } from "../stores/ai.js";
import { useAiTasksStore } from "../stores/aiTasks.js";
import {
  generateReverseOutline,
  STRUCTURE_LABELS,
} from "../services/analysis/reverseOutline.js";
import Icon from "./Icon.vue";
import AiTaskStrip from "./AiTaskStrip.vue";
import AppModal from "./AppModal.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";

const emit = defineEmits(["close"]);

const project = useProjectStore();
const ai = useAiStore();
const router = useRouter();
const aiTasks = useAiTasksStore();
const error = ref("");

const myTask = computed(() => aiTasks.runningTasks.find((t) => t.feature === "reverseOutline"));
const running = computed(() => !!myTask.value);

function isAbort(e) { return e?.name === "AbortError" || /abort/i.test(e?.message || ""); }

const outline = computed(() => project.reverseOutline);

async function run() {
  error.value = "";
  if (!ai.providerForFeature("reverseOutline")) {
    error.value = "Configure an AI provider in Settings → AI to generate the reverse outline.";
    return;
  }
  try {
    const result = await generateReverseOutline({
      project,
      task: { label: "Reverse outline", meta: {} },
    });
    project.setReverseOutline(result);
  } catch (e) {
    if (!isAbort(e)) {
      const msg = String(e?.message || e || "");
      error.value = /provider|api key|configure/i.test(msg)
        ? "Configure an AI provider in Settings → AI to generate the reverse outline."
        : msg || "Couldn't build the outline.";
    }
  }
}

function regenerate() {
  project.clearReverseOutline();
  run();
}

function clearAll() {
  project.clearReverseOutline();
}

function jumpToChapter(num) {
  const ch = project.allChapters.find((c) => c.num === num);
  if (ch) router.push(`/chapters/${ch.id}`);
}

// Build a flat per-chapter list with act-break markers interleaved so
// the strip can render in one v-for.
const stripRows = computed(() => {
  const ol = outline.value;
  if (!ol) return [];
  const breakByNum = new Map();
  for (const b of ol.actBreaks || []) breakByNum.set(b.afterChapterNum, b.name);
  const beats = new Map();
  for (const b of ol.chapterBeats || []) beats.set(b.chapterNum, b.beat);
  const out = [];
  for (const ch of project.allChapters) {
    const beat = beats.get(ch.num);
    out.push({
      kind: "chapter",
      chapter: ch,
      beat: beat || "",
    });
    if (breakByNum.has(ch.num)) {
      out.push({
        kind: "break",
        name: breakByNum.get(ch.num),
      });
    }
  }
  return out;
});

const ago = (ts) => {
  if (!ts) return "";
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

onMounted(() => {
  if (!outline.value) run();
});
</script>

<template>
  <AppModal
    eyebrow="Reverse outline"
    title="The shape your book actually has"
    wide
    :closable="!running"
    @close="emit('close')"
  >
    <p class="ro-blurb">
      A structural editor's reading of the book you've drafted — the act structure that's
      actually on the page, where the plot points land, and what each chapter is doing in
      the overall shape. Best after you've finished a complete draft. Long books take a while
      (one LLM call over the whole manuscript digest).
    </p>

    <div v-if="error" class="ro-error">
      <Icon name="Alert" :size="13" /> {{ error }}
      <JwButton intent="ghost" size="small" @click="run">
        <Icon name="Refresh" :size="12" /> Retry
      </JwButton>
    </div>

    <AiTaskStrip v-if="running" :task="myTask" />

    <template v-else-if="outline">
      <div class="ro-head">
        <span class="ro-structure-chip" :data-structure="outline.structureName">
          {{ STRUCTURE_LABELS[outline.structureName] || outline.structureName }}
        </span>
        <span class="ro-meta">
          {{ outline.totalChapters }} chapters · generated {{ ago(outline.generatedAt) }}
          <template v-if="outline.model"> · via {{ outline.model }}</template>
        </span>
      </div>

      <p v-if="outline.summary" class="ro-summary">{{ outline.summary }}</p>

      <section v-if="outline.plotPoints?.length" class="ro-section">
        <div class="ro-section-h">Plot points</div>
        <ul class="ro-points">
          <li v-for="p in outline.plotPoints" :key="p.id" class="ro-point">
            <div class="ro-point-head">
              <span class="ro-point-name">{{ p.name }}</span>
              <button class="ro-point-jump" @click="jumpToChapter(p.chapterNum)"
                      v-tooltip.bottom="'Open this chapter'">
                Ch. {{ p.chapterNum }}
              </button>
            </div>
            <p v-if="p.description" class="ro-point-desc">{{ p.description }}</p>
          </li>
        </ul>
      </section>

      <section v-if="stripRows.length" class="ro-section">
        <div class="ro-section-h">Chapter-by-chapter</div>
        <ol class="ro-strip">
          <template v-for="(row, i) in stripRows" :key="i">
            <li v-if="row.kind === 'chapter'" class="ro-chapter">
              <button class="ro-chapter-num" @click="jumpToChapter(row.chapter.num)"
                      v-tooltip.bottom="row.chapter.title || 'Open chapter'">
                Ch. {{ row.chapter.num }}
              </button>
              <p class="ro-chapter-beat">
                <span v-if="row.beat">{{ row.beat }}</span>
                <span v-else class="ro-chapter-beat-empty">(no beat — chapter may be empty or new)</span>
              </p>
            </li>
            <li v-else class="ro-break">
              <span class="ro-break-line" />
              <span class="ro-break-name">{{ row.name }}</span>
              <span class="ro-break-line" />
            </li>
          </template>
        </ol>
      </section>
    </template>

    <template #footer>
      <JwButton v-if="outline && !running" intent="ghost" @click="clearAll">
        Clear outline
      </JwButton>
      <span class="ro-foot-spacer" />
      <JwButton v-if="outline && !running" intent="ghost" @click="regenerate">
        <Icon name="Refresh" :size="12" /> Regenerate
      </JwButton>
      <JwButton intent="primary" @click="emit('close')">Done</JwButton>
    </template>
  </AppModal>
</template>

<style scoped>
.ro-blurb {
  margin: 0 0 16px; max-width: 80ch;
  font-size: 12.5px; line-height: 1.55; color: var(--muted);
}

.ro-error {
  display: flex; gap: 10px; align-items: center;
  padding: 10px 14px; border-radius: 6px;
  background: color-mix(in oklab, var(--danger-ink, #b91c1c) 12%, transparent);
  color: var(--danger-ink, #b91c1c);
  font-size: 12.5px;
}

.ro-loading {
  display: flex; align-items: center; gap: 12px;
  font-size: 13px; color: var(--muted); font-style: italic;
  min-height: 100px;
}
.ro-spinner {
  display: inline-block; width: 14px; height: 14px;
  border: 2px solid var(--surface-3); border-top-color: var(--accent);
  border-radius: 50%; animation: ro-spin 0.9s linear infinite;
}
@keyframes ro-spin { to { transform: rotate(360deg); } }

.ro-head {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  margin-bottom: 12px;
}
.ro-structure-chip {
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.08em;
  padding: 4px 12px; border-radius: 999px;
  background: var(--accent-soft); color: var(--accent-ink);
}
.ro-structure-chip[data-structure="5-act"] { background: color-mix(in oklab, var(--gold) 22%, transparent); }
.ro-structure-chip[data-structure="loose"] { background: var(--surface-3); color: var(--muted); }
.ro-meta { font-family: var(--font-mono); font-size: 10.5px; color: var(--muted); }

.ro-summary {
  margin: 0 0 22px; max-width: 78ch;
  font-family: var(--font-serif); font-size: 14.5px; line-height: 1.65;
  color: var(--ink-2); font-style: italic;
  padding-left: 14px; border-left: 2px solid var(--accent-line);
}

.ro-section + .ro-section { margin-top: 24px; }
.ro-section-h {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted);
  margin: 0 0 12px;
}

.ro-points { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.ro-point {
  padding: 12px 14px;
  background: var(--surface-2); border-radius: 8px;
  border-left: 3px solid var(--accent);
}
.ro-point-head {
  display: flex; align-items: baseline; gap: 12px; margin-bottom: 6px;
}
.ro-point-name {
  font-family: var(--font-serif); font-size: 14.5px; font-weight: 600;
  color: var(--ink);
}
.ro-point-jump {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--accent-ink);
  padding: 0;
  margin-left: auto;
}
.ro-point-jump:hover { color: var(--accent); text-decoration: underline; }
.ro-point-desc {
  margin: 0; max-width: 70ch;
  font-size: 13px; line-height: 1.55; color: var(--ink-2);
}

.ro-strip { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.ro-chapter {
  display: grid; grid-template-columns: 90px 1fr; gap: 14px; align-items: baseline;
  padding: 8px 0;
}
.ro-chapter-num {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  font-family: var(--font-mono); font-size: 11px;
  color: var(--accent-ink); padding: 0; text-align: left;
}
.ro-chapter-num:hover { color: var(--accent); text-decoration: underline; }
.ro-chapter-beat {
  margin: 0; max-width: 70ch;
  font-size: 13px; line-height: 1.55; color: var(--ink-2);
}
.ro-chapter-beat-empty { color: var(--muted); font-style: italic; }
.ro-break {
  display: flex; align-items: center; gap: 12px;
  margin: 6px 0;
}
.ro-break-line { flex: 1; height: 1px; background: var(--border); }
.ro-break-name {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--accent-ink);
}

.ro-foot-spacer { flex: 1; }
</style>
