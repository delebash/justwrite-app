// A finished AI task carries how long it ran while it lingers, not only once it reaches history
// (2026-10-11). The chapter footer's "… — done in {s}s" reads the lingering task first
// (ChaptersPage.vue aiNotice), and a lingering task had no durationMs — the kit added it only on
// archiving — so the footer read "done in NaNs" for the linger's 5 s after every AI action.
// The kit's store is imported real (subpath alias), as sweepCancel.test.js does.
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAiTasksStore } from "@delebash/ui/stores/aiTasks.js";

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const lingering = (store, id) => store.visibleTasks.find((t) => t.id === id);

describe("a task that has ended, while it lingers", () => {
  for (const [outcome, end] of [
    ["done", (h) => h.finish({})],
    ["error", (h) => h.fail(new Error("model failed"))],
    ["cancelled", (h) => h.cancel()],
  ]) {
    it(`carries its duration (${outcome})`, () => {
      const store = useAiTasksStore();
      const h = store.start({ feature: "writerAI", label: "Writer assist · Continue" });
      vi.advanceTimersByTime(1800);
      end(h);
      const t = lingering(store, h.id);
      expect(t.status).toBe(outcome);
      expect(t.durationMs).toBe(1800);
    });
  }

  it("keeps the same duration in history", () => {
    const store = useAiTasksStore();
    const h = store.start({ feature: "writerAI", label: "Writer assist · Continue" });
    vi.advanceTimersByTime(2400);
    h.finish({});
    vi.advanceTimersByTime(60_000); // past any linger
    expect(store.history.find((t) => t.id === h.id)?.durationMs).toBe(2400);
  });
});
