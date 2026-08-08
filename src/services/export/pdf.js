// ============================================================
// pdf.js — manuscript → PDF via pdfmake.
//
// pdfmake is lazy-imported on first export so the ~2 MB bundle
// (with vfs_fonts) doesn't ship with the initial app payload.
// We construct pdfmake's docDefinition by walking the normalized
// manuscript model from `manuscript.js`.
// ============================================================

// The font the docDefinition's defaultStyle asks for; pdfmake resolves "Roboto"
// bold to this file. Asserting it is present turns a silent 0.2→0.3-style API
// drift into a named error instead of a hang (see below).
const REQUIRED_FONT = "Roboto-Medium.ttf";

let pdfmakePromise = null;
async function getPdfMake() {
  if (!pdfmakePromise) {
    pdfmakePromise = (async () => {
      const [{ default: pdfMake }, vfsMod] = await Promise.all([
        import("pdfmake/build/pdfmake"),
        import("pdfmake/build/vfs_fonts"),
      ]);
      // pdfmake 0.3's vfs_fonts.js ends in `module.exports = vfs`, where vfs is a
      // FLAT { "Roboto-Regular.ttf": "<base64>", … } map — so under Vite's CJS
      // interop the map itself arrives as `.default`. (Its other branch,
      // `_global.pdfMake.addVirtualFileSystem(vfs)`, only fires for a script-tag
      // load where a global pdfMake already exists — never for us.)
      //
      // This used to probe `fonts.pdfMake?.vfs || fonts.default?.pdfMake?.vfs ||
      // fonts.default?.vfs` and assign `pdfMake.vfs`, which were 0.2 shapes. All
      // three miss on 0.3.11, so the VFS was NEVER attached and every PDF export
      // died on "File 'Roboto-Medium.ttf' not found in virtual file system"
      // (measured 2026-08-08).
      const vfs = vfsMod.default || vfsMod;
      if (!vfs?.[REQUIRED_FONT]) {
        throw new Error(`pdfmake fonts missing ${REQUIRED_FONT} — the vfs_fonts export shape changed`);
      }
      pdfMake.addVirtualFileSystem(vfs);
      return pdfMake;
    })();
  }
  return pdfmakePromise;
}

/**
 * Returns a Blob (`application/pdf`).
 *   manuscript : output of buildManuscript()
 *   onProgress : optional cb({ stage }) for UI status
 */
export async function exportPdf({ manuscript, onProgress } = {}) {
  onProgress?.({ stage: "loading-pdfmake" });
  const pdfMake = await getPdfMake();

  // Resolve the cover image to a data URL up-front; pdfmake's image
  // nodes accept data URIs but not Blobs/Paths, so we have to convert.
  let coverDataUrl = null;
  if (manuscript.coverImage) {
    try {
      const { urlFor } = await import("../imageStore.js");
      coverDataUrl = await urlFor(manuscript.coverImage);
    } catch { /* fall through to coverless PDF */ }
  }

  onProgress?.({ stage: "composing" });
  const content = [];

  // ── Cover ───────────────────────────────────────────────
  if (coverDataUrl) {
    content.push(
      { image: coverDataUrl, fit: [435, 690], alignment: "center", margin: [0, 20, 0, 0] },
      { text: "", pageBreak: "after" },
    );
  }
  content.push(
    { text: manuscript.title, style: "coverTitle" },
    manuscript.subtitle ? { text: manuscript.subtitle, style: "coverSubtitle" } : "",
    { text: "", margin: [0, 80, 0, 0] },
    { text: manuscript.author ? `by ${manuscript.author}` : "", style: "coverAuthor" },
    { text: "", pageBreak: "after" },
  );

  // ── TOC ─────────────────────────────────────────────────
  content.push(
    { text: "Contents", style: "tocHead" },
    { toc: { textStyle: "tocItem" } },
    { text: "", pageBreak: "after" },
  );

  // ── Body ────────────────────────────────────────────────
  for (let pi = 0; pi < manuscript.parts.length; pi++) {
    const part = manuscript.parts[pi];
    content.push({
      text: part.title,
      style: "partTitle",
      pageBreak: pi === 0 ? undefined : "before",
      tocItem: true,
      tocStyle: "tocPart",
    });

    for (const ch of part.chapters) {
      content.push({
        text: `Chapter ${ch.num}`,
        style: "chapterNum",
        pageBreak: "before",
      });
      content.push({
        text: ch.title,
        style: "chapterTitle",
        tocItem: true,
        tocStyle: "tocChapter",
      });

      for (const b of ch.blocks) {
        if (b.kind === "h1") continue; // chapter title already rendered
        if (b.kind === "h2")          content.push({ text: b.text, style: "h2" });
        else if (b.kind === "blockquote")
          content.push({ text: b.text, style: "blockquote" });
        else if (b.kind === "scene-break")
          content.push({ text: "* * *", style: "sceneBreak" });
        else if (b.kind === "page-break")
          content.push({ text: "", pageBreak: "after" });
        else if (b.kind === "ul-item")
          content.push({ ul: [b.text], style: "p" });
        else
          content.push({ text: b.text, style: "p" });
      }
    }
  }

  const docDefinition = {
    info: {
      title: manuscript.title,
      author: manuscript.author,
      creator: "JustWrite",
    },
    pageSize: "A4",
    pageMargins: [80, 70, 80, 80],
    content,
    styles: {
      coverTitle:    { font: "Roboto", fontSize: 36, bold: true, alignment: "center", margin: [0, 180, 0, 8] },
      coverSubtitle: { fontSize: 14, italics: true, alignment: "center", color: "#666", margin: [0, 0, 0, 0] },
      coverAuthor:   { fontSize: 16, alignment: "center", color: "#333" },

      tocHead:    { fontSize: 22, bold: true, margin: [0, 0, 0, 24] },
      tocPart:    { fontSize: 13, bold: true, margin: [0, 14, 0, 4] },
      tocChapter: { fontSize: 11, margin: [16, 2, 0, 2], color: "#333" },
      tocItem:    { fontSize: 11 },

      partTitle:    { fontSize: 28, bold: true, alignment: "center", margin: [0, 220, 0, 0] },
      chapterNum:   { fontSize: 11, alignment: "center", color: "#888", margin: [0, 60, 0, 6], characterSpacing: 2 },
      chapterTitle: { fontSize: 22, bold: true, alignment: "center", margin: [0, 0, 0, 36] },
      h2:           { fontSize: 14, bold: true, margin: [0, 16, 0, 6] },
      p:            { fontSize: 11.5, lineHeight: 1.55, margin: [0, 0, 0, 8], alignment: "justify" },
      blockquote:   { fontSize: 11.5, italics: true, lineHeight: 1.55, margin: [24, 8, 24, 12], color: "#555" },
      sceneBreak:   { alignment: "center", color: "#888", margin: [0, 16, 0, 16], characterSpacing: 8 },
    },
    defaultStyle: {
      font: "Roboto",
    },
    footer: (currentPage, pageCount) => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: "center",
      fontSize: 9,
      color: "#999",
      margin: [0, 0, 0, 24],
    }),
  };

  onProgress?.({ stage: "rendering" });
  // pdfmake 0.3's getBlob() IS the promise (OutputDocumentBrowser.getBlob →
  // `async getBlob()`). It was called with a 0.2-style callback here, which 0.3
  // ignores: the returned promise was dropped, `resolve` was never reached, and
  // the awaited promise never settled. That hung the whole Export view — the
  // shared `exporting` flag stayed true, so every format's button stayed
  // disabled until reload, which is why EPUB looked broken when PDF was the
  // culprit. A throw inside pdfmake now rejects normally and surfaces.
  const blob = await pdfMake.createPdf(docDefinition).getBlob();
  onProgress?.({ stage: "done" });
  return blob;
}
