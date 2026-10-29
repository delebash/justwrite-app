// The story-world pages' one way to open an entry, the status facet and Ask the book (the copies
// audit, 2026-10-28: eight pages carried their own copies). The router and the stores are stand-ins.
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const ui = { select: vi.fn(), openChatPanelFor: vi.fn() };
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));
vi.mock("../stores/ui.js", () => ({ useUiStore: () => ui }));
vi.mock("../stores/project.js", () => ({
  useProjectStore: () => ({ statusesShown: [{ id: "draft", label: "Draft" }, { id: "done", label: "Done" }] }),
}));

import { kindsIn, tagPoolOf, tagsIn, useEntityPage } from "./useEntityPage.js";

beforeEach(() => vi.clearAllMocks());

describe("useEntityPage", () => {
  it("opens an entry: selected in the sidebar, at its route — a new one with ?new=1", () => {
    const { open } = useEntityPage("locations");
    open("loc1");
    expect(ui.select).toHaveBeenCalledWith("locations", "loc1");
    expect(push).toHaveBeenLastCalledWith("/locations/loc1");
    open("loc2", { isNew: true });
    expect(push).toHaveBeenLastCalledWith("/locations/loc2?new=1");
  });

  it("a row click opens its entry; a click on no row does nothing", () => {
    const { onRowClick } = useEntityPage("objects");
    onRowClick({ data: { id: "o1" } });
    expect(push).toHaveBeenCalledWith("/objects/o1");
    onRowClick({});
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("after a delete: the first entry left, or the list when none is", () => {
    const { openFirst } = useEntityPage("groups");
    openFirst([{ id: "g2" }, { id: "g3" }]);
    expect(push).toHaveBeenLastCalledWith("/groups/g2");
    openFirst([]);
    expect(push).toHaveBeenLastCalledWith("/groups");
  });

  it("the status facet's options and Ask the book", () => {
    const { statusOptions, askBook } = useEntityPage("strands");
    expect(statusOptions.value).toEqual([{ value: "draft", label: "Draft" }, { value: "done", label: "Done" }]);
    askBook("Tell me about the Delivery", "ask:strand:s1");
    expect(ui.openChatPanelFor).toHaveBeenCalledWith({ mode: "book", question: "Tell me about the Delivery", sourceKey: "ask:strand:s1" });
  });
});

describe("the facets' option lists", () => {
  const entries = [{ tags: ["salt", "road"], kind: "Port" }, { tags: ["salt"] }, { kind: "Fort" }, { kind: "Port" }];
  it("tags: in order with repeats for the pool, once each and sorted for a facet", () => {
    expect(tagPoolOf(entries)).toEqual(["salt", "road", "salt"]);
    expect(tagsIn(entries)).toEqual(["road", "salt"]);
  });
  it("kinds in use, once each and sorted", () => {
    expect(kindsIn(entries)).toEqual(["Fort", "Port"]);
  });
});
