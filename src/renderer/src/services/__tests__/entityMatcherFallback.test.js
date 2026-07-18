// corpusFallback (2026-07-18): pickPinnedCards' book-chat fallback — a question
// naming NO bible entity pins the premise card + main-character cards; any
// entity match keeps the original named-entity-only behavior byte-identical,
// and the flag is opt-in so characterChat (which doesn't pass it) is unchanged.
import { describe, expect, it } from "vitest";
import { pickPinnedCards } from "../rag/entityMatcher.js";

// Minimal live-store stand-in (collectEntities reads plain properties).
const project = {
  characters: [
    { id: "c1", name: "Mara Voss", main: true },
    { id: "c2", name: "Tobin Ash", main: true },
    { id: "c3", name: "Skiff", main: false },
  ],
  locations: [{ id: "l1", name: "The Salt Quay" }],
  objects: [],
  groups: [],
  worldbuilding: [],
  strands: [],
};

const card = (kind, entityId, text) => ({
  id: `card:${kind}:${entityId}`, kind, entityId, title: entityId, text, sha: "",
});
const cards = [
  card("architecture", "premise", "PREMISE ".repeat(10)),
  card("character", "c1", "MARA ".repeat(20)),
  card("character", "c2", "TOBIN ".repeat(20)),
  card("character", "c3", "SKIFF ".repeat(20)),
  card("location", "l1", "QUAY ".repeat(20)),
];

describe("pickPinnedCards corpusFallback", () => {
  it("pins premise + main cast (list order) when the question names no entity", () => {
    const pinned = pickPinnedCards({
      question: "What is this book about?", project, cards, corpusFallback: true,
    });
    expect(pinned.map((c) => c.id)).toEqual([
      "card:architecture:premise", "card:character:c1", "card:character:c2",
    ]); // c3 is not main; l1 is not a character
  });

  it("is inert without the flag — characterChat's call shape stays empty", () => {
    expect(pickPinnedCards({ question: "What is this book about?", project, cards })).toEqual([]);
  });

  it("never fires when an entity matched — named questions are byte-identical", () => {
    const pinned = pickPinnedCards({
      question: "Who is Mara Voss?", project, cards, corpusFallback: true,
    });
    expect(pinned.map((c) => c.id)).toEqual(["card:character:c1"]);
  });

  it("matched-but-unpinnable still means 'about that entity' — no fallback", () => {
    // The Salt Quay matches but has no card in this list → pins stay empty
    // rather than falling back to the whole-book cards.
    const noQuayCard = cards.filter((c) => c.kind !== "location");
    const pinned = pickPinnedCards({
      question: "Describe the Salt Quay.", project, cards: noQuayCard, corpusFallback: true,
    });
    expect(pinned).toEqual([]);
  });

  it("respects the pin token budget", () => {
    const huge = "X".repeat(1200 * 4 + 1); // over the whole budget
    const bigCards = [card("architecture", "premise", huge), card("character", "c1", "MARA ".repeat(20))];
    const pinned = pickPinnedCards({
      question: "Summarize the story so far.", project, cards: bigCards, corpusFallback: true,
    });
    expect(pinned.map((c) => c.id)).toEqual(["card:character:c1"]); // premise skipped, budget intact
  });
});
