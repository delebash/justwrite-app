// Seeded words in the interface's language (the kit's
// docs/plans/2026-10-18-seeded-words-in-the-users-language.md): a seeded status or worldbuilding
// category whose label is still the seed's English shows the catalog's word in the current
// language; a renamed one shows the writer's words; the stored label never changes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../services/settings.js", () => ({
  readSetting: vi.fn(() => null),
  writeSetting: vi.fn(),
  getAllSettings: vi.fn(() => ({})),
  applySettings: vi.fn(),
}));
vi.mock("../services/projectApi.js", () => ({
  getSnapshot: vi.fn(() => null),
  putSnapshot: vi.fn(),
  removeProject: vi.fn(),
  bootProjects: vi.fn(async () => {}),
  listRegistry: vi.fn(() => []),
  fetchSnapshot: vi.fn(async () => null),
  isRegistryLoaded: vi.fn(() => true),
  createDemoProject: vi.fn(async () => null),
}));
vi.mock("../services/autosaveApi.js", () => ({ postAutosave: vi.fn(async () => ({ ok: true })) }));
vi.mock("../services/imageStore.js", () => ({ removeImage: vi.fn(async () => {}) }));
vi.mock("./ui.js", () => ({ useUiStore: () => ({ showToast: vi.fn(), select: vi.fn() }) }));
vi.mock("./sessions.js", () => ({ useSessionsStore: () => ({ recordChapterWords: vi.fn() }) }));

import { i18n, setLocale } from "../i18n/index.js";
import { categoryLabelShown, statusLabelShown, useProjectStore } from "./project.js";

let store;
beforeEach(() => {
  setActivePinia(createPinia());
  store = useProjectStore();
  i18n.global.mergeLocaleMessage("es", { seeded: { status: { draft: "Borrador" }, wbCategory: { lore: "Mitos y leyendas" } } });
  setLocale("es");
});
afterEach(() => setLocale("en"));

describe("a seeded status", () => {
  it("shows the catalog's word while its label is the seed's English", () => {
    const draft = store.statuses.find((s) => s.id === "draft");
    expect(draft.label).toBe("Draft"); // stored as seeded
    expect(statusLabelShown(draft)).toBe("Borrador");
    expect(store.statusById("draft").label).toBe("Borrador");
    expect(store.statusesShown.find((s) => s.id === "draft").label).toBe("Borrador");
    expect(store.statuses.find((s) => s.id === "draft").label, "the stored label is untouched").toBe("Draft");
  });

  it("shows the writer's words once renamed, in any language", () => {
    store.updateStatusDef("draft", { label: "First pass" });
    expect(store.statusById("draft").label).toBe("First pass");
    setLocale("en");
    expect(store.statusById("draft").label).toBe("First pass");
  });

  it("a status the writer added shows as written", () => {
    const id = store.addStatusDef({ label: "Polished" });
    expect(statusLabelShown(store.statuses.find((s) => s.id === id))).toBe("Polished");
  });
});

describe("a seeded worldbuilding category", () => {
  it("shows the catalog's word until renamed", () => {
    const lore = store.worldbuildingCategories.find((c) => c.id === "lore");
    expect(categoryLabelShown(lore)).toBe("Mitos y leyendas");
    expect(store.categoriesShown.find((c) => c.id === "lore").label).toBe("Mitos y leyendas");
    store.updateWorldbuildingCategory("lore", { label: "Old tales" });
    expect(categoryLabelShown(store.worldbuildingCategories.find((c) => c.id === "lore"))).toBe("Old tales");
  });
});
