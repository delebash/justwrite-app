// ============================================================
// epub.js — manuscript → EPUB 3.0 by hand, assembled in JSZip.
//
// We don't depend on an EPUB-specific library — the file is just a
// zip with a fixed layout, and we want full control over the OPF
// spine so part/chapter ordering matches the manuscript exactly.
//
// File tree we emit:
//
//   mimetype                     (uncompressed, stored)
//   META-INF/container.xml
//   OEBPS/content.opf            (manifest + spine)
//   OEBPS/nav.xhtml              (EPUB 3 nav doc — also the TOC)
//   OEBPS/style.css
//   OEBPS/title.xhtml
//   OEBPS/p<i>.xhtml             (one per Part)
//   OEBPS/ch<i>.xhtml            (one per Chapter)
//
// The mimetype file MUST be the first entry in the zip and stored
// uncompressed for the file to validate as EPUB; JSZip's
// `compression: "STORE"` option handles that.
// ============================================================

let jszipPromise = null;
async function getJSZip() {
  if (!jszipPromise) jszipPromise = import("jszip").then((m) => m.default || m);
  return jszipPromise;
}

let readImageBytesPromise = null;
async function readImageBytes(image) {
  if (!image) return null;
  if (!readImageBytesPromise) {
    readImageBytesPromise = import("../imageStore.js").then((m) => m.readImageBytes);
  }
  const fn = await readImageBytesPromise;
  try { return await fn(image); }
  catch { return null; }
}

const xmlEscape = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const uuid = () => "urn:uuid:" + crypto.randomUUID();

export async function exportEpub({ manuscript, onProgress } = {}) {
  onProgress?.({ stage: "loading-jszip" });
  const JSZip = await getJSZip();

  onProgress?.({ stage: "composing" });
  const zip = new JSZip();

  // mimetype must be the FIRST entry and stored uncompressed.
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  zip.file("META-INF/container.xml", containerXml());

  // Build the manifest + spine in lock-step with the file emissions.
  const manifest = [];
  const spine = [];

  // Resolve the cover image up-front if there is one. We need the
  // mime/ext for the manifest entry AND the raw bytes for the zip
  // payload, so reading it once before the spine work is simpler.
  let cover = null;
  if (manuscript.coverImage) {
    const data = await readImageBytes(manuscript.coverImage);
    if (data) {
      const href = `cover.${data.ext}`;
      zip.file(`OEBPS/${href}`, data.bytes);
      cover = { id: "cover-img", href, type: data.mime };
      manifest.push({ ...cover, properties: "cover-image" });

      // Cover xhtml page — referenced from the spine BEFORE the title
      // page so readers showing "linear" content open on the cover.
      zip.file("OEBPS/cover.xhtml", coverPageHtml(manuscript, cover.href));
      manifest.push({ id: "cover-page", href: "cover.xhtml", type: "application/xhtml+xml" });
      spine.push({ id: "cover-page", linear: "no" });
    }
  }

  // Title page.
  zip.file("OEBPS/title.xhtml", titlePageHtml(manuscript));
  manifest.push({ id: "title", href: "title.xhtml", type: "application/xhtml+xml" });
  spine.push({ id: "title" });

  // Parts and chapters.
  manuscript.parts.forEach((part, pi) => {
    const partId = `part-${pi + 1}`;
    const partHref = `${partId}.xhtml`;
    zip.file(`OEBPS/${partHref}`, partPageHtml(part));
    manifest.push({ id: partId, href: partHref, type: "application/xhtml+xml" });
    spine.push({ id: partId });

    part.chapters.forEach((ch) => {
      const chId = `ch-${ch.id}`;
      const chHref = `${chId}.xhtml`;
      zip.file(`OEBPS/${chHref}`, chapterHtml(ch));
      manifest.push({ id: chId, href: chHref, type: "application/xhtml+xml" });
      spine.push({ id: chId });
    });
  });

  // Nav doc (also the EPUB 3 TOC).
  zip.file("OEBPS/nav.xhtml", navHtml(manuscript));
  manifest.push({
    id: "nav", href: "nav.xhtml", type: "application/xhtml+xml",
    properties: "nav",
  });

  zip.file("OEBPS/style.css", stylesheet());
  manifest.push({ id: "css", href: "style.css", type: "text/css" });

  zip.file("OEBPS/content.opf", contentOpf({
    title: manuscript.title,
    author: manuscript.author,
    language: "en",
    identifier: uuid(),
    coverItemId: cover ? cover.id : null,
    manifest,
    spine,
  }));

  onProgress?.({ stage: "packing" });
  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/epub+zip",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  onProgress?.({ stage: "done" });
  return blob;
}

// ── HTML fragments ───────────────────────────────────────────────────

function htmlShell(title, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
  <meta charset="utf-8" />
  <title>${xmlEscape(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css" />
</head>
<body>
${body}
</body>
</html>`;
}

function titlePageHtml(m) {
  const subtitle = m.subtitle ? `<p class="subtitle">${xmlEscape(m.subtitle)}</p>` : "";
  const author = m.author ? `<p class="author">by ${xmlEscape(m.author)}</p>` : "";
  return htmlShell(m.title, `
<section epub:type="titlepage" class="titlepage">
  <h1 class="book-title">${xmlEscape(m.title)}</h1>
  ${subtitle}
  ${author}
</section>`);
}

function partPageHtml(part) {
  return htmlShell(part.title, `
<section epub:type="part" class="partpage">
  <h1>${xmlEscape(part.title)}</h1>
</section>`);
}

function coverPageHtml(m, coverHref) {
  // Full-bleed cover image. The wrapping <section> uses
  // epub:type="cover" so EPUB 3 readers handle navigation correctly.
  return htmlShell(`${m.title} — Cover`, `
<section epub:type="cover" class="cover">
  <img src="${xmlEscape(coverHref)}" alt="${xmlEscape(m.title)} cover" />
</section>`);
}

function chapterHtml(ch) {
  const body = [];
  body.push(`<section epub:type="chapter">`);
  body.push(`<p class="chapter-num">Chapter ${ch.num}</p>`);
  body.push(`<h2 class="chapter-title">${xmlEscape(ch.title)}</h2>`);
  for (const b of ch.blocks) {
    if (b.kind === "h1") continue;
    if (b.kind === "h2") body.push(`<h3>${xmlEscape(b.text)}</h3>`);
    else if (b.kind === "blockquote") body.push(`<blockquote>${xmlEscape(b.text)}</blockquote>`);
    else if (b.kind === "scene-break") body.push(`<p class="scene-break">* * *</p>`);
    else if (b.kind === "ul-item") body.push(`<ul><li>${xmlEscape(b.text)}</li></ul>`);
    else body.push(`<p>${xmlEscape(b.text)}</p>`);
  }
  body.push(`</section>`);
  return htmlShell(`Ch. ${ch.num} — ${ch.title}`, body.join("\n"));
}

function navHtml(m) {
  const items = [];
  for (const part of m.parts) {
    items.push(`<li><a href="part-${m.parts.indexOf(part) + 1}.xhtml">${xmlEscape(part.title)}</a>`);
    if (part.chapters.length) {
      items.push(`<ol>`);
      for (const ch of part.chapters) {
        items.push(`<li><a href="ch-${ch.id}.xhtml">${ch.num}. ${xmlEscape(ch.title)}</a></li>`);
      }
      items.push(`</ol>`);
    }
    items.push(`</li>`);
  }
  const body = `
<nav epub:type="toc" id="toc">
  <h1>Contents</h1>
  <ol>
    ${items.join("\n    ")}
  </ol>
</nav>`;
  return htmlShell("Contents", body);
}

function stylesheet() {
  return `body { font-family: Georgia, "Times New Roman", serif; line-height: 1.6; }
.cover { margin: 0; padding: 0; text-align: center; }
.cover img { max-width: 100%; max-height: 100vh; display: block; margin: 0 auto; }
.titlepage { text-align: center; margin-top: 30%; }
.book-title { font-size: 2.4em; margin: 0 0 0.4em; }
.subtitle { font-style: italic; color: #555; margin: 0 0 2em; }
.author { font-size: 1.1em; color: #333; }
.partpage { text-align: center; margin-top: 40%; }
.partpage h1 { font-size: 2em; }
.chapter-num { text-align: center; color: #888; letter-spacing: 0.2em; text-transform: uppercase; margin-top: 4em; font-size: 0.85em; }
.chapter-title { text-align: center; font-size: 1.6em; margin: 0.3em 0 2em; }
p { text-indent: 1.2em; margin: 0 0 0.6em; text-align: justify; }
p:first-of-type { text-indent: 0; }
.scene-break { text-align: center; text-indent: 0; letter-spacing: 0.5em; color: #888; margin: 1.5em 0; }
blockquote { font-style: italic; color: #555; margin: 1em 1.5em; }
h3 { font-size: 1.1em; margin: 1.2em 0 0.4em; }
nav ol { list-style: none; padding-left: 1em; }
nav > ol { padding-left: 0; }
nav a { text-decoration: none; color: inherit; }
`;
}

// ── EPUB metadata files ──────────────────────────────────────────────

function containerXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`;
}

function contentOpf({ title, author, language, identifier, coverItemId, manifest, spine }) {
  const manifestXml = manifest
    .map((m) => `<item id="${m.id}" href="${m.href}" media-type="${m.type}"${m.properties ? ` properties="${m.properties}"` : ""} />`)
    .join("\n    ");
  // Spine entries can be `{id, linear}` or bare strings (legacy).
  const spineXml = spine
    .map((s) => typeof s === "string"
      ? `<itemref idref="${s}" />`
      : `<itemref idref="${s.id}"${s.linear ? ` linear="${s.linear}"` : ""} />`)
    .join("\n    ");
  // EPUB 2 readers look at `<meta name="cover" content="…"/>`; emitting
  // it alongside the EPUB 3 `properties="cover-image"` maximises
  // compatibility with older e-readers (looking at you, Kindle).
  const legacyCoverMeta = coverItemId
    ? `<meta name="cover" content="${coverItemId}" />`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${language}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${identifier}</dc:identifier>
    <dc:title>${xmlEscape(title)}</dc:title>
    <dc:creator>${xmlEscape(author)}</dc:creator>
    <dc:language>${language}</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+/, "")}</meta>
    ${legacyCoverMeta}
  </metadata>
  <manifest>
    ${manifestXml}
  </manifest>
  <spine>
    ${spineXml}
  </spine>
</package>`;
}
