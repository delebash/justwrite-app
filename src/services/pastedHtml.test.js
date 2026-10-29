// @vitest-environment jsdom
//
// The editor's colours in the dark theme (2026-10-28): text pasted from a Google Doc came in as
// `color:#000000` and was invisible on the dark page, and a highlight or a text colour from the
// toolbar was stored as its light colour. A paste drops the automatic black; the toolbar stores a
// theme variable that has a light and a dark value.
import { describe, expect, it } from "vitest";

import { HIGHLIGHT_COLORS, TEXT_COLORS, editorColorVars, highlightVar, textColorVar } from "./appearance.js";
import { dropBlackTextColor } from "./pastedHtml.js";

describe("a paste drops the automatic black", () => {
  it("a Google Doc's black runs lose their colour and keep the rest of their style", () => {
    const html = `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr"><span style="font-size:11pt;font-family:Arial;color:#000000;background-color:transparent">Salt road.</span></p></b>`;
    const out = dropBlackTextColor(html);
    expect(out).not.toMatch(/(^|[^-])color:\s*(#000|rgb\(0, 0, 0\))/);
    expect(out).toContain("font-size: 11pt");
    expect(out).toContain("Salt road.");
  });

  it("black in its other spellings, and a run left with no style at all", () => {
    for (const black of ["black", "#000", "rgb(0,0,0)", "windowtext"]) {
      const out = dropBlackTextColor(`<p><span style="color: ${black}">Wren</span></p>`);
      expect(out, black).toBe("<p><span>Wren</span></p>");
    }
  });

  it("a real colour, a highlight and colourless HTML come through untouched", () => {
    const red = `<p><span style="color: #b91c1c">Wren</span></p>`;
    expect(dropBlackTextColor(red)).toBe(red);
    const mark = `<p><mark data-color="#000000" style="background-color: #000000; color: inherit">Wren</mark></p>`;
    expect(dropBlackTextColor(mark)).toBe(mark);
    const plain = `<p data-pm-slice="1 1 []">Wren</p>`;
    expect(dropBlackTextColor(plain)).toBe(plain);
  });
});

describe("the editor's colours have a light and a dark value", () => {
  it("every highlight and text colour, as the variable a scene stores", () => {
    for (const mode of ["light", "dark"]) {
      const vars = Object.fromEntries(editorColorVars(mode));
      for (const key of Object.keys(HIGHLIGHT_COLORS)) {
        expect(highlightVar(key)).toBe(`var(--color-highlight-${key})`);
        expect(vars[`--color-highlight-${key}`], `${mode} ${key}`).toBeTruthy();
      }
      for (const key of Object.keys(TEXT_COLORS)) {
        expect(textColorVar(key)).toBe(`var(--color-text-${key})`);
        expect(vars[`--color-text-${key}`], `${mode} ${key}`).toBeTruthy();
      }
    }
  });

  it("light mode keeps the colours the editor always had; dark mode changes every one", () => {
    const light = Object.fromEntries(editorColorVars("light"));
    const dark = Object.fromEntries(editorColorVars("dark"));
    expect(light["--color-highlight-yellow"]).toBe("#ffe8a3");
    expect(light["--color-text-red"]).toBe("#b91c1c");
    for (const name of Object.keys(light).filter((n) => n !== "--color-text-on-highlight")) {
      expect(dark[name], name).not.toBe(light[name]);
    }
  });
});
