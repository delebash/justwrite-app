// SPDX-License-Identifier: MIT
// The dictionaries JustWrite ships (2026-10-19): one for each book language it speaks — wooorm's
// Hunspell dictionaries (github.com/wooorm/dictionaries; their licences in NOTICE.md), each
// loaded as text the first time a book needs it (Vite's `?raw`; quasar.config.js aliases the
// packages, which export only their Node reader). A book in another language keeps the
// browser's own spellchecker.

const DICTIONARIES = {
  en: () => Promise.all([import("dictionary-en/index.aff?raw"), import("dictionary-en/index.dic?raw")]),
  es: () => Promise.all([import("dictionary-es/index.aff?raw"), import("dictionary-es/index.dic?raw")]),
};

/** The dictionary for a book's language — its own, else its language's ("es-419" → es) — or null. */
export function dictionaryCode(language) {
  const code = String(language || "").toLowerCase();
  if (Object.hasOwn(DICTIONARIES, code)) return code;
  const base = code.split("-")[0];
  return Object.hasOwn(DICTIONARIES, base) ? base : null;
}

/** @returns {Promise<{ aff: string, dic: string }>} */
export async function loadDictionary(code) {
  const [aff, dic] = await DICTIONARIES[code]();
  return { aff: aff.default, dic: dic.default };
}
