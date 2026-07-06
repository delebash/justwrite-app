// modelMeta — pure label/tier helpers (consumed by ModelPicker + the ai store).
import { describe, expect, it } from "vitest";

import { TIERS, entryLabel, getModelTier, parseQuant } from "../modelMeta.js";

describe("parseQuant", () => {
  it("parses Ollama tags and GGUF filenames", () => {
    expect(parseQuant("qwen3:14b-q4_K_M")).toBe("Q4_K_M");
    expect(parseQuant("model-Q5_K_S.gguf")).toBe("Q5_K_S");
    expect(parseQuant("something-IQ3_XS")).toBe("IQ3_XS");
    expect(parseQuant("weights-BF16")).toBe("BF16");
  });

  it("returns null when no quant suffix is encoded", () => {
    expect(parseQuant("gpt-4o")).toBeNull();
    expect(parseQuant("")).toBeNull();
    expect(parseQuant(null)).toBeNull();
  });
});

describe("entryLabel", () => {
  it("prefers the explicit quant field and appends the not-loaded badge", () => {
    expect(entryLabel({ id: "m", quant: "Q4_0", state: "not-loaded" }))
      .toBe("m  ·  Q4_0 · not loaded");
  });

  it("falls back to parsing the id and renders plain when quantless", () => {
    expect(entryLabel({ id: "qwen3:14b-q4_K_M" })).toBe("qwen3:14b-q4_K_M  ·  Q4_K_M");
    expect(entryLabel({ id: "gpt-4o" })).toBe("gpt-4o");
    expect(entryLabel(null)).toBe("");
  });

  it("appends the tier badge when the caller passes one", () => {
    expect(entryLabel({ id: "gpt-4o" }, { tierLabel: "Direct", tierSource: "auto" }))
      .toBe("gpt-4o · Direct (auto)");
  });
});

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
