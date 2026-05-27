// ============================================================
// search.js — full-text search across every entity in the project.
//
// Builds a lightweight inverted index (Map<token, Set<docId>>)
// over chapters, characters, locations, objects, groups, notes,
// worldbuilding, plotlines, and architecture documents.
//
// Query: tokenize the input, intersect posting lists (AND), then
// rank by per-token frequency. Returns hits with snippet windows
// around the first match, plus per-token match offsets so the
// UI can highlight.
//
// No dependencies. Re-build the index whenever the project store
// changes — buildIndex() is cheap (linear in total field text)
// and the result is read-only.
// ============================================================

/**
 * Lowercase + strip diacritics + split on word boundaries.
 * Tokens shorter than 2 chars are dropped to keep the index small.
 */
export function tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")  // strip combining marks
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

/**
 * Strip HTML tags from a chapter body so the index sees plain prose
 * and snippets render readably.
 */
function stripHtml(html) {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent || "").replace(/\s+/g, " ").trim();
}

/**
 * Build the project-wide index. Returns:
 *   { docs: Map<id, doc>, postings: Map<token, Set<id>> }
 *
 * A doc looks like:
 *   { id, kind, title, body, route, sub?, sort? }
 * where `route` is the path to navigate to on click.
 *
 * Optional `speakers` argument: a Map<chapterId, Set<characterId>>
 * derived from studio.scripts. When provided, character names are
 * folded into the chapter's indexed body so a "speakers: Renn" style
 * filter (or a plain name search) hits chapters where the character
 * has dialogue, even if the prose body doesn't mention them by name.
 */
export function buildIndex(project, speakers = null) {
  const docs = new Map();
  const postings = new Map();

  // Resolve character ids back to display names so the index sees
  // searchable strings rather than opaque IDs.
  const charNameById = new Map((project.characters || []).map((c) => [c.id, c.name]));

  function indexDoc(doc) {
    docs.set(doc.id, doc);
    const seen = new Set();
    for (const field of [doc.title, doc.sub, doc.body]) {
      for (const tok of tokenize(field)) {
        // Dedup per doc so frequency reflects unique terms; full-text
        // counts come from re-scanning the body later.
        if (seen.has(tok)) continue;
        seen.add(tok);
        let set = postings.get(tok);
        if (!set) { set = new Set(); postings.set(tok, set); }
        set.add(doc.id);
      }
    }
  }

  // Chapters — title + body (stripped HTML) + speaker names if available.
  for (const part of project.parts) {
    for (const ch of part.chapters) {
      const bodyText = stripHtml(project.chapterBody[ch.id]);
      const speakerSet = speakers?.[ch.id];
      const speakerNames = speakerSet
        ? [...speakerSet].map((id) => charNameById.get(id)).filter(Boolean).join(" ")
        : "";
      indexDoc({
        id: `chapter:${ch.id}`,
        kind: "chapter",
        title: `Ch. ${ch.num} — ${ch.title}`,
        sub: part.title,
        body: speakerNames ? `${bodyText}\n[speakers: ${speakerNames}]` : bodyText,
        route: `/chapters/${ch.id}`,
        sort: ch.num,
      });
    }
  }

  // Characters — name + role + oneLiner + extras (motivation, arc, voice, backstory).
  for (const c of project.characters) {
    const e = project.characterExtras?.[c.id] || {};
    const extras = [
      e.backstory,
      e.motivation?.want, e.motivation?.need, e.motivation?.lie, e.motivation?.truth,
      e.arc?.start, e.arc?.midpoint, e.arc?.end,
      e.voice?.accent, e.voice?.vocabulary, e.voice?.tic, e.voice?.sample,
    ].filter(Boolean).join(" • ");
    indexDoc({
      id: `character:${c.id}`,
      kind: "character",
      title: c.name,
      sub: c.role,
      body: `${c.oneLiner || ""} ${extras}`.trim(),
      route: `/characters/${c.id}`,
    });
  }

  // Locations, Objects — name + kind + note.
  for (const l of project.locations) {
    indexDoc({ id: `location:${l.id}`, kind: "location", title: l.name, sub: l.kind, body: l.note, route: `/locations/${l.id}` });
  }
  for (const o of project.objects) {
    indexDoc({ id: `object:${o.id}`, kind: "object", title: o.name, sub: o.kind, body: o.note, route: `/objects/${o.id}` });
  }

  // Notes — title + tag + body.
  for (const n of project.notes) {
    indexDoc({ id: `note:${n.id}`, kind: "note", title: n.title, sub: n.tag, body: n.body, route: `/notes/${n.id}` });
  }

  // Groups — name + blurb + member names.
  for (const g of project.groups) {
    const members = (g.members || []).map((m) => m.name).join(", ");
    indexDoc({ id: `group:${g.id}`, kind: "group", title: g.name, sub: members, body: g.blurb, route: `/groups/${g.id}` });
  }

  // Plotlines — name + blurb (for subplot search).
  for (const s of project.plotlines) {
    indexDoc({ id: `plotline:${s.id}`, kind: "plotline", title: s.name, sub: "Plotline", body: s.blurb || "", route: `/plotlines` });
  }

  // Worldbuilding — title + summary + body, grouped by category in UI.
  for (const a of project.worldbuilding) {
    indexDoc({
      id: `worldbuilding:${a.id}`,
      kind: "worldbuilding",
      title: a.title,
      sub: a.category,
      body: `${a.summary || ""} ${a.body || ""}`.trim(),
      route: `/worldbuilding/${a.id}`,
    });
  }

  // Architecture — premise, fabula, setting, global notes.
  for (const [id, doc] of Object.entries(project.architecture || {})) {
    indexDoc({
      id: `architecture:${id}`,
      kind: "architecture",
      title: doc.title,
      sub: doc.blurb,
      body: doc.body,
      route: `/architecture`,
    });
  }

  return { docs, postings };
}

/**
 * Search the index. Returns an array of hits sorted by score (desc).
 *
 *   { doc, score, snippet, snippetMatches: [[start, end], …] }
 *
 * Options:
 *   - kinds: Set<string> of allowed kinds (defaults to all)
 *   - limit: cap on returned hits (default 100)
 *   - snippetLen: chars of context per snippet (default 160)
 */
export function searchIndex(index, query, { kinds, limit = 100, snippetLen = 160 } = {}) {
  if (!query || !query.trim()) return [];
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  // Intersect posting lists (AND across tokens).
  let candidates = null;
  for (const tok of tokens) {
    // Token wildcard: any indexed term that contains the query token.
    // Cheap because we walk postings only once per query token.
    const matched = new Set();
    for (const [term, ids] of index.postings) {
      if (term === tok || term.includes(tok)) {
        for (const id of ids) matched.add(id);
      }
    }
    candidates = candidates === null ? matched : intersect(candidates, matched);
    if (candidates.size === 0) return [];
  }

  // Score by full-text term frequency across title + body.
  const hits = [];
  for (const id of candidates) {
    const doc = index.docs.get(id);
    if (!doc) continue;
    if (kinds && !kinds.has(doc.kind)) continue;
    const haystack = `${doc.title || ""}\n${doc.sub || ""}\n${doc.body || ""}`;
    const lower = haystack.toLowerCase();
    let score = 0;
    let firstIdx = Infinity;
    for (const tok of tokens) {
      let i = 0, count = 0;
      while ((i = lower.indexOf(tok, i)) !== -1) {
        count++; if (i < firstIdx) firstIdx = i; i += tok.length;
      }
      score += count;
      // Title hits weighted heavier.
      if ((doc.title || "").toLowerCase().includes(tok)) score += 5;
    }
    const { text, matches } = buildSnippet(haystack, lower, tokens, firstIdx, snippetLen);
    hits.push({ doc, score, snippet: text, snippetMatches: matches });
  }

  hits.sort((a, b) => b.score - a.score || (a.doc.sort ?? 0) - (b.doc.sort ?? 0));
  return hits.slice(0, limit);
}

function intersect(a, b) {
  const out = new Set();
  const [s, l] = a.size < b.size ? [a, b] : [b, a];
  for (const v of s) if (l.has(v)) out.add(v);
  return out;
}

/**
 * Pull a context window centred on the first match, then mark
 * every match in that window so the UI can render <mark> spans.
 */
function buildSnippet(haystack, lower, tokens, firstIdx, snippetLen) {
  if (!isFinite(firstIdx) || haystack.length === 0) {
    return { text: (haystack || "").slice(0, snippetLen), matches: [] };
  }
  const half = Math.floor(snippetLen / 2);
  let start = Math.max(0, firstIdx - half);
  let end = Math.min(haystack.length, start + snippetLen);
  start = Math.max(0, end - snippetLen);  // re-anchor if we hit the right edge

  // Snap to word boundaries so we don't cut mid-word.
  while (start > 0 && /\w/.test(haystack[start - 1]) && haystack[start - 1] !== "\n") start--;
  while (end < haystack.length && /\w/.test(haystack[end])) end++;

  const text = (start > 0 ? "… " : "") + haystack.slice(start, end).replace(/\s+/g, " ").trim() + (end < haystack.length ? " …" : "");
  const offset = (start > 0 ? 2 : 0) - start;  // account for the prepended ellipsis

  // Find all token offsets inside the original window, translate to the new string.
  const matches = [];
  for (const tok of tokens) {
    let i = start;
    while ((i = lower.indexOf(tok, i)) !== -1 && i < end) {
      const s = i + offset, e = s + tok.length;
      if (s >= 0 && e <= text.length) matches.push([s, e]);
      i += tok.length;
    }
  }
  // Merge overlapping ranges.
  matches.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of matches) {
    const prev = merged[merged.length - 1];
    if (prev && s <= prev[1]) prev[1] = Math.max(prev[1], e);
    else merged.push([s, e]);
  }

  return { text, matches: merged };
}

/**
 * Render a snippet string with `<mark>` spans inserted at the match
 * offsets. Returns an array of {text, mark:boolean} segments so Vue
 * can render them with v-for without using v-html (XSS-safe).
 */
export function renderSnippet(snippet, matches) {
  if (!matches || matches.length === 0) return [{ text: snippet, mark: false }];
  const out = [];
  let cur = 0;
  for (const [s, e] of matches) {
    if (s > cur) out.push({ text: snippet.slice(cur, s), mark: false });
    out.push({ text: snippet.slice(s, e), mark: true });
    cur = e;
  }
  if (cur < snippet.length) out.push({ text: snippet.slice(cur), mark: false });
  return out;
}

export const KIND_META = {
  chapter:       { label: "Chapters",       icon: "Book",      order: 1 },
  character:     { label: "Characters",     icon: "Users",     order: 2 },
  location:      { label: "Locations",      icon: "Pin",       order: 3 },
  object:        { label: "Objects",        icon: "Cube",      order: 4 },
  group:         { label: "Groups",         icon: "GroupIcon", order: 5 },
  worldbuilding: { label: "Worldbuilding",  icon: "Sparkle",   order: 6 },
  note:          { label: "Notes",          icon: "Note",      order: 7 },
  plotline:      { label: "Plotlines",      icon: "Plotlines", order: 8 },
  architecture:  { label: "Architecture",   icon: "Building",  order: 9 },
};
