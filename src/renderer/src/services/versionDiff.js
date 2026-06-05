// Diff between two chapter versions.
//
// Versions in the versions store are arrays of scenes:
//   [{ id, title, body }, ...]
//
// Diff strategy:
//   1. Match scenes by id across versions. Restored versions preserve
//      ids, so this is the reliable axis.
//   2. For scenes that DIDN'T match by id, run a fuzzy content-similarity
//      pass: pair an unmatched-old with an unmatched-new when their body
//      texts share enough vocabulary (Jaccard ≥ FUZZY_MATCH_THRESHOLD).
//      Greedy by descending similarity; each scene matches at most once.
//      This catches scenes that survived with a different id (rare, but
//      possible after copy-paste rebuilds or schema migrations).
//   3. For each matched pair (id or fuzzy): split bodies into paragraphs
//      and run LCS on paragraph text to mark each as eq / del / ins.
//   4. Remaining unmatched-in-new → wholly inserted; unmatched-in-old →
//      wholly deleted.
//   5. Preserve scene ORDER from the new version, with deleted scenes
//      slotted at the position they last held in the old version.

// Empirical: 0.6 leaves room for substantial revisions (e.g. ~half the
// vocabulary swapped) to still match, while keeping unrelated scenes
// firmly below the line.
const FUZZY_MATCH_THRESHOLD = 0.6;
//
// Output: an array of "scene-diff" entries, each with:
//   { kind: "eq" | "ins" | "del" | "modified",
//     sceneId, title, paragraphs: [{ kind, html }], titleChange: { from, to } | null }
//
// `paragraphs[].html` is the inner HTML of the original <p> (so inline
// formatting survives the diff). Rendering is the caller's job — a
// helper renderDiffHtml() does the standard "ins/del block" markup.

function splitParagraphs(html) {
  if (!html) return [];
  const div = document.createElement("div");
  div.innerHTML = html;
  const out = [];
  for (const child of div.children) {
    if (child.tagName === "P") {
      if (child.classList.contains("scene-mark")) continue;
      out.push({ html: child.innerHTML, text: (child.textContent || "").trim() });
    } else {
      // Non-paragraph block (h2.scene-title, hr, etc.). Treat as its
      // own line so heading-only changes still register.
      out.push({ html: child.outerHTML, text: (child.textContent || "").trim() });
    }
  }
  // Fall back to the whole HTML if no top-level blocks were found.
  if (!out.length && div.innerHTML.trim()) {
    out.push({ html: div.innerHTML, text: (div.textContent || "").trim() });
  }
  return out;
}

// Standard LCS table → backtrace into ins/del/eq operations.
// Input: two arrays of comparable keys (strings here).
// Output: ordered list of { kind: "eq" | "ins" | "del", aIdx, bIdx }
// where aIdx is the index in `a` (-1 for ins) and bIdx in `b` (-1 for del).
function lcsDiff(a, b, eq = (x, y) => x === y) {
  const m = a.length, n = b.length;
  // Edge cases avoid the O(mn) table when one side is empty.
  if (m === 0) return b.map((_, i) => ({ kind: "ins", aIdx: -1, bIdx: i }));
  if (n === 0) return a.map((_, i) => ({ kind: "del", aIdx: i, bIdx: -1 }));

  // Build LCS length table.
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = eq(a[i - 1], b[j - 1])
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  // Backtrace.
  const ops = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (eq(a[i - 1], b[j - 1])) {
      ops.push({ kind: "eq", aIdx: i - 1, bIdx: j - 1 });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.push({ kind: "del", aIdx: i - 1, bIdx: -1 });
      i--;
    } else {
      ops.push({ kind: "ins", aIdx: -1, bIdx: j - 1 });
      j--;
    }
  }
  while (i > 0) { ops.push({ kind: "del", aIdx: i - 1, bIdx: -1 }); i--; }
  while (j > 0) { ops.push({ kind: "ins", aIdx: -1, bIdx: j - 1 }); j--; }
  ops.reverse();
  return ops;
}

// Diff one scene body against another. Returns a paragraph list where
// each entry is { kind: "eq" | "ins" | "del" | "mod", html, oldHtml? }.
// "mod" entries hold inline word-level diff html — produced by pairing
// a del with an ins of the same paragraph slot when they share enough
// vocabulary (Jaccard ≥ 0.4) to be a revision rather than an unrelated
// add/remove.
function diffSceneBodies(oldHtml, newHtml) {
  const oldParas = splitParagraphs(oldHtml);
  const newParas = splitParagraphs(newHtml);
  const ops = lcsDiff(oldParas, newParas, (a, b) => a.text === b.text);

  // First-pass entries — raw del/ins/eq from the LCS, no pairing yet.
  const raw = ops.map((op) => {
    if (op.kind === "eq")  return { kind: "eq",  html: newParas[op.bIdx].html, text: newParas[op.bIdx].text };
    if (op.kind === "ins") return { kind: "ins", html: newParas[op.bIdx].html, text: newParas[op.bIdx].text };
    return                       { kind: "del", html: oldParas[op.aIdx].html, text: oldParas[op.aIdx].text };
  });

  // Pair consecutive del/ins (or ins/del) entries that look like the same
  // paragraph rewritten — collapse them into one "mod" entry showing
  // word-level inline ins/del so the user can see exactly what changed.
  const merged = [];
  for (let i = 0; i < raw.length; i++) {
    const cur = raw[i];
    const next = raw[i + 1];
    if (next && isModPair(cur, next)) {
      const oldText = cur.kind === "del" ? cur.text : next.text;
      const newText = cur.kind === "ins" ? cur.text : next.text;
      const oldHtml = cur.kind === "del" ? cur.html : next.html;
      const newHtml2 = cur.kind === "ins" ? cur.html : next.html;
      merged.push({
        kind: "mod",
        html: renderWordDiffHtml(oldText, newText),
        oldHtml,
        newHtml: newHtml2,
      });
      i++; // consume the partner
    } else {
      merged.push({ kind: cur.kind, html: cur.html });
    }
  }
  return merged;
}

// Two raw entries form a "modified paragraph" pair when they are a
// del+ins (in either order) AND share enough words to plausibly be the
// same paragraph revised. The 0.4 Jaccard floor is empirical — lower
// values (e.g. one shared filler word) shouldn't merge unrelated edits.
function isModPair(a, b) {
  const kinds = new Set([a.kind, b.kind]);
  if (!(kinds.has("del") && kinds.has("ins"))) return false;
  if (kinds.has("eq")) return false;
  return jaccard(a.text, b.text) >= 0.4;
}

function jaccard(aText, bText) {
  const aw = new Set(tokenizeForJaccard(aText));
  const bw = new Set(tokenizeForJaccard(bText));
  if (!aw.size && !bw.size) return 0;
  let intersect = 0;
  for (const w of aw) if (bw.has(w)) intersect++;
  return intersect / (aw.size + bw.size - intersect);
}

function tokenizeForJaccard(text) {
  return String(text || "").toLowerCase().match(/[\p{Letter}\p{Number}]+/gu) || [];
}

// Word-level diff: tokenize each side into (word, whitespace) chunks so
// punctuation and whitespace are preserved verbatim around the diffed
// runs. Returns inline HTML — equal runs are plain text, inserted runs
// are wrapped in <ins class="vdiff-ins">, removed in <del class="vdiff-del">.
export function renderWordDiffHtml(oldText, newText) {
  const a = tokenizeForWordDiff(oldText);
  const b = tokenizeForWordDiff(newText);
  const ops = lcsDiff(a, b, (x, y) => x === y);
  const parts = [];
  // Coalesce adjacent same-kind ops so the rendered HTML is one
  // <ins>...</ins> per run rather than one per token.
  let buf = { kind: null, text: "" };
  function flush() {
    if (!buf.text) { buf = { kind: null, text: "" }; return; }
    if (buf.kind === "eq") parts.push(escape(buf.text));
    else if (buf.kind === "ins") parts.push(`<ins class="vdiff-ins">${escape(buf.text)}</ins>`);
    else if (buf.kind === "del") parts.push(`<del class="vdiff-del">${escape(buf.text)}</del>`);
    buf = { kind: null, text: "" };
  }
  for (const op of ops) {
    const piece = op.kind === "del" ? a[op.aIdx] : b[op.bIdx];
    if (op.kind === buf.kind) buf.text += piece;
    else { flush(); buf = { kind: op.kind, text: piece }; }
  }
  flush();
  return parts.join("");
}

function tokenizeForWordDiff(text) {
  // Split into runs of word-characters and runs of whitespace/punct.
  // The diff matches on these chunks, so a punctuation change like
  // "said," → "said." doesn't blow away the matching "said".
  const out = [];
  const re = /\s+|[\p{Letter}\p{Number}]+|[^\s\p{Letter}\p{Number}]+/gu;
  let m;
  // biome-ignore lint/suspicious/noAssignInExpressions: regex.exec loop — assignment-in-while is the idiomatic pattern.
  while ((m = re.exec(String(text || ""))) !== null) out.push(m[0]);
  return out;
}

/**
 * Compute the structured diff between two chapter versions.
 *
 * @param {{ scenes: Array<{ id, title, body }> }} oldV
 * @param {{ scenes: Array<{ id, title, body }> }} newV
 * @returns {Array} scene-diff entries
 */
export function diffVersions(oldV, newV) {
  const oldScenes = oldV?.scenes || [];
  const newScenes = newV?.scenes || [];
  const oldById = new Map(oldScenes.map((s, idx) => [s.id, { ...s, _idx: idx }]));
  const newById = new Map(newScenes.map((s, idx) => [s.id, { ...s, _idx: idx }]));

  // ── Match scenes across versions ──────────────────────────────────────
  // Stage 1: exact-id matches (the reliable axis when ids survive).
  // matchedOldByNewId: newId → the oldScene it should diff against.
  const matchedOldByNewId = new Map();
  const matchedNewByOldId = new Map();
  for (const s of newScenes) {
    const oldS = oldById.get(s.id);
    if (oldS) {
      matchedOldByNewId.set(s.id, oldS);
      matchedNewByOldId.set(oldS.id, s);
    }
  }

  // Stage 2: fuzzy content match on the residue. Scenes that lost their
  // id between versions (e.g. copy-paste rebuilds) but kept the body
  // mostly intact get paired up here so they show as "modified" instead
  // of a full del+ins.
  const unmatchedNew = newScenes.filter((s) => !matchedOldByNewId.has(s.id));
  const unmatchedOld = oldScenes.filter((s) => !matchedNewByOldId.has(s.id));
  if (unmatchedNew.length && unmatchedOld.length) {
    const candidates = [];
    for (const oldS of unmatchedOld) {
      for (const newS of unmatchedNew) {
        const sim = sceneBodyJaccard(oldS.body, newS.body);
        if (sim >= FUZZY_MATCH_THRESHOLD) candidates.push({ oldS, newS, sim });
      }
    }
    // Greedy: highest-similarity pairs first, each scene at most once.
    candidates.sort((a, b) => b.sim - a.sim);
    const usedOld = new Set(), usedNewIds = new Set();
    for (const { oldS, newS } of candidates) {
      if (usedOld.has(oldS.id) || usedNewIds.has(newS.id)) continue;
      matchedOldByNewId.set(newS.id, oldById.get(oldS.id));
      matchedNewByOldId.set(oldS.id, newS);
      usedOld.add(oldS.id);
      usedNewIds.add(newS.id);
    }
  }

  // ── Walk new-version order, slotting deletions at their old position ──
  const seen = new Set();
  const out = [];

  for (let i = 0; i < newScenes.length; i++) {
    // Any old-only scenes that originally sat ABOVE position i go in
    // first, so the deletion appears in roughly its old place.
    for (const oldS of oldScenes) {
      if (seen.has(oldS.id)) continue;
      if (matchedNewByOldId.has(oldS.id)) continue;
      if (oldS._idx != null && oldS._idx >= i) continue;
      out.push(sceneDel(oldS));
      seen.add(oldS.id);
    }

    const s = newScenes[i];
    seen.add(s.id);
    const oldS = matchedOldByNewId.get(s.id);
    if (!oldS) {
      out.push(sceneIns(s));
    } else {
      const paragraphs = diffSceneBodies(oldS.body, s.body);
      const titleChange = oldS.title !== s.title ? { from: oldS.title, to: s.title } : null;
      const allEq = paragraphs.every((p) => p.kind === "eq") && !titleChange;
      out.push({
        kind: allEq ? "eq" : "modified",
        sceneId: s.id,
        title: s.title,
        titleChange,
        paragraphs,
      });
    }
  }
  // Tail-end deletions (scenes that lived after the last surviving
  // scene's original position).
  for (const oldS of oldScenes) {
    if (seen.has(oldS.id)) continue;
    if (matchedNewByOldId.has(oldS.id)) continue;
    out.push(sceneDel(oldS));
  }

  return out;
}

// Jaccard similarity over the word sets of two scene bodies (HTML
// stripped to text first). Returns 0 when either side is empty.
function sceneBodyJaccard(oldHtml, newHtml) {
  const aText = htmlToText(oldHtml);
  const bText = htmlToText(newHtml);
  return jaccard(aText, bText);
}

function htmlToText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || "";
}

function sceneIns(s) {
  return {
    kind: "ins",
    sceneId: s.id,
    title: s.title,
    titleChange: null,
    paragraphs: splitParagraphs(s.body).map((p) => ({ kind: "ins", html: p.html })),
  };
}
function sceneDel(s) {
  return {
    kind: "del",
    sceneId: s.id,
    title: s.title,
    titleChange: null,
    paragraphs: splitParagraphs(s.body).map((p) => ({ kind: "del", html: p.html })),
  };
}

/**
 * Render the structured diff as a single HTML string suitable for
 * dropping into a read-only panel. Uses `vdiff-*` classes so styling
 * is decoupled from the interactive AI diff marks.
 */
export function renderDiffHtml(diff) {
  if (!diff || !diff.length) return "<p class=\"vdiff-empty\">No changes between these versions.</p>";
  const parts = [];
  for (const scene of diff) {
    const wrapClass = scene.kind === "ins"
      ? "vdiff-scene vdiff-scene--ins"
      : scene.kind === "del"
        ? "vdiff-scene vdiff-scene--del"
        : "vdiff-scene";
    parts.push(`<section class="${wrapClass}">`);
    if (scene.titleChange) {
      parts.push(`<h2 class="vdiff-scene-title">`);
      parts.push(`<del class="vdiff-del">${escape(scene.titleChange.from || "(untitled)")}</del> `);
      parts.push(`<ins class="vdiff-ins">${escape(scene.titleChange.to || "(untitled)")}</ins>`);
      parts.push(`</h2>`);
    } else if (scene.title) {
      parts.push(`<h2 class="vdiff-scene-title">${escape(scene.title)}</h2>`);
    }
    for (const p of scene.paragraphs) {
      if (p.kind === "eq") {
        parts.push(`<p>${p.html}</p>`);
      } else if (p.kind === "ins") {
        parts.push(`<p class="vdiff-row vdiff-row--ins"><ins class="vdiff-ins">${p.html}</ins></p>`);
      } else if (p.kind === "del") {
        parts.push(`<p class="vdiff-row vdiff-row--del"><del class="vdiff-del">${p.html}</del></p>`);
      } else if (p.kind === "mod") {
        // Word-level diff already rendered as inline HTML by
        // renderWordDiffHtml — drop it straight into the paragraph.
        parts.push(`<p class="vdiff-row vdiff-row--mod">${p.html}</p>`);
      }
    }
    parts.push(`</section>`);
  }
  return parts.join("");
}

function escape(s) {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// Quick stats for the diff header — "+12 / −5 paragraphs across 2 scenes".
// "mod" paragraphs (one revised) count as one ins and one del — they
// represent both a removal and an addition in equal measure.
export function diffStats(diff) {
  let ins = 0, del = 0, scenesChanged = 0, scenesAdded = 0, scenesRemoved = 0;
  for (const scene of diff) {
    if (scene.kind === "ins") scenesAdded++;
    else if (scene.kind === "del") scenesRemoved++;
    else if (scene.kind === "modified") scenesChanged++;
    for (const p of scene.paragraphs) {
      if (p.kind === "ins") ins++;
      else if (p.kind === "del") del++;
      else if (p.kind === "mod") { ins++; del++; }
    }
  }
  return { ins, del, scenesChanged, scenesAdded, scenesRemoved };
}
