<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore, TRASH_KINDS } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import PaneHeader from "../components/PaneHeader.vue";
import Icon from "../components/Icon.vue";
import { confirmDialog } from "../services/dialog.js";

const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();

const KIND_META = {
  chapters:      { label: "Chapters",      icon: "Book",      labelOne: "chapter" },
  characters:    { label: "Characters",    icon: "Users",     labelOne: "character" },
  locations:     { label: "Locations",     icon: "Pin",       labelOne: "location" },
  objects:       { label: "Objects",       icon: "Cube",      labelOne: "object" },
  groups:        { label: "Groups",        icon: "GroupIcon", labelOne: "group" },
  notes:         { label: "Notes",         icon: "Note",      labelOne: "note" },
  plotlines:     { label: "Narrative strands",       icon: "Plotlines", labelOne: "narrative strand" },
  worldbuilding: { label: "Worldbuilding", icon: "Sparkle",   labelOne: "article" },
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
  if (kind === "notes")         return item.title;
  if (kind === "worldbuilding") return item.title;
  return item.name;
}
function subOf(kind, item) {
  if (kind === "chapters")   return item.partId ? "from " + (project.parts.find((p) => p.id === item.partId)?.title || "removed part") : null;
  if (kind === "characters") return item.role;
  if (kind === "locations")  return item.kind;
  if (kind === "objects")    return item.kind;
  if (kind === "notes")      return `tag · ${item.tag}`;
  if (kind === "groups")     return `${(item.members || []).length} members`;
  if (kind === "worldbuilding") return item.category;
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
</script>

<template>
  <PaneHeader eyebrow="Project" title="Trash">
    <span class="t-muted" style="font-size:12px">
      {{ totalCount }} item{{ totalCount === 1 ? "" : "s" }}
    </span>
    <button v-if="totalCount" class="btn ghost" @click="emptyAll">
      <Icon name="Trash" :size="13" /> Empty trash
    </button>
  </PaneHeader>

  <div class="scrollarea" style="flex:1">
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
        <div class="trash-list">
          <div v-for="item in s.items" :key="item.id" class="trash-row">
            <div style="flex:1;min-width:0">
              <div class="trash-title">{{ titleOf(s.kind, item) }}</div>
              <div class="trash-meta">
                <span v-if="subOf(s.kind, item)">{{ subOf(s.kind, item) }}</span>
                <span v-if="subOf(s.kind, item)">·</span>
                <span>deleted {{ ago(item.deletedAt) }}</span>
              </div>
            </div>
            <button class="btn sm" @click="restore(s.kind, item.id)">
              <Icon name="Refresh" :size="11" /> Restore
            </button>
            <button class="btn sm ghost danger" @click="purge(s.kind, item.id, titleOf(s.kind, item))" title="Permanently delete">
              <Icon name="Trash" :size="11" />
            </button>
          </div>
        </div>
      </section>
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

.trash-list { display: flex; flex-direction: column; gap: 6px; }
.trash-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  background: var(--surface);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
}
.trash-row:hover { background: var(--surface-2); border-color: var(--border); }

.trash-title {
  font-family: var(--font-serif);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.005em;
}
.trash-meta {
  font-size: 11px;
  color: var(--muted);
  display: flex; gap: 6px; align-items: center;
  margin-top: 2px;
}

.btn.danger:hover { background: var(--danger-bg); color: var(--danger-ink); }
</style>
