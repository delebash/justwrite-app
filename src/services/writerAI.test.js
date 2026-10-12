// @vitest-environment jsdom
// The writer actions' variables (slice 2, 2026-10-11, the AI drafting plan Task 13): the prose
// actions always send {{storyContext}} — "" when the scene has nothing (the kit's prompt render
// rejects a missing variable with a 400; an empty one is a legitimate "nothing here") — under its
// STORY CONTEXT heading when there is some; the line edits never send it (spec §9.5).
import { beforeEach, describe, expect, it, vi } from "vitest";

const runAiFeatureStream = vi.fn(async () => ({ content: "Out.", usage: null }));
vi.mock("@delebash/llm-ui", () => ({ runAiFeatureStream: (...a) => runAiFeatureStream(...a) }));
vi.mock("../stores/project.js", () => ({ useProjectStore: () => ({}) }));
vi.mock("./voiceFingerprint.js", () => ({ buildVoiceFingerprint: () => ({ block: "" }) }));

const writerAI = await import("./writerAI.js");
const sent = () => runAiFeatureStream.mock.calls.at(-1)[0];

beforeEach(() => runAiFeatureStream.mockClear());

describe("the prose actions", () => {
  it("send an empty story context when the scene has nothing — never leave it out", async () => {
    for (const fn of [writerAI.rewrite, writerAI.expand, writerAI.tighten, writerAI.continueFrom, writerAI.describe]) {
      await fn({ html: "<p>The door gave.</p>" });
      expect(sent().variables.storyContext).toBe("");
    }
    await writerAI.guidedContinue({ html: "<p>The door gave.</p>", instruction: "She hesitates." });
    expect(sent().variables.storyContext).toBe("");
  });

  it("send the scene's context under its heading, after a blank line", async () => {
    await writerAI.continueFrom({ html: "<p>The door gave.</p>", storyContext: "## Premise\nA mapmaker charts a forbidden coast." });
    expect(sent().action).toBe("writerAI.continue");
    expect(sent().variables.storyContext).toBe("\n\nSTORY CONTEXT\n## Premise\nA mapmaker charts a forbidden coast.");
  });
});

describe("the line edits", () => {
  it("send no story context", async () => {
    await writerAI.applyRule("passive-voice", { html: "<p>The door was opened.</p>", storyContext: "## Premise\nx" });
    expect("storyContext" in sent().variables).toBe(false);
  });
});
