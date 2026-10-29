// Every message of every catalog compiles (English 2026-10-16; every language 2026-10-29, after the
// Spanish run: a translation can carry a bare `@` as easily as the English). vue-i18n's message
// format gives `@`, `{`, `}` and `|` meanings — `@` starts a linked message — so a literal one
// must be written as {'@'}. A bare
// one fails only when the message is shown, and in the built app the console says no more than
// "SyntaxError: 10": mentionRefs.empty ("Type @ in a scene…") did on every location or object
// without mentions until this test. Each message goes through the app's own vue-i18n, which
// reports a compile error through its warning handler.
import { describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";

// every catalog in locales/ (Vite's import.meta.glob — the app's own i18n/index.js finds them the same way)
const CATALOGS = import.meta.glob("./locales/*.json", { eager: true, import: "default" });

function* messages(node, path = "") {
  for (const [k, v] of Object.entries(node)) {
    const key = path ? `${path}.${k}` : k;
    if (v && typeof v === "object") yield* messages(v, key);
    else if (typeof v === "string") yield key;
  }
}

const LOCALES = Object.entries(CATALOGS).map(([file, catalog]) => [file.match(/([\w-]+)\.json$/)[1], catalog]);

describe.each(LOCALES)("the %s catalog", (locale, catalog) => {
  it("compiles every message", () => {
    const i18n = createI18n({ legacy: false, locale, messages: { [locale]: catalog }, missingWarn: false, fallbackWarn: false });
    const failed = [];
    const warn = vi.spyOn(console, "warn").mockImplementation((...a) => failed.push(a.join(" ").slice(0, 200)));
    const error = vi.spyOn(console, "error").mockImplementation((...a) => failed.push(a.join(" ").slice(0, 200)));
    for (const key of messages(catalog)) {
      try {
        i18n.global.t(key, {});
      } catch (e) {
        failed.push(`${key}: ${e.message}`);
      }
    }
    warn.mockRestore();
    error.mockRestore();
    expect(failed).toEqual([]);
  });
});
