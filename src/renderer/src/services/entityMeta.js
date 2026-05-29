// Single source of truth for the "New <entity>" dialog copy. Shared by
// the sidebar's generic add button (Sidebar.vue → addItem) and each
// entity page's own New button so the two can't drift — previously the
// sidebar's copy was missing the placeholder hints the pages had.
//
// Pure data (no store dependency). Each page still dispatches its own
// store action; only the prompt's title/label/placeholder/confirmLabel
// live here.

export const NEW_ENTITY_META = {
  characters:    { title: "New character",        label: "Character name",        placeholder: "e.g. Mira Halden",               confirmLabel: "Create character" },
  locations:     { title: "New location",         label: "Location name",         placeholder: "e.g. Brackish Cove",             confirmLabel: "Create location" },
  objects:       { title: "New object",           label: "Object name",           placeholder: "e.g. Idris's pocket watch",      confirmLabel: "Create object" },
  groups:        { title: "New group",            label: "Group name",            placeholder: "e.g. The Cartographers' Guild",  confirmLabel: "Create group" },
  strands:       { title: "New narrative strand", label: "Narrative strand name", placeholder: "e.g. The Map Plot",              confirmLabel: "Create narrative strand" },
  notes:         { title: "New note",             label: "Note title",            placeholder: "e.g. Research — coastline maps", confirmLabel: "Create note" },
  worldbuilding: { title: "New article",          label: "Article title",         placeholder: "e.g. The North Coast",           confirmLabel: "Create article" },
};
