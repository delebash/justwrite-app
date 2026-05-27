// ============================================================
// pdf.js — manuscript → PDF via pdfmake.
//
// pdfmake is lazy-imported on first export so the ~2 MB bundle
// (with vfs_fonts) doesn't ship with the initial app payload.
// We construct pdfmake's docDefinition by walking the normalized
// manuscript model from `manuscript.js`.
// ============================================================

let pdfmakePromise = null;
async function getPdfMake() {
  if (!pdfmakePromise) {
    pdfmakePromise = (async () => {
      const [{ default: pdfMake }, fonts] = await Promise.all([
        import("pdfmake/build/pdfmake"),
        import("pdfmake/build/vfs_fonts"),
      ]);
      // pdfmake bundles its vfs in different shapes across versions.
      const vfs = fonts.pdfMake?.vfs || fonts.default?.pdfMake?.vfs || fonts.default?.vfs;
      if (vfs) pdfMake.vfs = vfs;
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
  const blob = await new Promise((resolve, reject) => {
    try {
      pdfMake.createPdf(docDefinition).getBlob((b) => resolve(b));
    } catch (err) { reject(err); }
  });
  onProgress?.({ stage: "done" });
  return blob;
}
