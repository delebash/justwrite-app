<script setup>
// Hardware preset editor — accordion list of every tier in the
// hardwarePresets store. Each row can be expanded for inline editing;
// factory tiers can be Reset to their seed values; custom tiers can
// be Deleted. The Quick Setup wizard reads from the same store, so
// edits made here change what the wizard offers and pulls.

import { ref, computed } from "vue";
import { useHardwarePresetsStore } from "../stores/hardwarePresets.js";
import { confirmDialog, promptDialog } from "../services/dialog.js";
import { pushToast } from "../services/toastBridge.js";
import JwButton from "./ui/JwButton.vue";
import JwInput from "./ui/JwInput.vue";
import JwTextarea from "./ui/JwTextarea.vue";
import Icon from "./Icon.vue";

const hw = useHardwarePresetsStore();
const expandedId = ref(null);

function toggle(id) {
  expandedId.value = expandedId.value === id ? null : id;
}

function pullsAsText(arr) {
  return Array.isArray(arr) ? arr.join(", ") : "";
}
function pullsFromText(text) {
  return String(text || "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function updateField(id, field, value) {
  hw.updatePreset(id, { [field]: value });
}
function updatePulls(id, text) {
  hw.updatePreset(id, { pulls: pullsFromText(text) });
}
function updateGb(id, value) {
  const num = Number(value);
  hw.updatePreset(id, { estimatedDownloadGb: Number.isFinite(num) && num > 0 ? num : 0 });
}
function clearFastModel(id) {
  hw.updatePreset(id, { fastChatModel: null });
}

async function addCustomTier() {
  const label = await promptDialog({
    title: "New hardware preset",
    label: "Label (shown in the wizard's tier dropdown)",
    placeholder: "e.g. My RTX 4090 setup",
    confirmLabel: "Create",
  });
  if (!label) return;
  const id = hw.addCustomPreset({ label });
  expandedId.value = id;
  pushToast({ message: `Created "${label}" — seeded from 12 GB tier; edit the models to fit your setup.` });
}

async function deleteTier(id, label) {
  const ok = await confirmDialog({
    title: "Delete custom tier",
    message: `Delete "${label}"? This can't be undone (custom tiers have no factory to revert to).`,
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  if (expandedId.value === id) expandedId.value = null;
  hw.deletePreset(id);
  pushToast({ message: `Deleted "${label}".` });
}

async function resetTier(id, label) {
  const ok = await confirmDialog({
    title: "Reset to factory",
    message: `Revert "${label}" to its built-in defaults? Your edits to this tier will be lost.`,
    confirmLabel: "Reset",
  });
  if (!ok) return;
  hw.resetTier(id);
  pushToast({ message: `Reset "${label}" to factory defaults.` });
}

async function resetAll() {
  const ok = await confirmDialog({
    title: "Reset all presets",
    message: "Revert every tier to factory defaults AND delete every custom tier. Your edits will be lost.",
    confirmLabel: "Reset all",
    danger: true,
  });
  if (!ok) return;
  expandedId.value = null;
  hw.resetAll();
  pushToast({ message: "All hardware presets reset to factory defaults." });
}

function summary(p) {
  const parts = [];
  if (p.defaultChatModel) parts.push(`default: ${p.defaultChatModel}`);
  if (p.fastChatModel) parts.push(`fast: ${p.fastChatModel}`);
  if (p.embeddingModel) parts.push(`embed: ${p.embeddingModel}`);
  return parts.join(" · ");
}
</script>

<template>
  <div class="card">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
      <div class="card-title" style="margin:0">Hardware presets</div>
      <span class="t-muted" style="font-size:12px">{{ hw.list.length }} tiers</span>
      <div style="margin-left:auto;display:flex;gap:6px">
        <JwButton label="Add custom tier" intent="secondary" size="small" @click="addCustomTier">
          <template #icon><Icon name="Plus" :size="12" /></template>
        </JwButton>
        <JwButton label="Reset all" intent="ghost" size="small" @click="resetAll" />
      </div>
    </div>
    <p class="t-muted" style="font-size:12.5px;margin:0 0 12px;line-height:1.55">
      Quick Setup reads from this list. Each tier names a default chat model, an optional "fast" chat model for snappy features, an embedding model, and which models to download. Edit any field — the wizard picks up your changes immediately. Factory tiers can be Reset; custom tiers can be Deleted.
    </p>

    <div style="display:flex;flex-direction:column;gap:6px">
      <div v-for="p in hw.list" :key="p.id"
        style="border:1px solid var(--border);border-radius:10px;background:var(--surface);overflow:hidden">
        <!-- Collapsed row -->
        <button type="button"
          style="width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;gap:14px;align-items:center;padding:10px 14px;background:transparent;border:none;cursor:pointer;color:inherit;text-align:left"
          @click="toggle(p.id)">
          <Icon :name="expandedId === p.id ? 'ChevronUp' : 'ChevronDown'" :size="14" />
          <div style="min-width:0">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <b style="font-size:13.5px">{{ p.label }}</b>
              <span v-if="!hw.isFactoryTier(p.id)" class="chip" style="font-size:10px">custom</span>
              <span v-else-if="hw.isUserModified(p.id)" class="chip" style="font-size:10px">edited</span>
            </div>
            <div class="t-muted" style="font-size:11px;margin-top:2px;font-family:var(--font-mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              {{ summary(p) }}
            </div>
          </div>
          <span class="t-muted" style="font-size:11px">~{{ p.estimatedDownloadGb }} GB</span>
          <span style="font-size:11px">{{ (p.pulls || []).length }} pulls</span>
        </button>

        <!-- Expanded editor -->
        <div v-if="expandedId === p.id"
          style="padding:12px 14px 14px;border-top:1px solid var(--border);background:var(--surface-2,var(--surface))">
          <div style="display:grid;grid-template-columns:minmax(120px,160px) 1fr;gap:10px 14px;align-items:start;font-size:13px">
            <span class="t-muted" style="padding-top:6px">Label</span>
            <JwInput :model-value="p.label" @update:model-value="(v) => updateField(p.id, 'label', v)" />

            <span class="t-muted" style="padding-top:6px">Blurb</span>
            <JwTextarea :model-value="p.blurb" auto-resize :rows="2"
              @update:model-value="(v) => updateField(p.id, 'blurb', v)" />

            <span class="t-muted" style="padding-top:6px">Default chat model</span>
            <JwInput :model-value="p.defaultChatModel" placeholder="qwen3:14b"
              @update:model-value="(v) => updateField(p.id, 'defaultChatModel', v)" />

            <span class="t-muted" style="padding-top:6px">Fast chat model</span>
            <div style="display:flex;gap:6px;align-items:center">
              <JwInput style="flex:1" :model-value="p.fastChatModel || ''" placeholder="(none — leave blank if not applicable)"
                @update:model-value="(v) => updateField(p.id, 'fastChatModel', v || null)" />
              <JwButton v-if="p.fastChatModel" label="Clear" intent="ghost" size="small" @click="clearFastModel(p.id)" />
            </div>

            <span class="t-muted" style="padding-top:6px">Embedding model</span>
            <JwInput :model-value="p.embeddingModel" placeholder="nomic-embed-text"
              @update:model-value="(v) => updateField(p.id, 'embeddingModel', v)" />

            <span class="t-muted" style="padding-top:6px" :title="'Comma-separated list of Ollama model names to pull during Quick Setup.'">Pulls</span>
            <JwTextarea :model-value="pullsAsText(p.pulls)" auto-resize :rows="2"
              placeholder="qwen3:14b, qwen3:8b, nomic-embed-text"
              @update:model-value="(v) => updatePulls(p.id, v)" />

            <span class="t-muted" style="padding-top:6px">Total download (GB)</span>
            <JwInput type="number" step="0.1" min="0" :model-value="String(p.estimatedDownloadGb ?? 0)"
              @update:model-value="(v) => updateGb(p.id, v)" />
          </div>

          <div style="display:flex;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid var(--border-soft,var(--border))">
            <JwButton v-if="hw.isFactoryTier(p.id) && hw.isUserModified(p.id)"
              label="Reset to factory" intent="secondary" size="small"
              @click="resetTier(p.id, p.label)" />
            <JwButton v-if="!hw.isFactoryTier(p.id)"
              label="Delete tier" intent="danger" size="small"
              @click="deleteTier(p.id, p.label)" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
