<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useStudioStore } from "../stores/studio.js";
import { useAiStore } from "../stores/ai.js";
import PaneHeader from "../components/PaneHeader.vue";
import Icon from "../components/Icon.vue";
import { listVoices, preview } from "../services/tts.js";
import { smartCast, detectSpeakers } from "../services/llm.js";
import { renderChapter } from "../services/render.js";

const props = defineProps({ tab: { type: String, default: "cast" } });

const project = useProjectStore();
const studio = useStudioStore();
const ai = useAiStore();

const activeTab = ref(props.tab || "cast");
watch(() => props.tab, (v) => { if (v) activeTab.value = v; });

// ── Cast ──────────────────────────────────────────────────────────────
const activeProviderId = ref(ai.defaultTtsId);
const provider = computed(() => ai.providerById(activeProviderId.value));
const llmProvider = computed(() => ai.llmProvider);
const selectedChar = ref(null);
const loadingVoices = ref(false);
const previewingVoice = ref(null);
const audio = ref(null);
const smartLoading = ref(false);
const error = ref(null);

const engineVoices = computed(() => studio.voices.filter((v) => v.providerId === provider.value?.id));

async function refreshVoices() {
  if (!provider.value) return;
  loadingVoices.value = true;
  try {
    const live = await listVoices(provider.value);
    if (live.length) studio.mergeVoices(live.map((v) => ({ ...v, providerId: provider.value.id })));
  } finally { loadingVoices.value = false; }
}
onMounted(() => { refreshVoices(); });
watch(activeProviderId, () => { refreshVoices(); });

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

async function runSmartCast() {
  if (!llmProvider.value) { error.value = "No LLM provider configured."; return; }
  smartLoading.value = true; error.value = null;
  try {
    const map = await smartCast({
      provider: llmProvider.value,
      characters: project.characters,
      voices: engineVoices.value,
    });
    for (const [charId, voiceId] of Object.entries(map)) {
      if (project.characterById(charId) && engineVoices.value.find((v) => v.id === voiceId)) {
        studio.assignVoice(charId, voiceId);
      }
    }
  } catch (e) { error.value = e.message; } finally { smartLoading.value = false; }
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

// ── Script analysis ───────────────────────────────────────────────────
const scriptChapter = ref("ch7");
const analyzeLoading = ref(false);

async function reanalyze() {
  if (!llmProvider.value) { error.value = "No LLM provider configured."; return; }
  analyzeLoading.value = true; error.value = null;
  try {
    // Pull paragraphs from chapter body HTML.
    const html = project.chapterBody[scriptChapter.value] || "";
    const div = document.createElement("div");
    div.innerHTML = html;
    const paragraphs = Array.from(div.querySelectorAll("p, h1, h2, h3"))
      .map((el) => el.textContent.trim())
      .filter(Boolean);

    const annotated = await detectSpeakers({
      provider: llmProvider.value,
      paragraphs,
      characters: project.characters,
    });
    studio.setScript(scriptChapter.value, annotated.map((a, i) => ({ ...a, text: paragraphs[i] })));
  } catch (e) { error.value = e.message; } finally { analyzeLoading.value = false; }
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
  <PaneHeader eyebrow="Audio" title="Studio">
    <span class="chip">Engine · <b style="font-weight:600;margin-left:4px">{{ provider?.name || "—" }}</b></span>
    <router-link to="/settings/audio" custom v-slot="{ navigate }">
      <button class="btn ghost" @click="navigate"><Icon name="Settings" :size="14" /> Engines</button>
    </router-link>
  </PaneHeader>

  <div class="studio-tabs">
    <button class="studio-tab" :class="{ active: activeTab === 'cast' }" @click="activeTab = 'cast'">
      <Icon name="Headphones" :size="15" />
      <span class="studio-tab-label">
        <span class="studio-tab-name">Cast</span>
        <span class="studio-tab-sub">{{ project.characters.length - unassignedCount }}/{{ project.characters.length }} cast{{ unassignedCount ? ` · ${unassignedCount} unassigned` : "" }}</span>
      </span>
    </button>
    <button class="studio-tab" :class="{ active: activeTab === 'script' }" @click="activeTab = 'script'">
      <Icon name="Comment" :size="15" />
      <span class="studio-tab-label">
        <span class="studio-tab-name">Script</span>
        <span class="studio-tab-sub">Speaker analysis</span>
      </span>
    </button>
    <button class="studio-tab" :class="{ active: activeTab === 'render' }" @click="activeTab = 'render'">
      <Icon name="Waveform" :size="15" />
      <span class="studio-tab-label">
        <span class="studio-tab-name">Render</span>
        <span class="studio-tab-sub">Chapter audio</span>
      </span>
    </button>
  </div>

  <!-- CAST TAB -->
  <div v-if="activeTab === 'cast'" class="pane-body" style="display:grid;grid-template-columns:1fr 360px;min-height:0">
    <div class="scrollarea" style="padding:18px 22px 40px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div>
          <div class="t-eyebrow">Narrator</div>
          <div style="font-family:var(--font-serif);font-size:18px;font-weight:600">The voice of everything that isn't spoken</div>
        </div>
        <button class="btn" :disabled="smartLoading" @click="runSmartCast">
          <Icon :name="smartLoading ? 'Refresh' : 'Sparkle'" :size="13" />
          {{ smartLoading ? "Casting…" : "Smart-assign" }}
        </button>
      </div>

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
      <select class="input" v-model="activeProviderId" style="margin-bottom:14px">
        <option v-for="p in ai.ttsProviders" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
      <div style="font-size:11.5px;color:var(--muted);margin-bottom:10px">
        <template v-if="selectedChar">Picking voice for <b style="color:var(--ink)">{{ selectedChar === "narrator" ? "Narrator" : project.characterById(selectedChar)?.name }}</b></template>
        <template v-else>Select a character to assign a voice.</template>
      </div>
      <div v-if="loadingVoices" class="t-muted" style="font-size:12px;padding:14px 0">Loading voices…</div>
      <div v-else style="display:flex;flex-direction:column;gap:6px">
        <button v-for="v in engineVoices" :key="v.id"
          class="voice-row" :class="{ assigned: isAssignedToSelected(v.id) }"
          @click="pickVoice(v.id)">
          <span class="voice-glyph" :style="`background:${voiceGradient(v)}`">{{ v.name[0] }}</span>
          <span style="flex:1;min-width:0">
            <b style="font-size:13px">{{ v.name }}</b>
            <div v-if="v.tone" class="t-muted" style="font-size:11px;font-style:italic">{{ v.tone }}</div>
          </span>
          <button class="voice-play" @click.stop="playPreview(v)" :disabled="previewingVoice === v.id">
            <Icon :name="previewingVoice === v.id ? 'Pause' : 'Play'" :size="11" />
          </button>
          <span v-if="isAssignedToSelected(v.id)" style="color:var(--accent)"><Icon name="Check" :size="14" /></span>
        </button>
        <div v-if="engineVoices.length === 0" class="t-muted" style="padding:14px;text-align:center;font-size:12px;background:var(--surface-3);border-radius:8px">
          No voices for this provider.
        </div>
      </div>
    </aside>
  </div>

  <!-- SCRIPT TAB -->
  <div v-else-if="activeTab === 'script'" class="pane-body" style="display:flex;flex-direction:column">
    <div style="padding:14px 22px;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center">
      <select class="input" v-model="scriptChapter" style="width:auto">
        <option v-for="c in project.allChapters" :key="c.id" :value="c.id">Ch. {{ c.num }} — {{ c.title }}</option>
      </select>
      <button class="btn" :disabled="analyzeLoading" @click="reanalyze">
        <Icon :name="analyzeLoading ? 'Refresh' : 'Sparkle'" :size="13" />
        {{ analyzeLoading ? "Analyzing…" : "Re-analyze" }}
      </button>
      <span class="t-muted" style="font-size:12px;margin-left:auto">
        Calls {{ llmProvider?.name || "your LLM provider" }} · {{ studio.scriptFor(scriptChapter)?.length || 0 }} lines analyzed
      </span>
    </div>

    <div class="scrollarea" style="flex:1;padding:18px 22px">
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
  <div v-else class="pane-body scrollarea" style="padding:18px 22px">
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
      <button v-if="!renderResults[c.id]" class="btn sm primary"
        :disabled="renderingId === c.id || !studio.scriptFor(c.id)"
        @click="startRender(c.id)">
        <Icon name="Mic" :size="11" /> Render
      </button>
      <template v-else>
        <button class="btn sm" @click="playChapter(c.id)"><Icon name="Play" :size="11" /> Play</button>
        <button class="btn sm" @click="downloadChapter(c.id)"><Icon name="Download" :size="11" /> WAV</button>
      </template>
    </div>
  </div>
</template>

<style>
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
    .voice-glyph { width: 24px; height: 24px; border-radius: 6px; color: white; display: grid; place-items: center; font-family: var(--font-serif); font-weight: 600; font-size: 13px; flex-shrink: 0; }
    .voice-glyph.small { width: 20px; height: 20px; font-size: 11px; border-radius: 5px; }
    .voice-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--border-soft); border-radius: 8px; background: var(--surface); text-align: left; width: 100%; }
    .voice-row.assigned { border-color: var(--accent); background: var(--accent-soft); }
  .voice-play { width: 24px; height: 24px; border-radius: 50%; border: 0; background: var(--ink); color: var(--surface); display: grid; place-items: center; margin-left: 6px; }
</style>
