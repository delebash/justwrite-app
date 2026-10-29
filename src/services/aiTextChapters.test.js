// @vitest-environment jsdom
// AI-written words chapter by chapter (2026-10-28): the chapters with marked words, in book order,
// each with its own word count; a chapter with none is left out. jsdom: the count reads HTML.
import { describe, expect, it } from "vitest";
import { bookAiWrittenWords, chapterAiWrittenWords } from "./aiText.js";

const ai = (words) => `<span data-ai-text="">${words}</span>`;

describe("AI-written words by chapter", () => {
  it("lists each chapter with marked words, in book order, with the chapter's own count", () => {
    const project = {
      allChapters: [
        { id: "ch1", num: 1, title: "Arrival", words: 100 },
        { id: "ch2", num: 2, title: "", words: 50 },
        { id: "ch3", num: 3, title: "The crossing", words: 200 },
      ],
      scenes: {
        ch1: [{ body: `<p>Mine. ${ai("four AI written words")}</p>` }, { body: `<p>${ai("two more")}</p>` }],
        ch2: [{ body: "<p>All mine.</p>" }],
        ch3: [{ body: `<p>${ai("one")}</p>` }],
      },
    };
    expect(chapterAiWrittenWords(project)).toEqual([
      { chapterId: "ch1", num: 1, title: "Arrival", ai: 6, words: 100 },
      { chapterId: "ch3", num: 3, title: "The crossing", ai: 1, words: 200 },
    ]);
    expect(bookAiWrittenWords(project)).toBe(7);
  });

  it("is empty for a book with no marked words", () => {
    expect(chapterAiWrittenWords({ allChapters: [{ id: "ch1", num: 1, words: 9 }], scenes: { ch1: [{ body: "<p>x</p>" }] } })).toEqual([]);
    expect(chapterAiWrittenWords(null)).toEqual([]);
  });
});
