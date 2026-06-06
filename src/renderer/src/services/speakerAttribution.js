// Inline-tag speaker attribution pipeline.
//
// Single source of truth for the production speaker-attribution path AND
// the Speaker Lab's Studio mode. Both import from here so the lab and
// production can't drift out of sync.
//
// Pipeline:
//   1. Split each paragraph by quote marks into alternating narration /
//      dialogue segments. Narration is mechanically attributed to the
//      narrator — the model never sees it as a candidate target.
//   2. Number each dialogue segment chapter-wide ([D1], [D2], …) and
//      render the paragraphs prompt with the inline markers.
//   3. (optional, default ON) Deterministic dialogue-anchor propagation:
//      detect cast-name + dialogue-verb patterns ("Sarah said") in
//      narration spans, anchor the adjacent dialogue segment to that
//      cast id, then forward/back-propagate the anchor across untagged
//      siblings in the same paragraph. The LLM is still asked about
//      every [D#] segment so the parsed table can surface disagreements;
//      anchors win on tie-break.
//   4. Ask the LLM to attribute each [D#] segment. The system prompt is
//      tier-resolved (Guided / Direct / Reasoned) so smaller models get
//      more scaffolding; larger ones get the strict prompt + Ollama
//      reasoning where available.
//   5. (optional, default ON) Confidence floor: any LLM-picked cast id
//      under the floor gets demoted to "unknown" so a low-confidence
//      wrong attribution doesn't leak into the audiobook.
//   6. Emit a per-segment row list: each paragraph explodes into
//      narration rows + dialogue rows. Studio render consumes these
//      directly — same shape as the previous paragraph-level output,
//      just finer-grained.

import { runAiStream } from "./aiStream.js";

// ─── System prompts by tier ─────────────────────────────────────────────
// Guided: scaffolded with worked examples — for smaller / less reliable
// models. Direct: strict rules only — for capable models that follow
// instructions tightly. Reasoned: same body as Direct, but the caller
// passes `think: true` for Ollama reasoning models.

export const INLINE_SPEAKER_SYSTEM_DIRECT = `You are a dialogue attribution assistant for an audiobook producer.

Narration (everything outside quotation marks) is always read by the narrator. Your job is to attribute each quoted dialogue segment to a character.

You will receive a list of project characters and the chapter's paragraphs, with each quoted segment of dialogue tagged inline as [D1]...[/D1], [D2]...[/D2], and so on.

Return ONLY a JSON array, no commentary, with one object per dialogue segment in order from [D1] onward:
  { "speaker": <character id or "unknown">, "confidence": <0..1> }

Rules:
- Use a character id ONLY when a dialogue tag, name, alias, or surrounding context clearly identifies that specific character. Do not substitute the closest-fitting cast member.
- If the passage names a speaker who is not in the cast — by name OR by role like "the waiter", "a stranger" — return "unknown". Do not map them to a cast id, even when a cast member's name or role sounds semantically similar.
- Use "unknown" with confidence below 0.6 when the speaker is genuinely ambiguous (an unnamed reply with no dialogue tag and no clear turn-taking pattern).
- Use dialogue tags ("she said", "Tom answered"), turn-taking, and surrounding narration to disambiguate.
- Do NOT include entries for narration — only dialogue segments tagged [D#].`;

export const INLINE_SPEAKER_SYSTEM_GUIDED = `${INLINE_SPEAKER_SYSTEM_DIRECT}

Worked examples:

Example 1 — Tagged dialogue uses the named cast id.
Cast:
- id=c1, name="Maya Chen"
- id=c2, name="Detective Hayes"
Passage:
[D1]"What did you find?"[/D1] Hayes asked.
Output: [{"speaker": "c2", "confidence": 1.0}]

Example 2 — Off-cast role label that semantically resembles a cast role → unknown.
Cast:
- id=c1, name="Maya Chen", role="reporter"
- id=c2, name="The Investigator", role="federal agent"
Passage:
A stranger leaned in from the next booth. [D1]"Are you the reporter from the Tribune?"[/D1]
Output: [{"speaker": "unknown", "confidence": 0.5}]

Example 3 — Bare-quote turn-taking with no name or tag → unknown.
Cast:
- id=c1, name="Maya Chen"
- id=c2, name="Detective Hayes"
Passage:
[D1]"You're late."[/D1]
[D2]"Twenty minutes."[/D2]
Output: [{"speaker": "unknown", "confidence": 0.5}, {"speaker": "unknown", "confidence": 0.5}]

Example 4 — Mid-paragraph continuation through a pronoun tag → same speaker.
A bare-quote segment in the same paragraph as a tagged segment, separated only by narration like "he said," / "she said,", continues the prior speaker. This is NOT turn-taking — the pronoun tag identifies who said both spans.
Cast:
- id=c1, name="Maya Chen"
- id=c2, name="Detective Hayes"
Passage:
Hayes paused at the door. [D1]"This is your case,"[/D1] he said, [D2]"and you're going to close it."[/D2]
Output: [{"speaker": "c2", "confidence": 1.0}, {"speaker": "c2", "confidence": 0.9}]`;

export const INLINE_SPEAKER_USER_TEMPLATE = `Characters in this novel:
{{characters}}
{{corrections}}
Paragraphs (dialogue segments tagged inline):

{{paragraphs}}

Return only the JSON array, one entry per [D#] in order.`;

// Render the optional "past corrections" block fed into the user prompt
// before the paragraphs. Each entry is a previously misattributed line
// the writer manually fixed in Studio's Script tab — we surface the snippet
// and the correct character id as a few-shot hint. Empty list collapses
// to an empty string so the prompt has no dangling header.
export function renderCorrectionsBlock(corrections) {
  if (!corrections?.length) return "";
  const lines = corrections.map((c) => {
    const text = String(c.textSnippet || "").trim();
    if (!text) return null;
    return `- ${JSON.stringify(text)} → speaker id "${c.characterId}"`;
  }).filter(Boolean);
  if (!lines.length) return "";
  return `
Past corrections from the writer (lines you previously misattributed in this story — match these exactly when they appear, and apply the same reasoning to similar lines):
${lines.join("\n")}
`;
}

// Map tier.systemKey → prompt body. The Guided / Direct / Reasoned tiers
// in modelMeta.js use `systemKey: "guided"` or `systemKey: "direct"`;
// Reasoned reuses Direct's body and toggles `think` on instead.
export const SYSTEM_BY_TIER_KEY = {
  guided: INLINE_SPEAKER_SYSTEM_GUIDED,
  direct: INLINE_SPEAKER_SYSTEM_DIRECT,
};

// ─── Paragraph extraction ─────────────────────────────────────────────

// Paragraphs whose entire content is just a chapter/scene/part label
// (with optional Roman or Arabic numeral) get dropped before LLM
// analysis. Matches what Studio's reanalyze() does.
const STRUCTURAL_MARKER_RE = /^(scene|chapter|part|book|act|prologue|epilogue|interlude)\s*[ivxlcdm0-9]*\.?$/i;

// Pull paragraph text from a chapter's HTML body. Strips structural
// chrome (headings, scene marks, structural-marker paragraphs) AND
// pending AI revision marks (deletions excluded, insertions inlined)
// so the model sees the same prose Studio render will voice.
export function extractParagraphsFromHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = String(html || "");
  div.querySelectorAll("h2.scene-title, p.scene-mark").forEach((el) => { el.remove(); });
  div.querySelectorAll("del[data-ai-del], .ai-del").forEach((el) => { el.remove(); });
  div.querySelectorAll("ins[data-ai-ins], .ai-ins").forEach((el) => { el.replaceWith(...el.childNodes); });
  return Array.from(div.querySelectorAll("p"))
    .map((el) => el.textContent.trim())
    .filter((t) => t && !STRUCTURAL_MARKER_RE.test(t));
}

// Fallback for raw-paste paths (e.g. the Speaker Lab's text input).
export function splitTextToParagraphs(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((t) => t && !STRUCTURAL_MARKER_RE.test(t));
}

// ─── Quote splitting ──────────────────────────────────────────────────

// Splits one paragraph into alternating dialogue/narration segments by
// quote marks. Treats both straight (") and curly (" ") double-quote
// characters as state-toggle markers. Single quotes are intentionally
// ignored — too many apostrophe false-positives ("it's", "don't").
function splitByQuotes(text) {
  const QUOTE_RE = /["“”]/;
  const segments = [];
  let bufStart = 0;
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    if (!QUOTE_RE.test(text[i])) continue;
    if (!inQuote) {
      if (i > bufStart) segments.push({ kind: "narration", text: text.slice(bufStart, i) });
      bufStart = i;
      inQuote = true;
    } else {
      segments.push({ kind: "dialogue", text: text.slice(bufStart, i + 1) });
      bufStart = i + 1;
      inQuote = false;
    }
  }
  if (bufStart < text.length) {
    segments.push({
      kind: inQuote ? "dialogue" : "narration",
      text: text.slice(bufStart),
    });
  }
  return segments.filter((s) => s.text.trim().length > 0);
}

// Returns [{ paragraphIdx, segments: [{ kind, text, tagNum?: number }] }, …].
// tagNum is chapter-wide so the LLM sees stable [D1], [D2], … markers we
// can zip back against on the way out.
export function segmentParagraphs(paragraphs) {
  let counter = 0;
  return paragraphs.map((para, paragraphIdx) => {
    const segments = splitByQuotes(para).map((seg) =>
      seg.kind === "dialogue" ? { ...seg, tagNum: ++counter } : seg,
    );
    return { paragraphIdx, segments };
  });
}

// Renders the {{paragraphs}} prompt block: each paragraph is prefixed
// with its 1-based index, dialogue spans wrapped in [D#]…[/D#].
export function renderTaggedParagraphs(segmented) {
  return segmented.map(({ paragraphIdx, segments }) => {
    const body = segments.map((s) =>
      s.kind === "dialogue" ? `[D${s.tagNum}]${s.text}[/D${s.tagNum}]` : s.text,
    ).join("");
    return `${paragraphIdx + 1}. ${body}`;
  }).join("\n\n");
}

// ─── Anchor propagation (deterministic, pre-LLM) ─────────────────────

const DIALOGUE_TAG_VERBS = [
  "said", "says", "asked", "asks", "replied", "replies", "answered", "answers",
  "responded", "returned", "retorted", "whispered", "shouted", "called",
  "cried", "exclaimed", "gasped", "hissed", "muttered", "murmured", "added",
  "continued", "began", "agreed", "disagreed", "admitted", "insisted",
  "protested", "argued", "noted", "observed", "remarked", "commented",
  "offered", "suggested", "proposed", "demanded", "ordered", "breathed",
  "sighed", "laughed", "chuckled", "repeated", "echoed",
];

function buildNameIndex(characters) {
  const idx = new Map();
  const add = (name, id) => {
    if (!name) return;
    const key = String(name).trim().toLowerCase();
    if (key) idx.set(key, id);
  };
  for (const c of characters || []) {
    add(c.name, c.id);
    const parts = String(c.name || "").trim().split(/\s+/);
    if (parts.length > 1) { add(parts[0], c.id); add(parts[parts.length - 1], c.id); }
    if (Array.isArray(c.aliases)) c.aliases.forEach((a) => { add(a, c.id); });
  }
  return idx;
}

function findTaggedSpeakerInText(text, nameIndex) {
  if (!text || !nameIndex.size) return null;
  const verbs = DIALOGUE_TAG_VERBS.join("|");
  const nameVerbRE = new RegExp(`\\b(\\w[\\w'-]*)\\s+(?:${verbs})\\b`, "gi");
  for (const m of text.matchAll(nameVerbRE)) {
    if (!/^[A-Z]/.test(m[1])) continue;
    const id = nameIndex.get(m[1].toLowerCase());
    if (id) return id;
  }
  const verbNameRE = new RegExp(`\\b(?:${verbs})\\s+(\\w[\\w'-]*)\\b`, "gi");
  for (const m of text.matchAll(verbNameRE)) {
    if (!/^[A-Z]/.test(m[1])) continue;
    const id = nameIndex.get(m[1].toLowerCase());
    if (id) return id;
  }
  return null;
}

// Returns Map<tagNum, { speaker, source: "tag" | "propagated" }>.
export function buildAnchors(segmented, characters) {
  const nameIndex = buildNameIndex(characters);
  const anchors = new Map();
  if (!nameIndex.size) return anchors;
  for (const { segments } of segmented) {
    // Pass 1: name + verb tag detection.
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].kind !== "narration") continue;
      const speaker = findTaggedSpeakerInText(segments[i].text, nameIndex);
      if (!speaker) continue;
      let target = null;
      for (let j = i - 1; j >= 0; j--) {
        if (segments[j].kind === "dialogue") { target = segments[j]; break; }
      }
      if (!target) {
        for (let j = i + 1; j < segments.length; j++) {
          if (segments[j].kind === "dialogue") { target = segments[j]; break; }
        }
      }
      if (target && !anchors.has(target.tagNum)) {
        anchors.set(target.tagNum, { speaker, source: "tag" });
      }
    }
    // Pass 2: forward + backward propagation across untagged dialogue.
    const dialogues = segments.filter((s) => s.kind === "dialogue");
    let last = null;
    for (const d of dialogues) {
      const a = anchors.get(d.tagNum);
      if (a && a.source === "tag") last = a.speaker;
      else if (last) anchors.set(d.tagNum, { speaker: last, source: "propagated" });
    }
    let next = null;
    for (let i = dialogues.length - 1; i >= 0; i--) {
      const d = dialogues[i];
      const a = anchors.get(d.tagNum);
      if (a && a.source === "tag") next = a.speaker;
      else if (next && !a) anchors.set(d.tagNum, { speaker: next, source: "propagated" });
    }
  }
  return anchors;
}

// ─── Character list formatter ─────────────────────────────────────────

export function formatCharacterList(characters) {
  if (!characters?.length) return "(no characters configured in this project)";
  return characters
    .map((c) => `- id=${c.id}, name="${c.name}", role="${c.role || ""}", gender="${c.gender || ""}", pronouns="${c.pronouns || ""}", aliases="${(c.aliases || []).join(", ")}"`)
    .join("\n");
}

// ─── Parser ───────────────────────────────────────────────────────────

export function parseInlineAttributions(text, dialogueCount) {
  const fallback = () => Array.from({ length: dialogueCount }, () =>
    ({ speaker: "unknown", confidence: 0.4 }),
  );
  const m = String(text || "").match(/\[[\s\S]*\]/);
  if (!m) return fallback();
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return fallback();
    const out = arr.map((a) => ({
      speaker: typeof a?.speaker === "string" ? a.speaker : "unknown",
      confidence: typeof a?.confidence === "number" ? a.confidence : 0.5,
    }));
    while (out.length < dialogueCount) out.push({ speaker: "unknown", confidence: 0.4 });
    return out.slice(0, dialogueCount);
  } catch {
    return fallback();
  }
}

// ─── Row builder ──────────────────────────────────────────────────────

// Combines segmented paragraphs + LLM attributions + propagated anchors
// into the per-segment line list Studio render consumes. Each output row:
//   { paragraphIdx, kind: "narration"|"dialogue", speaker, confidence,
//     text, source?, auto?, llmSpeaker?, llmConfidence?, flooredFrom?,
//     intro? }
// Chapter intro line (if `chapter` provided) is prepended as the first
// narrator row. Source field carries provenance: "tag" / "propagated" /
// "llm" / "floored" / undefined (intro+narration).
export function buildAttributionRows(segmented, attributions, chapter, anchors, options) {
  const rows = [];
  if (chapter?.num != null || chapter?.title) {
    const introParts = [];
    if (chapter?.num != null) introParts.push(`Chapter ${chapter.num}.`);
    if (chapter?.title) introParts.push(`${chapter.title}.`);
    if (introParts.length) {
      rows.push({
        paragraphIdx: -1, intro: true, kind: "narration",
        speaker: "narrator", confidence: 1.0, auto: true,
        text: introParts.join(" "),
      });
    }
  }
  segmented.forEach(({ paragraphIdx, segments }) => {
    segments.forEach((seg) => {
      if (seg.kind === "narration") {
        rows.push({
          paragraphIdx, kind: "narration",
          speaker: "narrator", confidence: 1.0, auto: true,
          text: seg.text,
        });
      } else {
        const anchor = anchors?.get(seg.tagNum);
        const llmAttr = attributions[seg.tagNum - 1] || { speaker: "unknown", confidence: 0.4 };
        if (anchor) {
          rows.push({
            paragraphIdx, kind: "dialogue",
            speaker: anchor.speaker, confidence: 1.0, source: anchor.source,
            llmSpeaker: llmAttr.speaker, llmConfidence: llmAttr.confidence,
            text: seg.text,
          });
        } else {
          const floor = options?.floor;
          const shouldFloor = floor != null
            && llmAttr.speaker !== "unknown"
            && llmAttr.confidence < floor;
          if (shouldFloor) {
            rows.push({
              paragraphIdx, kind: "dialogue",
              speaker: "unknown", confidence: llmAttr.confidence, source: "floored",
              flooredFrom: llmAttr.speaker,
              text: seg.text,
            });
          } else {
            rows.push({
              paragraphIdx, kind: "dialogue",
              speaker: llmAttr.speaker, confidence: llmAttr.confidence, source: "llm",
              text: seg.text,
            });
          }
        }
      }
    });
  });
  return rows;
}

// ─── Orchestrator ─────────────────────────────────────────────────────

// Run the full inline-tag pipeline against a list of paragraphs + cast.
// Returns rows ready for Studio render. Used by:
//   • production `services/llm.js → detectSpeakers` (which adds tier
//     resolution + featureConfigs overrides on top of these primitives)
//   • Speaker Lab's Studio panel (which lets the user tune each knob in
//     the UI before calling)
//
// Options:
//   characters       — project character objects
//   chapter          — { num, title } for the chapter-intro line (optional)
//   systemPrompt     — full system prompt; defaults to tier-resolved
//   userTemplate     — full user template with {{characters}} +
//                      {{paragraphs}} placeholders
//   temperature      — defaults 0.2
//   think            — Ollama reasoning toggle
//   propagate        — run anchor propagation pre-LLM (default true)
//   useFloor         — apply confidence floor to LLM picks (default true)
//   confidenceFloor  — threshold below which cast picks → "unknown"
//   provider, model  — runAiStream overrides
//   feature          — feature key for cost ledger / task panel
//   task, meta       — runAiStream task / meta passthrough
//   signal, onDelta  — runAiStream stream callbacks
//
// Defaults rely on the caller filling in tier-resolved values for
// systemPrompt + think + confidenceFloor (production does this in llm.js;
// the lab does it via its UI). When the caller passes undefined for any
// of those, the constants below are used.
export async function analyzeSpeakers({
  paragraphs,
  characters,
  chapter,
  corrections,
  systemPrompt,
  userTemplate,
  temperature,
  think,
  propagate,
  useFloor,
  confidenceFloor,
  provider,
  model,
  feature,
  task,
  meta,
  signal,
  onDelta,
} = {}) {
  if (!paragraphs?.length) return [];

  const segmented = segmentParagraphs(paragraphs);
  const useAnchors = propagate !== false; // default ON
  const anchors = useAnchors ? buildAnchors(segmented, characters) : new Map();
  const dialogueCount = segmented.reduce(
    (n, p) => n + p.segments.filter((s) => s.kind === "dialogue").length,
    0,
  );
  const floor = useFloor !== false ? (Number(confidenceFloor) || 0.7) : null;

  // No dialogue → emit narrator-only rows. The model has nothing to do.
  if (dialogueCount === 0) {
    return buildAttributionRows(segmented, [], chapter, anchors, { floor });
  }

  const characterList = formatCharacterList(characters);
  const taggedParagraphs = renderTaggedParagraphs(segmented);
  const correctionsBlock = renderCorrectionsBlock(corrections);
  const sys = systemPrompt || INLINE_SPEAKER_SYSTEM_GUIDED;
  const tpl = userTemplate || INLINE_SPEAKER_USER_TEMPLATE;
  const userMsg = tpl
    .replace(/\{\{characters\}\}/g, characterList)
    .replace(/\{\{corrections\}\}/g, correctionsBlock)
    .replace(/\{\{paragraphs\}\}/g, taggedParagraphs);

  const { content } = await runAiStream({
    feature: feature || "speakerAnalysis",
    messages: [
      { role: "system", content: sys },
      { role: "user",   content: userMsg },
    ],
    temperature: Number(temperature) >= 0 ? Number(temperature) : 0.2,
    extra: { think: think === true },
    provider,
    model,
    signal,
    onDelta,
    meta,
    task,
  });

  const attributions = parseInlineAttributions(content, dialogueCount);
  return buildAttributionRows(segmented, attributions, chapter, anchors, { floor });
}
