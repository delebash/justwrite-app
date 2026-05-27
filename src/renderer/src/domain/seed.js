// Seed data for the demo project — "The Cartographer's Daughter" by Mira Halden.
// All names and places are invented for the demo.

export const PROJECT = {
  title: "The Cartographer's Daughter",
  author: "Mira Halden",
  subtitle: "A novel",
  genre: "Literary speculative fiction",
  wordsGoal: 90000,
  dailyTarget: 1200,
  wordsWritten: 41280,
  lastSaved: "Today, 14:32",
  startedOn: "March 11, 2026",
  deadline: "December 1, 2026",
  premise:
    "A reclusive mapmaker's daughter inherits a ledger of places that no longer exist — and must decide which of them are worth bringing back.",
  // Optional book cover. Shape matches imageStore records:
  // { kind: "file" | "dataurl", path?, dataUrl?, name, mime }
  coverImage: null,
};

export const PLOTLINES = [
  { id: "s1", name: "Inheritance",      color: "oklch(0.82 0.08 75)",  status: "open", blurb: "Elen's reckoning with what her father left behind — and whether to honour it.", beats: [] },
  { id: "s2", name: "The Ledger",       color: "oklch(0.78 0.06 200)", status: "open", blurb: "The book itself: who has read it, who has added to it, what its last twelve pages mean.", beats: [
    { id: "b_s2_1", chapterId: "ch4", label: "Inciting", note: "Elen finds the bearing that doesn't match any chart she owns." },
    { id: "b_s2_2", chapterId: "ch9", label: "Midpoint", note: "The hand on the last twelve pages turns out to be someone she knows." },
  ]},
  { id: "s3", name: "Old Ports",        color: "oklch(0.74 0.07 270)", status: "open", blurb: "The harbours and coastlines the ledger names — places that have moved, vanished, or never existed.", beats: [] },
  { id: "s4", name: "Mother's silence", color: "oklch(0.78 0.07 25)",  status: "open", blurb: "What Petra refuses to say, and what Elen finally asks.", beats: [
    { id: "b_s4_1", chapterId: "ch8", label: "Refusal", note: "Petra walks out of the room rather than answer the question." },
  ]},
  { id: "s5", name: "What returns",     color: "oklch(0.78 0.06 120)", status: "open", blurb: "Brackish Cove, the tide, and the question of which inheritances can be brought back.", beats: [] },
];

export const CHARACTERS = [
  { id: "c1", main: true,  name: "Elen Vael",    role: "Protagonist",     age: 31, oneLiner: "Cartographer's daughter; archivist by trade; quietly losing faith in maps." },
  { id: "c2", main: true,  name: "Idris Vael",   role: "Father (dec.)",   age: 67, oneLiner: "Drew coastlines that disagreed with the sea. Left behind a ledger." },
  { id: "c3", main: true,  name: "June Asari",   role: "Friend / cipher", age: 30, oneLiner: "A printer who reads ink the way most people read faces." },
  { id: "c4", main: true,  name: "Halvard Renn", role: "Antagonist?",     age: 52, oneLiner: "Catalogues what is. Believes the ledger is a forgery worth burning." },
  { id: "c5", main: false, name: "Petra Lange",  role: "Aunt",            age: 64, oneLiner: "Remembers a coast that her sister claimed never existed." },
  { id: "c6", main: false, name: "Tomas",        role: "Boy on the pier", age: 9,  oneLiner: "Has been waiting a long time for someone to ask the right question." },
  { id: "c7", main: false, name: "Mrs. Oren",    role: "Neighbor",        age: 71, oneLiner: "Speaks in the present tense about people who are gone." },
  { id: "c8", main: false, name: "The Surveyor", role: "Unknown",         age: null, oneLiner: "Initials only. Three letters in the ledger's last column." },
];

export const CHARACTER_EXTRAS = {
  c1: {
    voice: {
      accent: "North coast, light British. Avoids contractions when she's tired.",
      vocabulary: "Spare. Avoids superlatives. Talks in short clauses.",
      tic: "Rephrases the question back at the asker before answering.",
      sample: "I don't know what I think yet. Ask me again when the kettle stops.",
    },
    arc: {
      start: "Believes her father's maps are arguments she shouldn't be having.",
      midpoint: "Begins to make her own restorations — small ones, at first.",
      end: "Has chosen which inheritances to honour and which to bury.",
    },
    motivation: {
      want: "To finish the ledger and be free of it.",
      need: "To accept that the ledger is unfinishable — that her job is to choose, not complete.",
      lie: "That her father's belief was a kind of illness she has to recover from.",
      truth: "That belief is a kind of map-making, and that map-making is a kind of belief.",
    },
    backstory:
      "Born 1995 in a storm year. Mother left when she was eight, never explained. Father raised her in Halden House on the cliff road. Trained as an archivist (two years; never finished). Returned to care for Idris in his last illness and stayed. Inherited the house, the theodolite, and the ledger in March 2026.",
    tags: ["protagonist", "archivist", "reluctant heir", "quiet"],
    skills: ["Map reading", "Archival research", "Long walks without speaking"],
    weaknesses: ["Cannot make small talk", "Sleeps badly", "Slow to trust anyone who lists things"],
    symbols: ["The ledger", "The brass theodolite", "Her father's deliberately-wrong hinge"],
    quotes: [
      "I'm going to go and see if it's there.",
      "And if it isn't, then I'll have to decide whether to put it back.",
      "Condemned was a kind of inheritance. Nothing further could happen to it.",
    ],
    beats: [
      { ch: 1,  beat: "Receives the key, opens the study, sees the ledger." },
      { ch: 4,  beat: "Takes a disputed bearing for the first time." },
      { ch: 5,  beat: "Walks to Old Harbor 7." },
      { ch: 7,  beat: "Confides in June. Decides to walk to Brackish Cove." },
      { ch: 9,  beat: "Confronts the question of whose hand wrote the last twelve pages." },
      { ch: 13, beat: "Takes the final bearing. Decides what to keep." },
    ],
  },
  c4: {
    voice: { accent: "RP, slightly clipped.", vocabulary: "Civil-service phrasings.", tic: "Pauses before disagreeing, as if checking a list.", sample: "I am not asking you to give up the book. I am asking you to consider what it is." },
    arc: { start: "Believes Idris was a kindly fraud.", midpoint: "Realises Elen is not her father.", end: "Walks away with the question." },
    motivation: { want: "Remove the ledger from circulation.", need: "To be wrong once.", lie: "That his catalogue keeps the coast honest.", truth: "That an honest coast may require dishonest entries." },
    tags: ["antagonist", "cataloger", "widower"],
    quotes: ["That ledger is a fiction.", "I am prepared to be generous about it."],
    beats: [
      { ch: 2, beat: "Calls Elen for the first time." },
      { ch: 6, beat: "Makes his offer." },
      { ch: 13, beat: "Final conversation." },
    ],
  },
  c3: {
    voice: { accent: "Mancunian softened by twenty years away from it.", vocabulary: "Printer's vernacular.", tic: "Manages objects as if they had feelings.", sample: "I read the last twelve pages on the train. Twice." },
    motivation: { want: "To be useful without taking over.", need: "To trust Elen to decide alone." },
    tags: ["confidant", "printer", "patient"],
    quotes: ["It isn't your father.", "I'd know his hand the way I know my own."],
    beats: [
      { ch: 3, beat: "First meeting. Brings ink samples." },
      { ch: 7, beat: "Goes to Brackish Cove with Elen." },
      { ch: 9, beat: "Identifies the second hand." },
    ],
  },
};

export const LOCATIONS = [
  { id: "l1", name: "Halden House",      kind: "Family home", note: "On the cliff road. Salt warps the doors every winter." },
  { id: "l2", name: "Brackish Cove",     kind: "Coast",       note: "Not on any modern chart." },
  { id: "l3", name: "Lange & Co. Print", kind: "Workshop",    note: "Where June keeps the lead type and her father's letters." },
  { id: "l4", name: "Customs House",     kind: "Institution", note: "Renn's office." },
  { id: "l5", name: "St. Eira's Chapel", kind: "Ruin",        note: "Half tide, half wall." },
  { id: "l6", name: "Old Harbor 7",      kind: "Port",        note: "Numbered, never named." },
];

export const OBJECTS = [
  { id: "o1", name: "The Ledger",        kind: "Manuscript", note: "Cloth-bound, 84 pages, last 12 in a different hand." },
  { id: "o2", name: "Brass theodolite",  kind: "Instrument", note: "Idris's. Set to a bearing no one recognizes." },
  { id: "o3", name: "Letter, unsent",    kind: "Document",   note: "Addressed to E.V., dated three years before Elen was born." },
  { id: "o4", name: "Painted oar",       kind: "Heirloom",   note: "Names written along the blade." },
  { id: "o5", name: "Sea-glass token",   kind: "Trinket",    note: "Tomas carries it." },
];

export const PARTS = [
  { id: "p1", title: "The Inheritance", chapters: [
    { id: "ch1", num: 1, title: "What the door remembers",       words: 3120, status: "done",   plotlines: ["s1"],       scenes: 3 },
    { id: "ch2", num: 2, title: "An inventory in two hands",     words: 2840, status: "done",   plotlines: ["s1", "s2"], scenes: 4 },
    { id: "ch3", num: 3, title: "June, with a printer's apron",  words: 2210, status: "revise", plotlines: ["s1", "s2"], scenes: 2 },
    { id: "ch4", num: 4, title: "A bearing no one recognizes",   words: 3640, status: "done",   plotlines: ["s2", "s3"], scenes: 4 },
  ]},
  { id: "p2", title: "The Ledger", chapters: [
    { id: "ch5", num: 5, title: "Old Harbor 7",                  words: 3010, status: "done",   plotlines: ["s3"],       scenes: 3 },
    { id: "ch6", num: 6, title: "Renn keeps a list",             words: 2480, status: "draft",  plotlines: ["s2"],       scenes: 3 },
    { id: "ch7", num: 7, title: "Brackish Cove, at low tide",    words: 3995, status: "draft",  plotlines: ["s3", "s5"], scenes: 5 },
    { id: "ch8", num: 8, title: "Petra refuses the chair",       words: 1820, status: "revise", plotlines: ["s4"],       scenes: 2 },
    { id: "ch9", num: 9, title: "The hand that wrote the last twelve pages", words: 2640, status: "draft", plotlines: ["s2"], scenes: 3 },
  ]},
  { id: "p3", title: "What Returns", chapters: [
    { id: "ch10", num: 10, title: "St. Eira's, between tides",   words: 2380, status: "draft", plotlines: ["s5"],       scenes: 3 },
    { id: "ch11", num: 11, title: "Tomas, who is older than he is", words: 1840, status: "todo", plotlines: ["s5"],     scenes: 2 },
    { id: "ch12", num: 12, title: "The unsent letter",           words: 1640, status: "todo", plotlines: ["s4", "s5"], scenes: 2 },
    { id: "ch13", num: 13, title: "A bearing, taken twice",      words: 950,  status: "todo", plotlines: ["s5", "s3"], scenes: 1 },
  ]},
];

// Per-chapter scene records: { [chapterId]: [{ title, body }, ...] }.
// Each entry becomes one scene at boot. Chapters not listed here open
// with zero scenes — the user adds them via the chapter overview pane
// or the sidebar's per-chapter "+" button. Bodies are HTML
// (TipTap-friendly).
export const SCENES = {
  ch1: [
    { title: "The key, after persuasion", body: `<p>The key turned, after some persuasion. The door swung open onto a room her father had not let her into for fifteen years.</p>
<p>She stood in the doorway for the length of one breath, two. The kettle in the kitchen had begun to whistle, and she let it.</p>` },
    { title: "Cedar and pipe ash", body: `<p>It smelled of cedar and pipe ash and a third thing she could not name. Later, she would decide it had been the smell of paper that had not been disturbed.</p>
<p>The window faced east. The window had not been opened in a long time.</p>` },
    { title: "The chair, the desk, the hands", body: `<p>His chair was pushed in. His desk was clear. The only thing out of place was a small brass weight he had used for keeping a page open against the wind.</p>
<p>It was holding nothing down. She picked it up, and the weight of it was the weight of him.</p>` },
  ],
  ch2: [
    { title: "What the room held", body: `<p>Three drawers. Two cabinets. A leather case she had never seen before, brass-cornered, with the initials I.V. tooled small at the throat.</p>
<p>She made a list, because making a list was a thing her mother would have done, and because she was not yet ready to open the case.</p>` },
    { title: "Petra, at the kitchen window", body: `<p>Petra had let herself in by the back door, the way she always had. She did not offer to help with the inventory. She set a loaf of bread on the table and said nothing about the case.</p>
<p>"You'll want to be careful which papers you keep," she said, eventually. "Some of them are for keeping. Some are for not."</p>` },
    { title: "What she would carry away", body: `<p>By dusk Elen had two stacks. A short one and a long one. The short one she put back where she had found it. The long one she put into a satchel and carried into the front room and did not look at again until morning.</p>` },
  ],
  ch3: [
    { title: "The kettle", body: `<p>June was already there, because June was always already there. She had brought the small electric kettle she carried everywhere and the printer's apron she did not need.</p>
<p>"You haven't slept," she said, without looking up.</p>
<p>"No."</p>
<p>"Tea. Then the case. In that order."</p>` },
    { title: "Two readings, one ink", body: `<p>June opened the leather case at the table. She turned the pages slowly, the way one turns the pages of a book one already knows.</p>
<p>"This is your father," she said, "to about page sixty. After that, it isn't. Whoever it is uses the same ink. They've gone to some trouble."</p>` },
  ],
  ch4: [
    { title: "A bearing on a page", body: `<p>The bearing was written in a hand Elen did not recognize, in a column Idris had reserved for a footnote that had never been added.</p>
<p>It read: <em>54° 11' N, 4° 09' W</em>. Below it, a single word: <em>almost</em>.</p>` },
    { title: "A coast that should not be there", body: `<p>She unrolled the largest of her father's charts on the kitchen table. The bearing pointed to a stretch of water between two known headlands. There was no land there. There had never been land there.</p>
<p>And yet someone had written it down as if there were.</p>` },
  ],
  ch5: [
    { title: "Old Harbor 7", body: `<p>Old Harbor 7 had been numbered when there were still seven harbours. Now there were four. The number had outlived the use.</p>
<p>She walked the length of the seawall in a wind that smelled of iron and rope.</p>` },
    { title: "What the customs house wanted", body: `<p>The customs house had not been a customs house for nine years. Its windows had been boarded, then unboarded, then boarded again, in a sequence that suggested no one in particular was in charge of remembering whether it was a building or a ruin.</p>
<p>She decided, for the time being, that it was both.</p>` },
  ],
  ch6: [
    { title: "Renn's list", body: `<p>Halvard Renn kept his lists in a small green book. He let Elen see only the page she had asked about, and then only after she had agreed not to copy it.</p>
<p>"Your father's name is on it," he said. "Twice. The second time was after his death."</p>` },
    { title: "What lists do not say", body: `<p>"You catalogue what exists," she said. "What about what doesn't?"</p>
<p>"That isn't my office."</p>
<p>"Whose office is it?"</p>
<p>Renn closed the green book. "I don't know," he said. "I have wondered."</p>` },
  ],
  ch7: [
    { title: "The customs house, condemned", body: `<p>The customs house at Old Harbor 7 had been condemned for nine years, which meant it was the most reliable building Elen knew. Condemned was a kind of inheritance. Nothing further could happen to it.</p>
<p>She climbed the iron stair on the seaward side, the one Renn had told her not to use, and let herself in through the door her father had once rehung.</p>
<p><em>Almost closed</em>, she thought. <em>That is the whole house. That is the whole ledger.</em></p>` },
    { title: "June's apron, June's kettle", body: `<p>June was already there. She had brought a printer's apron she did not need and the small electric kettle she carried everywhere.</p>
<p>"I read the last twelve pages on the train," June said, without looking up. "Twice. And then once more on the platform."</p>
<p>"And?"</p>
<p>"It isn't your father. I'd know his hand the way I know my own."</p>` },
    { title: "What she is going to do", body: `<p>"Tell me what you're going to do," June said.</p>
<p>"I'm going to go and see if it's there," she said.</p>
<p>"And if it isn't?"</p>
<p>"Then I'll have to decide whether to put it back."</p>` },
  ],
  ch8: [
    { title: "The question Elen finally asks", body: `<p>It was the first warm evening of the season, and Petra had been quiet for longer than Petra was ever quiet.</p>
<p>"Was there a coast," Elen said. "Between the headlands. When you were a girl."</p>
<p>Petra set down her cup. Petra did not look at her.</p>` },
    { title: "Silence, leaving the room", body: `<p>Petra stood, smoothed her skirt, and walked out through the kitchen and into the garden and did not come back until the bread was cold.</p>
<p>That, too, Elen decided, was an answer.</p>` },
  ],
  ch9: [
    { title: "Twelve pages, eleven differences", body: `<p>She and June spread the last twelve pages out across the long table at the print shop, in order, and weighted each corner with the brass weights Idris had used.</p>
<p>They counted differences. They counted eleven. The twelfth page, June said, was the one she could not yet make herself look at.</p>` },
    { title: "The shape of the letter g", body: `<p>"It's the g," June said, finally. "Your father's g comes down in a straight line. This g loops."</p>
<p>"That's all?"</p>
<p>"It's enough. A person doesn't change the way they write a g."</p>` },
  ],
};

export const NOTES = [
  { id: "n1", title: "Why the last twelve pages", body: "Idris stopped writing in 2003. Someone else continued.", tag: "structure", updated: "May 22" },
  { id: "n2", title: "On maps, an epigraph", body: "Still looking for a quieter source than Borges.", tag: "research", updated: "May 19" },
  { id: "n3", title: "Brackish Cove — does it exist?", body: "Decide before Part Three.", tag: "plot", updated: "May 17" },
];

export const GROUPS = [
  { id: "g1", name: "The Vael family", blurb: "Three generations, one quiet argument about what is true.", color: "oklch(0.65 0.13 25)",
    members: [
      { kind: "character", id: "c1", name: "Elen Vael" },
      { kind: "character", id: "c2", name: "Idris Vael" },
      { kind: "character", id: "c5", name: "Petra Lange" },
      { kind: "location",  id: "l1", name: "Halden House" },
    ]},
  { id: "g2", name: "Catalogue & customs", blurb: "Those who write down what exists.", color: "oklch(0.55 0.08 230)",
    members: [
      { kind: "character", id: "c4", name: "Halvard Renn" },
      { kind: "location",  id: "l4", name: "Customs House" },
      { kind: "object",    id: "o1", name: "The Ledger" },
    ]},
  { id: "g3", name: "Disputed coast", blurb: "Places that don't agree about themselves.", color: "oklch(0.58 0.07 120)",
    members: [
      { kind: "location", id: "l2", name: "Brackish Cove" },
      { kind: "location", id: "l5", name: "St. Eira's Chapel" },
      { kind: "location", id: "l6", name: "Old Harbor 7" },
    ]},
];

export const ARCHITECTURE = {
  premise:     { id: "premise",     title: "Premise",      blurb: "The single sentence the novel can be reduced to.", status: "done",  words: 184,  body: "A reclusive cartographer's daughter inherits a ledger of places that no longer exist — and must decide which of them are worth bringing back." },
  fabula:      { id: "fabula",      title: "Fabula",       blurb: "The story as it happens in time.",                  status: "draft", words: 1240, body: "Part One — The Inheritance.\n\nPart Two — The Ledger.\n\nPart Three — What Returns." },
  setting:     { id: "setting",     title: "Setting",      blurb: "The world the book occupies.",                       status: "draft", words: 920,  body: "A north-facing coastline. Late spring into early autumn, 2026." },
  globalnotes: { id: "globalnotes", title: "Global notes", blurb: "Anything that touches the whole project.",           status: "todo",  words: 240,  body: "Epigraph: still looking for a quieter source than Borges." },
};

export const WORLDBUILDING_CATEGORIES = [
  { id: "geography",   label: "Geography",     icon: "Pin",       hue: 130 },
  { id: "history",     label: "History",       icon: "Calendar",  hue: 30 },
  { id: "cultures",    label: "Cultures",      icon: "Users",     hue: 60 },
  { id: "languages",   label: "Languages",     icon: "Quote",     hue: 200 },
  { id: "factions",    label: "Factions",      icon: "GroupIcon", hue: 270 },
  { id: "lore",        label: "Lore & myth",   icon: "Sparkle",   hue: 320 },
];

export const WORLDBUILDING = [
  { id: "wb1", category: "geography", title: "The North Coast", tags: ["setting"], status: "done", words: 540, summary: "The coastline the novel takes place on.", body: "The coastline runs roughly north-east from the county town to Tern Head — about forty miles of cliff and pebble.", related: ["wb2"] },
  { id: "wb2", category: "geography", title: "Brackish Cove", tags: ["disputed"], status: "draft", words: 230, summary: "A place whose existence is the novel's central question.", body: "Drawn twice on Idris's maps, ten years apart, in two slightly different places.", related: ["wb1"] },
  { id: "wb3", category: "history", title: "The 1881 Ordnance Survey", tags: ["maps"], status: "done", words: 420, summary: "The first authoritative map of the coast.", body: "First-edition six-inch survey, walked by a team of three over two summers." },
  { id: "wb4", category: "factions", title: "Catalogers and restorers", tags: ["theme"], status: "draft", words: 380, summary: "The novel's central argument.", body: "The catalogers believe a coastline is whatever the last authoritative survey said it is. The restorers believe a coastline is an argument the sea is having with itself." },
  { id: "wb5", category: "lore", title: "The legend of vanishing places", tags: ["myth"], status: "draft", words: 410, summary: "Local folklore about coastal sites that come and go.", body: "Variants of the same story are told in all three villages." },
];

// ── AI providers ──────────────────────────────────────────────────────────

export const DEFAULT_PROVIDERS = [
  {
    id: "ollama-local", name: "Ollama (local)", kind: "llm",
    baseUrl: "http://localhost:11434/v1",
    chatModel: "llama3.1:8b",
    builtIn: true,
  },
  {
    id: "lmstudio-local", name: "LM Studio (local)", kind: "llm",
    baseUrl: "http://localhost:1234/v1",
    chatModel: "auto",
    builtIn: true,
  },
  {
    id: "openai", name: "OpenAI", kind: "both",
    baseUrl: "https://api.openai.com/v1",
    chatModel: "gpt-4o-mini",
    ttsModel: "gpt-4o-mini-tts",
    ttsVoices: ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"],
    builtIn: true,
  },
  {
    id: "openedai-speech", name: "openedai-speech (local TTS proxy)", kind: "tts",
    baseUrl: "http://localhost:8000/v1",
    ttsModel: "tts-1",
    ttsVoices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
    builtIn: true,
  },
  {
    id: "kokoro", name: "Kokoro (local TTS)", kind: "tts",
    baseUrl: "http://localhost:8880/v1",
    ttsModel: "kokoro",
    ttsVoices: ["af_bella", "af_sarah", "af_nicole", "af_sky", "am_adam", "am_michael", "bf_emma", "bf_isabella", "bm_george", "bm_lewis"],
    builtIn: true,
  },
  {
    id: "vibevoice", name: "VibeVoice (local TTS)", kind: "tts",
    baseUrl: "http://localhost:8001/v1",
    ttsModel: "vibevoice-1.5b",
    ttsVoices: ["Alice", "Andrew", "Bowen", "Carter", "Frank", "Maya"],
    builtIn: true,
  },
  {
    id: "chatterbox-turbo", name: "Chatterbox-Turbo (local TTS)", kind: "tts",
    baseUrl: "http://localhost:4123/v1",
    ttsModel: "chatterbox-turbo",
    ttsVoices: ["aria", "caleb", "mira", "theo"],
    builtIn: true,
  },
  {
    id: "xtts-v2", name: "XTTS-v2 (Coqui, local TTS)", kind: "tts",
    baseUrl: "http://localhost:8020/v1",
    ttsModel: "xtts-v2",
    ttsVoices: ["Claribel Dervla", "Daisy Studious", "Gracie Wise", "Andrew Chipper", "Royston Min", "Damien Black"],
    builtIn: true,
  },
];

export const SAMPLE_VOICES = [
  { id: "alloy",   providerId: "openai", name: "Alloy",   gender: "neutral", age: "adult", accent: "American", tone: "balanced" },
  { id: "nova",    providerId: "openai", name: "Nova",    gender: "female",  age: "adult", accent: "American", tone: "expressive" },
  { id: "onyx",    providerId: "openai", name: "Onyx",    gender: "male",    age: "adult", accent: "American", tone: "rich, deep" },
  { id: "shimmer", providerId: "openai", name: "Shimmer", gender: "female",  age: "adult", accent: "American", tone: "soft" },
  { id: "fable",   providerId: "openai", name: "Fable",   gender: "neutral", age: "adult", accent: "British",  tone: "warm, narrative" },
  { id: "echo",    providerId: "openai", name: "Echo",    gender: "male",    age: "adult", accent: "American", tone: "measured" },

  // Kokoro — small, fast local TTS (Kokoro-FastAPI, OpenAI-compatible).
  { id: "af_bella",    providerId: "kokoro", name: "Bella",    gender: "female", age: "adult", accent: "American", tone: "warm" },
  { id: "af_sarah",    providerId: "kokoro", name: "Sarah",    gender: "female", age: "adult", accent: "American", tone: "bright" },
  { id: "af_nicole",   providerId: "kokoro", name: "Nicole",   gender: "female", age: "adult", accent: "American", tone: "intimate, whispered" },
  { id: "af_sky",      providerId: "kokoro", name: "Sky",      gender: "female", age: "young", accent: "American", tone: "airy" },
  { id: "am_adam",     providerId: "kokoro", name: "Adam",     gender: "male",   age: "adult", accent: "American", tone: "steady" },
  { id: "am_michael",  providerId: "kokoro", name: "Michael",  gender: "male",   age: "adult", accent: "American", tone: "grounded" },
  { id: "bf_emma",     providerId: "kokoro", name: "Emma",     gender: "female", age: "adult", accent: "British",  tone: "poised" },
  { id: "bf_isabella", providerId: "kokoro", name: "Isabella", gender: "female", age: "adult", accent: "British",  tone: "literary" },
  { id: "bm_george",   providerId: "kokoro", name: "George",   gender: "male",   age: "adult", accent: "British",  tone: "authoritative" },
  { id: "bm_lewis",    providerId: "kokoro", name: "Lewis",    gender: "male",   age: "adult", accent: "British",  tone: "dry" },

  // VibeVoice — Microsoft multi-speaker TTS (1.5B model defaults).
  { id: "Alice",  providerId: "vibevoice", name: "Alice",  gender: "female", age: "adult", accent: "American", tone: "conversational" },
  { id: "Andrew", providerId: "vibevoice", name: "Andrew", gender: "male",   age: "adult", accent: "American", tone: "easygoing" },
  { id: "Bowen",  providerId: "vibevoice", name: "Bowen",  gender: "male",   age: "adult", accent: "American", tone: "confident" },
  { id: "Carter", providerId: "vibevoice", name: "Carter", gender: "male",   age: "adult", accent: "American", tone: "thoughtful" },
  { id: "Frank",  providerId: "vibevoice", name: "Frank",  gender: "male",   age: "older", accent: "American", tone: "weathered" },
  { id: "Maya",   providerId: "vibevoice", name: "Maya",   gender: "female", age: "adult", accent: "American", tone: "lyrical" },

  // Chatterbox-Turbo — Resemble's open-source emotional TTS. Built-in presets;
  // clone-from-reference is the typical workflow, so treat these as starters.
  { id: "aria",  providerId: "chatterbox-turbo", name: "Aria",  gender: "female", age: "adult", accent: "American", tone: "expressive" },
  { id: "caleb", providerId: "chatterbox-turbo", name: "Caleb", gender: "male",   age: "adult", accent: "American", tone: "narrative" },
  { id: "mira",  providerId: "chatterbox-turbo", name: "Mira",  gender: "female", age: "adult", accent: "American", tone: "intimate" },
  { id: "theo",  providerId: "chatterbox-turbo", name: "Theo",  gender: "male",   age: "adult", accent: "British",  tone: "stoic" },

  // XTTS-v2 — Coqui multilingual TTS, sampling its English speaker presets.
  { id: "Claribel Dervla", providerId: "xtts-v2", name: "Claribel Dervla", gender: "female", age: "adult", accent: "Irish",    tone: "lilting" },
  { id: "Daisy Studious",  providerId: "xtts-v2", name: "Daisy Studious",  gender: "female", age: "adult", accent: "British",  tone: "scholarly" },
  { id: "Gracie Wise",     providerId: "xtts-v2", name: "Gracie Wise",     gender: "female", age: "older", accent: "American", tone: "knowing" },
  { id: "Andrew Chipper",  providerId: "xtts-v2", name: "Andrew Chipper",  gender: "male",   age: "adult", accent: "American", tone: "cheerful" },
  { id: "Royston Min",     providerId: "xtts-v2", name: "Royston Min",     gender: "male",   age: "adult", accent: "British",  tone: "formal" },
  { id: "Damien Black",    providerId: "xtts-v2", name: "Damien Black",    gender: "male",   age: "adult", accent: "American", tone: "gravelly" },
];

export const DEFAULT_CAST = {
  narrator: "fable",
  characters: {
    c1: "shimmer", c2: "onyx", c3: "nova", c4: "echo",
    c5: "alloy",   c6: "shimmer", c7: null, c8: null,
  },
};

export const SCRIPT_CH7 = [
  { speaker: "narrator", confidence: 1.0,  kind: "scene",     text: "Scene i" },
  { speaker: "narrator", confidence: 1.0,  kind: "narration", text: "The customs house at Old Harbor 7 had been condemned for nine years." },
  { speaker: "c1",       confidence: 0.62, kind: "interior",  text: "Almost closed. That is the whole house. That is the whole ledger." },
  { speaker: "narrator", confidence: 1.0,  kind: "scene",     text: "Scene ii" },
  { speaker: "c3",       confidence: 0.99, kind: "dialogue",  text: "I read the last twelve pages on the train. Twice. And then once more on the platform." },
  { speaker: "c1",       confidence: 0.74, kind: "dialogue",  text: "And?" },
  { speaker: "c3",       confidence: 0.97, kind: "dialogue",  text: "It isn't your father. I'd know his hand the way I know my own." },
  { speaker: "c1",       confidence: 0.98, kind: "dialogue",  text: "I'm going to go and see if it's there." },
  { speaker: "c3",       confidence: 0.95, kind: "dialogue",  text: "And if it isn't?" },
  { speaker: "c1",       confidence: 0.97, kind: "dialogue",  text: "Then I'll have to decide whether to put it back." },
];

export const RENDER_QUEUE = [
  { id: "r1", chapterId: "ch1", num: 1, title: "What the door remembers",   progress: 100, status: "done", duration: "00:18:42", size: "26.4 MB" },
  { id: "r2", chapterId: "ch2", num: 2, title: "An inventory in two hands", progress: 100, status: "done", duration: "00:17:08", size: "24.1 MB" },
  { id: "r6", chapterId: "ch6", num: 6, title: "Renn keeps a list",         progress: 100, status: "needs-review", duration: "00:14:56", size: "21.1 MB", warnings: 3 },
  { id: "r7", chapterId: "ch7", num: 7, title: "Brackish Cove, at low tide", progress: 68, status: "rendering", currentPara: 14 },
  { id: "r8", chapterId: "ch8", num: 8, title: "Petra refuses the chair",   progress: 0,   status: "queued" },
  { id: "r10",chapterId: "ch10",num: 10, title: "St. Eira's, between tides", progress: 0,  status: "blocked", reason: "Mrs. Oren has no voice assigned" },
];
