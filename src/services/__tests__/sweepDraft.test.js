// A (2026-07-18) — the entity sweep's per-project draft: pure-logic pins.
//
// The load-bearing choice under test: the draft stores RAW per-chapter
// extraction results, and the review aggregate is REBUILT from them with the
// same mergeProposals the live sweep uses — so any subset can be re-scanned
// and resume can never drift from a fresh run's merge semantics.
import { describe, expect, it } from "vitest";

import {
  draftCounts, draftFoundTotal, emptyDraft, needsScan, pruneDraft,
  rebuildProposals, recordChapterDone, recordChapterError, textHash,
} from "../analysis/sweepDraft.js";

const CH1 = { id: "c1", num: 1, title: "Chapter 1" };
const CH2 = { id: "c2", num: 2, title: "Chapter 2" };

function fresh(names) {
  return {
    characters: names.map((n) => ({ name: n, role: "", kind: "", oneLiner: "", note: "", evidence: "", aliases: [] })),
    locations: [], objects: [],
  };
}

describe("textHash", () => {
  it("is stable for the same text and differs when the text changes", () => {
    expect(textHash("the slate board waits")).toBe(textHash("the slate board waits"));
    expect(textHash("the slate board waits")).not.toBe(textHash("the slate board waited"));
    expect(typeof textHash("")).toBe("string");
  });
});

describe("needsScan — the resume filter", () => {
  it("no entry → scan; error → scan; done+changed → scan; done+unchanged → skip", () => {
    const d = emptyDraft();
    const h = textHash("prose");
    expect(needsScan(undefined, h)).toBe(true);
    recordChapterError(d, CH1, "boom", h);
    expect(needsScan(d.chapters.c1, h)).toBe(true);
    recordChapterDone(d, CH1, fresh(["Slate"]), h);
    expect(needsScan(d.chapters.c1, h)).toBe(false);
    expect(needsScan(d.chapters.c1, textHash("edited prose"))).toBe(true);
  });
});

describe("record + counts", () => {
  it("draftCounts and draftFoundTotal reflect done/error entries", () => {
    const d = emptyDraft();
    recordChapterDone(d, CH1, fresh(["Slate", "Old Sedge"]), "h1");
    recordChapterError(d, CH2, "model exploded", "h2");
    expect(draftCounts(d)).toEqual({ done: 1, failed: 1 });
    expect(draftFoundTotal(d)).toBe(2);
    // A re-scan of the failed chapter replaces its entry wholesale.
    recordChapterDone(d, CH2, fresh(["Odeline"]), "h2b");
    expect(draftCounts(d)).toEqual({ done: 2, failed: 0 });
    expect(draftFoundTotal(d)).toBe(3);
  });

  it("error reasons are clamped to 200 chars", () => {
    const d = emptyDraft();
    recordChapterError(d, CH1, "x".repeat(500), "h");
    expect(d.chapters.c1.reason).toHaveLength(200);
  });
});

describe("rebuildProposals — resume can't drift from a fresh run's merge", () => {
  it("merges same-name proposals across chapters: origins extended, first evidence kept", () => {
    const d = emptyDraft();
    const a = fresh(["Old Sedge"]);
    a.characters[0].evidence = "lantern and a ledger";
    const b = fresh(["Old Sedge", "Slate"]);
    b.characters[0].oneLiner = "Keeper of the watch-hut ledger.";
    recordChapterDone(d, CH1, a, "h1");
    recordChapterDone(d, CH2, b, "h2");

    const agg = rebuildProposals(d);
    expect(agg.characters).toHaveLength(2);
    const sedge = agg.characters.find((c) => c.name === "Old Sedge");
    expect(sedge.originChapters.map((o) => o.id)).toEqual(["c1", "c2"]);
    expect(sedge.evidence).toBe("lantern and a ledger"); // first-surfacing chapter's quote
    expect(sedge.oneLiner).toBe("Keeper of the watch-hut ledger."); // later backfill
  });

  it("merges in chapter order regardless of insertion order, and skips error entries", () => {
    const d = emptyDraft();
    const later = fresh(["Slate"]);
    later.characters[0].evidence = "from chapter two";
    const earlier = fresh(["Slate"]);
    earlier.characters[0].evidence = "waiting to be chosen";
    recordChapterDone(d, CH2, later, "h2");   // inserted first…
    recordChapterDone(d, CH1, earlier, "h1"); // …but ch1 must merge first
    recordChapterError(d, { id: "c3", num: 3, title: "Ch 3" }, "boom", "h3");

    const agg = rebuildProposals(d);
    expect(agg.characters).toHaveLength(1);
    expect(agg.characters[0].evidence).toBe("waiting to be chosen");
    expect(agg.characters[0].originChapters.map((o) => o.num)).toEqual([1, 2]);
  });
});

describe("pruneDraft", () => {
  it("drops entries for chapters no longer in the book and reports it", () => {
    const d = emptyDraft();
    recordChapterDone(d, CH1, fresh(["Slate"]), "h1");
    recordChapterDone(d, CH2, fresh(["Odeline"]), "h2");
    expect(pruneDraft(d, new Set(["c1"]))).toBe(true);
    expect(Object.keys(d.chapters)).toEqual(["c1"]);
    expect(pruneDraft(d, new Set(["c1"]))).toBe(false); // nothing left to prune
  });
});
