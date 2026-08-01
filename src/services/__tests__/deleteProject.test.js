// DELETING THE BOOK YOU'RE READING (user, 2026-07-17: "you should be able to delete
// currently loaded book" · ruled: "next project and if none available welcome screen").
//
// The store already implemented exactly that; the SIDEBAR forbade reaching it — the
// trash icon lived in a `v-else` to the active-project checkmark, so the one book you
// were looking at was the one you could never remove. Unlocking that button makes this
// path reachable for the first time, and it had NO test. These pin the ruled behaviour
// so it can't regress now that users can actually trigger it.
//
// The store is imported REAL; only the network/persistence seams are mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// The store's `state()` runs bootstrap() at creation — it reads the registry + the
// active pointer SYNCHRONOUSLY (projectApi's in-memory cache, hydrated before mount in
// the real app). Both seams must therefore be sync here, or the store won't construct.
vi.mock("../projectApi.js", () => ({
  listRegistry: vi.fn(() => []),
  isRegistryLoaded: vi.fn(() => true),
  getSnapshot: vi.fn(() => null),
  fetchSnapshot: vi.fn(async (id) => ({ id, project: { title: `Book ${id}` }, chapters: [] })),
  bootProjects: vi.fn(async () => {}),
  putSnapshot: vi.fn(async () => {}),
  removeProject: vi.fn(async () => {}),
  createDemoProject: vi.fn(async () => {}),
}));
vi.mock("../settings.js", () => ({
  readSetting: vi.fn(() => null),      // sync — loadActiveId() does `?? null` on it
  writeSetting: vi.fn(() => {}),
  getAllSettings: vi.fn(async () => ({})),
  applySettings: vi.fn(),
}));
vi.mock("../autosaveApi.js", () => ({ flushAutosave: vi.fn(), scheduleAutosave: vi.fn() }));
vi.mock("../imageStore.js", () => ({ removeImage: vi.fn(async () => {}) }));

import { writeSetting } from "../settings.js";
import { useProjectStore } from "../../stores/project.js";

function seedRegistry(store, ids) {
  store._projects = ids.map((id) => ({ id, title: `Book ${id}`, author: "" }));
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("deleteProject — deleting the OPEN book", () => {
  it("switches to the NEXT project when others remain (the user's ruling)", async () => {
    const store = useProjectStore();
    seedRegistry(store, ["a", "b", "c"]);
    store._activeId = "a"; // the book currently open

    await store.deleteProject("a");

    // Gone from the registry, and we landed on a SURVIVING project — never the
    // deleted one (`next` is read AFTER _writeRegistry reassigns _projects).
    expect(store._projects.map((p) => p.id)).toEqual(["b", "c"]);
    expect(store._activeId).toBe("b");
    expect(store._activeId).not.toBe("a");
  });

  it("lands on the zero-project state when the last book is deleted → /welcome owns it", async () => {
    const store = useProjectStore();
    seedRegistry(store, ["only"]);
    store._activeId = "only";

    await store.deleteProject("only");

    expect(store._projects).toEqual([]);
    // No auto-minted "Untitled project" (the QC-40 zero-project law): the pointer is
    // cleared and persisted as null; the router guard sends the user to /welcome.
    expect(store._activeId).toBe(null);
    expect(writeSetting).toHaveBeenCalledWith("activeProjectId", null);
  });

  it("deleting a NON-open book leaves the open one untouched", async () => {
    const store = useProjectStore();
    seedRegistry(store, ["a", "b"]);
    store._activeId = "a";

    await store.deleteProject("b");

    expect(store._projects.map((p) => p.id)).toEqual(["a"]);
    expect(store._activeId).toBe("a"); // no switch, no reload
  });

  it("is a no-op without an id (a mis-wired click must not blank the workspace)", async () => {
    const store = useProjectStore();
    seedRegistry(store, ["a"]);
    store._activeId = "a";

    await store.deleteProject("");

    expect(store._projects.map((p) => p.id)).toEqual(["a"]);
    expect(store._activeId).toBe("a");
  });
});
