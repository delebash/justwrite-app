// ============================================================
// mentionRefs.js — the inverse of an @-mention chip. Each chip in a
// scene body links prose → bible entity; this scans every saved scene
// body and returns the scenes that mention a given entity, so the
// entity's page can show a "Mentioned in prose" back-reference list.
//
// Chips serialize (see editorMentions.js) as:
//   <span data-type="mention" data-id="…" data-kind="…">@Label</span>
// so this is a pure read over stored HTML — no store mutation.
// ============================================================

const SNIPPET_RADIUS = 48;

// A short prose excerpt centred on the chip, drawn from its block parent.
function snippetAround(chip) {
  const block = chip.closest("p,li,blockquote,h1,h2,h3,td,th") || chip.parentElement;
  const full = (block?.textContent || chip.textContent || "").replace(/\s+/g, " ").trim();
  const label = (chip.textContent || "").trim();
  const at = label ? full.indexOf(label) : -1;
  if (at < 0) return full.length > SNIPPET_RADIUS * 2 ? full.slice(0, SNIPPET_RADIUS * 2) + "…" : full;
  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(full.length, at + label.length + SNIPPET_RADIUS);
  return (start > 0 ? "…" : "") + full.slice(start, end) + (end < full.length ? "…" : "");
}

// Returns one row per scene that mentions `entityId`, in chapter/scene
// order. Entity ids are unique across kinds (c#, l#, o#, g#), so a
// data-id match is unambiguous.
export function findMentionRefs(project, entityId) {
  if (!entityId) return [];
  const needle = `data-id="${entityId}"`;
  const parser = new DOMParser();
  const out = [];
  for (const ch of project.allChapters) {
    project.scenesFor(ch.id).forEach((scn, idx) => {
      const body = scn.body || "";
      if (!body.includes('data-type="mention"') || !body.includes(needle)) return;
      const doc = parser.parseFromString(body, "text/html");
      const chips = [...doc.querySelectorAll('span[data-type="mention"]')]
        .filter((el) => el.getAttribute("data-id") === entityId);
      if (!chips.length) return;
      out.push({
        chapterId: ch.id,
        chapterNum: ch.num,
        chapterTitle: ch.title,
        chapterStatus: ch.status,
        sceneId: scn.id,
        sceneIdx: idx + 1,
        sceneTitle: scn.title || `Scene ${idx + 1}`,
        count: chips.length,
        snippet: snippetAround(chips[0]),
      });
    });
  }
  return out;
}
