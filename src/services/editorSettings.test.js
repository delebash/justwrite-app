import { uiStack } from "@delebash/ui";
import { describe, expect, it } from "vitest";
import { EDITOR_FONTS, fontStack } from "./editorSettings.js";

describe("the editor's fonts", () => {
  it("offers Atkinson Hyperlegible, with the kit's own stack", () => {
    expect(EDITOR_FONTS.map((f) => f.label)).toContain("Atkinson Hyperlegible");
    expect(fontStack("Atkinson Hyperlegible")).toBe(uiStack("Atkinson Hyperlegible"));
  });
});
