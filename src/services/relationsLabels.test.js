// A Relations node's name (services/relationsLabels.js, 2026-10-28): one line when it fits; two at
// its own size, broken nearest the middle, when it doesn't; only a line still too wide is condensed.
import { describe, expect, it } from "vitest";
import { labelLines } from "./relationsLabels.js";

// 11 px names in a 38 px circle (the page's second ring): 1.7 × 38 ≈ 65 px, about 10 glyphs
const linesOf = (name) => labelLines(name, 11, 38 * 1.7);

describe("a node's name", () => {
  it("stays one line, at its own size, when it fits — a little over, condensed unseen", () => {
    expect(linesOf("Wren")).toEqual([{ text: "Wren", fit: null }]);
    const [petar, ...rest] = linesOf("Petar Coyne");
    expect(rest).toEqual([]);
    expect(petar.fit).toBeCloseTo(38 * 1.7);
  });

  it("breaks onto two lines at the space nearest the middle, without squeezing", () => {
    expect(linesOf("The Toll-Weight of Ninefold").map((l) => l.text)).toEqual(["The Toll-Weight", "of Ninefold"]);
    expect(linesOf("Lady Sarthe the Dowager").map((l) => l.text)).toEqual(["Lady Sarthe", "the Dowager"]);
    expect(linesOf("Ash on the Wall")).toEqual([{ text: "Ash on", fit: null }, { text: "the Wall", fit: null }]);
  });

  it("condenses only a line still too wide — one long word", () => {
    const [only] = linesOf("Highwardenottlength");
    expect(only.text).toBe("Highwardenottlength");
    expect(only.fit).toBeCloseTo(38 * 1.7);
  });
});
