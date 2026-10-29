// Every page of the app, for a check that visits them all (the accessibility test, tests/a11y.test.js): the
// routes with no required parameter (the headless smoke's list), each Settings section, Sync, a help page, and
// the pages of the open book's first entry of each kind — a kind the book has none of is left out. The AI page's
// tabs are tabs, not routes: the test opens each from the page's tab strip.

import { SETTINGS_SECTION_IDS } from "../../src/services/settingsSections.js";
import { ROUTES } from "../../tests/lib/smoke-common.js";

const ENTRY_KINDS = ["characters", "locations", "objects", "groups", "worldbuilding", "strands", "notes"];

/** Run in the page (page.evaluate): the open book's first entry of each kind, from Pinia's state. */
export function firstOfEachKind() {
  const p = document.querySelector("#q-app").__vue_app__.config.globalProperties.$pinia.state.value.project;
  const chapter = p.parts.flatMap((part) => part.chapters).find((c) => (p.scenes[c.id] || []).length);
  const first = Object.fromEntries(["characters", "locations", "objects", "groups", "worldbuilding", "strands", "notes"].map((k) => [k, p[k][0]?.id]));
  return { ...first, chapter: chapter?.id, scene: chapter && p.scenes[chapter.id][0].id };
}

/** The hashes to visit, from firstOfEachKind()'s answer. An entry's events pages are one component for every
 *  kind, so a character's stand for them all. */
export function pagesOf(first) {
  const c = first.characters;
  return [
    ...ROUTES,
    ...SETTINGS_SECTION_IDS.map((id) => `#/settings/${id}`),
    "#/sync",
    "#/help/writing",
    ...ENTRY_KINDS.filter((k) => first[k]).map((k) => `#/${k}/${first[k]}`),
    ...(c ? [`#/characters/${c}/events`, `#/characters/${c}/events/new`] : []),
    "#/architecture/setting/events",
    ...(first.chapter ? [`#/chapters/${first.chapter}/${first.scene}`] : []),
  ];
}
