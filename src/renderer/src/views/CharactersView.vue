<script setup>
import { computed, ref } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRouter } from "vue-router";
import PaneHeader from "../components/PaneHeader.vue";
import Avatar from "../components/Avatar.vue";
import Icon from "../components/Icon.vue";
import ImagesModal from "../components/ImagesModal.vue";
import EventsModal from "../components/EventsModal.vue";
import GroupsModal from "../components/GroupsModal.vue";
import { promptDialog, confirmDialog } from "../services/dialog.js";
import { saveImage } from "../services/imageStore.js";

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

function jumpChapter(num) { window.location.hash = `#/chapters/ch${num}`; }
async function addCharacter() {
  const name = await promptDialog({
    title: "New character",
    label: "Character name",
    placeholder: "e.g. Mira Halden",
    confirmLabel: "Create character",
  });
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
  <PaneHeader :eyebrow="ch.main ? 'Main character' : 'Secondary character'" :title="ch.name">
    <button class="btn ghost" @click="modal = 'images'"><Icon name="Image" :size="14" /> Images</button>
    <button class="btn ghost" @click="modal = 'events'"><Icon name="Calendar" :size="14" /> Events</button>
    <button class="btn ghost" @click="modal = 'groups'"><Icon name="GroupIcon" :size="14" /> Groups</button>
    <button class="btn ghost" @click="deleteCharacter">Delete</button>
    <button class="btn primary" @click="addCharacter"><Icon name="Plus" :size="14" /> New character</button>
  </PaneHeader>

  <div class="col-detail scrollarea" style="overflow:auto">
    <div style="padding:24px 28px 40px;max-width:980px">
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
          <input class="input" style="font-size:18px;font-weight:600;font-family:var(--font-serif);margin-bottom:6px"
            :value="ch.name" @input="updateField('name', $event.target.value)" />
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input class="input" style="max-width:200px" placeholder="Role"
              :value="ch.role" @input="updateField('role', $event.target.value)" />
            <label class="chip" style="cursor:pointer">
              <input type="checkbox" :checked="ch.main" @change="updateField('main', $event.target.checked)" style="margin-right:6px" />
              Main character
            </label>
            <input class="input" type="number" style="max-width:80px" placeholder="Age"
              :value="ch.age ?? ''" @input="updateField('age', $event.target.value ? Number($event.target.value) : null)" />
          </div>
          <textarea class="input" rows="2" style="margin-top:14px;font-family:var(--font-serif);font-style:italic"
            placeholder="One-liner"
            :value="ch.oneLiner" @input="updateField('oneLiner', $event.target.value)" />
        </div>
      </div>

      <div style="margin-top:22px">
        <div class="t-eyebrow" style="margin-bottom:10px">Motivation</div>
        <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:10px">
          <div v-for="i in MOTIVATIONS" :key="i.k"
            :style="`padding:14px;border-radius:10px;background:${i.bg};border:1px solid color-mix(in oklab, ${i.color}, white 60%)`">
            <div :style="`font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${i.color};margin-bottom:6px`">{{ i.label }}</div>
            <textarea class="input" rows="2" style="background:transparent;border:0;font-family:var(--font-serif);font-size:14.5px;line-height:1.5"
              :value="extras?.motivation?.[i.k] || ''" @input="updateMotivation(i.k, $event.target.value)" />
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
              <textarea class="input" rows="3" style="background:transparent;border:0;font-family:var(--font-serif);font-size:14px;line-height:1.55"
                :value="extras?.arc?.[s.k] || ''" @input="updateArc(s.k, $event.target.value)" />
            </div>
          </div>
        </div>
      </div>

      <div style="margin-top:22px">
        <div class="t-eyebrow" style="margin-bottom:10px">Voice & dialect</div>
        <div class="card tight" style="padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px 18px;font-size:12.5px">
          <div>
            <div class="t-muted">Accent</div>
            <input class="input" :value="extras?.voice?.accent || ''" @input="updateVoice('accent', $event.target.value)" />
          </div>
          <div>
            <div class="t-muted">Vocabulary</div>
            <input class="input" :value="extras?.voice?.vocabulary || ''" @input="updateVoice('vocabulary', $event.target.value)" />
          </div>
          <div style="grid-column:1/-1">
            <div class="t-muted">Speech tic</div>
            <input class="input" :value="extras?.voice?.tic || ''" @input="updateVoice('tic', $event.target.value)" />
          </div>
          <div style="grid-column:1/-1">
            <div class="t-muted">Sample line</div>
            <textarea class="input" rows="2" :value="extras?.voice?.sample || ''" @input="updateVoice('sample', $event.target.value)" />
          </div>
        </div>
      </div>

      <div style="margin-top:22px">
        <div class="t-eyebrow" style="margin-bottom:10px">Backstory</div>
        <div class="card tight" style="padding:16px">
          <textarea class="input" rows="5" style="font-family:var(--font-serif);font-size:15px;line-height:1.65"
            :value="extras?.backstory || ''" @input="updateBackstory($event.target.value)" />
        </div>
      </div>

      <div style="margin-top:22px">
        <div class="t-eyebrow" style="margin-bottom:10px">Appearances</div>
        <div style="display:grid;grid-template-columns:repeat(7, 1fr);gap:6px">
          <button v-for="c in project.allChapters" :key="c.id"
            :title="`Ch. ${c.num} — ${c.title}`" @click="jumpChapter(c.num)"
            :style="`height:36px;border-radius:6px;border:1px solid var(--border);background:${c.num <= 10 ? 'var(--accent-soft)' : 'var(--surface-2)'};color:${c.num <= 10 ? 'var(--accent-ink)' : 'var(--muted)'};display:grid;place-items:center;font-size:12px;font-weight:500;font-variant-numeric:tabular-nums`">{{ c.num }}</button>
        </div>
      </div>
    </div>
  </div>

  <ImagesModal v-if="modal === 'images'" :entity-id="ch.id" :entity-name="ch.name" @close="modal = null" />
  <EventsModal v-if="modal === 'events'" :entity-id="ch.id" :entity-name="ch.name" @close="modal = null" />
  <GroupsModal v-if="modal === 'groups'" :entity-id="ch.id" :entity-name="ch.name" entity-kind="character" @close="modal = null" />
</template>

<style scoped>
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
