// The three Architecture documents (Premise, Fabula, Setting) — a FIXED set: their name and
// their "what this is" line are not per-book data, so both come from the catalog by the
// document's id. The body (the rich editor) is the only thing the writer writes. One table for
// the page and the sidebar (2026-10-18: the sidebar showed the title stored in English).
import { t } from "../i18n/index.js";

export const ARCH_DOCS = {
  premise: { titleKey: "architecture.doc.premise.title", descriptionKey: "architecture.doc.premise.description" },
  fabula:  { titleKey: "architecture.doc.fabula.title",  descriptionKey: "architecture.doc.fabula.description" },
  setting: { titleKey: "architecture.doc.setting.title", descriptionKey: "architecture.doc.setting.description" },
};

/** A document's name in the interface language; `fallback` (the stored title) for an id the
 *  table doesn't know. */
export function archDocTitle(id, fallback = "") {
  const d = ARCH_DOCS[id];
  return d ? t(d.titleKey) : fallback || id;
}
