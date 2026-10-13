// The family's i18n lint — ONE file, byte-identical in every app and in the kit's ui/ (the guard
// compares them; just-llm-runner/docs/app-structure.md §Q.11). Its only job is the i18n coverage
// rules: Biome (biome.json) lints everything else, so no stylistic rule goes here.
//
//   npm run i18n:lint
//
// Two rules, both errors — a new hardcoded string fails the lint:
// - `no-raw-text` (@intlify, the vue-i18n standard) finds text written straight into a .vue
//   template, or into one of the attributes listed below.
// - `no-literal-string` (eslint-plugin-i18next, ruled 2026-10-13) finds the strings code builds —
//   toasts, dialog titles, column labels, errors — in .js files and in a .vue file's script and
//   bound attributes. What it skips by shape is listed in WORDLESS below; what it skips by place
//   (an id-holding property, a call that takes a key or an event) is in its options.
// What neither reads: a template literal inside a template attribute, and anything inside a
// declaration named in UPPER_CASE — a table of shown words names its keys (`labelKey`) instead
// (the kit's docs/dev/RESEARCH.md §8). Text that stays English on purpose — what the AI model
// reads, the words inside an exported book, ids — carries an eslint-disable comment saying why.

import { fileURLToPath } from "node:url";
import { includeIgnoreFile } from "@eslint/compat";
import vueI18n from "@intlify/eslint-plugin-vue-i18n";
import i18next from "eslint-plugin-i18next";
import vueParser from "vue-eslint-parser";

// Strings that are never words. RegExp objects, not strings: the plugin compiles a string
// without the "u" flag, and \p{…} needs it.
const WORDLESS = [
  // no letters: digits, spaces, punctuation, symbols, marks, and a template literal's escapes
  /^(?:[\d\s\p{P}\p{S}\p{M}]|\\[nrt])*$/u,
  // a number with its unit (0 B, 0 MB, 8px, 50%) — a unit word such as "tok/s" is a key
  /^[\s\p{P}\p{S}]*-?[\d.,]+\s?(?:[A-Za-z]{0,2}B|px|em|rem|ch|vh|vw|fr|ms|s|deg|%)?[\s\p{P}\p{S}]*$/u,
  // CSS: a function anywhere (oklch(…), rgba(…)), one opening a template piece, declarations
  /[a-z-]+\([^)]*\)/u,
  /^[a-z-]+\(/u,
  /^\s*[a-z-]+\s*:\s*[^;]+(?:;\s*[a-z-]+\s*:\s*[^;]+)*;?\s*$/u,
  // class lists whose every class has a dash or underscore (vdiff-scene vdiff-scene--ins)
  /^[a-z]\w*(?:[-_]+\w+)+(?:\s+[a-z]\w*(?:[-_]+\w+)+)*$/u,
  // a template placeholder shown as itself ({{variable}}) and markup built in code (<h2 id="…">)
  /^\{\{\s*\w+\s*\}\}$/u,
  /^\s*<[?!/]?[a-zA-Z]/u,
  // one lower-case or camelCase token: an id, a prop value, an event (primary, modelValue, asc)
  /^[a-z_$][\w$]*$/u,
  // a token with a separator and no space: a class, a key, a path, a MIME type, an event, a
  // query (ui-dialog__body, kit.common.save, /v1/ai/x, update:modelValue) — not a capitalised
  // word ("Story-wide", "Saved.", "Ch.")
  /^(?![A-Z][a-z])[^\s]*[-_.:/#@?&=|][^\s]*$/u,
  // CONSTANT_CASE, HTTP methods and acronyms, with punctuation around them (· QAT, (IQ))
  /^[\s\p{P}\p{S}]*[A-Z][A-Z0-9_]*[\s\p{P}\p{S}]*$/u,
  // PascalCase with two humps or more: a component, icon or product name (ChevronDown, JustWrite)
  /^[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+$/u,
];

export default [
  // What git ignores is not ours to lint — generated bundles (a phone build's worker bundle) —
  // ESLint's documented way: the .gitignore beside this file.
  includeIgnoreFile(fileURLToPath(new URL(".gitignore", import.meta.url))),
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
  {
    files: ["src/**/*.vue", "src/**/*.js"],
    ignores: ["src/**/*.test.js", "src/**/test/**"],
    languageOptions: {
      parser: vueParser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": [
        "error",
        {
          framework: "vue",
          mode: "all",
          "should-validate-template": true,
          words: { exclude: WORDLESS },
          // calls whose string arguments are keys, events, selectors, paths or developer text
          callees: {
            exclude: [
              "t", "\\$t", "te", "\\$te", "d", "\\$d", "n", "\\$n", "kitT", "kitTe", "tEnglish", "i18n(ext)?",
              "emit", "\\$emit", "console\\.\\w+", "require",
              "Error", "TypeError", "RangeError", "DOMException",
              "addEventListener", "removeEventListener", "dispatchEvent", "querySelector(All)?",
              "getElementById", "closest", "matches", "matchMedia", "setAttribute", "getAttribute",
              "removeAttribute", "classList\\.\\w+", "setProperty", "getPropertyValue", "getContext",
              "includes", "indexOf", "startsWith", "endsWith", "split", "join", "replace(All)?",
              "match(All)?", "test", "search", "padStart", "padEnd",
              "postMessage", "dispatch", "commit", "open",
              "request", "fetch", "get", "post", "put", "patch", "del", "delete",
              "getItem", "setItem", "removeItem",
            ],
          },
          // properties whose values are ids, styles or wire values, never shown words
          "object-properties": {
            exclude: [
              "[A-Z_-]+", "class", "classes", "style", "icon", "key", "id", "ref", "type", "intent",
              "size", "variant", "color", "mode", "method", "path", "to", "href", "url", "baseUrl",
              "component", "field", "align", "kind", "status", "state", "phase", "providerType",
              "format", "lang", "locale", "role", "tag", "as", "event", "route", "target", "rel",
              "slot", "dir", "unit", "headers", "Content-Type", "accept", "family", "font", "fontFamily",
              "width", "height", "minWidth", "maxWidth", "left", "top", "right", "bottom", "transform",
              "Authorization", ".*[sS]tyle", "rootMargin", "boxShadow", "background", "accessorKey", "sourceKey",
            ],
          },
          // template attributes that hold ids, classes, styles and layout — never shown words
          "jsx-attributes": {
            exclude: [
              "class", "style", "icon", "name", "key", "id", "ref", "type", "intent", "size", "variant",
              "color", "mode", "to", "href", "src", "for", "role", "align", "as", "tag", "dir", "slot",
              "v-slot", "lang", "rel", "target", "accept", "autocomplete", "inputmode", "transition",
              "data-(?!tip$).+", "width", "height", "viewBox", "d", "fill", "stroke", "xmlns", "anchor",
              "self", "position", "side", "max-width", "maxWidth", "thumb-size", "track-size",
              "view", "preserveAspectRatio", "menu-.+", ".*-class", ".*Class", "app-name",
            ],
          },
          "jsx-components": { include: [], exclude: ["Icon", "code", "kbd"] },
        },
      ],
    },
  },
];
