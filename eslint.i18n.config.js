// Minimal flat ESLint config whose ONLY job is the i18n coverage rules.
//
// Style and general linting belong to Biome (biome.json) — do NOT add
// stylistic rules here, and do not run this config as a general linter.
// This exists so `no-raw-text` can find user-facing English still hard-coded
// in the renderer's .vue files while the i18n coverage sweep is in progress.
//
//   npm run i18n:lint
//
// `no-raw-text` was "warn" during the sweep. The sweep finished 2026-07-30 at
// zero warnings across all 81 renderer .vue files, so it is now "error" — the
// real gate it was always meant to become. A new hardcoded string fails the
// build's lint step rather than adding to a backlog nobody reads.

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
          // Numbers / whitespace / punctuation / SYMBOL-only nodes are never copy.
          // Double backslashes on purpose: this is a JS string handed to
          // `new RegExp(..., "u")` inside the rule — single ones collapse.
          //
          // `\p{S}` added 2026-07-29 after measuring the sweep: 23 warnings were
          // glyph-only nodes the original pattern was plainly meant to cover but
          // missed, because Unicode files these under Symbol, not Punctuation —
          // `×` and `−` are Sm, `✕ ✓ ✦ ↑ ↓ ↵ ⏎ ⌘` are So. They are close buttons,
          // checkmarks, decorative dividers and keyboard glyphs; none is copy, and
          // in no language is `✕` translated. Keeping them as warnings would have
          // meant 23 permanent false entries in the number that decides when this
          // rule flips to "error".
          ignorePattern: "^[\\d\\s\\p{P}\\p{S}]*$",
          // `code` joins Icon (2026-07-26, the i18n-t conversion): a <code>
          // element's content is a code identifier — `.zip`, `accent2`,
          // `.prev.json` — and CLAUDE.md's i18n rules put data values and ids
          // firmly outside translation. Before this, converting the HTML-in-
          // message hints to i18n-t slots would have traded 11 intlify warnings
          // for a dozen bogus no-raw-text ones. This is the rule's own option
          // for the case, not a workaround.
          // `kbd` joins them 2026-07-29: a <kbd> element's content is a KEY NAME,
          // not prose — `⌘F`, `⌘⇧Z / ⌘Y` — and key names are not translated. The
          // Settings shortcut table proves the point: every row's description was
          // already a $t() call while the <kbd> beside it was flagged, and only
          // SOME rows were, because `⌘\` is caught by ignorePattern above while
          // `⌘F` escapes it on the strength of one Latin letter. Same element,
          // same content class, opposite verdicts.
          ignoreNodes: ["Icon", "code", "kbd"],
        },
      ],
    },
  },
];
