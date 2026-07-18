// Move 2 (RAG build): the shared deterministic entity matcher + ask-time
// pinning. Pure-JS leaf modules — no DOM, no kit, no stores.
import { describe, expect, it } from "vitest";

import {
  collectEntities,
  combinePinsAndHits,
  matchEntities,
  pickPinnedCards,
} from "@renderer/services/rag/entityMatcher.js";
import { normalizeName, textMentionsTerm } from "@renderer/services/text.js";

const ENTITIES = [
  { kind: "character", entityId: "c_aria", name: "Aria", aliases: ["The Mapmaker"] },
  { kind: "character", entityId: "c_rose", name: "Rose", aliases: [] },
  { kind: "character", entityId: "c_kim", name: "Kim", aliases: [] },
  { kind: "location", entityId: "l_customs", name: "Customs House", aliases: [] },
  { kind: "group", entityId: "g_guild", name: "The Guild", aliases: [] },
];

describe("shared text primitives", () => {
  it("normalizeName is the ONE fuzzy normalizer", () => {
    expect(normalizeName("  The Old, Lighthouse!  ")).toBe("the old lighthouse");
  });
  it("textMentionsTerm word-bounds single tokens (key ≠ monkey)", () => {
    expect(textMentionsTerm("a monkey climbed", "key")).toBe(false);
    expect(textMentionsTerm("the brass key fell", "key")).toBe(true);
    expect(textMentionsTerm("Customs House stood tall", "customs house")).toBe(true);
  });
});

describe("matchEntities", () => {
  it("matches names at word boundaries, never substrings", () => {
    const hits = matchEntities("Where does Aria keep the chart?", ENTITIES);
    expect(hits).toEqual([
      { kind: "character", entityId: "c_aria", name: "Aria", matched: "Aria", exact: true },
    ]);
    // "Ariadne" must NOT hit Aria; "kimono" must NOT hit Kim.
    expect(matchEntities("Ariadne wore a kimono", ENTITIES)).toEqual([]);
  });

  it("matches aliases with exact:false", () => {
    const hits = matchEntities("What does the Mapmaker want?", ENTITIES);
    expect(hits).toEqual([
      { kind: "character", entityId: "c_aria", name: "Aria", matched: "The Mapmaker", exact: false },
    ]);
  });

  it("common-word guard (F5): capitalized text needs the capitalized name; all-lowercase text matches", () => {
    // Capitals present + lowercase occurrence → "rose" is prose, not the name.
    expect(matchEntities("The rose garden bloomed early.", ENTITIES)).toEqual([]);
    // The capitalized name occurrence pins.
    expect(matchEntities("Then Rose spoke.", ENTITIES).map((h) => h.entityId)).toEqual(["c_rose"]);
    // All-lowercase (lazy typing) → capitalization carries no signal.
    expect(matchEntities("who is rose?", ENTITIES).map((h) => h.entityId)).toEqual(["c_rose"]);
  });

  it("multi-word names match case-insensitively", () => {
    const hits = matchEntities("who runs the customs house?", ENTITIES);
    expect(hits.map((h) => h.entityId)).toContain("l_customs");
  });

  it("skips names shorter than 3 chars and empty text", () => {
    expect(matchEntities("Al went home", [{ kind: "character", entityId: "x", name: "Al", aliases: [] }])).toEqual([]);
    expect(matchEntities("", ENTITIES)).toEqual([]);
  });
});

describe("collectEntities", () => {
  it("collects every bible kind, aliases from characters, titles from worldbuilding", () => {
    const project = {
      characters: [{ id: "c1", name: "Aria", aliases: ["The Mapmaker"] }],
      locations: [{ id: "l1", name: "Customs House" }],
      objects: [{ id: "o1", name: "The Ledger" }],
      groups: [{ id: "g1", name: "The Guild" }],
      worldbuilding: [{ id: "w1", title: "Tide Law" }],
      strands: [{ id: "s1", name: "The Map Plot" }],
    };
    const list = collectEntities(project);
    expect(list.map((e) => `${e.kind}:${e.name}`)).toEqual([
      "character:Aria", "location:Customs House", "object:The Ledger",
      "group:The Guild", "worldbuilding:Tide Law", "strand:The Map Plot",
    ]);
    expect(list[0].aliases).toEqual(["The Mapmaker"]);
  });
});

describe("pickPinnedCards", () => {
  const project = {
    characters: [
      { id: "c_aria", name: "Aria", aliases: ["The Mapmaker"] },
      { id: "c_bren", name: "Bren", aliases: [] },
    ],
    locations: [{ id: "l_customs", name: "Customs House" }],
    objects: [], groups: [], worldbuilding: [], strands: [],
  };
  const cards = [
    { id: "card:character:c_aria", kind: "character", entityId: "c_aria", title: "Aria", text: "Aria card." },
    { id: "card:character:c_bren", kind: "character", entityId: "c_bren", title: "Bren", text: "Bren card." },
    { id: "card:location:l_customs", kind: "location", entityId: "l_customs", title: "Customs House", text: "Customs card." },
  ];

  it("pins the named entity's card; exact-name hits outrank alias hits", () => {
    const pins = pickPinnedCards({
      question: "Does the Mapmaker trust Bren?", project, cards,
    });
    // Bren = exact name → first; Aria matched via alias → second.
    expect(pins.map((c) => c.id)).toEqual(["card:character:c_bren", "card:character:c_aria"]);
  });

  it("is history-aware: a prior user turn's name still pins", () => {
    const pins = pickPinnedCards({
      question: "what does she want?", project, cards,
      history: [
        { role: "user", content: "Tell me about Aria." },
        { role: "assistant", content: "She is the mapmaker." },
      ],
    });
    expect(pins.map((c) => c.id)).toEqual(["card:character:c_aria"]);
  });

  it("excludes the interviewee and honors the token budget", () => {
    expect(
      pickPinnedCards({ question: "Aria?", project, cards, excludeEntityId: "c_aria" }),
    ).toEqual([]);
    // A card bigger than the whole budget (1200 tokens × 4 chars) is skipped.
    const hugeCards = [{ ...cards[0], text: "x".repeat(5000) }];
    expect(pickPinnedCards({ question: "Aria?", project, cards: hugeCards })).toEqual([]);
  });

  // 2026-07-18: a NAMED entity pins ALL its parts while budget lasts — the
  // question is about that entity, so its backstory/timeline parts belong in
  // the prompt, not just the identity header.
  it("a split article pins every part, in order, while the budget lasts", () => {
    const wbProject = {
      ...project, characters: [],
      worldbuilding: [{ id: "w1", title: "Tide Law" }],
    };
    const wbCards = [
      { id: "card:worldbuilding:w1:p1", kind: "worldbuilding", entityId: "w1", title: "Tide Law (part 1 of 2)", text: "p1" },
      { id: "card:worldbuilding:w1:p2", kind: "worldbuilding", entityId: "w1", title: "Tide Law (part 2 of 2)", text: "p2" },
    ];
    const pins = pickPinnedCards({ question: "Explain Tide Law", project: wbProject, cards: wbCards });
    expect(pins.map((c) => c.id)).toEqual(["card:worldbuilding:w1:p1", "card:worldbuilding:w1:p2"]);
  });

  it("later parts stop at the budget edge; part 1 must fit or the entity is skipped", () => {
    const wbProject = {
      ...project, characters: [],
      worldbuilding: [{ id: "w1", title: "Tide Law" }],
    };
    const big = "x".repeat(4700);
    const wbCards = [
      { id: "card:worldbuilding:w1:p1", kind: "worldbuilding", entityId: "w1", title: "p1", text: big },
      { id: "card:worldbuilding:w1:p2", kind: "worldbuilding", entityId: "w1", title: "p2", text: "y".repeat(500) },
    ];
    // p1 fits (4700 < 4800); p2 would exceed the remaining 100 → dropped.
    const pins = pickPinnedCards({ question: "Explain Tide Law", project: wbProject, cards: wbCards });
    expect(pins.map((c) => c.id)).toEqual(["card:worldbuilding:w1:p1"]);
    // An oversized part 1 skips the whole entity — exactly the old unsplit rule.
    const over = [{ id: "card:worldbuilding:w1:p1", kind: "worldbuilding", entityId: "w1", title: "p1", text: "x".repeat(5000) }];
    expect(pickPinnedCards({ question: "Explain Tide Law", project: wbProject, cards: over })).toEqual([]);
  });
});

describe("combinePinsAndHits", () => {
  it("prepends pins and drops a retrieved duplicate of a pinned card", () => {
    const pin = { id: "card:character:c_aria", kind: "character", entityId: "c_aria", text: "Aria card." };
    const hits = [
      { chunk: { id: "card:character:c_aria", kind: "character" }, cosScore: 0.9 },
      { chunk: { id: "ch1:s1" }, cosScore: 0.8 },
    ];
    const combined = combinePinsAndHits([pin], hits);
    expect(combined.map((c) => c.chunk.id)).toEqual(["card:character:c_aria", "ch1:s1"]);
    expect(combined[0].pinned).toBe(true);
    expect(combined[1].pinned).toBeUndefined();
  });
});
