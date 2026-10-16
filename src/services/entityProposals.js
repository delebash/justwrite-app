// A review list's accepted proposals → the story bible (2026-10-11 — moved out of
// EntityReviewModal so it is testable). Characters land in ONE store action (addCharacters —
// one undo step, for Entity sweep and Suggest characters alike); locations too since 2026-10-16
// (addLocations — Suggest locations); objects one by one, as before. Returns every accepted
// entity with its new id, name, aliases and origin
// chapters, for the caller's scene-link backfill.

/** Aliases arrive as an array (the sweep, E3) or as the review row's comma-separated string. */
export function parseAliases(value) {
  if (Array.isArray(value)) return value.map((a) => String(a).trim()).filter(Boolean);
  return String(value || "").split(",").map((a) => a.trim()).filter(Boolean);
}

/** @param rows {{ characters: object[], locations: object[], objects: object[] }} review rows
 *  (each with `accept`). @returns {Array<{ kind, entityId, name, aliases, origins }>} */
export function addProposedEntities(project, rows) {
  const accepted = [];
  const characters = (rows.characters || []).filter((r) => r.accept);
  if (characters.length) {
    const ids = project.addCharacters(characters.map((r) => ({
      name: r.name, role: r.role, oneLiner: r.oneLiner, aliases: parseAliases(r.aliases),
    })));
    characters.forEach((r, i) => {
      accepted.push({
        kind: "character", entityId: ids[i], name: r.name, aliases: parseAliases(r.aliases), origins: r.originChapters || [],
      });
    });
  }
  const locations = (rows.locations || []).filter((r) => r.accept);
  if (locations.length) {
    const ids = project.addLocations(locations.map((r) => ({ name: r.name, kind: r.kind, note: r.note })));
    locations.forEach((r, i) => {
      accepted.push({ kind: "location", entityId: ids[i], name: r.name, aliases: [], origins: r.originChapters || [] });
    });
  }
  for (const r of rows.objects || []) {
    if (!r.accept) continue;
    const id = project.addObject({ name: r.name, kind: r.kind, note: r.note });
    accepted.push({ kind: "object", entityId: id, name: r.name, aliases: [], origins: r.originChapters || [] });
  }
  return accepted;
}
