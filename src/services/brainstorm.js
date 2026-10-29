// Brainstorm's categories and its one way of asking (2026-10-11, the AI drafting plan Task 10) —
// read by the Brainstorm page and by the Brainstorm panel where each is used (components/BrainstormPanel.vue), so both
// ask the model alike. Moved out of BrainstormPage.vue, where the categories were hardcoded in
// English outside i18n.
//
// What the writer sees — each category's label, purpose and placeholder — is in the locale files
// under brainstorm.categories.<value>. What the model is told is in the seeded system prompts
// (server/src/seed_feature_prompts.js BRAINSTORM_SYSTEM / BRAINSTORM_PLOT_SYSTEM), edited in the
// Lab: the request's "Category:" line is the category's id, and each system says what its ids ask
// for (2026-10-29 — until then each category's English words for the model were here).

/* eslint-disable i18next/no-literal-string -- the request's labels the AI model reads stay English (ruled 2026-10-13) */
export const BRAINSTORM_CATEGORIES = [
  { value: "character_name" },
  { value: "place_name" },
  { value: "item_name" },
  { value: "title" },
  { value: "next_beat", plot: true },
  { value: "twist", plot: true },
  { value: "free" },
];

export function brainstormCategory(value) {
  return BRAINSTORM_CATEGORIES.find((c) => c.value === value) || BRAINSTORM_CATEGORIES[0];
}

/** The seeded action a category runs: `brainstormPlot` for a plot category, `brainstorm` for the rest. */
export function brainstormAction(value) {
  return brainstormCategory(value).plot ? "brainstormPlot" : "brainstorm";
}

/** The round's request — data only: the category and seed, then on a "More like these" round the
 *  "Liked" ideas and every idea "Already shown". What the model does with each list — lean toward
 *  the liked, repeat none — is the seeded system prompt's (server/src/seed_feature_prompts.js
 *  BRAINSTORM_SYSTEM / BRAINSTORM_PLOT_SYSTEM), editable in the Lab (2026-10-28). */
export function brainstormPrompt({ category, seed, liked = [], seen = [] }) {
  const list = (items) => items.map((t) => `- ${t}`).join("\n");
  let msg = `Category: ${brainstormCategory(category).value}\nSeed: ${String(seed || "").trim()}`;
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
