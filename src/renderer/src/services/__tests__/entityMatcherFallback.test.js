// corpusFallback (2026-07-18): pickPinnedCards' book-chat fallback — a question
// naming NO bible entity pins the premise card + the compact main-cast ROSTER
// (cards.js). Any entity match keeps the named-entity-only behavior; the flag is
// opt-in so characterChat (which doesn't pass it) is unchanged. The roster replaced
// per-main full cards (2026-07-18) so a rich protagonist can't starve the cast out
// of the pin budget — measured: one full card was 3009 of the 4800-char budget.
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
// Full character cards still exist (named pins use them); the roster is what the
// corpus fallback reaches for.
const cards = [
  card("architecture", "premise", "PREMISE ".repeat(10)),
  card("cast", "main", "Main cast:\n- Mara Voss (lead)\n- Tobin Ash (mage)"),
  card("character", "c1", "MARA ".repeat(40)),
  card("character", "c2", "TOBIN ".repeat(40)),
  card("character", "c3", "SKIFF ".repeat(20)),
  card("location", "l1", "QUAY ".repeat(20)),
];

describe("pickPinnedCards corpusFallback", () => {
  it("pins premise + the main-cast roster when the question names no entity", () => {
    const pinned = pickPinnedCards({
      question: "What is this book about?", project, cards, corpusFallback: true,
    });
    expect(pinned.map((c) => c.id)).toEqual([
      "card:architecture:premise", "card:cast:main",
    ]);
  });

  // 2026-07-18: fabula + setting join the fallback (budget had room, 741/4800
  // measured) — whole-book questions often ask about the world or the shape
  // of events. Absent when unwritten (the fixture above has neither).
  it("pins fabula + setting after premise + roster when those cards exist", () => {
    const withArch = [
      ...cards,
      card("architecture", "fabula", "FABULA ".repeat(10)),
      card("architecture", "setting", "SETTING ".repeat(10)),
    ];
    const pinned = pickPinnedCards({
      question: "What is this book about?", project, cards: withArch, corpusFallback: true,
    });
    expect(pinned.map((c) => c.id)).toEqual([
      "card:architecture:premise", "card:cast:main",
      "card:architecture:fabula", "card:architecture:setting",
    ]);
  });

  it("is inert without the flag — characterChat's call shape stays empty", () => {
    expect(pickPinnedCards({ question: "What is this book about?", project, cards })).toEqual([]);
  });

  it("names an entity → its FULL card, never the roster (named questions byte-identical)", () => {
    const pinned = pickPinnedCards({
      question: "Who is Mara Voss?", project, cards, corpusFallback: true,
    });
    expect(pinned.map((c) => c.id)).toEqual(["card:character:c1"]);
  });

  it("matched-but-unpinnable still means 'about that entity' — no fallback", () => {
    // The Salt Quay matches but has no card in this list → pins stay empty rather
    // than falling back to the whole-book roster.
    const noQuayCard = cards.filter((c) => c.kind !== "location");
    const pinned = pickPinnedCards({
      question: "Describe the Salt Quay.", project, cards: noQuayCard, corpusFallback: true,
    });
    expect(pinned).toEqual([]);
  });

  it("fires on a corpus follow-up even when history named an entity (turn-2 fix)", () => {
    // Incident: "who is Tobin?" then "so what's the book about?" — the prior turn's
    // name used to suppress the fallback, so the roster/premise stayed missing on turn 2.
    const pinned = pickPinnedCards({
      question: "So what's the book about?",
      history: [
        { role: "user", content: "Who is Tobin Ash?" },
        { role: "assistant", content: "A mage." },
      ],
      project, cards, corpusFallback: true,
    });
    const ids = pinned.map((c) => c.id);
    expect(ids).toContain("card:character:c2");         // Tobin still pinned from history
    expect(ids).toContain("card:architecture:premise"); // + whole-book context
    expect(ids).toContain("card:cast:main");            // + the full-cast roster
  });

  it("respects the pin token budget", () => {
    const huge = "X".repeat(1200 * 4 + 1); // over the whole budget
    const bigCards = [card("architecture", "premise", huge), card("cast", "main", "Main cast:\n- Mara")];
    const pinned = pickPinnedCards({
      question: "Summarize the story so far.", project, cards: bigCards, corpusFallback: true,
    });
    expect(pinned.map((c) => c.id)).toEqual(["card:cast:main"]); // premise over budget → skipped; roster fits
  });
});
