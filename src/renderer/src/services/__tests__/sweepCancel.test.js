// @vitest-environment jsdom
//
// (jsdom, not node: the sweep's stripText() parses chapter HTML with
// document.createElement — and it runs OUTSIDE processChapter's try, so under node
// every chapter throws "document is not defined" before a single progress event.)
//
// CANCEL MUST CANCEL EVERYTHING (user, 2026-07-17) — the entity sweep's pooled
// cancellation contract. This path shipped broken and nothing executed it:
//
//   1. EntitySweepModal called scanAllChapters WITHOUT a `signal`, so every
//      `signal?.aborted` check inside the pool was permanently undefined → cancel
//      never stopped the workers; they kept pulling chapters after the user cancelled.
//   2. Cancellation was detected by SNIFFING the error message for /abort/i — but a
//      cancelled call reads "Couldn't reach the LLM. Request cancelled." (no "abort"),
//      so every in-flight chapter rendered as a red ERROR row for a user-requested stop.
//   3. Each chapter registered its OWN task (entityExtraction.js `task: task || {…}`),
//      so a 4-wide pool made four rival "entitySweep" entries and the modal's Cancel —
//      `runningTasks.find(...)` — reached only the FIRST. QC-31 (aiTasks.js:124-128)
//      names the correct shape: ONE task entry per user action, whose handle owns the
//      ONE controller every sub-call rides.
//   4. Workers exit by RETURNING, so Promise.all resolves and scanAllChapters never
//      threw — the modal's catch-on-abort cleanup never ran and rows froze on
//      "scanning"/"pending" forever. Cancelled is now a RETURN VALUE (`cancelled: true`).
//
// The kit is imported REAL (subpath alias); only extractEntities is mocked, so the
// pool, the owner handle and the signal wiring all execute for real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../analysis/entityExtraction.js", () => ({ extractEntities: vi.fn() }));

import { extractEntities } from "../analysis/entityExtraction.js";
import { isLikelyNonStoryTitle, resolvePoolSize, scanAllChapters } from "../analysis/entitySweep.js";
import { useAiTasksStore } from "@delebash/llm-ui/stores/aiTasks.js";
import { useResolvedRoute } from "@delebash/llm-ui/composables/useResolvedRoute.js";

function projectWith(n) {
  const chapters = Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, num: i + 1, title: `Chapter ${i + 1}` }));
  return {
    allChapters: chapters,
    chapterBody: Object.fromEntries(chapters.map((c) => [c.id, `<p>Body of ${c.title}. Real prose here.</p>`])),
    characters: [], locations: [], objects: [],
  };
}
const NOTHING = { characters: [], locations: [], objects: [] };

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("scanAllChapters — cancel stops EVERYTHING", () => {
  it("registers ONE task for the whole sweep, not one per chapter (QC-31)", async () => {
    extractEntities.mockResolvedValue(NOTHING);
    const aiTasks = useAiTasksStore();
    await scanAllChapters({ project: projectWith(8), concurrency: 4 });
    // Look in HISTORY, not `tasks`: a finished entry is archived and deleted
    // (_finish → _archiveAndRemove → `delete this.tasks[id]`), so a completed sweep
    // leaves `tasks` empty by design. Eight chapters across four workers used to mint
    // a rival entry per call — the reason Cancel only ever reached one of them.
    const sweepEntries = aiTasks.history.filter((t) => t.feature === "entitySweep");
    expect(sweepEntries).toHaveLength(1);
    // Every per-chapter call must opt OUT of its own entry.
    for (const call of extractEntities.mock.calls) expect(call[0].task).toBe(false);
  });

  it("aborting mid-sweep stops the pool — later chapters are never even attempted", async () => {
    const ac = new AbortController();
    let started = 0;
    extractEntities.mockImplementation(async () => {
      started += 1;
      if (started === 2) ac.abort(); // the user hits Cancel while chapter 2 is in flight
      return NOTHING;
    });
    const r = await scanAllChapters({ project: projectWith(20), concurrency: 1, signal: ac.signal });
    expect(r.cancelled).toBe(true);
    // THE BUG: with no signal threaded, the pool ran all 20 anyway.
    expect(started).toBeLessThan(20);
    expect(extractEntities).toHaveBeenCalledTimes(started);
  });

  it("a cancelled call is NOT an error row — even though its message says 'cancelled', not 'abort'", async () => {
    const ac = new AbortController();
    const phases = [];
    extractEntities.mockImplementation(async () => {
      ac.abort();
      // The real wording from the kit's friendly error — the string sniff can't see it.
      throw new Error("Couldn't reach the LLM. Request cancelled.");
    });
    const r = await scanAllChapters({
      project: projectWith(6), concurrency: 1, signal: ac.signal,
      onProgress: ({ phase }) => phases.push(phase),
    });
    expect(r.cancelled).toBe(true);
    expect(phases).not.toContain("error"); // the red rows the user photographed
    expect(r.skipped).toHaveLength(0);     // a cancel is not a per-chapter failure
  });

  it("cancelled is a RETURN VALUE, not a throw — the caller must be able to mark its rows", async () => {
    const ac = new AbortController();
    extractEntities.mockImplementation(async () => { ac.abort(); return NOTHING; });
    // Must not reject: workers return, Promise.all resolves. The old code relied on a
    // throw that never came, so the modal's cleanup never ran and rows froze.
    const r = await scanAllChapters({ project: projectWith(5), concurrency: 1, signal: ac.signal });
    expect(r.cancelled).toBe(true);
    expect(r).toHaveProperty("characters");
  });

  it("partial proposals survive a cancel (whatever came back is still reviewable)", async () => {
    const ac = new AbortController();
    let n = 0;
    extractEntities.mockImplementation(async () => {
      n += 1;
      if (n === 3) ac.abort();
      return { characters: [{ name: `Found ${n}`, role: "", oneLiner: "", evidence: "" }], locations: [], objects: [] };
    });
    const r = await scanAllChapters({ project: projectWith(10), concurrency: 1, signal: ac.signal });
    expect(r.cancelled).toBe(true);
    expect(r.characters.length).toBeGreaterThan(0);
  });

  it("an uncancelled sweep still completes every chapter and reports not-cancelled", async () => {
    extractEntities.mockResolvedValue(NOTHING);
    const r = await scanAllChapters({ project: projectWith(7), concurrency: 3 });
    expect(r.cancelled).toBe(false);
    expect(extractEntities).toHaveBeenCalledTimes(7);
    expect(r.scanned).toBe(7);
  });

  it("a REAL failure is still an error row — the cancel fix must not swallow genuine errors", async () => {
    extractEntities.mockRejectedValue(new Error("model exploded"));
    const phases = [];
    const r = await scanAllChapters({
      project: projectWith(3), concurrency: 1,
      onProgress: ({ phase }) => phases.push(phase),
    });
    expect(r.cancelled).toBe(false);
    expect(phases).toContain("error");
    expect(r.skipped).toHaveLength(3);
  });
});

// D (2026-07-18): the default tick state of the sweep's chapter picker. The
// real Broken Eye run scanned the Glossary, praise pages, and the next book's
// preview chapters — junk proposals ("The Broken Eye (Book)" from the praise
// page) plus wasted minutes. The heuristic only picks a DEFAULT — nothing is
// excluded without being visible in the list.
describe("isLikelyNonStoryTitle — the picker's default tick", () => {
  it("unticks the observed front/back matter from the real import", () => {
    for (const t of [
      "Acknowledgments", "Acknowledgements", "Glossary", "Appendix", "Extras",
      "Meet the Author", "About the Author", "Also by Brent Weeks",
      "Praise for Brent Weeks", "A Preview of \"The Blood Mirror\"",
      "A Preview of \"Gods of the Wyrdwood\"", "The story continues in…",
      "Character List", "Dramatis Personae", "Copyright", "Dedication",
      "Contents", "Table of Contents", "Title Page",
    ]) {
      expect(isLikelyNonStoryTitle(t), t).toBe(true);
    }
  });

  it("keeps real story chapters ticked — including lowercase and framing titles", () => {
    for (const t of [
      "Chapter 1", "Epilogue 1", "Prologue", "the slate board waits", // lowercase-entity proof
      "What They Carried Out", "", "Untitled", null,
    ]) {
      expect(isLikelyNonStoryTitle(t), String(t)).toBe(false);
    }
  });
});

// C2 (2026-07-18): the pool is provider-aware. Against the single-slot built-in
// server a 4-wide pool parked 3 requests in its queue while their rows showed
// "scanning" — observed on the real 114-chapter run as a row "SCANNING" 10+
// minutes of pure queue-wait. Built-in local → 1 worker (zero throughput loss),
// online providers keep 4, an explicit argument always wins.
describe("resolvePoolSize — provider-aware pool (C2)", () => {
  function stubRoute(row, { fail = false } = {}) {
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (String(url).includes("/v1/ai/resolved-route")) {
        if (fail) return { ok: false, status: 500, headers: { get: () => "" }, text: async () => "boom" };
        return {
          ok: true, status: 200,
          headers: { get: (k) => (k.toLowerCase() === "content-type" ? "application/json" : "") },
          json: async () => row, text: async () => JSON.stringify(row),
        };
      }
      return { ok: true, status: 200, headers: { get: () => "" }, json: async () => ({}), text: async () => "{}" };
    }));
  }

  beforeEach(() => {
    useResolvedRoute().invalidateRoutes(); // the kit cache is module-level — drop it per case
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("an explicit concurrency argument wins without touching the route endpoint", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await resolvePoolSize({ concurrency: 2 })).toBe(2);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a provider-object override decides directly — local built-in gets 1 worker", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await resolvePoolSize({ provider: { id: "local-llamacpp" } })).toBe(1);
    expect(await resolvePoolSize({ provider: { id: "gemini" } })).toBe(4);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("with nothing passed, the resolved route decides: built-in local → 1", async () => {
    stubRoute({ providerId: "local-llamacpp", model: "gemma-4-26b-a4b-qat" });
    expect(await resolvePoolSize()).toBe(1);
  });

  it("with nothing passed, an online route keeps the 4-wide pool", async () => {
    stubRoute({ providerId: "gemini", model: "gemini-2.5-flash" });
    expect(await resolvePoolSize()).toBe(4);
  });

  it("an unreachable route endpoint falls back to the old default — the sweep must never block on it", async () => {
    stubRoute(null, { fail: true });
    expect(await resolvePoolSize()).toBe(4);
  });
});
