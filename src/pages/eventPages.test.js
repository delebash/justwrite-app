// @vitest-environment jsdom
//
// An entry's three Events pages (its timeline, a new event, an event's edit) open, and each names where it is: its
// path's first step is the entry's kind ("Character"), a link back to that kind's list. Two faults no test saw:
// from 2026-07-31 (8851c314, the kind's `label` moved to an i18n key) the three pages still read `label`, so the
// first step was an empty button; and from 2026-10-09 (afccfb03) the new and edit pages called `useI18n` without
// importing it, so neither opened. The accessibility check (axe, e2e) found both on 2026-10-29.
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
const PAGES = {
  timeline: { file: "./EventsTimelinePage.vue", props: {}, path: [en.events.kinds.character, "Sable Coyne"] },
  new: { file: "./EventNewPage.vue", props: {}, path: [en.events.kinds.character, "Sable Coyne", en.common.events] },
  edit: { file: "./EventEditPage.vue", props: { eventId: "e1" }, path: [en.events.kinds.character, "Sable Coyne", en.common.events] },
};

let app;
let host;
afterEach(() => {
  app?.unmount();
  host?.remove();
  document.body.innerHTML = "";
});

describe("an entry's Events pages", () => {
  for (const [name, page] of Object.entries(PAGES)) {
    it(`the ${name} page opens, its path starting with the entry's kind`, async () => {
      // the page header measures itself with ResizeObserver, which jsdom lacks (as providerScope.test.js)
      vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
      const { default: Page } = await import(page.file);
      const errors = [];
      host = document.createElement("div");
      document.body.appendChild(host);
      const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:p(.*)*", component: { render: () => null } }] });
      app = createTestApp({
        render: () => h(QLayout, { view: "hHh lpR fFf" }, () => h(QPageContainer, () => h(Page, { kind: "character", entityId: "c1", ...page.props }))),
      });
      app.config.errorHandler = (e) => errors.push(String(e));
      app.use(createPinia());
      app.use(i18n);
      app.use(router);
      app.mount(host);
      await nextTick();

      expect(errors).toEqual([]);
      const steps = [...document.querySelectorAll(".breadcrumb-link")].map((b) => b.textContent.trim());
      expect(steps).toEqual(page.path);
    });
  }
});
