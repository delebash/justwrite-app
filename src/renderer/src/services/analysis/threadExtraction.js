// Per-chapter foreshadowing / dangling-thread extraction.
//
// Asks the model to identify *setups* in a chapter — narrative
// promises that demand later payoff. Returns structured proposals that
// downstream code can match against later chapters (to flag what's
// dangling) and the user can review one-by-one (to drop Loose-thread
// markers).
//
// Setup categories (the LLM picks one per item):
//   - promise:  "they vowed to find him"
//   - object:   "she pocketed the locket"
//   - question: "why was the door locked from inside?"
//   - ability:  "he could hear thoughts when tired"
//   - secret:   "Marcus hadn't told anyone about the basement"
//   - threat:   "the council would learn of this"
//   - debt:     "I owe you one"
//
// JSON return shape per proposal:
//   {
//     snippet:  string,   // verbatim phrase from the chapter, 4-15 words
//     label:    string,   // short reminder, what's being set up
//     kind:     string,   // one of the categories above
//     keyTerm:  string,   // a distinctive noun/phrase to grep later chapters with
//   }

import { runAiStream } from "../aiStream.js";

function htmlToText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll(".ai-del").forEach((el) => el.remove());
  div.querySelectorAll(".ai-ins").forEach((el) => el.replaceWith(...el.childNodes));
  return (div.textContent || "").replace(/\s+\n/g, "\n").trim();
}

function parseJsonLoose(text) {
  if (!text) return null;
  let s = text.replace(/```(?:json)?/gi, "").replace(/<think>[\s\S]*?<\/think>/gi, "");
  const objIdx = s.indexOf("{");
  const arrIdx = s.indexOf("[");
  const objectFirst = objIdx !== -1 && (arrIdx === -1 || objIdx < arrIdx);
  const order = objectFirst ? [["{", "}"], ["[", "]"]] : [["[", "]"], ["{", "}"]];
  for (const [open, close] of order) {
    const slice = extractBalanced(s, open, close);
    if (slice) { try { return JSON.parse(slice); } catch {} }
  }
  return null;
}
function extractBalanced(s, open, close) {
  for (let start = s.indexOf(open); start !== -1; start = s.indexOf(open, start + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) return s.slice(start, i + 1);
      }
    }
  }
  return null;
}

const ALLOWED_KINDS = new Set([
  "promise", "object", "question", "ability", "secret", "threat", "debt",
]);

const SYSTEM = `You are a sharp fiction editor looking for foreshadowing and narrative setups in a chapter.

You will be given one chapter's prose. Identify "setups" — narrative elements the writer has planted that demand a later payoff. Things like:

  - promises or vows ("I'll find him")
  - distinctive objects placed in a character's hands or environment
  - questions raised but not answered ("why was the door locked from inside?")
  - abilities, traits, or constraints established for later use
  - secrets known to one character but not others
  - threats issued
  - debts or obligations declared

Return ONLY a JSON object with one field, "setups":

  {
    "setups": [
      {
        "snippet":  "verbatim phrase from the chapter, 4-15 words",
        "label":    "short reminder of what's set up (<= 90 chars)",
        "kind":     "promise" | "object" | "question" | "ability" | "secret" | "threat" | "debt",
        "keyTerm":  "a single distinctive word or 2-3 word phrase a later chapter would re-use"
      }
    ]
  }

RULES:
  - Each snippet MUST be copied verbatim from the chapter. No paraphrasing.
  - Each snippet should be 4-15 words — long enough to find uniquely, short enough to scan.
  - Each keyTerm should be specific enough that a substring search in later chapters would catch any payoff (proper nouns are ideal: a character name, a place name, a unique object name).
  - Return at most 8 setups for this chapter — the most interesting ones.
  - Skip the merely descriptive. A character noticing the weather is not a setup. A character noticing a specific knife on the mantle IS.
  - If the chapter is mostly resolution or middle-of-scene action with no new setups, return an empty array. Do not invent.

Return ONLY the JSON object, no preface, no markdown fences.`;

export async function extractThreads({
  html,
  chapterTitle = "",
  chapterNum = null,
  signal,
  onDelta,
  provider,
  model,
  meta = {},
} = {}) {
  const text = htmlToText(html).trim();
  if (!text) {
    return { setups: [], raw: "" };
  }

  const header = chapterTitle
    ? `Chapter ${chapterNum != null ? chapterNum + " — " : ""}${chapterTitle}\n\n`
    : "";

  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `${header}--- BEGIN CHAPTER ---\n${text}\n--- END CHAPTER ---` },
  ];

  const result = await runAiStream({
    feature: "foreshadowing",
    messages,
    temperature: 0.3,
    extra: { think: false },
    signal,
    onDelta,
    provider,
    model,
    meta,
  });

  const parsed = parseJsonLoose(result.content) || {};
  const rawSetups = Array.isArray(parsed.setups) ? parsed.setups : Array.isArray(parsed) ? parsed : [];

  const setups = [];
  for (const s of rawSetups) {
    if (!s || typeof s.snippet !== "string") continue;
    const snippet = s.snippet.trim();
    if (snippet.length < 4) continue;
    const label = typeof s.label === "string" ? s.label.trim().slice(0, 120) : "";
    const kind = ALLOWED_KINDS.has(s.kind) ? s.kind : "promise";
    const keyTerm = typeof s.keyTerm === "string"
      ? s.keyTerm.trim().slice(0, 80)
      : "";
    setups.push({ snippet, label, kind, keyTerm });
    if (setups.length >= 12) break;
  }

  return {
    setups,
    raw: result.content,
    model: result.model,
    providerId: result.providerId,
  };
}
