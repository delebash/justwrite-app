<script setup>
// Lab — feature prompt editor. Lists every AI feature's prompt (from the DB,
// seeded with defaults) and lets the user edit the system + user-prompt
// template, temperature, and reasoning flag, or reset a built-in to its seeded
// default. Backed by /v1/ai/prompts (the server reads the prompt from the DB on
// every run, so edits take effect immediately). See
// docs/plans/2026-06-21-feature-prompts-db-seed.md.

import { ref, computed, onMounted } from "vue";
import { serverUrl } from "../services/serverApi.js";
import PaneHeader from "../components/PaneHeader.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";
import JwInput from "@renderer/components/ui/JwInput.vue";
import JwTextarea from "@renderer/components/ui/JwTextarea.vue";
import JwCheckbox from "@renderer/components/ui/JwCheckbox.vue";

const prompts = ref([]);
const selectedKey = ref("");
const draft = ref(null);
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const message = ref("");

const varHint = "{{variable}} placeholders";

const selected = computed(() => prompts.value.find((p) => p.key === selectedKey.value) || null);
const dirty = computed(() => {
  const a = draft.value, b = selected.value;
  if (!a || !b) return false;
  return a.system !== b.system || a.userTemplate !== b.userTemplate
    || Number(a.temperature) !== Number(b.temperature) || a.think !== b.think;
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const res = await fetch(serverUrl("/v1/ai/prompts"));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    prompts.value = (json.prompts || []).slice().sort((a, b) => a.key.localeCompare(b.key));
    if (prompts.value.length && !prompts.value.some((p) => p.key === selectedKey.value)) {
      select(prompts.value[0].key);
    }
  } catch (e) {
    error.value = `Couldn't load prompts: ${e.message}`;
  } finally {
    loading.value = false;
  }
}

function select(key) {
  selectedKey.value = key;
  const p = prompts.value.find((x) => x.key === key);
  draft.value = p ? { ...p } : null;
  message.value = "";
}

function _upsertLocal(updated) {
  const i = prompts.value.findIndex((p) => p.key === updated.key);
  if (i >= 0) prompts.value[i] = updated;
}

async function save() {
  if (!draft.value) return;
  saving.value = true; error.value = ""; message.value = "";
  try {
    const res = await fetch(serverUrl(`/v1/ai/prompts/${encodeURIComponent(draft.value.key)}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feature: draft.value.feature,
        system: draft.value.system,
        userTemplate: draft.value.userTemplate,
        temperature: Number(draft.value.temperature),
        think: !!draft.value.think,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text().catch(() => "")}`);
    _upsertLocal(await res.json());
    message.value = "Saved.";
  } catch (e) {
    error.value = `Save failed: ${e.message}`;
  } finally {
    saving.value = false;
  }
}

async function resetToDefault() {
  if (!draft.value) return;
  saving.value = true; error.value = ""; message.value = "";
  try {
    const res = await fetch(serverUrl(`/v1/ai/prompts/${encodeURIComponent(draft.value.key)}/reset`), { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const updated = await res.json();
    _upsertLocal(updated);
    draft.value = { ...updated };
    message.value = "Reset to seeded default.";
  } catch (e) {
    error.value = `Reset failed: ${e.message}`;
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="ai-prompts">
    <PaneHeader eyebrow="AI" title="Feature prompts">
      <JwButton intent="ghost" :disabled="loading" @click="load">Refresh</JwButton>
    </PaneHeader>

    <p class="t-muted ap-intro">
      Every AI feature's system + user prompt lives in the database (seeded with a default, editable here).
      Edits take effect immediately — the server loads each feature's prompt from the DB on every run.
    </p>

    <div v-if="error" class="ap-error">{{ error }}</div>

    <div class="ap-body">
      <aside class="ap-list">
        <button
          v-for="p in prompts" :key="p.key"
          type="button" class="ap-row" :class="{ 'is-active': p.key === selectedKey }"
          @click="select(p.key)">
          <span class="ap-row-key">{{ p.key }}</span>
          <span class="ap-row-feature t-muted">{{ p.feature }}<template v-if="!p.builtIn"> · custom</template></span>
        </button>
        <div v-if="!loading && !prompts.length" class="t-muted" style="padding:10px">No prompts found.</div>
      </aside>

      <section v-if="draft" class="ap-editor">
        <div class="ap-field">
          <label class="t-muted">Feature (routing key for pins / usage)</label>
          <JwInput v-model="draft.feature" :readonly="draft.builtIn" />
        </div>
        <div class="ap-field ap-grow">
          <label class="t-muted">System prompt</label>
          <JwTextarea v-model="draft.system" auto-resize :rows="12" />
        </div>
        <div class="ap-field">
          <label class="t-muted">User-prompt template <span class="ap-hint">(supports {{ varHint }})</span></label>
          <JwTextarea v-model="draft.userTemplate" auto-resize :rows="5" />
        </div>
        <div class="ap-row2">
          <div class="ap-field ap-temp">
            <label class="t-muted">Temperature</label>
            <JwInput v-model="draft.temperature" type="number" />
          </div>
          <label class="ap-think">
            <JwCheckbox v-model="draft.think" />
            <span class="t-muted">Reasoning (think)</span>
          </label>
        </div>

        <div class="ap-actions">
          <JwButton v-if="draft.builtIn" intent="ghost" :disabled="saving" @click="resetToDefault">Reset to default</JwButton>
          <span class="ap-spacer" />
          <span v-if="message" class="ap-msg t-muted">{{ message }}</span>
          <JwButton intent="primary" :disabled="saving || !dirty" @click="save">{{ saving ? "Saving…" : "Save" }}</JwButton>
        </div>
      </section>
      <section v-else class="ap-editor ap-empty t-muted">Select a feature to edit its prompt.</section>
    </div>
  </div>
</template>

<style scoped>
.ai-prompts { display:flex; flex-direction:column; height:100%; min-height:0; }
.ap-intro { margin:0 0 12px; max-width:78ch; font-size:12.5px; line-height:1.5; }
.ap-error { color:var(--danger,#c33); margin-bottom:10px; font-size:13px; }
.ap-body { display:grid; grid-template-columns:248px minmax(0,1fr); gap:16px; flex:1; min-height:0; }
.ap-list { overflow:auto; border:1px solid var(--border,#e2e2e2); border-radius:10px; padding:6px; display:flex; flex-direction:column; gap:2px; }
.ap-row { display:flex; flex-direction:column; align-items:flex-start; gap:1px; text-align:left; padding:7px 10px; border:0; background:transparent; border-radius:7px; cursor:pointer; width:100%; font:inherit; }
.ap-row:hover { background:var(--accent-soft,#eef2ff); }
.ap-row.is-active { background:var(--accent-soft,#e6efff); box-shadow:inset 0 0 0 1.5px var(--accent,#3667d6); }
.ap-row-key { font-weight:600; font-size:12.5px; }
.ap-row-feature { font-size:11px; }
.ap-editor { overflow:auto; display:flex; flex-direction:column; gap:12px; padding-right:4px; }
.ap-empty { padding:24px; }
.ap-field { display:flex; flex-direction:column; gap:5px; }
.ap-field label { font-size:12px; }
.ap-hint { font-size:11px; }
.ap-grow :deep(textarea) { min-height:220px; }
.ap-row2 { display:flex; gap:24px; align-items:flex-end; }
.ap-temp { max-width:120px; }
.ap-think { display:flex; align-items:center; gap:8px; }
.ap-actions { display:flex; align-items:center; gap:10px; margin-top:4px; padding-bottom:8px; }
.ap-spacer { flex:1; }
.ap-msg { font-size:12px; }
</style>
