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
// The active locale is sourced from `useUiStore().locale` and applied on boot (boot/jw.js; boot/i18n.js installs the instance);
// the Settings → Project language picker writes back through ui.setLocale().
//
// The kit's words come first: the instance starts from the kit's catalogs (`kit.*`) and JustWrite's
// own are merged over them, so a `kit.*` key here would reword the kit's (the vue-i18n standard;
// just-core/docs/plans/2026-10-12-i18n-standard.md).

import { createI18n } from "vue-i18n";
import { catalogsFromFiles, kitMessages, languageName } from "@delebash/ui/i18n/index.js";

// Vite inlines every match at BUILD time, so this is a static import graph, not a runtime read
// — the bundle is identical to hand-written imports.
const modules = import.meta.glob("./locales/*.json", { eager: true });

// A locale FILE is `<code>.json`, where code is `es` or `pt-BR` — the kit's one rule
// (catalogsFromFiles): tooling writes `es.accepted.json` and `es.notes.json` beside
// translations, and those must never be mistaken for a language called "es.accepted".
// `en` first — it is the fallback for a missing locale or a missing key, so it has to be the
// first entry regardless of alphabetical order. The rest follow by their own name.
const found = Object.entries(catalogsFromFiles(modules))
  .sort(([a], [b]) => (a === "en" ? -1 : b === "en" ? 1 : a.localeCompare(b)));

// Each language is named in itself ("Español") by the kit's languageName — Intl.DisplayNames.
export const AVAILABLE_LOCALES = found.map(([code]) => ({ code, label: languageName(code) }));

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

// Named date and number formats (vue-i18n's datetimeFormats / numberFormats), the shapes the
// screens share. The Intl options are the same in every language — Intl writes each one's order,
// names and separators — but every language lists them: vue-i18n formats a named format in the
// language it found it in, so a language without the list would show English dates.
const dateFormats = {
  // a date and time to the second — what Date#toLocaleString() shows
  dateTime: { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" },
  // a day of a month ("Oct 13")
  monthDay: { month: "short", day: "numeric" },
  // a time of day ("3:05 PM")
  time: { hour: "numeric", minute: "2-digit" },
};
const numberFormats = {
  // one decimal, always shown ("15.7", "2.0")
  oneDecimal: { minimumFractionDigits: 1, maximumFractionDigits: 1 },
  // a ratio as a whole percent (0.31 → "31%")
  percent: { style: "percent" },
  // a small ratio, one decimal shown (0.0022 → "0.2%") — a whole percent would read a few AI-written
  // words in a long chapter as "0%"
  percentOneDecimal: { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 },
};
const everyLanguage = (formats) => Object.fromEntries(AVAILABLE_LOCALES.map(({ code }) => [code, formats]));

export const i18n = createI18n({
  legacy: false,            // Composition API mode (we're Vue 3)
  globalInjection: true,    // $t available in templates without import
  locale: AVAILABLE_LOCALES[0].code, // overridden post-boot in main.js
  fallbackLocale: AVAILABLE_LOCALES[0].code,
  messages: kitMessages(),
  datetimeFormats: everyLanguage(dateFormats),
  numberFormats: everyLanguage(numberFormats),
  missingWarn: false,       // chatty in dev otherwise
  fallbackWarn: false,
  // The smoke's build (scripts/smoke.js sets QCLI_I18N_MISSING_ERRORS — Quasar's command-line
  // import.meta.env) reports a key the English catalog lacks as a console error, which fails the
  // smoke: vue-i18n's own `missing` hook in place of a pseudo-locale walk (the i18n plan's D3,
  // ruled 2026-10-15). Only English counts — another language's gap is the ruled fallback.
  ...(import.meta.env.QCLI_I18N_MISSING_ERRORS
    ? {
        missing: (locale, key, _instance, type) => {
          if (type !== "translate" || !i18n.global.te(key, "en")) console.error(`[i18n] missing ${type || "key"}: ${key} (${locale})`);
        },
      }
    : {}),
});
for (const [code, msgs] of found) i18n.global.mergeLocaleMessage(code, msgs);

// Imperative helpers for non-component callers.
export function t(...args) { return i18n.global.t(...args); }
// The same words in English, for text the AI model reads: prompts stay English whatever the
// interface language (ruled 2026-10-13, the i18n plan), so a table the screen and a prompt share
// names its keys once and the prompt side asks for them in English.
export function tEnglish(key, params = {}) { return i18n.global.t(key, params, { locale: "en" }); }
// A book's own words — an export's "Contents", "Chapter 3" — in the book's language, not the
// interface's (2026-10-18, the editor-expansion plan's piece 2; an English novel exported from a
// Spanish screen gets "Contents"): our catalog for that language, or for its base language
// ("es-419" → "es"), else English.
export function bookLocale(language) {
  const code = String(language || "").toLowerCase();
  const codes = AVAILABLE_LOCALES.map((l) => l.code);
  return codes.find((c) => c.toLowerCase() === code)
    || codes.find((c) => c.toLowerCase() === code.split("-")[0])
    || AVAILABLE_LOCALES[0].code;
}
export function tBook(language, key, params = {}) { return i18n.global.t(key, params, { locale: bookLocale(language) }); }
// Numbers and dates in the interface language (vue-i18n's n() and d()): a named format above, or
// Intl options for a one-off shape.
export function n(...args) { return i18n.global.n(...args); }
export function d(...args) { return i18n.global.d(...args); }
export function setLocale(code) { i18n.global.locale.value = code; }
export function currentLocale() { return i18n.global.locale.value; }
