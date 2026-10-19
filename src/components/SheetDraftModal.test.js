// @vitest-environment jsdom
//
// The shared review window shows its run's progress in place (2026-10-19): the screen that starts a
// run finds its task with the kit's useSurfaceTask and hands it to DraftReviewModal — here a
// location's sheet, its draft running in the kit's task store under the sheet's feature and id.
// Another sheet's run must not show in this window.
import { afterEach, describe, expect, it, vi } from "vitest";
import { h, nextTick } from "vue";
import { createPinia } from "pinia";
import { i18n } from "../i18n/index.js";

let release;
vi.mock("./AiFeatureChip.vue", () => ({ default: { render: () => null } }));
vi.mock("../stores/project.js", () => ({
  useProjectStore: () => ({ locations: [{ id: "loc1", name: "The Quay" }] }),
}));
vi.mock("../services/analysis/sheetDraft.js", async (importOriginal) => ({
  ...(await importOriginal()),
  // The draft as the real one runs: a task in the kit's store while the model answers.
  draftSheet: async ({ entityId }) => {
    const store = useAiTasksStore();
    const other = store.start({ feature: "storyWorld", label: "Drafting another sheet", meta: { entityId: "loc2" }, lingerMs: 0 });
    const task = store.start({ feature: "storyWorld", label: "Drafting The Quay", meta: { entityId }, lingerMs: 0 });
    await new Promise((r) => { release = r; });
    task.finish();
    other.finish();
    return { fields: {} };
  },
}));

const { createTestApp } = await import("@delebash/ui/quasar/install.js");
const { useAiTasksStore } = await import("@delebash/ui");
const { default: SheetDraftModal } = await import("./SheetDraftModal.vue");

const tick = () => new Promise((r) => setTimeout(r, 0));
let app;
let host;
afterEach(() => {
  release?.();
  app?.unmount();
  host?.remove();
  document.body.innerHTML = "";
});

describe("a sheet drafted from its description", () => {
  it("shows its own run's strip in the window while the model answers", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    app = createTestApp({ render: () => h(SheetDraftModal, { kind: "location", entityId: "loc1", description: "a quay" }) });
    app.use(createPinia());
    app.use(i18n);
    app.mount(host);
    for (let i = 0; i < 5; i++) { await tick(); await nextTick(); }

    const labels = [...document.querySelectorAll(".sts-label")].map((el) => el.textContent);
    expect(labels).toEqual(["Drafting The Quay"]);

    release();
    for (let i = 0; i < 5; i++) { await tick(); await nextTick(); }
    expect(document.querySelectorAll(".sts-label")).toHaveLength(0);
  });
});
