// ============================================================
// projectReplace.js — project-wide find & replace across scene PROSE.
//
// Operates on stored scene-body HTML, but only ever touches TEXT nodes
// (never tag names or attributes), and skips text inside @-mention chips
// (data-type="mention") — those are regenerated from the bible, so
// rewriting their label here would be both pointless and confusing.
//
// Pure functions; the store's replace actions call replaceInHtml, the
// modal calls scanScenes for a live preview.
// ============================================================

const SNIPPET_RADIUS = 40;

// Collect replaceable text nodes (skips empty nodes and mention chips).
function textNodes(doc) {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
      if (node.parentElement?.closest('[data-type="mention"]')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const out = [];
  while (walker.nextNode()) out.push(walker.currentNode);
  return out;
}

// Replace every occurrence of `term` within prose text nodes. Returns the
// new HTML (unchanged if nothing matched) and the match count.
export function replaceInHtml(html, term, replaceWith, caseSensitive = false) {
  if (!html || !term) return { html, count: 0 };
  const doc = new DOMParser().parseFromString(html, "text/html");
  const needle = caseSensitive ? term : term.toLowerCase();
  let count = 0;
  for (const node of textNodes(doc)) {
    const text = node.nodeValue;
    const hay = caseSensitive ? text : text.toLowerCase();
    if (!hay.includes(needle)) continue;
    let result = "", i = 0, idx;
    while ((idx = hay.indexOf(needle, i)) !== -1) {
      result += text.slice(i, idx) + (replaceWith ?? "");
      i = idx + needle.length;
      count++;
    }
    result += text.slice(i);
    node.nodeValue = result;
  }
  return { html: count ? doc.body.innerHTML : html, count };
}

// Count matches in one body and grab a snippet around the first one.
function countAndSnippet(html, term, caseSensitive) {
  if (!html || !term) return { count: 0, snippet: "" };
  const doc = new DOMParser().parseFromString(html, "text/html");
  const needle = caseSensitive ? term : term.toLowerCase();
  let count = 0, snippet = "";
  for (const node of textNodes(doc)) {
    const text = node.nodeValue;
    const hay = caseSensitive ? text : text.toLowerCase();
    let i = 0, idx;
    while ((idx = hay.indexOf(needle, i)) !== -1) {
      if (!snippet) {
        const start = Math.max(0, idx - SNIPPET_RADIUS);
        const end = Math.min(text.length, idx + term.length + SNIPPET_RADIUS);
        snippet = (start > 0 ? "…" : "") +
          text.slice(start, end).replace(/\s+/g, " ").trim() +
          (end < text.length ? "…" : "");
      }
      count++;
      i = idx + needle.length;
    }
  }
  return { count, snippet };
}

// Live preview: one row per scene that contains `term`, in book order.
export function scanScenes(project, term, caseSensitive = false) {
  if (!term) return { rows: [], total: 0 };
  const rows = [];
  let total = 0;
  for (const ch of project.allChapters) {
    project.scenesFor(ch.id).forEach((scn, idx) => {
      const { count, snippet } = countAndSnippet(scn.body || "", term, caseSensitive);
      if (!count) return;
      total += count;
      rows.push({
        chapterId: ch.id,
        chapterNum: ch.num,
        chapterTitle: ch.title,
        sceneId: scn.id,
        sceneIdx: idx + 1,
        sceneTitle: scn.title || `Scene ${idx + 1}`,
        sceneStatus: scn.status,
        count,
        snippet,
      });
    });
  }
  return { rows, total };
}
