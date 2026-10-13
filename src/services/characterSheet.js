// The character sheet's sections and their fields — ONE source for the Characters page
// (pages/CharactersPage.vue renders them) and the AI drafting (services/analysis/
// characterDraft.js drafts them). Moved verbatim from the page, 2026-10-11 (the AI drafting
// plan, Task 3).
//
// A field is `{ group, k, type }`: `group` is the extras top-level key ("_top" for a top-level
// string — the backstory), `k` the key inside it, `type` how the page renders it ("input" |
// "textarea"). Labels and hints live in the catalog: `characters.fields.<group>.<k>.{label,hint}`
// (the backstory's at `characters.detail.backstory{,Hint}`); section titles at
// `characters.sections.<key>.title`.

export const IDENTITY_FIELDS = [
  { group: "identity", k: "classOrigin", type: "input" },
  { group: "identity", k: "education", type: "input" },
];
// The four the page renders as its coloured motivation grid.
export const MOTIVATION_CORE = ["want", "need", "lie", "truth"].map((k) => ({ group: "motivation", k, type: "textarea" }));
export const CORE_ENGINE_FIELDS = [
  { group: "motivation", k: "fear", type: "textarea" },
  { group: "motivation", k: "lieOrigin", type: "textarea" },
  { group: "motivation", k: "contradiction", type: "textarea" },
  { group: "motivation", k: "values", type: "input" },
  { group: "motivation", k: "heuristic", type: "input" },
  { group: "motivation", k: "stakes", type: "textarea" },
];
// The page's arc card.
export const ARC_FIELDS = ["start", "midpoint", "end"].map((k) => ({ group: "arc", k, type: "textarea" }));
// The page's voice grid.
export const VOICE_CORE = [
  { group: "voice", k: "accent", type: "input" },
  { group: "voice", k: "vocabulary", type: "input" },
  { group: "voice", k: "tic", type: "input" },
  { group: "voice", k: "sample", type: "textarea" },
];
export const VOICE_FIELDS = [
  { group: "voice", k: "register", type: "input" },
  { group: "voice", k: "rhythm", type: "input" },
  { group: "voice", k: "forbidden", type: "input" },
  { group: "voice", k: "subtext", type: "input" },
  { group: "voice", k: "humor", type: "input" },
  { group: "voice", k: "languages", type: "input" },
  { group: "voice", k: "sampleAngry", type: "textarea" },
  { group: "voice", k: "sampleLying", type: "textarea" },
];
export const PRESENCE_FIELDS = [
  { group: "presence", k: "physicality", type: "textarea" },
  { group: "presence", k: "presentation", type: "textarea" },
  { group: "presence", k: "stressTells", type: "textarea" },
];
export const FUNCTION_FIELDS = [
  { group: "function", k: "theme", type: "textarea" },
  { group: "function", k: "protagonistRelation", type: "input" },
  { group: "function", k: "selfImage", type: "textarea" },
  { group: "function", k: "persona", type: "textarea" },
  { group: "function", k: "privateTruth", type: "textarea" },
  { group: "function", k: "buttons", type: "textarea" },
  { group: "function", k: "allegiances", type: "textarea" },
  { group: "function", k: "escalation", type: "input" },
  { group: "function", k: "cornered", type: "textarea" },
];
export const CAPABILITY_FIELDS = [
  { group: "capabilities", k: "abilities", type: "textarea" },
  { group: "capabilities", k: "costs", type: "textarea" },
  { group: "capabilities", k: "limits", type: "textarea" },
  { group: "capabilities", k: "conditions", type: "input" },
  { group: "capabilities", k: "whoKnows", type: "input" },
];
export const CONTINUITY_FIELDS = [
  { group: "continuity", k: "physicalConstants", type: "textarea" },
  { group: "continuity", k: "health", type: "textarea" },
  { group: "continuity", k: "timelineAnchors", type: "input" },
  { group: "continuity", k: "knows", type: "textarea" },
  { group: "continuity", k: "doesntKnow", type: "textarea" },
  { group: "continuity", k: "believesWrongly", type: "textarea" },
  { group: "continuity", k: "secrets", type: "textarea" },
  { group: "continuity", k: "possessions", type: "textarea" },
];
export const BACKSTORY_FIELD = { group: "_top", k: "backstory", type: "textarea" };
export const DEPTH_FIELDS = [
  { group: "depth", k: "regrets", type: "textarea" },
  { group: "depth", k: "family", type: "textarea" },
  { group: "depth", k: "skills", type: "textarea" },
  { group: "depth", k: "routines", type: "input" },
  { group: "depth", k: "appearance", type: "textarea" },
  { group: "depth", k: "tastes", type: "input" },
];

/** The sheet's sections in page order, each with every field it shows. */
export const SHEET_SECTIONS = [
  { key: "identity", fields: [...IDENTITY_FIELDS, ...MOTIVATION_CORE, ...CORE_ENGINE_FIELDS] },
  { key: "arc", fields: ARC_FIELDS },
  { key: "voice", fields: [...VOICE_CORE, ...VOICE_FIELDS, ...PRESENCE_FIELDS] },
  { key: "function", fields: FUNCTION_FIELDS },
  { key: "capabilities", fields: CAPABILITY_FIELDS },
  { key: "continuity", fields: CONTINUITY_FIELDS },
  { key: "depth", fields: [BACKSTORY_FIELD, ...DEPTH_FIELDS] },
];

/** A field's current value on a character's extras ("" when unset). */
export function fieldValue(extras, f) {
  return (f.group === "_top" ? extras?.[f.k] : extras?.[f.group]?.[f.k]) || "";
}

/** How many of a section's fields hold something — the page's count chip. */
export function sectionCount(extras, sectionKey) {
  const s = SHEET_SECTIONS.find((x) => x.key === sectionKey);
  return s ? s.fields.filter((f) => String(fieldValue(extras, f)).trim()).length : 0;
}

/** A character is thin while none of the sheet's sections has a filled field (the describe
 *  box's rule — the AI drafting spec §9.3). The hero row (role, one-liner…) doesn't count. */
export function isThinCharacter(extras) {
  return SHEET_SECTIONS.every((s) => sectionCount(extras, s.key) === 0);
}

/** A field's draft key, in Fill from book's key shape: "group.k", or the bare key of a
 *  top-level field ("backstory"). */
export function fieldKey(f) {
  return f.group === "_top" ? f.k : `${f.group}.${f.k}`;
}

/** A field's catalog keys for its label and hint. */
export function fieldLabelKeys(f) {
  return f.group === "_top"
    ? // eslint-disable-next-line i18next/no-literal-string -- builds a key, not a word
      { label: `characters.detail.${f.k}`, hint: `characters.detail.${f.k}Hint` }
    : { label: `characters.fields.${f.group}.${f.k}.label`, hint: `characters.fields.${f.group}.${f.k}.hint` };
}

/** One section's fields as review-row defs (Fill from book's `draftRows` def shape, plus the
 *  hint the drafting prompt reads). `t` is the i18n translate function. */
export function sectionFieldDefs(sectionKey, extras, t) {
  const s = SHEET_SECTIONS.find((x) => x.key === sectionKey);
  if (!s) return [];
  return s.fields.map((f) => {
    const keys = fieldLabelKeys(f);
    return { key: fieldKey(f), label: t(keys.label), hint: t(keys.hint), current: fieldValue(extras, f) };
  });
}
