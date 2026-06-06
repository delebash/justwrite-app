<script setup>
// Quick Setup wizard — one-click local-LLM bootstrap. Detects the GPU,
// probes the local Ollama server, pulls the right set of models for the
// detected card, then applies a routing preset that pins reasoning-class
// features to the heavy model, snappy features to a smaller one, and
// optionally routes the heavy analysis features (critique, plot-hole
// audit, etc.) to a configured cloud provider.
//
// Steps: detect → (noOllama if absent) → confirm → pulling → done
//   The wizard does NOT install Ollama itself — too many OS-specific
//   failure modes. If the probe fails it shows the download link and a
//   Recheck button.

import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useAiStore } from "../stores/ai.js";
import AppModal from "./AppModal.vue";
import JwButton from "./ui/JwButton.vue";
import JwSelect from "./ui/JwSelect.vue";
import Icon from "./Icon.vue";
import {
  QUICK_SETUP_PRESETS,
  QUICK_SETUP_PROVIDER_IDS,
  tierForVramMb,
} from "../services/quickSetupPresets.js";
import { probeOllama, listInstalledModels, pullModel } from "../services/ollamaAdmin.js";

const props = defineProps({
  ollamaBaseUrl: { type: String, default: "http://localhost:11434/v1" },
});
const emit = defineEmits(["close"]);

const ai = useAiStore();

// ── State ──────────────────────────────────────────────────────────
const step = ref("detect");                  // detect | noOllama | confirm | pulling | done
const gpu = ref(null);                       // { vendor, name, vramMb } or null
const detectError = ref("");
const tier = ref("8");                       // active preset key
const cloudProviderId = ref(null);           // id or null
const installedModels = ref([]);             // models already pulled
const pullProgress = ref([]);                // [{ name, status, completed, total }]
const pullController = ref(null);
const pullError = ref("");

// ── Derived ────────────────────────────────────────────────────────
const preset = computed(() => QUICK_SETUP_PRESETS[tier.value]);
const tierOptions = computed(() =>
  Object.entries(QUICK_SETUP_PRESETS).map(([k, p]) => ({ value: k, label: p.label })),
);
const cloudProviders = computed(() => {
  const isLocal = (u) => /\b(localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i.test(String(u || ""));
  return ai.providers
    .filter((p) => (p.kind === "llm" || p.kind === "both") && !!p.apiKey && !isLocal(p.baseUrl));
});
const cloudOptions = computed(() => [
  { value: "", label: "None — keep analysis features local" },
  ...cloudProviders.value.map((p) => ({ value: p.id, label: p.name })),
]);
const modelsToPull = computed(() => {
  const need = preset.value?.pulls || [];
  const have = new Set(installedModels.value.map(stripTag));
  return need.filter((m) => !have.has(stripTag(m)));
});
const allPullsDone = computed(() =>
  pullProgress.value.length > 0 &&
  pullProgress.value.every((p) => p.status === "done"),
);

// ── Lifecycle ──────────────────────────────────────────────────────
onMounted(detect);
onBeforeUnmount(() => pullController.value?.abort());

// ── Step handlers ──────────────────────────────────────────────────
async function detect() {
  step.value = "detect";
  detectError.value = "";
  if (window.justwrite?.system?.detectGpu) {
    const info = await window.justwrite.system.detectGpu();
    if (info?.vendor) {
      gpu.value = info;
      tier.value = tierForVramMb(info.vramMb);
    } else {
      detectError.value = "Couldn't detect a GPU — pick your card manually below.";
    }
  } else {
    detectError.value = "GPU detection isn't available in browser mode — pick your card manually below.";
  }
  await checkOllama();
}

async function checkOllama() {
  const reachable = await probeOllama(props.ollamaBaseUrl);
  if (!reachable) { step.value = "noOllama"; return; }
  try { installedModels.value = await listInstalledModels(props.ollamaBaseUrl); }
  catch { installedModels.value = []; }
  step.value = "confirm";
}

async function startPulls() {
  step.value = "pulling";
  pullError.value = "";
  pullController.value = new AbortController();
  const list = modelsToPull.value;
  pullProgress.value = list.map((name) => ({ name, status: "pending", completed: 0, total: 0 }));

  for (let i = 0; i < list.length; i++) {
    const name = list[i];
    setProgress(i, { status: "downloading" });
    try {
      await pullModel(props.ollamaBaseUrl, name, {
        signal: pullController.value.signal,
        onProgress: (p) => setProgress(i, {
          status: p.status || "downloading",
          completed: p.completed || 0,
          total: p.total || 0,
        }),
      });
      setProgress(i, { status: "done", completed: 1, total: 1 });
    } catch (e) {
      if (e?.name === "AbortError") { setProgress(i, { status: "cancelled" }); return; }
      pullError.value = `Pull failed for ${name}: ${e?.message || e}`;
      setProgress(i, { status: "failed" });
      return;
    }
  }
  apply();
}

function setProgress(i, patch) {
  const next = [...pullProgress.value];
  next[i] = { ...next[i], ...patch };
  pullProgress.value = next;
}

function cancel() {
  pullController.value?.abort();
}

function apply() {
  ai.applyQuickSetupPreset({
    preset: preset.value,
    ollamaBaseUrl: props.ollamaBaseUrl,
    cloudProviderId: cloudProviderId.value || null,
    providerIds: QUICK_SETUP_PROVIDER_IDS,
  });
  step.value = "done";
}

function close() { emit("close"); }

// ── Utilities ──────────────────────────────────────────────────────
function stripTag(m) { return String(m).split(":")[0]; }
function fmtBytes(b) {
  if (!b) return "";
  const gb = b / 1_073_741_824;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(b / 1_048_576).toFixed(0)} MB`;
}
function pctOf(p) {
  if (!p.total) return p.status === "done" ? 100 : 0;
  return Math.min(100, Math.round((p.completed / p.total) * 100));
}
</script>

<template>
  <AppModal
    eyebrow="Local LLM"
    title="Quick setup"
    @close="close"
  >
    <!-- Step: detect / confirm ----------------------------------- -->
    <div v-if="step === 'detect' || step === 'confirm'" class="qs-body">
      <section class="qs-section">
        <div class="qs-section-title">Your hardware</div>
        <div v-if="gpu" class="qs-row">
          <div>
            <div class="qs-strong">{{ gpu.name }}</div>
            <div class="qs-dim">
              {{ gpu.vendor }} ·
              <template v-if="gpu.vramMb">{{ (gpu.vramMb / 1024).toFixed(1) }} GB VRAM</template>
              <template v-else>VRAM unknown</template>
            </div>
          </div>
        </div>
        <div v-else-if="detectError" class="qs-dim">{{ detectError }}</div>
      </section>

      <section class="qs-section">
        <div class="qs-section-title">Hardware tier</div>
        <JwSelect v-model="tier" :options="tierOptions" />
        <p class="qs-dim qs-mt">{{ preset?.blurb }}</p>
      </section>

      <section class="qs-section">
        <div class="qs-section-title">Cloud provider for heavy analysis (optional)</div>
        <JwSelect v-model="cloudProviderId" :options="cloudOptions" />
        <p v-if="!cloudProviders.length" class="qs-dim qs-mt">
          No cloud provider configured. Critique, plot-hole audit, and similar features will run on the local default model.
          You can add one later from the providers list.
        </p>
      </section>

      <section v-if="step === 'confirm'" class="qs-section">
        <div class="qs-section-title">Models to download</div>
        <div v-if="modelsToPull.length === 0" class="qs-dim">
          All required models are already installed. Nothing to download.
        </div>
        <ul v-else class="qs-pulls">
          <li v-for="m in modelsToPull" :key="m">
            <Icon name="Download" :size="12" /> {{ m }}
          </li>
        </ul>
        <p class="qs-dim qs-mt">
          Total estimated download: ~{{ preset.estimatedDownloadGb }} GB. Pulls run sequentially; you can cancel mid-way.
        </p>
      </section>
    </div>

    <!-- Step: noOllama ------------------------------------------- -->
    <div v-else-if="step === 'noOllama'" class="qs-body">
      <p>Ollama isn't responding at <code>{{ ollamaBaseUrl }}</code>.</p>
      <p>
        Install Ollama from
        <a href="https://ollama.com/download" target="_blank" rel="noopener">ollama.com/download</a>,
        then click Recheck. The wizard will pick up from here.
      </p>
    </div>

    <!-- Step: pulling -------------------------------------------- -->
    <div v-else-if="step === 'pulling'" class="qs-body">
      <ul class="qs-progress">
        <li v-for="(p, i) in pullProgress" :key="p.name">
          <div class="qs-progress-head">
            <span class="qs-strong">{{ p.name }}</span>
            <span class="qs-dim">{{ p.status }}{{ p.total ? ` · ${fmtBytes(p.completed)} / ${fmtBytes(p.total)}` : "" }}</span>
          </div>
          <progress :value="pctOf(p)" max="100" />
        </li>
      </ul>
      <p v-if="pullError" class="qs-error">{{ pullError }}</p>
    </div>

    <!-- Step: done ----------------------------------------------- -->
    <div v-else-if="step === 'done'" class="qs-body">
      <p class="qs-strong">Setup applied.</p>
      <ul class="qs-summary">
        <li>Default LLM: <code>{{ preset.defaultChatModel }}</code></li>
        <li v-if="preset.fastChatModel">Fast LLM (Brainstorm, Resume, Recap): <code>{{ preset.fastChatModel }}</code></li>
        <li>Embedding: <code>{{ preset.embeddingModel }}</code></li>
        <li v-if="cloudProviderId">Cloud routing for critique-class features applied.</li>
      </ul>
      <p class="qs-dim">You can fine-tune any of this in Feature routing below.</p>
    </div>

    <!-- Footer --------------------------------------------------- -->
    <template #footer>
      <template v-if="step === 'detect'">
        <JwButton intent="secondary" @click="close">Cancel</JwButton>
      </template>
      <template v-else-if="step === 'noOllama'">
        <JwButton intent="secondary" @click="close">Close</JwButton>
        <JwButton intent="primary" @click="checkOllama">Recheck</JwButton>
      </template>
      <template v-else-if="step === 'confirm'">
        <JwButton intent="secondary" @click="close">Cancel</JwButton>
        <JwButton v-if="modelsToPull.length === 0" intent="primary" @click="apply">Apply preset</JwButton>
        <JwButton v-else intent="primary" @click="startPulls">Pull {{ modelsToPull.length }} model{{ modelsToPull.length === 1 ? "" : "s" }}</JwButton>
      </template>
      <template v-else-if="step === 'pulling'">
        <JwButton v-if="!pullError && !allPullsDone" intent="danger" @click="cancel">Cancel</JwButton>
        <JwButton v-if="pullError" intent="secondary" @click="close">Close</JwButton>
      </template>
      <template v-else-if="step === 'done'">
        <JwButton intent="primary" @click="close">Done</JwButton>
      </template>
    </template>
  </AppModal>
</template>

<style scoped>
.qs-body { display: flex; flex-direction: column; gap: 18px; }
.qs-section { display: flex; flex-direction: column; gap: 6px; }
.qs-section-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-2, #888); }
.qs-row { display: flex; justify-content: space-between; align-items: center; }
.qs-strong { font-weight: 600; }
.qs-dim { color: var(--text-2, #888); font-size: 13px; }
.qs-mt { margin-top: 4px; }
.qs-pulls { margin: 0; padding-left: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.qs-pulls li { display: flex; align-items: center; gap: 8px; font-family: var(--font-mono, monospace); font-size: 13px; }
.qs-progress { margin: 0; padding-left: 0; list-style: none; display: flex; flex-direction: column; gap: 14px; }
.qs-progress-head { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 4px; font-size: 13px; }
.qs-progress progress { width: 100%; height: 6px; }
.qs-summary { margin: 8px 0; padding-left: 16px; display: flex; flex-direction: column; gap: 4px; }
.qs-error { color: var(--danger, #c33); font-size: 13px; }
</style>
