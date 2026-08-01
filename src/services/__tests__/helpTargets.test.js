// Every in-app help affordance must point at a doc that exists — and, when it
// deep-links a section, at a heading that exists.
//
// WHY a bespoke test rather than the normal gates: the mapping from UI to docs
// is a plain string attribute, `help-key="story-bible#relations"` (PaneHeader)
// or `<HelpTrigger slug="…">`, resolved at RUNTIME by services/helpDocs.js
// against a Vite glob of docs/*.md. Nothing in the toolchain can see it:
//   · `npm run build:vite` compiles the attribute as an ordinary string;
//   · biome lints identifiers, not attribute values;
//   · the headless smoke asserts zero JS errors — and a bad slug is NOT an
//     error: hasDoc() returns false and HelpView quietly redirects to the
//     index, while the drawer renders its empty state.
// So renaming a heading in docs/plot-and-time.md, or renaming a doc file,
// silently breaks the "?" button on a pane with every gate green. There are 26
// of these targets and 16 of them carry anchors, which is far too many to keep
// correct by hand.
//
// The heading slugger is IMPORTED from the kit rather than reimplemented here:
// it is the same function that generates the ids at runtime
// (common/services/helpMarkdown.js), so an emoji-or-punctuation heading cannot
// resolve one way in this test and another way in the app.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { slugifyHeading } from "@delebash/llm-ui";
import { describe, expect, it } from "vitest";
import HELP_TOC from "../../../docs/toc.json";

const RENDERER = fileURLToPath(new URL("../..", import.meta.url));
const DOCS = fileURLToPath(new URL("../../../docs", import.meta.url));

/** slug → Set of heading ids, mirroring how helpDocs.js keys the glob. */
function docHeadings() {
  const out = {};
  for (const file of readdirSync(DOCS).filter((f) => f.endsWith(".md"))) {
    const slug = file.replace(/\.md$/, "");
    const ids = new Set();
    for (const line of readFileSync(join(DOCS, file), "utf8").split("\n")) {
      const m = line.match(/^#{1,6}\s+(.+?)\s*$/);
      // Strip inline emphasis/code marks the same way the renderer does before
      // slugifying — it slugs the rendered text, not the raw markdown.
      if (m) ids.add(slugifyHeading(m[1].replace(/[*_`]/g, "")));
    }
    out[slug === "README" ? "index" : slug] = ids;
  }
  return out;
}

function* vueFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* vueFiles(path);
    else if (path.endsWith(".vue")) yield path;
  }
}

/** Every `help-key="…"` (PaneHeader) and `slug="…"` (HelpTrigger) in the tree. */
function helpTargets() {
  const found = [];
  for (const file of vueFiles(RENDERER)) {
    const rel = file.slice(RENDERER.length).replace(/\\/g, "/");
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        for (const m of line.matchAll(/(?:help-key|slug)="([^"]*)"/g)) {
          // PaneHeader forwards its own prop through to HelpTrigger — that is
          // the binding, not a target.
          if (m[1] && m[1] !== "helpKey") found.push({ target: m[1], where: `${rel}:${i + 1}` });
        }
      });
  }
  return found;
}

const HEADINGS = docHeadings();
const TARGETS = helpTargets();

describe("in-app help targets", () => {
  it("finds the help affordances (guards the scraper itself)", () => {
    // If this drops to near zero the regex above stopped matching and every
    // assertion below would vacuously pass.
    expect(TARGETS.length).toBeGreaterThan(20);
  });

  it.each(TARGETS)("$target resolves ($where)", ({ target }) => {
    const [slug, anchor] = target.split("#");
    expect(Object.keys(HEADINGS)).toContain(slug);
    if (anchor) expect([...HEADINGS[slug]]).toContain(anchor);
  });
});

describe("docs/toc.json", () => {
  it.each(HELP_TOC.flatMap((g) => g.items.map((i) => ({ ...i, section: g.section }))))(
    "$section → $slug has a doc file",
    ({ slug }) => {
      // A TOC entry with no doc renders a dead row in the Help sidebar AND in
      // the command palette, which indexes the same list.
      expect(Object.keys(HEADINGS)).toContain(slug);
    },
  );

  // The other direction, and the reason this file exists at all: `docs/` root
  // IS the user help corpus. helpDocs.js globs every .md there into the app and
  // the release packs the same set for the website, so a DEV doc left in the
  // root ships to users — docs/TASKS.md put the open-work tracker in the Help
  // sidebar between "Models" and "Appearance" until 2026-07-31. Dev material
  // belongs in docs/dev/ (notes, trackers, backlogs) or docs/plans/ (history);
  // neither is globbed, because the glob is non-recursive.
  it("every doc in docs/ root is a listed user doc", () => {
    const listed = new Set(HELP_TOC.flatMap((g) => g.items.map((i) => i.slug)));
    listed.add("index"); // README.md — the overview, linked explicitly by HelpView.
    const unlisted = Object.keys(HEADINGS).filter((slug) => !listed.has(slug));
    expect(unlisted).toEqual([]);
  });
});
