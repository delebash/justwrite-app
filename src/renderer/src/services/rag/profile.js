// The per-character PROFILE block builder — a LEAF module (no store/kit
// imports) so the card builder and unit tests can use it without dragging
// the transport/store world in. characterChat.js re-exports it, keeping
// every QC-35 import site working.

// Build the per-character PROFILE block sent as the {{characterProfile}}
// variable. The framing line + interview RULES live in the server "characterChat"
// prompt (Lab-editable); this is just the dynamic profile data, prefixed with a
// newline when present (the template is "YOUR PROFILE:{{characterProfile}}", so an
// empty profile renders byte-identically to the old client system).
// Exported: the Lab's character picker sends the SAME profile a real run
// sends (QC-35 — the buildCharacterProfile reuse pattern IS the law's origin).
//
// `voice` (Move 1, RAG build): "second" (default — the interview persona is
// addressed as "you"; byte-identical to the pre-Move-1 output) or "third" —
// the story-bible index card reads as reference prose about the character.
// ONE builder, two label tables; never fork this into a copy.
const PROFILE_LABELS = {
  second: {
    oneLiner: "Self-image (one line)",
    sample: "Sample of your speech",
    want: "What you want", need: "What you actually need",
    lie: "The lie you believe", truth: "The truth you eventually meet",
    arcStart: "Where you begin the story", arcMid: "Where you stand at the midpoint",
    arcEnd: "Where you end up",
    backstory: "Backstory (private, never told the reader directly)",
    quotes: "Lines you've actually said in the novel:",
  },
  third: {
    oneLiner: "In one line",
    sample: "Sample of their speech",
    want: "What they want", need: "What they actually need",
    lie: "The lie they believe", truth: "The truth they eventually meet",
    arcStart: "Where they begin the story", arcMid: "Where they stand at the midpoint",
    arcEnd: "Where they end up",
    backstory: "Backstory",
    quotes: "Lines they've said in the novel:",
  },
};

export function buildCharacterProfile(character, extras, { voice = "second" } = {}) {
  const L = PROFILE_LABELS[voice] || PROFILE_LABELS.second;
  const lines = [];
  if (character.role) lines.push(`Role: ${character.role}`);
  if (character.gender) lines.push(`Gender: ${character.gender}`);
  if (character.pronouns) lines.push(`Pronouns: ${character.pronouns}`);
  if (character.lifeStatus) lines.push(`Life status: ${character.lifeStatus}`);
  if ((character.aliases || []).length) lines.push(`Also known as: ${character.aliases.join(", ")}`);
  if (character.age) lines.push(`Age: ${character.age}`);
  if (character.oneLiner) lines.push(`${L.oneLiner}: ${character.oneLiner}`);

  if (extras) {
    if (extras.voice) {
      const v = extras.voice;
      const vParts = [];
      if (v.accent) vParts.push(`accent: ${v.accent}`);
      if (v.vocabulary) vParts.push(`vocabulary: ${v.vocabulary}`);
      if (v.speechTic) vParts.push(`speech tic: ${v.speechTic}`);
      if (vParts.length) lines.push(`Voice: ${vParts.join("; ")}`);
      if (v.sampleLine) lines.push(`${L.sample}: "${v.sampleLine}"`);
    }
    if (extras.motivation) {
      const m = extras.motivation;
      if (m.want) lines.push(`${L.want}: ${m.want}`);
      if (m.need) lines.push(`${L.need}: ${m.need}`);
      if (m.lie) lines.push(`${L.lie}: ${m.lie}`);
      if (m.truth) lines.push(`${L.truth}: ${m.truth}`);
    }
    if (extras.arc) {
      const a = extras.arc;
      if (a.start) lines.push(`${L.arcStart}: ${a.start}`);
      if (a.midpoint) lines.push(`${L.arcMid}: ${a.midpoint}`);
      if (a.end) lines.push(`${L.arcEnd}: ${a.end}`);
    }
    if (extras.backstory) {
      // Cap lifted 800 → 4000 (2026-07-18, the user's "I want to add a lot
      // more info for my characters"): card splitting (cards.js splitParts)
      // handles rich profiles now, so a written backstory reaches the index
      // instead of being silently truncated. The cap that remains is a
      // defensive bound, not a design limit.
      lines.push(`${L.backstory}: ${String(extras.backstory).slice(0, 4000)}`);
    }
    if (Array.isArray(extras.quotes) && extras.quotes.length) {
      lines.push(L.quotes);
      for (const q of extras.quotes.slice(0, 4)) lines.push(`  - "${q}"`);
    }
  }

  return lines.length ? `\n${lines.join("\n")}` : "";
}
