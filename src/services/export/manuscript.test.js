/**
 * @vitest-environment jsdom
 */
// Every export kept a paragraph's plain text alone (2026-10-29): a novel's italics and bold, its line
// breaks and the pictures in its scenes were lost in the EPUB, the Word file and the PDF. A block now
// carries its runs and a picture is a block of its own; each exporter writes them in its own format.
import JSZip from "jszip";
import { expect, test } from "vitest";
import { exportDocx } from "./docx.js";
import { exportEpub, runsToXhtml } from "./epub.js";
import { buildManuscript, inlineRuns, plainText } from "./manuscript.js";
import { pdfText } from "./pdf.js";

// a 1 × 1 PNG
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const BODY = `<p>The <em>salt</em> road, <strong>Wren</strong> said.<br>She meant <em><strong>it</strong></em>.</p>`
  + `<img src="${PNG}" alt="The map">`
  + `<p>H<sub>2</sub>O and x<sup>2</sup>, <u>under</u>, <s>gone</s>.</p>`;
const book = () => ({
  project: { title: "The Salt Road", author: "Neve", subtitle: "", genre: "", language: "en", coverImage: null },
  parts: [{ id: "p1", title: "One", chapters: [{ id: "c1", num: 1, title: "The Road" }] }],
  chapterBody: { c1: BODY },
});
const el = (html) => { const d = document.createElement("div"); d.innerHTML = html; return d.firstElementChild; };

test("a paragraph's runs keep its formatting, its spaces and its line breaks", () => {
  const runs = inlineRuns(el(`<p>The <em>salt</em> road, <strong>Wren</strong> said.<br>She meant <em><strong>it</strong></em>.</p>`));
  expect(runs).toEqual([
    { text: "The " }, { text: "salt", italic: true }, { text: " road, " }, { text: "Wren", bold: true },
    { text: " said." }, { br: true }, { text: "She meant " }, { text: "it", italic: true, bold: true }, { text: "." },
  ]);
  expect(plainText(runs)).toBe("The salt road, Wren said. She meant it.");
  // whitespace collapses as HTML's does, once between runs and none at the ends
  expect(inlineRuns(el(`<p>  <em>salt </em>  road  </p>`))).toEqual([{ text: "salt ", italic: true }, { text: "road" }]);
});

test("a picture is a block of its own, and a paragraph holding only one leaves no empty paragraph", () => {
  const { blocks } = buildManuscript(book()).parts[0].chapters[0];
  expect(blocks.map((b) => b.kind)).toEqual(["h1", "p", "image", "p"]);
  expect(blocks[2]).toEqual({ kind: "image", src: PNG, alt: "The map" });
  const wrapped = buildManuscript({ ...book(), chapterBody: { c1: `<p><img src="${PNG}" alt=""></p><p>After.</p>` } });
  expect(wrapped.parts[0].chapters[0].blocks.map((b) => b.kind)).toEqual(["h1", "image", "p"]);
});

test("EPUB: the runs as markup, the picture packed into the book", async () => {
  expect(runsToXhtml([{ text: "a <b> & c", italic: true, bold: true }, { br: true }, { text: "d", sub: true }]))
    .toBe("<em><strong>a &lt;b&gt; &amp; c</strong></em><br/><sub>d</sub>");
  const blob = await exportEpub({ manuscript: buildManuscript(book()) });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const chapter = await zip.file("OEBPS/ch-c1.xhtml").async("string");
  expect(chapter).toContain("<p>The <em>salt</em> road, <strong>Wren</strong> said.<br/>She meant <em><strong>it</strong></em>.</p>");
  expect(chapter).toContain(`<p class="image"><img src="images/img-1.png" alt="The map" /></p>`);
  expect(chapter).toContain("H<sub>2</sub>O and x<sup>2</sup>, <u>under</u>, <s>gone</s>.");
  expect(zip.file("OEBPS/images/img-1.png")).toBeTruthy();
  expect(await zip.file("OEBPS/content.opf").async("string")).toContain(`<item id="img-1" href="images/img-1.png" media-type="image/png"`);
});

test("Word: italics, bold, a line break and the picture", async () => {
  const blob = await exportDocx({ manuscript: buildManuscript(book()) });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file("word/document.xml").async("string");
  const run = (text) => xml.match(new RegExp(`<w:r>(?:(?!</w:r>).)*<w:t[^>]*>${text}</w:t>`))?.[0] || "";
  expect(run("salt")).toContain("<w:i/>");
  expect(run("Wren")).toContain("<w:b/>");
  expect(run(" road, ")).not.toContain("<w:i/>");
  expect(xml).toContain("<w:br/>");
  expect(xml).toContain("<w:drawing>");
  expect(Object.keys(zip.files).some((n) => n.startsWith("word/media/"))).toBe(true);
});

test("PDF: the runs as pdfmake's inline text", () => {
  const p = buildManuscript(book()).parts[0].chapters[0].blocks[3];
  expect(pdfText(p)).toEqual([
    { text: "H" }, { text: "2", sub: true }, { text: "O and x" }, { text: "2", sup: true }, { text: ", " },
    { text: "under", decoration: ["underline"] }, { text: ", " }, { text: "gone", decoration: ["lineThrough"] }, { text: "." },
  ]);
  expect(pdfText({ kind: "h1", text: "Plain" })).toBe("Plain");
});
