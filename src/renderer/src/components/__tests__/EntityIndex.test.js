// @vitest-environment jsdom
//
// The shared entity index (components/EntityIndex.vue), which replaced seven
// hand-rolled copies of the same toolbar + facet chips + UiTable block.
//
// WHY A MOUNT AND NOT A READ: this component's whole risk is the dynamic slot
// FORWARDING —
//   <template v-for="name in cellSlots" #[name]="slotProps">
//     <slot :name="name" v-bind="slotProps" />
//   </template>
// If that doesn't forward, every consumer's custom cell renders BLANK: the table
// still has the right number of rows, `build:vite` is clean, biome is clean and
// the headless smoke reports zero JS errors, because an empty cell is not an
// error. Nothing but rendering the thing catches it. The same goes for the facet
// filtering — it is plain logic, but it is logic seven views now depend on.
//
// Mounted with plain `createApp`, matching modalDragAndScrim.test.js next door
// (no @vue/test-utils dependency).
import { afterEach, describe, expect, it } from "vitest";
import { createApp, h, nextTick } from "vue";
import { createI18n } from "vue-i18n";

import EntityIndex from "../EntityIndex.vue";
import en from "../../i18n/locales/en.json";

let app;
let host;

function mount(props, slots) {
  host = document.createElement("div");
  document.body.appendChild(host);
  app = createApp({ render: () => h(EntityIndex, props, slots) });
  // Global scope so the component's $t("common.*") resolves against the real
  // catalog — a stub would hide a renamed key.
  app.use(createI18n({ legacy: false, locale: "en", messages: { en } }));
  app.mount(host);
  return host;
}

afterEach(() => {
  app?.unmount();
  host?.remove();
});

const ROWS = [
  { id: "a", name: "Harbour", kind: "city", status: "done", tags: ["wet"] },
  { id: "b", name: "The Tavern", kind: "building", status: "draft", tags: ["warm", "wet"] },
  { id: "c", name: "Cold Vault", kind: "building", status: "done", tags: [] },
];
const COLUMNS = [
  { accessorKey: "name", header: "Name", sortable: true },
  { accessorKey: "kind", header: "Kind", sortable: true },
];
const FACETS = [
  { key: "kind", label: "Kind", options: [{ value: "city", label: "city" }, { value: "building", label: "building" }] },
  {
    key: "tags", label: "Tags", multi: true,
    options: [{ value: "wet", label: "wet" }, { value: "warm", label: "warm" }],
    match: (row, tag) => (row.tags || []).includes(tag),
  },
];

const chips = (el) => [...el.querySelectorAll(".entity-chip")];
const chipNamed = (el, text) => chips(el).find((c) => c.textContent.trim() === text);
const bodyRows = (el) => [...el.querySelectorAll("tbody tr")];

describe("EntityIndex", () => {
  it("forwards per-column cell slots to UiTable", async () => {
    const el = mount(
      { rows: ROWS, columns: COLUMNS, facets: [], emptyText: "none" },
      { name: ({ row }) => h("span", { class: "probe-name" }, `»${row.name}«`) },
    );
    await nextTick();
    const rendered = [...el.querySelectorAll(".probe-name")].map((n) => n.textContent);
    // The exact failure this test exists for: forwarding silently not happening
    // leaves the cells empty and every other gate still green.
    expect(rendered).toEqual(["»Harbour«", "»The Tavern«", "»Cold Vault«"]);
  });

  it("renders the intro slot above the toolbar", async () => {
    const el = mount(
      { rows: ROWS, columns: COLUMNS, emptyText: "none" },
      { intro: () => h("p", { class: "probe-intro" }, "what this page is") },
    );
    await nextTick();
    expect(el.querySelector(".probe-intro")?.textContent).toBe("what this page is");
  });

  it("filters on a single-select facet, and the same chip clears it", async () => {
    const el = mount({ rows: ROWS, columns: COLUMNS, facets: FACETS, emptyText: "none" });
    await nextTick();
    expect(bodyRows(el)).toHaveLength(3);

    chipNamed(el, "building").click();
    await nextTick();
    expect(bodyRows(el)).toHaveLength(2);

    chipNamed(el, "building").click(); // clicking the active chip clears it
    await nextTick();
    expect(bodyRows(el)).toHaveLength(3);
  });

  it("ORs within a multi-select facet and ANDs across facets", async () => {
    const el = mount({ rows: ROWS, columns: COLUMNS, facets: FACETS, emptyText: "none" });
    await nextTick();

    chipNamed(el, "warm").click();
    await nextTick();
    expect(bodyRows(el)).toHaveLength(1); // only The Tavern is warm

    chipNamed(el, "wet").click();
    await nextTick();
    expect(bodyRows(el)).toHaveLength(2); // warm OR wet

    chipNamed(el, "building").click();
    await nextTick();
    expect(bodyRows(el)).toHaveLength(1); // AND kind=building → The Tavern
  });

  it("treats `false` as a real selection, not as 'All'", async () => {
    // The bug the hand-rolled copies would have had: they tested the selection
    // with a FALSY check, so a legitimate `false` value (Characters' "Main"
    // facet is exactly this) would have read as no-filter.
    const rows = [{ id: "1", name: "A", main: true }, { id: "2", name: "B", main: false }];
    const facets = [{
      key: "main", label: "Main",
      options: [{ value: true, label: "Yes" }, { value: false, label: "No" }],
      match: (row, v) => !!row.main === v,
    }];
    const el = mount({ rows, columns: COLUMNS, facets, emptyText: "none" });
    await nextTick();
    chipNamed(el, "No").click();
    await nextTick();
    expect(bodyRows(el)).toHaveLength(1);
  });

  it("shows Clear filters only once something is filtering, and it resets everything", async () => {
    const el = mount({ rows: ROWS, columns: COLUMNS, facets: FACETS, emptyText: "none" });
    await nextTick();
    const clearLabel = en.common.clearFilters;
    const findClear = () => [...el.querySelectorAll("button")].find((b) => b.textContent.trim() === clearLabel);
    expect(findClear()).toBeUndefined();

    chipNamed(el, "city").click();
    await nextTick();
    expect(findClear()).toBeTruthy();

    findClear().click();
    await nextTick();
    expect(bodyRows(el)).toHaveLength(3);
    expect(findClear()).toBeUndefined();
  });

  it("renders the count from the shared catalog key", async () => {
    const el = mount({ rows: ROWS, columns: COLUMNS, facets: FACETS, emptyText: "none" });
    await nextTick();
    expect(el.querySelector(".entity-count").textContent.trim()).toBe("3 of 3");
    chipNamed(el, "city").click();
    await nextTick();
    expect(el.querySelector(".entity-count").textContent.trim()).toBe("1 of 3");
  });

  it("survives a facet with no options rather than throwing", async () => {
    // A facet whose options are still loading must not take the index down.
    const el = mount({
      rows: ROWS, columns: COLUMNS, emptyText: "none",
      facets: [{ key: "kind", label: "Kind" }, ...FACETS],
    });
    await nextTick();
    expect(bodyRows(el)).toHaveLength(3);
  });
});
