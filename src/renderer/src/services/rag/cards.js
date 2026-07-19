// Story-bible CARD chunks (Move 1, RAG build 2026-07-11 — the spec is
// docs/plans/2026-07-10-rag-story-bible-research.md §4/§10, the build plan
// docs/plans/2026-07-11-rag-story-bible-build.md §T2).
//
// buildEntityCards(project) flattens the hand-curated bible — characters,
// locations, objects, groups, worldbuilding, notes, strands, architecture,
// with each entity's events folded into its own card — into standalone prose
// chunks the retriever and the LLM can use. THE one builder: the chunker
// indexes these cards and the Move-2 pinner injects the SAME builder's output
// at ask time, so a pinned card is byte-identical to its indexed twin.
//
// Card chunk shape (superset of the scene-chunk fields the excerpt formatter
// and citations panel read):
//   { id: "card:<kind>:<entityId>[:pN]", kind, entityId, title, text, sha: "" }
// Scene chunks carry chapter/scene fields instead of kind/entityId — the
// `kind` field is what excerpts.js/ChatPanel key their card branches on.

import { TRAJECTORY_LABELS } from "../analysis/relationshipArc.js";
import { povLabel } from "../povOptions.js";
import { htmlToText } from "../text.js";
import { buildCharacterProfile } from "./profile.js";

// Long worldbuilding articles split into parts around this size (paragraph
// boundaries) so every part fits fully inside the excerpt window.
const WB_SPLIT_CHARS = 1500;
// Temporal appearances are capped — a protagonist in a long book would
// otherwise push the card far past what an excerpt can show; the count line
// keeps the total honest.
const MAX_APPEARANCE_LINES = 12;

export const CARD_KIND_LABELS = {
  character: "Character",
  location: "Location",
  object: "Object",
  group: "Group",
  worldbuilding: "Worldbuilding",
  note: "Note",
  strand: "Narrative strand",
  cast: "Cast",
  architecture: "Architecture",
  outline: "Outline",
};

// ── scene-link index ─────────────────────────────────────────────────────
// One walk over chapters × scenes: for each linked entity id, the scenes it
// is linked in (SceneLinks writes scene.characters/.locations/.objects).
function buildSceneIndex(project) {
  const byCharacter = new Map();
  const byLocation = new Map();
  const byObject = new Map();
  const refs = [];
  const allChapters = project.allChapters;
  for (let ci = 0; ci < allChapters.length; ci++) {
    const chapter = allChapters[ci];
    const scenes = project.scenesFor(chapter.id);
    for (let si = 0; si < scenes.length; si++) {
      const scene = scenes[si];
      const ref = { chapter, chapterNum: ci + 1, scene, sceneIdx: si };
      refs.push(ref);
      for (const id of scene.characters || []) {
        if (!byCharacter.has(id)) byCharacter.set(id, []);
        byCharacter.get(id).push(ref);
      }
      for (const id of scene.locations || []) {
        if (!byLocation.has(id)) byLocation.set(id, []);
        byLocation.get(id).push(ref);
      }
      for (const id of scene.objects || []) {
        if (!byObject.has(id)) byObject.set(id, []);
        byObject.get(id).push(ref);
      }
    }
  }
  return { byCharacter, byLocation, byObject, refs };
}

function sceneLabel(ref) {
  const t = ref.scene.title ? ` "${ref.scene.title}"` : ` scene ${ref.sceneIdx + 1}`;
  return `Ch ${ref.chapterNum}${t}`;
}

// "Ch 1 'The customs house' — at Customs House, with Bren, POV: Limited
// third person" — the temporal line ("where is X" is a timeline question;
// spec third pass; the POV mode rides when the scene sets one).
function appearanceLines(refs, selfId, nameOf) {
  const lines = [];
  for (const ref of refs.slice(0, MAX_APPEARANCE_LINES)) {
    const places = (ref.scene.locations || []).map((id) => nameOf.location(id)).filter(Boolean);
    const company = (ref.scene.characters || [])
      .filter((id) => id !== selfId)
      .map((id) => nameOf.character(id))
      .filter(Boolean);
    const bits = [];
    if (places.length) bits.push(`at ${places.join(", ")}`);
    if (company.length) bits.push(`with ${company.join(", ")}`);
    const pov = povLabel(ref.scene.pov);
    if (pov) bits.push(`POV: ${pov}`);
    lines.push(`- ${sceneLabel(ref)}${bits.length ? ` — ${bits.join(", ")}` : ""}`);
  }
  if (refs.length > MAX_APPEARANCE_LINES) {
    lines.push(`- …and ${refs.length - MAX_APPEARANCE_LINES} more scenes (${refs.length} in total)`);
  }
  return lines;
}

function groupMemberships(project, kind, id) {
  return (project.groups || [])
    .filter((g) => (g.members || []).some((m) => m.kind === kind && m.id === id))
    .map((g) => g.name)
    .filter(Boolean);
}

function eventLines(project, entityId) {
  const list = project.events?.[entityId] || [];
  return list.map((e) => {
    const when = e.when ? `${e.when} — ` : "";
    const note = e.note ? `: ${e.note}` : "";
    return `- ${when}${e.title}${note}`;
  });
}

function tagsLine(entity) {
  return (entity.tags || []).length ? `Tags: ${entity.tags.join(", ")}` : "";
}

// RAG (a), 2026-07-18: relationship edges onto character cards. The author's
// kept relationship arcs (project.relationshipArcs, pairKey "a::b" sorted)
// carry exactly the multi-hop truth retrieval was missing — "how do X and Y
// stand with each other" lived nowhere in the index. One line per arc
// involving this character: the other's name, the trajectory, the summary.
// Sorted by the other character's name so card text (and its sha) is
// deterministic regardless of object insertion order.
function relationshipLines(project, characterId, nameOf) {
  const arcs = project.relationshipArcs || {};
  const rows = [];
  for (const [key, arc] of Object.entries(arcs)) {
    const [a, b] = String(key).split("::");
    if (a !== characterId && b !== characterId) continue;
    const other = nameOf.character(a === characterId ? b : a);
    if (!other) continue; // the other side was deleted — stale arc, skip
    const traj = TRAJECTORY_LABELS[arc?.trajectory] || "";
    const summary = String(arc?.summary || "").trim();
    // (WS5) this character's side of the standing dynamic — indented under the
    // arc line; the other side lives on the other character's card. Only THIS
    // character's side rides here, so both cards stay non-redundant.
    const side = arc?.sides?.[characterId] || null;
    const sideLines = [];
    if (side) {
      if (side.wants) sideLines.push(`    wants from ${other}: ${side.wants}`);
      if (side.fears) sideLines.push(`    fears from ${other}: ${side.fears}`);
      if (side.speaksLike) sideLines.push(`    speaks to ${other} like: ${side.speaksLike}`);
    }
    if (!summary && !traj && !sideLines.length) continue;
    const trajTag = traj ? ` (${traj.toLowerCase()})` : "";
    // Byte-identical to the pre-WS5 line when there's a summary and no side —
    // existing arcs don't re-embed just for this change.
    const head = summary ? `- With ${other}${trajTag}: ${summary}` : `- With ${other}${trajTag}`;
    rows.push({ other, line: sideLines.length ? `${head}\n${sideLines.join("\n")}` : head });
  }
  rows.sort((x, y) => x.other.localeCompare(y.other));
  return rows.map((r) => r.line);
}

// ── per-kind builders ────────────────────────────────────────────────────

function characterCards(project, index, nameOf) {
  const out = [];
  for (const c of project.characters || []) {
    const header = `${c.name}${c.main ? " (main character)" : ""}`;
    const lines = [header];
    const profile = buildCharacterProfile(c, project.characterExtras?.[c.id] || null, { voice: "third" });
    if (profile) lines.push(profile.trim());
    // (a): relationships ride right after the profile — identity-adjacent, so
    // they land in part 1 of a split card and stay reachable by pins.
    const rels = relationshipLines(project, c.id, nameOf);
    if (rels.length) lines.push("Relationships:", ...rels);
    if (tagsLine(c)) lines.push(tagsLine(c));
    const groups = groupMemberships(project, "character", c.id);
    if (groups.length) lines.push(`Member of: ${groups.join(", ")}`);
    const events = eventLines(project, c.id);
    if (events.length) lines.push("Timeline:", ...events);
    const refs = index.byCharacter.get(c.id) || [];
    if (refs.length) lines.push("Appears in:", ...appearanceLines(refs, c.id, nameOf));
    // Split a rich character card the SAME way long worldbuilding splits (WB_SPLIT_CHARS,
    // paragraph/line boundaries). profile.js orders identity + arc first, so part 1 is a
    // clean pin/citation; backstory, timeline, and appearances fall to later parts. Without
    // this a big card is ONE diluted vector, truncated at the excerpt cap — its depth
    // unreachable by retrieval. Small cards stay a single unsplit chunk (id unchanged).
    const parts = splitParts(lines.join("\n"));
    if (parts.length <= 1) {
      out.push({ id: `card:character:${c.id}`, kind: "character", entityId: c.id, title: c.name, text: lines.join("\n"), sha: "" });
    } else {
      parts.forEach((part, i) => {
        const text = i === 0 ? part : `${header} — part ${i + 1}\n${part}`;
        out.push({ id: `card:character:${c.id}:p${i + 1}`, kind: "character", entityId: c.id, title: `${c.name} (part ${i + 1} of ${parts.length})`, text, sha: "" });
      });
    }
  }
  return out;
}

function placeThingCards(project, index, nameOf, kind) {
  const list = kind === "location" ? project.locations : project.objects;
  const byId = kind === "location" ? index.byLocation : index.byObject;
  return (list || []).map((e) => {
    const lines = [`${e.name}${e.kind ? ` (${e.kind})` : ""}`];
    if (e.note) lines.push(e.note);
    if (tagsLine(e)) lines.push(tagsLine(e));
    const groups = groupMemberships(project, kind, e.id);
    if (groups.length) lines.push(`Member of: ${groups.join(", ")}`);
    const events = eventLines(project, e.id);
    if (events.length) lines.push("Timeline:", ...events);
    const refs = byId.get(e.id) || [];
    if (refs.length) {
      const lineFor = (ref) => {
        const who = (ref.scene.characters || []).map((id) => nameOf.character(id)).filter(Boolean);
        return `- ${sceneLabel(ref)}${who.length ? ` — with ${who.join(", ")}` : ""}`;
      };
      const shown = refs.slice(0, MAX_APPEARANCE_LINES).map(lineFor);
      if (refs.length > MAX_APPEARANCE_LINES) {
        shown.push(`- …and ${refs.length - MAX_APPEARANCE_LINES} more scenes (${refs.length} in total)`);
      }
      lines.push("Appears in:", ...shown);
    }
    return { id: `card:${kind}:${e.id}`, kind, entityId: e.id, title: e.name, text: lines.join("\n"), sha: "" };
  });
}

function groupCards(project, nameOf) {
  return (project.groups || []).map((g) => {
    const lines = [g.name];
    if (g.blurb) lines.push(g.blurb);
    const members = (g.members || [])
      .map((m) => {
        const name = nameOf[m.kind] ? nameOf[m.kind](m.id) : "";
        return name ? `- ${name} (${m.kind})` : "";
      })
      .filter(Boolean);
    if (members.length) lines.push("Members:", ...members);
    return { id: `card:group:${g.id}`, kind: "group", entityId: g.id, title: g.name, text: lines.join("\n"), sha: "" };
  });
}

// Split plain text into ~WB_SPLIT_CHARS parts on paragraph boundaries.
// htmlToText(blockNewlines) renders paragraph breaks as single newlines, so
// any newline run is a boundary here.
function splitParts(text) {
  if (text.length <= WB_SPLIT_CHARS) return [text];
  const paras = text.split(/\n+/);
  const parts = [];
  let cur = "";
  for (const p of paras) {
    if (cur && cur.length + p.length + 1 > WB_SPLIT_CHARS) {
      parts.push(cur);
      cur = p;
    } else {
      cur = cur ? `${cur}\n${p}` : p;
    }
  }
  if (cur) parts.push(cur);
  // Tiny-tail merge (2026-07-18): a runt final part (measured on the real
  // book: 1491/1445/147 — the 147-char tail) is a diluted vector that earns
  // its own embedding without carrying enough to retrieve on. Fold it into
  // the previous part; the slight over-budget part beats the runt chunk.
  if (parts.length > 1 && parts[parts.length - 1].length < WB_SPLIT_CHARS / 5) {
    const tail = parts.pop();
    parts[parts.length - 1] = `${parts[parts.length - 1]}\n${tail}`;
  }
  return parts;
}

function worldbuildingCards(project) {
  const catLabel = (id) =>
    (project.worldbuildingCategories || []).find((c) => c.id === id)?.label || id || "";
  const out = [];
  for (const a of project.worldbuilding || []) {
    const header = [`${a.title} (${catLabel(a.category)})`];
    if (a.summary) header.push(a.summary);
    if (tagsLine(a)) header.push(tagsLine(a));
    const body = htmlToText(a.body || "", { blockNewlines: true });
    const parts = body ? splitParts(body) : [];
    if (parts.length <= 1) {
      const text = [...header, ...(parts[0] ? [parts[0]] : [])].join("\n");
      out.push({ id: `card:worldbuilding:${a.id}`, kind: "worldbuilding", entityId: a.id, title: a.title, text, sha: "" });
    } else {
      parts.forEach((part, i) => {
        const title = `${a.title} (part ${i + 1} of ${parts.length})`;
        const text = [i === 0 ? header.join("\n") : `${a.title} (${catLabel(a.category)}) — part ${i + 1}`, part].join("\n");
        out.push({ id: `card:worldbuilding:${a.id}:p${i + 1}`, kind: "worldbuilding", entityId: a.id, title, text, sha: "" });
      });
    }
  }
  return out;
}

function noteCards(project) {
  const chapterNumOf = (chapterId) => {
    const idx = project.allChapters.findIndex((c) => c.id === chapterId);
    return idx >= 0 ? idx + 1 : null;
  };
  return (project.notes || []).map((n) => {
    const lines = [n.title];
    if (n.anchor?.chapterId) {
      const num = chapterNumOf(n.anchor.chapterId);
      lines.push(num ? `Pinned to Ch ${num}` : "Pinned to a chapter");
    }
    const body = htmlToText(n.body || "", { blockNewlines: true });
    if (body) lines.push(body);
    return { id: `card:note:${n.id}`, kind: "note", entityId: n.id, title: n.title, text: lines.join("\n"), sha: "" };
  });
}

function strandCards(project) {
  const chapterNumOf = (chapterId) => {
    const idx = project.allChapters.findIndex((c) => c.id === chapterId);
    return idx >= 0 ? idx + 1 : null;
  };
  return (project.strands || []).map((s) => {
    const lines = [`${s.name}${s.status ? ` (${s.status})` : ""}`];
    if (s.blurb) lines.push(s.blurb);
    const body = htmlToText(s.body || "", { blockNewlines: true });
    if (body) lines.push(body);
    const beats = (s.beats || [])
      .map((b) => {
        const where = b.chapterId ? ` (Ch ${chapterNumOf(b.chapterId) ?? "?"})` : "";
        const note = b.note ? `: ${b.note}` : "";
        return b.label || b.note ? `- ${b.label || "beat"}${where}${note}` : "";
      })
      .filter(Boolean);
    if (beats.length) lines.push("Beats:", ...beats);
    return { id: `card:strand:${s.id}`, kind: "strand", entityId: s.id, title: s.name, text: lines.join("\n"), sha: "" };
  });
}

function architectureCards(project) {
  const out = [];
  for (const key of ["premise", "fabula", "setting"]) {
    const doc = project.architecture?.[key];
    if (!doc) continue;
    const body = htmlToText(doc.body || "", { blockNewlines: true });
    if (!body) continue; // an untouched architecture doc has nothing to index
    out.push({
      id: `card:architecture:${key}`, kind: "architecture", entityId: key,
      title: doc.title || key, text: [doc.title || key, body].join("\n"), sha: "",
    });
  }
  return out;
}

// A compact whole-book ROSTER: one line per MAIN character (name · role · one-liner).
// Pinned for corpus questions ("what is this book about") by entityMatcher's corpusFallback,
// so the WHOLE cast is named even when a rich protagonist's full card would eat the pin
// budget by itself (measured: one card was 3009 of the 4800-char budget). Per-character
// depth rides retrieval over the split cards. Falls back to the first several characters
// when NONE are flagged main, so a project that never set the flag still gets a cast.
function mainCastCard(project) {
  const chars = project.characters || [];
  const mains = chars.filter((c) => c?.main);
  const cast = mains.length ? mains : chars.slice(0, 8);
  const lines = cast
    .map((c) => (c.name ? `- ${c.name}${c.role ? ` (${c.role})` : ""}${c.oneLiner ? ` — ${c.oneLiner}` : ""}` : ""))
    .filter(Boolean);
  if (!lines.length) return null;
  return { id: "card:cast:main", kind: "cast", entityId: "main", title: "Main cast", text: ["Main cast:", ...lines].join("\n"), sha: "" };
}

// ── public API ───────────────────────────────────────────────────────────

// ONE entity-name resolution source — cards AND the scene chunks' links line
// (Move 3) resolve through this; never re-derive names elsewhere in rag/.
function entityNameResolvers(project) {
  return {
    character: (id) => (project.characters || []).find((c) => c.id === id)?.name || "",
    location: (id) => (project.locations || []).find((l) => l.id === id)?.name || "",
    object: (id) => (project.objects || []).find((o) => o.id === id)?.name || "",
    strand: (id) => (project.strands || []).find((s) => s.id === id)?.name || "",
  };
}

/**
 * The scene chunk's `links` line (Move 3): the scene's entity links as
 * names, for BM25 + the excerpt header — NOT part of the embedded text
 * (vectors stay pure prose). "" when the scene links nothing.
 */
export function sceneLinksLine(project, scene, nameOf = entityNameResolvers(project)) {
  const bits = [];
  const names = (ids, kind) => (ids || []).map((id) => nameOf[kind](id)).filter(Boolean);
  const chars = names(scene.characters, "character");
  const locs = names(scene.locations, "location");
  const objs = names(scene.objects, "object");
  if (chars.length) bits.push(`Characters: ${chars.join(", ")}`);
  if (locs.length) bits.push(`Location: ${locs.join(", ")}`);
  if (objs.length) bits.push(`Objects: ${objs.join(", ")}`);
  const pov = povLabel(scene.pov);
  if (pov) bits.push(`POV: ${pov}`);
  return bits.join(" · ");
}

/**
 * Build every story-bible card chunk for a project store instance.
 * Pure derivation — no store writes, no persistence; the chunker shas +
 * indexes the result and the pinner injects single cards from it.
 */
// RAG (b), 2026-07-18: the kept reverse outline as index cards. Thematic /
// whole-arc questions ("how does the middle sag?", "what's the turn at the
// midpoint?") had nothing mid-scale to retrieve — scenes are too fine, the
// premise too coarse. The outline's summary/structure/plot points make one
// card; the chapter-by-chapter beats make more (splitParts-bounded), each
// beat labeled with its chapter so citations land somewhere real. Absent
// until the writer generates (and keeps) a reverse outline.
function outlineCards(project) {
  const o = project.reverseOutline;
  if (!o) return [];
  const head = ["Book outline (from the reverse outline)"];
  if (o.summary) head.push(o.summary);
  if (o.structureName) head.push(`Structure: ${o.structureName}`);
  for (const b of o.actBreaks || []) {
    head.push(`- ${b.name}: after chapter ${b.afterChapterNum}`);
  }
  if ((o.plotPoints || []).length) {
    head.push("Plot points:");
    for (const p of o.plotPoints) {
      head.push(`- ${p.name} (Ch ${p.chapterNum})${p.description ? `: ${p.description}` : ""}`);
    }
  }
  const beats = (o.chapterBeats || []).map((b) => `- Ch ${b.chapterNum}: ${b.beat}`);
  const text = [...head, ...(beats.length ? ["Chapter beats:", ...beats] : [])].join("\n");
  if (!text.trim()) return [];
  const parts = splitParts(text);
  if (parts.length <= 1) {
    return [{ id: "card:outline:book", kind: "outline", entityId: "book", title: "Book outline", text, sha: "" }];
  }
  return parts.map((part, i) => ({
    id: `card:outline:book:p${i + 1}`,
    kind: "outline",
    entityId: "book",
    title: `Book outline (part ${i + 1} of ${parts.length})`,
    text: i === 0 ? part : `Book outline — part ${i + 1}\n${part}`,
    sha: "",
  }));
}

export function buildEntityCards(project) {
  const index = buildSceneIndex(project);
  const nameOf = entityNameResolvers(project);
  const cast = mainCastCard(project);
  return [
    ...characterCards(project, index, nameOf),
    ...(cast ? [cast] : []),
    ...placeThingCards(project, index, nameOf, "location"),
    ...placeThingCards(project, index, nameOf, "object"),
    ...groupCards(project, nameOf),
    ...worldbuildingCards(project),
    ...noteCards(project),
    ...strandCards(project),
    ...architectureCards(project),
    ...outlineCards(project),
  ].filter((card) => card.text.trim().length > 0);
}
