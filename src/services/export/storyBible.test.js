// @vitest-environment jsdom
// The Story Bible's outline (2026-10-28): every filled field under the page's own label, empty ones
// left out, an "Exclude from AI" entry left out when asked. jsdom: htmlToText reads rich text.
import { createPinia, setActivePinia } from "pinia";
import JSZip from "jszip";
import { beforeEach, describe, expect, it } from "vitest";
import { storyBibleDocx, storyBibleOutline } from "./storyBible.js";

// the catalog key as the word — the outline's labels are visibly the pages' own keys
const t = (key, params) => (params ? `${key} ${JSON.stringify(params)}` : key);

function book() {
  return {
    project: { title: "The Salt Road", author: "N. A." },
    characters: [
      { id: "c1", name: "Sable", role: "Quartermaster", gender: "", pronouns: "she/her", age: 37, lifeStatus: "alive", aliases: ["The Coyne"], oneLiner: "Allergic to being owed.", tags: ["pov"] },
      { id: "c2", name: "Spoiler", excludeFromAi: true },
    ],
    characterExtras: { c1: { motivation: { want: "To owe nothing." }, backstory: "Struck off the fleet-rolls." } },
    locations: [{ id: "l1", name: "The Saltreach", note: "<p>White <em>crust</em>.</p><p>Night crossings.</p>", atmosphere: "Glare", history: "", tags: [] }],
    objects: [],
    groups: [{ id: "g1", name: "The Guild", blurb: "", goals: "Tolls.", members: [{ kind: "character", id: "c1" }, { kind: "location", id: "gone" }] }],
    strands: [],
    worldbuilding: [{ id: "w1", title: "Salt law", category: "history", summary: "Who owns the salt.", body: "<p>Tolls by weight.</p>", tags: ["law"] }],
    worldbuildingCategories: [{ id: "history", label: "History" }],
  };
}

describe("the Story Bible outline", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("lists every filled field under its page's label, and leaves empty ones out", () => {
    const o = storyBibleOutline(book(), t);
    expect(o.heading).toBe('export.storyBible.docTitle {"title":"The Salt Road"}');
    expect(o.byAuthor).toBe('export.book.byAuthor {"author":"N. A."}');
    expect(o.sections.map((s) => s.title)).toEqual(["nav.characters", "nav.locations", "nav.groups", "nav.worldbuilding"]);

    const sable = o.sections[0].entries[0];
    expect(sable.title).toBe("Sable");
    expect(sable.facts.map((f) => f.label)).toEqual([
      "characters.columns.role", "characters.columns.pronouns", "characters.detail.age", "characters.detail.lifeStatus",
      "characters.detail.alsoKnownAs", "characters.detail.oneLiner", "common.tags",
    ]);
    expect(sable.facts.find((f) => f.label === "characters.detail.lifeStatus").text).toBe("characters.lifeStatus.alive");
    const groups = Object.fromEntries(sable.groups.map((g) => [g.title, g.facts]));
    expect(groups["characters.sections.depth.title"]).toEqual([{ label: "characters.detail.backstory", text: "Struck off the fleet-rolls." }]);

    const reach = o.sections[1].entries[0];
    expect(reach.facts.map(({ label, text }) => ({ label, text }))).toEqual([
      { label: "common.description", text: "White crust.\nNight crossings." },
      { label: "locations.fields.atmosphere.label", text: "Glare" },
    ]);
    // a rich description carries its blocks, formatting and all (2026-10-29)
    expect(reach.facts[0].blocks.map((b) => b.runs)).toEqual([
      [{ text: "White " }, { text: "crust", italic: true }, { text: "." }], [{ text: "Night crossings." }],
    ]);
    expect(o.sections[2].entries[0].facts.find((f) => f.label === "groups.colMembers").text).toBe("Sable");
    expect(o.sections[3].entries[0].facts[0]).toEqual({ label: "common.category", text: "History" });
  });

  it("the Word file keeps a description's italics", async () => {
    const blob = await storyBibleDocx(storyBibleOutline(book(), t), { language: "en" });
    const xml = await (await JSZip.loadAsync(await blob.arrayBuffer())).file("word/document.xml").async("string");
    const run = xml.match(/<w:r>(?:(?!<\/w:r>).)*<w:t[^>]*>crust<\/w:t>/)?.[0] || "";
    expect(run).toContain("<w:i/>");
  });

  it("leaves out an entry marked Exclude from AI when asked, and keeps it otherwise", () => {
    expect(storyBibleOutline(book(), t).sections[0].entries.map((e) => e.title)).toEqual(["Sable", "Spoiler"]);
    expect(storyBibleOutline(book(), t, { skipExcluded: true }).sections[0].entries.map((e) => e.title)).toEqual(["Sable"]);
  });
});
