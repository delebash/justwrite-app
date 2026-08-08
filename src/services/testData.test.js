// The KIT testData registry + JW's per-action declaration table (§7.3 B4-4,
// rebuilt per QC-35 2026-07-09). These cases lock the QC-35 contract: merge is
// EXACT-NAME only (the 1×1 bridge is deleted), every one of the 37 seeded
// actions is declared, and each group's fills emit that group's prompt
// variables in the run path's shape (header "\n\n", passage grain, cited
// excerpts, composer output).
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  configureTestData,
  mergeVariables,
  testDataAction,
  testDataSources,
} from "@delebash/llm-ui/common/services/testData.js";

// labTestData pulls the run-path composers, which import the kit's run
// wrappers — stub them (no LLM calls in a unit test) and the stores.
vi.mock("@delebash/llm-ui", () => ({
  runAiFeature: vi.fn(),
  runAiFeatureStream: vi.fn(),
  embedTexts: vi.fn(),
  friendlyAiError: (e) => e,
  useAiTasksStore: () => ({ start: () => ({ setProgress() {}, finish() {}, cancel() {}, signal: { aborted: false } }) }),
}));

const CH1_BODY = "<p>Mira found the torn page in her father's coat.</p>";
const CH1_SCENE2 = "<p>The brass key turned, but the door was already unlatched.</p>";

vi.mock("../stores/project", () => ({
  useProjectStore: () => ({
    allChapters: [
      { id: "ch1", num: 1, title: "The Ledger", words: 40, readerKnowledge: { newReaderFacts: ["The page is torn."], newPovFacts: [] } },
      { id: "ch2", num: 2, title: "Before the Funeral", words: 40 },
    ],
    chapterBody: { ch1: CH1_BODY, ch2: CH1_SCENE2 },
    scenesFor: (id) =>
      id === "ch1"
        ? [{ title: "The Torn Page", body: CH1_BODY, characters: ["c1"] }, { title: "", body: CH1_SCENE2, characters: [] }]
        : [{ title: "", body: CH1_SCENE2, characters: ["c1"] }],
    scenes: {},
    characters: [{ id: "c1", name: "Mira", role: "archivist", main: true }],
    characterExtras: {},
    locations: [],
    objects: [],
    strands: [],
    project: { title: "The Salt Ledger", genre: "Mystery", premise: "" },
    worldRules: "",
  }),
}));
vi.mock("../stores/sessions.js", () => ({
  useSessionsStore: () => ({ todayChapterId: null, lastWrite: null, todayWords: 0 }),
}));

// The chapters fills strip TipTap HTML via a detached DOM node; the vitest
// environment is node (no document) — a minimal stand-in with the query API
// the run-path stripping uses.
beforeEach(() => {
  globalThis.document = {
    createElement: () => ({
      _t: "",
      set innerHTML(html) { this._t = String(html || "").replace(/<[^>]*>/g, ""); },
      get textContent() { return this._t; },
      querySelectorAll: () => [],
    }),
  };
});

import { LAB_TEST_ACTIONS, LAB_TEST_SOURCES } from "./labTestData.js";

describe("mergeVariables (QC-35: exact-name only)", () => {
  it("fills exact-name matches and ignores extras", () => {
    const vars = { passage: "", voiceCanon: "" };
    const n = mergeVariables(vars, { passage: "P", voiceCanon: "V", user_content: "ignored" });
    expect(n).toBe(2);
    expect(vars).toEqual({ passage: "P", voiceCanon: "V" });
  });

  it("does NOT bridge a single incoming value onto a differently-named var (the deleted 1×1 bridge)", () => {
    const vars = { user_content: "" };
    expect(mergeVariables(vars, { text: "T" })).toBe(0);
    expect(vars.user_content).toBe("");
  });
});

describe("configureTestData + testDataAction", () => {
  beforeEach(() => configureTestData({ sources: [], actions: {} }));

  it("registers sources and per-action declarations; undeclared actions return null", () => {
    expect(testDataSources()).toEqual([]);
    const decl = { samples: ["A"] };
    configureTestData({ sources: [{ id: "chapters", label: "chapter", kind: "chapter", list: () => [] }], actions: { critique: decl } });
    expect(testDataSources()).toHaveLength(1);
    expect(testDataAction("critique")).toBe(decl);
    expect(testDataAction("somethingElse")).toBeNull();
  });
});

// The QC-35 whole-job check: every seeded action key is declared with its
// group's affordances. The key list mirrors DEFAULT_FEATURE_PROMPTS
// (seed_feature_prompts.py — 37 keys: A=7, B=13, C=11, D=4, E=2).
const A_GROUP = ["critique", "critiqueStructure", "foreshadowing", "multiReaderGenre", "multiReaderLiterary", "multiReaderAgent", "multiReaderBookClub"];
const B_GROUP = [
  "writerAI.rewrite", "writerAI.expand", "writerAI.tighten", "writerAI.continue", "writerAI.describe", "writerAI.guided-continue",
  "writerAI.rule.show-dont-tell", "writerAI.rule.passive-voice", "writerAI.rule.filter-words", "writerAI.rule.dialogue-tags",
  "writerAI.rule.sensory-grounding", "writerAI.rule.sentence-variety", "writerAI.rule.prose-tightening",
];
const C_PICKER = ["readerKnowledge", "entitySweep", "characterAudit", "voiceDrift"];
const C_COMPOSE = ["plotHoles", "beatSheet", "reverseOutline", "marketingPack", "recap", "briefing"];
const SAMPLE_ONLY = ["relationshipArc", "brainstorm", "brainstormPlot", "sensory"];
const ALL_37 = [...A_GROUP, ...B_GROUP, ...C_PICKER, ...C_COMPOSE, ...SAMPLE_ONLY, "unstuck", "chat", "characterChat"];

describe("LAB_TEST_ACTIONS (the QC-35 per-action table)", () => {
  it("declares all 37 seeded actions, each with at least one sample label", () => {
    expect(ALL_37).toHaveLength(37);
    for (const key of ALL_37) {
      expect(LAB_TEST_ACTIONS[key], `${key} declared`).toBeTruthy();
      expect(LAB_TEST_ACTIONS[key].samples?.length, `${key} has samples`).toBeGreaterThan(0);
    }
    expect(Object.keys(LAB_TEST_ACTIONS)).toHaveLength(37);
  });

  it("the location picker is gone (no source, no declaration references it)", () => {
    expect(LAB_TEST_SOURCES.map((s) => s.id)).toEqual(["chapters", "characters"]);
    for (const d of Object.values(LAB_TEST_ACTIONS)) {
      for (const p of d.pickers || []) expect(["chapters", "characters"]).toContain(p.source);
    }
  });

  it("A-group fills emit the run header (trailing blank line) + the chapter prose", () => {
    const fill = LAB_TEST_ACTIONS.critique.pickers[0].fill("ch1");
    expect(fill.chapter_label).toBe("Chapter 1 — The Ledger\n\n");
    expect(fill.chapter_text).toContain("torn page");
    expect(fill.chapter_text).toContain("brass key"); // whole chapter, both scenes
  });

  it("B-group fills are PASSAGE grain — the first non-empty scene, not the whole chapter", () => {
    const fill = LAB_TEST_ACTIONS["writerAI.continue"].pickers[0].fill("ch1");
    expect(fill.passage).toContain("torn page");
    expect(fill.passage).not.toContain("brass key"); // scene 2 stays out
    expect(fill).toHaveProperty("voiceCanon"); // the same variable a real run sends
  });

  it("unstuck fills the chapter tail in the run's BEGIN/END PROSE frame", () => {
    const fill = LAB_TEST_ACTIONS.unstuck.pickers[0].fill("ch1");
    expect(fill.user_content).toContain("--- BEGIN PROSE (writer is stuck at the end of this) ---");
    expect(fill.user_content).toContain("--- END PROSE ---");
  });

  it("entitySweep runs its composer — the bible block + the framed chapter", () => {
    const fill = LAB_TEST_ACTIONS.entitySweep.pickers[0].fill("ch1");
    expect(fill.user_content).toContain("Already in the story bible — DO NOT re-propose:");
    expect(fill.user_content).toContain("Characters: Mira");
    expect(fill.user_content).toContain("--- BEGIN CHAPTER ---");
  });

  it("readerKnowledge accumulates PERSISTED prior facts for the picked chapter", () => {
    const fill = LAB_TEST_ACTIONS.readerKnowledge.pickers[0].fill("ch2");
    expect(fill.user_content).toContain("READER ALREADY KNOWS (going in):");
    expect(fill.user_content).toContain("- The page is torn."); // ch1's persisted result
    const first = LAB_TEST_ACTIONS.readerKnowledge.pickers[0].fill("ch1");
    expect(first.user_content).toContain("(nothing — first chapter"); // honest empty state
  });

  it("characterAudit runs its composer over the picked character's scenes", () => {
    const fill = LAB_TEST_ACTIONS.characterAudit.pickers[0].fill("c1");
    expect(fill.user_content).toContain("CHARACTER PROFILE");
    expect(fill.user_content).toContain("Name: Mira");
    expect(fill.user_content).toContain("SCENES FEATURING THIS CHARACTER");
  });

  it("chat's chapter fill emits excerpts in the run formatter's cited [1]/[2] shape", () => {
    const fill = LAB_TEST_ACTIONS.chat.pickers[0].fill("ch1");
    expect(fill.excerpts).toMatch(/^\[1\] Ch\. 1 "The Ledger", scene "The Torn Page":\n/);
    expect(fill.excerpts).toContain('[2] Ch. 1 "The Ledger", scene 2:');
  });

  it("characterChat adds the character picker sending the run's own profile block", () => {
    const pickers = LAB_TEST_ACTIONS.characterChat.pickers;
    expect(pickers.map((p) => p.source)).toEqual(["chapters", "characters"]);
    const fill = pickers[1].fill("c1");
    expect(fill.characterName).toBe("Mira");
    expect(fill.characterProfile).toContain("Role: archivist");
  });

  it("the six book-digest actions declare the compose button; sample-only actions declare neither pickers nor compose", () => {
    for (const key of C_COMPOSE) {
      expect(LAB_TEST_ACTIONS[key].compose?.run, `${key} composes`).toBeTypeOf("function");
      expect(LAB_TEST_ACTIONS[key].pickers, `${key} has no dropdown`).toBeUndefined();
    }
    for (const key of SAMPLE_ONLY) {
      expect(LAB_TEST_ACTIONS[key].pickers, `${key} has no pickers`).toBeUndefined();
      expect(LAB_TEST_ACTIONS[key].compose, `${key} has no compose`).toBeUndefined();
    }
  });

  it("a compose button surfaces its composer's honest refusal on a thin book", () => {
    // The mocked project has 2 chapters; plotHoles needs 3.
    expect(() => LAB_TEST_ACTIONS.plotHoles.compose.run()).toThrow(/three chapters/i);
  });
});
