// The KIT embedApi (moved in C5) — the lazy P3 ensure cache (_resetEnsureCache
// is the recorded test seam) + the embed call's input/output mapping. The kit
// module is imported REAL via the alias subpath (the aiFeature.test.js
// precedent); only the kit client transport is mocked. Every path here is
// deterministic (statuses resolve on the first poll).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@delebash/llm-ui/client.js", () => ({ request: vi.fn() }));

import { request } from "@delebash/llm-ui/client.js";

import {
  _resetEnsureCache,
  embedTexts,
  ensureEmbeddingReady,
} from "@delebash/llm-ui/services/embedApi.js";

const ENSURE_URL = "/v1/llm-runner/ensure-embedding";
const RESIDENT_URL = "/v1/llm-runner/resident";
const EMBED_URL = "/v1/ai/embeddings";

function ensureCalls() {
  return request.mock.calls.filter(([u]) => u === ENSURE_URL).length;
}

// Route the single request() mock by URL.
function routes({ ensure, resident, embed } = {}) {
  request.mockImplementation(async (url, opts) => {
    if (url === ENSURE_URL) {
      if (typeof ensure === "function") return ensure(opts);
      return ensure ?? { ok: true, modelId: "nomic" };
    }
    if (url === RESIDENT_URL) {
      if (typeof resident === "function") return resident(opts);
      return resident ?? { models: [{ id: "nomic", status: "loaded" }] };
    }
    if (url === EMBED_URL) {
      if (typeof embed === "function") return embed(opts);
      return embed ?? { embeddings: [] };
    }
    throw new Error(`unexpected url ${url}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetEnsureCache();
});

describe("ensureEmbeddingReady", () => {
  it("is a no-op for cloud/Ollama providers", async () => {
    await ensureEmbeddingReady("openai", "openai-compat");
    expect(request).not.toHaveBeenCalled();
  });

  it("ensures ONCE per session for the bundled runner (cached promise)", async () => {
    routes({});
    await ensureEmbeddingReady("builtin", "local-llamacpp");
    await ensureEmbeddingReady("builtin", "local-llamacpp");
    expect(ensureCalls()).toBe(1);
    expect(request).toHaveBeenCalledWith(
      ENSURE_URL,
      expect.objectContaining({ method: "POST", body: {} }),
    );
  });

  it("re-ensures when the requested embedding model changes (#9)", async () => {
    routes({ embed: { embeddings: [[1]] } });
    // first search with model A lazy-loads; a repeat with A reuses the cache…
    await embedTexts({ providerId: "b", providerType: "local-llamacpp", model: "embed-a", input: "x" });
    await embedTexts({ providerId: "b", providerType: "local-llamacpp", model: "embed-a", input: "y" });
    expect(ensureCalls()).toBe(1);
    // …but switching to model B must re-ensure (the old cache replayed "ready"
    // for the previous model and the first embed after a switch failed).
    await embedTexts({ providerId: "b", providerType: "local-llamacpp", model: "embed-b", input: "z" });
    expect(ensureCalls()).toBe(2);
  });

  it("accepts a sleeping resident (reloads on next request)", async () => {
    routes({ resident: { models: [{ id: "nomic", status: "sleeping" }] } });
    await expect(ensureEmbeddingReady("builtin", "local-llamacpp")).resolves.toBeUndefined();
  });

  it("skips polling when no local embed is configured (ok:false)", async () => {
    routes({ ensure: { ok: false } });
    await ensureEmbeddingReady("builtin", "local-llamacpp");
    const residentCalls = request.mock.calls.filter(([u]) => u === RESIDENT_URL).length;
    expect(residentCalls).toBe(0);
  });

  it("rejects with the settings hint when the model load fails, then self-heals", async () => {
    routes({ resident: { models: [{ id: "nomic", status: "error" }] } });
    await expect(ensureEmbeddingReady("builtin", "local-llamacpp"))
      .rejects.toThrow(/failed to load/);
    // the failed ensure cleared its own cache → a retry re-posts
    routes({});
    await ensureEmbeddingReady("builtin", "local-llamacpp");
    expect(ensureCalls()).toBe(2);
  });
});

describe("embedTexts", () => {
  it("wraps a scalar input, returns vectors in order, filters junk rows", async () => {
    routes({ embed: { embeddings: [[1, 2], "junk", [3]] } });
    const out = await embedTexts({ providerId: "p", providerType: "openai-compat", input: "one" });
    expect(out).toEqual([[1, 2], [3]]);
    expect(request).toHaveBeenCalledWith(
      EMBED_URL,
      expect.objectContaining({
        method: "POST",
        body: { providerId: "p", model: "", input: ["one"], taskType: "" },
      }),
    );
  });

  it("forwards taskType so the server applies the model's embed template (Move 0)", async () => {
    routes({ embed: { embeddings: [[1]] } });
    await embedTexts({
      providerId: "p", providerType: "openai-compat", model: "nomic-embed-text",
      input: ["chunk"], taskType: "document",
    });
    expect(request).toHaveBeenCalledWith(
      EMBED_URL,
      expect.objectContaining({
        body: { providerId: "p", model: "nomic-embed-text", input: ["chunk"], taskType: "document" },
      }),
    );
  });

  it("returns [] for an empty input array without calling the server", async () => {
    expect(await embedTexts({ providerId: "p", providerType: "x", input: [] })).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });

  it("requires providerId and input", async () => {
    await expect(embedTexts({ input: "x" })).rejects.toThrow(/providerId/);
    await expect(embedTexts({ providerId: "p" })).rejects.toThrow(/input/);
  });

  it("a real embed failure drops the cached ensure so the next call re-prepares", async () => {
    // 1st call: ensure succeeds, embed fails hard (router died) → cache cleared.
    routes({ embed: () => Promise.reject(new Error("connection refused")) });
    await expect(embedTexts({ providerId: "b", providerType: "local-llamacpp", input: "x" }))
      .rejects.toThrow(/connection refused/);
    const ensures = ensureCalls();
    // 2nd call: the ensure must run AGAIN (cache was dropped by the failure).
    routes({ embed: { embeddings: [[9]] } });
    expect(await embedTexts({ providerId: "b", providerType: "local-llamacpp", input: "x" })).toEqual([[9]]);
    expect(ensureCalls()).toBe(ensures + 1);
  });

  it("an ABORT does not drop the cached ensure", async () => {
    routes({
      embed: () => {
        const e = new Error("Aborted");
        e.name = "AbortError";
        return Promise.reject(e);
      },
    });
    await expect(embedTexts({ providerId: "b", providerType: "local-llamacpp", input: "x" }))
      .rejects.toThrow(/Aborted/);
    request.mockImplementation(async (url) => {
      if (url === ENSURE_URL) throw new Error("must not re-ensure");
      return { embeddings: [[7]] };
    });
    expect(await embedTexts({ providerId: "b", providerType: "local-llamacpp", input: "x" })).toEqual([[7]]);
  });

  it("retries ONCE through a transient failure — the router-bounce window (2026-07-11)", async () => {
    // Switching the embedding default re-emits the .ini and BOUNCES the router; the
    // first batch after a switch used to surface that ~2s window as "Bad gateway".
    // The retry re-ensures (which waits for the child) and re-sends once.
    let embedAttempts = 0;
    routes({
      embed: () => {
        embedAttempts += 1;
        if (embedAttempts === 1) return Promise.reject(new Error("502 Bad gateway"));
        return { embeddings: [[5, 5]] };
      },
    });
    expect(await embedTexts({ providerId: "b", providerType: "local-llamacpp", input: "x" }))
      .toEqual([[5, 5]]);
    expect(embedAttempts).toBe(2);
    expect(ensureCalls()).toBe(2); // the retry re-ensured before re-sending
  });
});
