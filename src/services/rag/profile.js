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

// v3 sheet fields (2026-07-18) — the deep dossier the character page now
// captures, appended to the profile when filled so every field the writer
// enters reaches the AI (chat / audit / RAG card). Kept as DATA so ~40 fields
// don't bloat the two label tables above. `g` = extras group; `s`/`t` = the
// second/third-person label. Each line is gated on a truthy value, so a
// character with no v3 data produces byte-identical output to before — its
// RAG card sha doesn't move and it never re-embeds for this change alone.
const V3_FIELDS = [
  { g: "identity", k: "classOrigin", s: "Where you started vs. now", t: "Class origin → now" },
  { g: "identity", k: "education", s: "Your education", t: "Education" },
  { g: "voice", k: "register", s: "Your register", t: "Register" },
  { g: "voice", k: "rhythm", s: "Your speech rhythm", t: "Rhythm" },
  { g: "voice", k: "forbidden", s: "Words you would never say", t: "Forbidden words" },
  { g: "voice", k: "subtext", s: "Your subtext habit", t: "Subtext habit" },
  { g: "voice", k: "humor", s: "Your humor", t: "Humor style" },
  { g: "voice", k: "languages", s: "Languages you speak", t: "Languages" },
  { g: "voice", k: "sampleAngry", s: "A line of yours, angry", t: "Sample line (angry)" },
  { g: "voice", k: "sampleLying", s: "A line of yours, lying", t: "Sample line (lying)" },
  { g: "motivation", k: "fear", s: "What you fear most", t: "Core fear" },
  { g: "motivation", k: "lieOrigin", s: "Where your lie began", t: "Where the lie began" },
  { g: "motivation", k: "contradiction", s: "Your central contradiction", t: "Central contradiction" },
  { g: "motivation", k: "values", s: "Your values, ranked", t: "Values under pressure" },
  { g: "motivation", k: "heuristic", s: "Under pressure you choose", t: "Decision heuristic" },
  { g: "motivation", k: "stakes", s: "What is at stake for you", t: "Stakes" },
  { g: "presence", k: "physicality", s: "How you occupy space", t: "How they occupy space" },
  { g: "presence", k: "presentation", s: "What your appearance signals", t: "Presentation" },
  { g: "presence", k: "stressTells", s: "Your baseline and stress tells", t: "Baseline & stress tells" },
  { g: "function", k: "theme", s: "The argument you embody", t: "Thematic argument" },
  { g: "function", k: "protagonistRelation", s: "Your relation to the protagonist", t: "Relation to protagonist" },
  { g: "function", k: "selfImage", s: "Who you believe you are", t: "Self-image" },
  { g: "function", k: "persona", s: "Who you perform being", t: "Public persona" },
  { g: "function", k: "privateTruth", s: "Who you actually are", t: "Private truth" },
  { g: "function", k: "buttons", s: "What provokes you", t: "Buttons" },
  { g: "function", k: "allegiances", s: "Your allegiances and obligations", t: "Allegiances & obligations" },
  { g: "function", k: "escalation", s: "How you escalate conflict", t: "How they escalate conflict" },
  { g: "function", k: "cornered", s: "What you do when cornered", t: "Cornered behavior" },
  { g: "capabilities", k: "abilities", s: "What you can do", t: "Abilities" },
  { g: "capabilities", k: "costs", s: "What your abilities cost", t: "Costs" },
  { g: "capabilities", k: "limits", s: "What you can never do", t: "Hard limits" },
  { g: "capabilities", k: "conditions", s: "What your abilities require", t: "Conditions" },
  { g: "capabilities", k: "whoKnows", s: "Who knows what you can do", t: "Who knows" },
  { g: "continuity", k: "physicalConstants", s: "Your physical constants", t: "Physical constants" },
  { g: "continuity", k: "health", s: "Your conditions and disabilities", t: "Conditions & disabilities" },
  { g: "continuity", k: "timelineAnchors", s: "Your timeline anchors", t: "Timeline anchors" },
  { g: "continuity", k: "knows", s: "What you know at the start", t: "Knows at story start" },
  { g: "continuity", k: "doesntKnow", s: "What you do not know", t: "Doesn't know" },
  { g: "continuity", k: "believesWrongly", s: "What you wrongly believe", t: "Believes wrongly" },
  { g: "continuity", k: "secrets", s: "Your secrets", t: "Secrets" },
  { g: "continuity", k: "possessions", s: "Your possessions of story weight", t: "Possessions with story weight" },
  { g: "depth", k: "regrets", s: "Your regrets", t: "Regrets" },
  { g: "depth", k: "family", s: "Your family and upbringing", t: "Family / upbringing" },
  { g: "depth", k: "skills", s: "Your skills and their ceiling", t: "Skills & ceiling" },
  { g: "depth", k: "routines", s: "Your routines and habits", t: "Routines & habits" },
  { g: "depth", k: "appearance", s: "Your appearance", t: "Appearance" },
  { g: "depth", k: "tastes", s: "Your tastes and quirks", t: "Tastes & quirks" },
];

// Emit "Label: value" for every filled field of one extras group, next to its
// kin in the profile (identity by identity, voice by voice, …).
function v3Lines(extras, group, second) {
  const out = [];
  for (const f of V3_FIELDS) {
    if (f.g !== group) continue;
    const val = extras?.[group]?.[f.k];
    if (val) out.push(`${second ? f.s : f.t}: ${String(val).slice(0, 2000)}`);
  }
  return out;
}

export function buildCharacterProfile(character, extras, { voice = "second" } = {}) {
  const L = PROFILE_LABELS[voice] || PROFILE_LABELS.second;
  const second = voice === "second";
  const lines = [];
  if (character.role) lines.push(`Role: ${character.role}`);
  if (character.gender) lines.push(`Gender: ${character.gender}`);
  if (character.pronouns) lines.push(`Pronouns: ${character.pronouns}`);
  if (character.lifeStatus) lines.push(`Life status: ${character.lifeStatus}`);
  if ((character.aliases || []).length) lines.push(`Also known as: ${character.aliases.join(", ")}`);
  if (character.age) lines.push(`Age: ${character.age}`);
  if (character.oneLiner) lines.push(`${L.oneLiner}: ${character.oneLiner}`);

  if (extras) {
    // identity & core engine — classOrigin/education sit with the identity block.
    lines.push(...v3Lines(extras, "identity", second));
    if (extras.voice) {
      const v = extras.voice;
      const vParts = [];
      if (v.accent) vParts.push(`accent: ${v.accent}`);
      if (v.vocabulary) vParts.push(`vocabulary: ${v.vocabulary}`);
      // BUG FIX (2026-07-18): the page saves the speech tic under `tic` and the
      // sample under `sample`; this builder read `speechTic`/`sampleLine`, so
      // neither ever reached the AI. Read the page's keys, keep the old names
      // as a fallback for any row written under them.
      const tic = v.tic || v.speechTic;
      if (tic) vParts.push(`speech tic: ${tic}`);
      if (vParts.length) lines.push(`Voice: ${vParts.join("; ")}`);
      const sample = v.sample || v.sampleLine;
      if (sample) lines.push(`${L.sample}: "${sample}"`);
    }
    lines.push(...v3Lines(extras, "voice", second));
    if (extras.motivation) {
      const m = extras.motivation;
      if (m.want) lines.push(`${L.want}: ${m.want}`);
      if (m.need) lines.push(`${L.need}: ${m.need}`);
      if (m.lie) lines.push(`${L.lie}: ${m.lie}`);
      if (m.truth) lines.push(`${L.truth}: ${m.truth}`);
    }
    lines.push(...v3Lines(extras, "motivation", second));
    if (extras.arc) {
      const a = extras.arc;
      if (a.start) lines.push(`${L.arcStart}: ${a.start}`);
      if (a.midpoint) lines.push(`${L.arcMid}: ${a.midpoint}`);
      if (a.end) lines.push(`${L.arcEnd}: ${a.end}`);
    }
    // New sections ride ahead of backstory so identity + core stay in part 1 of
    // a split card; backstory + depth are the long tail (cards.js splitParts).
    lines.push(...v3Lines(extras, "presence", second));
    lines.push(...v3Lines(extras, "function", second));
    lines.push(...v3Lines(extras, "capabilities", second));
    lines.push(...v3Lines(extras, "continuity", second));
    if (extras.backstory) {
      // Cap lifted 800 → 4000 (2026-07-18, the user's "I want to add a lot
      // more info for my characters"): card splitting (cards.js splitParts)
      // handles rich profiles now, so a written backstory reaches the index
      // instead of being silently truncated. The cap that remains is a
      // defensive bound, not a design limit.
      lines.push(`${L.backstory}: ${String(extras.backstory).slice(0, 4000)}`);
    }
    lines.push(...v3Lines(extras, "depth", second));
    if (Array.isArray(extras.quotes) && extras.quotes.length) {
      lines.push(L.quotes);
      for (const q of extras.quotes.slice(0, 4)) lines.push(`  - "${q}"`);
    }
  }

  return lines.length ? `\n${lines.join("\n")}` : "";
}
