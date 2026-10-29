// A keyboard shortcut as this computer writes it: "mod" is ⌘ on a Mac and Ctrl elsewhere, "shift" ⇧ or Shift, "alt"
// ⌥ or Alt; a Mac runs its glyphs together, the others join with "+" — "mod+shift+F" reads ⌘⇧F or Ctrl+Shift+F.
// The one formatter for every hint the app shows: the editor's tooltips, the sidebar, the command palette, Search.
// Moved out of RichEditor on 2026-10-29, when the others still wrote ⌘ on every computer.
import { t } from "../i18n/index.js";

const isMac = typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || "");

/** `combo` as "mod+shift+F" (keys joined by "+"; a modifier by its name, any other key as written). */
export function shortcutKeys(combo, { mac = isMac } = {}) {
  const key = { mod: mac ? "⌘" : t("keys.ctrl"), shift: mac ? "⇧" : t("keys.shift"), alt: mac ? "⌥" : t("keys.alt") };
  return combo.split("+").map((k) => key[k] ?? k).join(mac ? "" : "+");
}
