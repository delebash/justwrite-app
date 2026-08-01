// @vitest-environment jsdom
// E1 + E3 (RAG build): the scene presence-link scanner (proposeSceneLinks),
// the batched store action (applyScenePresenceLinks — ONE history entry, no
// duplicate ids), and extractEntities' alias validation. jsdom: the scanner
// strips scene HTML; the store's import path needs document too.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("@delebash/llm-ui", () => ({
  runAiFeature: vi.fn(),
  embedTexts: vi.fn(),
  friendlyAiError: vi.fn((e) => e),
  runAiFeatureStream: vi.fn(),
}));
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

import { runAiFeature } from "@delebash/llm-ui";
import { extractEntities } from "../analysis/entityExtraction.js";
import { proposeSceneLinks } from "../rag/entityMatcher.js";
import { useProjectStore } from "../../stores/project.js";

function seededStore() {
  setActivePinia(createPinia());
  const store = useProjectStore();
  const chId = store.addChapter({ title: "Arrival" });
  const scnId = store.scenesFor(chId)[0]?.id || store.addScene(chId);
  store.setSceneBody(chId, scnId, "<p>Aria met the Harbormaster by the Customs House. Old Salt nodded.</p>");
  store.clearHistory();
  return { store, chId, scnId };
}

describe("proposeSceneLinks (E1/E2 — the shared scanner)", () => {
  it("proposes links for name AND alias hits in scoped chapters, skipping already-set ids", () => {
    const { store, chId, scnId } = seededStore();
    const entities = [
      { kind: "character", entityId: "c1", name: "Aria", aliases: [] },
      { kind: "character", entityId: "c2", name: "The Harbormaster", aliases: ["Old Salt"] },
      { kind: "location", entityId: "l1", name: "Customs House", aliases: [] },
      { kind: "character", entityId: "c3", name: "Bren", aliases: [] }, // not in the prose
    ];
    const proposals = proposeSceneLinks(store, entities, { chapterIds: new Set([chId]) });
    expect(proposals.map((p) => `${p.field}:${p.id}`).sort()).toEqual(
      ["characters:c1", "characters:c2", "locations:l1"],
    );
    expect(proposals[0]).toMatchObject({ chapterId: chId, sceneId: scnId, chapterNum: 1 });
    // A link that's already set is not re-proposed.
    store.applyScenePresenceLinks([{ chapterId: chId, sceneId: scnId, field: "characters", id: "c1" }]);
    const again = proposeSceneLinks(store, entities, { chapterIds: new Set([chId]) });
    expect(again.some((p) => p.id === "c1")).toBe(false);
  });
});

describe("applyScenePresenceLinks (E1 — the batched store action)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("applies a batch as ONE manuscript history entry, merging without duplicates", () => {
    const { store, chId, scnId } = seededStore();
    const applied = store.applyScenePresenceLinks([
      { chapterId: chId, sceneId: scnId, field: "characters", id: "c1" },
      { chapterId: chId, sceneId: scnId, field: "locations", id: "l1" },
      { chapterId: chId, sceneId: scnId, field: "characters", id: "c1" }, // duplicate in batch
      { chapterId: "nope", sceneId: "nope", field: "characters", id: "cX" }, // unknown scene
      { chapterId: chId, sceneId: scnId, field: "bogus", id: "b" }, // invalid field
    ]);
    expect(applied).toBe(2);
    const scene = store.scenesFor(chId)[0];
    expect(scene.characters).toEqual(["c1"]);
    expect(scene.locations).toEqual(["l1"]);
    // ONE undo reverses the whole batch.
    store.undoFor(["manuscript"]);
    const reverted = store.scenesFor(chId)[0];
    expect(reverted.characters || []).toEqual([]);
    expect(reverted.locations || []).toEqual([]);
  });
});

describe("E2 link backfill (whole-book proposals → ticked apply)", () => {
  it("scans the whole book unscoped and applies exactly the ticked links", () => {
    const { store, chId } = seededStore();
    const ch2 = store.addChapter({ title: "Departure" });
    const scn2 = store.scenesFor(ch2)[0]?.id || store.addScene(ch2);
    store.setSceneBody(ch2, scn2, "<p>Aria left the Customs House at dawn.</p>");
    store.clearHistory();
    const entities = [
      { kind: "character", entityId: "c1", name: "Aria", aliases: [] },
      { kind: "location", entityId: "l1", name: "Customs House", aliases: [] },
    ];
    // No chapterIds scope = the E2 whole-book pass (E1 passes origin scopes).
    const proposals = proposeSceneLinks(store, entities);
    expect(proposals.map((p) => `${p.chapterId}:${p.field}:${p.id}`).sort()).toEqual([
      `${chId}:characters:c1`, `${chId}:locations:l1`,
      `${ch2}:characters:c1`, `${ch2}:locations:l1`,
    ].sort());
    // The modal's tick model: the user unticks one row; only ticked rows apply.
    const ticked = proposals.filter((p) => !(p.chapterId === ch2 && p.id === "c1"));
    const applied = store.applyScenePresenceLinks(
      ticked.map((p) => ({ chapterId: p.chapterId, sceneId: p.sceneId, field: p.field, id: p.id })),
    );
    expect(applied).toBe(3);
    expect(store.scenesFor(chId)[0].characters).toEqual(["c1"]);
    expect(store.scenesFor(chId)[0].locations).toEqual(["l1"]);
    expect(store.scenesFor(ch2)[0].characters || []).toEqual([]); // the unticked link stayed off
    expect(store.scenesFor(ch2)[0].locations).toEqual(["l1"]);
    // Re-running the scan proposes nothing that is already set.
    const again = proposeSceneLinks(store, entities);
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ chapterId: ch2, field: "characters", id: "c1" });
  });
});

describe("extractEntities alias validation (E3)", () => {
  it("keeps a clean alias list and drops self-referential/blank entries", async () => {
    runAiFeature.mockResolvedValueOnce({
      content: JSON.stringify({
        characters: [
          { name: "The Harbormaster", role: "official", oneLiner: "Runs the docks.", aliases: ["Old Salt", " ", "the harbormaster"] },
        ],
        locations: [], objects: [],
      }),
    });
    const res = await extractEntities({ html: "<p>prose</p>" });
    expect(res.characters[0].aliases).toEqual(["Old Salt"]); // blank + own-name dropped
  });

  it("defaults aliases to [] when the model omits them", async () => {
    runAiFeature.mockResolvedValueOnce({
      content: JSON.stringify({ characters: [{ name: "Bren" }], locations: [], objects: [] }),
    });
    const res = await extractEntities({ html: "<p>prose</p>" });
    expect(res.characters[0].aliases).toEqual([]);
  });
});
