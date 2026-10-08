// SPDX-License-Identifier: MIT
// Port of tests/test_routing.py — /v1/ai/routing, the Features-tab editor over the shared
// routing store (the global default LLM + embedding), and the shared buildLlmConfig that
// turns it into the dispatch view. Per-feature pins were removed 2026-07-15 (the action's
// preset owns routing).
import { buildLlmConfig } from "@delebash/llm-runner/llm";
import { expect, test } from "vitest";
import { FEATURE_CATALOG } from "../src/feature_catalog.js";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

test("catalog_size", async () => {
  await client(tmpPath());
  expect(FEATURE_CATALOG.length).toBe(22); // +characterProfile (E) +characterVoice (WS8)
});

test("get_routing_returns_full_catalog", async () => {
  const c = await client(tmpPath());
  const body = (await c.get("/v1/ai/routing")).json();
  expect(body.default).toEqual({ llmId: "", model: "", embeddingId: "", embeddingModel: "" });
  const feats = Object.fromEntries(body.features.map((f) => [f.key, f]));
  expect(new Set(Object.keys(feats))).toEqual(new Set(FEATURE_CATALOG.map((e) => e.key)));
  expect(feats.critique.label).toBe("Critique");
  // Per-feature pins are gone — the row is catalog metadata only, no `pins` map.
  expect("providerId" in feats.critique).toBe(false);
  expect("pins" in body).toBe(false);
});

test("put_persists_default_and_drives_dispatch", async () => {
  const c = await client(tmpPath());
  const payload = { default: { llmId: "openai", embeddingId: "openai", embeddingModel: "text-embedding-3-small" } };
  expect((await c.put("/v1/ai/routing", { json: payload })).statusCode).toBe(200);

  const got = (await c.get("/v1/ai/routing")).json();
  expect(got.default.embeddingId).toBe("openai");
  expect(got.default.embeddingModel).toBe("text-embedding-3-small");

  // The feature-pin layer RETIRED entirely (kit 1952c6a — presets own routing); the config
  // no longer carries the attribute at all. Pin the absence so a resurrection has to come
  // back through a deliberate change, not a leftover.
  const cfg = buildLlmConfig();
  expect("featurePins" in cfg || "feature_pins" in cfg).toBe(false);
});
