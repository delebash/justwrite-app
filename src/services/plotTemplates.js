// Plot-structure templates. Each one is a strand seed plus an ordered
// list of beat labels with short notes. `applyTemplate()` materializes
// the template into the project store via the existing addStrand /
// addStrandBeat actions, returning the new strand id so the caller can
// scroll to it.
//
// Beats start unassigned (chapterId: null) — the writer drags them onto
// chapters on the plot board.

export const PLOT_TEMPLATES = {
  "three-act": {
    id: "three-act",
    label: "Three-Act Structure",
    blurb: "The classic backbone: setup, confrontation, resolution. Six beats marking the major turning points.",
    color: "oklch(0.66 0.13 250)",
    beats: [
      { label: "Hook",              note: "Open with something that demands attention." },
      { label: "Inciting incident", note: "The event that disrupts ordinary life and starts the story." },
      { label: "First plot point",  note: "End of Act I — the protagonist commits to the journey." },
      { label: "Midpoint",          note: "A revelation or shift that recenters the stakes." },
      { label: "Second plot point", note: "Darkest moment. Everything seems lost." },
      { label: "Climax",            note: "Final confrontation — the question of the story gets answered." },
      { label: "Resolution",        note: "The new normal." },
    ],
  },

  "five-act": {
    id: "five-act",
    label: "Five-Act Structure",
    blurb: "Freytag's pyramid: exposition, rising action, climax, falling action, dénouement. Useful for tragedies and ensemble dramas.",
    color: "oklch(0.62 0.14 30)",
    beats: [
      { label: "Exposition",     note: "Establish the world, characters, and status quo." },
      { label: "Inciting moment", note: "The first disturbance that pulls characters toward conflict." },
      { label: "Rising action",  note: "Stakes escalate; alliances and obstacles emerge." },
      { label: "Turn",           note: "A crucial decision or revelation that changes trajectory." },
      { label: "Climax",         note: "Peak intensity — irreversible action." },
      { label: "Falling action", note: "Consequences ripple outward." },
      { label: "Dénouement",     note: "Tie up loose threads. Show the new equilibrium (or its absence)." },
    ],
  },

  "save-the-cat": {
    id: "save-the-cat",
    label: "Save the Cat",
    blurb: "Blake Snyder's 15-beat sheet. Tight scaffolding popular for genre fiction and screenplays.",
    color: "oklch(0.74 0.13 150)",
    beats: [
      { label: "Opening Image",    note: "A single image that captures the protagonist's status quo." },
      { label: "Theme Stated",     note: "Someone (not the hero) states the moral question of the story." },
      { label: "Set-Up",           note: "Hero's flaw is shown. Stakes hinted at. Around 10% of the book." },
      { label: "Catalyst",         note: "Inciting incident — the disrupting event." },
      { label: "Debate",           note: "Hero hesitates. Asks the central question." },
      { label: "Break Into Two",   note: "Hero commits and crosses into the new world (~25%)." },
      { label: "B Story",          note: "Subplot begins — usually love or mentor. Carries the theme." },
      { label: "Fun and Games",    note: "The promise of the premise. Spectacle, set pieces, joy." },
      { label: "Midpoint",         note: "False victory or false defeat. Stakes raised (~50%)." },
      { label: "Bad Guys Close In", note: "Antagonists tighten. Internal cracks show." },
      { label: "All Is Lost",      note: "Whiff of death. The opposite of the opening image (~75%)." },
      { label: "Dark Night of the Soul", note: "Hero hits rock bottom. Reflects." },
      { label: "Break Into Three", note: "A and B stories converge. Hero finds the answer." },
      { label: "Finale",           note: "Hero storms the castle. Old world dismantled, new world built." },
      { label: "Final Image",      note: "Mirror of the opening image — shows transformation." },
    ],
  },

  "heros-journey": {
    id: "heros-journey",
    label: "Hero's Journey",
    blurb: "Campbell's monomyth via Vogler. Twelve stages mapping the archetypal transformation arc.",
    color: "oklch(0.72 0.14 70)",
    beats: [
      { label: "Ordinary World",         note: "Hero in their familiar environment, before the call." },
      { label: "Call to Adventure",      note: "A challenge, problem, or opportunity appears." },
      { label: "Refusal of the Call",    note: "Reluctance, fear, hesitation." },
      { label: "Meeting the Mentor",     note: "Guidance, gift, or wisdom from a wiser figure." },
      { label: "Crossing the Threshold", note: "Hero commits and enters the special world." },
      { label: "Tests, Allies, Enemies", note: "First trials. Hero learns the rules of the new world." },
      { label: "Approach to the Inmost Cave", note: "Preparation for the central ordeal." },
      { label: "Ordeal",                 note: "The crisis at the heart of the journey. Symbolic death." },
      { label: "Reward",                 note: "Hero seizes the prize and survives the ordeal." },
      { label: "The Road Back",          note: "Hero leaves the special world. Pursuit begins." },
      { label: "Resurrection",           note: "A final test that completes the transformation." },
      { label: "Return with the Elixir", note: "Hero returns home changed, bringing something that heals the ordinary world." },
    ],
  },

  "story-circle": {
    id: "story-circle",
    label: "Story Circle",
    blurb: "Dan Harmon's eight-step distillation of the monomyth. Compact and recursive — works at chapter or arc level.",
    color: "oklch(0.70 0.12 200)",
    beats: [
      { label: "You",       note: "A character in a zone of comfort." },
      { label: "Need",      note: "But they want something." },
      { label: "Go",        note: "They enter an unfamiliar situation." },
      { label: "Search",    note: "Adapt to it." },
      { label: "Find",      note: "Find what they wanted." },
      { label: "Take",      note: "Pay a heavy price for it." },
      { label: "Return",    note: "Then return to their familiar situation." },
      { label: "Change",    note: "Having changed." },
    ],
  },
};

export const TEMPLATE_ORDER = [
  "three-act",
  "five-act",
  "save-the-cat",
  "heros-journey",
  "story-circle",
];

/**
 * Materialize a template into the project store. Creates a new strand
 * with the template's name + color + blurb, then appends every beat as
 * an unassigned beat (chapterId: null). Returns the new strand id.
 *
 * @param {ReturnType<typeof import("../stores/project.js").useProjectStore>} project
 * @param {string} templateId
 * @param {{ name?: string }} opts — override the new strand's name
 */
export function applyTemplate(project, templateId, opts = {}) {
  const tpl = PLOT_TEMPLATES[templateId];
  if (!tpl) return null;
  const strandId = project.addStrand({
    name: opts.name || tpl.label,
    color: tpl.color,
    blurb: tpl.blurb,
    body: "",
    status: "open",
  });
  for (const b of tpl.beats) {
    project.addStrandBeat(strandId, {
      label: b.label,
      note: b.note,
      chapterId: null,
      sceneId: null,
    });
  }
  return strandId;
}
