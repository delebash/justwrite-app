<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore, TRASH_KINDS } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import PaneHeader from "../components/PaneHeader.vue";
import Icon from "../components/Icon.vue";
import { confirmDialog } from "../services/dialog.js";
import JwButton from "@renderer/components/ui/JwButton.vue";
import JwTable from "@renderer/components/ui/JwTable.vue";

const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();

const KIND_META = {
  chapters:      { label: "Chapters",      icon: "Book",      labelOne: "chapter" },
  scenes:        { label: "Scenes",        icon: "Quote",     labelOne: "scene" },
  characters:    { label: "Characters",    icon: "Users",     labelOne: "character" },
  locations:     { label: "Locations",     icon: "Pin",       labelOne: "location" },
  objects:       { label: "Objects",       icon: "Cube",      labelOne: "object" },
  groups:        { label: "Groups",        icon: "GroupIcon", labelOne: "group" },
  notes:         { label: "Notes",         icon: "Note",      labelOne: "note" },
  strands:       { label: "Narrative strands",       icon: "Strands", labelOne: "narrative strand" },
  worldbuilding: { label: "Worldbuilding", icon: "Sparkle",   labelOne: "article" },
  events:        { label: "Events",        icon: "Calendar",  labelOne: "event" },
  statuses:      { label: "Statuses",      icon: "Check",     labelOne: "status" },
  tagVocab:      { label: "Curated tags",  icon: "Sparkle",   labelOne: "tag" },
};

// Group by kind with metadata; only show kinds that have items.
const sections = computed(() => TRASH_KINDS
  .map((k) => ({ kind: k, meta: KIND_META[k], items: project.trash[k] || [] }))
  .filter((s) => s.items.length)
);

const totalCount = computed(() => project.trashCount);

// Item title — different shape per kind.
function titleOf(kind, item) {
  if (kind === "chapters")      return `Ch. ${item.num} — ${item.title}`;
  if (kind === "scenes")        return item.title || "Untitled scene";
  if (kind === "notes")         return item.title;
  if (kind === "worldbuilding") return item.title;
  if (kind === "events")        return item.title || "Untitled event";
  if (kind === "statuses")      return item.label;
  if (kind === "tagVocab")      return item.label;
  return item.name;
}
// Resolve the parent entity name for a deleted event (events attach to
// characters/locations/objects). Returns null if the parent was deleted too.
function eventParentName(entityId) {
  if (!entityId) return null;
  for (const list of [project.characters, project.locations, project.objects]) {
    const found = list.find((x) => x.id === entityId);
    if (found) return found.name;
  }
  return null;
}
function subOf(kind, item) {
  if (kind === "chapters")   return item.partId ? `from ${project.parts.find((p) => p.id === item.partId)?.title || "removed part"}` : null;
  if (kind === "scenes") {
    const parent = project.chapterById(item.chapterId);
    return parent ? `from "Ch. ${parent.num} — ${parent.title}"` : "from removed chapter";
  }
  if (kind === "characters") return item.role;
  if (kind === "locations")  return item.kind;
  if (kind === "objects")    return item.kind;
  if (kind === "notes")      return `tag · ${item.tag}`;
  if (kind === "groups")     return `${(item.members || []).length} members`;
  if (kind === "worldbuilding") return item.category;
  if (kind === "events") {
    const parent = eventParentName(item.entityId);
    return parent ? `from "${parent}"` : "from removed entity";
  }
  if (kind === "tagVocab")   return `for ${item.kind}`;
  return null;
}
function ago(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function restore(kind, id) {
  project.restoreFromTrash(kind, id);
  ui.showToast({ message: "Restored." });
}
async function purge(kind, id, name) {
  const yes = await confirmDialog({
    title: `Permanently delete "${name}"?`,
    message: "This can't be undone.",
    confirmLabel: "Delete forever",
    danger: true,
  });
  if (!yes) return;
  project.purgeFromTrash(kind, id);
  ui.showToast({ message: "Permanently deleted." });
}
async function emptyAll() {
  const yes = await confirmDialog({
    title: "Empty trash?",
    message: `Permanently delete all ${totalCount.value} items in trash. This can't be undone.`,
    confirmLabel: "Empty trash",
    danger: true,
  });
  if (!yes) return;
  project.emptyTrash();
  ui.showToast({ message: "Trash emptied." });
}

const trashColumns = [
  { accessorKey: "title",     header: "Title",   headerStyle: "min-width:200px", cellStyle: "min-width:200px" },
  { accessorKey: "sub",       header: "Details", headerStyle: "min-width:140px", cellStyle: "min-width:140px" },
  { accessorKey: "deletedAt", header: "Deleted", sortable: true, headerStyle: "width:130px", cellStyle: "width:130px" },
  { id: "actions",            header: "Actions", headerStyle: "width:130px;text-align:right", cellStyle: "width:130px;text-align:right" },
];
</script>

<template>
  <PaneHeader :eyebrow="$t('settings.eyebrow')" :title="$t('nav.trash')" help-key="backups-and-data#restoring-from-autosave">
    <span class="t-muted" style="font-size:12px">
      {{ totalCount }} item{{ totalCount === 1 ? "" : "s" }}
    </span>
    <JwButton v-if="totalCount" intent="ghost" @click="emptyAll">
      <Icon name="Trash" :size="13" /> Empty trash
    </JwButton>
  </PaneHeader>

  <div class="pane-card">
  <div class="scrollarea">
    <div style="padding:18px 26px 0">
      <p class="trash-desc">
        <strong>Trash</strong> is where soft-deleted items rest — every chapter, character,
        location, object, group, note, or strand you remove lands here first. Click
        <strong>Restore</strong> any time to bring an item back; click the trash icon to destroy
        it permanently. Items stay in Trash indefinitely until you choose to empty it.
      </p>
    </div>

    <!-- Empty -->
    <div v-if="totalCount === 0" style="padding:60px 22px;display:grid;place-items:center">
      <div style="max-width:380px;text-align:center">
        <div style="width:64px;height:64px;border-radius:16px;margin:0 auto 18px;background:var(--surface-3);color:var(--muted);display:grid;place-items:center">
          <Icon name="Trash" :size="28" />
        </div>
        <h3 style="font-family:var(--font-serif);font-size:22px;font-weight:600;margin:0">Trash is empty</h3>
        <p style="font-size:13.5px;color:var(--ink-2);margin-top:8px;line-height:1.55">
          Deleted chapters, characters, locations, objects, groups, notes, narrative strands, and worldbuilding articles
          appear here. Restore or permanently delete from this view.
        </p>
      </div>
    </div>

    <!-- Sections -->
    <div v-else style="padding:18px 26px 60px;max-width:920px">
      <p class="t-muted" style="font-size:12.5px;margin:0 0 18px;line-height:1.55">
        Items are kept until you permanently delete them. Restoring puts a chapter back in its original Part
        when possible (falling back to the last Part if the original has been removed).
      </p>

      <section v-for="s in sections" :key="s.kind" class="trash-section">
        <div class="trash-section-head">
          <span class="trash-section-icon"><Icon :name="s.meta.icon" :size="13" /></span>
          <span class="trash-section-name">{{ s.meta.label }}</span>
          <span class="t-muted" style="font-size:11px;font-variant-numeric:tabular-nums">{{ s.items.length }}</span>
          <span style="flex:1;height:1px;background:var(--border-soft);margin-left:8px" />
        </div>
        <JwTable :data="s.items" data-key="id" :columns="trashColumns" class="trash-dt">
          <template #title="{ row }">
            <div class="trash-title">{{ titleOf(s.kind, row) }}</div>
          </template>
          <template #sub="{ row }">
            <span class="t-muted" style="font-size:11.5px">{{ subOf(s.kind, row) || "—" }}</span>
          </template>
          <template #deletedAt="{ row }">
            <span class="t-muted" style="font-size:11.5px">{{ ago(row.deletedAt) }}</span>
          </template>
          <template #actions="{ row }">
            <div style="display:flex;gap:6px;justify-content:flex-end">
              <JwButton label="Restore" intent="primary" size="small" @click="restore(s.kind, row.id)">
                <template #icon><Icon name="Refresh" :size="11" /></template>
              </JwButton>
              <JwButton intent="ghost" size="small" aria-label="Permanently delete" v-tooltip.bottom="'Permanently delete'" @click="purge(s.kind, row.id, titleOf(s.kind, row))">
                <template #icon><Icon name="Trash" :size="11" /></template>
              </JwButton>
            </div>
          </template>
        </JwTable>
      </section>
    </div>
  </div>
  </div>
</template>

<style scoped>
.trash-section { margin-bottom: 28px; }
.trash-section-head { display: flex; align-items: center; gap: 8px; padding: 4px 0 10px; }
.trash-section-icon {
  width: 22px; height: 22px; border-radius: 6px;
  background: var(--surface-3); color: var(--muted);
  display: grid; place-items: center;
}
.trash-section-name {
  font-size: 11.5px; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--muted);
}
.trash-dt { font-size: 13px; }
.trash-title {
  font-family: var(--font-serif);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.005em;
}
.trash-desc {
  font-size: 14px; line-height: 1.55; color: var(--muted);
  margin: 0 0 18px;
}
.trash-desc strong { color: var(--ink-2); font-weight: 600; }
</style>
