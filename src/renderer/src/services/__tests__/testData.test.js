// The KIT testData registry (§7.3 B4-4) — mergeVariables is the ONE fill
// implementation behind the Lab's Sample button and Insert-from pickers.
// Checker-caught 2026-07-08: this had no unit test while a name-mismatch bug
// shipped twice; these cases lock the contract.
import { beforeEach, describe, expect, it } from "vitest";

import {
  configureTestData,
  mergeVariables,
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
