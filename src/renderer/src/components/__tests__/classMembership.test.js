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
import {
  memberClassesOf,
  modelBelongsToClass,
  shortClassLabel,
} from "@delebash/llm-ui/classTunes.js";

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
const FLEET = [
  ["gemma-4-12b-qat", 8500, 12000, "ALL"],
  ["gemma-4-e4b-qat", 6000, 8000, "ALL"],
  ["gemma-4-26b-a4b-qat", 4000, 24000,
    ["dgpu-vram8|ram32", "dgpu-vram12|ram32", "dgpu-vram12|ram64", "dgpu-vram16|ram32",
     "dgpu-vram16|ram64", "dgpu-vram24|ram32", "dgpu-vram24|ram64", "igpu-mem32"]],
  ["gryphe-styletune-v2", 4000, 24000, "SAME_AS_26B"],
  ["gemma-4-26b-a4b-uncensored-ez", 4000, 24000, "SAME_AS_26B"],
  ["gemma-4-31b-qat", 20000, 24000,
    ["dgpu-vram16|ram32", "dgpu-vram16|ram64", "dgpu-vram24|ram32", "dgpu-vram24|ram64", "igpu-mem32"]],
  ["qwen3.6-27b", 20000, 24000, "SAME_AS_31B"],
  ["glm-4.5-air", 12000, 64000,
    ["dgpu-vram12|ram64", "dgpu-vram16|ram64", "dgpu-vram24|ram64"]],
  ["llama-3.3-70b-q4_k_m", 46000, 48000, ["dgpu-vram24|ram64"]],
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
    expect(CLASSES.filter((c) => modelBelongsToClass(46000, 48000, c))
      .map((c) => c.classKey)).toEqual(["dgpu-vram24|ram64"]);
  });

  it("unknown floors claim nothing (a hand-added model with blank requirements)", () => {
    for (const c of CLASSES) {
      expect(modelBelongsToClass(0, 24000, c)).toBe(false);
      expect(modelBelongsToClass(4000, 0, c)).toBe(false);
      expect(modelBelongsToClass(null, null, c)).toBe(false);
    }
  });

  it("RAM is a hard gate — no VRAM headroom compensates", () => {
    // 26B-class floors on a 16 GB-RAM box: out, even beside a 24 GB card.
    expect(modelBelongsToClass(4000, 24000, C("x", "discrete", 24, 16))).toBe(false);
  });

  it("VRAM allows exactly fit's 1.5x tight slack", () => {
    const cls = C("x", "discrete", 8, 32);
    expect(modelBelongsToClass(8192 * 1.5, 12000, cls)).toBe(true);   // boundary in
    expect(modelBelongsToClass(8192 * 1.5 + 1, 12000, cls)).toBe(false); // boundary out
  });
});

describe("memberClassesOf display order + shortClassLabel", () => {
  it("orders discrete by VRAM then RAM, integrated last", () => {
    const got = memberClassesOf(4000, 24000, CLASSES).map(shortClassLabel);
    expect(got).toEqual(["8|32", "12|32", "12|64", "16|32", "16|64", "24|32", "24|64", "iGPU 32"]);
  });
});
