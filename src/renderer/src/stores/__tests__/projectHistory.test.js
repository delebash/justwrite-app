// Unit tests for the per-domain, page-related undo (#235) — the store
// mechanics only; live renderer behavior is covered by scripts/undo-probe.mjs.
// Node env: every service the store touches is mocked (the aiFeature.test.js
// pattern); Pinia is real.
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
vi.mock("../ui.js", () => ({
  useUiStore: () => ({ showToast: vi.fn(), select: vi.fn() }),
}));
vi.mock("../sessions.js", () => ({
  useSessionsStore: () => ({ recordChapterWords: vi.fn() }),
}));

import * as projectApi from "../../services/projectApi.js";
import { useProjectStore } from "../project.js";

function freshStore() {
  setActivePinia(createPinia());
  const store = useProjectStore();
  // Reset per-domain stacks AND the module-level coalescing state so a
  // trailing coalesced action from the previous test can't merge into this
  // one (clearHistory nulls lastHistoryAction).
  store.clearHistory();
  return store;
}

// A chapter with one scene, ready for prose edits.
function seedChapter(store) {
  const chId = store.addChapter({ title: "Ch" });
  const scnId = store.addScene(chId);
  store.clearHistory();
  return { chId, scnId };
}

describe("per-domain page-related undo (#235)", () => {
  beforeEach(() => freshStore());

  it("isolates domains: a manuscript undo never touches a character edit", () => {
    const store = useProjectStore();
    const { chId, scnId } = seedChapter(store);
    const cid = store.addCharacter({ name: "Mira" });
    store.setSceneBody(chId, scnId, "<p>draft one</p>");
    store.updateCharacter(cid, { name: "Zed" });

    store.undoFor(["manuscript"]);

    expect(store.scenes[chId][0].body).toBe("");
    expect(store.characterById(cid).name).toBe("Zed");
    // And the character page can still undo its own edit afterwards.
    store.undoFor(["characters"]);
    expect(store.characterById(cid).name).toBe("Mira");
  });

  it("pops the newest entry across a page's domain set (max seq)", () => {
    const store = useProjectStore();
    store.updateProjectMeta({ title: "Book A" });
    const stId = store.addStatusDef({ label: "Polish" });

    // Settings maps [meta, statuses, tagVocab]: first undo = the status add.
    store.undoFor(["meta", "statuses", "tagVocab"]);
    expect(store.statuses.find((s) => s.id === stId)).toBeUndefined();
    expect(store.project.title).toBe("Book A");

    store.undoFor(["meta", "statuses", "tagVocab"]);
    expect(store.project.title).not.toBe("Book A");
  });

  it("keeps redo per-domain: an edit elsewhere doesn't kill it", () => {
    const store = useProjectStore();
    const { chId, scnId } = seedChapter(store);
    store.setSceneBody(chId, scnId, "<p>kept?</p>");
    store.undoFor(["manuscript"]);
    expect(store.canRedoFor(["manuscript"])).toBe(true);

    store.addCharacter({ name: "Bystander" });
    expect(store.canRedoFor(["manuscript"])).toBe(true); // survives

    store.redoFor(["manuscript"]);
    expect(store.scenes[chId][0].body).toBe("<p>kept?</p>");

    store.undoFor(["manuscript"]);
    store.setSceneTitle(chId, scnId, "new title"); // same-domain edit
    expect(store.canRedoFor(["manuscript"])).toBe(false); // invalidated
  });

  it("coalesces a same-action burst into one entry", () => {
    const store = useProjectStore();
    const { chId, scnId } = seedChapter(store);
    store.setSceneBody(chId, scnId, "<p>a</p>");
    store.setSceneBody(chId, scnId, "<p>ab</p>");
    store.setSceneBody(chId, scnId, "<p>abc</p>");
    expect(store._past.manuscript.length).toBe(1);
    store.undoFor(["manuscript"]);
    expect(store.scenes[chId][0].body).toBe("");
  });

  it("captures the trash kind with its owner domain on delete + undo", () => {
    const store = useProjectStore();
    const cid = store.addCharacter({ name: "Doomed" });
    store.clearHistory();
    store.removeCharacter(cid);
    expect(store.trash.characters.some((c) => c.id === cid)).toBe(true);

    store.undoFor(["characters"]);
    expect(store.characterById(cid)).toBeTruthy();
    expect(store.trash.characters.some((c) => c.id === cid)).toBe(false);
  });

  it("captures images per entity key — no cross-entity clobber", () => {
    const store = useProjectStore();
    store.addImage("locations", "l1", { name: "map.png" });
    store.addImage("characters", "c1", { name: "face.png" });

    store.undoFor(["characters"]);
    expect(store.images.c1).toBeUndefined(); // the key itself deletes
    expect(store.images.l1).toHaveLength(1); // untouched

    store.redoFor(["characters"]);
    expect(store.images.c1).toHaveLength(1);
  });

  it("removeStrand leaves chapter refs intact and undo restores the strand", () => {
    const store = useProjectStore();
    const { chId } = seedChapter(store);
    const sid = store.addStrand({ name: "Mystery" });
    // Give the chapter a strand ref directly (the old ref writers are dead).
    store.parts = store.parts.map((p) => ({
      ...p,
      chapters: p.chapters.map((c) => (c.id === chId ? { ...c, strands: [sid] } : c)),
    }));
    store.clearHistory();

    store.removeStrand(sid);
    const refAfter = store.allChapters.find((c) => c.id === chId).strands;
    expect(refAfter).toEqual([sid]); // the sweep is gone — refs stay

    store.undoFor(["strands"]);
    expect(store.strandById(sid)).toBeTruthy(); // strand + its refs both live
  });

  it("removeScene leaves the note's scene anchor untouched", () => {
    const store = useProjectStore();
    const { chId } = seedChapter(store);
    const scn2 = store.addScene(chId);
    const noteId = store.addNote({ title: "Pinned", anchor: { chapterId: chId, sceneId: scn2 } });

    store.removeScene(chId, scn2);
    expect(store.noteById(noteId).anchor).toEqual({ chapterId: chId, sceneId: scn2 });
    // Still findable from the chapter (the tolerance the design relies on).
    expect(store.notesForChapter(chId).map((n) => n.id)).toContain(noteId);
  });

  it("artifact writers record nothing, and undo cannot eat a fresh critique", () => {
    const store = useProjectStore();
    const { chId, scnId } = seedChapter(store);
    const cid = store.addCharacter({ name: "Audited" });
    store.clearHistory();

    store.setSceneBody(chId, scnId, "<p>prose</p>");
    store.setChapterCritique(chId, { notes: [{ message: "tighten" }] });
    store.setChapterReaderKnowledge(chId, { status: "ok" });
    store.setChapterMultiReader(chId, { panel: [1, 2, 3, 4] });
    store.setCharacterAudit(cid, { noteCount: 2 });

    // Only the prose edit recorded — one manuscript entry, nothing else.
    expect(store._past.manuscript.length).toBe(1);
    expect(store._past.characters).toBeUndefined();

    store.undoFor(["manuscript"]); // reverts the prose…
    expect(store.scenes[chId][0].body).toBe("");
    // …but every artifact survives (they live outside the domains).
    expect(store.critiqueFor(chId)).toBeTruthy();
    expect(store.readerKnowledgeFor(chId)).toBeTruthy();
    expect(store.multiReaderFor(chId)).toBeTruthy();
    expect(store.auditFor(cid)).toBeTruthy();
    // The allChapters decoration carries them to the readers.
    expect(store.allChapters.find((c) => c.id === chId).critique).toBeTruthy();
  });

  it("lifts legacy embedded artifacts to the top-level maps on load", () => {
    const store = useProjectStore();
    store.loadSnapshot({
      project: { title: "Legacy" },
      parts: [{
        id: "p1", title: "Part",
        chapters: [{
          id: "chX", num: 1, title: "Old", words: 0, status: "draft", strands: [],
          critique: { notes: [{ message: "legacy" }] },
          readerKnowledge: { status: "old" },
        }],
      }],
      scenes: { chX: [{ id: "s1", title: "", body: "" }] },
      characters: [{ id: "cX", name: "N", audit: { noteCount: 3 } }],
    });

    expect(store.critiqueFor("chX")).toEqual({ notes: [{ message: "legacy" }] });
    expect(store.readerKnowledgeFor("chX")).toEqual({ status: "old" });
    expect(store.auditFor("cX")).toEqual({ noteCount: 3 });
    // The embedded copies are gone from the entity objects.
    const rawChapter = store.parts[0].chapters[0];
    expect(rawChapter.critique).toBeUndefined();
    expect(store.characters[0].audit).toBeUndefined();
  });

  it("carries artifacts on the tombstone: delete keeps them undo-safe, restore re-maps them", () => {
    const store = useProjectStore();
    const { chId } = seedChapter(store);
    const cid = store.addCharacter({ name: "Audited" });
    store.setChapterCritique(chId, { notes: [{ message: "keep me" }] });
    store.setCharacterAudit(cid, { noteCount: 1 });
    store.clearHistory();

    store.removeChapter(chId);
    store.removeCharacter(cid);
    // The tombstones carry the artifacts — the durable path across the
    // server round-trip (live maps only persist for live ids).
    expect(store.trash.chapters.find((c) => c.id === chId).critique).toEqual({ notes: [{ message: "keep me" }] });
    expect(store.trash.characters.find((c) => c.id === cid).audit).toEqual({ noteCount: 1 });

    // Same-session ⌘Z of the deletes: copy semantics keep the live maps
    // intact, so the artifacts are still visible after undo.
    store.undoFor(["characters"]);
    store.undoFor(["manuscript"]);
    expect(store.critiqueFor(chId)).toBeTruthy();
    expect(store.auditFor(cid)).toBeTruthy();

    // Restore path, as after a reload (where non-live map entries were
    // dropped by the server): wipe the maps, delete again, restore — the
    // tombstone copies re-map.
    store.removeChapter(chId);
    store.removeCharacter(cid);
    store.chapterCritiques = {};
    store.characterAudits = {};
    store.restoreFromTrash("chapters", chId);
    store.restoreFromTrash("characters", cid);
    expect(store.critiqueFor(chId)).toEqual({ notes: [{ message: "keep me" }] });
    expect(store.auditFor(cid)).toEqual({ noteCount: 1 });
    // The restored entity objects stay clean — the maps own the artifacts.
    expect(store.parts.flatMap((p) => p.chapters).find((c) => c.id === chId).critique).toBeUndefined();
    expect(store.characters.find((c) => c.id === cid).audit).toBeUndefined();
  });

  it("caps each domain's history independently at the limit", () => {
    const store = useProjectStore();
    for (let i = 0; i < 1005; i++) store.addStatusDef({ label: `s${i}` });
    expect(store._past.statuses.length).toBe(1000);
  });

  it("clears every domain's history on project switch", async () => {
    const store = useProjectStore();
    const { chId, scnId } = seedChapter(store);
    store.setSceneBody(chId, scnId, "<p>gone after switch</p>");
    store.addCharacter({ name: "Left behind" });
    expect(store.canUndoFor(["manuscript"])).toBe(true);

    projectApi.fetchSnapshot.mockResolvedValueOnce({
      project: { title: "Other" }, parts: [], scenes: {}, characters: [],
    });
    await store.switchProject("prj_other");

    expect(store.canUndoFor(["manuscript"])).toBe(false);
    expect(store.canUndoFor(["characters"])).toBe(false);
    expect(store.canRedoFor(["manuscript"])).toBe(false);
  });
});
