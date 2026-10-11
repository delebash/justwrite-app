// The story-context share in the AI store (2026-10-11): read from the server-seeded `ai`
// section, never defaulted in code; saved with the rest of the section; a null never written
// back (it would block the server's seed from filling it).
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

let stored = {};
vi.mock("../services/settings.js", () => ({
  readSetting: (k) => stored[k],
  writeSetting: (k, v) => { stored[k] = v; },
}));
vi.mock("../services/providerBackend.js", () => ({ listProviders: () => [], refreshProviders: async () => {} }));
vi.mock("../services/routingBackend.js", () => ({ getRoutingPrefs: () => null, putRoutingPrefs: () => {} }));

const { useAiStore } = await import("./ai.js");

describe("storyContextShare", () => {
  beforeEach(() => {
    stored = {};
    setActivePinia(createPinia());
  });

  it("reads the seeded value", () => {
    stored.ai = { storyContextShare: 0.15 };
    expect(useAiStore().storyContextShare).toBe(0.15);
  });

  it("is null when the section was never seeded — no number in code", () => {
    expect(useAiStore().storyContextShare).toBeNull();
  });

  it("saves with the section and keeps autoRebuildRagIndex", () => {
    stored.ai = { autoRebuildRagIndex: true, storyContextShare: 0.15 };
    const ai = useAiStore();
    ai.setStoryContextShare(0.3);
    expect(stored.ai).toEqual({ autoRebuildRagIndex: true, storyContextShare: 0.3 });
  });

  it("ignores a value outside (0, 1]", () => {
    stored.ai = { storyContextShare: 0.15 };
    const ai = useAiStore();
    ai.setStoryContextShare(0);
    ai.setStoryContextShare(1.5);
    ai.setStoryContextShare("x");
    expect(ai.storyContextShare).toBe(0.15);
  });

  it("never writes a null back", () => {
    const ai = useAiStore();
    ai.setAutoRebuildRagIndex(true);
    expect(stored.ai).toEqual({ autoRebuildRagIndex: true });
  });
});
