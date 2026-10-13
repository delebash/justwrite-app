// The family's i18n lint — ONE file, byte-identical in every app and in the kit's ui/ (the guard
// compares them; just-llm-runner/docs/app-structure.md §Q.11). Its only job is the i18n coverage
// rule: Biome (biome.json) lints everything else, so no stylistic rule goes here.
//
//   npm run i18n:lint
//
// `no-raw-text` finds user-facing text written straight into a .vue template, or into one of the
// attributes listed below. It is an error: a new hardcoded string fails the lint. It does not read
// script code, nor the value of a bound attribute (`:title="'…'"`, `v-tooltip="'…'"`) — those need
// another check (the kit's docs/dev/RESEARCH.md §8).

import vueI18n from "@intlify/eslint-plugin-vue-i18n";
import vueParser from "vue-eslint-parser";

export default [
  {
    files: ["src/**/*.vue"],
    languageOptions: {
      parser: vueParser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: { "@intlify/vue-i18n": vueI18n },
    settings: {
      "vue-i18n": {
        localeDir: "src/i18n/locales/*.json",
      },
    },
    rules: {
      "@intlify/vue-i18n/no-raw-text": [
        "error",
        {
          attributes: {
            "/.+/": ["placeholder", "title", "label", "aria-label", "alt"],
          },
          // Text made only of digits, spaces, punctuation and symbols is never words: close
          // buttons (✕), checkmarks (✓), dividers, key glyphs (⌘). \p{S} is there because Unicode
          // files many of these as symbols, not punctuation (× − ✓ ↑ ⏎). \p{M} is there for the
          // marks that ride on a symbol: U+FE0F, which turns ⚠ into the emoji ⚠️. Double
          // backslashes on purpose: the rule builds a RegExp from this string with the "u" flag.
          ignorePattern: "^[\\d\\s\\p{P}\\p{S}\\p{M}]*$",
          // Elements whose content is never words: an icon, a <code> identifier (`.zip`,
          // `accent2`) and a <kbd> key name (`⌘F`) — ids and key names are not translated.
          ignoreNodes: ["Icon", "code", "kbd"],
        },
      ],
    },
  },
];
