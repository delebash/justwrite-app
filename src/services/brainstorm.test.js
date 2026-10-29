// Brainstorm's one way of asking (2026-10-11, the AI drafting plan Task 10): the prompt the page
// sent before the move, byte for byte; the action per category; the reply's lines; which ideas
// are fresh; and every category's text in both locales (the keys are built at run time, which
// neither i18n:report nor the build can see — characterFieldKeys.test.js has the long why). And
// the rounds (composables/useBrainstorm.js) with the model stubbed.
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../i18n/locales/en.json";
import es from "../i18n/locales/es.json";

const runAiFeature = vi.fn();
vi.mock("@delebash/ui", () => ({
  runAiFeature: (...a) => runAiFeature(...a),
  // no round's task is ever running here: the model is stubbed whole
  useSurfaceTask: () => ({ value: null }),
}));

const {
  BRAINSTORM_CATEGORIES, brainstormAction, brainstormPrompt, freshIdeas, parseBrainstormLines,
} = await import("./brainstorm.js");
const { useBrainstorm } = await import("../composables/useBrainstorm.js");

describe("the prompt", () => {
  // Data only (2026-10-28): what the model does with each list is the seeded system prompt's.
  it("is the category and the seed on a first round", () => {
    expect(brainstormPrompt({ category: "place_name", seed: "  harbor taverns  " })).toBe(
      "Category: Place names\nSeed: harbor taverns");
  });

  it("adds the liked ideas, then everything already shown, on a More like these round", () => {
    const p = brainstormPrompt({ category: "character_name", seed: "x", liked: ["Ada"], seen: ["Ada", "Bo"] });
    expect(p).toBe("Category: Character names\nSeed: x\n\nLiked:\n- Ada\n\nAlready shown:\n- Ada\n- Bo");
  });

  it("runs a plot category as brainstormPlot with its kind, the rest as brainstorm with its label", () => {
    expect(brainstormAction("twist")).toEqual({ action: "brainstormPlot", variables: { kind: "plot twists, reveals, or reversals" } });
    expect(brainstormAction("item_name")).toEqual({ action: "brainstorm", variables: { label: "Item / object names" } });
  });
});

describe("the reply", () => {
  it("is one idea per line, list markers stripped", () => {
    expect(parseBrainstormLines("1. Ada\n2) Bo\n- Cy\n* Di\n• Ed\n\n  Fay  \n")).toEqual(["Ada", "Bo", "Cy", "Di", "Ed", "Fay"]);
  });

  it("keeps only fresh ideas: not shown before, not a taken name (any case), not repeated", () => {
    expect(freshIdeas(["Ada", "Bo", "mira", "Bo", "Cy"], { seen: ["Ada"], exclude: ["Mira"] })).toEqual(["Bo", "Cy"]);
  });
});

describe("the categories' text", () => {
  for (const [name, catalog] of [["en", en], ["es", es]]) {
    it(`is in ${name}.json for every category`, () => {
      for (const { value } of BRAINSTORM_CATEGORIES) {
        const c = catalog.brainstorm.categories[value];
        expect(c?.label, value).toBeTruthy();
        expect(c?.purpose, value).toBeTruthy();
        expect(c?.placeholder, value).toBeTruthy();
      }
      expect(Object.keys(catalog.brainstorm.categories)).toHaveLength(BRAINSTORM_CATEGORIES.length);
    });
  }
});

describe("the rounds (model stubbed)", () => {
  beforeEach(() => {
    runAiFeature.mockReset();
  });
  const request = vi.fn(({ liked, seen }) => ({ action: "brainstorm", variables: { label: "L", user_content: `${liked}|${seen}` }, exclude: ["Mira"] }));
  const list = () => useBrainstorm({ request, meta: { kind: "test" }, label: "Test" });

  it("shows a round's fresh ideas, and a More like these round adds to them, steered by the likes", async () => {
    const b = list();
    runAiFeature.mockResolvedValueOnce({ content: "Ada\nMIRA\nBo" });
    await b.generate();
    expect(runAiFeature.mock.calls[0][0]).toMatchObject({ action: "brainstorm", feature: "brainstorm", task: { label: "Test", meta: { kind: "test" } } });
    expect(b.results.value.map((r) => r.text)).toEqual(["Ada", "Bo"]);

    b.toggleLike(b.results.value[0]);
    runAiFeature.mockResolvedValueOnce({ content: "Ada\nCy" });
    await b.moreLikeThese();
    expect(request.mock.calls.at(-1)[0]).toEqual({ liked: ["Ada"], seen: ["Ada", "Bo"] });
    expect(b.results.value.map((r) => r.text)).toEqual(["Ada", "Bo", "Cy"]);
  });

  it("starts over on Generate, and shows a failure but not a cancel", async () => {
    const b = list();
    runAiFeature.mockResolvedValueOnce({ content: "Ada" });
    await b.generate();
    runAiFeature.mockRejectedValueOnce(new Error("The model failed to load."));
    await b.generate();
    expect(b.results.value).toEqual([]);
    expect(request.mock.calls.at(-1)[0]).toEqual({ liked: [], seen: [] });
    expect(b.error.value).toBe("The model failed to load.");

    runAiFeature.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }));
    await b.generate();
    expect(b.error.value).toBe("");
  });
});
