// @vitest-environment jsdom
// Move 1 (RAG build): the story-bible card builder, the chunker's card
// append, the ONE citationLabel source, and the voice-parameterized
// buildCharacterProfile (second-person output must stay byte-identical —
// the interview persona depends on it). jsdom: cards.js/chunker.js strip
// HTML via document.createElement.
import { describe, expect, it } from "vitest";

import { buildEntityCards } from "@renderer/services/rag/cards.js";
import { chunkProject } from "@renderer/services/rag/chunker.js";
// profile.js is the LEAF home of buildCharacterProfile (characterChat.js
// re-exports it but drags the store/kit world in — leaf import keeps this a
// pure unit test).
import { buildCharacterProfile } from "@renderer/services/rag/profile.js";
import { citationLabel, formatExcerpts } from "@renderer/services/rag/excerpts.js";

// ── fixture: a minimal live-store stand-in with every field cards.js reads ──
function fixtureProject() {
  const scenes = {
    ch1: [
      {
        id: "s1", title: "The customs house", body: "<p>Aria waited by the ledger desk.</p>",
        characters: ["c_aria", "c_bren"], locations: ["l_customs"], objects: ["o_ledger"],
        pov: "limited-third",
      },
      { id: "s2", title: "", body: "<p>Bren alone.</p>", characters: ["c_bren"], locations: [], objects: [] },
    ],
    ch2: [
      { id: "s3", title: "Excluded", body: "<p>Secret ending.</p>", excludeFromAi: true },
    ],
  };
  return {
    allChapters: [
      { id: "ch1", title: "Arrival", num: 1 },
      { id: "ch2", title: "Endings", num: 2 },
    ],
    scenesFor: (chId) => scenes[chId] || [],
    characters: [
      { id: "c_aria", name: "Aria", main: true, role: "protagonist", aliases: ["The Mapmaker"], oneLiner: "Maps what others fear.", tags: ["pov"] },
      { id: "c_bren", name: "Bren", main: false, role: "", aliases: [], tags: [] },
    ],
    characterExtras: {
      c_aria: { motivation: { want: "the northern chart" }, arc: { start: "a copyist" } },
    },
    locations: [{ id: "l_customs", name: "Customs House", kind: "building", note: "Where cargo is declared.", tags: [] }],
    objects: [{ id: "o_ledger", name: "The Ledger", kind: "book", note: "", tags: [] }],
    groups: [
      { id: "g1", name: "The Guild", blurb: "Chartmakers' guild.", members: [{ kind: "character", id: "c_aria" }, { kind: "location", id: "l_customs" }] },
    ],
    notes: [
      { id: "n1", title: "Check tides", body: "<p>Tide tables differ in Ch 3.</p>", tag: "note", anchor: { chapterId: "ch1" } },
    ],
    strands: [
      { id: "st1", name: "The Map Plot", status: "open", blurb: "Who owns the chart.", body: "", beats: [{ id: "b1", chapterId: "ch1", sceneId: "s1", label: "Chart revealed", note: "Aria sees it" }] },
    ],
    worldbuilding: [
      { id: "wb1", title: "Tide Law", category: "history", tags: [], summary: "The maritime code.", body: "<p>Short article.</p>" },
      { id: "wb2", title: "The Archipelago", category: "geography", tags: [], summary: "", body: `<p>${"Islands and reefs. ".repeat(60)}</p><p>${"Currents and straits. ".repeat(60)}</p>` },
    ],
    worldbuildingCategories: [
      { id: "geography", label: "Geography" }, { id: "history", label: "History" },
    ],
    architecture: {
      premise: { id: "premise", title: "Premise", blurb: "One sentence.", body: "<p>A mapmaker charts a forbidden coast.</p>" },
      fabula: { id: "fabula", title: "Fabula", blurb: "", body: "" },
      setting: { id: "setting", title: "Setting", blurb: "", body: "" },
    },
    events: {
      c_aria: [{ id: "ev1", when: "Year 3", title: "Exiled", note: "after the tribunal" }],
    },
  };
}

function cardById(cards, id) {
  return cards.find((c) => c.id === id);
}

describe("buildEntityCards", () => {
  const cards = buildEntityCards(fixtureProject());

  it("builds a character card: third-person profile, groups, timeline, temporal appearances", () => {
    const aria = cardById(cards, "card:character:c_aria");
    expect(aria.kind).toBe("character");
    expect(aria.title).toBe("Aria");
    expect(aria.text).toContain("Aria (main character)");
    expect(aria.text).toContain("Also known as: The Mapmaker");
    expect(aria.text).toContain("What they want: the northern chart");   // third person
    expect(aria.text).toContain("Where they begin the story: a copyist");
    expect(aria.text).not.toContain("What you want");                     // never second person
    expect(aria.text).toContain("Member of: The Guild");
    expect(aria.text).toContain("Year 3 — Exiled: after the tribunal");
    // The temporal line: place + company + POV mode, self excluded.
    expect(aria.text).toContain('Ch 1 "The customs house" — at Customs House, with Bren, POV: Limited third person');
  });

  // RAG (a), 2026-07-18: relationship arcs land on BOTH characters' cards.
  it("puts relationship-arc lines on both sides' cards, skipping arcs whose other side is gone", () => {
    const p = fixtureProject();
    p.relationshipArcs = {
      "c_aria::c_bren": { summary: "Uneasy allies bound by the chart.", trajectory: "warming", chapters: [] },
      "c_aria::c_gone": { summary: "Stale arc.", trajectory: "static", chapters: [] }, // deleted char
    };
    const cards2 = buildEntityCards(p);
    const aria = cardById(cards2, "card:character:c_aria");
    expect(aria.text).toContain("Relationships:");
    expect(aria.text).toContain("- With Bren (warming): Uneasy allies bound by the chart.");
    expect(aria.text).not.toContain("Stale arc");
    // The same edge is retrievable from Bren's side too.
    const bren = cardById(cards2, "card:character:c_bren");
    expect(bren.text).toContain("- With Aria (warming): Uneasy allies bound by the chart.");
  });

  it("builds a compact main-cast roster — one line per main, non-mains excluded", () => {
    const cast = cardById(cards, "card:cast:main");
    expect(cast.kind).toBe("cast");
    expect(cast.title).toBe("Main cast");
    expect(cast.text).toContain("- Aria (protagonist) — Maps what others fear.");
    expect(cast.text).not.toContain("Bren"); // c_bren is main:false → not in the roster
  });

  // RAG (b), 2026-07-18: the kept reverse outline becomes index cards.
  it("emits no outline card when no reverse outline is kept", () => {
    expect(cards.some((c) => c.kind === "outline")).toBe(false); // fixture has none
  });

  it("builds outline cards: summary + plot points head, chapter beats labeled, split when long", () => {
    const p = fixtureProject();
    p.reverseOutline = {
      structureName: "3-act",
      summary: "A mapmaker charts a forbidden coast and pays for it.",
      actBreaks: [{ afterChapterNum: 4, name: "Act I ends" }],
      plotPoints: [{ id: "pp_0", name: "The chart is stolen", chapterNum: 3, description: "Aria loses the original." }],
      chapterBeats: Array.from({ length: 40 }, (_, i) => ({ chapterNum: i + 1, beat: `Beat of chapter ${i + 1}: ${"movement ".repeat(8)}` })),
    };
    const cards2 = buildEntityCards(p);
    const outline = cards2.filter((c) => c.kind === "outline");
    expect(outline.length).toBeGreaterThan(1); // 40 beats → split
    expect(outline[0].id).toBe("card:outline:book:p1");
    expect(outline[0].text).toContain("A mapmaker charts a forbidden coast");
    expect(outline[0].text).toContain("Structure: 3-act");
    expect(outline[0].text).toContain("- The chart is stolen (Ch 3): Aria loses the original.");
    const all = outline.map((c) => c.text).join("\n");
    expect(all).toContain("- Ch 40: Beat of chapter 40");
  });

  // 2026-07-18: a runt final part folds into the previous one — measured on
  // the real book as a 147-char tail chunk that embedded to a diluted vector.
  it("merges a tiny tail part into the previous part instead of emitting a runt chunk", () => {
    const p = fixtureProject();
    // Two full paragraphs + one tiny trailing paragraph → without the merge,
    // the tail would be its own ~60-char part.
    p.worldbuilding.push({
      id: "wb_tail", title: "Tides", category: "history", tags: [], summary: "",
      body: `<p>${"Alpha currents. ".repeat(90)}</p><p>${"Beta straits. ".repeat(90)}</p><p>The runt tail line.</p>`,
    });
    const cards2 = buildEntityCards(p);
    const parts = cards2.filter((c) => c.entityId === "wb_tail");
    expect(parts.length).toBeGreaterThan(1);
    const last = parts[parts.length - 1];
    expect(last.text).toContain("The runt tail line.");
    expect(last.text.length).toBeGreaterThanOrEqual(300); // riding the previous part, not alone
  });

  it("splits a large character card into parts; identity leads part 1", () => {
    const p = fixtureProject();
    p.characters.push({ id: "c_big", name: "Orin", main: true, role: "antagonist", oneLiner: "y".repeat(40) });
    p.characterExtras.c_big = { backstory: "B".repeat(800), motivation: { want: "W".repeat(400), need: "N".repeat(400) } };
    const cards2 = buildEntityCards(p);
    expect(cardById(cards2, "card:character:c_big")).toBeUndefined();     // split → no unsplit id
    const p1 = cardById(cards2, "card:character:c_big:p1");
    const p2 = cardById(cards2, "card:character:c_big:p2");
    expect(p1.text).toContain("Orin (main character)");                   // identity leads part 1
    expect(p1.title).toBe("Orin (part 1 of 2)");
    expect(p1.entityId).toBe("c_big");
    expect(p2.entityId).toBe("c_big");
    expect(p2.text).toContain("part 2");
  });

  it("builds location/object cards with appears-in company lines", () => {
    const customs = cardById(cards, "card:location:l_customs");
    expect(customs.text).toContain("Customs House (building)");
    expect(customs.text).toContain("Where cargo is declared.");
    expect(customs.text).toContain("Member of: The Guild");
    expect(customs.text).toContain('Ch 1 "The customs house" — with Aria, Bren');
    const ledger = cardById(cards, "card:object:o_ledger");
    expect(ledger.text).toContain("The Ledger (book)");
    expect(ledger.text).toContain("Appears in:");
  });

  it("builds group cards with kind-labelled members", () => {
    const guild = cardById(cards, "card:group:g1");
    expect(guild.text).toContain("Chartmakers' guild.");
    expect(guild.text).toContain("- Aria (character)");
    expect(guild.text).toContain("- Customs House (location)");
  });

  it("keeps short worldbuilding whole and splits long articles into parts", () => {
    const short = cardById(cards, "card:worldbuilding:wb1");
    expect(short.text).toContain("Tide Law (History)");
    expect(short.text).toContain("The maritime code.");
    expect(short.text).toContain("Short article.");
    expect(cardById(cards, "card:worldbuilding:wb2")).toBeUndefined(); // long → parts only
    const p1 = cardById(cards, "card:worldbuilding:wb2:p1");
    const p2 = cardById(cards, "card:worldbuilding:wb2:p2");
    expect(p1.text).toContain("The Archipelago (Geography)");
    expect(p1.title).toBe("The Archipelago (part 1 of 2)");
    expect(p2.text).toContain("part 2");
    expect(p2.entityId).toBe("wb2");
  });

  it("builds note cards with the anchor label and strand cards with beats", () => {
    const note = cardById(cards, "card:note:n1");
    expect(note.text).toContain("Check tides");
    expect(note.text).toContain("Pinned to Ch 1");
    expect(note.text).toContain("Tide tables differ");
    const strand = cardById(cards, "card:strand:st1");
    expect(strand.text).toContain("The Map Plot (open)");
    expect(strand.text).toContain("- Chart revealed (Ch 1): Aria sees it");
  });

  it("builds architecture cards only for docs with a body", () => {
    const premise = cardById(cards, "card:architecture:premise");
    expect(premise.text).toContain("A mapmaker charts a forbidden coast.");
    expect(cardById(cards, "card:architecture:fabula")).toBeUndefined();
    expect(cardById(cards, "card:architecture:setting")).toBeUndefined();
  });

  it("caps temporal appearance lines and appends an honest count", () => {
    const p = fixtureProject();
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `sx${i}`, title: "", body: "<p>x</p>", characters: ["c_bren"], locations: [], objects: [],
    }));
    p.scenesFor = (chId) => (chId === "ch1" ? many : []);
    const bren = cardById(buildEntityCards(p), "card:character:c_bren");
    const lines = bren.text.split("\n").filter((l) => l.startsWith("- Ch "));
    expect(lines.length).toBe(12);
    expect(bren.text).toContain("…and 8 more scenes (20 in total)");
  });
});

describe("chunkProject with cards", () => {
  it("emits scene chunks (excludeFromAi honored) then card chunks", () => {
    const chunks = chunkProject(fixtureProject());
    const sceneIds = chunks.filter((c) => !c.kind).map((c) => c.id);
    expect(sceneIds).toEqual(["ch1:s1", "ch1:s2"]); // s3 excluded
    const cardIds = chunks.filter((c) => c.kind).map((c) => c.id);
    expect(cardIds).toContain("card:character:c_aria");
    expect(cardIds).toContain("card:worldbuilding:wb2:p2");
    // Cards come after scenes and carry the sha slot the indexer fills.
    expect(chunks.every((c) => c.sha === "")).toBe(true);
  });

  it("scene chunks carry the links line incl. POV (Move 3); cards carry none", () => {
    const chunks = chunkProject(fixtureProject());
    const s1 = chunks.find((c) => c.id === "ch1:s1");
    expect(s1.links).toBe("Characters: Aria, Bren · Location: Customs House · Objects: The Ledger · POV: Limited third person");
    const s2 = chunks.find((c) => c.id === "ch1:s2");
    expect(s2.links).toBe("Characters: Bren"); // no pov set → no POV segment
    const card = chunks.find((c) => c.kind === "character");
    expect(card.links).toBeUndefined();
  });

  // RAG (c), 2026-07-18: long scenes split; short scenes keep their unsplit
  // id (and sha) so an existing index re-embeds only what actually split.
  it("splits a long scene into sentence-boundary parts under the excerpt cap; short scenes keep their id", async () => {
    const { splitSceneText } = await import("@renderer/services/rag/chunker.js");
    const p = fixtureProject();
    const scenes = p.scenesFor("ch1");
    const longProse = Array.from({ length: 60 }, (_, i) => `Sentence number ${i + 1} carries the scene forward with steady weight.`).join(" ");
    scenes.push({ id: "s_long", title: "The long crossing", body: `<p>${longProse}</p>`, characters: [], locations: [], objects: [] });
    p.scenesFor = (chId) => (chId === "ch1" ? scenes : []);

    const chunks = chunkProject(p);
    expect(chunks.find((c) => c.id === "ch1:s1")).toBeTruthy();          // short scene unsplit
    expect(chunks.find((c) => c.id === "ch1:s_long")).toBeUndefined();   // long scene → no unsplit id
    const parts = chunks.filter((c) => c.sceneId === "s_long");
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].id).toBe("ch1:s_long:p1");
    expect(parts.every((c) => c.text.length <= 1400)).toBe(true);        // every part fits the excerpt whole
    expect(parts.every((c) => c.scenePartCount === parts.length)).toBe(true);
    // The full prose survives the split (no dropped sentences).
    expect(parts.map((c) => c.text).join(" ")).toContain("Sentence number 60");
    // A runt tail merges instead of standing alone.
    expect(splitSceneText(`${"A solid sentence with enough length to matter here. ".repeat(40)}Tail.`).at(-1).length).toBeGreaterThan(240);
  });

  it("the scene sha covers text + links: a link-only change re-shas (Move 3/F6)", async () => {
    const { chunkProjectAsync } = await import("@renderer/services/rag/chunker.js");
    const before = await chunkProjectAsync(fixtureProject());
    const p2 = fixtureProject();
    const scenes = p2.scenesFor("ch1");
    scenes[1].characters = []; // unlink Bren from s2; prose unchanged
    p2.scenesFor = (chId) => (chId === "ch1" ? scenes : []);
    const after = await chunkProjectAsync(p2);
    const shaOf = (list, id) => list.find((c) => c.id === id).sha;
    expect(shaOf(after, "ch1:s2")).not.toBe(shaOf(before, "ch1:s2")); // link edit re-uploads
    expect(shaOf(after, "ch1:s1")).toBe(shaOf(before, "ch1:s1"));     // untouched scene stable
  });
});

describe("citationLabel scene parts (c)", () => {
  it("labels a split scene part; unsplit scenes read as before", () => {
    const part = { chapterNum: 4, chapterTitle: "The Crossing", sceneIdx: 1, sceneTitle: "", scenePart: 2, scenePartCount: 3 };
    expect(citationLabel(part)).toBe('Ch. 4 "The Crossing", scene 2 (part 2)');
    const whole = { chapterNum: 4, chapterTitle: "The Crossing", sceneIdx: 1, sceneTitle: "" };
    expect(citationLabel(whole)).toBe('Ch. 4 "The Crossing", scene 2');
  });
});

describe("citationLabel + formatExcerpts (the ONE label source)", () => {
  const sceneChunk = { chapterNum: 1, chapterTitle: "Arrival", sceneTitle: "The customs house", sceneIdx: 0, text: "x".repeat(1300) };
  const cardChunk = { kind: "character", entityId: "c_aria", title: "Aria", text: "y".repeat(2100) };

  it("keeps the scene label byte-shape and labels cards as Story Bible entries", () => {
    expect(citationLabel(sceneChunk)).toBe('Ch. 1 "Arrival", scene "The customs house"');
    expect(citationLabel({ ...sceneChunk, sceneTitle: "" })).toBe('Ch. 1 "Arrival", scene 1');
    expect(citationLabel(cardChunk)).toBe("Story Bible — Character: Aria");
  });

  it("truncates scenes at 1200 and cards at 2000", () => {
    const block = formatExcerpts([{ chunk: sceneChunk }, { chunk: cardChunk }]);
    const [sceneBlock, cardBlock] = block.split("\n\n");
    expect(sceneBlock).toContain(`${"x".repeat(1200)}…`);
    expect(cardBlock).toContain(`${"y".repeat(2000)}…`);
    expect(block).toContain('[1] Ch. 1 "Arrival"');
    expect(block).toContain("[2] Story Bible — Character: Aria");
  });

  it("renders a scene's links line under its header (Move 3)", () => {
    const linked = { ...sceneChunk, text: "Short prose.", links: "Characters: Aria · Location: Customs House" };
    const block = formatExcerpts([{ chunk: linked }]);
    expect(block).toContain(':\n(Characters: Aria · Location: Customs House)\nShort prose.');
    // No links / a card → no parenthetical line.
    expect(formatExcerpts([{ chunk: { ...sceneChunk, text: "p", links: "" } }])).not.toContain("(");
  });
});

describe("buildCharacterProfile voice parameter", () => {
  const character = {
    name: "Aria", role: "protagonist", gender: "f", pronouns: "she/her",
    lifeStatus: "alive", aliases: ["The Mapmaker"], age: 29, oneLiner: "Maps what others fear.",
  };
  const extras = {
    voice: { accent: "coastal", vocabulary: "nautical", speechTic: "hm", sampleLine: "Chart it or lose it." },
    motivation: { want: "the chart", need: "belonging", lie: "maps are safe", truth: "people are the territory" },
    arc: { start: "a copyist", midpoint: "a smuggler", end: "a cartographer royal" },
    backstory: "Raised in the customs house.",
    quotes: ["North is a habit."],
  };

  it("second person (voice omitted) is byte-identical to the pre-Move-1 output", () => {
    const expected = [
      "Role: protagonist",
      "Gender: f",
      "Pronouns: she/her",
      "Life status: alive",
      "Also known as: The Mapmaker",
      "Age: 29",
      "Self-image (one line): Maps what others fear.",
      "Voice: accent: coastal; vocabulary: nautical; speech tic: hm",
      'Sample of your speech: "Chart it or lose it."',
      "What you want: the chart",
      "What you actually need: belonging",
      "The lie you believe: maps are safe",
      "The truth you eventually meet: people are the territory",
      "Where you begin the story: a copyist",
      "Where you stand at the midpoint: a smuggler",
      "Where you end up: a cartographer royal",
      "Backstory (private, never told the reader directly): Raised in the customs house.",
      "Lines you've actually said in the novel:",
      '  - "North is a habit."',
    ].join("\n");
    expect(buildCharacterProfile(character, extras)).toBe(`\n${expected}`);
    expect(buildCharacterProfile(character, extras, {})).toBe(`\n${expected}`);
  });

  it("third person swaps every second-person label", () => {
    const third = buildCharacterProfile(character, extras, { voice: "third" });
    expect(third).toContain("In one line: Maps what others fear.");
    expect(third).toContain("What they want: the chart");
    expect(third).toContain("Where they end up: a cartographer royal");
    expect(third).toContain("Backstory: Raised in the customs house.");
    expect(third).toContain("Lines they've said in the novel:");
    expect(third).not.toMatch(/\byou\b/i);
  });

  // Bug fix (2026-07-18): the character page saves the speech tic under `tic`
  // and the sample under `sample`, but the builder read `speechTic`/`sampleLine`
  // — so neither ever reached the AI. Guard the page's real keys.
  it("reads the page's voice keys (tic/sample), not just the legacy speechTic/sampleLine", () => {
    const c = { name: "Bo", oneLiner: "x" };
    const out = buildCharacterProfile(c, { voice: { tic: "you know", sample: "We sail at dawn." } });
    expect(out).toContain("speech tic: you know");
    expect(out).toContain('Sample of your speech: "We sail at dawn."');
  });

  // v3 fields (2026-07-18) reach the profile — every filled sheet field flows
  // to chat / audit / RAG card, grouped with its kin.
  it("appends filled v3 fields (identity, core engine, function, continuity, depth)", () => {
    const c = { name: "Bo", oneLiner: "x" };
    const rich = {
      identity: { classOrigin: "gutter to guild" },
      motivation: { fear: "being seen", contradiction: "kind but cruel", stakes: "the city burns" },
      function: { buttons: "mention his brother", cornered: "he runs" },
      continuity: { physicalConstants: "burn scar, left hand" },
      depth: { regrets: "the letter he never sent" },
    };
    const out = buildCharacterProfile(c, rich, { voice: "third" });
    expect(out).toContain("Class origin → now: gutter to guild");
    expect(out).toContain("Core fear: being seen");
    expect(out).toContain("Central contradiction: kind but cruel");
    expect(out).toContain("Stakes: the city burns");
    expect(out).toContain("Buttons: mention his brother");
    expect(out).toContain("Cornered behavior: he runs");
    expect(out).toContain("Physical constants: burn scar, left hand");
    expect(out).toContain("Regrets: the letter he never sent");
    // core engine ahead of the depth tail (part-1 pinning of a split card).
    expect(out.indexOf("Core fear")).toBeLessThan(out.indexOf("Regrets"));
  });

  // No v3 data → output unchanged (its RAG-card sha doesn't move → no re-embed).
  it("adds nothing when no v3 fields are filled", () => {
    const c = { name: "Bo", role: "sailor", oneLiner: "x" };
    const base = { motivation: { want: "home" } };
    expect(buildCharacterProfile(c, base, { voice: "third" })).toBe(
      '\nRole: sailor\nIn one line: x\nWhat they want: home',
    );
  });
});
