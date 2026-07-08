// The KIT testData registry (§7.3 B4-4) — mergeVariables is the ONE fill
// implementation behind the Lab's Sample button and Insert-from pickers.
// Checker-caught 2026-07-08: this had no unit test while a name-mismatch bug
// shipped twice; these cases lock the contract.
import { beforeEach, describe, expect, it } from "vitest";

import {
  configureTestData,
  mergeVariables,
  sourceCanFill,
  testDataSources,
} from "@delebash/llm-ui/common/services/testData.js";

describe("mergeVariables", () => {
  it("fills exact-name matches and ignores extras", () => {
    const vars = { passage: "", voiceCanon: "" };
    const n = mergeVariables(vars, { passage: "P", voiceCanon: "V", user_content: "ignored" });
    expect(n).toBe(2);
    expect(vars).toEqual({ passage: "P", voiceCanon: "V" });
  });

  it("bridges a single incoming value into a single differently-named var", () => {
    const vars = { user_content: "" };
    expect(mergeVariables(vars, { text: "T" })).toBe(1);
    expect(vars.user_content).toBe("T");
  });

  it("does NOT bridge when either side has multiple names", () => {
    const vars = { passage: "", voiceCanon: "" };
    expect(mergeVariables(vars, { text: "T" })).toBe(0); // 2 prompt vars, 1 incoming, no match
    const one = { user_content: "" };
    expect(mergeVariables(one, { a: "1", b: "2" })).toBe(0); // 2 incoming, no match
  });

  it("a multi-name payload still fills by exact match on multi-var prompts", () => {
    const vars = { passage: "", voiceCanon: "" };
    const n = mergeVariables(vars, { passage: "P", user_content: "U" });
    expect(n).toBe(1);
    expect(vars.passage).toBe("P");
  });
});

// QC-9 (queue §9): a picker renders only when its source can fill one of the
// open prompt's boxes — mirrors mergeVariables (exact names + the 1×1 bridge).
describe("sourceCanFill", () => {
  const chapters = { id: "chapters", provides: ["passage", "user_content", "chapter_text", "chapter_label"] };
  const characters = { id: "characters", provides: ["user_content"] };

  it("offers a source when an exact-name fill exists on a multi-var prompt", () => {
    expect(sourceCanFill(chapters, ["passage", "voiceCanon"])).toBe(true);
  });

  it("hides a source that cannot fill any box (the QC-9 case: character info on generate prose)", () => {
    expect(sourceCanFill(characters, ["passage", "voiceCanon"])).toBe(false);
  });

  it("offers a single-name source on a single-var prompt via the bridge", () => {
    expect(sourceCanFill(characters, ["text"])).toBe(true);
    expect(sourceCanFill(characters, ["user_content"])).toBe(true);
  });

  it("does NOT bridge a multi-name source onto a no-match single-var prompt", () => {
    expect(sourceCanFill(chapters, ["question"])).toBe(false);
  });

  it("always offers a source that declares no provides list (undeclared hosts keep the old behavior)", () => {
    expect(sourceCanFill({ id: "legacy" }, ["passage"])).toBe(true);
    expect(sourceCanFill({ id: "legacy", provides: [] }, ["passage"])).toBe(true);
  });
});

describe("configureTestData", () => {
  beforeEach(() => configureTestData({ sources: [] }));

  it("registers and returns host sources; empty registry stays empty", () => {
    expect(testDataSources()).toEqual([]);
    const src = { id: "chapters", label: "chapter", kind: "chapter", list: () => [], fetch: () => ({}) };
    configureTestData({ sources: [src] });
    expect(testDataSources()).toHaveLength(1);
    expect(testDataSources()[0].id).toBe("chapters");
  });
});
