<script setup>
// Global command palette — ⌘P (Ctrl+P on Windows/Linux).
//
// Three sources feed the result list:
//   1. Static navigation entries (Home, Chapters, Studio, …)
//   2. Project entities (chapters, characters, locations, objects,
//      groups, notes, worldbuilding articles, strands)
//   3. Global actions (New chapter / character / part, Save version, …)
//
// Matching is a forgiving substring score: every word in the query must
// appear in the item's haystack; case-insensitive. Score combines a
// prefix bonus and a word-start bonus so "har" ranks "Halvard" above
// "the inner harbour".

import { ref, computed, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useVersionsStore } from "../stores/versions.js";
import { promptDialog, openHelp } from "@delebash/llm-ui";
import { HELP_TOC } from "../services/helpDocs.js";
import { Icon } from "@delebash/llm-ui";

const router = useRouter();
const project = useProjectStore();
const ui = useUiStore();
const versions = useVersionsStore();

const open = ref(false);
const query = ref("");
const highlighted = ref(0);
const inputEl = ref(null);

// ─── Public open / close ────────────────────────────────────────────
function openPalette() {
  open.value = true;
  query.value = "";
  highlighted.value = 0;
  nextTick(() => inputEl.value?.focus());
}
function closePalette() {
  open.value = false;
}
defineExpose({ open: openPalette, close: closePalette });

// ─── Item sources ───────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "nav:home",     label: "Home",                 sublabel: "Manuscript overview", icon: "Home",       to: "/" },
  { id: "nav:ask",      label: "Ask the book",         sublabel: "Manuscript chat · ⌘J",icon: "Sparkle",    run: () => ui.openChatPanel() },
  { id: "nav:chapters", label: "Chapters",             sublabel: "Outline + editor",    icon: "Book",       to: "/chapters" },
  { id: "nav:search",   label: "Search",               sublabel: "Find across project", icon: "Search",     to: "/search" },
  { id: "nav:plot",     label: "Plot board",           sublabel: "Strands + beats",     icon: "Grid",       to: "/plot" },
  { id: "nav:strands",  label: "Narrative strands",    sublabel: "Storylines",          icon: "Strands",    to: "/strands" },
  { id: "nav:timeline", label: "Timeline",             sublabel: "Events",              icon: "Timeline",   to: "/timeline" },
  { id: "nav:notes",    label: "Notes",                sublabel: "Free-form notes",     icon: "Note",       to: "/notes" },
  { id: "nav:relations",label: "Relations",            sublabel: "Network view",        icon: "Network",    to: "/relations" },
  { id: "nav:characters",label: "Characters",          sublabel: "Cast list",           icon: "Users",      to: "/characters" },
  { id: "nav:locations",label: "Locations",            sublabel: "Places",              icon: "Pin",        to: "/locations" },
  { id: "nav:objects",  label: "Objects",              sublabel: "Items",               icon: "Cube",       to: "/objects" },
  { id: "nav:groups",   label: "Groups",               sublabel: "Factions",            icon: "GroupIcon",  to: "/groups" },
  { id: "nav:world",    label: "Worldbuilding",        sublabel: "Articles",            icon: "Sparkle",    to: "/worldbuilding" },
  { id: "nav:arch",     label: "Architecture",         sublabel: "Setting docs",        icon: "Building",   to: "/architecture" },
  { id: "nav:analysis", label: "Analysis",             sublabel: "Pace, style, heatmap",icon: "Chart",      to: "/analysis" },
  { id: "nav:import",   label: "Import",               sublabel: "DOCX / EPUB / TXT",   icon: "Plus",       to: "/import" },
  { id: "nav:export",   label: "Export",               sublabel: "PDF / DOCX / EPUB",   icon: "Export",     to: "/export" },
  { id: "nav:ai",       label: "AI Settings",          sublabel: "Providers · features · usage", icon: "Sparkle", to: "/ai" },
  { id: "nav:trash",    label: "Trash",                sublabel: "Restore deleted",     icon: "Trash",      to: "/trash" },
  { id: "nav:settings", label: "Settings",             sublabel: "Preferences",         icon: "Settings",   to: "/settings" },
  { id: "nav:usage",    label: "AI usage",             sublabel: "Tokens + cost ledger",icon: "Chart",      to: "/settings/usage" },
];

const ENTITY_ITEMS = computed(() => {
  const out = [];
  for (const c of project.allChapters) {
    out.push({
      id: `ch:${c.id}`,
      label: c.title || `Chapter ${c.num}`,
      sublabel: `Chapter ${c.num} · ${c.partTitle || ""}`,
      icon: "Book",
      to: `/chapters/${c.id}`,
    });
  }
  for (const x of project.characters) out.push({ id: `c:${x.id}`,  label: x.name, sublabel: `Character${x.role ? ` · ${x.role}` : ""}`, icon: "Users",     to: `/characters/${x.id}` });
  for (const x of project.locations)  out.push({ id: `l:${x.id}`,  label: x.name, sublabel: `Location${x.kind ? ` · ${x.kind}` : ""}`,  icon: "Pin",       to: `/locations/${x.id}` });
  for (const x of project.objects)    out.push({ id: `o:${x.id}`,  label: x.name, sublabel: `Object${x.kind ? ` · ${x.kind}` : ""}`,    icon: "Cube",      to: `/objects/${x.id}` });
  for (const x of project.groups)     out.push({ id: `g:${x.id}`,  label: x.name, sublabel: "Group",                                    icon: "GroupIcon", to: `/groups/${x.id}` });
  for (const x of project.notes)      out.push({ id: `n:${x.id}`,  label: x.title, sublabel: `Note · ${x.tag || ""}`,                   icon: "Note",      to: `/notes/${x.id}` });
  for (const x of project.worldbuilding) out.push({ id: `w:${x.id}`, label: x.title, sublabel: `Worldbuilding · ${x.category || ""}`,   icon: "Sparkle",   to: `/worldbuilding/${x.id}` });
  for (const x of project.strands)    out.push({ id: `s:${x.id}`,  label: x.name, sublabel: "Strand",                                   icon: "Strands",   to: `/strands/${x.id}` });
  return out;
});

// ─── Global actions ─────────────────────────────────────────────────
// `run` is fired AFTER the palette closes so the action can open its
// own dialog without competing for focus with the palette input.
const ACTION_ITEMS = computed(() => {
  const list = [
    { id: "act:newChapter", label: "New chapter",      sublabel: "Action",       icon: "Plus", keywords: "create add",
      run: () => {
        const id = project.addChapter({});
        ui.select("chapters", id);
        router.push(`/chapters/${id}?new=1`);
      } },
    { id: "act:newPart", label: "New part…",           sublabel: "Action",       icon: "Plus",
      run: async () => {
        const title = await promptDialog({ title: "New part", label: "Part title", confirmLabel: "Create part" });
        if (title) project.addPart({ title });
      } },
    { id: "act:newCharacter", label: "New character",  sublabel: "Action",       icon: "Plus",
      run: () => { const id = project.addCharacter(); router.push(`/characters/${id}?new=1`); } },
    { id: "act:newLocation", label: "New location",    sublabel: "Action",       icon: "Plus",
      run: () => { const id = project.addLocation(); router.push(`/locations/${id}?new=1`); } },
    { id: "act:newObject", label: "New object",        sublabel: "Action",       icon: "Plus",
      run: () => { const id = project.addObject(); router.push(`/objects/${id}?new=1`); } },
    { id: "act:newNote", label: "New note",            sublabel: "Action",       icon: "Plus",
      run: () => { const id = project.addNote(); router.push(`/notes/${id}?new=1`); } },
    { id: "act:newStrand", label: "New strand",        sublabel: "Action",       icon: "Plus",
      run: () => { const id = project.addStrand(); router.push(`/strands/${id}?new=1`); } },
    { id: "act:newWorldbuilding", label: "New worldbuilding article", sublabel: "Action", icon: "Plus",
      run: () => { const id = project.addWorldbuilding(); router.push(`/worldbuilding/${id}`); } },
    { id: "act:findReplace", label: "Find & replace in prose…", sublabel: "Action · ⌘⇧F", icon: "Replace", keywords: "search substitute",
      run: () => ui.openProjectReplace() },
    { id: "act:saveVersion", label: "Save chapter version…", sublabel: "Action", icon: "History",
      run: async () => {
        const chId = ui.selections.chapters;
        if (!chId) { ui.showToast({ message: "Open a chapter first to save its version." }); return; }
        const label = await promptDialog({ title: "Save version", label: "Version label (optional)", confirmLabel: "Save" });
        if (label === null) return;
        versions.saveVersion(chId, label || "");
        const title = (project.chapterById(chId)?.title || "").trim();
        const clip = (s, n = 30) => s.length > n ? `${s.slice(0, n - 1)}…` : s;
        const chapter = title ? clip(title) : "this chapter";
        const message = label
          ? `Saved “${clip(label.trim())}” — ${chapter}`
          : `Saved version of ${chapter}`;
        ui.showToast({ message });
      } },
    { id: "act:toggleSidebar", label: "Toggle sidebar", sublabel: "Action · ⌘\\", icon: "SidebarToggle",
      run: () => ui.toggleSidebar() },
    { id: "act:undo", label: "Undo",                   sublabel: "Action · ⌘Z",  icon: "Refresh",
      run: () => project.undoFor(router.currentRoute.value.meta.undoDomains || []) },
    { id: "act:redo", label: "Redo",                   sublabel: "Action · ⌘Y",  icon: "Refresh",
      run: () => project.redoFor(router.currentRoute.value.meta.undoDomains || []) },
    { id: "act:shortcuts", label: "Keyboard shortcuts", sublabel: "Action · ⌘/",  icon: "Help", keywords: "cheatsheet keys hotkeys",
      run: () => ui.openShortcuts() },
    { id: "act:help", label: "Help — open drawer",     sublabel: "Action",       icon: "Help", keywords: "docs guide manual",
      run: () => openHelp("") },
  ];
  return list;
});

// Help-doc items — one per docs/*.md, indexed by slug + title + hint.
// Selecting one opens the help drawer rather than navigating.
const HELP_ITEMS = computed(() => {
  const out = [];
  for (const group of HELP_TOC) {
    for (const item of group.items) {
      out.push({
        id: `help:${item.slug}`,
        label: item.title,
        sublabel: `Help · ${item.hint}`,
        icon: "Help",
        keywords: `${group.section} docs guide help ${item.hint}`,
        run: () => openHelp(item.slug),
      });
    }
  }
  return out;
});

// ─── Match + score ──────────────────────────────────────────────────
function haystack(item) {
  return [item.label, item.sublabel, item.keywords].filter(Boolean).join(" ").toLowerCase();
}

function scoreItem(item, words) {
  const hay = haystack(item);
  let score = 0;
  for (const w of words) {
    const idx = hay.indexOf(w);
    if (idx < 0) return -1;
    // Earlier matches rank higher; word-start matches get a bonus.
    score += 50 - Math.min(idx, 50);
    if (idx === 0 || /\s/.test(hay[idx - 1])) score += 20;
  }
  return score;
}

const allItems = computed(() => [
  ...NAV_ITEMS,
  ...ENTITY_ITEMS.value,
  ...ACTION_ITEMS.value,
  ...HELP_ITEMS.value,
]);

const results = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) {
    // Empty query — show nav + actions only, hide the long entity list.
    return [...NAV_ITEMS, ...ACTION_ITEMS.value].slice(0, 30);
  }
  const words = q.split(/\s+/).filter(Boolean);
  const scored = [];
  for (const item of allItems.value) {
    const s = scoreItem(item, words);
    if (s >= 0) scored.push({ item, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 50).map((s) => s.item);
});

// Reset highlight when results change (e.g. user typed a new char).
watch(results, () => { highlighted.value = 0; });

// ─── Keyboard ───────────────────────────────────────────────────────
function onKey(e) {
  if (e.key === "Escape") { e.preventDefault(); closePalette(); return; }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    highlighted.value = (highlighted.value + 1) % Math.max(1, results.value.length);
    scrollIntoView();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    highlighted.value = (highlighted.value - 1 + results.value.length) % Math.max(1, results.value.length);
    scrollIntoView();
  } else if (e.key === "Enter") {
    e.preventDefault();
    const item = results.value[highlighted.value];
    if (item) pick(item);
  }
}

function scrollIntoView() {
  nextTick(() => {
    const el = document.querySelector(`.cp-item[data-idx="${highlighted.value}"]`);
    el?.scrollIntoView({ block: "nearest" });
  });
}

function pick(item) {
  closePalette();
  // Defer to next tick so the palette unmounts before any action dialog
  // takes focus.
  nextTick(() => {
    if (typeof item.run === "function") item.run();
    else if (item.to) router.push(item.to);
  });
}
</script>

<template>
  <div v-if="open" class="cp-overlay" @click.self="closePalette">
    <div class="cp-modal" role="dialog" aria-label="Command palette">
      <div class="cp-input-row">
        <Icon name="Search" :size="14" />
        <input
          ref="inputEl"
          v-model="query"
          @keydown="onKey"
          class="cp-input"
          placeholder="Jump to a chapter, character, or action…"
          autocomplete="off"
          spellcheck="false"
        />
        <span class="cp-hint">esc</span>
      </div>
      <div class="cp-list" role="listbox" aria-label="Command results">
        <button
          v-for="(item, i) in results"
          :key="item.id"
          :data-idx="i"
          role="option"
          :aria-selected="highlighted === i"
          class="cp-item"
          :class="{ 'cp-item--active': highlighted === i }"
          @mouseenter="highlighted = i"
          @click="pick(item)"
        >
          <Icon :name="item.icon || 'ChevRight'" :size="13" class="cp-icon" />
          <div class="cp-text">
            <div class="cp-label">{{ item.label }}</div>
            <div v-if="item.sublabel" class="cp-sublabel">{{ item.sublabel }}</div>
          </div>
        </button>
        <div v-if="!results.length" class="cp-empty">No matches.</div>
      </div>
      <div class="cp-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
        <span><kbd>↵</kbd> open</span>
        <span><kbd>esc</kbd> close</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cp-overlay {
  position: fixed; inset: 0; z-index: 200;
  /* No dim, no blur — the user ruled backdrop dimming + blur off app-wide
     (2026-07-19). The palette's own border + shadow do the separating. The
     element STAYS: it is the @click.self click-outside catcher and the
     flex-centering container. */
  background: transparent;
  display: flex; justify-content: center; align-items: flex-start;
  padding-top: 12vh;
}
.cp-modal {
  width: min(620px, 92vw);
  background: var(--surface); color: var(--ink);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, .28);
  display: flex; flex-direction: column;
  max-height: 70vh;
  overflow: hidden;
}
.cp-input-row {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
}
.cp-input {
  flex: 1;
  appearance: none; border: 0; outline: 0; background: transparent;
  font-family: var(--font-ui); font-size: 15px;
  color: var(--ink);
}
.cp-input::placeholder { color: var(--muted); }
.cp-hint {
  font-family: var(--font-mono); font-size: 10.5px;
  padding: 2px 6px; border-radius: 4px;
  background: var(--surface-2); color: var(--muted);
}
.cp-list {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: 4px;
}
.cp-item {
  display: grid; grid-template-columns: 18px 1fr;
  gap: 10px; align-items: center;
  width: 100%; padding: 8px 12px;
  border: 0; background: transparent; cursor: pointer;
  text-align: left; border-radius: 6px;
  color: var(--ink);
}
.cp-item--active { background: var(--accent-soft); color: var(--accent-ink); }
.cp-icon { color: var(--muted); }
.cp-item--active .cp-icon { color: var(--accent-ink); }
.cp-text { min-width: 0; }
.cp-label {
  font-size: 13.5px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cp-sublabel {
  font-family: var(--font-mono); font-size: 10.5px;
  color: var(--muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-top: 1px;
}
.cp-item--active .cp-sublabel { color: var(--accent-ink); opacity: 0.8; }
.cp-empty {
  padding: 20px; text-align: center; color: var(--muted);
  font-size: 12.5px; font-style: italic;
}
.cp-footer {
  display: flex; gap: 14px; justify-content: flex-end;
  padding: 6px 14px;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
  font-size: 11px; color: var(--muted);
}
.cp-footer kbd {
  font-family: var(--font-mono); font-size: 10px;
  padding: 1px 5px; border-radius: 3px;
  background: var(--surface); border: 1px solid var(--border);
  margin-right: 3px;
}
</style>
