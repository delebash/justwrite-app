// @vitest-environment jsdom
// E5 (RAG build): scene-break splitting on import — the marker-normalizing
// pre-pass over chapterStitch's splitChapter, and importChapters producing
// real scenes for marked chapters (byte-identical single-scene output for
// unmarked ones — the regression leg). jsdom: DOM parsing + the store's
// import path both need document.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../../services/settings.js", () => ({
  readSetting: vi.fn(() => null),
  writeSetting: vi.fn(),
  getAllSettings: vi.fn(() => ({})),
  applySettings: vi.fn(),
}));
vi.mock("../../services/projectApi.js", () => ({
  getSnapshot: vi.fn(() => null),
  putSnapshot: vi.fn(),
  removeProject: vi.fn(),
  bootProjects: vi.fn(async () => {}),
  listRegistry: vi.fn(() => []),
  fetchSnapshot: vi.fn(async () => null),
  isRegistryLoaded: vi.fn(() => true),
  createDemoProject: vi.fn(async () => null),
}));
vi.mock("../../services/imageStore.js", () => ({
  removeImage: vi.fn(async () => {}),
}));
vi.mock("../../stores/ui.js", () => ({
  useUiStore: () => ({ showToast: vi.fn(), select: vi.fn() }),
}));
vi.mock("../../stores/sessions.js", () => ({
  useSessionsStore: () => ({ recordChapterWords: vi.fn() }),
}));

import { splitHtmlIntoScenes } from "../sceneSplit.js";
import { useProjectStore } from "../../stores/project.js";

describe("splitHtmlIntoScenes", () => {
  it("splits on every marker form and consumes the marker", () => {
    for (const marker of ["<p>* * *</p>", "<p>***</p>", "<p>#</p>", "<p>— — —</p>", "<hr>", '<p class="scene-mark">* * *</p>']) {
      const parts = splitHtmlIntoScenes(`<p>Scene one prose.</p>${marker}<p>Scene two prose.</p>`);
      expect(parts.length, marker).toBe(2);
      expect(parts[0].body).toContain("Scene one prose.");
      expect(parts[1].body).toContain("Scene two prose.");
      expect(parts.map((p) => p.body).join("")).not.toContain("* * *");
      expect(parts.map((p) => p.body).join("")).not.toContain("<hr");
    }
  });

  it("detects markers wrapped in styled spans (docx exports)", () => {
    const parts = splitHtmlIntoScenes('<p>One.</p><p style="text-align:center"><span><b>* * *</b></span></p><p>Two.</p>');
    expect(parts.length).toBe(2);
  });

  it("no marker → ONE record with the byte-identical original html", () => {
    const html = "<p>Only scene.</p><p>Continues — with a mid-prose dash.</p>";
    expect(splitHtmlIntoScenes(html)).toEqual([{ title: "", body: html }]);
  });

  it("empty paragraphs are never a break; leading/trailing marker segments drop empties", () => {
    expect(splitHtmlIntoScenes("<p>One.</p><p></p><p>Still one.</p>").length).toBe(1);
    const parts = splitHtmlIntoScenes("<p>* * *</p><p>Only real scene.</p><p>***</p>");
    expect(parts.length).toBe(1);
    expect(parts[0].body).toContain("Only real scene.");
  });

  it("prose containing marker glyphs mid-text never splits", () => {
    expect(splitHtmlIntoScenes("<p>She rated it *** and left.</p><p>He shrugged — twice.</p>").length).toBe(1);
  });
});

describe("importChapters + scene splitting (E5)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("a marked chapter imports as N scenes, untitled", () => {
    const store = useProjectStore();
    const { chapterIds } = store.importChapters({
      chapters: [{ title: "Two Scenes", html: "<p>First.</p><p>* * *</p><p>Second.</p>" }],
    });
    const scenes = store.scenesFor(chapterIds[0]);
    expect(scenes.length).toBe(2);
    expect(scenes[0].body).toContain("First.");
    expect(scenes[1].body).toContain("Second.");
    expect(scenes.every((s) => s.title === "")).toBe(true);
  });

  it("an unmarked chapter keeps today's exact single-scene shape (regression)", () => {
    const store = useProjectStore();
    const html = "<p>Whole chapter body.</p>";
    const { chapterIds } = store.importChapters({
      chapters: [{ title: "Solo", html }],
    });
    const scenes = store.scenesFor(chapterIds[0]);
    expect(scenes.length).toBe(1);
    expect(scenes[0].body).toBe(html);       // byte-identical
    expect(scenes[0].title).toBe("Solo");    // the title-mirror law holds
  });
});
