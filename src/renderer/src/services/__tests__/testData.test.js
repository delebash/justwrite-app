// The KIT testData registry (§7.3 B4-4) — mergeVariables is the ONE fill
// implementation behind the Lab's Sample button and Insert-from pickers.
// Checker-caught 2026-07-08: this had no unit test while a name-mismatch bug
// shipped twice; these cases lock the contract.
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  configureTestData,
  mergeVariables,
  sourceCanFill,
  testDataSources,
} from "@delebash/llm-ui/common/services/testData.js";

vi.mock("../../stores/project", () => ({
  useProjectStore: () => ({
    allChapters: [{ id: "ch1", title: "Ch 1" }],
    scenes: { ch1: [{ body: "<p>Sea text</p>" }] },
    characters: [{ id: "c1", name: "Mira", role: "archivist", description: "guarded", notes: "" }],
    locations: [{ id: "l1", name: "Harbor", description: "salt and rope" }],
  }),
}));

import { LAB_TEST_SOURCES } from "../labTestData.js";

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

// QC-24 (2026-07-09, "character chat has no data to insert" + "the other[s] may
// not have correct insert from pickers"): the JW sources must cover the chat
// features' variables, and every declared `provides` name must actually be
// emitted by fetch() (the lockstep the chapters comment demands).
describe("LAB_TEST_SOURCES (QC-24 coverage)", () => {
  const byId = Object.fromEntries(LAB_TEST_SOURCES.map((s) => [s.id, s]));

  // The chapters source strips TipTap HTML via a detached DOM node; the vitest
  // environment is node (no document) — a minimal tag-stripping stand-in.
  beforeEach(() => {
    globalThis.document = {
      createElement: () => ({
        _t: "",
        set innerHTML(html) { this._t = String(html || "").replace(/<[^>]*>/g, ""); },
        get textContent() { return this._t; },
      }),
    };
  });

  it("keeps every source's provides list in lockstep with fetch()'s emitted names", () => {
    const firstId = { chapters: "ch1", characters: "c1", locations: "l1" };
    for (const src of LAB_TEST_SOURCES) {
      const emitted = Object.keys(src.fetch(firstId[src.id]).variables);
      for (const name of src.provides) expect(emitted, `${src.id} emits ${name}`).toContain(name);
    }
  });

  it("offers the character picker on In-character chat's exact variables and fills them", () => {
    const vars = ["question", "excerpts", "characterName", "characterProfile"];
    expect(sourceCanFill(byId.characters, vars)).toBe(true);
    const got = byId.characters.fetch("c1").variables;
    expect(got.characterName).toBe("Mira");
    expect(got.characterProfile).toContain("archivist");
  });

  it("offers the chapter picker on the chat features' {question, excerpts} and fills excerpts", () => {
    expect(sourceCanFill(byId.chapters, ["question", "excerpts"])).toBe(true);
    expect(byId.chapters.fetch("ch1").variables.excerpts).toBe("Sea text");
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
