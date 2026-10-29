// @vitest-environment jsdom
//
// Summarize this scene shows its run in the review window (2026-10-29). The Links panel hands
// DraftReviewModal the run's task, found with the kit's useSurfaceTask; from 2026-10-19 (c7261e91,
// every screen onto useSurfaceTask) it passed `summaryTask` without ever defining it, so the window
// had no strip, no Cancel, and could be closed mid-run. Another scene's summary must not show here.
import { afterEach, describe, expect, it, vi } from "vitest";
import { h, nextTick } from "vue";
import { createPinia } from "pinia";
import { DOMWrapper } from "@vue/test-utils";
import { i18n } from "../i18n/index.js";
import en from "../i18n/locales/en.json";

let release;
vi.mock("./AiFeatureChip.vue", () => ({ default: { render: () => null } }));
vi.mock("../stores/project.js", () => ({
  useProjectStore: () => ({
    scenesFor: () => [{ id: "s1", title: "The Quay at Dawn", summary: "" }],
    characters: [], locations: [], objects: [], strands: [],
    updateScene: () => {},
  }),
}));
vi.mock("../services/analysis/planningDraft.js", async (importOriginal) => ({
  ...(await importOriginal()),
  // The summary as the real one runs: a task in the kit's store while the model answers.
  summarizeScene: async ({ sceneId }) => {
    const store = useAiTasksStore();
    const other = store.start({ feature: "planning", label: "Summarizing another scene", meta: { kind: "scene-summary", sceneId: "s2" }, lingerMs: 0 });
    const task = store.start({ feature: "planning", label: "Summarizing The Quay at Dawn", meta: { kind: "scene-summary", sceneId }, lingerMs: 0 });
    await new Promise((r) => { release = r; });
    task.finish();
    other.finish();
    return { summary: "" };
  },
}));

const { createTestApp } = await import("@delebash/ui/quasar/install.js");
const { useAiTasksStore } = await import("@delebash/ui");
const { default: SceneLinks } = await import("./SceneLinks.vue");

const tick = () => new Promise((r) => setTimeout(r, 0));
let app;
let host;
afterEach(() => {
  release?.();
  app?.unmount();
  host?.remove();
  document.body.innerHTML = "";
});

describe("Summarize this scene", () => {
  it("shows its own run's strip in the review window while the model answers", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    host = document.createElement("div");
    document.body.appendChild(host);
    app = createTestApp({ render: () => h(SceneLinks, { chapterId: "c1", sceneId: "s1" }) });
    app.config.errorHandler = (e) => { throw e; };
    app.use(createPinia());
    app.use(i18n);
    app.mount(host);
    await nextTick();

    const button = [...document.querySelectorAll("button")].find((b) => b.textContent.includes(en.sceneLinks.summarize));
    await new DOMWrapper(button).trigger("click");
    for (let i = 0; i < 5; i++) { await tick(); await nextTick(); }

    const labels = [...document.querySelectorAll(".sts-label")].map((el) => el.textContent);
    expect(labels).toEqual(["Summarizing The Quay at Dawn"]);

    release();
    for (let i = 0; i < 5; i++) { await tick(); await nextTick(); }
    expect(document.querySelectorAll(".sts-label")).toHaveLength(0);
  });
});
