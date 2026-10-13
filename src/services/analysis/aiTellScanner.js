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

import { htmlToText } from "../text.js";

// ─── Phrase library ─────────────────────────────────────────────────
// Each entry: { pattern: RegExp (case-insensitive, global flag added
// automatically), kind, blurbKey }. The patterns are English prose and stay English (ruled
// 2026-10-13); the note shown with a finding is a key, translated where it renders. `kind` groups findings in the UI.

const RAW_PHRASES = [
  // ── Catalog tells (stock AI verbs / nouns) ─────────────────────
  { p: "delve(s|d|ing)? into", kind: "catalog", blurbKey: "aiTell.note.delveInto" },
  { p: "navigate(s|d|ing)? the complexities", kind: "catalog", blurbKey: "aiTell.note.navigateTheComplexities" },
  { p: "a testament to", kind: "catalog", blurbKey: "aiTell.note.aTestamentTo" },
  { p: "stand(s|ing)? as a testament", kind: "catalog", blurbKey: "aiTell.note.standAsATestament" },
  { p: "embark(s|ed|ing)? on", kind: "catalog", blurbKey: "aiTell.note.embarkOn" },
  { p: "tapestry of", kind: "catalog", blurbKey: "aiTell.note.tapestryOf" },
  { p: "the world of", kind: "catalog", blurbKey: "aiTell.note.theWorldOf" },
  { p: "in a world where", kind: "catalog", blurbKey: "aiTell.note.inAWorldWhere" },
  { p: "ever-evolving", kind: "catalog", blurbKey: "aiTell.note.everEvolving" },
  { p: "ever-changing", kind: "catalog", blurbKey: "aiTell.note.everChanging" },
  { p: "intricate (web|dance|tapestry|interplay) of", kind: "catalog", blurbKey: "aiTell.note.intricateOf" },
  { p: "rich (tapestry|history|culture|tradition) of", kind: "catalog", blurbKey: "aiTell.note.richOf" },
  { p: "shed light on", kind: "catalog", blurbKey: "aiTell.note.shedLightOn" },
  { p: "paint(s|ed|ing)? a (picture|portrait) of", kind: "catalog", blurbKey: "aiTell.note.paintAOf" },
  { p: "labyrinth(ine)? (of|world)", kind: "catalog", blurbKey: "aiTell.note.labyrinth" },
  { p: "kaleidoscope of", kind: "catalog", blurbKey: "aiTell.note.kaleidoscopeOf" },
  { p: "symphony of", kind: "catalog", blurbKey: "aiTell.note.symphonyOf" },
  { p: "myriad of", kind: "catalog", blurbKey: "aiTell.note.myriadOf" },
  { p: "plethora of", kind: "catalog", blurbKey: "aiTell.note.plethoraOf" },
  { p: "the very fabric of", kind: "catalog", blurbKey: "aiTell.note.theVeryFabricOf" },

  // ── Body-language tells (clichéd physical descriptions) ────────
  { p: "her eyes (twinkled|sparkled|glittered|danced)", kind: "body", blurbKey: "aiTell.note.herEyes" },
  { p: "his eyes (twinkled|sparkled|glittered|danced)", kind: "body", blurbKey: "aiTell.note.hisEyes" },
  { p: "(?:a |an )?(small|slight|sad|wry|gentle|knowing|tight) smile (played|crept|tugged) (at|across)", kind: "body", blurbKey: "aiTell.note.smile" },
  { p: "heart (raced|pounded|hammered|skipped a beat)", kind: "body", blurbKey: "aiTell.note.heart" },
  { p: "stomach (churned|knotted|clenched|dropped|sank)", kind: "body", blurbKey: "aiTell.note.stomach" },
  { p: "(blood )?ran (cold|hot)", kind: "body", blurbKey: "aiTell.note.ran" },
  { p: "shiver (ran|went) down (?:his|her|their|my) spine", kind: "body", blurbKey: "aiTell.note.shiverDownSpine" },
  { p: "let out a (?:long )?(?:slow )?(?:shaky )?breath", kind: "body", blurbKey: "aiTell.note.letOutABreath" },
  { p: "took a deep breath", kind: "body", blurbKey: "aiTell.note.tookADeepBreath" },
  { p: "exchanged (a )?(knowing )?(glance|look)", kind: "body", blurbKey: "aiTell.note.exchanged" },
  { p: "couldn't help but", kind: "body", blurbKey: "aiTell.note.couldnTHelpBut" },
  { p: "felt (a|an) (chill|warmth|pang|wave|shiver|stir(ring)?)", kind: "body", blurbKey: "aiTell.note.felt" },

  // ── Hedging / qualifier tells ──────────────────────────────────
  { p: "(?:somehow|somewhat|quite|rather|very|really|just|simply) (?:an? |the )?(?:\\w+ ){0,2}(?:knew|felt|seemed|appeared|noticed|realized|sensed)", kind: "hedge", blurbKey: "aiTell.note.02" },
  { p: "in (?:a sense|some sense|some way|a way)", kind: "hedge", blurbKey: "aiTell.note.in" },
  { p: "(?:perhaps|maybe) (?:it was|she was|he was|they were)", kind: "hedge", blurbKey: "aiTell.note.tell" },
  { p: "a (?:certain|sort of|kind of)", kind: "hedge", blurbKey: "aiTell.note.a" },

  // ── Cadence tells (LLM rhythm signatures) ──────────────────────
  { p: "not (?:just|only) [\\w\\s]{1,30}, but [\\w\\s]{1,30}", kind: "cadence", blurbKey: "aiTell.note.not130But130" },
  { p: "more than (?:just |merely )?[\\w\\s]{1,30}; (?:it|she|he|they) (?:was|were|is|are)", kind: "cadence", blurbKey: "aiTell.note.moreThan130" },
  { p: "what (?:had )?(?:begun|started) as [\\w\\s]{1,30} (?:had )?(?:become|turned into)", kind: "cadence", blurbKey: "aiTell.note.whatAs130" },

  // ── Register tells (out-of-genre diction) ──────────────────────
  { p: "in conclusion", kind: "register", blurbKey: "aiTell.note.inConclusion" },
  { p: "ultimately, [a-z]", kind: "register", blurbKey: "aiTell.note.ultimatelyAZ" },
  { p: "as we (have )?seen", kind: "register", blurbKey: "aiTell.note.asWeSeen" },
  { p: "it is important to (note|remember|consider)", kind: "register", blurbKey: "aiTell.note.itIsImportantTo" },
  { p: "(?:above all|at the heart of|cornerstone|bedrock) (?:it is|of)?", kind: "register", blurbKey: "aiTell.note.tellX" },
];

// Build a single compiled regex set once.
const COMPILED = RAW_PHRASES.map((entry) => ({
  re: new RegExp(entry.p, "gi"),
  kind: entry.kind,
  blurbKey: entry.blurbKey,
  source: entry.p,
}));

export const TELL_KINDS = {
  catalog:  { labelKey: "aiTell.kind.catalog", colour: "var(--accent-ink)" },
  body:     { labelKey: "aiTell.kind.body", colour: "var(--gold)" },
  hedge:    { labelKey: "aiTell.kind.hedge",    colour: "var(--muted)" },
  cadence:  { labelKey: "aiTell.kind.cadence",           colour: "var(--danger)" },
  register: { labelKey: "aiTell.kind.register", colour: "var(--status-revise)" },
};

// ─── Helpers ────────────────────────────────────────────────────────

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
  if (snippet.length > 220) snippet = `${snippet.slice(0, 220)}…`;
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
      const text = htmlToText(scn.body, { trim: false });
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
            blurbKey: entry.blurbKey,
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
