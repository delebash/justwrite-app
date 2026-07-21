// Loadability + 4-bit-floor draft pre-pick (2026-07-21). The rule lives in the shared kit
// (the Add-model form's draft pre-select uses it), but the kit has no vitest harness, so
// JustWrite exercises it via the alias subpath — the embedApi/modelApply precedent. Pure
// logic, no mocks. Guards the actual bug: a dspark draft (arch the engine can't load) must
// never be pre-picked, or the form silently arms an MTP config that fails at spawn.
import { describe, expect, it } from "vitest";

import { allDraftsUnloadable, pickDefaultDraftPath } from "@delebash/llm-ui/draftSelect.js";

describe("pickDefaultDraftPath", () => {
  it("never pre-picks an unloadable-arch draft — the Bonsai dspark case", () => {
    // The repo's only draft is dspark (loadable:false) → no pre-pick → MTP not auto-armed.
    expect(pickDefaultDraftPath([
      { path: "Bonsai-dspark-Q4_1.gguf", q4OrBetter: true, sizeMb: 1950, loadable: false },
    ])).toBe("");
  });

  it("skips the unloadable draft but picks a loadable one beside it", () => {
    expect(pickDefaultDraftPath([
      { path: "Bonsai-dspark-Q4_1.gguf", q4OrBetter: true, sizeMb: 1950, loadable: false },
      { path: "MTP/real-Q4_0-MTP.gguf", q4OrBetter: true, sizeMb: 240, loadable: true },
    ])).toBe("MTP/real-Q4_0-MTP.gguf");
  });

  it("honours the 4-bit floor, then smallest, among loadable drafts", () => {
    // Q2 (below floor, smaller) loses to Q4 (at floor) — the existing draft-pick rule, kept.
    expect(pickDefaultDraftPath([
      { path: "big-Q4_0.gguf", q4OrBetter: true, sizeMb: 880, loadable: true },
      { path: "small-Q2_K.gguf", q4OrBetter: false, sizeMb: 100, loadable: true },
    ])).toBe("big-Q4_0.gguf");
  });

  it("treats a missing loadable key as loadable (backward-compatible)", () => {
    expect(pickDefaultDraftPath([
      { path: "legacy-Q4_0.gguf", q4OrBetter: true, sizeMb: 240 },
    ])).toBe("legacy-Q4_0.gguf");
  });

  it("returns '' for no drafts", () => {
    expect(pickDefaultDraftPath([])).toBe("");
    expect(pickDefaultDraftPath(null)).toBe("");
  });
});

describe("allDraftsUnloadable", () => {
  it("true only when the repo ships drafts and EVERY one is unloadable", () => {
    expect(allDraftsUnloadable([
      { path: "a-dspark.gguf", loadable: false },
      { path: "b-dspark.gguf", loadable: false },
    ])).toBe(true);
  });

  it("false when at least one draft is loadable", () => {
    expect(allDraftsUnloadable([
      { path: "a-dspark.gguf", loadable: false },
      { path: "b-Q4_0.gguf", loadable: true },
    ])).toBe(false);
  });

  it("false when there are no drafts", () => {
    expect(allDraftsUnloadable([])).toBe(false);
    expect(allDraftsUnloadable(null)).toBe(false);
  });
});
