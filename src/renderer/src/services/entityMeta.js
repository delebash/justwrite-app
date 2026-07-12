// Copy for the "New worldbuilding article" popup — the one entity create that
// stays a popup. Its detail form has no category selector, so the popup is the
// only place to choose an article's category (F6-WB); every other entity create
// collapsed to DIRECT→FORM (create default-named → focus the name field on
// arrival), so their popup copy was removed. Shared by the Worldbuilding page's
// New button (WorldbuildingView → addArticle) and the sidebar's per-category
// add button (Sidebar → addArticleInCat) so the two can't drift.
//
// Pure data (no store dependency). The page still dispatches its own store
// action; only the prompt's title/label/placeholder/confirmLabel live here.

export const NEW_ENTITY_META = {
  worldbuilding: { title: "New article", label: "Article title", placeholder: "e.g. The North Coast", confirmLabel: "Create article" },
};
