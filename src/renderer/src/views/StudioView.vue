<script setup>
import { ref, computed, watch, onMounted, nextTick } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useStudioStore } from "../stores/studio.js";
import { useAiStore } from "../stores/ai.js";
import { useAiTasksStore } from "../stores/aiTasks.js";
import PaneHeader from "../components/PaneHeader.vue";
import Icon from "../components/Icon.vue";
import Combobox from "../components/Combobox.vue";
import AiFeatureChip from "../components/AiFeatureChip.vue";
import { listVoices, preview } from "../services/tts.js";
import { inferVoiceMetadata } from "../services/voiceGender.js";
import { smartCast, detectSpeakers } from "../services/llm.js";
import { extractParagraphsFromHtml } from "../services/speakerAttribution.js";
import { renderChapter } from "../services/render.js";
import { confirmDialog } from "../services/dialog.js";
import JwInput from "@renderer/components/ui/JwInput.vue";
import JwTag from "@renderer/components/ui/JwTag.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";
import JwSelect from "@renderer/components/ui/JwSelect.vue";
import JwTable from "@renderer/components/ui/JwTable.vue";
import AiTaskStrip from "../components/AiTaskStrip.vue";

const props = defineProps({ tab: { type: String, default: "cast" } });

// Paragraphs whose entire content is just a chapter/scene/part label
// (with optional Roman or Arabic numeral) get dropped before LLM analysis.
// Examples that match: "Scene 1", "scene1", "Chapter II", "Prologue", "Act 3".
// Examples that don't: "The scene shifted to the kitchen", "Chapter One ended in silence".
const STRUCTURAL_MARKER_RE = /^(scene|chapter|part|book|act|prologue|epilogue|interlude)\s*[ivxlcdm0-9]*\.?$/i;

const project = useProjectStore();
const studio = useStudioStore();
const ai = useAiStore();
const aiTasks = useAiTasksStore();

const activeTab = ref(props.tab || "cast");
watch(() => props.tab, (v) => { if (v) activeTab.value = v; });

// Keyboard nav for the Studio tab bar. Implements the standard
// ARIA tablist pattern: Left/Right (and Up/Down) cycle through
// tabs, Home/End jump to the ends, the activated tab takes focus.
const TAB_ORDER = ["cast", "script", "render"];
function onTabKeydown(e) {
  const idx = TAB_ORDER.indexOf(activeTab.value);
  if (idx < 0) return;
  const max = TAB_ORDER.length - 1;
  let next = idx;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") next = idx >= max ? 0 : idx + 1;
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = idx <= 0 ? max : idx - 1;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = max;
  else return;
  e.preventDefault();
  activeTab.value = TAB_ORDER[next];
  // Move focus to the newly selected tab so subsequent arrow presses
  // continue navigating from there (roving tabindex).
  nextTick(() => {
    const el = document.querySelector(`.studio-tab[data-tab="${TAB_ORDER[next]}"]`);
    el?.focus?.();
  });
}

// ── Cast ──────────────────────────────────────────────────────────────
// Default to the saved TTS pick, but only if it's actually ready (apiKey set
// or local). Otherwise fall back to the first ready provider, or null.
function pickInitialTtsId() {
  const ready = ai.readyTtsProviders;
  if (ready.some((p) => p.id === ai.defaultTtsId)) return ai.defaultTtsId;
  return ready[0]?.id || null;
}
const activeProviderId = ref(pickInitialTtsId());
const provider = computed(() => ai.providerById(activeProviderId.value));
// If the active provider gets removed or its key is cleared while Studio is
// open, snap to another ready one (or null) so the dropdown never points at
// a dead entry.
watch(() => ai.readyTtsProviders.map((p) => p.id).join(","), () => {
  const stillReady = ai.readyTtsProviders.some((p) => p.id === activeProviderId.value);
  if (!stillReady) activeProviderId.value = pickInitialTtsId();
});
const llmProvider = computed(() => ai.llmProvider);
const selectedChar = ref(null);
const loadingVoices = ref(false);
const previewingVoice = ref(null);
const audio = ref(null);
const error = ref(null);

// Smart-assign loading state derives from the global task store rather
// than a local ref. That way the button reflects actual call state after
// navigating away and coming back, and there's no stale-loading bug
// where a finished call leaves the button stuck in "Casting…".
// (The Script tab's analyze-loading lookup lives further down next to
// `scriptChapter` since it's keyed by chapter id.)
const smartCastTask = computed(() =>
  aiTasks.runningTasks.find((t) => t.feature === "smartCast")
);
const smartLoading = computed(() => !!smartCastTask.value);

const engineVoices = computed(() => studio.voices.filter((v) => v.providerId === provider.value?.id));

// Per-provider reachability: 'checking' | 'online' | 'offline'. Pinged on
// mount and whenever a new provider becomes ready (e.g. writer adds an
// apiKey from Settings while Studio is open). Offline providers stay in
// the dropdown — they're still configured, just unreachable right now —
// labelled "(offline)" so the writer can fix the underlying server rather
// than wondering where their provider went.
const ttsStatus = ref({});

async function pingTtsProvider(p, { mergeVoices = false } = {}) {
  if (!p) return [];
  ttsStatus.value = { ...ttsStatus.value, [p.id]: "checking" };
  try {
    const list = await listVoices(p);
    if (mergeVoices && list.length) {
      // Run the metadata inferrer on every newly-discovered voice. Provider-
      // supplied fields (Speechmatics' hardcoded gender/accent/tone) win;
      // we only fill blanks. Spreading `...v` last would clobber inference
      // with the `undefined` Kokoro and friends include for missing fields,
      // so resolve each field with an explicit fallback chain.
      const enriched = list.map((v) => {
        const inferred = inferVoiceMetadata(v, p.id);
        return {
          ...v,
          providerId: p.id,
          gender: v.gender || inferred.gender || "",
          accent: v.accent || inferred.accent || "",
          tone:   v.tone   || inferred.tone   || "",
        };
      });
      studio.mergeVoices(enriched);
    }
    ttsStatus.value = { ...ttsStatus.value, [p.id]: list.length ? "online" : "offline" };
    return list;
  } catch {
    ttsStatus.value = { ...ttsStatus.value, [p.id]: "offline" };
    return [];
  }
}

async function refreshVoices() {
  if (!provider.value) return;
  loadingVoices.value = true;
  try {
    await pingTtsProvider(provider.value, { mergeVoices: true });
  } finally { loadingVoices.value = false; }
}

function pingNonActive() {
  for (const p of ai.readyTtsProviders) {
    if (p.id !== activeProviderId.value) pingTtsProvider(p);
  }
}

onMounted(() => { refreshVoices(); pingNonActive(); });
watch(activeProviderId, () => { refreshVoices(); });
// New ready providers get pinged immediately so the dropdown's offline
// badge reflects current state without waiting for the writer to click in.
watch(
  () => ai.readyTtsProviders.map((p) => p.id).join(","),
  () => { pingNonActive(); },
);

function pickVoice(voiceId) {
  if (!selectedChar.value) return;
  if (selectedChar.value === "narrator") studio.setNarrator(voiceId);
  else studio.assignVoice(selectedChar.value, voiceId);
}

async function playPreview(voice) {
  if (!provider.value) return;
  // Cancel anything currently playing before starting a new preview.
  if (audio.value) { try { audio.value.pause(); } catch {} audio.value = null; }
  previewingVoice.value = voice.id;
  try {
    const result = await preview({
      provider: provider.value,
      voice: voice.id,
      input: "I'm going to go and see if it's there. And if it isn't, I'll have to decide whether to put it back.",
    });
    audio.value = new Audio(result.url);
    audio.value.onended = () => { previewingVoice.value = null; };
    audio.value.play().catch(() => { previewingVoice.value = null; });
  } catch (e) { error.value = e.message; previewingVoice.value = null; }
}

async function confirmClearCast() {
  const yes = await confirmDialog({
    title: "Clear every cast assignment?",
    body: "The narrator and every character will be reset to no voice. Re-run Smart-assign or pick voices manually afterward.",
    confirmLabel: "Clear cast",
    danger: true,
  });
  if (!yes) return;
  studio.clearCast();
}

async function runSmartCast() {
  if (!llmProvider.value) { error.value = "No LLM provider configured."; return; }
  if (smartLoading.value) return;
  error.value = null;
  try {
    const map = await smartCast({
      characters: project.characters,
      voices: engineVoices.value,
      task: { label: "Smart-assign cast" },
    });
    for (const [charId, voiceId] of Object.entries(map)) {
      if (project.characterById(charId) && engineVoices.value.find((v) => v.id === voiceId)) {
        studio.assignVoice(charId, voiceId);
      }
    }
  } catch (e) {
    // The task store already showed a "failed: …" toast and cleared
    // the running state. We only surface the message inline so the
    // banner under the buttons stays useful.
    error.value = e.message;
  }
}

function isAssignedToSelected(voiceId) {
  if (!selectedChar.value) return false;
  return selectedChar.value === "narrator" ? studio.cast.narrator === voiceId : studio.cast.characters[selectedChar.value] === voiceId;
}
function castedVoice(charId) {
  const id = charId === "narrator" ? studio.cast.narrator : studio.cast.characters[charId];
  return id ? studio.voiceById(id) : null;
}
function voiceGradient(v) {
  let h = 0; for (const ch of (v?.name || "")) h = (h * 17 + ch.charCodeAt(0)) % 360;
  const bias = v?.gender === "male" ? 200 : v?.gender === "female" ? 30 : 120;
  const hue = (h + bias) % 360;
  return `linear-gradient(135deg, oklch(0.78 0.08 ${hue}), oklch(0.6 0.1 ${(hue + 40) % 360}))`;
}
const unassignedCount = computed(() => studio.unassignedCount);

// ── Voice library DataTable ───────────────────────────────────────────
// Enrich each voice with provider name for display + filtering.
const voiceRows = computed(() =>
  studio.voices.map((v) => ({
    ...v,
    providerName: ai.providerById(v.providerId)?.name || v.providerId || "—",
  }))
);
const voiceQuery = ref("");
function onVoiceInput(e) {
  voiceQuery.value = e.target.value;
}
// Voice library is pre-filtered by the active provider via the Combobox
// above the table (see `:data="voiceRows.filter(... activeProviderId)"`).
function genderSeverity(g) {
  if (g === "male")   return "info";
  if (g === "female") return "accent2";
  return "secondary";
}

// Click-to-cycle in the voice library's gender column. Auto-inference
// covers most voices but it can be wrong (Onyx-as-male maps OpenAI's
// docs, but the writer might disagree). Cycle persists via updateVoice.
const GENDER_CYCLE = ["female", "male", "neutral", ""];
function nextGender(current) {
  const idx = GENDER_CYCLE.indexOf(current || "");
  return GENDER_CYCLE[(idx + 1) % GENDER_CYCLE.length] || "unset";
}
function cycleVoiceGender(voice) {
  if (!voice?.id) return;
  const idx = GENDER_CYCLE.indexOf(voice.gender || "");
  const next = GENDER_CYCLE[(idx + 1) % GENDER_CYCLE.length];
  studio.updateVoice(voice.id, { gender: next });
}

const voiceColumns = [
  { accessorKey: "name",    header: "Name",   sortable: true, headerStyle: "min-width:110px", cellStyle: "min-width:110px" },
  { accessorKey: "gender",  header: "G",      sortable: true, headerStyle: "width:60px",      cellStyle: "width:60px" },
  { id: "preview", accessorKey: "id", header: "", headerStyle: "width:44px", cellStyle: "width:44px" },
];

// ── Script analysis ───────────────────────────────────────────────────
// Restore the chapter the user last analyzed; fall back to the first
// chapter in the project, then the seed sample as a last resort. Persist
// any future selection so reopening Script lands on the same chapter.
function pickInitialScriptChapter() {
  const last = studio.lastScriptChapter;
  const chapters = project.allChapters || [];
  if (last && chapters.some((c) => c.id === last)) return last;
  if (chapters.length) return chapters[0].id;
  return "ch7";
}
const scriptChapter = ref(pickInitialScriptChapter());
watch(scriptChapter, (v) => { if (v) studio.setLastScriptChapter(v); });

// Speaker analysis runs are tracked in the global task store, keyed by
// chapter id in the task's meta. The button derives its loading state
// from "is there a running task for THIS chapter" — that fixes the
// "stuck on Analyzing…" bug (the local ref never reset on the success
// path of the previous implementation) and lets the user navigate away
// mid-call without losing the in-flight state.
const analyzeTask = computed(() =>
  aiTasks.runningTasks.find(
    (t) => t.feature === "speakerAnalysis" && t.meta?.chapterId === scriptChapter.value
  )
);
const analyzeLoading = computed(() => !!analyzeTask.value);

async function reanalyze() {
  if (!llmProvider.value) { error.value = "No LLM provider configured."; return; }
  if (analyzeLoading.value) return;
  error.value = null;
  // Snapshot the chapter id at call time. If the user changes the
  // dropdown mid-call, results still land in the chapter the analysis
  // was started on (and the running task's meta.chapterId stays
  // consistent for derive-loading lookup).
  const chapterId = scriptChapter.value;
  // Wipe the existing script first so the UI shows a clean state during
  // the LLM call rather than the previous run's lines lingering until
  // the new result arrives.
  studio.clearScript(chapterId);
  try {
    // Pull paragraph text from the chapter body. The extractor strips
    // headings, scene marks, structural-marker paragraphs, and pending
    // AI revision marks — matches what Read mode and audio render see.
    const html = project.chapterBody[chapterId] || "";
    const paragraphs = extractParagraphsFromHtml(html);
    const chapter = project.chapterById(chapterId);

    // detectSpeakers now runs the inline-tag pipeline: each paragraph is
    // split into narration / dialogue segments BEFORE the LLM, the
    // dialogue segments are individually attributed, and the result is
    // a ready-to-render line list (multiple lines per paragraph when
    // dialogue is mixed with narration). The chapter intro is built
    // inside the pipeline so we pass `chapter` rather than prepending
    // an intro line here.
    const label = `Script analysis · Ch. ${chapter?.num ?? "?"}`;
    const script = await detectSpeakers({
      paragraphs,
      characters: project.characters,
      chapter,
      task: { label, meta: { chapterId } },
    });
    studio.setScript(chapterId, script);
  } catch (e) {
    error.value = e.message;
  }
}

// ── Render ────────────────────────────────────────────────────────────
const renderingId = ref(null);
const renderProgress = ref(null);
const renderResults = ref({}); // chapterId -> { url, duration }
const renderAudio = ref(null);

async function startRender(chapterId) {
  if (!provider.value) { error.value = "No TTS provider configured."; return; }
  const script = studio.scriptFor(chapterId);
  if (!script) { error.value = `No script for ${chapterId}. Re-analyze first.`; return; }
  renderingId.value = chapterId;
  renderProgress.value = { line: 0, total: script.length };
  error.value = null;
  try {
    const result = await renderChapter({
      provider: provider.value,
      // Route per-voice so a cast mixing OpenAI and Web Speech voices
      // doesn't silently fail mid-chapter.
      voiceProvider: (voiceId) => {
        const v = studio.voiceById(voiceId);
        return v ? ai.providerById(v.providerId) : null;
      },
      lines: script,
      voiceFor: (s) => s === "narrator" ? studio.cast.narrator : studio.cast.characters[s],
      onProgress: (p) => { renderProgress.value = p; },
    });
    renderResults.value = { ...renderResults.value, [chapterId]: { url: result.url, duration: result.duration } };
    // Also surface to the studio store so ExportView can collect WAVs across views.
    studio.setChapterAudio(chapterId, { url: result.url, blob: result.wavBlob, duration: result.duration });
    // Surface skipped lines as a non-blocking warning.
    if (result.skipped?.length) {
      error.value = `Rendered ${chapterId} with ${result.skipped.length} skipped line(s). Most common reason: ${result.skipped[0].reason}.`;
    }
  } catch (e) { error.value = e.message; } finally { renderingId.value = null; }
}

function playChapter(chapterId) {
  const r = renderResults.value[chapterId];
  if (!r) return;
  if (renderAudio.value) renderAudio.value.pause();
  renderAudio.value = new Audio(r.url);
  renderAudio.value.play();
}

function downloadChapter(chapterId) {
  const r = renderResults.value[chapterId];
  if (!r) return;
  const a = document.createElement("a");
  a.href = r.url;
  a.download = `${chapterId}.wav`;
  a.click();
}
</script>

<template>
  <PaneHeader :eyebrow="$t('panes.studio.eyebrow')" :title="$t('nav.studio')">
    <!-- TTS engine chip — always shown, since every Studio tab interacts
         with the voice library (preview, render). Provider + model. -->
    <span class="chip" v-tooltip.bottom="'Active TTS provider for voice preview and render. Switch the voice library above to compare engines.'">
      TTS · <b style="font-weight:600;margin-left:4px">{{ provider?.name || "—" }}</b>
      <span style="color:var(--muted);opacity:0.6;margin:0 4px">·</span>
      <code style="font-family:var(--font-mono);font-size:10.5px;color:var(--ink-2)">{{ provider?.ttsModel || "—" }}</code>
    </span>
    <!-- LLM chip — feature varies by tab. Cast uses Smart-assign, Script
         uses Speaker analysis. Render uses no LLM. -->
    <AiFeatureChip v-if="activeTab === 'cast'"   feature="smartCast"       label="Smart-assign" />
    <AiFeatureChip v-if="activeTab === 'script'" feature="speakerAnalysis" label="Speaker analysis" />
    <router-link to="/settings/audio" custom v-slot="{ navigate }">
      <JwButton intent="ghost" size="small" @click="navigate"><Icon name="Settings" :size="14" /> Engines</JwButton>
    </router-link>
  </PaneHeader>

  <p class="studio-desc">
    <strong>Studio</strong> turns your written manuscript into a narrated audiobook in three
    sequential steps — choose voices in <strong>Cast</strong>, let the AI work out who speaks
    each line in <strong>Script</strong>, then generate the audio chapter by chapter in
    <strong>Render</strong>. You can write a whole novel without touching it; it exists for
    writers who want to produce their own audiobook or hear their prose read aloud as a
    revision tool.
  </p>

  <div class="studio-tabs" role="tablist" aria-label="Studio sections">
    <button class="studio-tab" data-tab="cast"
      role="tab" :aria-selected="activeTab === 'cast'" :tabindex="activeTab === 'cast' ? 0 : -1"
      :class="{ active: activeTab === 'cast' }"
      @click="activeTab = 'cast'" @keydown="onTabKeydown">
      <Icon name="Headphones" :size="15" />
      <span class="studio-tab-label">
        <span class="studio-tab-name">Cast</span>
        <span class="studio-tab-sub">{{ project.characters.length - unassignedCount }}/{{ project.characters.length }} cast{{ unassignedCount ? ` · ${unassignedCount} unassigned` : "" }}</span>
      </span>
    </button>
    <button class="studio-tab" data-tab="script"
      role="tab" :aria-selected="activeTab === 'script'" :tabindex="activeTab === 'script' ? 0 : -1"
      :class="{ active: activeTab === 'script' }"
      @click="activeTab = 'script'" @keydown="onTabKeydown">
      <Icon name="Comment" :size="15" />
      <span class="studio-tab-label">
        <span class="studio-tab-name">Script</span>
        <span class="studio-tab-sub">Speaker analysis</span>
      </span>
    </button>
    <button class="studio-tab" data-tab="render"
      role="tab" :aria-selected="activeTab === 'render'" :tabindex="activeTab === 'render' ? 0 : -1"
      :class="{ active: activeTab === 'render' }"
      @click="activeTab = 'render'" @keydown="onTabKeydown">
      <Icon name="Waveform" :size="15" />
      <span class="studio-tab-label">
        <span class="studio-tab-name">Render</span>
        <span class="studio-tab-sub">Chapter audio</span>
      </span>
    </button>
  </div>

  <!-- CAST TAB -->
  <div v-if="activeTab === 'cast'" role="tabpanel" aria-label="Cast" class="pane-card studio-cast-layout" style="display:grid;grid-template-columns:1fr 440px">
    <div class="scrollarea" style="padding:18px 22px 40px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div>
          <div class="t-eyebrow">Narrator</div>
          <div style="font-family:var(--font-serif);font-size:18px;font-weight:600">The voice of everything that isn't spoken</div>
        </div>
        <div style="display:flex;gap:8px">
          <JwButton intent="secondary" :disabled="smartLoading" @click="confirmClearCast">
            <Icon name="Close" :size="13" />
            Clear cast
          </JwButton>
          <JwButton intent="primary" :disabled="smartLoading" @click="runSmartCast">
            <Icon :name="smartLoading ? 'Refresh' : 'Sparkle'" :size="13" />
            {{ smartLoading ? "Casting…" : "Smart-assign" }}
          </JwButton>
        </div>
      </div>
      <p class="st-cast-desc">
        <strong>Smart-assign</strong> asks your LLM to match each character's name and role
        against the available TTS voices and propose an initial cast. You can override any
        assignment manually by selecting a character card and clicking a voice in the library.
      </p>

      <AiTaskStrip :task="smartCastTask" />

      <button class="cast-card" :class="{ sel: selectedChar === 'narrator', unassigned: !castedVoice('narrator') }" @click="selectedChar = 'narrator'">
        <div class="cast-portrait"><div class="narrator-mark"><Icon name="Headphones" :size="28" /></div></div>
        <div style="flex:1;min-width:0">
          <b style="font-size:13.5px">Narrator</b>
          <div class="t-muted" style="font-size:11px">Narration · interior thought · scene markers</div>
          <div v-if="castedVoice('narrator')" style="display:flex;align-items:center;gap:6px;margin-top:8px">
            <span class="voice-glyph small" :style="`background:${voiceGradient(castedVoice('narrator'))}`">{{ castedVoice('narrator').name[0] }}</span>
            <span style="font-size:11.5px"><b>{{ castedVoice('narrator').name }}</b></span>
          </div>
          <div v-else class="cast-unassigned"><Icon name="Alert" :size="12" /> No voice</div>
        </div>
      </button>

      <div style="margin:22px 0 12px">
        <div class="t-eyebrow">Characters</div>
        <div style="font-family:var(--font-serif);font-size:18px;font-weight:600">{{ project.characters.length }} characters · {{ unassignedCount }} unassigned</div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:12px">
        <button v-for="c in project.characters" :key="c.id"
          class="cast-card" :class="{ sel: selectedChar === c.id, unassigned: !castedVoice(c.id) }"
          @click="selectedChar = c.id">
          <div class="cast-portrait">
            <div :style="`width:100%;height:100%;border-radius:10px;background:linear-gradient(135deg, oklch(0.85 0.06 ${(c.name.charCodeAt(0) * 7) % 360}), oklch(0.72 0.07 ${(c.name.charCodeAt(0) * 7 + 60) % 360}));color:white;display:grid;place-items:center;font-family:var(--font-serif);font-weight:600;font-size:18px`">{{ c.name.split(' ').map(s => s[0]).slice(0,2).join('') }}</div>
          </div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px"><b style="font-size:13.5px">{{ c.name }}</b>
              <span v-if="c.main" class="chip" style="font-size:9.5px;padding:0 5px">main</span></div>
            <div class="t-muted" style="font-size:11px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ c.role }}</div>
            <div v-if="castedVoice(c.id)" style="display:flex;align-items:center;gap:6px;margin-top:8px">
              <span class="voice-glyph small" :style="`background:${voiceGradient(castedVoice(c.id))}`">{{ castedVoice(c.id).name[0] }}</span>
              <span style="font-size:11.5px"><b>{{ castedVoice(c.id).name }}</b></span>
            </div>
            <div v-else class="cast-unassigned"><Icon name="Alert" :size="12" /> No voice</div>
          </div>
        </button>
      </div>

      <div v-if="error" class="banner danger" style="margin-top:14px;padding:10px 14px;border-radius:8px">{{ error }}</div>
    </div>

    <aside class="studio-aside scrollarea">
      <div class="t-eyebrow" style="margin-bottom:8px">Voice library</div>
      <Combobox
        v-model="activeProviderId"
        :items="ai.readyTtsProviders"
        item-value="id" item-label="name"
        :searchable="false"
        placeholder="Pick a TTS provider"
        chev-title="Switch voice library provider"
        style="margin-bottom:10px">
        <template #item="{ item, label }">
          <span class="tts-pick" :class="{ 'is-offline': ttsStatus[item.id] === 'offline' }">
            <span class="tts-pick-name">{{ label }}</span>
            <span v-if="ttsStatus[item.id] === 'offline'" class="tts-pick-tag">offline</span>
            <span v-else-if="ttsStatus[item.id] === 'checking'" class="tts-pick-tag muted">checking…</span>
          </span>
        </template>
      </Combobox>
      <div v-if="!ai.readyTtsProviders.length" class="t-muted" style="font-size:12px;margin-bottom:10px;padding:10px 12px;border-radius:8px;background:var(--surface-2)">
        No TTS providers connected yet. Open <strong>Settings → AI providers</strong> and paste a key (or point a local TTS server at JustWrite) to populate the voice library.
      </div>
      <div v-else-if="provider && ttsStatus[provider.id] === 'offline'" class="tts-offline-banner" style="font-size:12px;margin-bottom:10px;padding:10px 12px;border-radius:8px;background:var(--accent-soft);color:var(--accent-ink)">
        <strong>{{ provider.name }}</strong> isn't responding right now. Start the server (or check your key in Settings), then
        <a href="#" @click.prevent="refreshVoices()" style="color:var(--accent-ink);text-decoration:underline">retry</a>.
      </div>
      <div style="font-size:11.5px;color:var(--muted);margin-bottom:10px">
        <template v-if="selectedChar">Picking voice for <b style="color:var(--ink)">{{ selectedChar === "narrator" ? "Narrator" : project.characterById(selectedChar)?.name }}</b></template>
        <template v-else>Select a character to assign a voice.</template>
      </div>

      <!-- Voice library search toolbar -->
      <div class="wb-toolbar" style="margin-bottom:10px">
        <span class="wb-search">
          <Icon name="Search" :size="12" class="wb-search-icon" />
          <JwInput :value="voiceQuery" placeholder="Search voices…" @input="onVoiceInput" class="wb-search-input" />
        </span>
        <span class="wb-count">{{ engineVoices.length }}</span>
      </div>

      <div v-if="loadingVoices" class="t-muted" style="font-size:12px;padding:14px 0">Loading voices…</div>
      <JwTable
        v-else
        :data="voiceRows.filter((v) => v.providerId === activeProviderId)"
        data-key="id"
        :global-filter="voiceQuery"
        :global-filter-fields="['name', 'tone', 'accent']"
        row-hover
        :columns="voiceColumns"
        class="voice-dt"
        :pagination="{ pageSize: 25, pageSizeOptions: [10, 25, 50, 100] }"
        @row-click="(e) => pickVoice(e.data.id)"
      >
        <template #empty>
          <div style="padding:14px;text-align:center;font-size:12px;color:var(--muted);font-style:italic">No voices match.</div>
        </template>

        <template #name="{ row }">
          <div style="display:flex;align-items:center;gap:7px">
            <span class="voice-glyph small" :style="`background:${voiceGradient(row)}`">{{ row.name[0] }}</span>
            <span>
              <b style="font-size:12px">{{ row.name }}</b>
              <div v-if="row.tone" class="t-muted" style="font-size:10px;font-style:italic">{{ row.tone }}</div>
            </span>
            <span v-if="isAssignedToSelected(row.id)" style="color:var(--accent);margin-left:auto"><Icon name="Check" :size="13" /></span>
          </div>
        </template>

        <template #gender="{ row }">
          <button type="button" class="voice-gender-chip"
            :class="`is-${row.gender || 'unset'}`"
            v-tooltip.bottom="`Click to cycle gender (${row.gender || 'unset'} → ${nextGender(row.gender)})`"
            @click.stop="cycleVoiceGender(row)">
            <template v-if="row.gender === 'female'">F</template>
            <template v-else-if="row.gender === 'male'">M</template>
            <template v-else-if="row.gender === 'neutral'">N</template>
            <template v-else>?</template>
          </button>
        </template>

        <template #preview="{ row }">
          <JwButton intent="ghost" size="small" :disabled="previewingVoice === row.id" @click.stop="playPreview(row)">
            <template #icon><Icon :name="previewingVoice === row.id ? 'Pause' : 'Play'" :size="11" /></template>
          </JwButton>
        </template>
      </JwTable>
    </aside>
  </div>

  <!-- SCRIPT TAB -->
  <div v-else-if="activeTab === 'script'" role="tabpanel" aria-label="Script" class="pane-card" style="display:flex;flex-direction:column">
    <div style="padding:14px 22px;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center">
      <JwSelect v-model="scriptChapter" style="width:auto"
        :options="project.allChapters.map(c => ({ label: `Ch. ${c.num} — ${c.title}`, value: c.id }))" />
      <JwButton intent="secondary" :disabled="analyzeLoading" @click="reanalyze">
        <Icon :name="analyzeLoading ? 'Refresh' : 'Sparkle'" :size="13" />
        {{ analyzeLoading ? "Analyzing…" : "Re-analyze" }}
      </JwButton>
      <span class="t-muted" style="font-size:12px;margin-left:auto">
        Calls {{ llmProvider?.name || "your LLM provider" }} · {{ studio.scriptFor(scriptChapter)?.length || 0 }} lines analyzed
      </span>
    </div>

    <div class="scrollarea" style="flex:1;padding:18px 22px">
      <p class="st-script-desc">
        <strong>Re-analyze</strong> sends the selected chapter's paragraphs to your LLM, which
        attributes each line to a <strong>speaker</strong> (a character or the narrator) and
        classifies it as narration, dialogue, or interior thought. The resulting script drives
        the Render tab's text-to-speech pipeline.
      </p>
      <AiTaskStrip :task="analyzeTask" />
      <div v-if="error" class="banner danger" style="margin-bottom:14px;padding:10px 14px;border-radius:8px">{{ error }}</div>
      <div v-for="(l, i) in studio.scriptFor(scriptChapter) || []" :key="i"
        style="display:grid;grid-template-columns:140px 1fr auto;gap:14px;padding:12px 0;border-bottom:1px solid var(--border-soft);align-items:start">
        <div>
          <div style="font-size:11.5px;font-weight:600">{{ l.speaker === "narrator" ? "Narrator" : project.characterById(l.speaker)?.name || l.speaker }}</div>
          <div class="t-muted" style="font-size:10.5px">{{ l.kind }} · {{ Math.round((l.confidence || 0) * 100) }}%</div>
        </div>
        <p style="font-family:var(--font-serif);font-size:15px;line-height:1.6;margin:0;color:var(--ink)">{{ l.text }}</p>
      </div>
      <div v-if="!studio.scriptFor(scriptChapter)" class="t-muted" style="font-size:12.5px;padding:30px 0;text-align:center">
        No analysis yet — click <b>Re-analyze</b> to run speaker detection on this chapter.
      </div>
    </div>
  </div>

  <!-- RENDER TAB -->
  <div v-else role="tabpanel" aria-label="Render" class="pane-card">
  <div class="scrollarea" style="padding:18px 22px">
    <div style="margin-bottom:14px;font-size:13px;color:var(--ink-2)">
      Sends each script line to <b>{{ provider?.name || "your TTS provider" }}</b> with the assigned voice, then stitches a single WAV per chapter.
    </div>
    <div v-if="error" class="banner danger" style="margin-bottom:14px;padding:10px 14px;border-radius:8px">{{ error }}</div>

    <div v-for="c in project.allChapters" :key="c.id"
      style="display:grid;grid-template-columns:28px 1fr auto auto auto;gap:14px;padding:12px 14px;margin:6px 0;border:1px solid var(--border);border-radius:10px;background:var(--surface);align-items:center">
      <span class="t-num t-muted" style="font-size:12px;text-align:right">{{ c.num }}</span>
      <div style="min-width:0">
        <div style="font-weight:500;font-size:13.5px">{{ c.title }}</div>
        <div v-if="renderingId === c.id && renderProgress" class="t-muted" style="font-size:11px;margin-top:2px">
          {{ renderProgress.status }} · line {{ renderProgress.line }} / {{ renderProgress.total }}
        </div>
        <div v-else-if="renderResults[c.id]" class="t-muted" style="font-size:11px;margin-top:2px">
          {{ Math.round(renderResults[c.id].duration) }}s rendered
        </div>
        <div v-else-if="!studio.scriptFor(c.id)" class="t-muted" style="font-size:11px;margin-top:2px">
          No script — analyze chapter first
        </div>
      </div>
      <JwButton v-if="!renderResults[c.id]" intent="primary" size="small"
        :disabled="renderingId === c.id || !studio.scriptFor(c.id)"
        @click="startRender(c.id)">
        <Icon name="Mic" :size="11" /> Render
      </JwButton>
      <template v-else>
        <JwButton intent="primary" size="small" @click="playChapter(c.id)"><Icon name="Play" :size="11" /> Play</JwButton>
        <JwButton intent="secondary" size="small" @click="downloadChapter(c.id)"><Icon name="Download" :size="11" /> WAV</JwButton>
      </template>
    </div>
  </div>
  </div>
</template>

<style>
  .studio-desc {
    font-size: 14px; line-height: 1.55; color: var(--muted);
    padding: 14px 22px 0;
    margin: 0;
  }
  .studio-desc strong { color: var(--ink-2); font-weight: 600; }

  .tts-pick { display: flex; align-items: center; gap: 8px; width: 100%; }
  .tts-pick.is-offline .tts-pick-name { color: var(--muted); }
  .tts-pick-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tts-pick-tag {
    font-family: var(--font-mono); font-size: 9.5px; letter-spacing: 0.08em;
    text-transform: uppercase; padding: 2px 6px; border-radius: 4px;
    background: color-mix(in oklab, var(--accent2) 18%, transparent);
    color: var(--accent2-ink, var(--ink-2));
  }
  .tts-pick-tag.muted { background: var(--surface-3); color: var(--muted); }

  .voice-gender-chip {
    appearance: none; border: 1px solid var(--border); background: var(--surface);
    color: var(--ink-2); padding: 0; width: 22px; height: 22px; border-radius: 50%;
    font-family: var(--font-mono); font-size: 10.5px; font-weight: 600;
    display: inline-flex; align-items: center; justify-content: center;
    cursor: pointer; transition: background-color .12s, border-color .12s, color .12s;
  }
  .voice-gender-chip:hover { background: var(--surface-2); border-color: var(--border-strong); }
  .voice-gender-chip.is-female {
    background: color-mix(in oklab, var(--accent2) 18%, transparent);
    color: var(--accent2-ink, var(--ink));
    border-color: color-mix(in oklab, var(--accent2) 40%, transparent);
  }
  .voice-gender-chip.is-male {
    background: color-mix(in oklab, var(--info) 18%, transparent);
    color: var(--info-ink, var(--ink));
    border-color: color-mix(in oklab, var(--info) 40%, transparent);
  }
  .voice-gender-chip.is-neutral {
    background: var(--surface-3); color: var(--ink-2);
  }
  .voice-gender-chip.is-unset { color: var(--muted); border-style: dashed; }

  .st-cast-desc, .st-script-desc {
    font-size: 12px; line-height: 1.55; color: var(--muted);
    margin: 0 0 14px;
  }
  .st-cast-desc strong, .st-script-desc strong { color: var(--ink-2); font-weight: 600; }

  .studio-tabs { display: flex; gap: 8px; padding: 10px 22px; border-bottom: 1px solid var(--border); background: var(--surface-2); }
    .studio-tab { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); text-align: left; min-width: 220px; }
    .studio-tab.active { background: var(--accent-soft); border-color: var(--accent-line); color: var(--accent-ink); }
    .studio-tab svg { flex-shrink: 0; color: var(--muted); }
    .studio-tab.active svg { color: var(--accent); }
    .studio-tab-label { display: flex; flex-direction: column; min-width: 0; }
    .studio-tab-name { font-size: 12.5px; font-weight: 600; }
    .studio-tab-sub { font-size: 10.5px; color: var(--muted); }
    .studio-aside { border-left: 1px solid var(--border); background: var(--surface-2); padding: 18px; overflow-y: auto; }
    .cast-card { display: flex; gap: 12px; padding: 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); text-align: left; margin-bottom: 12px; width: 100%; }
    .cast-card.sel { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
    .cast-card.unassigned { border-style: dashed; }
    .cast-portrait { width: 52px; height: 52px; flex-shrink: 0; }
    .narrator-mark { width: 100%; height: 100%; border-radius: 10px; background: linear-gradient(135deg, var(--accent), var(--accent-ink)); color: var(--on-accent); display: grid; place-items: center; }
    .cast-unassigned { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; padding: 4px 8px; background: var(--danger-bg); color: var(--danger-ink); border-radius: 5px; font-size: 11px; }
    .voice-glyph { width: 24px; height: 24px; border-radius: 6px; color: var(--on-accent); display: grid; place-items: center; font-family: var(--font-serif); font-weight: 600; font-size: 13px; flex-shrink: 0; }
    .voice-glyph.small { width: 20px; height: 20px; font-size: 11px; border-radius: 5px; }
    .voice-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--border-soft); border-radius: 8px; background: var(--surface); text-align: left; width: 100%; }
    .voice-row.assigned { border-color: var(--accent); background: var(--accent-soft); }
  .voice-play { width: 24px; height: 24px; border-radius: 50%; border: 0; background: var(--ink); color: var(--surface); display: grid; place-items: center; margin-left: 6px; }
  .voice-dt { font-size: 12px; }
  /* wb-toolbar / wb-search from WorldbuildingView pattern */
  .wb-toolbar { display: flex; align-items: center; gap: 8px; }
  .wb-search { position: relative; flex: 1; }
  .wb-search-icon { position: absolute; left: 8px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
  .wb-search-input { width: 100%; padding-left: 26px !important; }
  .wb-count { font-family: var(--font-mono); font-size: 10.5px; color: var(--muted); white-space: nowrap; }

  @media (max-width: 900px) {
    .studio-cast-layout { grid-template-columns: 1fr !important; }
    .studio-tabs { flex-wrap: wrap; }
    .studio-tab { min-width: 0; flex: 1; }
  }
</style>
