# The writer's editor, rebuilt plan (2026-10-18)

Replaces the 2026-07-26 executor plan (archived: `archive/2026-07-26-editor-expansion-executor-plan.md`),
which was never launched and had gone stale (Moby, Harper 2.4.0, pre-Quasar paths). The research it
came from stays live: [`2026-07-26-writers-editor-gap-research.md`](2026-07-26-writers-editor-gap-research.md).

**The user's words.** "rethink plan adverserially" (2026-10-18), then, on the rethought plan and its
three open choices: "your rec on all keep going unitl you have no more porblems think on them your
self take your own rec … i want this finished all probs sovled all suggetions taken". The choices,
each taken on my rec after a second look:

- **A. A book language — yes.** The second look found more than the English-only gate: the EPUB
  export writes `dc:language` `en` for every book (`src/services/export/epub.js:118`), and the
  exporters' own words ("Contents", "Chapter 3") stay English until a book language exists (the
  2026-10-13 ruling; IDEAS "A book language"). The field is IDEAS' "Book language", not a new name.
- **B. Grammar checking (Harper) — not now.** English only, a large WASM package, a second set of
  squiggles beside the browser's; no ask for grammar on record.
- **C. Thesaurus — dropped.** The rec was WordNet "after a quick quality and size check"; the check
  failed it (below). Rewrite already gives alternatives in context (select a word, shift-click
  Rewrite for three; or Rewrite with direction).

## The thesaurus check (2026-10-18, scratch install)

| Package | Size | What it gave |
|---|---|---|
| `natural` 8.1.1 (WordNet) | 14 MB + `wordnet-db` 34 MB | depends on mongoose, pg, redis, memjs — database drivers in our server for a word list |
| `wordnet` 2.0.0 (2022) | 27 MB | synonym sets only: *walk* → walking; *angry*, *beautiful* → nothing; *looked*, *ran*, *said* → no entry (no inflections) |
| `synonyms` 1.0.1 (2022) | 2.1 MB | the same WordNet sets: *walk* → walking, walkway, paseo |

A writer's thesaurus out of WordNet needs its other relations (similar-to, troponyms) and
inflection — our own query layer, NOT STANDARD — and the server-side readers need a 27–34 MB data
folder the phone's in-app server (a web worker) can't read. Moby's npm package (1.1.2, 2022) pulls
express and jade. Not worth it beside Rewrite.

## Order and pieces

Each piece names its standard. Nothing here is NOT STANDARD.

### 1. The daily target on Home

Settings → Project's **Daily target** (`projects.daily_target`, default 1,200) is stored and read
nowhere; its hint promises a "Home streak ring" that doesn't exist, and core-concepts.md says the
same. Home's **Today's session** card gains a bar: today's words toward the target, with the
target in its caption; a target of 0 hides it. The hint and the docs say what it does.
Standard: the kit's `UiProgress` (Quasar's QLinearProgress — quasar.dev/vue-components/linear-progress).

### 2. The book language

`projects.language` (BCP-47, `en` for every book so far — they all exported as English), in
Settings → Project beside the title and author: a select of the family's languages named in the
interface's language. A new book starts in the interface's language.
- **Where the list lives:** docgen's 77 codes (`server/src/config/languages.json`, its translation
  targets) move to the kit, `@delebash/core/platform/languages.js`, and docgen reads them there —
  the family rule (a list two apps need is the kit's).
- **What follows it:** the EPUB's `dc:language` and each page's `lang`; the exporters' words
  (Contents, Chapter N, by Author, Untitled) in the book's language when JustWrite has a catalog
  for it, else English; the editor's `lang`; the desktop spellchecker's languages (piece 4).
- Standards: an added column as `ai_scene_drafting` was (`ADDED_COLUMNS`, sync schema 6);
  EPUB 3.3 dc:language (w3.org/TR/epub-33/#sec-opf-dclanguage); the HTML `lang` attribute;
  vue-i18n's per-call locale (vue-i18n.intlify.dev/api/composition.html — `t(key, named, { locale })`);
  `Intl.DisplayNames` (the kit's `languageName`).

### 3. Prose highlights

Writing settings gains three switches, off by default, beside **Highlight AI-written text**:
**Filter words**, **-ly adverbs**, **AI-tell phrases**. Each marks its matches in the editor with
a tint and a hover note; English books only (the catalogs are English — the 2026-10-13 ruling).
The catalogs are the ones Analysis already uses (styleMetrics' filter words and adverb rule,
aiTellScanner's phrases), exported from there, not copied. Left out on the second look: dialogue
(Analysis shows the share; a tint over every quote is noise) and passive voice (styleMetrics' own
note: false positives are common).
Standard: ProseMirror inline decorations (prosemirror.net/docs/ref/#view.Decoration^inline) in a
TipTap extension's `addProseMirrorPlugins`, the way `searchReplace.js` marks its matches — view-only,
never in the document or the undo history.

### 4. Spelling

- **The story bible's names aren't misspelled.** Every character, location, object and group name
  in the open book gets `spellcheck="false"` in the editor (a decoration, as piece 3). The second
  look rejected Electron's `addWordToSpellCheckerDictionary`: on Windows 10+ and macOS it writes
  into the OS's own dictionary — every book's names, behind the user's back — and it does nothing
  in a browser. The attribute works in the desktop app, a browser tab and the phone.
  Standard: the HTML spellcheck attribute (html.spec.whatwg.org/multipage/interaction.html#spelling-and-grammar-checking).
- **The desktop app gets the spelling menu it promises.** The editor's right-click menu ends with
  **Show the browser menu** ("the NEXT right-click is the native menu, with spell-check
  suggestions") — but Electron shows no menu unless the app builds one, and the kit's shell
  doesn't, so in the desktop app the second right-click shows nothing. The kit's shell adopts
  `electron-context-menu` (sindresorhus, 5.1.0): suggestions, Add to dictionary (the user's own
  act), cut/copy/paste; no "Search with Google". Its words come from the app like the tray's
  (`setContextMenuLabels`); the shell sets the spellchecker's languages from the app
  (`setSpellCheckerLanguages`: the book's language, then the interface's, each only when the OS
  has it). Standard: electronjs.org/docs/latest/tutorial/spellchecker; the package.
- The menu item's "right-click again" is hard-coded English (`RichEditor.vue`): a key.

## Blast radius (greps, 2026-10-18)

- `dailyTarget`: `src/pages/SettingsPage.vue:799-804`, `src/stores/project.js:527`,
  `server/src/book_io.js:213,790` — no other reader.
- `language: "en"` / `lang="en"` in exports: `src/services/export/epub.js:118,141`; the English
  words: `docx.js:68,73,74,100`, `pdf.js:79,85,103`, `epub.js:155,198,218,223`,
  `manuscript.js:21`. Callers of the exporters: `src/pages/ExportPage.vue` (one path each).
- docgen's `languages.json`: `server/src/api/setup_api.js:35`, its only reader.
- The shell's commands: `just-core/packages/core/src/shell/main.js` COMMANDS and `preload.js`
  COMMANDS (must match); JustWrite's `src/services/native.js`. Every app's window gets the
  context menu: JustVoice, docgen, just-house-paint and the template showed none until now.
- Editor decorations: `RichEditor.vue` builds its extensions from `editorExtensions()`
  (`server/src/editor/editorSchema.js`, shared with the server's sync) — the new plugins are the
  renderer's only, appended in RichEditor, so the server's schema is untouched.

## Checks

Unit tests for each new pure piece (the language list and pick, the decoration builders, the
exporters' words); server tests for the column; the smoke; screenshots of Home, Settings → Project
and the editor with highlights at 1280 and 390 px, in English and Spanish; an EPUB export of a
Spanish-tagged book read back. **Not verifiable from this session:** the squiggles themselves —
Chromium's spellchecker never flagged a word in a test window here (even "Zorbly"), so the names'
missing squiggles and the desktop menu's suggestions need one look on the user's machine.
