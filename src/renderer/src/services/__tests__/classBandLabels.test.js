// The hardware-class BAND labels (2026-07-26). A discrete class key is a BAND, not a
// size — VRAM down-snaps (4,6,8,12,16,24) and system RAM takes two snaps before landing
// on (16,32,64,128). The label prints the band's FLOOR: the user ruled out the range form
// ("23gb vram no card has that" — it rendered `next - 1`, a number no card ships), and the
// floor is safe to show because every surface carrying a class label now also states the
// MACHINE's own numbers, so "8 GB VRAM" reads as a bucket rather than as a claim about a
// 10 GB card. The rule lives in the shared kit, which has no vitest harness, so JustWrite
// exercises it via the alias subpath — the draftSelect/embedApi precedent.
// The ladders' agreement with runner/hardware.py is pinned in the OTHER repo, where those
// numbers change: just-llm-runner/tests/test_class_label_ladders.py.
import { describe, expect, it } from "vitest";

import { bandOf, classKeyLabel, VRAM_BANDS } from "@delebash/llm-ui/classTunes.js";


describe("classKeyLabel (the short form)", () => {
  it("is UNCHANGED — the badge and running sentences keep it (the user's call, 2026-07-26)", () => {
    expect(classKeyLabel("dgpu-vram8|ram32")).toBe("8 GB VRAM · 32 GB RAM");
    expect(classKeyLabel("igpu-mem16")).toBe("Integrated GPU · 16 GB");
    expect(classKeyLabel("dgpu-vram8|ram32", "My PC")).toBe("My PC");
  });
});

describe("bandOf", () => {
  it("down-snaps to the largest rung at or below the value", () => {
    expect(bandOf(10, VRAM_BANDS)).toBe(8);    // 3080
    expect(bandOf(11, VRAM_BANDS)).toBe(8);    // 2080 Ti
    expect(bandOf(20, VRAM_BANDS)).toBe(16);
    expect(bandOf(32, VRAM_BANDS)).toBe(24);   // 5090 → the 24+ band
  });

  it("passes a below-floor value through unchanged", () => {
    expect(bandOf(3, VRAM_BANDS)).toBe(3);
  });
});
