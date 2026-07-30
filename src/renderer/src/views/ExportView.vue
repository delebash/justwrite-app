<script setup>
import { computed, ref } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import PaneHeader from "../components/PaneHeader.vue";
import { Icon } from "@delebash/llm-ui";
import { buildManuscript, slug } from "../services/export/manuscript.js";
import { UiButton } from "@delebash/llm-ui";
import { UiCheckbox } from "@delebash/llm-ui";
import { UiInput } from "@delebash/llm-ui";

const project = useProjectStore();
const ui = useUiStore();

const fmt = ref("pdf");
const stripSceneStructure = ref(false);

// Audio / audiobook lives in the separate JustVoice app — JustWrite is
// writing-only. To hand a book to JustVoice, export it (Settings → Backups →
// "Export this book") and open the .zip there; there is no live server handoff
// from this view anymore.
const FORMATS = [
  { id: "pdf",  name: "PDF",            sub: "Print-ready manuscript with TOC.",       icon: "Export",     ext: "pdf",  mime: "application/pdf" },
  { id: "docx", name: "DOCX",           sub: "Word-compatible.",                       icon: "Book",       ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  { id: "epub", name: "EPUB",           sub: "Reflowable e-book.",                     icon: "Book",       ext: "epub", mime: "application/epub+zip" },
];

// ── Shared state ─────────────────────────────────────────────────────
const exporting = ref(false);
const exportStage = ref("");
const exportError = ref(null);

// ── Manuscript stats (for PDF / DOCX / EPUB) ─────────────────────────
const manuscriptStats = computed(() => {
  const chapters = project.allChapters.length;
  const parts = project.parts.length;
  const words = project.allChapters.reduce((s, c) => s + (c.words || 0), 0);
  return { chapters, parts, words };
});

// ── Helpers ──────────────────────────────────────────────────────────
function go(fmtId) {
  fmt.value = fmtId;
  exportError.value = null;
  exportStage.value = "";
}
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
function resetProgress() {
  exporting.value = false;
  exportStage.value = "";
}
const STAGE_LABEL = {
  "loading-pdfmake": "Loading PDF engine…",
  "loading-docx":    "Loading DOCX engine…",
  "loading-jszip":   "Loading EPUB packager…",
  "composing":       "Composing document…",
  "packing":         "Packaging archive…",
  "done":            "Done.",
};
function stageLabel() { return STAGE_LABEL[exportStage.value] || exportStage.value; }

// ── PDF / DOCX / EPUB ────────────────────────────────────────────────
async function exportManuscript(fmtId) {
  if (!project.allChapters.length) {
    exportError.value = "Project has no chapters to export.";
    return;
  }
  exportError.value = null;
  exporting.value = true;
  exportStage.value = "composing";
  try {
    const manuscript = buildManuscript(project, { stripSceneStructure: stripSceneStructure.value });
    let blob;
    const onProgress = ({ stage }) => { exportStage.value = stage; };

    if (fmtId === "pdf") {
      const { exportPdf } = await import("../services/export/pdf.js");
      blob = await exportPdf({ manuscript, onProgress });
    } else if (fmtId === "docx") {
      const { exportDocx } = await import("../services/export/docx.js");
      blob = await exportDocx({ manuscript, onProgress });
    } else if (fmtId === "epub") {
      const { exportEpub } = await import("../services/export/epub.js");
      blob = await exportEpub({ manuscript, onProgress });
    }
    const ext = FORMATS.find((f) => f.id === fmtId)?.ext || fmtId;
    triggerDownload(blob, `${slug(project.project.title)}.${ext}`);
    ui.showToast({ message: `Exported ${fmtId.toUpperCase()}.` });
  } catch (err) {
    exportError.value = err.message || String(err);
  } finally {
    resetProgress();
  }
}

</script>

<template>
  <PaneHeader :eyebrow="$t('settings.eyebrow')" :title="$t('nav.export')" help-key="import-and-export#export" />

  <div class="pane-card">
  <div class="scrollarea" style="padding:22px">
    <div style="max-width:920px;display:flex;flex-direction:column;gap:18px">

      <i18n-t keypath="export.intro" tag="p" class="ex-desc" scope="global">
        <template #export><strong>{{ $t("export.exportTerm") }}</strong></template>
        <template #pdf><strong>{{ $t("export.pdfTerm") }}</strong></template>
        <template #docx><strong>{{ $t("export.docxTerm") }}</strong></template>
        <template #epub><strong>{{ $t("export.epubTerm") }}</strong></template>
      </i18n-t>

      <!-- Format picker -->
      <div class="card">
        <div class="card-title">{{ $t("export.formatCardTitle") }}</div>
        <div class="format-picker" role="radiogroup" :aria-label="$t('export.formatGroup')" style="display:grid;gap:10px;margin-top:10px">
          <button v-for="f in FORMATS" :key="f.id" @click="go(f.id)"
            role="radio" :aria-checked="fmt === f.id"
            :style="`text-align:left;padding:14px;border-radius:10px;background:${fmt === f.id ? 'var(--accent-soft)' : 'var(--surface-2)'};border:${fmt === f.id ? '1.5px solid var(--accent)' : '1px solid var(--border)'}`">
            <span style="width:32px;height:32px;border-radius:7px;background:var(--surface);display:grid;place-items:center;color:var(--muted)">
              <Icon :name="f.icon" :size="16" />
            </span>
            <div style="font-weight:600;font-size:14px;margin-top:10px">{{ f.name }}</div>
            <div class="t-muted" style="font-size:11.5px;margin-top:2px">{{ f.sub }}</div>
          </button>
        </div>
      </div>

      <!-- Shared progress + error display -->
      <div v-if="exporting" class="card" style="background:var(--accent-soft);border-color:var(--accent-line)">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px">
          <span><b>{{ stageLabel() }}</b></span>
        </div>
        <div style="height:6px;background:var(--surface);border-radius:999px;overflow:hidden;position:relative">
          <div class="indeterminate" />
        </div>
      </div>
      <div v-if="exportError" class="card" style="background:var(--danger-bg);border-color:var(--danger-line);color:var(--danger-ink);font-size:13px">
        <Icon name="Alert" :size="14" /> {{ exportError }}
      </div>

      <!-- PDF / DOCX / EPUB ─────────────────────────────────────────── -->
      <template>
        <div class="card">
          <div class="card-title">{{ $t("export.manuscriptCardTitle") }}</div>
          <p class="t-muted" style="font-size:12.5px;margin:0 0 14px;line-height:1.55">
            <template v-if="fmt === 'pdf'">{{ $t("export.pdfDesc") }}</template>
            <template v-else-if="fmt === 'docx'">{{ $t("export.docxDesc") }}</template>
            <template v-else>{{ $t("export.epubDesc") }}</template>
          </p>
          <div class="manuscript-stats" style="display:grid;gap:14px;padding:14px;background:var(--surface-2);border-radius:8px;font-size:13px">
            <div>
              <div class="t-muted" style="font-size:11px">{{ $t("export.statParts") }}</div>
              <b class="t-num" style="font-size:18px;font-family:var(--font-serif)">{{ manuscriptStats.parts }}</b>
            </div>
            <div>
              <div class="t-muted" style="font-size:11px">{{ $t("export.statChapters") }}</div>
              <b class="t-num" style="font-size:18px;font-family:var(--font-serif)">{{ manuscriptStats.chapters }}</b>
            </div>
            <div>
              <div class="t-muted" style="font-size:11px">{{ $t("export.statWords") }}</div>
              <b class="t-num" style="font-size:18px;font-family:var(--font-serif)">{{ manuscriptStats.words.toLocaleString() }}</b>
            </div>
          </div>

          <UiCheckbox v-model="stripSceneStructure" style="display:flex;gap:10px;align-items:flex-start;margin-top:14px;padding:12px;background:var(--surface-2);border-radius:8px;cursor:pointer">
            <span>
              <div style="font-size:13px;font-weight:600">{{ $t("export.continuousProse") }}</div>
              <i18n-t keypath="export.continuousProseHint" tag="div" class="t-muted" style="font-size:11.5px;line-height:1.5;margin-top:2px" scope="global">
                <template #breakMark><code style="font-size:10px">* * *</code></template>
              </i18n-t>
            </span>
          </UiCheckbox>
        </div>

        <div class="card">
          <div class="card-title">{{ $t("export.exportCardTitle") }}</div>
          <div style="font-size:12.5px;color:var(--ink-2);margin-bottom:14px;line-height:1.55">
            <template v-if="fmt === 'pdf'">{{ $t("export.pdfDownloadNote") }}</template>
            <template v-else-if="fmt === 'docx'">{{ $t("export.docxDownloadNote") }}</template>
            <template v-else>{{ $t("export.epubDownloadNote") }}</template>
          </div>
          <div style="display:flex;gap:10px;align-items:center">
            <UiButton intent="primary" :disabled="exporting || manuscriptStats.chapters === 0"
              v-tooltip.bottom="manuscriptStats.chapters === 0 ? $t('export.addChapterFirst') : $t('export.exportAsTooltip', { format: FORMATS.find(f => f.id === fmt)?.name })"
              @click="exportManuscript(fmt)">
              <Icon name="Download" :size="13" /> {{ $t("export.exportAction", { format: FORMATS.find(f => f.id === fmt)?.name }) }}
            </UiButton>
            <span class="t-muted" style="font-size:11.5px">
              <template v-if="manuscriptStats.chapters === 0">{{ $t("export.noChapters") }}</template>
              <i18n-t v-else keypath="export.savesAs" tag="span" scope="global">
                <template #file><code>{{ slug(project.project.title) }}.{{ FORMATS.find(f => f.id === fmt)?.ext }}</code></template>
              </i18n-t>
            </span>
          </div>
        </div>
      </template>

    </div>
  </div>
  </div>
</template>

<style scoped>
.ex-desc {
  font-size: 14px; line-height: 1.55; color: var(--muted);
  margin: 0;
}
.ex-desc strong { color: var(--ink-2); font-weight: 600; }

.format-picker { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.manuscript-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }

@media (max-width: 900px) {
  .format-picker { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .manuscript-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

.indeterminate {
  position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  animation: ind 1.4s ease-in-out infinite;
  border-radius: 999px;
}
@keyframes ind {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
code {
  font-family: var(--font-mono);
  background: var(--surface-3);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10.5px;
}
</style>
