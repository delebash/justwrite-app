<script setup>
import { computed, ref } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRouter } from "vue-router";
import Avatar from "../components/Avatar.vue";
import Icon from "../components/Icon.vue";
import InputText from "primevue/inputtext";
import InputNumber from "primevue/inputnumber";
import Textarea from "primevue/textarea";
import Checkbox from "primevue/checkbox";
import Button from "primevue/button";
import ImagesModal from "../components/ImagesModal.vue";
import StatusSelect from "../components/StatusSelect.vue";
import GroupsModal from "../components/GroupsModal.vue";
import SceneRefList from "../components/SceneRefList.vue";
import MentionRefList from "../components/MentionRefList.vue";
import Breadcrumb from "../components/Breadcrumb.vue";
import { promptDialog, confirmDialog } from "../services/dialog.js";
import { saveImage } from "../services/imageStore.js";
import { NEW_ENTITY_META } from "../services/entityMeta.js";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();

const ch = computed(() => project.characterById(props.id || ui.selections.characters) || project.characters[0]);
const extras = computed(() => project.characterExtras[ch.value?.id]);
const modal = ref(null);

const MOTIVATIONS = [
  { k: "want",  label: "Wants",            color: "var(--trait-want-ink)",  bg: "var(--trait-want-bg)" },
  { k: "need",  label: "Needs",            color: "var(--trait-need-ink)",  bg: "var(--trait-need-bg)" },
  { k: "lie",   label: "Lie they believe", color: "var(--trait-lie-ink)",   bg: "var(--trait-lie-bg)" },
  { k: "truth", label: "Truth they meet",  color: "var(--trait-truth-ink)", bg: "var(--trait-truth-bg)" },
];
const ARC_STEPS = [{ k: "start", label: "Beginning" }, { k: "midpoint", label: "Midpoint" }, { k: "end", label: "End" }];

async function addCharacter() {
  const name = await promptDialog(NEW_ENTITY_META.characters);
  if (!name) return;
  const id = project.addCharacter({ name });
  ui.select("characters", id);
  router.push(`/characters/${id}`);
}
async function deleteCharacter() {
  const yes = await confirmDialog({
    title: `Delete "${ch.value.name}"?`,
    confirmLabel: "Delete",
    danger: true,
  });
  if (!yes) return;
  project.removeCharacter(ch.value.id);
  const next = project.characters[0];
  if (next) { ui.select("characters", next.id); router.push(`/characters/${next.id}`); } else router.push("/");
}
function updateField(k, v) { project.updateCharacter(ch.value.id, { [k]: v }); }

// ── Avatar / image drop ─────────────────────────────────────────────
// Dragging an image file (OS-level, e.g. from Explorer / Finder) onto
// the avatar area saves it via the image store and appends it to the
// character's images list. The avatar always renders the MOST RECENT
// image, so a drop visually "replaces" the avatar even though older
// images remain available in the Images modal.
const characterImages = computed(() => project.imagesFor(ch.value?.id));
const avatarImage = computed(() => {
  const list = characterImages.value;
  return list.length ? list[list.length - 1] : null;
});

const isFileDragging = ref(false);
const dropError = ref(null);
const dropSaving = ref(0);

function eventHasFiles(e) {
  if (!e.dataTransfer) return false;
  for (const t of e.dataTransfer.types || []) {
    if (t === "Files") return true;
  }
  return false;
}
function onAvatarDragEnter(e) {
  if (eventHasFiles(e)) isFileDragging.value = true;
}
function onAvatarDragOver(e) {
  if (!eventHasFiles(e)) return;
  e.preventDefault();              // required to make the drop event fire
  e.dataTransfer.dropEffect = "copy";
  isFileDragging.value = true;
}
function onAvatarDragLeave(e) {
  // dragleave fires when crossing into children too; only clear when the
  // cursor leaves the wrapper entirely.
  if (e.currentTarget.contains(e.relatedTarget)) return;
  isFileDragging.value = false;
}
async function onAvatarDrop(e) {
  e.preventDefault();
  isFileDragging.value = false;
  dropError.value = null;
  const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith("image/"));
  if (!files.length) {
    if ((e.dataTransfer.files || []).length) dropError.value = "Only image files can be dropped here.";
    return;
  }
  for (const f of files) {
    dropSaving.value++;
    try {
      const rec = await saveImage(f);
      project.addImage(ch.value.id, rec);
    } catch (err) {
      dropError.value = err.message || String(err);
    } finally {
      dropSaving.value--;
    }
  }
  if (!dropError.value) {
    ui.showToast({ message: files.length === 1
      ? `Added image to ${ch.value.name}.`
      : `Added ${files.length} images to ${ch.value.name}.` });
  }
}
function updateMotivation(k, v) { project.setCharacterExtras(ch.value.id, { motivation: { ...(extras.value?.motivation || {}), [k]: v } }); }
function updateArc(k, v) { project.setCharacterExtras(ch.value.id, { arc: { ...(extras.value?.arc || {}), [k]: v } }); }
function updateVoice(k, v) { project.setCharacterExtras(ch.value.id, { voice: { ...(extras.value?.voice || {}), [k]: v } }); }
function updateBackstory(v) { project.setCharacterExtras(ch.value.id, { backstory: v }); }
</script>

<template>
  <header class="pane-header character-pane-header">
    <div class="pane-title">
      <Breadcrumb :segments="[{ label: ch.main ? 'Main character' : 'Secondary character', to: '/characters' }]" />
      <input class="character-name"
        :value="ch.name"
        placeholder="Character name"
        @input="updateField('name', $event.target.value)" />
    </div>
    <div class="pane-actions">
      <Button severity="secondary" text size="small" @click="modal = 'images'"><Icon name="Image" :size="14" /> Images</Button>
      <router-link :to="`/characters/${ch.id}/events`" custom v-slot="{ navigate }">
        <Button severity="secondary" text size="small" @click="navigate"><Icon name="Calendar" :size="14" /> Events</Button>
      </router-link>
      <Button severity="secondary" text size="small" @click="modal = 'groups'"><Icon name="GroupIcon" :size="14" /> Groups</Button>
      <Button severity="secondary" text size="small" @click="deleteCharacter">Delete</Button>
      <Button severity="primary" size="small" @click="addCharacter"><Icon name="Plus" :size="14" /> New character</Button>
      <StatusSelect :model-value="ch.status || ''" @update:model-value="(v) => updateField('status', v)" />
    </div>
  </header>

  <div class="pane-card">
    <div class="scrollarea" style="padding:24px 28px 40px">
      <div style="display:flex;gap:22px;align-items:flex-start">
        <div
          class="avatar-drop"
          :class="{ 'avatar-drop-hot': isFileDragging, 'avatar-drop-saving': dropSaving > 0 }"
          :title="avatarImage ? 'Drop an image to replace the avatar' : 'Drop an image to set the avatar'"
          @dragenter="onAvatarDragEnter"
          @dragover="onAvatarDragOver"
          @dragleave="onAvatarDragLeave"
          @drop="onAvatarDrop">
          <Avatar :name="ch.name" :image="avatarImage" :size="96" />
          <div v-if="isFileDragging" class="avatar-drop-overlay">
            <Icon name="Image" :size="22" />
            <span>Drop image</span>
          </div>
          <div v-else-if="dropSaving > 0" class="avatar-drop-overlay saving">Saving…</div>
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <InputText fluid style="max-width:200px" placeholder="Role"
              :model-value="ch.role" @update:model-value="updateField('role', $event)" />
            <label class="chip" style="cursor:pointer;gap:6px">
              <Checkbox :model-value="ch.main" binary @update:model-value="updateField('main', $event)" />
              Main character
            </label>
            <InputNumber fluid style="max-width:80px" placeholder="Age" :use-grouping="false"
              :model-value="ch.age ?? null" @update:model-value="updateField('age', $event ?? null)" />
          </div>
          <Textarea fluid rows="2" style="margin-top:14px;font-family:var(--font-serif);font-style:italic"
            placeholder="One-liner"
            :model-value="ch.oneLiner" @update:model-value="updateField('oneLiner', $event)" />
        </div>
      </div>

      <div style="margin-top:22px">
        <div class="t-eyebrow" style="margin-bottom:10px">Motivation</div>
        <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:10px">
          <div v-for="i in MOTIVATIONS" :key="i.k"
            :style="`padding:14px;border-radius:10px;background:${i.bg};border:1px solid color-mix(in oklab, ${i.color}, white 60%)`">
            <div :style="`font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${i.color};margin-bottom:6px`">{{ i.label }}</div>
            <Textarea fluid rows="2" style="background:transparent;border:0;font-family:var(--font-serif);font-size:14.5px;line-height:1.5"
              :model-value="extras?.motivation?.[i.k] || ''" @update:model-value="updateMotivation(i.k, $event)" />
          </div>
        </div>
      </div>

      <div style="margin-top:22px">
        <div class="t-eyebrow" style="margin-bottom:10px">Arc</div>
        <div class="card tight" style="padding:0;overflow:hidden">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr">
            <div v-for="(s, i) in ARC_STEPS" :key="s.k"
              :style="`padding:14px;${i < 2 ? 'border-right:1px solid var(--border);' : ''}`">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <span :style="`width:18px;height:18px;border-radius:50%;background:${i === 0 ? 'var(--surface-3)' : i === 1 ? 'var(--accent-soft)' : 'var(--accent)'};color:${i === 2 ? 'white' : 'var(--ink-2)'};display:grid;place-items:center;font-family:var(--font-serif);font-style:italic;font-size:11px;font-weight:600`">{{ i + 1 }}</span>
                <span class="t-eyebrow">{{ s.label }}</span>
              </div>
              <Textarea fluid rows="3" style="background:transparent;border:0;font-family:var(--font-serif);font-size:14px;line-height:1.55"
                :model-value="extras?.arc?.[s.k] || ''" @update:model-value="updateArc(s.k, $event)" />
            </div>
          </div>
        </div>
      </div>

      <div style="margin-top:22px">
        <div class="t-eyebrow" style="margin-bottom:10px">Voice & dialect</div>
        <div class="card tight" style="padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px 18px;font-size:12.5px">
          <div>
            <div class="t-muted">Accent</div>
            <InputText fluid :model-value="extras?.voice?.accent || ''" @update:model-value="updateVoice('accent', $event)" />
          </div>
          <div>
            <div class="t-muted">Vocabulary</div>
            <InputText fluid :model-value="extras?.voice?.vocabulary || ''" @update:model-value="updateVoice('vocabulary', $event)" />
          </div>
          <div style="grid-column:1/-1">
            <div class="t-muted">Speech tic</div>
            <InputText fluid :model-value="extras?.voice?.tic || ''" @update:model-value="updateVoice('tic', $event)" />
          </div>
          <div style="grid-column:1/-1">
            <div class="t-muted">Sample line</div>
            <Textarea fluid rows="2" :model-value="extras?.voice?.sample || ''" @update:model-value="updateVoice('sample', $event)" />
          </div>
        </div>
      </div>

      <div style="margin-top:22px">
        <div class="t-eyebrow" style="margin-bottom:10px">Backstory</div>
        <div class="card tight" style="padding:16px">
          <Textarea fluid rows="5" style="font-family:var(--font-serif);font-size:15px;line-height:1.65"
            :model-value="extras?.backstory || ''" @update:model-value="updateBackstory($event)" />
        </div>
      </div>

      <div style="margin-top:22px">
        <div class="t-eyebrow" style="margin-bottom:10px">Appears in scenes</div>
        <SceneRefList field="characters" :entity-id="ch.id"
          empty-text="No scenes link this character yet. Open a scene → Links → Characters to add one." />
      </div>

      <div style="margin-top:22px">
        <div class="t-eyebrow" style="margin-bottom:10px">Mentioned in prose</div>
        <MentionRefList :entity-id="ch.id" />
      </div>
    </div>
  </div>

  <ImagesModal v-if="modal === 'images'" :entity-id="ch.id" :entity-name="ch.name" @close="modal = null" />
  <GroupsModal v-if="modal === 'groups'" :entity-id="ch.id" :entity-name="ch.name" entity-kind="character" @close="modal = null" />
</template>

<style scoped>
.character-pane-header .pane-title { gap: 2px; }
.character-name {
  appearance: none;
  font-family: var(--font-serif);
  font-size: 20px; font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--ink);
  border: 1px solid transparent;
  background: transparent;
  border-radius: 6px;
  padding: 2px 6px;
  margin-left: -6px;
  outline: none;
  min-width: 0;
}
.character-name:hover { border-color: var(--border-soft); }
.character-name:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-soft); }

.avatar-drop {
  position: relative;
  border-radius: 14px;
  transition: box-shadow .15s ease, transform .15s ease;
}
.avatar-drop-hot {
  box-shadow: 0 0 0 3px var(--accent), 0 0 0 6px var(--accent-soft);
  transform: scale(1.02);
}
.avatar-drop-overlay {
  position: absolute;
  inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 4px;
  background: color-mix(in oklch, var(--accent) 75%, transparent);
  color: var(--on-accent);
  border-radius: 14px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  pointer-events: none;
}
.avatar-drop-overlay.saving {
  background: color-mix(in oklch, var(--surface) 80%, transparent);
  color: var(--ink-2);
  font-style: italic;
  text-transform: none;
  letter-spacing: 0;
  font-weight: 500;
}
</style>
