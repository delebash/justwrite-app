<script setup>
// Sensory research modal — "Research feel".
//
// Sibling to Describe. The writer highlights a subject (a place, an
// object, a moment) and gets a structured research pack of short
// sensory phrases across eight categories. Each phrase has an Insert
// button that drops the phrase into the editor at the end of the
// current selection (additive — original prose untouched).

import { ref, computed, onMounted } from "vue";
import { useAiStore } from "../stores/ai.js";
import { useAiTasksStore } from "../stores/aiTasks.js";
import { generateSensoryPack, SENSORY_CATEGORIES } from "../services/sensoryResearch.js";
import { Icon } from "@delebash/llm-ui";
import AiTaskStrip from "./AiTaskStrip.vue";
import AiFeatureChip from "./AiFeatureChip.vue";
import { AppModal } from "@delebash/llm-ui";
import { UiButton } from "@delebash/llm-ui";

const props = defineProps({
  subject:     { type: String, required: true },
  contextHint: { type: String, default: "" },
});
const emit = defineEmits(["close", "insert"]);

const ai = useAiStore();
const aiTasks = useAiTasksStore();
const pack = ref(null);

const myTask = computed(() => aiTasks.runningTasks.find((t) => t.feature === "sensory"));
const running = computed(() => !!myTask.value);

function isAbort(e) { return e?.name === "AbortError" || /abort/i.test(e?.message || ""); }
const error = ref("");
const insertedKeys = ref(new Set()); // category:index

async function run() {
  error.value = "";
  if (!ai.providerForFeature("sensory")) {
    error.value = "Configure an AI provider in Settings → AI to generate a sensory pack.";
    return;
  }
  pack.value = null;
  insertedKeys.value = new Set();
  try {
    const result = await generateSensoryPack({
      subject: props.subject,
      contextHint: props.contextHint,
      task: { label: "Sensory research pack", meta: { subject: props.subject } },
    });
    pack.value = result;
    if (Object.values(result.pack).every((arr) => !arr.length)) {
      error.value = "The model returned no usable phrases. Try regenerating with a more specific subject.";
    }
  } catch (e) {
    if (!isAbort(e)) {
      const msg = String(e?.message || e || "");
      error.value = /provider|api key|configure/i.test(msg)
        ? "Configure an AI provider in Settings → AI to generate a sensory pack."
        : msg || "Couldn't generate the sensory pack.";
    }
  }
}

function insertPhrase(catKey, idx, phrase) {
  const key = `${catKey}:${idx}`;
  emit("insert", phrase);
  const next = new Set(insertedKeys.value);
  next.add(key);
  insertedKeys.value = next;
}

const categories = computed(() => {
  if (!pack.value?.pack) return [];
  return SENSORY_CATEGORIES
    .map((c) => ({
      ...c,
      items: pack.value.pack[c.key] || [],
    }))
    .filter((c) => c.items.length > 0);
});

const totalCount = computed(() =>
  categories.value.reduce((s, c) => s + c.items.length, 0),
);

// Deliberately no auto-run on mount: the user should see the AI
// routing chip in the header and have the option to change provider
// or model before spending tokens. The empty-state CTA below kicks
// off the run when they're ready.
</script>

<template>
  <AppModal
    eyebrow="Research feel"
    title="Sensory research pack"
    wide
    :closable="!running"
    @close="emit('close')"
  >
    <template #header>
      <div class="sr-titleblock">
        <div class="t-eyebrow">Research feel</div>
        <h2 class="modal-title">Sensory research pack</h2>
      </div>
      <div class="sr-header-actions">
        <AiFeatureChip feature="sensory" label="Sensory" />
      </div>
    </template>

    <p class="sr-blurb">
      Short, concrete sensory phrases for <strong>"{{ subject }}"</strong>. Click any phrase to drop it
      into your manuscript at the end of the selection — additive, your original prose stays untouched.
      Pick the ones that fit your scene; ignore the rest.
    </p>

    <div v-if="error" class="sr-error">
      <Icon name="Alert" :size="13" /> {{ error }}
      <UiButton intent="ghost" size="small" @click="run">
        <Icon name="Refresh" :size="12" /> Retry
      </UiButton>
    </div>

    <AiTaskStrip v-if="running" :task="myTask" />

    <div v-else-if="!pack" class="sr-empty">
      <Icon name="Sparkle" :size="20" />
      <p class="sr-empty-text">
        Build a structured sensory pack — sights, sounds, smells, textures, tastes — for the
        selected subject. Change the provider in the chip above first if you want.
      </p>
      <UiButton intent="primary" @click="run">
        <Icon name="Sparkle" :size="13" /> Research sensory details
      </UiButton>
    </div>

    <template v-else-if="categories.length">
      <div class="sr-grid">
        <section v-for="c in categories" :key="c.key" class="sr-section">
          <header class="sr-section-h">
            <span class="sr-section-label">{{ c.label }}</span>
            <span class="sr-section-blurb">{{ c.blurb }}</span>
          </header>
          <ul class="sr-list">
            <li v-for="(p, i) in c.items" :key="i" class="sr-item">
              <button class="sr-phrase"
                      :class="{ inserted: insertedKeys.has(`${c.key}:${i}`) }"
                      v-tooltip.bottom="'Click to insert at end of selection'"
                      @click="insertPhrase(c.key, i, p)">
                <span class="sr-phrase-text">{{ p }}</span>
                <span class="sr-phrase-icon">
                  <Icon :name="insertedKeys.has(`${c.key}:${i}`) ? 'Check' : 'Plus'" :size="11" />
                </span>
              </button>
            </li>
          </ul>
        </section>
      </div>
    </template>

    <template #footer>
      <span class="t-muted">{{ totalCount }} phrase{{ totalCount === 1 ? '' : 's' }}</span>
      <span class="sr-foot-spacer" />
      <UiButton intent="ghost" :disabled="running" @click="run">
        <Icon name="Refresh" :size="12" /> Regenerate
      </UiButton>
      <UiButton intent="primary" @click="emit('close')">Done</UiButton>
    </template>
  </AppModal>
</template>

<style scoped>
.sr-blurb {
  margin: 0 0 16px; max-width: 80ch;
  font-size: 12.5px; line-height: 1.55; color: var(--muted);
}
.sr-blurb strong { color: var(--ink-2); font-weight: 600; font-style: italic; }

.sr-error {
  display: flex; gap: 10px; align-items: center;
  padding: 10px 14px; border-radius: 6px;
  background: color-mix(in oklab, var(--danger-ink, #b91c1c) 12%, transparent);
  color: var(--danger-ink, #b91c1c);
  font-size: 12.5px;
}

.sr-empty {
  display: flex; flex-direction: column; align-items: center;
  gap: 14px; padding: 32px 18px;
  background: var(--surface-2);
  border-radius: 10px;
  text-align: center;
}
.sr-empty > :first-child { color: var(--accent); }
.sr-empty-text {
  margin: 0; max-width: 56ch;
  font-size: 13px; line-height: 1.55; color: var(--ink-2);
}

.sr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 18px;
}
.sr-section { display: flex; flex-direction: column; gap: 8px; }
.sr-section-h { display: flex; flex-direction: column; gap: 2px; }
.sr-section-label {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--accent-ink);
}
.sr-section-blurb {
  font-size: 11.5px; color: var(--muted); line-height: 1.4;
}

.sr-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
.sr-item { margin: 0; }
.sr-phrase {
  appearance: none; border: 0; background: var(--surface-2);
  cursor: pointer;
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 8px 12px; border-radius: 6px;
  text-align: left;
  font-family: var(--font-serif);
  font-size: 13px; line-height: 1.5; color: var(--ink-2);
  transition: background 100ms ease, color 100ms ease;
}
.sr-phrase:hover {
  background: var(--accent-soft);
  color: var(--ink);
}
.sr-phrase.inserted {
  background: color-mix(in oklab, var(--status-done) 14%, transparent);
  color: var(--ink);
}
.sr-phrase-text { flex: 1; min-width: 0; }
.sr-phrase-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px;
  color: var(--muted);
}
.sr-phrase.inserted .sr-phrase-icon { color: var(--status-done); }

.sr-foot-spacer { flex: 1; }

.sr-titleblock { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.sr-titleblock h2 { font-family: var(--font-serif); font-size: 22px; font-weight: 600; margin: 4px 0 0; }
.sr-header-actions { display: flex; gap: 8px; flex-shrink: 0; align-items: center; }
</style>
