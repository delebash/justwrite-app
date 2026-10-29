// @vitest-environment jsdom
//
// Brainstorm where it's used (2026-10-28): the panel is Brainstorm's own controls at a page — the
// user's rule after the 2026-10-11 build dropped the seed prompt and generated on open. Mounted for
// real (the kit's controls; only the model call stubbed): nothing runs on open; the seed prompt shows
// the category's example; Generate runs with an empty seed (optional at a page) and with the writer's
// words; each idea's button (Use) hands it back; a round with nothing new says so.
import { afterEach, describe, expect, it, vi } from "vitest";
import { DOMWrapper } from "@vue/test-utils";
import { h, nextTick } from "vue";
import { createPinia } from "pinia";
import { i18n } from "../i18n/index.js";

const runAiFeature = vi.fn();
vi.mock("@delebash/ui", async (importOriginal) => ({ ...(await importOriginal()), runAiFeature: (...a) => runAiFeature(...a) }));

const { createTestApp } = await import("@delebash/ui/quasar/install.js");
const { default: BrainstormPanel } = await import("./BrainstormPanel.vue");

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => {
  for (let i = 0; i < 10; i++) {
    await tick();
    await nextTick();
  }
};
const button = (host, words) => [...host.querySelectorAll("button")].filter((b) => b.textContent.trim() === words);

let app;
let host;
afterEach(() => {
  app?.unmount();
  host?.remove();
  document.body.innerHTML = "";
  runAiFeature.mockReset();
});

function mount(props) {
  host = document.createElement("div");
  document.body.appendChild(host);
  app = createTestApp({ render: () => h(BrainstormPanel, props) });
  app.use(createPinia());
  app.use(i18n);
  app.mount(host);
}

describe("the Brainstorm panel at a page", () => {
  it("runs nothing on open; Generate sends the seed — empty or the writer's — and Use hands an idea back", async () => {
    const request = vi.fn(async ({ seed }) => ({ action: "brainstorm", variables: { label: "Character names", user_content: `Seed: ${seed}` } }));
    runAiFeature.mockResolvedValue({ content: "1. Brenna Holt\n2. Sigrun Vale" });
    const picked = [];
    mount({ category: "character_name", request, meta: { kind: "test" }, taskLabel: "Name ideas", pickLabel: "Use", onPick: (t) => picked.push(t) });
    await settle();

    expect(request).not.toHaveBeenCalled();
    expect(runAiFeature).not.toHaveBeenCalled();
    const box = host.querySelector("textarea");
    expect(box.placeholder).toMatch(/Norse-sounding/);
    expect(host.textContent).toContain("Leave it empty for ideas that fit this page and your book.");

    await new DOMWrapper(button(host, "Generate")[0]).trigger("click");
    await settle();
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ seed: "" }));

    box.value = "two syllables";
    box.dispatchEvent(new Event("input"));
    await settle();
    await new DOMWrapper(button(host, "Generate")[0]).trigger("click");
    await settle();
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ seed: "two syllables" }));

    const uses = button(host, "Use");
    expect(uses).toHaveLength(2);
    await new DOMWrapper(uses[1]).trigger("click");
    expect(picked).toEqual(["Sigrun Vale"]);
  });

  it("says so when a round brings back nothing new", async () => {
    runAiFeature.mockResolvedValue({ content: "" });
    mount({ category: "twist", request: async () => ({ action: "brainstormPlot", variables: {} }), meta: { kind: "test" }, taskLabel: "Ideas", pickLabel: "Add as beat" });
    await settle();
    expect(host.textContent).not.toContain("didn't suggest anything new");
    await new DOMWrapper(button(host, "Generate")[0]).trigger("click");
    await settle();
    expect(host.textContent).toContain("The model didn't suggest anything new. Try again.");
  });
});
