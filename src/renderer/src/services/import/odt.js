const XLINK_NS = 'http://www.w3.org/1999/xlink';
const DRAW_NS = 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0';

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getTextContent(el) {
  // ODT uses text:span children; just grab all text recursively
  return el.textContent ?? '';
}

const EXT_MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
};

function mimeFromHref(href) {
  const ext = href.slice(href.lastIndexOf('.') + 1).toLowerCase();
  return EXT_MIME[ext] || null;
}

export async function parseOdt(arrayBuffer) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(arrayBuffer);
  const warnings = [];

  const contentXml = await zip.file('content.xml').async('string');
  const doc = new DOMParser().parseFromString(contentXml, 'application/xml');

  const officeText =
    doc.querySelector('document-content > body > text') ??
    doc.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:office:1.0', 'text')[0];

  if (!officeText) {
    return { chapters: [{ title: '', html: '' }], warnings: ['Could not parse ODT content.xml'], images: [] };
  }

  const children = Array.from(officeText.children);
  const chapters = [];
  let currentTitle = null;
  let currentParagraphs = [];
  let listCount = 0;

  // Map from zip href → { href, name, mime, bytes } — populated lazily
  const imageMap = new Map(); // href → entry (bytes filled after parsing)
  const pendingHrefs = new Set();

  function flush() {
    if (currentTitle !== null || currentParagraphs.length) {
      chapters.push({
        title: currentTitle ?? '',
        html: currentParagraphs.join('\n'),
      });
    }
    currentParagraphs = [];
  }

  // Extract draw:image href from a frame element
  function extractFrameImgHref(frameEl) {
    // Try NS-aware lookup first, then fallback
    let drawImg = null;
    try {
      drawImg = frameEl.getElementsByTagNameNS(DRAW_NS, 'image')[0];
    } catch {}
    if (!drawImg) {
      // Fallback: walk children by localName
      for (const child of frameEl.children) {
        if (child.localName === 'image') { drawImg = child; break; }
      }
    }
    if (!drawImg) return null;

    let href = drawImg.getAttributeNS(XLINK_NS, 'href') || drawImg.getAttribute('xlink:href');
    if (!href) return null;
    // Normalise: strip leading "./"
    if (href.startsWith('./')) href = href.slice(2);
    return href;
  }

  for (const el of children) {
    const local = el.localName;

    if (local === 'h') {
      const level = parseInt(el.getAttributeNS('urn:oasis:names:tc:opendocument:xmlns:text:1.0', 'outline-level') ?? el.getAttribute('text:outline-level') ?? '1', 10);
      if (level <= 2) {
        flush();
        currentTitle = getTextContent(el).trim();
        continue;
      }
      // h3+ treated as paragraph
      currentParagraphs.push('<p>' + escapeHtml(getTextContent(el).trim()) + '</p>');
    } else if (local === 'p') {
      // A paragraph may contain inline frames
      const text = getTextContent(el).trim();
      // Check for draw:frame children inside this paragraph
      const inlineFrames = [];
      for (const child of el.children) {
        if (child.localName === 'frame') {
          const href = extractFrameImgHref(child);
          if (href) inlineFrames.push(href);
        }
      }
      if (inlineFrames.length) {
        // Emit text (if any) followed by each image
        if (text) currentParagraphs.push('<p>' + escapeHtml(text) + '</p>');
        for (const href of inlineFrames) {
          currentParagraphs.push(`<img src="${href}">`);
          pendingHrefs.add(href);
        }
      } else if (text) {
        currentParagraphs.push('<p>' + escapeHtml(text) + '</p>');
      }
    } else if (local === 'list') {
      listCount++;
    } else if (local === 'frame') {
      // Top-level frame (image as its own block)
      const href = extractFrameImgHref(el);
      if (href) {
        currentParagraphs.push(`<img src="${href}">`);
        pendingHrefs.add(href);
      }
    }
    // other elements silently dropped
  }

  flush();

  if (listCount > 0) {
    warnings.push(`${listCount} list${listCount === 1 ? '' : 's'} dropped — not yet supported in import`);
  }

  // Extract bytes for each referenced image
  const images = [];
  for (const href of pendingHrefs) {
    const mime = mimeFromHref(href);
    if (!mime) continue; // skip unknown — don't try to render it
    const zipFile = zip.file(href);
    if (!zipFile) continue;
    const bytes = await zipFile.async('uint8array');
    const name = href.slice(href.lastIndexOf('/') + 1);
    images.push({ href, name, mime, bytes });
  }

  const result = chapters.filter(c => c.title || c.html.trim());
  return {
    chapters: result.length ? result : [{ title: '', html: '' }],
    warnings,
    images,
  };
}
