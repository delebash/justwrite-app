// Minimal flat ESLint config whose ONLY job is the i18n coverage rules.
//
// Style and general linting belong to Biome (biome.json) — do NOT add
// stylistic rules here, and do not run this config as a general linter.
// This exists so `no-raw-text` can find user-facing English still hard-coded
// in the renderer's .vue files while the i18n coverage sweep is in progress.
//
//   npm run i18n:lint
//
// `no-raw-text` is "warn" during the sweep; it flips to "error" once every
// view is converted, at which point it becomes a real gate.

import vueI18n from "@intlify/eslint-plugin-vue-i18n";
import vueParser from "vue-eslint-parser";

export default [
  {
    files: ["src/renderer/src/**/*.vue"],
    languageOptions: {
      parser: vueParser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: { "@intlify/vue-i18n": vueI18n },
    settings: {
      "vue-i18n": {
        localeDir: "src/renderer/src/i18n/locales/*.json",
      },
    },
    rules: {
      "@intlify/vue-i18n/no-raw-text": [
        "warn",
        {
          attributes: {
            "/.+/": ["placeholder", "title", "label", "aria-label", "alt"],
          },
          // Numbers / whitespace / punctuation-only nodes are never copy.
          // Double backslashes on purpose: this is a JS string handed to
          // `new RegExp(..., "u")` inside the rule — single ones collapse.
          ignorePattern: "^[\\d\\s\\p{P}]*$",
          // `code` joins Icon (2026-07-26, the i18n-t conversion): a <code>
          // element's content is a code identifier — `.zip`, `accent2`,
          // `.prev.json` — and CLAUDE.md's i18n rules put data values and ids
          // firmly outside translation. Before this, converting the HTML-in-
          // message hints to i18n-t slots would have traded 11 intlify warnings
          // for a dozen bogus no-raw-text ones. This is the rule's own option
          // for the case, not a workaround.
          ignoreNodes: ["Icon", "code"],
        },
      ],
    },
  },
];
