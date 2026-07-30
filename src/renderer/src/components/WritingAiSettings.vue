<script setup>
// JustWrite's app-specific AI settings, rendered in the shared AI menu's
// app-tab slot (AiView → AiModelsArea #app-tab) so ALL AI settings live in one
// place. These are writer-domain knobs that feed the LLM features:
//   • Manuscript index (RAG auto-rebuild policy)
//   • Three-alternative streaming (generative-action cost mode)
//   • Voice canon (chapters → fingerprint injected into Writer actions)
// Lifted verbatim from the old App Settings → "Writing AI" tab (2026-06-24
// AI consolidation); see docs/plans/2026-06-24-shared-platform-settings.md.
import { computed } from "vue";
import { UiCheckbox, UiButton } from "@delebash/llm-ui";
import { useAiStore } from "../stores/ai.js";
import { useUiStore } from "../stores/ui.js";
import { useProjectStore } from "../stores/project.js";
import { buildVoiceFingerprint } from "../services/voiceFingerprint.js";

const ai = useAiStore();
const ui = useUiStore();
const project = useProjectStore();

// Chapter picker for the writer's voice canon. Selected chapters are passed to
// buildVoiceFingerprint which generates the sample + style summary writerAI
// injects into every prose generation.
const canonChapterOptions = computed(() =>
  project.allChapters
    .filter((c) => (c.words || 0) > 50)
    .map((c) => ({ id: c.id, num: c.num, title: c.title, words: c.words || 0 })),
);
function canonHas(id) {
  return (project.voiceCanonChapterIds || []).includes(id);
}
function toggleCanon(id) {
  project.toggleVoiceCanonChapter(id);
}
function clearCanon() {
  project.clearVoiceCanon();
}
const voicePreview = computed(() => buildVoiceFingerprint(project, { targetWords: 600 }));
</script>

<template>
  <div style="display:flex;flex-direction:column;gap:14px;min-width:0">
    <!-- ─── Embeddings / RAG ────────────────────────────── -->
    <div class="t-eyebrow">Embeddings &amp; RAG</div>
    <div class="card">
      <div class="card-title">Manuscript index</div>
      <p class="t-muted" style="font-size:12.5px;margin:4px 0 12px;line-height:1.5">
        Which provider embeds your manuscript for search and “Ask the book” is set above in <b>Features → Default embedding</b>. This toggle controls when re-embedding runs.
      </p>
      <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer">
        <UiCheckbox :model-value="ai.autoRebuildRagIndex"
          @update:model-value="ai.setAutoRebuildRagIndex" />
        <span style="color:var(--ink-2);font-size:12.5px;line-height:1.45">
          <b style="color:var(--ink)">Auto-rebuild the index.</b>
          Embed new and changed scenes a minute after the last edit. Costs nothing on local embedding providers; cloud embeddings will accrue tokens.
        </span>
      </label>
    </div>

    <!-- Three-alternative streaming -->
    <div class="card">
      <div class="card-title">Three-alternative streaming</div>
      <p class="t-muted" style="font-size:12.5px;margin:0 0 14px;line-height:1.55">
        When on, every <strong>Rewrite</strong>, <strong>Expand</strong>, <strong>Tighten</strong>,
        <strong>Continue</strong>, <strong>Describe</strong>, <strong>line edit</strong>, and
        <strong>Continue with direction</strong> runs as three parallel streams (varied
        temperature, more conservative ↔ more inventive). Pick the column that reads best;
        the other two are discarded. <strong>Off by default</strong> — variations mode triples
        token cost. Whether the toggle is on or off, <strong>shift-click any AI dropdown
        item</strong> to opt in to variations for that one call.
      </p>
      <label style="display:flex;gap:10px;align-items:flex-start;padding:8px;cursor:pointer;border-radius:6px"
             :style="ui.showVariations ? 'background:var(--accent-soft)' : ''">
        <UiCheckbox
          :model-value="ui.showVariations"
          @update:model-value="ui.setShowVariations" />
        <span style="color:var(--ink-2);font-size:13px;line-height:1.45">
          <strong style="color:var(--ink)">Show 3 variations on every AI action.</strong><br />
          <span style="color:var(--muted);font-size:12px">
            Triples token cost on cloud providers. Free on local. The writer can still
            shift-click for one-off variations even when this is off.
          </span>
        </span>
      </label>
    </div>

    <!-- Voice canon -->
    <div class="card">
      <div class="card-title">Voice canon</div>
      <p class="t-muted" style="font-size:12.5px;margin:0 0 14px;line-height:1.55">
        Pick the chapters JustWrite should treat as your "voice canon" — the prose that
        represents how you write at your best. Every <strong>Rewrite</strong>,
        <strong>Expand</strong>, <strong>Tighten</strong>, <strong>Continue</strong>,
        <strong>Describe</strong>, and line-edit pass will inject a short sample from these
        chapters plus a measured style summary into the model's instructions, so the result
        matches your voice without per-call guidance. Two or three middle-of-book chapters
        work best — opening chapters often have structural quirks that distort the fingerprint.
      </p>
      <div v-if="canonChapterOptions.length === 0" class="t-muted" style="font-size:12.5px;font-style:italic">
        No chapters with prose yet. Once you've drafted a few chapters, come back here.
      </div>
      <template v-else>
        <div style="display:flex;flex-direction:column;gap:4px;max-height:280px;overflow-y:auto;padding:6px 4px;border:1px solid var(--border-soft);border-radius:6px">
          <label v-for="c in canonChapterOptions" :key="c.id"
                 style="display:flex;gap:10px;align-items:center;padding:6px 10px;cursor:pointer;border-radius:4px"
                 :style="canonHas(c.id) ? 'background:var(--accent-soft)' : ''">
            <UiCheckbox
              :model-value="canonHas(c.id)"
              @update:model-value="toggleCanon(c.id)" />
            <span style="font-family:var(--font-mono);font-size:11px;color:var(--muted);min-width:48px">Ch. {{ c.num }}</span>
            <span style="flex:1;color:var(--ink-2);font-size:13px">{{ c.title || 'Untitled' }}</span>
            <span style="font-family:var(--font-mono);font-size:10.5px;color:var(--muted)">{{ c.words.toLocaleString() }} w</span>
          </label>
        </div>
        <div style="margin-top:12px;display:flex;align-items:center;gap:10px;font-family:var(--font-mono);font-size:11px;color:var(--muted)">
          <span>{{ $t("count.chapter", { n: project.voiceCanonChapterIds?.length || 0 }, project.voiceCanonChapterIds?.length || 0) }} in canon</span>
          <span v-if="voicePreview.sampleWordCount">· ~{{ voicePreview.sampleWordCount }} word sample</span>
          <span style="flex:1"></span>
          <UiButton v-if="project.voiceCanonChapterIds?.length" intent="ghost" size="small" @click="clearCanon">
            Clear all
          </UiButton>
        </div>
        <details v-if="voicePreview.block" style="margin-top:14px">
          <summary style="cursor:pointer;font-family:var(--font-mono);font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:var(--muted)">
            Preview the fingerprint that will be injected
          </summary>
          <div style="margin-top:8px;padding:12px 14px;background:var(--surface-2);border-radius:6px;font-family:var(--font-serif);font-size:12.5px;line-height:1.6;color:var(--ink-2);white-space:pre-wrap;max-height:300px;overflow:auto">{{ voicePreview.block }}</div>
        </details>
      </template>
    </div>
  </div>
</template>
