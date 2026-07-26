// The hardware-class RANGE label (2026-07-26). A discrete class key is a BAND, not a
// size — VRAM down-snaps (4,6,8,12,16,24) and system RAM takes two snaps before landing
// on (16,32,64,128) — so the old label printed the band's FLOOR as if it were the user's
// card: a 10 GB RTX 3080 read "8 GB VRAM", a number BELOW their own hardware, and a 32 GB
// 5090 read "24 GB VRAM". The rule lives in the shared kit, which has no vitest harness,
// so JustWrite exercises it via the alias subpath — the draftSelect/embedApi precedent.
// The ladders' agreement with runner/hardware.py is pinned in the OTHER repo, where those
// numbers change: just-llm-runner/tests/test_class_label_ladders.py.
import { describe, expect, it } from "vitest";

import { bandOf, classKeyLabel, classKeyRangeLabel, VRAM_BANDS } from "@delebash/llm-ui/classTunes.js";

describe("classKeyRangeLabel", () => {
  it("names the run a band covers, not its floor — the 10 GB 3080 case", () => {
    // The card keys to vram8; the label must not read as a smaller card than they own.
    expect(classKeyRangeLabel("dgpu-vram8|ram32")).toBe("8–11 GB VRAM · 32 or 48 GB RAM");
  });

  it("says 'and above' on the open top band — the 32 GB 5090 case", () => {
    expect(classKeyRangeLabel("dgpu-vram24|ram128")).toBe("24 GB VRAM and above · 128 GB RAM and above");
  });

  it("names the two nominal RAM capacities a rung holds, not a raw interval", () => {
    // snap_ram_gb picks the nearest standard capacity, THEN the coarse rung down-snaps,
    // so ram16 genuinely contains both 16 and 24 GB boxes.
    expect(classKeyRangeLabel("dgpu-vram12|ram16")).toBe("12–15 GB VRAM · 16 or 24 GB RAM");
    expect(classKeyRangeLabel("dgpu-vram16|ram64")).toBe("16–23 GB VRAM · 64 or 96 GB RAM");
  });

  it("covers the bottom band too", () => {
    expect(classKeyRangeLabel("dgpu-vram4|ram16")).toBe("4–5 GB VRAM · 16 or 24 GB RAM");
  });

  it("stays EXACT below the ladder floor — a sub-band key is not a range", () => {
    // hardware.py:183-184 passes an under-4 GB card through unbanded; it honestly
    // matches no band seed, so claiming a range would invent coverage.
    expect(classKeyRangeLabel("dgpu-vram2|ram16")).toBe("2 GB VRAM · 16 or 24 GB RAM");
  });

  it("leaves one-pool types exactly as they were — they are never banded", () => {
    expect(classKeyRangeLabel("igpu-mem16")).toBe("Integrated GPU · 16 GB");
    expect(classKeyRangeLabel("unified-mem192")).toBe("Unified memory · 192 GB");
  });

  it("cannot render a FRACTIONAL key — which is why the editor truncates before building one", () => {
    // The number box hands back a raw string, so "3.5" would reach the key template
    // untruncated. No regex matches a fractional key, so it would print verbatim and leak
    // internal syntax into copy. LuClassTunes.vue's `wholeGb` (Math.trunc, mirroring
    // Python's int()) is what keeps this branch unreachable — pinned here so removing the
    // truncation shows up as a visible contract, not just a 422 at save time.
    expect(classKeyRangeLabel("dgpu-vram3.5|ram16")).toBe("dgpu-vram3.5|ram16");
    expect(bandOf(3.5, VRAM_BANDS)).toBe(3.5);   // below the floor → no snap to hide it
  });

  it("keeps the free name winning, and an unknown shape verbatim", () => {
    expect(classKeyRangeLabel("dgpu-vram8|ram32", "My Laptop")).toBe("My Laptop");
    expect(classKeyRangeLabel("something-else")).toBe("something-else");
    expect(classKeyRangeLabel("")).toBe("");
  });
});

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
