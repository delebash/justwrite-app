// Tutorial Project seed.
//
// Used by project.createTutorialProject(). Materializes a real JustWrite
// project (not a tour/coach-mark layer) the user can poke at without
// breaking their own work — the Scrivener pattern. A single chapter, two
// characters, one location, one narrative strand with a beat, one
// worldbuilding article. Enough surfaces wired to teach how the app
// hangs together; small enough to delete in 30 seconds.

export const TUTORIAL_TITLE = "Tutorial Project";
export const TUTORIAL_AUTHOR = "JustWrite";

export const TUTORIAL_CHARACTERS = [
  {
    name: "Mira Vance",
    role: "Protagonist",
    main: true,
    bio: "A cartographer's daughter, twenty-six, who inherited a half-drawn map of an island that does not appear on any other chart.",
    notes: "POV character for this chapter. Mira drives the question the chapter opens.",
  },
  {
    name: "Halvard",
    role: "Mentor",
    main: false,
    bio: "Mira's late father's drafting partner. Knows more about the map than he says.",
    notes: "Speaks in clipped sentences. Withholds.",
  },
];

export const TUTORIAL_LOCATIONS = [
  {
    name: "The Drafting Loft",
    kind: "Interior",
    notes: "Top floor of the harbour mapworks. Long tables, north light, the smell of linseed oil and ink. Mira's father's chair is still there.",
  },
];

export const TUTORIAL_STRAND = {
  name: "The Phantom Island",
  color: "#c8893a",
  beat: {
    label: "Mira finds the half-drawn map",
    note: "Opening beat — establishes the question and Mira's stake.",
  },
};

export const TUTORIAL_WORLDBUILDING = {
  title: "Cartography in this world",
  category: "Lore",
  body: `<p>Maps in this world are <strong>contracts</strong>, not surveys. A chart is sworn by the cartographer's guild and stamped — once stamped, it is treated as true. Disputing a stamped chart is a guild offence.</p>
<p>This is why Mira's father drew the phantom island in pencil, never in ink. Pencil is provisional. Ink is testimony.</p>`,
};

export const TUTORIAL_CHAPTER = {
  title: "The Half-Drawn Map",
  prose: `<p>The chest had been locked for nine years, and when Mira finally pried the lid, the smell that rose was older than that — linseed oil, foxed paper, the faintly metallic tang of dried ink. She held her breath. She had expected, at most, a few rolled charts.</p>
<p>What she found instead was a single sheet, folded in quarters, with one corner stamped and three corners blank.</p>
<p>The stamped quarter showed the familiar coastline north of the harbour, every cove and rock named in her father's small precise hand. The other three quarters held an island — long, hooked at one end, marked with a single river — that did not exist on any chart in the loft. None of the survey-ledgers mentioned it. The Admiralty atlases did not show it. And the three blank corners had no stamp at all.</p>
<p>Mira sat back on her heels. <em>Pencil is provisional</em>, her father used to say, <em>and ink is testimony.</em></p>
<p>The island was in pencil.</p>
<p>She had carried the chest down from the loft the previous night, certain she was finally ready to clear out the last of his things. She had been wrong about that. She slid the map back into its folds and felt her hands shake.</p>
<p>Halvard would know.</p>`,
  scenes: [
    {
      title: "The chest",
      body: `<p>The chest had been locked for nine years, and when Mira finally pried the lid, the smell that rose was older than that — linseed oil, foxed paper, the faintly metallic tang of dried ink. She held her breath. She had expected, at most, a few rolled charts.</p>
<p>What she found instead was a single sheet, folded in quarters, with one corner stamped and three corners blank.</p>`,
    },
    {
      title: "The island",
      body: `<p>The stamped quarter showed the familiar coastline north of the harbour, every cove and rock named in her father's small precise hand. The other three quarters held an island — long, hooked at one end, marked with a single river — that did not exist on any chart in the loft. None of the survey-ledgers mentioned it. The Admiralty atlases did not show it. And the three blank corners had no stamp at all.</p>
<p>Mira sat back on her heels. <em>Pencil is provisional</em>, her father used to say, <em>and ink is testimony.</em></p>
<p>The island was in pencil.</p>`,
    },
    {
      title: "Halvard would know",
      body: `<p>She had carried the chest down from the loft the previous night, certain she was finally ready to clear out the last of his things. She had been wrong about that. She slid the map back into its folds and felt her hands shake.</p>
<p>Halvard would know.</p>`,
    },
  ],
};

export const TUTORIAL_NOTE = {
  title: "Read me first",
  body: `<p>Welcome to the Tutorial Project — a real JustWrite project you can poke at without breaking your own work.</p>
<p>Some things to try:</p>
<ul>
<li>Open <strong>Chapters</strong> in the sidebar and read "The Half-Drawn Map" — it's one chapter with three scenes.</li>
<li>Click the <strong>?</strong> next to any pane title for help on that surface.</li>
<li>Open the <strong>Audio Studio</strong> and try analysing the chapter's speakers.</li>
<li>Open <strong>Architecture → Premise</strong> and write a one-line premise for this story.</li>
<li>Open the <strong>Plot Board</strong> — "The Phantom Island" strand has one beat already.</li>
</ul>
<p>When you're done, delete the project from the sidebar's project switcher and your real work is untouched.</p>`,
};
