// The location, object and group sheets (the AI drafting spec §9.1; built 2026-10-16) — ONE
// source for the pages (components/StoryWorldSheet.vue renders them), the AI cards
// (services/rag/cards.js) and the drafting (services/analysis/sheetDraft.js). The character
// sheet's counterpart is services/characterSheet.js.
//
// A sheet is the entity kind's extra fields, each a plain string on the entity under its own key
// (a real column: book_io maps `whereNow` ↔ `where_now`). The description (a location's or an
// object's `note`, a group's `blurb` — rich text, under its catalog label) stays the page's own and
// isn't a sheet field; a draft proposes it only while it's empty (sheetDraft.js). Labels and
// hints live in the catalog at `<plural>.fields.<key>.{label,hint}`.

export const STORY_WORLD_SHEETS = {
  location: { plural: "locations", fields: ["atmosphere", "history"], description: { key: "note", label: "common.description" } },
  object: { plural: "objects", fields: ["properties", "history", "whereNow"], description: { key: "note", label: "common.description" } },
  group: { plural: "groups", fields: ["goals", "leadership", "history"], description: { key: "blurb", label: "groups.blurbPlaceholder" } },
};

function sheetOf(kind) {
  const sheet = STORY_WORLD_SHEETS[kind];
  if (!sheet) throw new Error(`Unknown story-world sheet: ${kind}`);
  return sheet;
}

/** The kind's sheet fields, in page order. */
export function sheetFields(kind) {
  return sheetOf(kind).fields;
}

/** The page's own description: its key on the entity and its catalog label. */
export function sheetDescription(kind) {
  return sheetOf(kind).description;
}

/** A field's catalog keys for its label and hint. */
export function sheetFieldLabelKeys(kind, key) {
  const { plural } = sheetOf(kind);
  return { label: `${plural}.fields.${key}.label`, hint: `${plural}.fields.${key}.hint` };
}

/** A field's current value on the entity ("" when unset). */
export function sheetValue(entity, key) {
  return String(entity?.[key] || "");
}

/** How many of the sheet's fields hold something. */
export function sheetCount(kind, entity) {
  return sheetFields(kind).filter((k) => sheetValue(entity, k).trim()).length;
}

/** A page is thin while every sheet field is empty (the describe box's rule — the spec §9.3). */
export function isThinSheet(kind, entity) {
  return sheetCount(kind, entity) === 0;
}

/** The sheet as review-row defs (Fill from book's `draftRows` def shape, plus the hint the
 *  drafting prompt reads). `t` is the i18n translate function. */
export function sheetFieldDefs(kind, entity, t) {
  return sheetFields(kind).map((key) => {
    const keys = sheetFieldLabelKeys(kind, key);
    return { key, label: t(keys.label), hint: t(keys.hint), current: sheetValue(entity, key) };
  });
}
