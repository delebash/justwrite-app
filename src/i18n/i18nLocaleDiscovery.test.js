// Adding a language must stay a matter of dropping a file in. Nothing may name a locale twice.
//
// WHY THIS TEST EXISTS. index.js used to name every language three times — an import, a
// `messages` entry, and a `{ code, label }` row — so shipping Spanish took three hand edits and
// shipping French would take three more. That is a mapping living in code, which the
// "NOTHING hardcoded" invariant exists to prevent, and it rots silently: add the file, forget
// one of the three, and the language is missing or half-registered with no error anywhere.
//
// It is now derived from `import.meta.glob` plus `Intl.DisplayNames`. This test reads index.js
// as TEXT to assert nobody quietly puts a list back — the same technique as the sibling i18n
// tests, and for the same reason: what ships is the source, so the source is what to check.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AVAILABLE_LOCALES, detectLocale } from "./index.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SOURCE = readFileSync(new URL("./index.js", import.meta.url), "utf8");

/** Locale files actually on disk — `<code>.json`, never a tooling sidecar. */
const localeFiles = readdirSync(new URL("./locales", import.meta.url))
  .map((f) => f.match(/^([a-z]{2}(?:-[A-Za-z]{2,4})?)\.json$/)?.[1])
  .filter(Boolean);

describe("locale discovery", () => {
  it("registers exactly the locale files on disk — no more, no fewer", () => {
    expect(AVAILABLE_LOCALES.map((l) => l.code).sort()).toEqual([...localeFiles].sort());
  });

  it("BITES: a tooling sidecar is never registered as a language", () => {
    // es.accepted.json and es.notes.json live beside the translations. A careless pattern
    // turns those into a language called "es.accepted" that the picker would offer.
    for (const { code } of AVAILABLE_LOCALES) {
      expect(code).toMatch(/^[a-z]{2}(-[A-Za-z]{2,4})?$/);
    }
  });

  it("BITES: no locale code is hardcoded in index.js", () => {
    // The whole point. Any `import xx from "./locales/…"`, any `{ code: "xx" }`, any
    // `messages = { en, es }` puts the maintenance burden straight back.
    expect(SOURCE).not.toMatch(/import\s+\w+\s+from\s+["']\.\/locales\//);
    expect(SOURCE).not.toMatch(/code:\s*["'][a-z]{2}/);
    expect(SOURCE).toMatch(/import\.meta\.glob/);
  });

  it("BITES: no label is hardcoded either — names come from the runtime", () => {
    expect(SOURCE).not.toMatch(/label:\s*["'][^"']+["']/);
    expect(SOURCE).toMatch(/Intl\.DisplayNames/);
  });

  it("names each language in its own language, capitalised for a picker", () => {
    const byCode = Object.fromEntries(AVAILABLE_LOCALES.map((l) => [l.code, l.label]));
    expect(byCode.en).toBe("English");
    // Spanish writes "español" lowercase; a list item reads better raised, and the rest of the
    // string is left exactly as the runtime produced it.
    if (byCode.es) expect(byCode.es).toBe("Español");
    for (const { label } of AVAILABLE_LOCALES) expect(label.length).toBeGreaterThan(0);
  });

  it("English is first, because it is the fallback for a missing key", () => {
    expect(AVAILABLE_LOCALES[0].code).toBe("en");
  });

  it("detectLocale resolves a region tag to a base locale we ship", () => {
    // `navigator` is getter-only in this runtime, so it is redefined rather than assigned and
    // restored from its original descriptor afterwards.
    const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const stub = (languages) =>
      Object.defineProperty(globalThis, "navigator", { value: { languages }, configurable: true, writable: true });
    try {
      stub(["es-MX", "en-GB"]);
      expect(detectLocale()).toBe(localeFiles.includes("es") ? "es" : "en");
      stub(["xx-YY"]);
      expect(detectLocale()).toBe("en");
    } finally {
      if (original) Object.defineProperty(globalThis, "navigator", original);
      else delete globalThis.navigator;
    }
  });

  it("every registered locale actually has messages behind it", async () => {
    const { i18n } = await import("./index.js");
    for (const { code } of AVAILABLE_LOCALES) {
      expect(Object.keys(i18n.global.getLocaleMessage(code)).length).toBeGreaterThan(0);
    }
  });
});

// Keeps the HERE binding meaningful if someone later adds a path-based assertion.
void HERE;
