<script setup>
import { computed, ref, watchEffect } from "vue";
import { useProjectStore } from "../stores/project.js";
import { saveImage, urlFor, removeImage, hasNativeImages } from "../services/imageStore.js";
import Icon from "./Icon.vue";

const props = defineProps({
  entityId: { type: String, required: true },
  entityName: { type: String, default: "Item" },
});
const emit = defineEmits(["close"]);

const project = useProjectStore();
const images = computed(() => project.imagesFor(props.entityId));
const fileInput = ref(null);
const error = ref(null);
const saving = ref(0);

// Resolved src URLs per image id — populated asynchronously for disk-backed
// images, synchronously for data-URL records.
const urlMap = ref({});
watchEffect(async () => {
  const list = images.value;
  // Drop URLs for images that no longer exist.
  const next = { ...urlMap.value };
  const live = new Set(list.map((i) => i.id));
  for (const k of Object.keys(next)) if (!live.has(k)) delete next[k];
  // Populate any new ones.
  for (const img of list) {
    if (next[img.id]) continue;
    next[img.id] = await urlFor(img);
  }
  urlMap.value = next;
});

async function onFiles(e) {
  error.value = null;
  for (const f of Array.from(e.target.files || [])) {
    saving.value++;
    try {
      const rec = await saveImage(f);
      project.addImage(props.entityId, rec);
    } catch (err) {
      error.value = err.message;
    } finally {
      saving.value--;
    }
  }
  e.target.value = "";
}

async function remove(img) {
  // Tell the disk-store first so we can unlink before forgetting the record.
  await removeImage(img);
  project.removeImage(props.entityId, img.id);
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal">
      <div class="modal-head">
        <div>
          <div class="t-eyebrow">Images</div>
          <div class="modal-title">{{ entityName }}</div>
        </div>
        <button class="btn ghost sm" @click="emit('close')">Close</button>
      </div>
      <div class="modal-body">
        <div v-if="error" class="image-error">{{ error }}</div>
        <div class="image-grid">
          <div v-for="img in images" :key="img.id" class="image-tile">
            <img v-if="urlMap[img.id]" :src="urlMap[img.id]" :alt="img.name" />
            <div v-else class="image-loading"><Icon name="Image" :size="18" /></div>
            <div class="image-meta">
              <span :title="img.name">{{ img.name }}</span>
              <button class="btn sm ghost" @click="remove(img)">×</button>
            </div>
          </div>
          <button class="image-add" @click="fileInput.click()" :disabled="saving > 0">
            <Icon name="Plus" :size="22" />
            <span>{{ saving > 0 ? `Saving ${saving}…` : "Add image(s)" }}</span>
          </button>
        </div>
        <input ref="fileInput" type="file" accept="image/*" multiple style="display:none" @change="onFiles" />

        <div class="image-storage-note">
          <Icon :name="hasNativeImages ? 'Check' : 'Alert'" :size="11" />
          {{ hasNativeImages
            ? "Images saved to disk in your app folder."
            : "Browser preview — images are embedded in the IndexedDB project snapshot as data URLs." }}
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.image-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.image-tile { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--surface-2); }
.image-tile img { width: 100%; height: 120px; object-fit: cover; display: block; }
.image-loading { width: 100%; height: 120px; display: grid; place-items: center; background: var(--surface-3); color: var(--muted); }
.image-meta { padding: 6px 8px; display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 11px; }
.image-meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.image-add { border: 1.5px dashed var(--border-strong); border-radius: 8px; background: var(--surface-2); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-height: 168px; color: var(--muted); font-size: 12px; cursor: pointer; }
.image-add:hover { background: var(--surface-3); color: var(--ink); }
.image-add:disabled { opacity: 0.5; }
.image-error {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--danger-bg);
  color: var(--danger-ink);
  border: 1px solid var(--danger-line);
  border-radius: 6px;
  font-size: 12px;
}
.image-storage-note {
  margin-top: 14px;
  font-size: 11px;
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono);
}
</style>
