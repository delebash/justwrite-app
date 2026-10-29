import { describe, expect, it } from "vitest";
import { paceSeries } from "./analysis.js";

describe("the pace chart's trend", () => {
  it("runs through the finished days only — today, the last day, is still being written", () => {
    // 100, 200, 300, 400 a day, then 5 words so far today
    expect(paceSeries([100, 200, 300, 400, 5]).trend).toEqual({ from: 100, to: 400 });
  });

  it("never reads below 0 words a day", () => {
    // a big first day and nothing since: the line falls below zero by the end
    expect(paceSeries([900, 0, 0, 0, 0]).trend).toEqual({ from: 630, to: 0 });
  });

  it("is absent while no finished day has words", () => {
    expect(paceSeries([0, 0, 0, 250]).trend).toBeNull();
    expect(paceSeries([300]).trend).toBeNull();
  });
});
