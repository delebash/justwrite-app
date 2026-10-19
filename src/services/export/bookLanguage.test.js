/**
 * @vitest-environment jsdom
 */
// The book's language in an export (2026-10-18, the editor-expansion plan's piece 2): the EPUB
// declares it (dc:language, each page's lang) and writes its own words in it — the catalog for
// that language or its base, else English. Before, every EPUB said `en` and its words were English.
import JSZip from "jszip";
import { expect, test } from "vitest";
import { bookLocale, tBook } from "../../i18n/index.js";
import { exportEpub } from "./epub.js";
import { buildManuscript } from "./manuscript.js";

const book = (language, title = "") => ({
  project: { title, author: "Ana Ríos", subtitle: "", genre: "", language, coverImage: null },
  parts: [{ id: "p1", title: "Uno", chapters: [{ id: "c1", num: 1, title: "El faro" }] }],
  chapterBody: { c1: "<p>Era de noche.</p>" },
});

async function epubFiles(language, title) {
  const blob = await exportEpub({ manuscript: buildManuscript(book(language, title)) });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const read = (name) => zip.file(`OEBPS/${name}`).async("string");
  return { opf: await read("content.opf"), title: await read("title.xhtml"), nav: await read("nav.xhtml"), chapter: await read("ch-c1.xhtml") };
}

test("the catalog for a book's language: its own, its base language's, else English", () => {
  expect(bookLocale("es")).toBe("es");
  expect(bookLocale("es-419")).toBe("es");
  expect(bookLocale("EN-gb")).toBe("en");
  expect(bookLocale("fr")).toBe("en");
  expect(bookLocale("")).toBe("en");
});

test("a French book's EPUB says French, in English words until JustWrite speaks French", async () => {
  const f = await epubFiles("fr", "Le phare");
  expect(f.opf).toContain("<dc:language>fr</dc:language>");
  expect(f.opf).toContain('xml:lang="fr"');
  for (const page of [f.title, f.nav, f.chapter]) expect(page).toContain('xml:lang="fr" lang="fr"');
  expect(f.nav).toContain(`<h1>${tBook("fr", "export.book.contents")}</h1>`);
  expect(f.nav).toContain("<h1>Contents</h1>");
  expect(f.title).toContain("by Ana Ríos");
  expect(f.chapter).toContain('<p class="chapter-num">Chapter 1</p>');
});

test("a Spanish book's EPUB writes its words from the Spanish catalog", async () => {
  const f = await epubFiles("es", "");
  expect(f.opf).toContain("<dc:language>es</dc:language>");
  // the untitled book and the chapter page's title: words the Spanish catalog has
  expect(f.opf).toContain(`<dc:title>${tBook("es", "common.untitled")}</dc:title>`);
  expect(tBook("es", "common.untitled")).not.toBe(tBook("en", "common.untitled"));
  expect(f.chapter).toContain(`<title>${tBook("es", "common.chapterRefDash", { num: 1, title: "El faro" })}</title>`);
  expect(f.chapter).toContain("<title>Cap. 1 — El faro</title>");
});
