// embedApi — the lazy P3 ensure cache (_resetEnsureCache is the recorded test
// seam) + the embed call's input/output mapping. The kit transport is mocked;
// every path here is deterministic (statuses resolve on the first poll).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@delebash/llm-ui", () => ({ get: vi.fn(), post: vi.fn() }));

import { get, post } from "@delebash/llm-ui";

import { _resetEnsureCache, embedTexts, ensureEmbeddingReady } from "../embedApi.js";

beforeEach(() => {
  vi.clearAllMocks();
  _resetEnsureCache();
});

describe("ensureEmbeddingReady", () => {
  it("is a no-op for cloud/Ollama providers", async () => {
    await ensureEmbeddingReady("openai", "openai-compat");
    expect(post).not.toHaveBeenCalled();
  });

  it("ensures ONCE per session for the bundled runner (cached promise)", async () => {
    post.mockResolvedValue({ ok: true, modelId: "nomic" });
    get.mockResolvedValue({ models: [{ id: "nomic", status: "loaded" }] });
    await ensureEmbeddingReady("builtin", "local-llamacpp");
    await ensureEmbeddingReady("builtin", "local-llamacpp");
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/v1/llm-runner/ensure-embedding", {}, expect.anything());
  });

  it("accepts a sleeping resident (reloads on next request)", async () => {
    post.mockResolvedValue({ ok: true, modelId: "nomic" });
    get.mockResolvedValue({ models: [{ id: "nomic", status: "sleeping" }] });
    await expect(ensureEmbeddingReady("builtin", "local-llamacpp")).resolves.toBeUndefined();
  });

  it("skips polling when no local embed is configured (ok:false)", async () => {
    post.mockResolvedValue({ ok: false });
    await ensureEmbeddingReady("builtin", "local-llamacpp");
    expect(get).not.toHaveBeenCalled();
  });

  it("rejects with the settings hint when the model load fails, then self-heals", async () => {
    post.mockResolvedValue({ ok: true, modelId: "nomic" });
    get.mockResolvedValue({ models: [{ id: "nomic", status: "error" }] });
    await expect(ensureEmbeddingReady("builtin", "local-llamacpp"))
      .rejects.toThrow(/failed to load/);
    // the failed ensure cleared its own cache → a retry re-posts
    get.mockResolvedValue({ models: [{ id: "nomic", status: "loaded" }] });
    await ensureEmbeddingReady("builtin", "local-llamacpp");
    expect(post).toHaveBeenCalledTimes(2);
  });
});

describe("embedTexts", () => {
  it("wraps a scalar input, returns vectors in order, filters junk rows", async () => {
    post.mockResolvedValue({ embeddings: [[1, 2], "junk", [3]] });
    const out = await embedTexts({ providerId: "p", providerType: "openai-compat", input: "one" });
    expect(out).toEqual([[1, 2], [3]]);
    expect(post).toHaveBeenCalledWith(
      "/v1/ai/embeddings",
      { providerId: "p", model: "", input: ["one"] },
      expect.anything(),
    );
  });

  it("returns [] for an empty input array without calling the server", async () => {
    expect(await embedTexts({ providerId: "p", providerType: "x", input: [] })).toEqual([]);
    expect(post).not.toHaveBeenCalled();
  });

  it("requires providerId and input", async () => {
    await expect(embedTexts({ input: "x" })).rejects.toThrow(/providerId/);
    await expect(embedTexts({ providerId: "p" })).rejects.toThrow(/input/);
  });

  it("a real embed failure drops the cached ensure so the next call re-prepares", async () => {
    // 1st call: ensure succeeds, embed fails hard (router died) → cache cleared.
    post.mockImplementation((url) => {
      if (url === "/v1/llm-runner/ensure-embedding") return Promise.resolve({ ok: true, modelId: "nomic" });
      return Promise.reject(new Error("connection refused"));
    });
    get.mockResolvedValue({ models: [{ id: "nomic", status: "loaded" }] });
    await expect(embedTexts({ providerId: "b", providerType: "local-llamacpp", input: "x" }))
      .rejects.toThrow(/connection refused/);
    const ensures = post.mock.calls.filter(([u]) => u === "/v1/llm-runner/ensure-embedding").length;
    // 2nd call: the ensure must run AGAIN (cache was dropped by the failure).
    post.mockImplementation((url) => {
      if (url === "/v1/llm-runner/ensure-embedding") return Promise.resolve({ ok: true, modelId: "nomic" });
      return Promise.resolve({ embeddings: [[9]] });
    });
    expect(await embedTexts({ providerId: "b", providerType: "local-llamacpp", input: "x" })).toEqual([[9]]);
    const ensures2 = post.mock.calls.filter(([u]) => u === "/v1/llm-runner/ensure-embedding").length;
    expect(ensures2).toBe(ensures + 1);
  });

  it("an ABORT does not drop the cached ensure", async () => {
    post.mockImplementation((url) => {
      if (url === "/v1/llm-runner/ensure-embedding") return Promise.resolve({ ok: true, modelId: "nomic" });
      const e = new Error("Aborted");
      e.name = "AbortError";
      return Promise.reject(e);
    });
    get.mockResolvedValue({ models: [{ id: "nomic", status: "loaded" }] });
    await expect(embedTexts({ providerId: "b", providerType: "local-llamacpp", input: "x" }))
      .rejects.toThrow(/Aborted/);
    post.mockImplementation((url) => {
      if (url === "/v1/llm-runner/ensure-embedding") throw new Error("must not re-ensure");
      return Promise.resolve({ embeddings: [[7]] });
    });
    expect(await embedTexts({ providerId: "b", providerType: "local-llamacpp", input: "x" })).toEqual([[7]]);
  });
});
