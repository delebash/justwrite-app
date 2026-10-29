// The voice drift's sensitivity (2026-10-28): the book's own flag value, hot count and trend value,
// read from the book (driftSensitivity) — 1, 2 and 0.5 are the values the analysis always used.
import { describe, expect, it } from "vitest";
import { computeVoiceDrift, driftSensitivity } from "./voiceDrift.js";

const AS_BEFORE = { flagZ: 1, hotMeasures: 2, trendZ: 0.5 };

// six chapters; chapter 6 runs long sentences and long paragraphs, chapter 5 only long sentences
function rows() {
  const base = { words: 1000, dialogueRatio: 0.3, filterWordsPer1k: 5, adverbsPer1k: 4, passivePer1k: 2 };
  const sentence = [14, 15, 14, 15, 22, 24];
  const paragraph = [60, 62, 61, 60, 61, 110];
  return sentence.map((s, i) => ({ ...base, chapterId: `ch${i + 1}`, num: i + 1, title: "", avgSentenceLength: s, avgParagraphLength: paragraph[i] }));
}

describe("the voice drift's sensitivity", () => {
  it("reads the book's settings", () => {
    expect(driftSensitivity({ styleFlagZ: 1.5, styleHotMeasures: 3, styleTrendZ: 0.4 })).toEqual({ flagZ: 1.5, hotMeasures: 3, trendZ: 0.4 });
  });

  it("flags and heats as before at the old values", () => {
    const d = computeVoiceDrift(rows(), AS_BEFORE);
    expect(d.hotChapters.map((c) => c.chapterId)).toEqual(["ch6"]);
    expect(d.metrics.find((m) => m.key === "avgSentenceLength").outliers.map((o) => o.chapterId)).toEqual(["ch5", "ch6"]);
    expect(d.metrics.find((m) => m.key === "avgSentenceLength").trend.direction).toBe("rising");
  });

  it("follows the book's own values", () => {
    // one flagged metric makes a chapter hot
    expect(computeVoiceDrift(rows(), { ...AS_BEFORE, hotMeasures: 1 }).hotChapters.map((c) => c.chapterId).sort()).toEqual(["ch5", "ch6"]);
    // a wider band flags less: only chapter 6's paragraphs are that far out, so nothing is hot
    const wide = computeVoiceDrift(rows(), { ...AS_BEFORE, flagZ: 2 });
    expect(wide.metrics.find((m) => m.key === "avgSentenceLength").outliers).toEqual([]);
    expect(wide.hotChapters).toEqual([]);
    // a trend needs more movement to count
    expect(computeVoiceDrift(rows(), { ...AS_BEFORE, trendZ: 5 }).metrics.find((m) => m.key === "avgSentenceLength").trend.direction).toBe("flat");
  });
});
