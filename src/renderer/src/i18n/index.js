// vue-i18n setup. Locale messages live in ./locales/<code>.json — add a
// new locale by dropping in a JSON file and registering it in `messages`
// + `AVAILABLE_LOCALES` below.
//
// The active locale is sourced from `useUiStore().locale` and applied on
// boot (see main.js); the Settings → Project language picker writes back
// through ui.setLocale().

import { createI18n } from "vue-i18n";
import en from "./locales/en.json";

// Add new locales here. The first entry is the fallback when a locale
// or key is missing.
export const AVAILABLE_LOCALES = [
  { code: "en", label: "English" },
];

const messages = { en };

// Resolve the browser's preferred locale to one we ship, falling back
// to the first AVAILABLE_LOCALES entry. Called by main.js when there's
// no persisted user choice.
export function detectLocale() {
  const supported = new Set(AVAILABLE_LOCALES.map((l) => l.code));
  const candidates = (navigator.languages?.length ? navigator.languages : [navigator.language || "en"])
    .map((l) => String(l || "").toLowerCase());
  for (const c of candidates) {
    if (supported.has(c)) return c;
    const base = c.split("-")[0];
    if (supported.has(base)) return base;
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
