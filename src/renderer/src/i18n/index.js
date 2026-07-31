// vue-i18n setup.
//
// ADDING A LANGUAGE IS DROPPING A FILE IN `./locales/`. There is no list to update, no import
// to add, and no label to write. Everything below is derived.
//
// This file used to name every locale three times — an import, a `messages` entry and a
// `{ code, label }` row — so shipping Spanish meant three hand edits and shipping French would
// mean three more. That is a mapping living in code, which CLAUDE.md's "NOTHING hardcoded"
// invariant exists to prevent, and it is the kind of thing that silently rots: add the file,
// forget one of the three, and the language is either missing or half-registered.
//
// The active locale is sourced from `useUiStore().locale` and applied on boot (see main.js);
// the Settings → Project language picker writes back through ui.setLocale().

import { createI18n } from "vue-i18n";

// Vite inlines every match at BUILD time, so this is a static import graph, not a runtime read
// — the bundle is identical to hand-written imports.
const modules = import.meta.glob("./locales/*.json", { eager: true });

// A locale FILE is `<code>.json`, where code is `es` or `pt-BR`. The pattern deliberately
// refuses anything else in this folder: tooling writes `es.accepted.json` and `es.notes.json`
// beside translations, and those must never be mistaken for a language called "es.accepted".
const LOCALE_FILE = /\/([a-z]{2}(?:-[A-Za-z]{2,4})?)\.json$/;

// `en` first — it is the fallback for a missing locale or a missing key, so it has to be the
// first entry regardless of alphabetical order. The rest follow by their own name.
const found = Object.entries(modules)
  .map(([path, mod]) => [path.match(LOCALE_FILE)?.[1], mod.default ?? mod])
  .filter(([code, msgs]) => code && msgs)
  .sort(([a], [b]) => (a === "en" ? -1 : b === "en" ? 1 : a.localeCompare(b)));

const messages = Object.fromEntries(found);

/**
 * A language's name in its OWN language — "Español", not "Spanish".
 *
 * Someone hunting for their language is looking for the word they would use for it, not for
 * whatever the current UI happens to call it. `Intl.DisplayNames` ships this for every locale
 * the runtime knows, which is why there is no table of labels here and no seed row either.
 *
 * Spanish and French write their language names lowercase; a picker item reads better
 * capitalised, so only the first character is raised — the rest of the string is left exactly
 * as the runtime produced it, because casing rules are the runtime's business, not ours.
 */
function labelFor(code) {
  let name = code;
  try {
    name = new Intl.DisplayNames([code], { type: "language" }).of(code) || code;
  } catch {
    // An unknown or malformed tag falls back to the code itself, which is still selectable.
  }
  return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
}

export const AVAILABLE_LOCALES = found.map(([code]) => ({ code, label: labelFor(code) }));

// Resolve the browser's preferred locale to one we ship, falling back to the first entry.
// Called by main.js when there is no persisted user choice.
export function detectLocale() {
  const supported = new Set(AVAILABLE_LOCALES.map((l) => l.code.toLowerCase()));
  const byBase = new Map(AVAILABLE_LOCALES.map((l) => [l.code.split("-")[0].toLowerCase(), l.code]));
  const candidates = (navigator.languages?.length ? navigator.languages : [navigator.language || "en"])
    .map((l) => String(l || "").toLowerCase());
  for (const c of candidates) {
    if (supported.has(c)) return AVAILABLE_LOCALES.find((l) => l.code.toLowerCase() === c).code;
    const base = c.split("-")[0];
    if (byBase.has(base)) return byBase.get(base);
  }
  return AVAILABLE_LOCALES[0].code;
}

export const i18n = createI18n({
  legacy: false,            // Composition API mode (we're Vue 3)
  globalInjection: true,    // $t available in templates without import
  locale: AVAILABLE_LOCALES[0].code, // overridden post-boot in main.js
  fallbackLocale: AVAILABLE_LOCALES[0].code,
  messages,
  missingWarn: false,       // chatty in dev otherwise
  fallbackWarn: false,
});

// Imperative helpers for non-component callers.
export function t(key, params) { return i18n.global.t(key, params); }
export function setLocale(code) { i18n.global.locale.value = code; }
export function currentLocale() { return i18n.global.locale.value; }
