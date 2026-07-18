// #5 (2026-07-17) — the rate-relative stall classifier that replaced the absolute
// 3s/10s thresholds duplicated in AiTaskStrip.vue + AiStatusPanel.vue.
//
// The bug it fixes: on the user's box an entity sweep ran at ~2.6 tok/s (first token
// 47.9s), so healthy generation left multi-second gaps between tokens — and the old
// absolute "stalling at 3s" sat lit through the whole run. These pin that (a) a gap that
// WOULD have flagged under the old 3s is now "fresh", (b) the window self-scales to a
// genuinely slow stream's own mean gap, and (c) before a rate is measurable the generous
// floors apply, never the old 3s.
//
// The helper lives in the shared kit; imported REAL via the subpath alias.
import { describe, expect, it } from "vitest";

import { freshnessOf } from "@delebash/llm-ui/common/services/streamFreshness.js";

// A streaming task whose mean inter-token gap is `meanGapMs`, last token `agoMs` ago.
function task({ meanGapMs, deltas = 100, agoMs, first = 1000, status = "streaming" }) {
  const lastDeltaAt = first + meanGapMs * (deltas - 1);
  return {
    t: { status, firstDeltaAt: first, lastDeltaAt, deltaCount: deltas },
    now: lastDeltaAt + agoMs,
  };
}

describe("freshnessOf — rate-relative last-token freshness", () => {
  it("the bug: a fast stream's 4s gap (old '3s = stalling') is now fresh", () => {
    // 2.6 tok/s ≈ 385ms mean gap. A 4s silence is under the 8s floor → fresh.
    const { t, now } = task({ meanGapMs: 385, agoMs: 4000 });
    expect(freshnessOf(t, now)).toBe("fresh");
  });

  it("a fast stream still flags stalling / stuck once the silence is real", () => {
    const a = task({ meanGapMs: 385, agoMs: 9000 });
    expect(freshnessOf(a.t, a.now)).toBe("stalling"); // past the 8s floor
    const b = task({ meanGapMs: 385, agoMs: 26000 });
    expect(freshnessOf(b.t, b.now)).toBe("stuck"); // past the 25s floor
  });

  it("self-scales: a genuinely slow 0.2 tok/s stream tolerates a 15s gap", () => {
    // 5s mean gap → stall window = max(8s, 4×5s) = 20s. 15s (3× the mean) is healthy.
    const fresh = task({ meanGapMs: 5000, deltas: 11, agoMs: 15000 });
    expect(freshnessOf(fresh.t, fresh.now)).toBe("fresh");
    const stalling = task({ meanGapMs: 5000, deltas: 11, agoMs: 21000 });
    expect(freshnessOf(stalling.t, stalling.now)).toBe("stalling");
    const stuck = task({ meanGapMs: 5000, deltas: 11, agoMs: 41000 });
    expect(freshnessOf(stuck.t, stuck.now)).toBe("stuck"); // past max(25s, 8×5s)=40s
  });

  it("before a rate is measurable (< 2 deltas), the generous floors apply — never 3s", () => {
    const one = { status: "streaming", firstDeltaAt: 1000, lastDeltaAt: 1000, deltaCount: 1 };
    expect(freshnessOf(one, 1000 + 4000)).toBe("fresh"); // 4s → fresh (was "stalling")
    expect(freshnessOf(one, 1000 + 9000)).toBe("stalling"); // 9s → past the 8s floor
    expect(freshnessOf(one, 1000 + 26000)).toBe("stuck");
  });

  it("returns null when not streaming or no token has landed", () => {
    const done = task({ meanGapMs: 385, agoMs: 4000, status: "done" });
    expect(freshnessOf(done.t, done.now)).toBeNull();
    expect(freshnessOf({ status: "streaming", lastDeltaAt: 0, deltaCount: 0 }, 5000)).toBeNull();
    expect(freshnessOf(null, 5000)).toBeNull();
  });
});
