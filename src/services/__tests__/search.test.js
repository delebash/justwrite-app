// @vitest-environment jsdom
//
// Global-search fixes (user-reported 2026-07-18):
//  (1) a chapter hit opened the CHAPTER (scene picker), not the scene the match
//      is in — search now indexes PER SCENE and routes to /chapters/<ch>/<scene>.
//  (2) "Chapter 2 stated twice" — the snippet was built from title+sub+body, so a
//      match near the top re-printed the header; snippets are BODY-only now.
//  (3) the header read chapter-then-part with no scene — results carry a
//      Part › Chapter › Scene breadcrumb (`crumbs`), part first.
// The single-untitled-scene case (most migrated books) collapses the scene crumb
// and routes to the chapter, so a bare "Scene 1" is never shown.
//
// stripHtml uses document.createElement → jsdom.
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

import { buildIndex, searchIndex } from "../search.js";

const PROJECT = {
  parts: [{
    title: "The Commission",
    chapters: [
      { id: "ch1", num: 1, title: "Brass Rank" },
      { id: "ch2", num: 2, title: "Bigger Inside" },
    ],
  }],
  scenes: {
    // one untitled scene (the migrated shape) → collapses to a chapter route
    ch1: [{ id: "s1", title: "", body: "<p>Nine years of brass and lamplight.</p>" }],
    // two named scenes → two scene results
    ch2: [
      { id: "s2a", title: "The road to the Nine", body: "<p>The Ash District glowed like a banked fire.</p>", characters: ["c1"] },
      { id: "s2b", title: "Bigger inside", body: "<p>Inside, it was impossibly bigger.</p>" },
    ],
  },
  characters: [{ id: "c1", name: "Cael Ferren" }],
  characterExtras: {}, locations: [], objects: [], notes: [], groups: [],
  strands: [], worldbuilding: [], architecture: {},
};

function docsById(index) {
  return Object.fromEntries([...index.docs.entries()]);
}

describe("buildIndex — chapters are indexed per scene", () => {
  it("emits one doc per scene, keyed scene:<ch>:<scene>", () => {
    const index = buildIndex(PROJECT);
    const chapters = [...index.docs.values()].filter((d) => d.kind === "chapter");
    expect(chapters.map((d) => d.id).sort()).toEqual(["scene:ch1:s1", "scene:ch2:s2a", "scene:ch2:s2b"]);
  });

  it("a multi-scene chapter routes each result to its own scene", () => {
    const docs = docsById(buildIndex(PROJECT));
    expect(docs["scene:ch2:s2a"].route).toBe("/chapters/ch2/s2a");
    expect(docs["scene:ch2:s2b"].route).toBe("/chapters/ch2/s2b");
  });

  it("the breadcrumb is Part › Chapter › Scene (part first, scene present)", () => {
    const docs = docsById(buildIndex(PROJECT));
    expect(docs["scene:ch2:s2a"].crumbs).toEqual([
      "The Commission", "Ch. 2 Bigger Inside", "Scene 1 · The road to the Nine",
    ]);
  });

  it("a single UNTITLED scene collapses the scene crumb but STILL routes to the scene", () => {
    // Collapsing the crumb kills the noisy "Scene 1", but the route must stay the
    // scene form — /chapters/<ch> alone reopens the scene picker (the bug we fixed),
    // and the sidebar routes a lone scene the same way.
    const docs = docsById(buildIndex(PROJECT));
    expect(docs["scene:ch1:s1"].route).toBe("/chapters/ch1/s1");
    expect(docs["scene:ch1:s1"].crumbs).toEqual(["The Commission", "Ch. 1 Brass Rank"]);
  });

  it("a chapter with NO scenes yet stays findable by title (addChapter seeds [])", () => {
    // Regression guard: a freshly-created chapter has zero scenes; per-scene indexing
    // must not drop it — index it by title/number, routed to its overview.
    const proj = {
      ...PROJECT,
      parts: [{ title: "The Commission", chapters: [{ id: "ch9", num: 9, title: "The Reckoning" }] }],
      scenes: { ch9: [] },
    };
    const docs = docsById(buildIndex(proj));
    expect(docs["chapter:ch9"]?.route).toBe("/chapters/ch9");
    expect(docs["chapter:ch9"].crumbs).toEqual(["The Commission", "Ch. 9 The Reckoning"]);
    expect(searchIndex(buildIndex(proj), "Reckoning").map((h) => h.doc.id)).toContain("chapter:ch9");
  });

  it("folds a scene's linked characters so a name search opens that scene", () => {
    const hits = searchIndex(buildIndex(PROJECT), "Cael");
    expect(hits.map((h) => h.doc.id)).toContain("scene:ch2:s2a"); // s2a links Cael Ferren
  });
});

describe("searchIndex — the snippet is body-only (no header duplication)", () => {
  it("a match near the top of a scene does NOT re-print the chapter/part header", () => {
    // "Ash" sits at the very start of s2a's body; the old title+sub+body haystack
    // clamped the window to 0 and re-printed 'Ch. 2 … The Commission'.
    const [hit] = searchIndex(buildIndex(PROJECT), "Ash");
    expect(hit.doc.id).toBe("scene:ch2:s2a");
    expect(hit.snippet).toContain("Ash District");
    expect(hit.snippet).not.toContain("Ch. 2");
    expect(hit.snippet).not.toContain("The Commission");
    expect(hit.snippet).not.toContain("The road to the Nine"); // the scene title isn't body text
  });
});

// The editor owns Ctrl/⌘-F (its find-in-editor bar); App.vue's capture-phase global
// ⌘F must bail when focus is in the rich editor, mirroring the ⌘Z bail one block down.
// A source-pin: App.vue keyboard handling is a window capture listener not cheaply
// mounted, and this is the whole invariant (the chipPopoverStacking precedent).
const APP = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../App.vue"), "utf8");

describe("global ⌘F yields to the editor's find-in-editor", () => {
  it("the ⌘F branch bails on focusedInRichEditor()", () => {
    // Isolate the `key === "f"` (non-shift) branch and assert it checks the editor.
    const m = APP.match(/if \(key === "f"\) \{([\s\S]*?)\n {2}\}/);
    expect(m, "App.vue should have a `if (key === \"f\")` handler").toBeTruthy();
    expect(m[1]).toContain("focusedInRichEditor()");
  });
});
