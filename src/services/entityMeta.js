// Copy for the "New worldbuilding article" popup — the one entity create that
// stays a popup. Its detail form has no category selector, so the popup is the
// only place to choose an article's category (F6-WB); every other entity create
// collapsed to DIRECT→FORM (create default-named → focus the name field on
// arrival), so their popup copy was removed. Used by the Worldbuilding page's
// New button (addArticle); the sidebar's per-category add knows its category and
// creates directly (2026-10-28).
//
// Pure data (no store dependency). The page still dispatches its own store
// action; only the prompt's title/label/placeholder/confirmLabel live here.

export const NEW_ENTITY_META = {
  worldbuilding: { titleKey: "worldbuilding.dialog.title", labelKey: "worldbuilding.dialog.label", placeholderKey: "worldbuilding.dialog.placeholder", confirmLabelKey: "worldbuilding.dialog.confirm" },
};
