// textToHtml — the shared plain-text→HTML wrapper (services/text.js), both
// paragraph grammars. Pure string logic, so it runs in vitest's node env;
// htmlToText needs a DOM and stays covered by the headless smoke + probes
// (the recorded deferral in the I1 build record).
import { describe, expect, it } from "vitest";
import { textToHtml } from "../text.js";

describe("textToHtml — default grammar (LLM replies: blank-line paragraphs, \\n → <br>)", () => {
  it("splits paragraphs on blank lines and keeps single newlines as <br>", () => {
    expect(textToHtml("one\ntwo\n\nthree")).toBe("<p>one<br>two</p><p>three</p>");
  });

  it("trims paragraph edges and drops empty segments", () => {
    expect(textToHtml("\n\n  a  \n\n\n  b  \n\n")).toBe("<p>a</p><p>b</p>");
  });

  it("escapes &, < and >", () => {
    expect(textToHtml("a < b & c > d")).toBe("<p>a &lt; b &amp; c &gt; d</p>");
  });

  it("returns empty string for empty or whitespace-only input", () => {
    expect(textToHtml("")).toBe("");
    expect(textToHtml("   \n  ")).toBe("");
    expect(textToHtml(null)).toBe("");
  });
});

describe("textToHtml — lineAsParagraph grammar (quick-capture: every line its own <p>)", () => {
  it("wraps each non-empty line in its own <p>", () => {
    expect(textToHtml("one\ntwo\n\nthree", { lineAsParagraph: true }))
      .toBe("<p>one</p><p>two</p><p>three</p>");
  });

  it("escapes markup so a typed <b> never becomes an element", () => {
    expect(textToHtml("<b>bold?</b>", { lineAsParagraph: true }))
      .toBe("<p>&lt;b&gt;bold?&lt;/b&gt;</p>");
  });
});
