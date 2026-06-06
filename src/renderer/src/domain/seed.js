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
  // lastSaved is computed at runtime from project._lastSavedAt — no
  // seed value (a hardcoded date here would be a lie).
  startedOn: "March 11, 2026",
  deadline: "December 1, 2026",
  premise:
    "A reclusive mapmaker's daughter inherits a ledger of places that no longer exist — and must decide which of them are worth bringing back.",
  // Optional book cover. Shape matches imageStore records:
  // { kind: "file" | "dataurl", path?, dataUrl?, name, mime }
  coverImage: null,
};

export const STRANDS = [
  { id: "s1", name: "Inheritance",      color: "oklch(0.82 0.08 75)",  status: "open", blurb: "Elen's reckoning with what her father left behind — and whether to honour it.", beats: [] },
  { id: "s2", name: "The Ledger",       color: "oklch(0.78 0.06 200)", status: "open", blurb: "The book itself: who has read it, who has added to it, what its last twelve pages mean.", beats: [
    { id: "b_s2_1", chapterId: "ch4", sceneId: "scn_ch4_1", label: "Inciting", note: "Elen finds the bearing that doesn't match any chart she owns." },
    { id: "b_s2_2", chapterId: "ch9", sceneId: "scn_ch9_3", label: "Midpoint", note: "The hand on the last twelve pages turns out to be someone she knows." },
  ]},
  { id: "s3", name: "Old Ports",        color: "oklch(0.74 0.07 270)", status: "open", blurb: "The harbours and coastlines the ledger names — places that have moved, vanished, or never existed.", beats: [] },
  { id: "s4", name: "Mother's silence", color: "oklch(0.78 0.07 25)",  status: "open", blurb: "What Petra refuses to say, and what Elen finally asks.", beats: [
    { id: "b_s4_1", chapterId: "ch8", sceneId: "scn_ch8_2", label: "Refusal", note: "Petra walks out of the room rather than answer the question." },
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
    { id: "ch1", num: 1, title: "What the door remembers",       words: 3120, status: "done",   strands: ["s1"],       scenes: 3 },
    { id: "ch2", num: 2, title: "An inventory in two hands",     words: 2840, status: "done",   strands: ["s1", "s2", "s4"], scenes: 4 },
    { id: "ch3", num: 3, title: "June, with a printer's apron",  words: 2210, status: "revise", strands: ["s1", "s2"], scenes: 2 },
    { id: "ch4", num: 4, title: "A bearing no one recognizes",   words: 3640, status: "done",   strands: ["s2", "s3"], scenes: 4 },
  ]},
  { id: "p2", title: "The Ledger", chapters: [
    { id: "ch5", num: 5, title: "Old Harbor 7",                  words: 3010, status: "done",   strands: ["s3"],       scenes: 3 },
    { id: "ch6", num: 6, title: "Renn keeps a list",             words: 2480, status: "draft",  strands: ["s2"],       scenes: 3 },
    { id: "ch7", num: 7, title: "Brackish Cove, at low tide",    words: 3995, status: "draft",  strands: ["s3", "s5"], scenes: 5 },
    { id: "ch8", num: 8, title: "Petra refuses the chair",       words: 1820, status: "revise", strands: ["s4"],       scenes: 2 },
    { id: "ch9", num: 9, title: "The hand that wrote the last twelve pages", words: 2640, status: "draft", strands: ["s2"], scenes: 3 },
  ]},
  { id: "p3", title: "What Returns", chapters: [
    { id: "ch10", num: 10, title: "St. Eira's, between tides",   words: 2380, status: "draft", strands: ["s5", "s3"], scenes: 3 },
    { id: "ch11", num: 11, title: "Tomas, who is older than he is", words: 1840, status: "todo", strands: ["s5"],     scenes: 2 },
    { id: "ch12", num: 12, title: "The unsent letter",           words: 1640, status: "todo", strands: ["s4", "s5"], scenes: 2 },
    { id: "ch13", num: 13, title: "A bearing, taken twice",      words: 950,  status: "todo", strands: ["s5", "s3", "s2", "s1"], scenes: 3 },
  ]},
];

// Per-chapter scene records: { [chapterId]: [{ title, body }, ...] }.
// Each entry becomes one scene at boot. Chapters not listed here open
// with zero scenes — the user adds them via the chapter overview pane
// or the sidebar's per-chapter "+" button. Bodies are HTML
// (TipTap-friendly).
export const SCENES = {
  ch1: [
    { title: "The key, after persuasion",
      characters: ["c1"], locations: ["l1"], strands: ["s1"],
      body: `<p>The key turned, after some persuasion. The door swung open onto a room her father had not let her into for fifteen years.</p>
<p>She stood in the doorway for the length of one breath, two. The kettle in the kitchen had begun to whistle, and she let it.</p>` },
    { title: "Cedar and pipe ash",
      characters: ["c1"], locations: ["l1"], strands: ["s1"],
      body: `<p>It smelled of cedar and pipe ash and a third thing she could not name. Later, she would decide it had been the smell of paper that had not been disturbed.</p>
<p>The window faced east. The window had not been opened in a long time.</p>` },
    { title: "The chair, the desk, the hands",
      characters: ["c1", "c2"], locations: ["l1"], strands: ["s1"],
      body: `<p>His chair was pushed in. His desk was clear. The only thing out of place was a small brass weight he had used for keeping a page open against the wind.</p>
<p>It was holding nothing down. She picked it up, and the weight of it was the weight of him.</p>` },
  ],
  ch2: [
    { title: "What the room held",
      characters: ["c1"], locations: ["l1"], objects: ["o3"], strands: ["s1"],
      body: `<p>Three drawers. Two cabinets. A leather case she had never seen before, brass-cornered, with the initials I.V. tooled small at the throat.</p>
<p>She made a list, because making a list was a thing her mother would have done, and because she was not yet ready to open the case.</p>` },
    { title: "Petra, at the kitchen window",
      characters: ["c1", "c5"], locations: ["l1"], strands: ["s1", "s4"],
      body: `<p>Petra had let herself in by the back door, the way she always had. She did not offer to help with the inventory. She set a loaf of bread on the table and said nothing about the case.</p>
<p>"You'll want to be careful which papers you keep," she said, eventually. "Some of them are for keeping. Some are for not."</p>` },
    { title: "What she would carry away",
      characters: ["c1"], locations: ["l1"], strands: ["s1"],
      body: `<p>By dusk Elen had two stacks. A short one and a long one. The short one she put back where she had found it. The long one she put into a satchel and carried into the front room and did not look at again until morning.</p>` },
    { title: "The case, after midnight",
      characters: ["c1"], locations: ["l1"], objects: ["o1"], strands: ["s1", "s2"],
      body: `<p>The brass corners of the case were warm in the lamplight, as if it had been somewhere warmer than the study. She turned it once on the desk so that the initials faced her, and then she turned it back.</p>
<p>She did not open it. Not yet. She thought: <em>once it is open, it is the second day, and I am not finished being the daughter of the first.</em></p>` },
  ],
  ch3: [
    { title: "The kettle",
      characters: ["c1", "c3"], locations: ["l3"], strands: ["s1", "s2"],
      body: `<p>June was already there, because June was always already there. She had brought the small electric kettle she carried everywhere and the printer's apron she did not need.</p>
<p>"You haven't slept," she said, without looking up.</p>
<p>"No."</p>
<p>"Tea. Then the case. In that order."</p>` },
    { title: "Two readings, one ink",
      characters: ["c1", "c3"], locations: ["l3"], objects: ["o1"], strands: ["s2"],
      body: `<p>June opened the leather case at the table. She turned the pages slowly, the way one turns the pages of a book one already knows.</p>
<p>"This is your father," she said, "to about page sixty. After that, it isn't. Whoever it is uses the same ink. They've gone to some trouble."</p>` },
  ],
  ch4: [
    { title: "A bearing on a page",
      characters: ["c1"], objects: ["o1", "o2"], strands: ["s2"],
      body: `<p>The bearing was written in a hand Elen did not recognize, in a column Idris had reserved for a footnote that had never been added.</p>
<p>It read: <em>54° 11' N, 4° 09' W</em>. Below it, a single word: <em>almost</em>.</p>` },
    { title: "A coast that should not be there",
      characters: ["c1"], locations: ["l2"], objects: ["o2"], strands: ["s2", "s3"],
      body: `<p>She unrolled the largest of her father's charts on the kitchen table. The bearing pointed to a stretch of water between two known headlands. There was no land there. There had never been land there.</p>
<p>And yet someone had written it down as if there were.</p>` },
    { title: "The night charts",
      characters: ["c1"], locations: ["l1"], objects: ["o2"], strands: ["s2", "s3"],
      body: `<p>She fetched the rest of the charts down from the high shelf, three at a time, and laid them across the floor of the front room until the floor was a coast.</p>
<p>The theodolite, set to a bearing no one recognised, agreed with one chart out of nine. The chart it agreed with was the oldest. It had been folded so often that the fold had become a coastline of its own.</p>` },
    { title: "A letter, half-written",
      characters: ["c1"], locations: ["l1"], strands: ["s2"],
      body: `<p>She wrote to June. She wrote: <em>I think he was right about something. I don't know yet which thing.</em></p>
<p>She did not send the letter. She set it on the mantelpiece, behind the brass weight, where her father had kept the letters he was thinking about.</p>` },
  ],
  ch5: [
    { title: "Old Harbor 7",
      characters: ["c1"], locations: ["l6"], strands: ["s3"],
      body: `<p>Old Harbor 7 had been numbered when there were still seven harbours. Now there were four. The number had outlived the use.</p>
<p>She walked the length of the seawall in a wind that smelled of iron and rope.</p>` },
    { title: "What the customs house wanted",
      characters: ["c1"], locations: ["l4", "l6"], strands: ["s3"],
      body: `<p>The customs house had not been a customs house for nine years. Its windows had been boarded, then unboarded, then boarded again, in a sequence that suggested no one in particular was in charge of remembering whether it was a building or a ruin.</p>
<p>She decided, for the time being, that it was both.</p>` },
    { title: "Mrs. Oren, on the path",
      characters: ["c1", "c7"], locations: ["l6"], strands: ["s3", "s5"],
      body: `<p>Mrs. Oren was on the path above the seawall, walking the dog she still called Margaret's, though Margaret had been gone four winters.</p>
<p>"You'll be going to look at the seventh," she said, as if Elen had told her so. "Mind the iron stair. Your father went up it sideways. He said it remembered him."</p>
<p>She spoke of him in the present tense and did not seem to notice.</p>` },
  ],
  ch6: [
    { title: "Renn's list",
      characters: ["c1", "c4"], locations: ["l4"], strands: ["s2"],
      body: `<p>Halvard Renn kept his lists in a small green book. He let Elen see only the page she had asked about, and then only after she had agreed not to copy it.</p>
<p>"Your father's name is on it," he said. "Twice. The second time was after his death."</p>` },
    { title: "What lists do not say",
      characters: ["c1", "c4"], locations: ["l4"], strands: ["s2"],
      body: `<p>"You catalogue what exists," she said. "What about what doesn't?"</p>
<p>"That isn't my office."</p>
<p>"Whose office is it?"</p>
<p>Renn closed the green book. "I don't know," he said. "I have wondered."</p>` },
    { title: "The offer",
      characters: ["c1", "c4"], locations: ["l4"], objects: ["o1"], strands: ["s2"],
      body: `<p>Renn waited until she had her coat on. He always made his offers at the door, where they cost him less.</p>
<p>"I'll give you what the case is worth," he said, "and a little more for the trouble. I am prepared to be generous about it."</p>
<p>"And then?"</p>
<p>"And then we agree that the ledger is a fiction. And the coast can go on being what it has always been."</p>
<p>She did not answer him. She closed the door behind her with a care that surprised them both.</p>` },
  ],
  ch7: [
    { title: "The customs house, condemned",
      characters: ["c1"], locations: ["l4", "l6"], objects: ["o1"], strands: ["s2", "s3"],
      body: `<p>The customs house at Old Harbor 7 had been condemned for nine years, which meant it was the most reliable building Elen knew. Condemned was a kind of inheritance. Nothing further could happen to it.</p>
<p>She climbed the iron stair on the seaward side, the one Renn had told her not to use, and let herself in through the door her father had once rehung.</p>
<p><em>Almost closed</em>, she thought. <em>That is the whole house. That is the whole ledger.</em></p>` },
    { title: "June's apron, June's kettle",
      characters: ["c1", "c3"], locations: ["l4"], strands: ["s2"],
      body: `<p>June was already there. She had brought a printer's apron she did not need and the small electric kettle she carried everywhere.</p>
<p>"I read the last twelve pages on the train," June said, without looking up. "Twice. And then once more on the platform."</p>
<p>"And?"</p>
<p>"It isn't your father. I'd know his hand the way I know my own."</p>` },
    { title: "What she is going to do",
      characters: ["c1", "c3"], locations: ["l2"], strands: ["s2", "s5"],
      body: `<p>"Tell me what you're going to do," June said.</p>
<p>"I'm going to go and see if it's there," she said.</p>
<p>"And if it isn't?"</p>
<p>"Then I'll have to decide whether to put it back."</p>` },
    { title: "The walk down, at low tide",
      characters: ["c1", "c3"], locations: ["l2"], objects: ["o2"], strands: ["s3", "s5"],
      body: `<p>They went down the path together. June carried the theodolite in its canvas sleeve because Elen had asked her to, and because June understood that some objects need to be carried by someone other than the one who has to read them.</p>
<p>The tide was further out than the almanac had promised. They walked across a beach that had been water in the morning.</p>` },
    { title: "Almost, at the waterline",
      characters: ["c1", "c3"], locations: ["l2"], objects: ["o1"], strands: ["s2", "s3", "s5"],
      body: `<p>Where the ledger had said <em>almost</em>, the waterline made a slow, unconvinced curve, as if the sea had been arguing with the same question for a long time and had not yet decided.</p>
<p>"It's here," June said quietly. "Some of it is here."</p>
<p>Elen did not answer. She had been the daughter of this answer all her life and she wanted to be it for a little longer before she became something else.</p>` },
  ],
  ch8: [
    { title: "The question Elen finally asks",
      characters: ["c1", "c5"], strands: ["s4"],
      body: `<p>It was the first warm evening of the season, and Petra had been quiet for longer than Petra was ever quiet.</p>
<p>"Was there a coast," Elen said. "Between the headlands. When you were a girl."</p>
<p>Petra set down her cup. Petra did not look at her.</p>` },
    { title: "Silence, leaving the room",
      characters: ["c1", "c5"], locations: ["l1"], strands: ["s4"],
      body: `<p>Petra stood, smoothed her skirt, and walked out through the kitchen and into the garden and did not come back until the bread was cold.</p>
<p>That, too, Elen decided, was an answer.</p>` },
  ],
  ch9: [
    { title: "Twelve pages, eleven differences",
      characters: ["c1", "c3"], locations: ["l3"], objects: ["o1"], strands: ["s2"],
      body: `<p>She and June spread the last twelve pages out across the long table at the print shop, in order, and weighted each corner with the brass weights Idris had used.</p>
<p>They counted differences. They counted eleven. The twelfth page, June said, was the one she could not yet make herself look at.</p>` },
    { title: "The shape of the letter g",
      characters: ["c1", "c3"], objects: ["o1"], strands: ["s2"],
      body: `<p>"It's the g," June said, finally. "Your father's g comes down in a straight line. This g loops."</p>
<p>"That's all?"</p>
<p>"It's enough. A person doesn't change the way they write a g."</p>` },
    { title: "Whose hand it is",
      characters: ["c1", "c3", "c5"], locations: ["l3"], objects: ["o1", "o3"], strands: ["s2", "s4"],
      body: `<p>Elen took the unsent letter from the satchel and laid it beside the twelfth page. The g looped the same loop. The hand was older, but it was the same hand.</p>
<p>"It's Petra," she said.</p>
<p>June set down the magnifier with the care she reserved for objects she had hoped to be wrong about. "Yes," she said. "I think it has been Petra for a long time."</p>` },
  ],
  ch10: [
    { title: "St. Eira's, between tides",
      characters: ["c1"], locations: ["l5", "l6"], strands: ["s3", "s5"],
      body: `<p>The chapel walls were what was left after the rest of the chapel had walked itself into the water. Two days a month, at low tide, you could stand inside it without getting wet.</p>
<p>Elen waited for the tide. She had learned by now that some things only existed if you went on time.</p>` },
    { title: "What the wall remembered",
      characters: ["c1"], locations: ["l5"], objects: ["o4"], strands: ["s5"],
      body: `<p>Names had been written along the inside of the south wall in something that was probably whitewash and probably not. Hers was there. Petra's was there. So was a name she did not know how to read, in handwriting that looped its g's.</p>` },
    { title: "Leaving, before the tide",
      characters: ["c1"], locations: ["l5"], strands: ["s5"],
      body: `<p>She left through the gap where the west wall had been, because the door no longer stood for anything. The tide was already turning. By the time she reached the path, the chapel was a chapel again only in the sense that something which has been a chapel cannot, afterwards, be nothing.</p>
<p>She did not look back. Looking back, she had begun to think, was its own kind of bringing-back, and she was not yet ready to be responsible for that one.</p>` },
  ],
  ch11: [
    { title: "The boy on the pier",
      characters: ["c1", "c6"], locations: ["l6"], objects: ["o5"], strands: ["s5"],
      body: `<p>The boy at the end of the pier was nine years old. He had been nine years old for some time.</p>
<p>"I was told to wait," he said, when Elen sat down beside him. He turned a green disc of sea-glass over and over in his hand. "I'm getting better at it."</p>` },
    { title: "What he had been waiting for",
      characters: ["c1", "c6"], locations: ["l6"], objects: ["o5"], strands: ["s5"],
      body: `<p>"Did anyone tell you what you were waiting for?" Elen asked.</p>
<p>"No," Tomas said. He held the sea-glass up to the light. "But I think I know now."</p>` },
  ],
  ch12: [
    { title: "The letter, opened",
      characters: ["c1"], locations: ["l1"], objects: ["o3"], strands: ["s4", "s5"],
      body: `<p>She had carried the letter from drawer to drawer for three years without opening it. The seal had loosened on its own. The paper inside was good paper. The handwriting was her mother's.</p>
<p><em>If you are reading this</em>, it began, <em>then you have decided to know.</em></p>` },
    { title: "What it asked of her",
      characters: ["c1", "c5"], locations: ["l1"], objects: ["o3"], strands: ["s4"],
      body: `<p>The letter asked only one thing of her, and it asked very gently, and it did not ask twice.</p>
<p>Petra came in from the garden with mud on her boots. "I knew it would be today," she said. "Sit down."</p>` },
  ],
  ch13: [
    { title: "A bearing, taken twice",
      characters: ["c1", "c3"], locations: ["l2"], objects: ["o1", "o2"], strands: ["s2", "s3", "s5"],
      body: `<p>They went out at low tide, June and Elen and the brass theodolite, and they took the bearing twice — once from the headland and once from the boat — and the two readings agreed.</p>
<p>The ledger had not been wrong. Or rather: the ledger had been right about something the charts had decided not to know.</p>` },
    { title: "What returns",
      characters: ["c1"], locations: ["l2"], objects: ["o1"], strands: ["s5"],
      body: `<p>She closed the ledger. She put it back into the leather case. She set the case on the kitchen table where her father had left it, and she did not lock it.</p>
<p>The tide was coming in. The coast — whatever it had been doing in her absence — would still be there in the morning.</p>` },
    { title: "Renn, at the gate",
      characters: ["c1", "c4"], locations: ["l1"], objects: ["o1"], strands: ["s1", "s2"],
      body: `<p>Renn came up the cliff road in his good coat. He stopped at the gate rather than the door, which Elen understood to be a kindness.</p>
<p>"I have read the entries you sent," he said. "I will not be cataloguing them. I also will not be burning them. I find I am unable to do either."</p>
<p>"That's an answer," she said.</p>
<p>"It is the only one I have." He inclined his head once, with care. "Your father would have called it almost. I think now that he would have been right."</p>
<p>He walked back down the road in the slow, exact gait of a man who has carried a list a long way and has decided, today, to set it down.</p>` },
  ],
};

// Per-entity event log. Keyed by entity id (character / location / object /
// group / "setting"). Each event is { id, when, title, note }, where `when`
// is a datetime-local-shaped string so the timeline view can sort it.
export const EVENTS = {
  // ── Setting — the broader world timeline ──
  setting: [
    { id: "ev_set_1", when: "1881-06-15T09:00", title: "First Ordnance Survey of the coast",
      note: "A team of three walks the line from the county town to Tern Head over two summers. The six-inch survey becomes the first authoritative map of this coast." },
    { id: "ev_set_2", when: "1923-04-02T12:00", title: "Brackish Cove last appears on an Admiralty chart",
      note: "Subsequent surveys mark the headlands but not the cove between them." },
    { id: "ev_set_3", when: "1968-09-21T08:30", title: "St. Eira's west wall collapses into the sea",
      note: "After a winter of storms. The chapel becomes a half-tide ruin." },
    { id: "ev_set_4", when: "1995-11-04T03:14", title: "The storm year",
      note: "Elen is born on the third night of the great storm. Halden House loses three slates and a window. Idris is at the lighthouse." },
    { id: "ev_set_5", when: "2003-08-12T17:45", title: "Idris stops writing in the ledger",
      note: "Page 60. He never explains why. Someone else continues from page 61, in a different hand." },
    { id: "ev_set_6", when: "2026-03-11T07:20", title: "Idris dies; Elen inherits the house, the theodolite, and the ledger",
      note: "Petra is the one who finds him. The kettle is still warm." },
  ],

  // ── Characters ──
  c1: [
    { id: "ev_c1_1", when: "1995-11-04T03:14", title: "Born",
      note: "Halden House, cliff road. Mother had wanted to deliver at the cottage hospital; the storm decided otherwise." },
    { id: "ev_c1_2", when: "2003-09-09T16:00", title: "Mother leaves",
      note: "Eight years old. No explanation given at the time. Petra is the one who makes the supper that night." },
    { id: "ev_c1_3", when: "2015-10-02T10:30", title: "Begins archival training",
      note: "Two years, never finishes. Returns north when Idris first falls ill." },
    { id: "ev_c1_4", when: "2026-03-11T11:00", title: "Inherits the ledger",
      note: "Petra hands it to her, brass-cornered case, initials I.V. tooled at the throat. Elen does not open it for nine days." },
  ],
  c2: [
    { id: "ev_c2_1", when: "1959-04-20T06:00", title: "Born", note: "Inland, in the county town. Moves to the coast in his twenties and stays." },
    { id: "ev_c2_2", when: "1981-07-01T08:00", title: "Re-walks the 1881 Survey lines",
      note: "On foot, with a borrowed theodolite. Writes the first entries of what becomes the ledger." },
    { id: "ev_c2_3", when: "2003-08-12T17:45", title: "Stops writing", note: "Page 60. He continues to consult the ledger but adds nothing more." },
    { id: "ev_c2_4", when: "2026-03-11T05:50", title: "Dies", note: "In his sleep. The study door is closed; the brass weight is on the desk, holding nothing down." },
  ],
  c3: [
    { id: "ev_c3_1", when: "2024-02-18T14:00", title: "Buys the print shop",
      note: "Lange & Co. Print, an inheritance from her father. June moves north a month later." },
    { id: "ev_c3_2", when: "2026-04-19T19:30", title: "First sees the ledger",
      note: "Elen brings it to the print shop. June identifies the change of hand in under ten minutes." },
  ],
  c5: [
    { id: "ev_c5_1", when: "1965-05-08T11:00", title: "Born",
      note: "Petra is the elder sister. The coast she remembers is not the same coast her sister will later claim never existed." },
    { id: "ev_c5_2", when: "2003-09-09T18:00", title: "Stays the night Elen's mother leaves",
      note: "Makes the supper. Does not answer the questions an eight-year-old asks. Begins, quietly, to add entries to the ledger." },
  ],

  // ── Locations ──
  l2: [
    { id: "ev_l2_1", when: "1881-07-22T11:00", title: "Surveyed but not named",
      note: "The 1881 team records the cove without giving it a name. Two later maps disagree on its position." },
    { id: "ev_l2_2", when: "1923-04-02T12:00", title: "Removed from Admiralty charts",
      note: "Modern surveys cannot find it. Local fishermen continue to use the name." },
  ],
  l1: [
    { id: "ev_l1_1", when: "1923-10-30T14:00", title: "Halden House built",
      note: "On the cliff road. Salt warps the doors every winter." },
  ],

  // ── Objects ──
  o1: [
    { id: "ev_o1_1", when: "1981-07-01T08:00", title: "First entry",
      note: "Idris's hand. Cloth-bound, 84 pages, a brass-cornered case." },
    { id: "ev_o1_2", when: "2003-08-12T17:45", title: "Idris stops; another hand continues",
      note: "Page 61 onward is written by someone using the same ink, the same care, and a different g." },
  ],
  o2: [
    { id: "ev_o2_1", when: "1981-06-15T07:00", title: "Borrowed for the first re-walk",
      note: "Brass, Royal Engineers pattern. Idris keeps it after the survey is done and no one asks for it back." },
    { id: "ev_o2_2", when: "2026-03-12T09:00", title: "Found set to a bearing no one recognises",
      note: "54° 11' N, 4° 09' W. The bearing is also in the ledger, in the second hand." },
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
    // Generic OpenAI-shaped local LLM (Ollama, LM Studio, llama.cpp, …).
    // chatModel is left blank because every server uses its own ids
    // (e.g. "llama3.1:8b" on Ollama, "auto-detected/path/to.gguf" on
    // LM Studio). Click "Fetch models" in Settings to pick from the
    // running server's list.
    id: "openai-compat-local", name: "OpenAI-compatible (local)", kind: "llm",
    runner: "ollama",
    baseUrl: "http://localhost:11434/v1",
    chatModel: "",
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
    // Claude via Anthropic's OpenAI-compatible endpoint. LLM-only —
    // no TTS. Default model is the cheapest Claude (haiku); users can
    // swap to claude-sonnet-4-6 or claude-opus-4-7 for higher quality.
    id: "claude", name: "Claude (Anthropic)", kind: "llm",
    baseUrl: "https://api.anthropic.com/v1",
    chatModel: "claude-haiku-4-5",
    builtIn: true,
  },
  {
    // Google's OpenAI-compatible Gemini endpoint. The URL prefix
    // `/v1beta/openai` is Google-specific — our url() helper appends
    // `/chat/completions`, `/models`, etc. directly after it, so the
    // resulting paths match Google's spec.
    id: "gemini", name: "Gemini (Google)", kind: "llm",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    chatModel: "gemini-2.5-flash",
    builtIn: true,
  },
  {
    // DeepSeek's native API speaks OpenAI shape. `deepseek-chat` is V3;
    // `deepseek-reasoner` is R1 (reasoning model, slower but stronger).
    id: "deepseek", name: "DeepSeek", kind: "llm",
    baseUrl: "https://api.deepseek.com/v1",
    chatModel: "deepseek-chat",
    builtIn: true,
  },
  {
    // OpenRouter — single API key, OpenAI-shaped, routes to virtually any
    // model on the market (Claude, Gemini, DeepSeek, Mistral, Llama, …).
    // Useful as a "one key for everything" alternative to seeding each
    // provider individually. Model ids take the form `vendor/model-name`,
    // e.g. `anthropic/claude-sonnet-4-6` or `google/gemini-2.5-pro` —
    // hit "Fetch models" to see the full live catalogue.
    id: "openrouter", name: "OpenRouter (aggregator)", kind: "llm",
    baseUrl: "https://openrouter.ai/api/v1",
    chatModel: "",
    builtIn: true,
  },
  {
    // Voices are discovered at runtime via GET /v1/audio/voices. The
    // previous hard-coded list went stale as Kokoro-FastAPI renamed
    // entries (e.g. bf_isabella → bf_v0isabella) and added new ones.
    id: "kokoro", name: "Kokoro (local TTS)", kind: "tts",
    baseUrl: "http://localhost:8880/v1",
    ttsModel: "kokoro",
    builtIn: true,
  },
  {
    // devnen/Chatterbox-TTS-Server. Voices come from the server's ./voices/
    // folder — discovered at runtime via GET /v1/audio/voices, so we don't
    // hard-code a starter list. Drop a WAV or MP3 directly into ./voices/
    // and refresh the cast picker. Note: devnen's web UI uploads go to
    // ./reference_audio/ instead (used by its custom /tts route), not to
    // ./voices/, so JustWrite won't see them unless you move them across.
    id: "chatterbox", name: "Chatterbox (local TTS + cloning)", kind: "tts",
    baseUrl: "http://localhost:8004/v1",
    ttsModel: "chatterbox",
    builtIn: true,
  },
  {
    // Speechmatics TTS (preview). Proprietary endpoint shape — voice goes
    // in the URL path, body is { text }. Detected by hostname in
    // openai-compat.js → isSpeechmatics(). Four English voices today
    // (2 UK + 2 US, male/female). No model selector, no /voices endpoint,
    // so we hard-code the list. Output is WAV 16 kHz mono by default
    // (wav_16000) — what the render pipeline already expects.
    // Free during preview; paid tier starts Oct 2025.
    id: "speechmatics", name: "Speechmatics (cloud TTS)", kind: "tts",
    baseUrl: "https://preview.tts.speechmatics.com",
    ttsModel: "",
    ttsVoices: [
      { id: "sarah", name: "Sarah", gender: "female", age: "adult", accent: "British",  tone: "warm" },
      { id: "theo",  name: "Theo",  gender: "male",   age: "adult", accent: "British",  tone: "measured" },
      { id: "megan", name: "Megan", gender: "female", age: "adult", accent: "American", tone: "bright" },
      { id: "jack",  name: "Jack",  gender: "male",   age: "adult", accent: "American", tone: "grounded" },
    ],
    builtIn: true,
  },
];

// Empty by default — a fresh project starts with no cast assignments
// so the user can see exactly what Smart Assign (or manual picks) does.
export const DEFAULT_CAST = {
  narrator: null,
  characters: {},
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
