// Multi-reader panel critique — four distinct reader personas, in
// parallel, each reading the same chapter through a different lens.
//
// Where the standard critique (services/analysis/critique.js) gives a
// single editorial pass with notes grouped by severity, this returns
// four first-person reactions from readers who care about different
// things. The panel works best on a finished chapter you've already
// run the standard critique on — different shape of feedback, not a
// replacement.
//
// Per-persona output shape:
//   {
//     personaKey, label, blurb,
//     reaction:    "2-3 paragraphs of first-person reaction",
//     suggestions: ["1-3 concrete actions or questions the persona would offer"],
//     generatedAt, model
//   }

import { runAiStream } from "../aiStream.js";

function htmlToText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll(".ai-del").forEach((el) => el.remove());
  div.querySelectorAll(".ai-ins").forEach((el) => el.replaceWith(...el.childNodes));
  div.querySelectorAll(".scene-mark").forEach((el) => el.remove());
  return (div.textContent || "").trim();
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

// ─── Personas ────────────────────────────────────────────────────────
// Each persona has a deliberately distinct lens so the panel reads as
// four different perspectives rather than four variants of the same
// model bias. The system prompt grounds the persona in who they are
// and what they care about; the JSON contract is identical across all
// four so the modal can render them uniformly.

export const PERSONAS = [
  {
    key: "genre-reader",
    label: "Genre-savvy reader",
    blurb: "A reader who's read deeply in this genre and is encountering your book cold.",
    systemBody: `You are a smart reader who has read deeply in this genre. You're encountering this chapter cold — you don't know what came before it or what comes after — but you know what the genre's tropes, expectations, and pleasures are. You're reading FOR the things this genre does well: pacing patterns, hook moments, character beats that signal a thoughtful writer at work.

You care about: hook strength, whether the chapter delivers on genre promises, voice consistency with the genre's register, whether you want to read the next chapter, where you'd put this book on the shelf.

You don't care about: literary "merit" abstractions, marketability, what the chapter "represents". You're a reader, not a critic.`,
  },
  {
    key: "literary-critic",
    label: "Literary critic",
    blurb: "A close reader concerned with prose craft, voice, image, and what the chapter is doing on the line level.",
    systemBody: `You are a literary critic reading for prose craft. You read closely. You notice sentence rhythm, image control, the way the voice negotiates distance from the POV character, the use of white space and paragraph shape, the choices the writer makes about what to dramatise and what to summarise.

You care about: voice, image, register, the work the sentences are doing, whether the prose has any compression or whether it sprawls, where the writer is reaching and where they're settling.

You don't care about: plot mechanics (unless the prose is doing plot mechanics badly), marketability, genre. You're reading for what's on the page as a piece of writing.`,
  },
  {
    key: "agent-intern",
    label: "Agent's intern",
    blurb: "A junior agent reading the chapter as a query sample — looking for marketability and hooks.",
    systemBody: `You are an intern at a literary agency. You read query samples and the first chapters of submissions all day. You are trying to figure out, very quickly, whether this chapter would make you keep reading the manuscript or put it in the no pile.

You care about: hook strength in the opening paragraphs, whether the protagonist is established as someone worth following, voice that distinguishes the writer, comp-title legibility (could you describe this book in a sentence to your boss?), whether the stakes are clear enough to make the reader turn the page.

You don't care about: the writer's feelings, prose subtleties that won't show up to a fast reader, structural questions that aren't visible in this single chapter.

You're not cruel, but you're not generous either. Your job is to find the few manuscripts worth your boss's attention.`,
  },
  {
    key: "book-club",
    label: "Book club reader",
    blurb: "A reader who'll bring this book to a six-person book club next month and is reading for what they'll say.",
    systemBody: `You are a reader who's planning to bring this book to a six-person book club. You are reading for what you'll discuss. You care about character — what drives them, what they don't know about themselves, what the writer thinks of them. You care about emotional truth — whether the chapter rings true, whether the responses are earned, whether the writer is honest about what people are like.

You care about: characters as people you'd discuss, the choices they make and what those choices reveal, the chapter's emotional centre, what the book seems to think about its own characters.

You don't care about: prose craft as an end in itself, marketability, hooks, structural beats. You're reading the book the way most actual readers read — for the people in it and what happens between them.`,
  },
];

const JSON_CONTRACT = `Return ONLY a JSON object:

{
  "reaction":    "2-3 paragraphs (about 150-250 words total) in FIRST PERSON, in your voice as this persona. React to what you actually read. Quote a phrase from the chapter when calling something out.",
  "suggestions": [string, string, ...]   // 1-3 concrete actions or questions this persona would offer the writer — short, specific, in your voice
}

Rules:
  - First person. Don't break out of the persona.
  - Be honest. If the chapter is genuinely good in the ways this persona cares about, say so briefly. If it's not, name the specific thing.
  - Quote a 4-15 word phrase from the chapter when you make a craft claim. No vague "the prose feels off" without an example.
  - Don't overlap with the other personas. Stay in your lane — your suggestions should be the things THIS reader, with THIS lens, would say.
  - Keep suggestions short — one sentence each, in plain language.

Return ONLY the JSON object. No preface, no markdown fences.`;

function buildPersonaSystem(persona) {
  return `${persona.systemBody}\n\n${JSON_CONTRACT}`;
}

// ─── Run a single persona ───────────────────────────────────────────

async function runPersona({ persona, html, chapterTitle, chapterNum, signal, provider, model, meta }) {
  const text = htmlToText(html).trim();
  if (!text) throw new Error("Chapter has no prose to read.");
  const header = chapterTitle
    ? `Chapter ${chapterNum != null ? chapterNum + " — " : ""}${chapterTitle}\n\n`
    : "";

  const messages = [
    { role: "system", content: buildPersonaSystem(persona) },
    { role: "user", content: `${header}--- BEGIN CHAPTER ---\n${text}\n--- END CHAPTER ---` },
  ];

  const result = await runAiStream({
    feature: "multiReader",
    usageFeature: `panel:${persona.key}`,
    messages,
    temperature: 0.55,
    extra: { think: false },
    signal,
    provider, model,
    meta: { ...meta, personaKey: persona.key },
  });

  const parsed = parseJsonLoose(result.content) || {};
  const reaction = typeof parsed.reaction === "string" ? parsed.reaction.trim().slice(0, 2000) : "";
  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions.map((s) => String(s || "").trim()).filter(Boolean).slice(0, 4)
    : [];

  return {
    personaKey: persona.key,
    label: persona.label,
    blurb: persona.blurb,
    reaction,
    suggestions,
    raw: result.content,
    model: result.model,
    providerId: result.providerId,
    generatedAt: Date.now(),
  };
}

// ─── Run all four in parallel ───────────────────────────────────────

/**
 * Run a multi-reader panel critique on a chapter.
 *
 * @param {object} opts
 * @param {string} opts.html
 * @param {string} [opts.chapterTitle]
 * @param {number} [opts.chapterNum]
 * @param {AbortSignal} [opts.signal]
 * @param {(personaKey, phase, result?) => void} [opts.onPersonaPhase]
 * @param {object} [opts.provider]
 * @param {string} [opts.model]
 *
 * @returns {Promise<{ panel: Array, generatedAt, totalPersonas }>}
 */
export async function runMultiReaderPanel({
  html,
  chapterTitle = "",
  chapterNum = null,
  signal,
  onPersonaPhase,
  provider,
  model,
  meta = {},
} = {}) {
  const tasks = PERSONAS.map(async (persona) => {
    onPersonaPhase?.(persona.key, "start");
    try {
      const r = await runPersona({
        persona, html, chapterTitle, chapterNum,
        signal, provider, model, meta,
      });
      onPersonaPhase?.(persona.key, "done", r);
      return r;
    } catch (err) {
      onPersonaPhase?.(persona.key, "error", { error: err?.message || String(err) });
      // Return a placeholder so the panel still renders the remaining
      // personas; the writer can re-run individual columns if desired.
      return {
        personaKey: persona.key,
        label: persona.label,
        blurb: persona.blurb,
        reaction: "",
        suggestions: [],
        error: err?.message || String(err),
        generatedAt: Date.now(),
      };
    }
  });

  const panel = await Promise.all(tasks);

  return {
    panel,
    totalPersonas: PERSONAS.length,
    generatedAt: Date.now(),
  };
}
