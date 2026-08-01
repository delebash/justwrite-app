// Bible-only chat (2026-07-18, user decision): with NO index, askManuscript /
// askAsCharacter answer from story-bible pins alone — ZERO embedding calls (works
// with providers that have no embeddings API), retrieval skipped, bibleOnly: true
// on the result. With an index, the full path is byte-identical (embed + search
// still run). The old hard-throw ("No index built yet") is gone.
import { beforeEach, describe, expect, it, vi } from "vitest";

const runAiFeatureStream = vi.fn(async () => ({ content: "Grounded answer.", usage: { promptTokens: 1 } }));
const embedTexts = vi.fn(async () => [[0.1, 0.2, 0.3]]);
vi.mock("@delebash/llm-ui", () => ({
  runAiFeatureStream: (...a) => runAiFeatureStream(...a),
  embedTexts: (...a) => embedTexts(...a),
  friendlyAiError: (e) => e,
}));

const status = vi.fn(async () => ({ exists: false }));
const search = vi.fn(async () => []);
vi.mock("@renderer/services/rag/vectorStore.js", () => ({
  status: (...a) => status(...a),
  search: (...a) => search(...a),
}));

// Minimal project-store stand-in with every field buildEntityCards reads.
// All rich-text bodies empty → the card builder never touches the DOM (node env).
const projectState = {
  activeProjectId: "p1",
  characters: [
    { id: "c1", name: "Mara Voss", main: true, role: "lead", oneLiner: "Maps what others fear." },
    { id: "c2", name: "Tobin Ash", main: true },
  ],
  characterExtras: {}, locations: [], objects: [], groups: [],
  worldbuilding: [], notes: [], strands: [], architecture: {}, events: {},
  allChapters: [], scenesFor: () => [],
};
vi.mock("@renderer/stores/project.js", () => ({ useProjectStore: () => projectState }));

const ensureEmbeddingDefaults = vi.fn(async () => ({ id: "prov", providerType: "gemini" }));
vi.mock("@renderer/stores/ai.js", () => ({
  useAiStore: () => ({
    ensureEmbeddingDefaults: (...a) => ensureEmbeddingDefaults(...a),
    embeddingModelFor: () => "embed-model",
  }),
}));

const { askManuscript } = await import("@renderer/services/rag/chat.js");
const { askAsCharacter } = await import("@renderer/services/rag/characterChat.js");

beforeEach(() => {
  vi.clearAllMocks();
  status.mockResolvedValue({ exists: false });
  projectState.characters = [
    { id: "c1", name: "Mara Voss", main: true, role: "lead", oneLiner: "Maps what others fear." },
    { id: "c2", name: "Tobin Ash", main: true },
  ];
});

describe("bible-only book chat (no index)", () => {
  it("answers a corpus question from pins alone — zero embed calls, roster cited", async () => {
    const r = await askManuscript({ question: "What is this book about?" });
    expect(r.bibleOnly).toBe(true);
    expect(embedTexts).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
    expect(ensureEmbeddingDefaults).not.toHaveBeenCalled(); // no embed provider REQUIRED
    expect(r.citations.every((c) => c.pinned)).toBe(true);
    expect(r.citations.map((c) => c.chunk.id)).toContain("card:cast:main");
    const excerpts = runAiFeatureStream.mock.calls[0][0].variables.excerpts;
    expect(excerpts).toContain("Main cast:");
  });

  it("answers a named question with that entity's card pinned", async () => {
    const r = await askManuscript({ question: "Who is Mara Voss?" });
    expect(r.bibleOnly).toBe(true);
    expect(r.citations.some((c) => c.chunk.entityId === "c1")).toBe(true);
    expect(embedTexts).not.toHaveBeenCalled();
  });

  it("throws the honest empty-project error when there is nothing to ground on", async () => {
    projectState.characters = [];
    await expect(askManuscript({ question: "What is this book about?" }))
      .rejects.toThrow(/Nothing to answer from yet/);
    expect(runAiFeatureStream).not.toHaveBeenCalled();
  });
});

describe("full mode regression (index exists)", () => {
  it("still embeds the query and searches — bibleOnly false", async () => {
    status.mockResolvedValue({ exists: true, model: "embed-model" });
    search.mockResolvedValue([
      { chunk: { chapterNum: 1, chapterTitle: "A", sceneIdx: 0, text: "prose" }, cosScore: 0.9, bmScore: 1 },
    ]);
    const r = await askManuscript({ question: "What happened at the quay?" });
    expect(r.bibleOnly).toBe(false);
    expect(embedTexts).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledTimes(1);
    expect(r.citations.length).toBeGreaterThan(0);
  });
});

describe("bible-only character chat (no index)", () => {
  it("interviews from the profile alone — empty excerpts allowed, zero embed calls", async () => {
    const r = await askAsCharacter({ characterId: "c1", question: "What do you want?" });
    expect(r.bibleOnly).toBe(true);
    expect(embedTexts).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
    const vars = runAiFeatureStream.mock.calls[0][0].variables;
    expect(vars.characterName).toBe("Mara Voss");
    expect(vars.characterProfile).toContain("lead"); // profile still grounds the interview
  });
});
