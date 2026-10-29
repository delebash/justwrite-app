// A shortcut reads as the computer's own keys: ⌘⇧F on a Mac, Ctrl+Shift+F elsewhere (the sidebar, the command
// palette and Search wrote ⌘ on every computer until 2026-10-29).
import { describe, expect, it } from "vitest";
import { shortcutKeys } from "./shortcutKeys.js";

describe("shortcutKeys", () => {
  it("writes a Mac's glyphs run together", () => {
    expect(shortcutKeys("mod+shift+F", { mac: true })).toBe("⌘⇧F");
    expect(shortcutKeys("alt+M", { mac: true })).toBe("⌥M");
  });
  it("writes Windows' and Linux's key names joined by +", () => {
    expect(shortcutKeys("mod+shift+F", { mac: false })).toBe("Ctrl+Shift+F");
    expect(shortcutKeys("mod+\\", { mac: false })).toBe("Ctrl+\\");
  });
});
