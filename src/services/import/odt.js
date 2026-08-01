const XLINK_NS = 'http://www.w3.org/1999/xlink';
const DRAW_NS = 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0';
const TEXT_NS = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
const STYLE_NS = 'urn:oasis:names:tc:opendocument:xmlns:style:1.0';

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

// Build styleName → (level → numbered?) from every <text:list-style> in the
// given XML documents. Ordered-vs-bullet is a PER-LEVEL fact in ODF: a list
// style carries up to ten text:list-level-style-{number|bullet|image}
// children, one per text:level. Toolbar-made lists get an automatic style in
// content.xml; the stock NAMED styles ("List Number") live in styles.xml —
// both docs are passed in, later docs winning name collisions.
function buildListStyleMap(docs) {
  const map = new Map();
  for (const d of docs) {
    if (!d) continue;
    let styles = [];
    try {
      styles = Array.from(d.getElementsByTagNameNS(TEXT_NS, 'list-style'));
    } catch {}
    if (!styles.length) {
      styles = Array.from(d.getElementsByTagName('*')).filter((e) => e.localName === 'list-style');
    }
    for (const ls of styles) {
      const name = ls.getAttributeNS(STYLE_NS, 'name') || ls.getAttribute('style:name');
      if (!name) continue;
      const levels = new Map();
      for (const lvl of ls.children) {
        const n = parseInt(lvl.getAttributeNS(TEXT_NS, 'level') ?? lvl.getAttribute('text:level') ?? '0', 10);
        if (!n) continue;
        levels.set(n, lvl.localName === 'list-level-style-number');
      }
      map.set(name, levels);
    }
  }
  return map;
}

// Render a <text:list> (recursively) as TipTap-friendly <ul>/<ol> HTML:
// <li><p>…</p></li>, multiple paragraphs per item allowed, nested lists
// recursing INSIDE the parent <li>. A nested list without its own
// text:style-name inherits the surrounding list's style (ODF 1.2 §5.3.2:
// "If a list is contained within another list, the list style defaults to
// the style of the surrounding list"), and the effective style decides
// numbered-vs-bullet per nesting level (§16.30: a list style holds one
// list-level-style-{number|bullet|image} per level; a level WITHOUT its own
// specification uses "the list level style of the next lower level", hence
// the walk-down below; no definition at all → bullet, our implementation
// default per the spec's "implementation-dependent default"). Items are
// text-only (inline frames inside list items are out of scope for a
// manuscript import); text:list-header (§5.3.3) is treated like an item —
// text fidelity beats numbering purity here. continue-numbering / start
// values are ignored (the editor normalizes numbering on import).
function renderList(listEl, depth, inheritedStyle, listStyles) {
  const styleName =
    listEl.getAttributeNS(TEXT_NS, 'style-name') || listEl.getAttribute('text:style-name') || inheritedStyle;
  const levels = listStyles.get(styleName);
  let numbered = false;
  if (levels) {
    for (let d = depth; d >= 1; d--) {
      const def = levels.get(d);
      if (def !== undefined) { numbered = def; break; }
    }
  }
  const items = [];
  for (const item of listEl.children) {
    if (item.localName !== 'list-item' && item.localName !== 'list-header') continue;
    const parts = [];
    for (const child of item.children) {
      if (child.localName === 'p' || child.localName === 'h') {
        const text = getTextContent(child).trim();
        if (text) parts.push(`<p>${escapeHtml(text)}</p>`);
      } else if (child.localName === 'list') {
        const nested = renderList(child, depth + 1, styleName, listStyles);
        if (nested) parts.push(nested);
      }
    }
    if (parts.length) items.push(`<li>${parts.join('')}</li>`);
  }
  if (!items.length) return '';
  const tag = numbered ? 'ol' : 'ul';
  return `<${tag}>${items.join('')}</${tag}>`;
}

export async function parseOdt(arrayBuffer) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(arrayBuffer);
  const warnings = [];

  const contentXml = await zip.file('content.xml').async('string');
  const doc = new DOMParser().parseFromString(contentXml, 'application/xml');

  // styles.xml carries the NAMED list styles ("List Number" etc.); content.xml
  // carries the automatic ones. Both feed the list-style map; content.xml wins
  // name collisions (doc-specific overrides).
  let stylesDoc = null;
  const stylesFile = zip.file('styles.xml');
  if (stylesFile) {
    try {
      stylesDoc = new DOMParser().parseFromString(await stylesFile.async('string'), 'application/xml');
    } catch {}
  }
  const listStyles = buildListStyleMap([stylesDoc, doc]);

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
      currentParagraphs.push(`<p>${escapeHtml(getTextContent(el).trim())}</p>`);
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
        if (text) currentParagraphs.push(`<p>${escapeHtml(text)}</p>`);
        for (const href of inlineFrames) {
          currentParagraphs.push(`<img src="${href}">`);
          pendingHrefs.add(href);
        }
      } else if (text) {
        currentParagraphs.push(`<p>${escapeHtml(text)}</p>`);
      }
    } else if (local === 'list') {
      const listHtml = renderList(el, 1, null, listStyles);
      if (listHtml) currentParagraphs.push(listHtml);
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
