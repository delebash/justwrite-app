// The once-ever AI offer at the first project (the family's §11, the template's
// ui.maybeOfferAiSetup): shown only when no AI provider is the default at all — an online default
// is AI too — and never again once shown (the `aiSetupPrompted` setting).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const settings = new Map();
vi.mock("../services/settings.js", () => ({
  readSetting: vi.fn((k) => settings.get(k) ?? null),
  writeSetting: vi.fn((k, v) => settings.set(k, v)),
}));
const applied = { defaultId: null, fails: false };
vi.mock("@delebash/ui", async (orig) => ({
  ...(await orig()),
  useModelApply: () => ({
    refreshApplied: async () => {
      if (applied.fails) throw new Error("server down");
    },
    currentDefaultProviderId: { get value() { return applied.defaultId; } },
  }),
}));

const { useUiStore } = await import("./ui.js");

let ui;
beforeEach(() => {
  settings.clear();
  applied.defaultId = null;
  applied.fails = false;
  setActivePinia(createPinia());
  ui = useUiStore();
});

describe("maybeOfferAiSetup", () => {
  it("offers once when no AI provider is the default", async () => {
    await ui.maybeOfferAiSetup();
    expect(ui.aiSetupPromptOpen).toBe(true);
    expect(settings.get("aiSetupPrompted")).toBe(true);
    ui.closeAiSetupPrompt();
    await ui.maybeOfferAiSetup();
    expect(ui.aiSetupPromptOpen).toBe(false);
  });

  it("offers nothing when a provider is already the default, and keeps the offer for later", async () => {
    applied.defaultId = "openrouter";
    await ui.maybeOfferAiSetup();
    expect(ui.aiSetupPromptOpen).toBe(false);
    expect(settings.has("aiSetupPrompted")).toBe(false);
  });

  it("offers nothing when it can't tell (the server didn't answer)", async () => {
    applied.fails = true;
    await ui.maybeOfferAiSetup();
    expect(ui.aiSetupPromptOpen).toBe(false);
    expect(settings.has("aiSetupPrompted")).toBe(false);
  });
});
