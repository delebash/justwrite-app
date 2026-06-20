// Deterministic per-chapter prose metrics. Pure functions, no LLM —
// these are fast enough to compute on every chapter on every view.
//
// All inputs are chapter HTML strings (the format the project store
// already returns from `chapterBody`). The metrics deliberately stay
// approximate where being precise would mean parsing English; the goal
// is "this chapter is heavier on dialogue than the rest of the book,"
// not literary forensics.

// Filter words distance the POV character from direct perception.
// Hand-picked from the writing-craft canon (Sol Stein, Browne & King).
const FILTER_WORDS = [
  "saw", "see", "seen", "looking", "looked", "looks",
  "heard", "hear", "hearing",
  "felt", "feel", "feeling", "feels",
  "noticed", "notice", "noticing",
  "realized", "realize", "realizing",
  "thought", "thinking", "thinks",
  "watched", "watching", "watches",
  "seemed", "seems", "seeming",
  "wondered", "wondering",
  "knew", "knows",
];
const FILTER_RE = new RegExp(`\\b(${FILTER_WORDS.join("|")})\\b`, "gi");

// Adverbs ending in -ly. Excludes a small list of common non-adverbs
// ("only", "really", "family", …) so they don't bloat the count.
const ADVERB_EXCLUDES = new Set([
  "only", "really", "family", "lily", "rally", "silly", "lonely",
  "early", "lively", "ugly", "july", "italy", "holy", "july",
  "monthly", "weekly", "yearly", "daily", "nightly", "hourly",
  "homely", "lovely", "lovely", "friendly",
]);

// Rough passive-voice signal: forms of "to be" followed by a past
// participle. The participle is approximated as a word ending in -ed,
// -en, or matching a small irregular list. False positives are common
// ("she was tired" is stative not passive) but the density still tracks
// authorial passive-leanings well enough for relative comparisons.
const BE_FORMS = ["is", "are", "was", "were", "been", "being", "be"];
const IRREGULAR_PARTICIPLES = [
  "broken", "spoken", "taken", "given", "shown", "torn", "worn",
  "thrown", "drawn", "known", "seen", "done", "made", "said",
  "told", "found", "lost", "left", "felt", "kept", "held",
  "brought", "caught", "taught", "bought", "fought", "thought",
];
const PASSIVE_RE = new RegExp(
  `\\b(${BE_FORMS.join("|")})\\s+(\\w+(?:ed|en)|${IRREGULAR_PARTICIPLES.join("|")})\\b`,
  "gi"
);

const FIRST_PERSON_RE = /\b(i|me|my|mine|myself|we|us|our|ours|ourselves)\b/gi;
const SECOND_PERSON_RE = /\b(you|your|yours|yourself|yourselves)\b/gi;
const THIRD_PERSON_RE = /\b(he|him|his|himself|she|her|hers|herself|they|them|their|theirs|themselves|it|its|itself)\b/gi;

function stripHtml(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  // Drop scene break markers and editorial comment marks before counting
  // — they shouldn't count toward dialogue or word counts.
  div.querySelectorAll("p.scene-mark, .ai-ins, .ai-del").forEach((el) => {
    if (el.classList.contains("ai-del")) el.remove();
    else if (el.classList.contains("ai-ins")) el.replaceWith(...el.childNodes);
    else el.remove();
  });
  // @-mention chips render as inline pills but their text content IS
  // part of the sentence ("Halvard walked to…"). Unwrap so the name
  // counts toward word/sentence stats, but strip the leading "@" the
  // chip renders so dialogue-ratio and other text-pattern checks see
  // the bare prose.
  div.querySelectorAll(".mention, [data-mention]").forEach((el) => {
    if (el.firstChild?.nodeType === 3) {
      el.firstChild.nodeValue = el.firstChild.nodeValue.replace(/^@/, "");
    }
    el.replaceWith(...el.childNodes);
  });
  return div.textContent || "";
}

function splitParagraphs(html) {
  if (!html) return [];
  const div = document.createElement("div");
  div.innerHTML = html;
  const out = [];
  for (const p of div.querySelectorAll("p")) {
    if (p.classList.contains("scene-mark")) continue;
    const text = (p.textContent || "").trim();
    if (text) out.push(text);
  }
  // Fall back to one paragraph if the chunk has no <p> tags.
  if (!out.length) {
    const text = (div.textContent || "").trim();
    if (text) out.push(text);
  }
  return out;
}

function splitSentences(text) {
  if (!text) return [];
  // Sentence-terminator heuristic. Conservative: split on . ! ? followed
  // by whitespace and a capital letter or end-of-string. Doesn't try to
  // be clever about abbreviations — slightly over-counts on "Mr. Smith"
  // but that's noise, not signal.
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"'([])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function wordCount(text) {
  const t = (text || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

function stdev(values) {
  const n = values.length;
  if (n === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return Math.sqrt(variance);
}

function adverbCount(text) {
  if (!text) return 0;
  let count = 0;
  const m = text.match(/\b\w{4,}ly\b/gi);
  if (!m) return 0;
  for (const w of m) {
    if (!ADVERB_EXCLUDES.has(w.toLowerCase())) count++;
  }
  return count;
}

// Words inside paired straight or curly quotes — a dialogue-share signal.
// Doesn't try to attribute speakers; that's Studio's job. The regex
// captures the contents between paired " " or “ ” marks, and also
// between paired single ' ' / ‘ ’ marks (less common but it happens).
const DIALOGUE_RES = [
  /"([^"\n]+?)"/g,
  /“([^”\n]+?)”/g,
  /‘([^’\n]+?)’/g,
];
function dialogueWords(text) {
  if (!text) return 0;
  let total = 0;
  for (const re of DIALOGUE_RES) {
    let m;
    // biome-ignore lint/suspicious/noAssignInExpressions: regex.exec loop — assignment-in-while is the idiomatic pattern.
    while ((m = re.exec(text)) !== null) {
      total += wordCount(m[1]);
    }
  }
  return total;
}

// Per-1000-word density helper. Returns 0 when there's no text so the
// caller can render "—" without checking for NaN.
function per1k(count, words) {
  if (!words) return 0;
  return (count / words) * 1000;
}

/**
 * Compute metrics for a single chapter.
 *
 * @param {string} html — chapter body HTML (as project.chapterBody gives)
 * @returns {{
 *   words: number,
 *   paragraphs: number,
 *   sentences: number,
 *   avgSentenceLength: number,
 *   sentenceLengthStdev: number,
 *   avgParagraphLength: number,
 *   dialogueRatio: number,           // 0..1
 *   filterWordsPer1k: number,
 *   adverbsPer1k: number,
 *   passivePer1k: number,
 *   povHint: "first" | "second" | "third" | "mixed",
 *   firstPersonRatio: number         // 0..1, denom = all personal pronouns
 * }}
 */
export function chapterMetrics(html) {
  const text = stripHtml(html);
  const paragraphs = splitParagraphs(html);
  const sentences = splitSentences(text);
  const sentWords = sentences.map(wordCount);
  const words = wordCount(text);

  const dWords = dialogueWords(text);
  const filterMatches = (text.match(FILTER_RE) || []).length;
  const adverbs = adverbCount(text);
  const passive = (text.match(PASSIVE_RE) || []).length;

  const first = (text.match(FIRST_PERSON_RE) || []).length;
  const second = (text.match(SECOND_PERSON_RE) || []).length;
  const third = (text.match(THIRD_PERSON_RE) || []).length;
  const totalPronouns = first + second + third;
  const firstPersonRatio = totalPronouns ? first / totalPronouns : 0;
  // POV hint: which class accounts for ≥60% of pronouns? Otherwise mixed.
  let povHint = "mixed";
  if (totalPronouns >= 10) {
    if (first / totalPronouns >= 0.6) povHint = "first";
    else if (second / totalPronouns >= 0.6) povHint = "second";
    else if (third / totalPronouns >= 0.6) povHint = "third";
  }

  return {
    words,
    paragraphs: paragraphs.length,
    sentences: sentences.length,
    avgSentenceLength: sentences.length ? words / sentences.length : 0,
    sentenceLengthStdev: stdev(sentWords),
    avgParagraphLength: paragraphs.length ? words / paragraphs.length : 0,
    dialogueRatio: words ? dWords / words : 0,
    filterWordsPer1k: per1k(filterMatches, words),
    adverbsPer1k: per1k(adverbs, words),
    passivePer1k: per1k(passive, words),
    povHint,
    firstPersonRatio,
  };
}

/**
 * Compute metrics for every chapter in the project, plus a book-level
 * rollup. The rollup is computed from the per-chapter table rather than
 * the full concatenated text — keeps it cheap and lets the rollup show
 * book-wide averages and ranges without re-stripping all the HTML.
 *
 * @param {Array<{id,title,num,partTitle}>} allChapters
 * @param {Record<string,string>} chapterBody — id → HTML
 */
export function bookMetrics(allChapters, chapterBody) {
  const rows = allChapters.map((c) => ({
    chapterId: c.id,
    num: c.num,
    title: c.title,
    partTitle: c.partTitle,
    ...chapterMetrics(chapterBody[c.id] || ""),
  }));

  const nonEmpty = rows.filter((r) => r.words > 0);
  if (!nonEmpty.length) {
    return { rows, summary: emptySummary() };
  }

  const totalWords = nonEmpty.reduce((s, r) => s + r.words, 0);
  const totalSentences = nonEmpty.reduce((s, r) => s + r.sentences, 0);
  const totalParagraphs = nonEmpty.reduce((s, r) => s + r.paragraphs, 0);
  const dialogueTotal = nonEmpty.reduce((s, r) => s + r.words * r.dialogueRatio, 0);
  const filterTotal = nonEmpty.reduce((s, r) => s + r.filterWordsPer1k * (r.words / 1000), 0);
  const adverbTotal = nonEmpty.reduce((s, r) => s + r.adverbsPer1k * (r.words / 1000), 0);
  const passiveTotal = nonEmpty.reduce((s, r) => s + r.passivePer1k * (r.words / 1000), 0);

  // Pacing: standard deviation of chapter word counts as a coefficient
  // (stdev / mean). Closer to 0 = uniform chapter lengths; >0.5 = wide
  // variance, sometimes intentional (interludes / shorts) but often a
  // smell.
  const chapterWords = nonEmpty.map((r) => r.words);
  const meanCh = totalWords / nonEmpty.length;
  const pacingCoV = meanCh ? stdev(chapterWords) / meanCh : 0;

  const povCounts = { first: 0, second: 0, third: 0, mixed: 0 };
  for (const r of nonEmpty) povCounts[r.povHint] += 1;
  const dominantPov = Object.entries(povCounts).sort((a, b) => b[1] - a[1])[0][0];

  return {
    rows,
    summary: {
      chapters: nonEmpty.length,
      words: totalWords,
      sentences: totalSentences,
      paragraphs: totalParagraphs,
      avgSentenceLength: totalSentences ? totalWords / totalSentences : 0,
      avgParagraphLength: totalParagraphs ? totalWords / totalParagraphs : 0,
      dialogueRatio: totalWords ? dialogueTotal / totalWords : 0,
      filterWordsPer1k: per1k(filterTotal, totalWords),
      adverbsPer1k: per1k(adverbTotal, totalWords),
      passivePer1k: per1k(passiveTotal, totalWords),
      pacingCoV,
      dominantPov,
      povCounts,
    },
  };
}

function emptySummary() {
  return {
    chapters: 0,
    words: 0,
    sentences: 0,
    paragraphs: 0,
    avgSentenceLength: 0,
    avgParagraphLength: 0,
    dialogueRatio: 0,
    filterWordsPer1k: 0,
    adverbsPer1k: 0,
    passivePer1k: 0,
    pacingCoV: 0,
    dominantPov: "mixed",
    povCounts: { first: 0, second: 0, third: 0, mixed: 0 },
  };
}

// Friendly labels for the POV hint badge, kept here so callers don't
// need to map enums themselves.
export const POV_LABELS = {
  first: "First person",
  second: "Second person",
  third: "Third person",
  mixed: "Mixed POV",
};
