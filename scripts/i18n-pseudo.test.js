// Pins the pseudo-locale transform's one load-bearing contract: protected
// segments survive byte-identical. The `pseudo-localization` package alone
// mangles them ({n} → {ƞ}, probed before adoption — Ruling 4 in
// docs/plans/2026-07-26-i18n-phase1-coverage-plan.md); the wrapper in
// i18n-pseudo.mjs splits them out first. If this test fails, the pseudo
// locale would BREAK interpolation instead of revealing i18n bugs.
import { describe, expect, it } from "vitest";
import { pseudo } from "./i18n-pseudo.mjs";

describe("i18n-pseudo", () => {
  it("round-trips {…} interpolation and <…> markup untouched", () => {
    const out = pseudo("Delete {n} chapters from <b>{title}</b>?");
    expect(out).toContain("{n}");
    expect(out).toContain("{title}");
    expect(out).toContain("<b>");
    expect(out).toContain("</b>");
  });

  it("transforms the prose and wraps in ⟦…⟧ with padding", () => {
    const src = "Delete this chapter";
    const out = pseudo(src);
    expect(out).not.toContain("Delete");
    expect(out.startsWith("⟦")).toBe(true);
    expect(out.endsWith("⟧")).toBe(true);
    expect(out.length).toBeGreaterThan(src.length);
  });
});
