// The KIT downloadRate helper (DL-1) — the sliding-window rate tracker feeding
// speed + ETA on the engine-install and model-download progress bars. Pure
// logic with an injectable clock, imported REAL via the alias subpath (the
// embedApi.test.js precedent); no transport involved.
import { describe, expect, it } from "vitest";

import {
  createRateTracker,
  fmtBytes,
  fmtEta,
  fmtSpeed,
  progressCaption,
  rateSuffix,
} from "@delebash/llm-ui/common/services/downloadRate.js";

const MB = 1024 * 1024;

function trackerAt(startMs = 0, opts = {}) {
  let t = startMs;
  const tracker = createRateTracker({ now: () => t, ...opts });
  return {
    tracker,
    tick: (ms, bytes) => {
      t += ms;
      return tracker.update(bytes);
    },
  };
}

describe("createRateTracker", () => {
  it("needs two samples, then reports delta/time", () => {
    const { tracker, tick } = trackerAt();
    expect(tick(0, 0)).toBe(0); // first sample — no rate yet
    expect(tick(1000, 5 * MB)).toBe(5 * MB); // 5 MB over 1 s
    expect(tracker.speed()).toBe(5 * MB);
  });

  it("smooths over the window and drops samples older than windowMs", () => {
    const { tick } = trackerAt(0, { windowMs: 2000 });
    tick(0, 0);
    tick(1000, 10 * MB); // fast early
    tick(1000, 11 * MB);
    // Window is 2000 ms: the t=0 sample falls out; rate covers t=1000→3000.
    const speed = tick(1000, 12 * MB);
    expect(speed).toBe(1 * MB); // (12-10) MB over 2 s
  });

  it("resets on a byte regression (a new file/phase started)", () => {
    const { tick } = trackerAt();
    tick(0, 50 * MB);
    tick(800, 58 * MB);
    expect(tick(800, 2 * MB)).toBe(0); // regression → fresh window, no rate yet
    expect(tick(800, 4 * MB)).toBe(2.5 * MB); // 2 MB over 0.8 s, new file only
  });

  it("reset() clears the window", () => {
    const { tracker, tick } = trackerAt();
    tick(0, 0);
    tick(1000, MB);
    tracker.reset();
    expect(tracker.speed()).toBe(0);
  });
});

describe("formatters", () => {
  it("fmtSpeed picks sane units", () => {
    expect(fmtSpeed(0)).toBe("");
    expect(fmtSpeed(512)).toBe("1 KB/s"); // floor at 1 KB/s, never "0 KB/s"
    expect(fmtSpeed(200 * 1024)).toBe("200 KB/s");
    expect(fmtSpeed(5.5 * MB)).toBe("5.5 MB/s");
    expect(fmtSpeed(38 * MB)).toBe("38 MB/s");
    expect(fmtSpeed(2048 * MB)).toBe("2.0 GB/s");
  });

  it("fmtEta rounds honestly by scale", () => {
    expect(fmtEta(0)).toBe("");
    expect(fmtEta(Number.NaN)).toBe("");
    expect(fmtEta(3)).toBe("a few seconds left");
    expect(fmtEta(47)).toBe("~45s left");
    expect(fmtEta(120)).toBe("~2m left");
    expect(fmtEta(89 * 60)).toBe("~89m left");
    expect(fmtEta(3 * 3600)).toBe("~3.0h left");
  });

  it("fmtBytes matches the composables' historical output", () => {
    expect(fmtBytes(0)).toBe("");
    expect(fmtBytes(500 * MB)).toBe("500 MB");
    expect(fmtBytes(2 * 1024 * MB)).toBe("2.0 GB");
  });

  it("rateSuffix composes speed and ETA, and hides when unknown", () => {
    expect(rateSuffix(0, 0, 0)).toBe("");
    expect(rateSuffix(5 * MB, 100 * MB, 0)).toBe(" · 5.0 MB/s"); // unknown total → no ETA
    expect(rateSuffix(5 * MB, 100 * MB, 700 * MB)).toBe(" · 5.0 MB/s · ~2m left");
  });
});

describe("progressCaption", () => {
  it("builds phase · done / total + the rate suffix (the shared bar caption)", () => {
    expect(progressCaption("Downloading the model", 500 * MB, 4200 * MB, " · 22 MB/s · ~2m left"))
      .toBe("Downloading the model · 500 MB / 4.1 GB · 22 MB/s · ~2m left");
  });
  it("drops the total when it is unknown, and is bare phase with no bytes", () => {
    expect(progressCaption("Loading it into your graphics card", 0, 0)).toBe("Loading it into your graphics card");
    expect(progressCaption("Working", 90 * MB, 0)).toBe("Working · 90 MB");
  });
});
