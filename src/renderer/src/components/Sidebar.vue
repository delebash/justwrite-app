<script setup>
import { computed, ref, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUiStore } from "../stores/ui.js";
import { useProjectStore } from "../stores/project.js";
import { promptDialog, confirmDialog } from "../services/dialog.js";
import Icon from "./Icon.vue";

const ui = useUiStore();
const project = useProjectStore();
const router = useRouter();
const route = useRoute();

// ── Project switcher dropdown ────────────────────────────
const projectMenuOpen = ref(false);
const projectSwitcherEl = ref(null);

function toggleProjectMenu() { projectMenuOpen.value = !projectMenuOpen.value; }
function closeProjectMenu() { projectMenuOpen.value = false; }

function pickProject(id) {
  closeProjectMenu();
  if (id === project.activeProjectId) return;
  project.switchProject(id);
  router.push("/");
}

async function newProject() {
  closeProjectMenu();
  const values = await promptDialog({
    title: "New project",
    confirmLabel: "Create",
    fields: [
      { key: "title",  label: "Project title", placeholder: "e.g. The Cartographer's Daughter" },
      { key: "author", label: "Author (optional)", placeholder: "Your name", optional: true },
    ],
  });
  if (!values || !values.title) return;
  project.createProject({ title: values.title, author: values.author || "" });
  router.push("/");
}

async function deleteProject(id, title) {
  const yes = await confirmDialog({
    title: `Delete project "${title}"?`,
    message: "This removes it from this device permanently. Export a backup first if you might want it back.",
    confirmLabel: "Delete project",
    danger: true,
  });
  if (!yes) return;
  project.deleteProject(id);
}

function onDocClick(e) {
  if (!projectMenuOpen.value) return;
  if (projectSwitcherEl.value && !projectSwitcherEl.value.contains(e.target)) closeProjectMenu();
}
document.addEventListener("mousedown", onDocClick);
onBeforeUnmount(() => document.removeEventListener("mousedown", onDocClick));

const NAV = [
  { section: "Manuscript" },
  { id: "home",          label: "Home",          icon: "Home" },
  { id: "architecture",  label: "Architecture",  icon: "Building", expandable: "architecture", fixed: true },
  { id: "plotlines",     label: "Narrative strands", icon: "Plotlines", expandable: "plotlines" },
  { id: "chapters",      label: "Chapters",      icon: "Book",     expandable: "chapters" },
  { id: "search",        label: "Search",        icon: "Search",   kbd: "⌘F" },

  { section: "Story world" },
  { id: "characters",    label: "Characters",    icon: "Users",     expandable: "characters" },
  { id: "locations",     label: "Locations",     icon: "Pin",       expandable: "locations" },
  { id: "objects",       label: "Objects",       icon: "Cube",      expandable: "objects" },
  { id: "groups",        label: "Groups",        icon: "GroupIcon", expandable: "groups" },
  { id: "worldbuilding", label: "Worldbuilding", icon: "Sparkle",   expandable: "worldbuilding" },

  { section: "Planning" },
  { id: "timeline",  label: "Timeline",  icon: "Timeline" },
  { id: "notes",     label: "Notes",     icon: "Note",     expandable: "notes" },
  { id: "relations", label: "Relations", icon: "Network" },

  { section: "Audio" },
  { id: "studio",    label: "Studio",    icon: "Headphones" },

  { section: "Project" },
  { id: "analysis",  label: "Analysis",  icon: "Chart" },
  { id: "export",    label: "Export",    icon: "Export" },
  { id: "trash",     label: "Trash",     icon: "Trash" },
  { id: "settings",  label: "Settings",  icon: "Settings" },
];

const expandableChildren = computed(() => ({
  chapters: (project.parts || []).filter(Boolean).map((p) => ({
    partId: p.id,
    group: p.title,
    items: (p.chapters || []).filter((c) => c && c.id).map((c) => ({ id: c.id, label: c.title, num: c.num, status: c.status, words: c.words, partId: p.id })),
  })),
  characters: [
    { subgroupId: "main",      group: "Main",      items: project.characters.filter((c) => c.main).map((c) => ({ id: c.id, label: c.name, sub: c.role, subgroupId: "main" })) },
    { subgroupId: "secondary", group: "Secondary", items: project.characters.filter((c) => !c.main).map((c) => ({ id: c.id, label: c.name, sub: c.role, subgroupId: "secondary" })) },
  ],
  locations: [{ subgroupId: "all", items: project.locations.map((l) => ({ id: l.id, label: l.name, sub: l.kind, subgroupId: "all" })) }],
  objects:   [{ subgroupId: "all", items: project.objects.map((o) => ({ id: o.id, label: o.name, sub: o.kind, subgroupId: "all" })) }],
  plotlines: [{ subgroupId: "all", items: project.plotlines.map((s) => ({ id: s.id, label: s.name, subgroupId: "all" })) }],
  groups:    [{ subgroupId: "all", items: project.groups.map((g) => ({ id: g.id, label: g.name, color: g.color, subgroupId: "all" })) }],
  notes:     [{ subgroupId: "all", items: project.notes.map((n) => ({ id: n.id, label: n.title, sub: n.tag, subgroupId: "all" })) }],
  architecture: [{ subgroupId: "all", items: Object.values(project.architecture).filter(Boolean).map((d) => ({ id: d.id, label: d.title, sub: d.status, subgroupId: "all" })) }],
  worldbuilding: project.worldbuildingCategories.map((c) => ({
    subgroupId: c.id,
    group: c.label,
    items: project.worldbuilding.filter((a) => a.category === c.id).map((a) => ({ id: a.id, label: a.title, sub: a.status, subgroupId: c.id })),
  })),
}));

const activeSection = computed(() => String(route.name || "").toLowerCase());

function go(id) { router.push("/" + (id === "home" ? "" : id)); }
function clickParent(item) { item.expandable ? ui.toggleSection(item.id) : go(item.id); }
function clickChild(parentId, childId) { ui.select(parentId, childId); router.push(`/${parentId}/${childId}`); }

async function addItem(parentId) {
  const META = {
    characters:    { title: "New character", label: "Character name", confirmLabel: "Create character" },
    locations:     { title: "New location",  label: "Location name",  confirmLabel: "Create location" },
    objects:       { title: "New object",    label: "Object name",    confirmLabel: "Create object" },
    groups:        { title: "New group",     label: "Group name",     confirmLabel: "Create group" },
    worldbuilding: { title: "New article",   label: "Article title",  confirmLabel: "Create article" },
    plotlines:     { title: "New narrative strand",    label: "Narrative strand name",    confirmLabel: "Create narrative strand" },
    notes:         { title: "New note",      label: "Note title",     confirmLabel: "Create note" },
  };
  const meta = META[parentId] || { title: "New item", label: "Name", confirmLabel: "Create" };
  const name = await promptDialog(meta);
  if (!name) return;
  let id;
  switch (parentId) {
    case "characters":    id = project.addCharacter({ name }); break;
    case "locations":     id = project.addLocation({ name }); break;
    case "objects":       id = project.addObject({ name }); break;
    case "groups":        id = project.addGroup({ name }); break;
    case "worldbuilding": id = project.addWorldbuilding({ title: name }); break;
    case "plotlines":     id = project.addPlotline({ name }); break;
    case "notes":         id = project.addNote({ title: name }); break;
  }
  if (id) { ui.select(parentId, id); router.push(`/${parentId}/${id}`); }
}

// ── Parts & chapter creation ─────────────────────────────
// Chapters can't be added at the section level any more — every chapter
// belongs to a part. The chapters filter row's `+` button now creates a
// new part, and each part header reveals per-part actions on hover for
// adding a chapter and deleting the part. Renaming is inline.
async function addPart() {
  const title = await promptDialog({
    title: "New part",
    label: "Part title",
    placeholder: `e.g. Part ${project.parts.length + 1} — The Reckoning`,
    confirmLabel: "Create part",
  });
  if (!title) return;
  project.addPart({ title });
}
async function addChapterInPart(partId) {
  const title = await promptDialog({
    title: "New chapter",
    label: "Chapter title",
    placeholder: "e.g. The first crossing",
    confirmLabel: "Create chapter",
  });
  if (!title) return;
  const id = project.addChapter({ title, partId });
  if (id) { ui.select("chapters", id); router.push(`/chapters/${id}`); }
}
async function deletePart(partId, partTitle) {
  if (project.parts.length <= 1) return;  // refuse to leave the project partless
  const part = project.parts.find((p) => p.id === partId);
  if (!part) return;
  const count = part.chapters.length;
  const neighborIdx = project.parts.findIndex((p) => p.id === partId);
  const neighbor = neighborIdx > 0 ? project.parts[neighborIdx - 1] : project.parts[neighborIdx + 1];
  const message = count
    ? `Its ${count} chapter${count === 1 ? "" : "s"} will move to "${neighbor.title}".`
    : "This part has no chapters.";
  const yes = await confirmDialog({
    title: `Delete "${partTitle}"?`,
    message,
    confirmLabel: "Delete part",
    danger: true,
  });
  if (!yes) return;
  project.removePart(partId);
}
function updatePartTitle(id, value) { project.updatePart(id, { title: value }); }

// ── Scenes (under each chapter row) ─────────────────────
function scenesForChapter(chapterId) {
  // Filter out any undefined entries that could sneak in via a corrupted
  // snapshot — they'd crash :key="scn.id" / @click="...scn.id" otherwise.
  return (project.scenesFor(chapterId) || []).filter((s) => s && s.id);
}
function isChapterExpanded(chapterId) { return !!ui.expanded[`chapter:${chapterId}`]; }
function toggleChapterExpand(chapterId) { ui.toggleSection(`chapter:${chapterId}`); }
function clickScene(chapterId, sceneId) {
  ui.select("chapters", chapterId);
  router.push(`/chapters/${chapterId}/${sceneId}`);
}
async function addSceneToChapter(chapterId) {
  const values = await promptDialog({
    title: "New scene",
    confirmLabel: "Add scene",
    fields: [{
      key: "title",
      label: "Scene title",
      placeholder: "Leave blank for an untitled scene",
      optional: true,
    }],
  });
  if (!values) return;
  const title = (values.title || "").trim();
  const sceneId = project.addScene(chapterId, title ? { title } : {});
  ui.expanded = { ...ui.expanded, [`chapter:${chapterId}`]: true };
  ui.select("chapters", chapterId);
  router.push(`/chapters/${chapterId}/${sceneId}`);
}
// ── Resize handle ───────────────────────────────────────
// Drag the 4px strip on the sidebar's right edge to resize. While
// dragging we listen on window so the cursor can leave the strip without
// losing the drag.
function onResizeStart(e) {
  if (ui.sidebarCollapsed) return;
  e.preventDefault();
  const startX = e.clientX;
  const startW = ui.sidebarWidth;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  // Drop the .app's grid-template-columns transition while dragging so
  // each mousemove updates the layout immediately, not over 220ms.
  document.documentElement.classList.add("sidebar-resizing");
  function onMove(ev) { ui.setSidebarWidth(startW + (ev.clientX - startX)); }
  function onUp() {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    document.documentElement.classList.remove("sidebar-resizing");
  }
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

// Scene drag-and-drop reorder (within a single chapter). Direction-based
// positioning: hovering ANY non-self scene drops the dragged scene to the
// *other side* of the target — that's the only side that actually moves it.
const sceneDrag = ref(null);   // { chapterId, id }
const sceneDrop = ref(null);   // { chapterId, id }
function onSceneDragStart(chapterId, sceneId, e) {
  sceneDrag.value = { chapterId, id: sceneId };
  e.dataTransfer.effectAllowed = "move";
  try { e.dataTransfer.setData("text/plain", sceneId); } catch {}
}
function onSceneDragOver(chapterId, sceneId, e) {
  const d = sceneDrag.value;
  if (!d || d.id === sceneId || d.chapterId !== chapterId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  if (sceneDrop.value?.chapterId !== chapterId || sceneDrop.value?.id !== sceneId) {
    sceneDrop.value = { chapterId, id: sceneId };
  }
}
function onSceneDrop(chapterId, targetId) {
  const d = sceneDrag.value;
  sceneDrag.value = null;
  sceneDrop.value = null;
  if (!d || d.chapterId !== chapterId || d.id === targetId) return;
  const list = project.scenesFor(chapterId);
  const original = list.map((s) => s.id);
  const draggedIdx = original.indexOf(d.id);
  const targetIdx  = original.indexOf(targetId);
  if (draggedIdx < 0 || targetIdx < 0) return;
  const ids = original.filter((id) => id !== d.id);
  const at = ids.indexOf(targetId);
  // If dragged was above target in original order, dropping it AFTER the
  // target is the only side that actually moves it; vice versa.
  const insertAt = draggedIdx < targetIdx ? at + 1 : at;
  ids.splice(insertAt, 0, d.id);
  if (ids.every((id, i) => id === original[i])) return;  // no-op safeguard
  project.reorderScenes(chapterId, ids);
}
function onSceneDragEnd() { sceneDrag.value = null; sceneDrop.value = null; }
function sceneDropClass(chapterId, sceneId) {
  if (!sceneDrop.value || sceneDrop.value.chapterId !== chapterId || sceneDrop.value.id !== sceneId) return null;
  if (!sceneDrag.value) return null;
  const list = project.scenesFor(chapterId);
  const draggedIdx = list.findIndex((s) => s.id === sceneDrag.value.id);
  const targetIdx  = list.findIndex((s) => s.id === sceneId);
  if (draggedIdx < 0 || targetIdx < 0) return null;
  return draggedIdx < targetIdx ? "drop-after" : "drop-before";
}

async function deleteScene(chapterId, scene) {
  const list = project.scenesFor(chapterId);
  if (list.length <= 1) return;
  const yes = await confirmDialog({
    title: scene.title ? `Delete scene "${scene.title}"?` : "Delete this scene?",
    message: "The scene's prose will be discarded. The chapter keeps its other scenes.",
    confirmLabel: "Delete scene",
    danger: true,
  });
  if (!yes) return;
  project.removeScene(chapterId, scene.id);
}

function filteredGroups(parentId) {
  const filter = (ui.filters[parentId] || "").trim().toLowerCase();
  const groups = expandableChildren.value[parentId] || [];
  if (!filter) return groups;
  return groups
    .map((g) => ({ ...g, items: g.items.filter((c) => c.label.toLowerCase().includes(filter)) }))
    .filter((g) => g.items.length > 0);
}

// ── Drag-and-drop reorder ────────────────────────────────────────
// We support reordering parts (within the manuscript) and chapters
// (within a part or across parts). Drag state is module-local rather
// than going through dataTransfer so handlers can read it from any
// node without the awkward dataTransfer string contract.
//
// `kind` is "part" or "chapter"; "id" is the entity being dragged.
// "fromPartId" tracks which part a chapter started in so we can spot
// no-op drops. `dropTarget` mirrors the same shape for the row the
// cursor is currently over, plus a "position" of "before" or "after"
// derived from the cursor's Y position inside the row.
const drag = ref(null);             // { kind, id, fromPartId? }
const dropTarget = ref(null);       // { kind, id, position }

function onDragStart(kind, id, e, ctx = {}) {
  drag.value = { kind, id, ...ctx };
  // Firefox needs *some* dataTransfer payload or dragstart is cancelled.
  e.dataTransfer.effectAllowed = "move";
  try { e.dataTransfer.setData("text/plain", id); } catch {}
}
function onDragEnd() {
  drag.value = null;
  dropTarget.value = null;
}

// Part header is a dual drop target:
//   • Drag a part onto it → reorder parts (before/after based on cursor Y)
//   • Drag a chapter onto it → append the chapter to this part
function onDragOverPart(partId, e) {
  const d = drag.value;
  if (!d) return;
  if (d.kind === "part") {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const r = e.currentTarget.getBoundingClientRect();
    const position = (e.clientY - r.top) < (r.height / 2) ? "before" : "after";
    dropTarget.value = { kind: "part", id: partId, position };
  } else if (d.kind === "chapter") {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    dropTarget.value = { kind: "partHead", id: partId, position: "into" };
  }
}
function onDropPart(partId) {
  const d = drag.value, t = dropTarget.value;
  onDragEnd();
  if (!d) return;
  if (d.kind === "part") {
    if (d.id === partId) return;
    const ids = project.parts.map((p) => p.id).filter((id) => id !== d.id);
    let idx = ids.indexOf(partId);
    if (idx < 0) idx = ids.length;
    if (t?.position === "after") idx += 1;
    ids.splice(idx, 0, d.id);
    project.reorderParts(ids);
  } else if (d.kind === "chapter") {
    if (d.fromPartId === partId) return;
    project.moveChapter(d.id, partId, null);
  }
}

// Chapter row only accepts other chapters.
function onDragOverChapter(chapterId, e) {
  const d = drag.value;
  if (!d || d.kind !== "chapter") return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const r = e.currentTarget.getBoundingClientRect();
  const position = (e.clientY - r.top) < (r.height / 2) ? "before" : "after";
  dropTarget.value = { kind: "chapter", id: chapterId, position };
}
function onDropChapter(targetChapterId, targetPartId) {
  const d = drag.value, t = dropTarget.value;
  onDragEnd();
  if (!d || d.kind !== "chapter" || d.id === targetChapterId) return;
  const targetPart = project.parts.find((p) => p.id === targetPartId);
  if (!targetPart) return;
  if (d.fromPartId === targetPartId) {
    const ids = targetPart.chapters.map((c) => c.id).filter((id) => id !== d.id);
    let idx = ids.indexOf(targetChapterId);
    if (idx < 0) idx = ids.length;
    if (t?.position === "after") idx += 1;
    ids.splice(idx, 0, d.id);
    project.reorderChaptersInPart(targetPartId, ids);
  } else {
    const insertBefore = t?.position === "after"
      ? targetPart.chapters[targetPart.chapters.findIndex((c) => c.id === targetChapterId) + 1]?.id || null
      : targetChapterId;
    project.moveChapter(d.id, targetPartId, insertBefore);
  }
}

// Helper for the template — does this row have an active drop indicator?
function dropClass(kind, id) {
  if (!dropTarget.value) return null;
  if (dropTarget.value.kind !== kind || dropTarget.value.id !== id) return null;
  return `drop-${dropTarget.value.position}`;
}

// ── Item-level drag-and-drop (plotlines, groups, characters, etc.) ──
// Simpler than the parts/chapters tree: each section's items live in
// one flat array. We restrict drops to items in the same `subgroupId`
// (so e.g. a Main character can't be reordered into the Secondary
// group, and a Geography article can't slide into History) — those
// memberships are still managed through their dedicated UI controls.
//
// Direction-based positioning (same trick as scene DnD): hovering any
// non-self item drops the dragged item to the *other side* of the
// target, because that's the only side that actually moves it. No
// top-half/bottom-half precision, no no-op edge cases.
const itemDrag = ref(null);   // { section, id, subgroupId }
const itemDrop = ref(null);   // { section, id }

function sectionFlatList(section) {
  switch (section) {
    case "plotlines":     return project.plotlines;
    case "groups":        return project.groups;
    case "characters":    return project.characters;
    case "objects":       return project.objects;
    case "locations":     return project.locations;
    case "notes":         return project.notes;
    case "worldbuilding": return project.worldbuilding;
    default:              return [];
  }
}
function sectionReorder(section, ids) {
  switch (section) {
    case "plotlines":     project.reorderPlotlines(ids); break;
    case "groups":        project.reorderGroups(ids); break;
    case "characters":    project.reorderCharacters(ids); break;
    case "objects":       project.reorderObjects(ids); break;
    case "locations":     project.reorderLocations(ids); break;
    case "notes":         project.reorderNotes(ids); break;
    case "worldbuilding": project.reorderWorldbuilding(ids); break;
  }
}

function onItemDragStart(section, id, subgroupId, e) {
  itemDrag.value = { section, id, subgroupId };
  e.dataTransfer.effectAllowed = "move";
  try { e.dataTransfer.setData("text/plain", id); } catch {}
}
function onItemDragOver(section, id, subgroupId, e) {
  const d = itemDrag.value;
  if (!d) return;
  if (d.section !== section) return;
  if (d.id === id) return;
  if (d.subgroupId !== subgroupId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  if (itemDrop.value?.section !== section || itemDrop.value?.id !== id) {
    itemDrop.value = { section, id };
  }
}
function onItemDrop(section, targetId) {
  const d = itemDrag.value;
  itemDrag.value = null;
  itemDrop.value = null;
  if (!d || d.section !== section || d.id === targetId) return;
  const list = sectionFlatList(section);
  const original = list.map((it) => it.id);
  const draggedIdx = original.indexOf(d.id);
  const targetIdx  = original.indexOf(targetId);
  if (draggedIdx < 0 || targetIdx < 0) return;
  const ids = original.filter((id) => id !== d.id);
  const at = ids.indexOf(targetId);
  // If dragged sat *above* the target in state order, putting it
  // "after" target is the only side that actually moves it; vice versa.
  const insertAt = draggedIdx < targetIdx ? at + 1 : at;
  ids.splice(insertAt, 0, d.id);
  if (ids.every((id, i) => id === original[i])) return;  // no-op safeguard
  sectionReorder(section, ids);
}
function onItemDragEnd() {
  itemDrag.value = null;
  itemDrop.value = null;
}
function itemDropClass(section, id) {
  if (!itemDrop.value || itemDrop.value.section !== section || itemDrop.value.id !== id) return null;
  // Render the indicator at the side the drop will land on. We can
  // recover that here from the dragged item's original index.
  if (!itemDrag.value) return null;
  const list = sectionFlatList(section);
  const draggedIdx = list.findIndex((it) => it.id === itemDrag.value.id);
  const targetIdx  = list.findIndex((it) => it.id === id);
  if (draggedIdx < 0 || targetIdx < 0) return null;
  return draggedIdx < targetIdx ? "drop-after item-drop-target" : "drop-before item-drop-target";
}
</script>

<template>
  <aside class="sidebar" :class="{ collapsed: ui.sidebarCollapsed }" v-if="!ui.sidebarCollapsed">
    <div class="sidebar-resize" title="Drag to resize" @mousedown="onResizeStart" />
    <div class="brand">
      <div class="brand-mark">J</div>
      <div style="flex:1;min-width:0">
        <div class="brand-name">JustWrite</div>
        <div class="brand-sub">v0.1 · local</div>
      </div>
      <button class="btn ghost icon" @click="ui.toggleSidebar"><Icon name="SidebarToggle" :size="14" /></button>
    </div>
    <div class="project-switcher-wrap" ref="projectSwitcherEl">
      <button class="project-switcher" :class="{ open: projectMenuOpen }" @click="toggleProjectMenu">
        <div style="min-width:0">
          <div class="ttl">{{ project.project.title }}</div>
          <div class="by">by {{ project.project.author || "—" }}</div>
        </div>
        <Icon name="ChevDown" :size="14" />
      </button>
      <div v-if="projectMenuOpen" class="project-menu">
        <div class="project-menu-head">Projects</div>
        <div class="project-menu-list scrollarea">
          <div v-for="p in project.projectsList" :key="p.id"
            class="project-menu-row"
            :class="{ active: p.id === project.activeProjectId }"
            @click="pickProject(p.id)">
            <div style="min-width:0;flex:1">
              <div class="ttl">{{ p.title || "Untitled" }}</div>
              <div class="by">{{ p.author ? `by ${p.author}` : "no author" }}</div>
            </div>
            <Icon v-if="p.id === project.activeProjectId" name="Check" :size="13" />
            <button v-else class="project-menu-del" :title="`Delete ${p.title}`"
              @click.stop="deleteProject(p.id, p.title)">
              <Icon name="Trash" :size="12" />
            </button>
          </div>
          <div v-if="!project.projectsList.length" class="project-menu-empty">No projects yet.</div>
        </div>
        <button class="project-menu-new" @click="newProject">
          <Icon name="Plus" :size="13" /> New project…
        </button>
      </div>
    </div>
    <div class="nav-scroll scrollarea">
      <template v-for="n in NAV" :key="n.section || n.id">
        <div v-if="n.section" class="nav-section">{{ n.section }}</div>
        <div v-else class="nav-block">
          <button class="nav-item expandable" :class="{ active: activeSection === n.id.toLowerCase() }" @click="clickParent(n)">
            <span class="nav-icon"><Icon :name="n.icon" :size="15" /></span>
            <span class="nav-label">{{ n.label }}</span>
            <span v-if="n.kbd" class="kbd-pill">{{ n.kbd }}</span>
            <span v-if="n.expandable" class="nav-chev" :class="{ open: ui.expanded[n.id] }">
              <Icon name="ChevRight" :size="12" />
            </span>
          </button>
          <div v-if="n.expandable && ui.expanded[n.id]" class="nav-children">
            <div class="nav-filter">
              <Icon name="Search" :size="11" />
              <input :placeholder="`Filter ${n.label.toLowerCase()}…`"
                :value="ui.filters[n.id] || ''"
                @input="ui.setFilter(n.id, $event.target.value)"
                @click.stop />
              <button v-if="n.expandable === 'chapters'" class="nav-add" title="New part"
                @click.stop="addPart">
                <Icon name="Plus" :size="11" />
              </button>
              <button v-else-if="!n.fixed" class="nav-add" :title="`New ${n.label.toLowerCase().replace(/s$/, '')}`"
                @click.stop="addItem(n.expandable)">
                <Icon name="Plus" :size="11" />
              </button>
            </div>
            <!-- Chapters section: parts + chapters with drag-to-reorder. -->
            <template v-if="n.expandable === 'chapters'">
              <template v-for="g in filteredGroups(n.id)" :key="g.partId">
                <div class="nav-subgroup nav-part-row"
                  :class="[dropClass('part', g.partId), dropClass('partHead', g.partId)]"
                  draggable="true"
                  @dragstart="onDragStart('part', g.partId, $event)"
                  @dragover="onDragOverPart(g.partId, $event)"
                  @drop="onDropPart(g.partId)"
                  @dragend="onDragEnd">
                  <Icon name="DragHandle" :size="11" class="drag-handle" />
                  <input class="nav-part-title"
                    :value="g.group"
                    :title="`Rename ${g.group}`"
                    placeholder="Untitled part"
                    @input="updatePartTitle(g.partId, $event.target.value)"
                    @mousedown.stop
                    @click.stop
                    @keydown.enter.prevent="$event.target.blur()" />
                  <div class="part-actions">
                    <button class="part-action" title="Add chapter to this part"
                      @click.stop="addChapterInPart(g.partId)">
                      <Icon name="Plus" :size="11" />
                    </button>
                    <button v-if="project.parts.length > 1" class="part-action part-action-danger" title="Delete this part"
                      @click.stop="deletePart(g.partId, g.group)">
                      <Icon name="Trash" :size="11" />
                    </button>
                  </div>
                </div>
                <template v-for="c in g.items" :key="c.id">
                  <div class="nav-child chapter-row"
                    :class="[{ sel: ui.selections[n.id] === c.id && activeSection === n.id }, dropClass('chapter', c.id)]"
                    style="grid-template-columns: auto auto 1fr auto auto"
                    draggable="true"
                    @click="clickChild(n.id, c.id)"
                    @dragstart.stop="onDragStart('chapter', c.id, $event, { fromPartId: c.partId })"
                    @dragover="onDragOverChapter(c.id, $event)"
                    @drop="onDropChapter(c.id, c.partId)"
                    @dragend="onDragEnd">
                    <button class="chapter-chev" :class="{ open: isChapterExpanded(c.id) }"
                      :title="isChapterExpanded(c.id) ? 'Collapse scenes' : 'Show scenes'"
                      @mousedown.stop
                      @click.stop="toggleChapterExpand(c.id)">
                      <Icon name="ChevRight" :size="10" />
                    </button>
                    <span class="nav-child-num">{{ c.num }}</span>
                    <span class="status-dot" :class="c.status" style="width:6px;height:6px" />
                    <span class="nav-child-label">{{ c.label }}</span>
                    <span class="nav-child-sub t-num">{{ c.words ? c.words.toLocaleString() : '' }}</span>
                    <button class="chapter-add-scene" title="Add scene to this chapter"
                      @click.stop="addSceneToChapter(c.id)">
                      <Icon name="Plus" :size="11" />
                    </button>
                  </div>
                  <template v-if="isChapterExpanded(c.id)">
                    <div v-for="(scn, si) in scenesForChapter(c.id)" :key="scn.id"
                      class="nav-scene"
                      :class="[
                        { sel: route.params.sceneId === scn.id && route.params.id === c.id && activeSection === 'chapters' },
                        sceneDropClass(c.id, scn.id),
                      ]"
                      draggable="true"
                      @click.stop="clickScene(c.id, scn.id)"
                      @dragstart.stop="onSceneDragStart(c.id, scn.id, $event)"
                      @dragover="onSceneDragOver(c.id, scn.id, $event)"
                      @drop="onSceneDrop(c.id, scn.id)"
                      @dragend="onSceneDragEnd">
                      <span class="scene-bullet">{{ si + 1 }}</span>
                      <span class="scene-label">{{ scn.title || `Scene ${si + 1}` }}</span>
                      <button v-if="scenesForChapter(c.id).length > 1"
                        class="scene-delete" title="Delete scene"
                        @mousedown.stop
                        @click.stop="deleteScene(c.id, scn)">
                        <Icon name="Trash" :size="10" />
                      </button>
                    </div>
                  </template>
                </template>
              </template>
              <div v-if="filteredGroups(n.id).length === 0" class="nav-empty">No chapters match</div>
            </template>

            <!-- Every other section keeps its original rendering, plus
                 item-level drag-and-drop reorder (restricted within the
                 item's subgroup so cross-group memberships are unchanged). -->
            <template v-else>
              <template v-for="(g, gi) in filteredGroups(n.id)" :key="gi">
                <div v-if="g.group" class="nav-subgroup">{{ g.group }}</div>
                <div v-for="c in g.items" :key="c.id"
                  class="nav-child"
                  :class="[{ sel: ui.selections[n.id] === c.id && activeSection === n.id }, n.fixed ? null : itemDropClass(n.expandable, c.id)]"
                  :draggable="!n.fixed"
                  @click="clickChild(n.id, c.id)"
                  @dragstart.stop="!n.fixed && onItemDragStart(n.expandable, c.id, c.subgroupId, $event)"
                  @dragover="!n.fixed && onItemDragOver(n.expandable, c.id, c.subgroupId, $event)"
                  @drop="!n.fixed && onItemDrop(n.expandable, c.id)"
                  @dragend="!n.fixed && onItemDragEnd()">
                  <span v-if="c.color"
                    class="nav-child-dot"
                    :style="`background:${c.color};border-radius:2px`" />
                  <span v-else
                    class="nav-child-dot"
                    style="background:var(--border-strong);border-radius:50%" />
                  <span class="nav-child-label">{{ c.label }}</span>
                  <span v-if="c.sub && !c.color" class="nav-child-sub">{{ c.sub }}</span>
                </div>
              </template>
              <div v-if="filteredGroups(n.id).length === 0" class="nav-empty">No {{ n.label.toLowerCase() }} match</div>
            </template>
          </div>
        </div>
      </template>
    </div>
    <div class="sidebar-footer">
      <div class="avatar">MH</div>
      <div class="meta">
        <b>Mira Halden</b>
        <span>Autosaved · {{ project.project.lastSaved }}</span>
      </div>
    </div>
  </aside>
  <aside v-else class="sidebar collapsed">
    <div class="brand-mini"><div class="brand-mark">J</div></div>
    <button class="rail-toggle" @click="ui.toggleSidebar"><Icon name="SidebarToggle" :size="15" /></button>
    <div style="height:8px" />
    <button v-for="n in NAV.filter(x => x.id)" :key="n.id"
      class="rail-item" :class="{ active: activeSection === n.id.toLowerCase() }"
      :title="n.label" @click="go(n.id)">
      <Icon :name="n.icon" :size="16" />
    </button>
    <div style="flex:1" />
    <div class="rail-avatar">MH</div>
  </aside>
</template>

<style>
.project-switcher-wrap { position: relative; }
.project-switcher { cursor: pointer; text-align: left; width: calc(100% - 20px); }
.project-switcher:hover { border-color: var(--border-strong); }
.project-switcher.open { border-color: var(--accent); }
.project-switcher.open svg { transform: rotate(180deg); }
.project-switcher svg { transition: transform 0.15s ease; }

.project-menu {
  position: absolute;
  top: calc(100% + 2px);
  left: 10px;
  right: 10px;
  z-index: 50;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-2, 0 6px 24px rgba(0,0,0,0.12));
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.project-menu-head {
  padding: 8px 10px 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.project-menu-list {
  max-height: 280px;
  overflow-y: auto;
  padding: 2px 0;
}
.project-menu-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  cursor: pointer;
  border-top: 1px solid transparent;
  border-bottom: 1px solid transparent;
}
.project-menu-row:hover { background: var(--surface-2); }
.project-menu-row.active { background: var(--accent-soft); color: var(--accent-ink); }
.project-menu-row .ttl { font-size: 12.5px; font-weight: 600; color: var(--ink); letter-spacing: -0.01em; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.project-menu-row.active .ttl { color: var(--accent-ink); }
.project-menu-row .by  { font-size: 10.5px; color: var(--muted); margin-top: 1px; }
.project-menu-row svg { color: var(--accent); flex-shrink: 0; }

.project-menu-del {
  appearance: none;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 3px 5px;
  cursor: pointer;
  color: var(--muted);
  opacity: 0;
  transition: opacity 0.1s ease;
}
.project-menu-row:hover .project-menu-del { opacity: 1; }
.project-menu-del:hover { background: var(--surface-3); color: var(--danger-ink, var(--ink)); border-color: var(--border); }

.project-menu-empty {
  padding: 10px;
  font-size: 12px;
  color: var(--muted);
  font-style: italic;
  text-align: center;
}

.project-menu-new {
  appearance: none;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 10px;
  background: var(--surface-2);
  border: none;
  border-top: 1px solid var(--border);
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--ink);
  text-align: left;
}
.project-menu-new:hover { background: var(--surface-3); }
.project-menu-new svg { color: var(--accent); }
</style>
