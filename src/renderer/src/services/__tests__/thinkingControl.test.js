// The ONE Thinking-control vocabulary (kit module, imported REAL via the source alias).
//
// Why this exists: the chip and the Lab drifted apart TWICE on 2026-07-16 — first the
// unapproved "Model default" entry, then the Lab showing bare "Custom" where the chip
// showed "Low (1024)" for the SAME preset. Both surfaces now build their options and
// seed their value through these functions, so the pins below ARE the parity contract:
// same inputs → same display, by construction.
import { describe, expect, it } from "vitest";

import {
  levelForValue, presetToThinkingControl, resolvedToThinkingControl,
  THINKING_CUSTOM, thinkingControlToWire, thinkingOptionsFor,
} from "@delebash/llm-ui/thinkingControl.js";

// The built-in engine's seeded map: number budgets, no words.
const LOCAL_ROWS = [
  { level: "low", word: "", tokens: 1024 },
  { level: "medium", word: "", tokens: 4096 },
  { level: "high", word: "", tokens: 8192 },
  { level: "xhigh", word: "", tokens: 16384 },
  { level: "max", word: "", tokens: 32768 },
];
// A word-only cloud provider (openai family): words, no numbers.
const CLOUD_ROWS = [
  { level: "low", word: "low", tokens: null },
  { level: "medium", word: "medium", tokens: null },
  { level: "high", word: "high", tokens: null },
];

describe("resolvedToThinkingControl — what the control shows (the B ruling)", () => {
  it("the follow state shows the level whose number matches what RUNS, not 'Custom'", () => {
    // think on + empty level, resolving to 1024 (the hardware class default).
    // THE BUG the user caught: the Lab showed "Custom" here while the chip showed Low.
    expect(resolvedToThinkingControl({ think: true, reasoningEffort: "" }, 1024, LOCAL_ROWS)).toBe("low");
    expect(resolvedToThinkingControl({ think: true, reasoningEffort: "" }, 32768, LOCAL_ROWS)).toBe("max");
  });

  it("a stored level is the preset's OWN ask and shows as itself", () => {
    expect(resolvedToThinkingControl({ think: true, reasoningEffort: "high" }, 8192, LOCAL_ROWS)).toBe("high");
  });

  it("a resolved value matching NO level is Custom (a number typed in a switch grid)", () => {
    expect(resolvedToThinkingControl({ think: true, reasoningEffort: "" }, 3000, LOCAL_ROWS)).toBe(THINKING_CUSTOM);
  });

  it("think off is Off regardless of what resolves", () => {
    expect(resolvedToThinkingControl({ think: false, reasoningEffort: "" }, 1024, LOCAL_ROWS)).toBe("");
  });
});

describe("thinkingOptionsFor — the options both surfaces render", () => {
  it("numbers the levels where the provider speaks numbers", () => {
    const opts = thinkingOptionsFor({ levelRows: LOCAL_ROWS, current: "low" });
    expect(opts.map((o) => o.label)).toEqual([
      "Off", "Low (1024)", "Medium (4096)", "High (8192)", "XHigh (16384)", "Max (32768)",
    ]);
  });

  it("plain words where the provider speaks words, and omits levels it lacks", () => {
    const opts = thinkingOptionsFor({ levelRows: CLOUD_ROWS, current: "low" });
    expect(opts.map((o) => o.label)).toEqual(["Off", "Low", "Medium", "High"]);
  });

  it("Custom carries its NUMBER and appears only while it IS the state", () => {
    // The user's rule: "even if it was custom are we supposed also say value".
    const withCustom = thinkingOptionsFor({ levelRows: LOCAL_ROWS, current: THINKING_CUSTOM, customValue: 3000 });
    expect(withCustom.find((o) => o.value === THINKING_CUSTOM).label).toBe("Custom (3000)");
    const without = thinkingOptionsFor({ levelRows: LOCAL_ROWS, current: "low", customValue: 3000 });
    expect(without.some((o) => o.value === THINKING_CUSTOM)).toBe(false);
  });

  it("an EMPTY map still offers the levels (fallback) — never an Off-only control", () => {
    const opts = thinkingOptionsFor({ levelRows: [], current: "" });
    expect(opts.map((o) => o.label)).toEqual(["Off", "Low", "Medium", "High", "XHigh", "Max"]);
  });
});

describe("the wire mapping is total and truthful", () => {
  it("Off / a level / Custom each map to their honest stored pair", () => {
    expect(thinkingControlToWire("")).toEqual({ think: false, reasoningEffort: "" });
    expect(thinkingControlToWire("high")).toEqual({ think: true, reasoningEffort: "high" });
    // Custom writes the follow pair — identical to the only stored shape it displays for,
    // so a save with Custom selected never silently changes thinking.
    expect(thinkingControlToWire(THINKING_CUSTOM)).toEqual({ think: true, reasoningEffort: "" });
  });

  it("round-trips: the stored pair → control → wire returns the SAME pair", () => {
    for (const p of [
      { think: false, reasoningEffort: "" },
      { think: true, reasoningEffort: "" },
      { think: true, reasoningEffort: "medium" },
    ]) {
      expect(thinkingControlToWire(presetToThinkingControl(p))).toEqual(p);
    }
  });

  it("the sentinel can never ship as a level", () => {
    expect(thinkingControlToWire(THINKING_CUSTOM).reasoningEffort).not.toContain("custom");
  });
});

describe("levelForValue", () => {
  it("matches the map's own numbers, and a null value matches nothing", () => {
    expect(levelForValue(LOCAL_ROWS, 4096)).toBe("medium");
    expect(levelForValue(LOCAL_ROWS, 3000)).toBe(null);
    expect(levelForValue(LOCAL_ROWS, null)).toBe(null);
    // Word-only rows carry no numbers — nothing can match them.
    expect(levelForValue(CLOUD_ROWS, 1024)).toBe(null);
  });
});
