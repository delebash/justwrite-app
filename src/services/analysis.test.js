import { describe, expect, it } from "vitest";
import { paceSeries, povBalance } from "./analysis.js";

describe("the POV balance (2026-10-29)", () => {
  const characters = [{ id: "c1", name: "Sable" }, { id: "c2", name: "Ysolde" }];
  const scenes = {
    ch1: [
      { id: "s1", body: "<p>one two three</p>", povCharacterId: "c2" },
      { id: "s2", body: "<p>four five</p>", povCharacterId: "c1" },
    ],
    ch2: [
      { id: "s3", body: "<p>six <em>seven</em> eight nine</p>", povCharacterId: "c1" },
      { id: "s4", body: "<p>ten</p>", povCharacterId: null },
      { id: "s5", body: "<p>gone too</p>", povCharacterId: "c_trashed" },
    ],
  };
  const chapters = [{ id: "ch1" }, { id: "ch2" }];
  const scenesFor = (id) => scenes[id];

  it("counts each POV character's scenes and words, most words first, the scenes without one last", () => {
    expect(povBalance(chapters, scenesFor, characters)).toEqual([
      { characterId: "c1", name: "Sable", scenes: 2, words: 6 },
      { characterId: "c2", name: "Ysolde", scenes: 1, words: 3 },
      { characterId: null, name: "No POV character", scenes: 2, words: 3 },
    ]);
  });

  it("is empty while no scene has a POV character", () => {
    expect(povBalance(chapters, scenesFor, [])).toEqual([]);
  });
});

describe("the pace chart's trend", () => {
  it("runs through the finished days only — today, the last day, is still being written", () => {
    // 100, 200, 300, 400 a day, then 5 words so far today
    expect(paceSeries([100, 200, 300, 400, 5]).trend).toEqual({ from: 100, to: 400 });
  });

  it("never reads below 0 words a day", () => {
    // a big first day and nothing since: the line falls below zero by the end
    expect(paceSeries([900, 0, 0, 0, 0]).trend).toEqual({ from: 630, to: 0 });
  });

  it("is absent while no finished day has words", () => {
    expect(paceSeries([0, 0, 0, 250]).trend).toBeNull();
    expect(paceSeries([300]).trend).toBeNull();
  });
});
