// ============================================================
// docx.js — manuscript → DOCX via the `docx` library.
//
// The library is lazy-imported on first call; once loaded it stays in
// memory for the session. Produces a Blob (`application/vnd.openxmlformats…`)
// ready to download.
// ============================================================

let docxPromise = null;
async function getDocx() {
  if (!docxPromise) docxPromise = import("docx");
  return docxPromise;
}

export async function exportDocx({ manuscript, onProgress } = {}) {
  onProgress?.({ stage: "loading-docx" });
  const lib = await getDocx();
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
    PageBreak, LevelFormat, TableOfContents,
  } = lib;

  onProgress?.({ stage: "composing" });

  // Helpers — small wrappers so the body builder reads cleanly.
  const cover = (text, opts = {}) => new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 0 },
    children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, size: opts.size, color: opts.color })],
  });
  const heading = (text, level) => new Paragraph({
    heading: level,
    alignment: AlignmentType.CENTER,
    spacing: { before: 480, after: 240 },
    children: [new TextRun({ text })],
  });
  const chapterEyebrow = (text) => new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 720, after: 120 },
    children: [new TextRun({ text, color: "888888", characterSpacing: 60 })],
  });
  const para = (text, opts = {}) => new Paragraph({
    spacing: { after: 160, line: 320 },
    alignment: opts.alignment || AlignmentType.JUSTIFIED,
    indent: opts.indent ? { firstLine: 360 } : undefined,
    children: [new TextRun({ text, italics: opts.italics, color: opts.color })],
  });
  const sceneBreak = () => new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 240 },
    children: [new TextRun({ text: "* * *", color: "999999", characterSpacing: 120 })],
  });
  const bullet = (text) => new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 80 },
    children: [new TextRun({ text })],
  });
  const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

  const children = [];

  // ── Cover ───────────────────────────────────────────────
  children.push(cover(manuscript.title, { bold: true, size: 64, before: 3600 }));
  if (manuscript.subtitle) children.push(cover(manuscript.subtitle, { italics: true, color: "666666", size: 28 }));
  if (manuscript.author) {
    children.push(cover(""), cover(""), cover(""));
    children.push(cover(`by ${manuscript.author}`, { size: 30 }));
  }
  children.push(pageBreak());

  // ── TOC ─────────────────────────────────────────────────
  children.push(heading("Contents", HeadingLevel.HEADING_1));
  children.push(new TableOfContents("Contents", {
    // Auto-link entries and refresh on document open.
    hyperlink: true,
    // Range of heading levels to include — Parts use H1, Chapter titles H2,
    // in-chapter subheadings H3.
    headingStyleRange: "1-3",
    // Tell Word to update the field on file open. Combined with the
    // doc-level `updateFields` feature flag below, this means the user
    // doesn't see the "Refresh fields?" dialog on first open.
    updateFields: true,
  }));
  children.push(pageBreak());

  // ── Body ────────────────────────────────────────────────
  for (let pi = 0; pi < manuscript.parts.length; pi++) {
    const part = manuscript.parts[pi];
    if (pi > 0) children.push(pageBreak());
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 4800, after: 0 },
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: part.title })],
    }));

    for (const ch of part.chapters) {
      children.push(pageBreak());
      children.push(chapterEyebrow(`Chapter ${ch.num}`));
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 0, after: 720 },
        children: [new TextRun({ text: ch.title })],
      }));

      for (const b of ch.blocks) {
        if (b.kind === "h1") continue;
        if (b.kind === "h2") {
          children.push(new Paragraph({
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 320, after: 120 },
            children: [new TextRun({ text: b.text, bold: true })],
          }));
        } else if (b.kind === "blockquote") {
          children.push(para(b.text, { italics: true, color: "555555", alignment: AlignmentType.LEFT }));
        } else if (b.kind === "scene-break") {
          children.push(sceneBreak());
        } else if (b.kind === "page-break") {
          children.push(pageBreak());
        } else if (b.kind === "ul-item") {
          children.push(bullet(b.text));
        } else {
          children.push(para(b.text, { indent: true }));
        }
      }
    }
  }

  const doc = new Document({
    creator: "JustWrite",
    title: manuscript.title,
    description: manuscript.subtitle || "",
    // Tell Word to refresh dynamic fields (the TOC) on document open.
    // Without this, Word shows a "This document contains fields that may
    // refer to other files. Do you want to update?" dialog on every open
    // and ships a stale TOC if the user clicks No.
    features: { updateFields: true },
    styles: {
      default: {
        document: { run: { font: "Georgia", size: 23 } },  // 11.5pt
      },
    },
    sections: [{
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children,
    }],
  });

  onProgress?.({ stage: "packing" });
  const blob = await Packer.toBlob(doc);
  onProgress?.({ stage: "done" });
  return blob;
}
