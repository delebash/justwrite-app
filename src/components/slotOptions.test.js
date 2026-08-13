// SPDX-License-Identifier: MIT
// The §7.3 pin (fit-redesign, §8.23 — user 2026-08-13: "a user should always be
// able to run any model they want with any settings they want"): the slot-card
// dropdowns list EVERY model of their kind — a "no"-badged model is selectable —
// and the fit badge + speed band ride the label so the pick is INFORMED, never
// gated. The pure builder lives in the kit (modelPick.js, the draftSelect.js
// vitest-via-JW precedent); recommendations still only PREFER runnable.
import { describe, expect, it } from "vitest";

import {
  buildSlotOptions,
  fitWarning,
  speedBandLabel,
} from "@delebash/llm-ui/common/services/modelPick.js";

const MODELS = [
  { id: "flagship", name: "Flagship", fit: "ok", speedBand: "fine", predTokS: 8.7, measuredTokS: null },
  { id: "giant", name: "Giant", fit: "no", speedBand: "painful", predTokS: 1.5, measuredTokS: null },
  { id: "tuned", name: "Tuned", fit: "tight", speedBand: "fast", predTokS: 9.1, measuredTokS: 28.6 },
  { id: "embed", name: "Embed", fit: "cpu", speedBand: "", predTokS: null, measuredTokS: null },
];
const acc = {
  embeddingOf: (m) => m.id === "embed",
  useLimitedOf: () => false,
  qualityOf: (m) => ({ flagship: 1, giant: 2, tuned: 3, embed: 1 })[m.id] ?? 100,
};

describe("buildSlotOptions — the veto is OUT (§8.23)", () => {
  it("lists a 'no'-fit model — selectable, labeled honestly", () => {
    const opts = buildSlotOptions(MODELS, { kind: false, recommendedId: "flagship", ...acc });
    const ids = opts.map((o) => o.value);
    expect(ids).toContain("giant"); // THE pin: a "no" row is in the dropdown
    expect(ids).not.toContain("embed"); // kind-filtered, not fit-filtered
    const giant = opts.find((o) => o.value === "giant");
    expect(giant.label).toContain("Won't fit"); // the badge rides the label
    // Predicted band, "~"-marked; the wire's "painful" DISPLAYS as "very slow"
    // (user 2026-08-13 — SPEED_BAND_LABEL maps it, the FIT_LABEL precedent).
    expect(giant.label).toContain("~very slow");
  });

  it("tags the recommendation and keeps quality order", () => {
    const opts = buildSlotOptions(MODELS, { kind: false, recommendedId: "flagship", ...acc });
    expect(opts[0].value).toBe("flagship");
    expect(opts[0].label).toContain("Recommended");
  });

  it("a measured band drops the '~' (measurement outranks estimate)", () => {
    expect(speedBandLabel(MODELS[2])).toBe("fast");
    expect(speedBandLabel(MODELS[0])).toBe("~fine");
    expect(speedBandLabel(MODELS[3])).toBe("");
  });

  it("embed slots list embeds without the chat fit annotation", () => {
    const opts = buildSlotOptions(MODELS, { kind: true, recommendedId: "", ...acc });
    expect(opts.map((o) => o.value)).toEqual(["embed"]);
    expect(opts[0].label).not.toContain("CPU");
  });
});

describe("fitWarning — informs, never gates", () => {
  it("warns on a 'no' row and stays silent otherwise", () => {
    expect(fitWarning(MODELS[1])).toMatch(/still.*load/i);
    expect(fitWarning(MODELS[0])).toBe("");
    expect(fitWarning(undefined)).toBe("");
  });
});
