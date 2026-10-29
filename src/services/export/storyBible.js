// The Story Bible export (2026-10-28, docs/plans/2026-10-28-four-feature-ideas.md §3): the book's
// characters, locations, objects, groups and worldbuilding as a document to hand an editor, a
// co-author or an illustrator. One outline, built from the sheets' own field lists
// (services/characterSheet.js, services/storyWorldSheet.js) and labelled with the pages' own catalog
// words, so a field never reads two ways; the DOCX and PDF writers below only lay it out.
//
// The outline: `{ title, author, sections: [{ title, entries: [{ title, facts, groups }] }] }`, a
// fact `{ label, text }`, a group `{ title, facts }`. Empty fields are left out; so is an entry
// marked "Exclude from AI" when `skipExcluded` (the flag writers use for spoilers).

import { categoryLabelShown } from "../../stores/project.js";
import { fieldLabelKeys, fieldValue, SHEET_SECTIONS } from "../characterSheet.js";
import { sheetDescription, sheetFieldLabelKeys, sheetFields, sheetValue } from "../storyWorldSheet.js";
import { htmlToText } from "../text.js";
import { docxRuns, getDocx } from "./docx.js";
import { htmlBlocks } from "./manuscript.js";
import { getPdfMake, pageNumberFooter, pdfText } from "./pdf.js";

const filled = (facts) => facts.filter((f) => String(f.text ?? "").trim());
const plain = (html) => htmlToText(html || "", { blockNewlines: true, tidyLines: true });
// A rich field (a description, an article): its plain text, and its blocks with their formatting for
// the writers (2026-10-29 — they set it as plain lines, losing its italics and bold).
const rich = (html) => ({ text: plain(html), blocks: htmlBlocks(html || "") });

function characterEntry(project, c, t) {
  const extras = project.characterExtras?.[c.id] || {};
  const facts = filled([
    { label: t("characters.columns.role"), text: c.role },
    { label: t("characters.columns.gender"), text: c.gender },
    { label: t("characters.columns.pronouns"), text: c.pronouns },
    { label: t("characters.detail.age"), text: c.age == null ? "" : String(c.age) },
    { label: t("characters.detail.lifeStatus"), text: c.lifeStatus ? t(`characters.lifeStatus.${c.lifeStatus}`) : "" },
    { label: t("characters.detail.alsoKnownAs"), text: (c.aliases || []).join(", ") },
    { label: t("characters.detail.oneLiner"), text: c.oneLiner },
    { label: t("common.tags"), text: (c.tags || []).join(", ") },
  ]);
  const groups = SHEET_SECTIONS.map((s) => ({
    title: t(`characters.sections.${s.key}.title`),
    facts: filled(s.fields.map((f) => ({ label: t(fieldLabelKeys(f).label), text: fieldValue(extras, f) }))),
  })).filter((g) => g.facts.length);
  return { title: c.name, facts, groups };
}

function sheetEntry(kind, entity, t, extra = []) {
  const description = sheetDescription(kind);
  const facts = filled([
    { label: t(description.label), ...rich(entity[description.key]) },
    ...sheetFields(kind).map((key) => ({ label: t(sheetFieldLabelKeys(kind, key).label), text: sheetValue(entity, key) })),
    ...extra,
    { label: t("common.tags"), text: (entity.tags || []).join(", ") },
  ]);
  return { title: entity.name, facts, groups: [] };
}

/** An article's category as the pages show it (a seeded one by its catalog name until renamed). */
function categoryOf(project, id) {
  const c = (project.worldbuildingCategories || []).find((x) => x.id === id);
  return c ? categoryLabelShown(c) : "";
}

/** A group member's name, whatever it is (a character, a location, an object, a strand). */
function memberName(project, m) {
  const lists = { character: project.characters, location: project.locations, object: project.objects, strand: project.strands };
  return (lists[m?.kind] || []).find((x) => x.id === m.id)?.name || "";
}

/** The book's story bible as an outline. `t` is the i18n translate function. */
export function storyBibleOutline(project, t, { skipExcluded = false } = {}) {
  const keep = (e) => !(skipExcluded && e.excludeFromAi);
  const sections = [
    { title: t("nav.characters"), entries: (project.characters || []).filter(keep).map((c) => characterEntry(project, c, t)) },
    { title: t("nav.locations"), entries: (project.locations || []).filter(keep).map((l) => sheetEntry("location", l, t)) },
    { title: t("nav.objects"), entries: (project.objects || []).filter(keep).map((o) => sheetEntry("object", o, t)) },
    {
      title: t("nav.groups"),
      entries: (project.groups || []).filter(keep).map((g) => sheetEntry("group", g, t, [
        { label: t("groups.colMembers"), text: (g.members || []).map((m) => memberName(project, m)).filter(Boolean).join(", ") },
      ])),
    },
    {
      title: t("nav.worldbuilding"),
      entries: (project.worldbuilding || []).filter(keep).map((w) => ({
        title: w.title,
        facts: filled([
          { label: t("common.category"), text: categoryOf(project, w.category) },
          { label: t("worldbuilding.summaryLabel"), text: w.summary },
          { label: t("common.description"), ...rich(w.body) },
          { label: t("common.tags"), text: (w.tags || []).join(", ") },
        ]),
        groups: [],
      })),
    },
  ].filter((s) => s.entries.length);
  const title = project.project?.title || "";
  const author = project.project?.author || "";
  return {
    title,
    author,
    heading: t("export.storyBible.docTitle", { title }),
    byAuthor: author ? t("export.book.byAuthor", { author }) : "",
    sections,
  };
}

// ── the two writers: the outline laid out, the words already in it ──────────────────────────────

/** A field's text as paragraphs: its lines, blank ones dropped. */
const linesOf = (text) => String(text).split(/\n+/).map((l) => l.trim()).filter(Boolean);

/* eslint-disable i18next/no-literal-string -- markup, styles and fonts; the words come from the outline */

/** The outline as a Word document (the `docx` library, as the manuscript's). `language` is the
 *  book's: Word proofs in it. */
export async function storyBibleDocx(outline, { language, onProgress } = {}) {
  onProgress?.({ stage: "loading-docx" });
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await getDocx();
  onProgress?.({ stage: "composing" });
  // a rich field's text blocks with their formatting (a list item as a bullet); a picture or a scene
  // mark in a description stays out; a plain field, line by line
  const body = (f) => (f.blocks
    ? f.blocks.filter((b) => b.runs).map((b) => new Paragraph({
      spacing: { after: 80, line: 300 },
      ...(b.kind === "ul-item" && { bullet: { level: 0 } }),
      children: docxRuns(TextRun, b, b.kind === "h2" ? { bold: true } : b.kind === "blockquote" ? { italics: true } : {}),
    }))
    : linesOf(f.text).map((l) => new Paragraph({ spacing: { after: 80, line: 300 }, children: [new TextRun({ text: l })] })));
  const fact = (f) => [
    new Paragraph({ spacing: { before: 120, after: 40 }, children: [new TextRun({ text: f.label, bold: true, color: "555555", size: 20 })] }),
    ...body(f),
  ];
  const children = [
    new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun({ text: outline.heading })] }),
  ];
  if (outline.byAuthor) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 480 }, children: [new TextRun({ text: outline.byAuthor, italics: true })] }));
  for (const s of outline.sections) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun({ text: s.title })] }));
    for (const e of s.entries) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 360, after: 120 }, children: [new TextRun({ text: e.title })] }));
      for (const f of e.facts) children.push(...fact(f));
      for (const g of e.groups) {
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 240, after: 80 }, children: [new TextRun({ text: g.title })] }));
        for (const f of g.facts) children.push(...fact(f));
      }
    }
  }
  const doc = new Document({
    creator: "JustWrite",
    title: outline.heading,
    styles: { default: { document: { run: { font: "Georgia", size: 22, language: { value: language } } } } },
    sections: [{ properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children }],
  });
  onProgress?.({ stage: "packing" });
  const blob = await Packer.toBlob(doc);
  onProgress?.({ stage: "done" });
  return blob;
}

/** The outline as a PDF (pdfmake, as the manuscript's), on the book's page (pageSetup.js pdfPage). */
export async function storyBiblePdf(outline, { language, page, onProgress } = {}) {
  onProgress?.({ stage: "loading-pdfmake" });
  const pdfMake = await getPdfMake();
  onProgress?.({ stage: "composing" });
  const body = (f) => (f.blocks
    ? f.blocks.filter((b) => b.runs).map((b) => (b.kind === "ul-item"
      ? { ul: [{ text: pdfText(b) }], style: "text" }
      : { text: pdfText(b), style: "text", ...(b.kind === "h2" && { bold: true }), ...(b.kind === "blockquote" && { italics: true }) }))
    : linesOf(f.text).map((l) => ({ text: l, style: "text" })));
  const facts = (list) => list.flatMap((f) => [{ text: f.label, style: "label" }, ...body(f)]);
  const content = [{ text: outline.heading, style: "title" }];
  if (outline.byAuthor) content.push({ text: outline.byAuthor, style: "byline" });
  for (const s of outline.sections) {
    content.push({ text: s.title, style: "section", pageBreak: "before" });
    for (const e of s.entries) {
      content.push({ text: e.title, style: "entry" }, ...facts(e.facts));
      for (const g of e.groups) content.push({ text: g.title, style: "group" }, ...facts(g.facts));
    }
  }
  const doc = {
    info: { title: outline.heading, author: outline.author, creator: "JustWrite" },
    language,
    pageSize: page.pageSize,
    pageMargins: page.pageMargins,
    content,
    styles: {
      title: { fontSize: 26, bold: true, alignment: "center", margin: [0, 160, 0, 10] },
      byline: { fontSize: 13, italics: true, alignment: "center", color: "#444" },
      section: { fontSize: 20, bold: true, margin: [0, 0, 0, 16] },
      entry: { fontSize: 15, bold: true, margin: [0, 18, 0, 6] },
      group: { fontSize: 11, bold: true, color: "#666", margin: [0, 10, 0, 2], characterSpacing: 1 },
      label: { fontSize: 9.5, bold: true, color: "#555", margin: [0, 6, 0, 1] },
      text: { fontSize: 11, lineHeight: 1.4, margin: [0, 0, 0, 3] },
    },
    defaultStyle: { font: "Roboto" },
    footer: pageNumberFooter,
  };
  onProgress?.({ stage: "rendering" });
  const blob = await pdfMake.createPdf(doc).getBlob();
  onProgress?.({ stage: "done" });
  return blob;
}
/* eslint-enable i18next/no-literal-string */
