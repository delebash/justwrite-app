// Brainstorm's categories and its one way of asking (2026-10-11, the AI drafting plan Task 10) —
// read by the Brainstorm page and by the Brainstorm panel where each is used (components/BrainstormPanel.vue), so both
// ask the model alike. Moved out of BrainstormPage.vue, where the categories were hardcoded in
// English outside i18n.
//
// What the writer sees — each category's label, purpose and placeholder — is in the locale files
// under brainstorm.categories.<value>. What the model is told is here, in the seeded prompts'
// language: `promptLabel` fills the "Category:" line and the brainstorm system's {{label}}, `kind`
// the plot system's {{kind}} (server/src/seed_feature_prompts.js BRAINSTORM_SYSTEM /
// BRAINSTORM_PLOT_SYSTEM; the Lab's "Brainstorm seed" sample sends this same shape).

/* eslint-disable i18next/no-literal-string -- text the AI model reads stays English (ruled 2026-10-13) */
export const BRAINSTORM_CATEGORIES = [
  { value: "character_name", promptLabel: "Character names" },
  { value: "place_name", promptLabel: "Place names" },
  { value: "item_name", promptLabel: "Item / object names" },
  { value: "title", promptLabel: "Titles (book / chapter / scene)" },
  { value: "next_beat", promptLabel: "Next plot beats", kind: "next plot beats — possible moves, escalations, or scene-level developments" },
  { value: "twist", promptLabel: "Plot twists", kind: "plot twists, reveals, or reversals" },
  { value: "free", promptLabel: "Anything (free prompt)" },
];

export function brainstormCategory(value) {
  return BRAINSTORM_CATEGORIES.find((c) => c.value === value) || BRAINSTORM_CATEGORIES[0];
}

/** The seeded action and the system variables for a category: a plot category runs
 *  `brainstormPlot` with its {{kind}}, the rest `brainstorm` with its {{label}}. */
export function brainstormAction(value) {
  const c = brainstormCategory(value);
  return c.kind
    ? { action: "brainstormPlot", variables: { kind: c.kind } }
    : { action: "brainstorm", variables: { label: c.promptLabel } };
}

/** The round's request — data only: the category and seed, then on a "More like these" round the
 *  "Liked" ideas and every idea "Already shown". What the model does with each list — lean toward
 *  the liked, repeat none — is the seeded system prompt's (server/src/seed_feature_prompts.js
 *  BRAINSTORM_SYSTEM / BRAINSTORM_PLOT_SYSTEM), editable in the Lab (2026-10-28). */
export function brainstormPrompt({ category, seed, liked = [], seen = [] }) {
  const list = (items) => items.map((t) => `- ${t}`).join("\n");
  let msg = `Category: ${brainstormCategory(category).promptLabel}\nSeed: ${String(seed || "").trim()}`;
  if (liked.length) msg += `\n\nLiked:\n${list(liked)}`;
  if (seen.length) msg += `\n\nAlready shown:\n${list(seen)}`;
  return msg;
}

/** The Seed line of a round at a page (Brainstorm where it's used, 2026-10-28): the writer's own
 *  words first, then what the ideas are for — the page's blocks above the request name it. The
 *  seed is optional there: without words, the page and the book alone steer. */
export function seedFor(own, what) {
  const words = String(own || "").trim();
  return words ? `${words} — ${what}` : what;
}

/** The reply → one idea per line, list markers ("1.", "2)", "-", "*", "•") stripped. */
export function parseBrainstormLines(raw) {
  return String(raw || "")
    .split("\n")
    .map((l) => l.trim().replace(/^(\d+[.)]\s*|[-*•]\s*)/, "").trim())
    .filter(Boolean);
}

const norm = (s) => String(s).trim().toLowerCase();

/** The ideas worth showing: not shown before (`seen`, as typed), not a name already taken
 *  (`exclude`, any case), and not repeated within the reply. */
export function freshIdeas(lines, { seen = [], exclude = [] } = {}) {
  const shown = new Set(seen);
  const taken = new Set(exclude.map(norm));
  const out = [];
  for (const line of lines) {
    if (shown.has(line) || taken.has(norm(line))) continue;
    shown.add(line);
    out.push(line);
  }
  return out;
}
