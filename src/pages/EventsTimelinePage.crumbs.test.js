// @vitest-environment jsdom
//
// An entry's Events page names where it is: its path's first step is the entry's kind ("Character"), a link back
// to that kind's list. From 2026-07-31 (8851c314, the kind's `label` moved to an i18n key) to 2026-10-29 the three
// events pages still read `label`, so the first step was an empty button — seen by the accessibility check (axe
// button-name), never by a test.
import { afterEach, describe, expect, it, vi } from "vitest";
import { h, nextTick } from "vue";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { QLayout, QPageContainer } from "quasar";
import en from "../i18n/locales/en.json";
import { i18n } from "../i18n/index.js";

vi.mock("../stores/project.js", () => ({
  useProjectStore: () => ({ characterById: (id) => (id === "c1" ? { id: "c1", name: "Sable Coyne" } : null), eventsFor: () => [] }),
}));

const { createTestApp } = await import("@delebash/ui/quasar/install.js");
const { default: EventsTimelinePage } = await import("./EventsTimelinePage.vue");

let app;
let host;
afterEach(() => {
  app?.unmount();
  host?.remove();
  document.body.innerHTML = "";
});

describe("an entry's Events page", () => {
  it("starts its path with the entry's kind, then its name", async () => {
    // the page header measures itself with ResizeObserver, which jsdom lacks (as providerScope.test.js)
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    host = document.createElement("div");
    document.body.appendChild(host);
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:p(.*)*", component: { render: () => null } }] });
    app = createTestApp({
      render: () => h(QLayout, { view: "hHh lpR fFf" }, () => h(QPageContainer, () => h(EventsTimelinePage, { kind: "character", entityId: "c1" }))),
    });
    app.use(createPinia());
    app.use(i18n);
    app.use(router);
    app.mount(host);
    await nextTick();

    const steps = [...document.querySelectorAll(".breadcrumb-link")].map((b) => b.textContent.trim());
    expect(steps).toEqual([en.events.kinds.character, "Sable Coyne"]);
  });
});
