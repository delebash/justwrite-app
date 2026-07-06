// @vitest-environment jsdom
// parseOdt — the list-import path (E3): <text:list> → <ul>/<ol> with
// TipTap-friendly <li><p>…</p></li>, ordered-vs-bullet decided PER nesting
// level from the list style, nested lists inheriting the outer style.
//
// Grounding (web/spec-verified 2026-07-06, per the upstream hard rule):
// - ODF 1.2 §16.30 <text:list-style>: one list-level-style-{number|bullet|
//   image} per level; a level WITHOUT its own specification uses "the list
//   level style of the next lower level"; list styles may occur in BOTH
//   office:automatic-styles and office:styles.
//   §5.3.2: a list contained in another list defaults to the surrounding
//   list's style. §5.3.3 text:list-header.
//   https://docs.oasis-open.org/office/v1.2/os/OpenDocument-v1.2-os-part1.html
// - Structure verified against a REAL LibreOffice-produced document
//   (sw/qa/extras/odfexport/data/listformat.odt from the LibreOffice core
//   corpus): the outer <text:list> carries the automatic style (L1), nested
//   <text:list> elements carry NO style-name (inheritance), nested lists sit
//   inside <text:list-item> after the <text:p>, and styles.xml holds no list
//   styles — LibreOffice emits automatic styles; the styles.xml source below
//   is spec-legal coverage for other producers. parseOdt was live-run over
//   that real file in-session: 3-deep <ol> nesting, li>p shape, zero
//   warnings.
//
// jsdom provides the DOMParser the parser uses in the renderer; fixtures are
// real ODT-shaped zips built with jszip (the production dep) mirroring the
// verified real-file structure.
import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import { parseOdt } from "../odt.js";

const ENVELOPE_OPEN = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0">`;

function contentXml(automaticStyles, body) {
  return `${ENVELOPE_OPEN}
  <office:automatic-styles>${automaticStyles}</office:automatic-styles>
  <office:body><office:text>${body}</office:text></office:body>
</office:document-content>`;
}

const MIXED_STYLES = `
    <text:list-style style:name="L1">
      <text:list-level-style-bullet text:level="1"/>
      <text:list-level-style-number text:level="2"/>
    </text:list-style>`;

const MIXED_BODY = `
      <text:h text:outline-level="1">Chapter One</text:h>
      <text:p>Intro paragraph.</text:p>
      <text:list text:style-name="L1">
        <text:list-item><text:p>First bullet</text:p></text:list-item>
        <text:list-item>
          <text:p>Second bullet</text:p>
          <text:list>
            <text:list-item><text:p>Nested one</text:p></text:list-item>
            <text:list-item><text:p>Nested two</text:p></text:list-item>
          </text:list>
        </text:list-item>
      </text:list>
      <text:list text:style-name="ListNumber">
        <text:list-item><text:p>Step A</text:p><text:p>Step A note</text:p></text:list-item>
        <text:list-item><text:p>Step B</text:p></text:list-item>
      </text:list>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0">
  <office:styles>
    <text:list-style style:name="ListNumber">
      <text:list-level-style-number text:level="1"/>
    </text:list-style>
  </office:styles>
</office:document-styles>`;

async function buildOdt(content, { withStyles = true } = {}) {
  const zip = new JSZip();
  zip.file("content.xml", content);
  if (withStyles) zip.file("styles.xml", STYLES_XML);
  return zip.generateAsync({ type: "arraybuffer" });
}

const mixedOdt = (opts) => buildOdt(contentXml(MIXED_STYLES, MIXED_BODY), opts);

describe("parseOdt — lists (E3)", () => {
  it("imports a bullet list with a nested per-level-ordered sublist", async () => {
    const { chapters, warnings } = await parseOdt(await mixedOdt());
    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe("Chapter One");
    const html = chapters[0].html;
    // Level 1 of automatic style L1 is a bullet level → <ul>; its nested list
    // inherits L1 (§5.3.2) and level 2 is a number level → <ol> inside the
    // parent <li>.
    expect(html).toContain(
      "<ul><li><p>First bullet</p></li>" +
        "<li><p>Second bullet</p><ol><li><p>Nested one</p></li><li><p>Nested two</p></li></ol></li></ul>",
    );
    expect(warnings).toEqual([]);
  });

  it("resolves a styles.xml NAMED ordered style and keeps multi-paragraph items", async () => {
    const { chapters } = await parseOdt(await mixedOdt());
    expect(chapters[0].html).toContain(
      "<ol><li><p>Step A</p><p>Step A note</p></li><li><p>Step B</p></li></ol>",
    );
  });

  it("applies §16.30's next-lower-level rule: an undefined deeper level uses the nearest defined one", async () => {
    // The style defines ONLY level 1 (number). The nested list (level 2) has
    // no level-2 definition → "the list level style of the next lower level
    // is used" → still ordered. (This pinned a real bug: the first
    // implementation defaulted undefined levels to bullet.)
    const content = contentXml(
      `<text:list-style style:name="N1"><text:list-level-style-number text:level="1"/></text:list-style>`,
      `<text:list text:style-name="N1">
         <text:list-item>
           <text:p>Outer</text:p>
           <text:list><text:list-item><text:p>Inner</text:p></text:list-item></text:list>
         </text:list-item>
       </text:list>`,
    );
    const { chapters } = await parseOdt(await buildOdt(content, { withStyles: false }));
    expect(chapters[0].html).toContain("<ol><li><p>Outer</p><ol><li><p>Inner</p></li></ol></li></ol>");
  });

  it("keeps surrounding h/p behavior and document order", async () => {
    const { chapters } = await parseOdt(await mixedOdt());
    const html = chapters[0].html;
    const intro = html.indexOf("<p>Intro paragraph.</p>");
    const ul = html.indexOf("<ul>");
    const ol = html.indexOf("<ol><li><p>Step A</p>");
    expect(intro).toBeGreaterThanOrEqual(0);
    expect(ul).toBeGreaterThan(intro);
    expect(ol).toBeGreaterThan(ul);
  });

  it("defaults an unknown/absent list style to a bullet list (no styles.xml)", async () => {
    const { chapters, warnings } = await parseOdt(await mixedOdt({ withStyles: false }));
    const html = chapters[0].html;
    // Without styles.xml the "ListNumber" style is unknown → the spec's
    // implementation-dependent default; ours is bullet.
    expect(html).toContain("<ul><li><p>Step A</p><p>Step A note</p></li>");
    // The automatic L1 list from content.xml still resolves (bullet then number).
    expect(html).toContain("<ol><li><p>Nested one</p></li>");
    expect(warnings).toEqual([]);
  });

  it("never emits the old 'lists dropped' warning", async () => {
    const { warnings } = await parseOdt(await mixedOdt());
    expect(warnings.join(" ")).not.toMatch(/dropped/i);
  });
});
