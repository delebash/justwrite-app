<script setup>
import { computed, ref } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRouter } from "vue-router";
import Avatar from "../components/Avatar.vue";
import Icon from "../components/Icon.vue";
import JwInput from "@renderer/components/ui/JwInput.vue";
import JwTextarea from "@renderer/components/ui/JwTextarea.vue";
import JwCheckbox from "@renderer/components/ui/JwCheckbox.vue";
import JwNumber from "@renderer/components/ui/JwNumber.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";
import JwTag from "@renderer/components/ui/JwTag.vue";
import JwTable from "@renderer/components/ui/JwTable.vue";
import ImagesModal from "../components/ImagesModal.vue";
import EntitySweepModal from "../components/EntitySweepModal.vue";
import StatusSelect from "../components/StatusSelect.vue";
import GroupsModal from "../components/GroupsModal.vue";
import TagEditor from "../components/TagEditor.vue";
import SceneRefList from "../components/SceneRefList.vue";
import MentionRefList from "../components/MentionRefList.vue";
import Breadcrumb from "../components/Breadcrumb.vue";
import PaneHeader from "../components/PaneHeader.vue";
import { promptDialog } from "../services/dialog.js";
import { saveImage } from "../services/imageStore.js";
import { NEW_ENTITY_META } from "../services/entityMeta.js";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();
const sweepOpen = ref(false);

// When id is present → detail mode. When absent → list mode.
const ch = computed(() => props.id ? project.characterById(props.id) : null);
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
function deleteCharacter() {
  project.removeCharacter(ch.value.id);
  const next = project.characters[0];
  if (next) { ui.select("characters", next.id); router.push(`/characters/${next.id}`); } else router.push("/characters");
}
function updateField(k, v) { project.updateCharacter(ch.value.id, { [k]: v }); }

// ── Avatar / image drop ─────────────────────────────────────────────
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
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
  isFileDragging.value = true;
}
function onAvatarDragLeave(e) {
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

const tagPool = computed(() => {
  const out = [];
  for (const c of project.characters) for (const t of (c.tags || [])) out.push(t);
  return out;
});

// ── List mode: table + facets ────────────────────────────────────────
// Each row gets the avatar image record resolved for rendering in the Name cell.
const rows = computed(() =>
  project.characters.map((c) => {
    const images = project.imagesFor(c.id);
    return {
      ...c,
      _avatarImage: images.length ? images[images.length - 1] : null,
    };
  }),
);

const globalQuery = ref("");
const selectedStatus = ref(null);
const selectedMain = ref(null);   // null = All, true = Yes, false = No
const selectedTags = ref(new Set());

function onGlobalInput(e) { globalQuery.value = e.target.value; }
function toggleTag(t) {
  const next = new Set(selectedTags.value);
  if (next.has(t)) next.delete(t); else next.add(t);
  selectedTags.value = next;
}
function clearAllFilters() {
  globalQuery.value = "";
  selectedStatus.value = null;
  selectedMain.value = null;
  selectedTags.value = new Set();
}

const statusOptions = computed(() =>
  project.statuses.map((s) => ({ value: s.id, label: s.label })),
);
const allTags = computed(() => {
  const set = new Set();
  for (const c of project.characters) for (const t of (c.tags || [])) set.add(t);
  return [...set].sort();
});

const filteredRows = computed(() => {
  const rs = rows.value;
  if (selectedStatus.value === null && selectedMain.value === null && selectedTags.value.size === 0) return rs;
  return rs.filter((r) => {
    if (selectedStatus.value !== null && r.status !== selectedStatus.value) return false;
    if (selectedMain.value !== null && !!r.main !== selectedMain.value) return false;
    if (selectedTags.value.size > 0) {
      const rt = r.tags || [];
      if (!rt.some((t) => selectedTags.value.has(t))) return false;
    }
    return true;
  });
});

const hasActiveFacets = computed(() =>
  selectedStatus.value !== null || selectedMain.value !== null || selectedTags.value.size > 0,
);

const columns = [
  { accessorKey: "name",   header: "Name",   sortable: true, headerStyle: "min-width: 200px" },
  { accessorKey: "role",   header: "Role",   sortable: true, headerStyle: "min-width: 140px" },
  { accessorKey: "tags",   header: "Tags",   sortable: false, headerStyle: "min-width: 160px", enableGlobalFilter: true },
  { accessorKey: "status", header: "Status", sortable: true, headerStyle: "min-width: 120px" },
  { accessorKey: "main",   header: "Main",   sortable: true, headerStyle: "min-width: 80px" },
];

function statusLabel(id) { return project.statusById(id)?.label || id || ""; }
function statusSeverity(id) {
  if (id === "done")   return "success";
  if (id === "revise") return "accent2";
  if (id === "draft")  return "info";
  if (id === "todo")   return "secondary";
  return "secondary";
}

function onRowClick(event) {
  const id = event?.data?.id;
  if (id) router.push(`/characters/${id}`);
}
</script>

<template>
  <!-- ── List mode (no id in URL) ─────────────────────────────── -->
  <template v-if="!ch && !id">
    <PaneHeader :eyebrow="$t('panes.characters.eyebrow')" :title="$t('nav.characters')">
      <JwButton intent="ghost" size="small" @click="sweepOpen = true" v-tooltip.bottom="'Scan the manuscript for new characters, locations, and objects'">
        <Icon name="Sparkle" :size="13" /> Find new entities
      </JwButton>
      <JwButton label="New character" intent="primary" size="small" @click="addCharacter">
        <template #icon><Icon name="Plus" :size="14" /></template>
      </JwButton>
    </PaneHeader>

    <!-- Empty state -->
    <div v-if="project.characters.length === 0" class="pane-card" style="display:grid;place-items:center;padding:60px">
      <div class="t-muted" style="text-align:center">
        No characters yet.<br />
        <JwButton intent="primary" style="margin-top:14px" @click="addCharacter"><Icon name="Plus" :size="14" /> Create your first character</JwButton>
      </div>
    </div>

    <div v-else class="pane-card">
      <div class="scrollarea" style="padding:18px 22px 40px">
        <!-- Toolbar -->
        <div class="ch-toolbar">
          <span class="ch-search">
            <Icon name="Search" :size="13" class="ch-search-icon" />
            <JwInput
              :value="globalQuery"
              placeholder="Search characters…"
              @input="onGlobalInput"
              class="ch-search-input"
            />
          </span>
          <JwButton v-if="globalQuery || hasActiveFacets" label="Clear filters" intent="ghost" size="small" @click="clearAllFilters" />
          <span class="ch-count">{{ filteredRows.length }} of {{ rows.length }}</span>
        </div>

        <!-- Facets -->
        <div class="ch-facets" v-if="statusOptions.length || allTags.length">
          <div v-if="statusOptions.length" class="ch-facet">
            <span class="ch-facet-label">Status</span>
            <button class="ch-chip" :class="{ active: selectedStatus === null }" @click="selectedStatus = null">All</button>
            <button v-for="s in statusOptions" :key="s.value"
              class="ch-chip" :class="{ active: selectedStatus === s.value }"
              @click="selectedStatus = selectedStatus === s.value ? null : s.value">
              {{ s.label }}
            </button>
          </div>
          <div class="ch-facet">
            <span class="ch-facet-label">Main</span>
            <button class="ch-chip" :class="{ active: selectedMain === null }" @click="selectedMain = null">All</button>
            <button class="ch-chip" :class="{ active: selectedMain === true }" @click="selectedMain = selectedMain === true ? null : true">Yes</button>
            <button class="ch-chip" :class="{ active: selectedMain === false }" @click="selectedMain = selectedMain === false ? null : false">No</button>
          </div>
          <div v-if="allTags.length" class="ch-facet">
            <span class="ch-facet-label">Tags</span>
            <button v-for="t in allTags" :key="t"
              class="ch-chip" :class="{ active: selectedTags.has(t) }"
              @click="toggleTag(t)">
              {{ t }}
            </button>
          </div>
        </div>

        <JwTable
          :data="filteredRows"
          :columns="columns"
          data-key="id"
          row-hover
          :global-filter="globalQuery"
          :global-filter-fields="['name', 'role', 'oneLiner', 'tags']"
          :pagination="{ pageSize: 20, pageSizeOptions: [10, 20, 50, 100] }"
          class="ch-table"
          @row-click="onRowClick"
        >
          <template #empty>
            <div class="ch-empty">No characters match your search.</div>
          </template>

          <template #name="{ row }">
            <div class="ch-cell-name">
              <Avatar :name="row.name" :image="row._avatarImage" :size="28" />
              <div class="ch-cell-name-text">
                <span class="ch-cell-name-main">{{ row.name }}</span>
                <span v-if="row.oneLiner" class="ch-cell-name-sub">{{ row.oneLiner }}</span>
              </div>
            </div>
          </template>

          <template #role="{ row }">
            <span class="ch-role">{{ row.role || '' }}</span>
          </template>

          <template #tags="{ row }">
            <div class="ch-tags">
              <JwTag v-for="t in row.tags" :key="t" :value="t" intent="secondary" />
            </div>
          </template>

          <template #status="{ row }">
            <JwTag v-if="row.status" :value="statusLabel(row.status)" :intent="statusSeverity(row.status)" />
            <span v-else class="ch-status-empty">—</span>
          </template>

          <template #main="{ row }">
            <JwTag v-if="row.main" value="Yes" intent="info" />
            <span v-else class="ch-status-empty">—</span>
          </template>
        </JwTable>
      </div>
    </div>
  </template>

  <!-- ── Detail mode (id present, character found) ────────────── -->
  <template v-else-if="ch">
    <header class="pane-header character-pane-header">
      <div class="pane-title">
        <Breadcrumb :segments="[{ label: ch.main ? 'Main character' : 'Secondary character', to: '/characters' }]" />
        <input class="character-name"
          :value="ch.name"
          placeholder="Character name"
          @input="updateField('name', $event.target.value)" />
      </div>
      <div class="pane-actions">
        <JwButton intent="ghost" size="small" @click="modal = 'images'"><Icon name="Image" :size="14" /> Images</JwButton>
        <router-link :to="`/characters/${ch.id}/events`" custom v-slot="{ navigate }">
          <JwButton intent="ghost" size="small" @click="navigate"><Icon name="Calendar" :size="14" /> Events</JwButton>
        </router-link>
        <JwButton intent="ghost" size="small" @click="modal = 'groups'"><Icon name="GroupIcon" :size="14" /> Groups</JwButton>
        <JwButton intent="ghost" size="small" @click="deleteCharacter">Delete</JwButton>
        <JwButton intent="primary" size="small" @click="addCharacter"><Icon name="Plus" :size="14" /> New character</JwButton>
        <StatusSelect :model-value="ch.status || ''" @update:model-value="(v) => updateField('status', v)" />
      </div>
    </header>

    <div class="pane-card">
      <div class="scrollarea" style="padding:24px 28px 40px">
        <div class="character-hero">
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
          <div class="character-hero-fields">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <JwInput fluid style="max-width:200px" placeholder="Role"
                :model-value="ch.role" @update:model-value="updateField('role', $event)" />
              <label class="chip" style="cursor:pointer;gap:6px">
                <JwCheckbox :model-value="ch.main" @update:model-value="updateField('main', $event)" />
                Main character
              </label>
              <JwNumber style="max-width:80px" placeholder="Age" :use-grouping="false"
                :model-value="ch.age ?? null" @update:model-value="updateField('age', $event ?? null)" />
            </div>
            <JwTextarea fluid rows="2" style="margin-top:14px;font-family:var(--font-serif);font-style:italic"
              placeholder="One-liner"
              :model-value="ch.oneLiner" @update:model-value="updateField('oneLiner', $event)" />
          </div>
        </div>

        <TagEditor
          :model-value="ch.tags || []"
          :pool="tagPool"
          :curated="project.tagVocabularies.characters"
          @update:model-value="(v) => updateField('tags', v)" />

        <div style="margin-top:22px">
          <div class="t-eyebrow" style="margin-bottom:10px">Motivation</div>
          <div class="motivation-grid" style="display:grid;gap:10px">
            <div v-for="i in MOTIVATIONS" :key="i.k"
              :style="`padding:14px;border-radius:10px;background:${i.bg};border:1px solid color-mix(in oklab, ${i.color}, white 60%)`">
              <div :style="`font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${i.color};margin-bottom:6px`">{{ i.label }}</div>
              <JwTextarea fluid rows="2" style="background:transparent;border:0;font-family:var(--font-serif);font-size:14.5px;line-height:1.5"
                :model-value="extras?.motivation?.[i.k] || ''" @update:model-value="updateMotivation(i.k, $event)" />
            </div>
          </div>
        </div>

        <div style="margin-top:22px">
          <div class="t-eyebrow" style="margin-bottom:10px">Arc</div>
          <div class="card tight" style="padding:0;overflow:hidden">
            <div class="arc-grid" style="display:grid">
              <div v-for="(s, i) in ARC_STEPS" :key="s.k"
                :style="`padding:14px;${i < 2 ? 'border-right:1px solid var(--border);' : ''}`">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                  <span :style="`width:18px;height:18px;border-radius:50%;background:${i === 0 ? 'var(--surface-3)' : i === 1 ? 'var(--accent-soft)' : 'var(--accent)'};color:${i === 2 ? 'white' : 'var(--ink-2)'};display:grid;place-items:center;font-family:var(--font-serif);font-style:italic;font-size:11px;font-weight:600`">{{ i + 1 }}</span>
                  <span class="t-eyebrow">{{ s.label }}</span>
                </div>
                <JwTextarea fluid rows="3" style="background:transparent;border:0;font-family:var(--font-serif);font-size:14px;line-height:1.55"
                  :model-value="extras?.arc?.[s.k] || ''" @update:model-value="updateArc(s.k, $event)" />
              </div>
            </div>
          </div>
        </div>

        <div style="margin-top:22px">
          <div class="t-eyebrow" style="margin-bottom:10px">Voice & dialect</div>
          <div class="card tight voice-grid" style="padding:16px;gap:10px 18px;font-size:12.5px">
            <div>
              <div class="t-muted">Accent</div>
              <JwInput fluid :model-value="extras?.voice?.accent || ''" @update:model-value="updateVoice('accent', $event)" />
            </div>
            <div>
              <div class="t-muted">Vocabulary</div>
              <JwInput fluid :model-value="extras?.voice?.vocabulary || ''" @update:model-value="updateVoice('vocabulary', $event)" />
            </div>
            <div style="grid-column:1/-1">
              <div class="t-muted">Speech tic</div>
              <JwInput fluid :model-value="extras?.voice?.tic || ''" @update:model-value="updateVoice('tic', $event)" />
            </div>
            <div style="grid-column:1/-1">
              <div class="t-muted">Sample line</div>
              <JwTextarea fluid rows="2" :model-value="extras?.voice?.sample || ''" @update:model-value="updateVoice('sample', $event)" />
            </div>
          </div>
        </div>

        <div style="margin-top:22px">
          <div class="t-eyebrow" style="margin-bottom:10px">Backstory</div>
          <div class="card tight" style="padding:16px">
            <JwTextarea fluid rows="5" style="font-family:var(--font-serif);font-size:15px;line-height:1.65"
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

  <!-- ── id in URL but character not found (deleted / bad link) ── -->
  <template v-else>
    <header class="pane-header character-pane-header">
      <div class="pane-title">
        <Breadcrumb :segments="[{ label: 'Character', to: '/characters' }]" />
        <h1 class="pane-h1">Character not found</h1>
      </div>
      <div class="pane-actions">
        <JwButton intent="primary" size="small" @click="addCharacter"><Icon name="Plus" :size="14" /> New character</JwButton>
      </div>
    </header>
    <div class="pane-card" style="display:grid;place-items:center;padding:60px">
      <div class="t-muted" style="text-align:center">
        This character no longer exists.<br />
        <JwButton intent="ghost" style="margin-top:14px" @click="router.push('/characters')">Back to characters</JwButton>
      </div>
    </div>
  </template>

  <EntitySweepModal v-if="sweepOpen"
    @close="sweepOpen = false"
    @committed="sweepOpen = false" />
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

.pane-card { container-type: inline-size; container-name: pane; }

.character-hero {
  display: flex;
  gap: 22px;
  align-items: flex-start;
}
.character-hero-fields { flex: 1; min-width: 0; }

.motivation-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.arc-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.voice-grid { display: grid; grid-template-columns: 1fr 1fr; }

@container pane (max-width: 760px) {
  .character-hero { flex-direction: column; align-items: stretch; gap: 14px; }
  .character-hero .avatar-drop { align-self: center; }
  .motivation-grid { grid-template-columns: 1fr; }
  .arc-grid { grid-template-columns: 1fr; }
  .arc-grid > div { border-right: 0 !important; border-bottom: 1px solid var(--border); }
  .arc-grid > div:last-child { border-bottom: 0; }
  .voice-grid { grid-template-columns: 1fr; }
}

/* ── List view ─────────────────────────────────────────────────── */
.ch-toolbar {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 14px;
}
.ch-search {
  position: relative; flex: 1; max-width: 360px;
}
.ch-search-icon {
  position: absolute; left: 10px; top: 50%;
  transform: translateY(-50%);
  color: var(--muted); pointer-events: none;
}
.ch-search-input { width: 100%; padding-left: 30px !important; }
.ch-count { margin-left: auto; font-family: var(--font-mono); font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }

.ch-facets {
  display: flex; flex-direction: column;
  gap: 8px;
  padding: 10px 0 14px;
}
.ch-facet { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ch-facet-label {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  min-width: 64px;
}
.ch-chip {
  appearance: none;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--ink-2);
  padding: 3px 9px;
  border-radius: 999px;
  font: 500 11.5px/1.4 var(--font-ui);
  cursor: pointer;
  transition: background-color .12s, border-color .12s, color .12s;
}
.ch-chip:hover { background: var(--surface-3); border-color: var(--border-strong); }
.ch-chip.active {
  background: var(--accent-soft);
  border-color: var(--accent-line);
  color: var(--accent-ink);
}

.ch-table { font-size: 13px; }
.ch-cell-name {
  display: flex; align-items: center; gap: 10px; cursor: pointer;
}
.ch-cell-name-text { display: flex; flex-direction: column; gap: 1px; }
.ch-cell-name-main { font-family: var(--font-serif); font-size: 14px; color: var(--ink); }
.ch-cell-name-sub {
  font-size: 12px; color: var(--muted); line-height: 1.4;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 340px;
}
.ch-role { font-size: 12.5px; color: var(--ink-2); }
.ch-tags { display: flex; gap: 4px; flex-wrap: wrap; }
.ch-status-empty { color: var(--muted); }
.ch-empty { padding: 28px; text-align: center; color: var(--muted); font-style: italic; }
</style>
