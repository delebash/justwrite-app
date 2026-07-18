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

  it("builds a compact main-cast roster — one line per main, non-mains excluded", () => {
    const cast = cardById(cards, "card:cast:main");
    expect(cast.kind).toBe("cast");
    expect(cast.title).toBe("Main cast");
    expect(cast.text).toContain("- Aria (protagonist) — Maps what others fear.");
    expect(cast.text).not.toContain("Bren"); // c_bren is main:false → not in the roster
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
});
