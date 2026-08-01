// modelMeta — the renderer-side tier mirror (consumed by the ai store; the
// canonical copy is the runner's llm/tiers.py). The old parseQuant/entryLabel
// tests died with those helpers' only consumer (the orphaned ModelPicker.vue,
// removed by C5).
import { describe, expect, it } from "vitest";

import { TIERS, getModelTier } from "../modelMeta.js";

describe("getModelTier", () => {
  it("routes reasoning-first families to reasoned", () => {
    expect(getModelTier("deepseek-r1:14b")).toBe("reasoned");
    expect(getModelTier("qwen3.5-27b")).toBe("reasoned");
    expect(getModelTier("glm-4.5-air-thinking")).toBe("reasoned");
  });

  it("routes hybrid qwen3 at 14B+ to reasoned, sub-12B to guided", () => {
    expect(getModelTier("qwen3:14b")).toBe("reasoned");
    expect(getModelTier("qwen3:32b")).toBe("reasoned");
    expect(getModelTier("qwen3:8b")).toBe("guided");
  });

  it("routes known non-reasoning 12B-class models to direct", () => {
    expect(getModelTier("mistral-small:24b")).toBe("direct");
    expect(getModelTier("gemma3:27b")).toBe("direct");
  });

  it("falls back to guided for unknown or empty ids", () => {
    expect(getModelTier("totally-new-model")).toBe("guided");
    expect(getModelTier("")).toBe("guided");
  });

  it("every tier id resolves to a registry entry", () => {
    for (const id of ["guided", "direct", "reasoned"]) expect(TIERS[id].id).toBe(id);
  });
});
