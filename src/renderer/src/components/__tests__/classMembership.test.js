// The class-membership rule (kit classTunes.js) pinned against the REAL fleet.
//
// WHY THIS EXISTS (2026-07-26): the catalog row lists a model's PC classes and the
// PC-class-configs library lists a class's models, both through
// `modelBelongsToClass`. The failure mode that burned a whole day was membership
// nonsense — a 70B offered under "Integrated GPU · 32 GB" as merely "not tested".
// This test pins the exact 9-model × 12-class truth table the user approved
// (computed from their own DB snapshot + live catalog floors, 2026-07-26), so any
// drift in the rule — units, field names, the open-ended top band, the RAM gate —
// fails HERE with a named model and class, not on screen as an absurd row.
//
// Deep import on purpose: the composable is kit-internal and the kit has no test
// harness of its own (the useCatalogMeta.contract.test.js precedent).
import { describe, expect, it } from "vitest";
import { memberClassesOf, modelBelongsToClass } from "@delebash/llm-ui/classTunes.js";

// The 12 seeded hardware classes, exactly as listClassTunes() serves them
// (camelCase; verified against the DB snapshot's hardware_classes table).
const C = (classKey, memType, vramGb, ramGb) => ({ classKey, memType, vramGb, ramGb });
const CLASSES = [
  C("dgpu-vram8|ram16", "discrete", 8, 16),
  C("dgpu-vram8|ram32", "discrete", 8, 32),
  C("dgpu-vram12|ram16", "discrete", 12, 16),
  C("dgpu-vram12|ram32", "discrete", 12, 32),
  C("dgpu-vram12|ram64", "discrete", 12, 64),
  C("dgpu-vram16|ram16", "discrete", 16, 16),
  C("dgpu-vram16|ram32", "discrete", 16, 32),
  C("dgpu-vram16|ram64", "discrete", 16, 64),
  C("dgpu-vram24|ram32", "discrete", 24, 32),
  C("dgpu-vram24|ram64", "discrete", 24, 64),
  C("igpu-mem16", "integrated", 0, 16),
  C("igpu-mem32", "integrated", 0, 32),
];

// Each shipped chat model's usability floors (minVramMb, minRamMb) → its member
// classes. The expected sets are the table the user validated on 2026-07-26.
//
// The floor VALUES were re-copied from the seed on 2026-07-27, when every chat row's
// floors were snapped to binary MB of a real memory size (the user's ruling: "vram and
// ram usually only come in even sizes and certainly not 8.5" — seed.py's catalog header
// carries the convention). The EXPECTED sets below are byte-identical across that snap:
// no model changed a single class. The near misses, so a future edit knows where the
// margins are — 8500/6144 = 1.383 and 8192/6144 = 1.333 are both inside fit's 1.5x
// slack; 46000 and 49152 both live only in the open-ended vram24 band; 20000/16384 =
// 1.22 and 20480/16384 = 1.25 are both inside 1.5x and both fail vram12 either way.
const FLEET = [
  ["gemma-4-12b-qat", 8192, 12288, "ALL"],
  ["gemma-4-e4b-qat", 6144, 8192, "ALL"],
  ["gemma-4-26b-a4b-qat", 4096, 24576,
    ["dgpu-vram8|ram32", "dgpu-vram12|ram32", "dgpu-vram12|ram64", "dgpu-vram16|ram32",
     "dgpu-vram16|ram64", "dgpu-vram24|ram32", "dgpu-vram24|ram64", "igpu-mem32"]],
  ["gryphe-styletune-v2", 4096, 24576, "SAME_AS_26B"],
  ["gemma-4-26b-a4b-uncensored-ez", 4096, 24576, "SAME_AS_26B"],
  // 31B: REMOVED from the seed 2026-07-26 (the user's catalog trim) but kept here as a
  // rule fixture — it is the 20 GB-VRAM shape qwen3.6-27b shares, and dropping it would
  // lose the SAME_AS_31B anchor. Floors snapped with the rest for consistency.
  ["gemma-4-31b-qat", 20480, 24576,
    ["dgpu-vram16|ram32", "dgpu-vram16|ram64", "dgpu-vram24|ram32", "dgpu-vram24|ram64", "igpu-mem32"]],
  ["qwen3.6-27b", 20480, 24576, "SAME_AS_31B"],
  ["glm-4.5-air", 12288, 65536,
    ["dgpu-vram12|ram64", "dgpu-vram16|ram64", "dgpu-vram24|ram64"]],
  ["llama-3.3-70b-q4_k_m", 49152, 49152, ["dgpu-vram24|ram64"]],
];
const expectedFor = (spec) => {
  if (spec === "ALL") return CLASSES.map((c) => c.classKey).sort();
  if (spec === "SAME_AS_26B") return expectedFor(FLEET[2][3]);
  if (spec === "SAME_AS_31B") return expectedFor(FLEET[5][3]);
  return [...spec].sort();
};

describe("modelBelongsToClass — the approved fleet truth table", () => {
  for (const [id, vram, ram, spec] of FLEET) {
    it(`${id} belongs to exactly its approved classes`, () => {
      const got = CLASSES.filter((c) => modelBelongsToClass(vram, ram, c))
        .map((c) => c.classKey).sort();
      expect(got).toEqual(expectedFor(spec));
    });
  }

  it("the 70B belongs ONLY to the open-ended 24|64 class — the day's exhibit", () => {
    // The top VRAM band means "24 GB and above": a 48 GB card lands there, so the
    // 70B has a home. Everywhere else — including every integrated class — is out.
    expect(CLASSES.filter((c) => modelBelongsToClass(49152, 49152, c))
      .map((c) => c.classKey)).toEqual(["dgpu-vram24|ram64"]);
  });

  it("unknown floors claim nothing (a hand-added model with blank requirements)", () => {
    for (const c of CLASSES) {
      expect(modelBelongsToClass(0, 24576, c)).toBe(false);
      expect(modelBelongsToClass(4096, 0, c)).toBe(false);
      expect(modelBelongsToClass(null, null, c)).toBe(false);
    }
  });

  it("RAM is a hard gate — no VRAM headroom compensates", () => {
    // 26B-class floors on a 16 GB-RAM box: out, even beside a 24 GB card.
    expect(modelBelongsToClass(4096, 24576, C("x", "discrete", 24, 16))).toBe(false);
  });

  it("VRAM allows exactly fit's 1.5x tight slack", () => {
    const cls = C("x", "discrete", 8, 32);
    expect(modelBelongsToClass(8192 * 1.5, 12288, cls)).toBe(true);   // boundary in
    expect(modelBelongsToClass(8192 * 1.5 + 1, 12288, cls)).toBe(false); // boundary out
  });
});

describe("memberClassesOf display order", () => {
  // Asserted on the real `classKey` — the same 8 classes in the same order the
  // compact-label form used to spell "8|32 · 12|32 · … · iGPU 32", but pinned to
  // the DB key rather than to a display string (shortClassLabel deleted 2026-07-27).
  it("orders discrete by VRAM then RAM, integrated last", () => {
    const got = memberClassesOf(4096, 24576, CLASSES).map((c) => c.classKey);
    expect(got).toEqual([
      "dgpu-vram8|ram32",
      "dgpu-vram12|ram32",
      "dgpu-vram12|ram64",
      "dgpu-vram16|ram32",
      "dgpu-vram16|ram64",
      "dgpu-vram24|ram32",
      "dgpu-vram24|ram64",
      "igpu-mem32",
    ]);
  });
});
