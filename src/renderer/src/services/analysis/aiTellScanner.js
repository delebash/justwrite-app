// AI-tell phrase scanner — find prose that "smells of AI".
//
// Pure deterministic — no LLM call. Walks every chapter / scene,
// runs each phrase pattern over the plain text, and returns matches
// with the surrounding sentence for context. The phrase list is
// hand-curated from the most common giveaway constructions in
// LLM-assisted fiction: clichéd similes, hedging gerunds, journalistic
// tells, the "in a world where" register, and the catalog of stock
// AI verbs ("delved into", "navigated the complexities", "stood as a
// testament to").
//
// This catches the easy ones — the hard ones (cadence, paragraph
// shape, the way LLMs over-balance "and" clauses) need a model to
// hear. For first ship the deterministic pass is the headline; the
// LLM-augmented pass can be a follow-up.

// ─── Phrase library ─────────────────────────────────────────────────
// Each entry: { pattern: RegExp (case-insensitive, global flag added
// automatically), kind, blurb }. `kind` groups findings in the UI.

const RAW_PHRASES = [
  // ── Catalog tells (stock AI verbs / nouns) ─────────────────────
  { p: "delve(s|d|ing)? into", kind: "catalog", blurb: "Stock verb. \"Explore\" / \"investigate\" / \"unpack\" all read more human." },
  { p: "navigate(s|d|ing)? the complexities", kind: "catalog", blurb: "Press-release diction. Cut or rewrite concretely." },
  { p: "a testament to", kind: "catalog", blurb: "Greeting-card phrase. Replace with the specific thing that demonstrates it." },
  { p: "stand(s|ing)? as a testament", kind: "catalog", blurb: "As above, in the marble-statue register." },
  { p: "embark(s|ed|ing)? on", kind: "catalog", blurb: "Travel-brochure verb. Often just \"start\" or \"set out\"." },
  { p: "tapestry of", kind: "catalog", blurb: "Cliché metaphor. Almost always cuttable." },
  { p: "the world of", kind: "catalog", blurb: "Especially fatal as an opener." },
  { p: "in a world where", kind: "catalog", blurb: "Movie-trailer voice. Almost never the right register for prose." },
  { p: "ever-evolving", kind: "catalog", blurb: "Hedged adjective; describes nothing specific." },
  { p: "ever-changing", kind: "catalog", blurb: "Same as above." },
  { p: "intricate (web|dance|tapestry|interplay) of", kind: "catalog", blurb: "Stock metaphor chain. Be concrete." },
  { p: "rich (tapestry|history|culture|tradition) of", kind: "catalog", blurb: "Stock travel-blog adjective." },
  { p: "shed light on", kind: "catalog", blurb: "Press-release verb. Show what was illuminated, not that something was \"shed\"." },
  { p: "paint(s|ed|ing)? a (picture|portrait) of", kind: "catalog", blurb: "Tell, not show. Show the picture itself." },
  { p: "labyrinth(ine)? (of|world)", kind: "catalog", blurb: "Overworked metaphor." },
  { p: "kaleidoscope of", kind: "catalog", blurb: "Stock metaphor for variety. Almost always cuttable." },
  { p: "symphony of", kind: "catalog", blurb: "Stock metaphor for combined elements. Be specific." },
  { p: "myriad of", kind: "catalog", blurb: "Even strict usage prefers \"myriad\" without \"of\"; AI uses it as flavour text." },
  { p: "plethora of", kind: "catalog", blurb: "Status-signalling synonym for \"many\"." },
  { p: "the very fabric of", kind: "catalog", blurb: "Cliché." },

  // ── Body-language tells (clichéd physical descriptions) ────────
  { p: "her eyes (twinkled|sparkled|glittered|danced)", kind: "body", blurb: "Cliché. Bodies don't sparkle. Find the actual visible thing." },
  { p: "his eyes (twinkled|sparkled|glittered|danced)", kind: "body", blurb: "As above." },
  { p: "(?:a |an )?(small|slight|sad|wry|gentle|knowing|tight) smile (played|crept|tugged) (at|across)", kind: "body", blurb: "Stock smile-as-emotion-indicator. Replace with the cause, not the smile." },
  { p: "heart (raced|pounded|hammered|skipped a beat)", kind: "body", blurb: "Stock fear/excitement tell. Almost always tellier than what could replace it." },
  { p: "stomach (churned|knotted|clenched|dropped|sank)", kind: "body", blurb: "Stock anxiety tell." },
  { p: "(blood )?ran (cold|hot)", kind: "body", blurb: "Stock fear/anger phrase." },
  { p: "shiver (ran|went) down (?:his|her|their|my) spine", kind: "body", blurb: "Industrial-grade cliché." },
  { p: "let out a (?:long )?(?:slow )?(?:shaky )?breath", kind: "body", blurb: "Often replaces a real reaction." },
  { p: "took a deep breath", kind: "body", blurb: "Over-used emotional transition." },
  { p: "exchanged (a )?(knowing )?(glance|look)", kind: "body", blurb: "Soap-opera shorthand." },
  { p: "couldn't help but", kind: "body", blurb: "Hedged emotional reveal. The character either did or didn't; commit." },
  { p: "felt (a|an) (chill|warmth|pang|wave|shiver|stir(ring)?)", kind: "body", blurb: "Filter word + stock physical metaphor." },

  // ── Hedging / qualifier tells ──────────────────────────────────
  { p: "(?:somehow|somewhat|quite|rather|very|really|just|simply) (?:an? |the )?(?:\\w+ ){0,2}(?:knew|felt|seemed|appeared|noticed|realized|sensed)", kind: "hedge", blurb: "Hedge + filter word; both layers distance the reader." },
  { p: "in (?:a sense|some sense|some way|a way)", kind: "hedge", blurb: "Hedging phrase. Cut or commit." },
  { p: "(?:perhaps|maybe) (?:it was|she was|he was|they were)", kind: "hedge", blurb: "Hedge introducing a half-claim. Pick a side." },
  { p: "a (?:certain|sort of|kind of)", kind: "hedge", blurb: "Vagueness flag." },

  // ── Cadence tells (LLM rhythm signatures) ──────────────────────
  { p: "not (?:just|only) [\\w\\s]{1,30}, but [\\w\\s]{1,30}", kind: "cadence", blurb: "\"Not only X, but Y\" — over-balanced AI cadence." },
  { p: "more than (?:just |merely )?[\\w\\s]{1,30}; (?:it|she|he|they) (?:was|were|is|are)", kind: "cadence", blurb: "Press-release cadence." },
  { p: "what (?:had )?(?:begun|started) as [\\w\\s]{1,30} (?:had )?(?:become|turned into)", kind: "cadence", blurb: "Stock arc-summary sentence." },

  // ── Register tells (out-of-genre diction) ──────────────────────
  { p: "in conclusion", kind: "register", blurb: "Essay register. Never in fiction." },
  { p: "ultimately, [a-z]", kind: "register", blurb: "Essay transition. Cut." },
  { p: "as we (have )?seen", kind: "register", blurb: "Essay register." },
  { p: "it is important to (note|remember|consider)", kind: "register", blurb: "Essay register. Cut." },
  { p: "(?:above all|at the heart of|cornerstone|bedrock) (?:it is|of)?", kind: "register", blurb: "Editorial register, almost always tellier than what it replaces." },
];

// Build a single compiled regex set once.
const COMPILED = RAW_PHRASES.map((entry) => ({
  re: new RegExp(entry.p, "gi"),
  kind: entry.kind,
  blurb: entry.blurb,
  source: entry.p,
}));

export const TELL_KINDS = {
  catalog:  { label: "Stock catalog phrase", colour: "var(--accent-ink)" },
  body:     { label: "Body-language cliché", colour: "var(--gold)" },
  hedge:    { label: "Hedge / qualifier",    colour: "var(--muted)" },
  cadence:  { label: "AI cadence",           colour: "var(--danger)" },
  register: { label: "Out-of-genre register", colour: "var(--status-revise)" },
};

// ─── Helpers ────────────────────────────────────────────────────────

function htmlToText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll(".ai-del").forEach((el) => el.remove());
  div.querySelectorAll(".ai-ins").forEach((el) => el.replaceWith(...el.childNodes));
  div.querySelectorAll(".scene-mark").forEach((el) => el.remove());
  return div.textContent || "";
}

// Find the sentence containing offset `at` within `text`. Returns the
// trimmed sentence (capped at ~200 chars) so the writer can read the
// match in context without opening the chapter.
function sentenceAround(text, at) {
  if (!text) return "";
  let start = at;
  let end = at;
  while (start > 0 && !/[.!?]\s/.test(text.slice(start - 2, start))) start--;
  if (start > 0 && /\s/.test(text[start])) start += 1;
  while (end < text.length && !/[.!?]/.test(text[end])) end++;
  if (end < text.length) end += 1;
  let snippet = text.slice(start, end).trim();
  if (snippet.length > 220) snippet = snippet.slice(0, 220) + "…";
  return snippet;
}

// ─── Scan ──────────────────────────────────────────────────────────

/**
 * Scan the project's prose for AI-tell phrases.
 *
 * @param {object} project   project store
 * @returns {{
 *   findings: Array<{
 *     id, kind, blurb, phrase, snippet,
 *     chapterId, chapterNum, chapterTitle,
 *     sceneId, sceneIdx, sceneTitle,
 *   }>,
 *   countsByKind: Record<string, number>,
 *   totalChapters: number,
 *   scannedChapters: number,
 * }}
 */
export function scanAiTells(project) {
  if (!project) return { findings: [], countsByKind: {}, totalChapters: 0, scannedChapters: 0 };

  const findings = [];
  const countsByKind = {};
  const all = project.allChapters;
  let scannedChapters = 0;

  for (const ch of all) {
    const scenes = project.scenesFor(ch.id) || [];
    let chapterScanned = false;
    for (let si = 0; si < scenes.length; si++) {
      const scn = scenes[si];
      const text = htmlToText(scn.body);
      if (!text || text.length < 20) continue;
      chapterScanned = true;
      for (const entry of COMPILED) {
        entry.re.lastIndex = 0;
        let m;
        // biome-ignore lint/suspicious/noAssignInExpressions: regex.exec loop
        while ((m = entry.re.exec(text)) !== null) {
          const at = m.index;
          const phrase = m[0];
          const snippet = sentenceAround(text, at);
          findings.push({
            id: `tell_${ch.id}_${scn.id}_${entry.source}_${at}`,
            kind: entry.kind,
            blurb: entry.blurb,
            phrase,
            snippet,
            chapterId: ch.id,
            chapterNum: ch.num,
            chapterTitle: ch.title || "",
            sceneId: scn.id,
            sceneIdx: si,
            sceneTitle: scn.title || "",
          });
          countsByKind[entry.kind] = (countsByKind[entry.kind] || 0) + 1;
          // Avoid runaway matches if the pattern matches an empty string.
          if (m.index === entry.re.lastIndex) entry.re.lastIndex += 1;
        }
      }
    }
    if (chapterScanned) scannedChapters += 1;
  }

  return {
    findings,
    countsByKind,
    totalChapters: all.length,
    scannedChapters,
  };
}
