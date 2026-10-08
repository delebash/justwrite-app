<!-- SPDX-License-Identifier: MIT -->
# Research register — what we already know, and where the proof is (JustWrite)

**Read the section for your subject before researching anything** — before reading code to
answer a question, before measuring, before briefing an agent. Then grep `docs/plans` for
anything newer. The shared AI stack's facts (the kit, llama.cpp, the memory arbiter) are in
[the kit's register](../../../just-llm-runner/docs/dev/RESEARCH.md).

## The rule (family-wide, decided 2026-10-04)

The user: *"why do we keep re researching stuff, we need a primary research doc that we point to
so we dont keep duplicating or forgeting what we have done in the past"* — approved "your rec on
all go". The kit's register carries the rule in full; in short:

- **Before research:** read the subject's section here and grep `docs/plans`. An agent's brief
  carries that section and the line *"don't re-derive these; re-check one only if the code it
  cites changed after its date"*.
- **After research:** its facts land here in the same change. A research doc with no entry here
  is not done. The family guard (`../just-llm-runner/scripts/check-family.mjs`, check 15) fails
  any `docs/plans/YYYY-MM-DD-*.md` dated 2026-10-04 or later that this page does not link, and
  any link here that points nowhere.
- **Filled as each subject comes up.** Until then a subject's records are indexed below, so
  they can at least be found.
- One fact per bullet, then *how it was checked and when* (measured · code · web · git · record
  · agent), then where the proof is. A fact that turns out wrong is rewritten, ending "(was: …
  until <date>)".

Subjects: [JustWrite on Electron and Node](#justwrite-on-electron-and-node) ·
[Records not yet distilled](#records-not-yet-distilled)

---

## JustWrite on Electron and Node

The family's move, step 4 (2026-10-08). The plan is JustVoice's
`docs/plans/2026-10-07-electron-node-plan.md` §6; the decisions are in JustVoice's TASKS.

- **The dev data root is `<repo>/data`.** It moved from `src-tauri/target/debug/data` on
  2026-10-08; saved absolute paths into it were rewritten by a one-off script with the apps
  closed: 9 database cells (JustWrite's chooser folders — `settings` row `chooserDirs` — and 2 measurement paths,
  JustVoice's cache folder and 3 measurement paths, docgen's cache folder and 1 measurement path),
  18 text files (3 `models.ini`, 15 autosave snapshots) and the family cache registry. Backups:
  `<db>.bak-2026-10-08-before-path-rewrite` beside each database. The 2026-08-15 headless root that
  sat at `<repo>/data` is kept as `data-old-2026-08-15/`. (*measured 2026-10-08*, a re-run of the
  survey found the old path only in the backups.)
- **The server port matches Python** on JustWrite's real data: route diff 92 reads (78
  identical, 14 volatile), 37/37 writes, 4,809 database cells, 0 different; the seed comparison
  17,741 cells, 0 different. (*measured 2026-10-08*, the kit's
  `server/scripts/route-diff/route-diff.mjs --app --target justwrite`, and
  `server/scripts/compare-seed.mjs`.)
- **Where the JS answers differ from Python on purpose:** 422 errors now come in field order
  (the kit's fix — Python's order too); the desktop window's origin `app://justwrite` stays
  allowed when the user sets their own CORS origins (Python allowed only the list); a request
  body's `1.0` is stored as `1`; JSON answers say `application/json; charset=utf-8`. (*code*, the
  port's report, 2026-10-08.)
- **The window's CSP is the kit's default plus `https:` images** (`electron/main.js` `cspAdd`):
  the Tauri window had none, and a manuscript can hold an image pasted from the web. pdfmake's
  `Function("return this")` sits behind a `globalThis` check that always wins, so the default's
  no-eval holds. (*code*, the built chunk read 2026-10-08.)
- **The installer is 134 MB** (it was 170 MB while the renderer's libraries — tiptap, pdfmake,
  docx… — were `dependencies`: electron-builder packages every dependency, and Vite had already
  bundled them; they are devDependencies now). It installs, starts, serves headless through
  `justwrite-server.cmd` with the bundled tutorial book, and an update and an uninstall keep
  `data\`. (*measured 2026-10-08*, a silent install into a scratch folder.)
- **The e2e runs on the user's real data** (Electron from the checkout, `<repo>/data`), 7/7. Its
  one write — the theme test — is undone by writing the `ui` settings section back at the end;
  two tests were stale against the app (AI settings moved to `#/ai`; `--accent-h` became
  `--accent-hue`). (*measured 2026-10-08*.)

---

## Records not yet distilled

Indexed by subject so they can be found; their facts move into a section above when work next
touches the subject. History in [`../plans/archive/`](../plans/archive/) is not listed.

**The writer's editor** —
[`2026-07-26-writers-editor-gap-research.md`](../plans/2026-07-26-writers-editor-gap-research.md) ·
[`2026-07-26-editor-expansion-executor-plan.md`](../plans/2026-07-26-editor-expansion-executor-plan.md).

**Single-source text and translation** —
[`2026-07-26-i18n-single-source-research.md`](../plans/2026-07-26-i18n-single-source-research.md).

**Performance** — [`measured-performance.md`](measured-performance.md) (distilled evidence) ·
[`bench.md`](bench.md) (the LLM bench harness).

**Story-bible retrieval** — [`rag-design.md`](rag-design.md) (distilled decisions).

**Roadmaps** — [`ai-features-roadmap.md`](ai-features-roadmap.md) ·
[`potential-roadmap.md`](potential-roadmap.md) (research-driven candidates).

**Family parity** — [`2026-08-05-family-parity-batch.md`](../plans/2026-08-05-family-parity-batch.md).

**Docs** — [`2026-08-04-docs-coverage-worklist.md`](../plans/2026-08-04-docs-coverage-worklist.md).
