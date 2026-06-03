import { splitHtmlByHeadings } from './detectChapters.js';

function resolveHref(base, href) {
  // base is like 'OEBPS/content.opf', href is relative to that directory
  const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '';
  if (href.startsWith('/')) return normalizePath(href.slice(1));
  return normalizePath(dir + href);
}

function normalizePath(path) {
  // Collapse '..' and '.' segments without URL parsing
  const parts = path.split('/');
  const out = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.') out.push(p);
  }
  return out.join('/');
}

function parseXml(str) {
  return new DOMParser().parseFromString(str, 'application/xml');
}

function isNavDoc(text) {
  return /<nav[\s>]/i.test(text) && !/<p[\s>]/i.test(text);
}

const EXT_MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
};

function mimeFromHref(href) {
  const ext = href.slice(href.lastIndexOf('.') + 1).toLowerCase();
  return EXT_MIME[ext] || null;
}

// Escape an attribute selector value so we can search by [id="…"] without
// CSS.escape (jsdom lacks it; document IDs may include $/_/digits).
function attrSelector(name, value) {
  return `[${name}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
}

// Parse the NCX (EPUB 2) into a flat list of { title, file, fragment }.
// `navMap > navPoint` is the canonical chapter tree; we flatten depth-first
// so the order matches reading order.
function parseNcx(ncxDoc, ncxPath) {
  const dir = ncxPath.includes('/') ? ncxPath.slice(0, ncxPath.lastIndexOf('/') + 1) : '';
  const entries = [];
  for (const np of Array.from(ncxDoc.querySelectorAll('navMap navPoint'))) {
    const text = np.querySelector('navLabel > text')?.textContent?.trim() || '';
    const src = np.querySelector('content')?.getAttribute('src') || '';
    if (!src) continue;
    const [file, fragment] = src.split('#');
    if (!file) continue;
    entries.push({
      title: text,
      file: normalizePath(dir + file),
      fragment: fragment || null,
    });
  }
  return entries;
}

// Parse an EPUB 3 nav doc (XHTML <nav epub:type="toc">) into the same shape.
function parseNav(navDoc, navPath) {
  const dir = navPath.includes('/') ? navPath.slice(0, navPath.lastIndexOf('/') + 1) : '';
  const entries = [];
  // Prefer the explicit toc nav; fall back to the first <nav>.
  const navs = Array.from(navDoc.querySelectorAll('nav'));
  const tocNav = navs.find(n => (n.getAttribute('epub:type') || n.getAttributeNS?.('http://www.idpf.org/2007/ops', 'type') || '').includes('toc'))
    || navs[0];
  if (!tocNav) return entries;
  for (const a of Array.from(tocNav.querySelectorAll('a[href]'))) {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#')) continue;
    const [file, fragment] = href.split('#');
    if (!file) continue;
    entries.push({
      title: a.textContent.trim(),
      file: normalizePath(dir + file),
      fragment: fragment || null,
    });
  }
  return entries;
}

// Find the lowest element under `body` that contains every passed element.
// For most Calibre/Sigil EPUBs the chapter anchors are siblings of each
// other (under <body> directly, or under a single wrapper <div>), so the
// common ancestor is usually <body> or that wrapper — exactly the level at
// which we want to slice.
function findCommonAncestor(body, els) {
  if (!els.length) return body;
  let ancestors = [];
  for (let n = els[0]; n; n = n.parentNode) {
    ancestors.push(n);
    if (n === body) break;
  }
  for (let i = 1; i < els.length; i++) {
    while (ancestors.length && !ancestors[0].contains(els[i])) ancestors.shift();
    if (!ancestors.length) return body;
  }
  return ancestors[0];
}

// Walk an element up to a body-direct-child (or, more generally, up to the
// element whose parent IS the given root). Used when chapter anchors are
// nested inside a wrapper but we want to slice at the wrapper's child level.
function ascendTo(el, root) {
  let cur = el;
  while (cur && cur.parentNode && cur.parentNode !== root) cur = cur.parentNode;
  return cur && cur.parentNode === root ? cur : null;
}

// If the first element of a chapter slice is an h1–h6 whose text duplicates
// the NCX title (e.g. "CHAPTER 1" when the navPoint label is also "CHAPTER 1"),
// drop it. The chapter title lives on the chapter object and is shown in the
// page chrome — leaving the heading inside the body would (a) duplicate the
// title visually and (b) get downgraded by TipTap to a plain paragraph that
// breaks the first-line-indent convention.
function stripLeadingDuplicateHeading(nodes, title) {
  if (!nodes.length || !title) return nodes;
  const first = nodes[0];
  const tag = first.tagName?.toUpperCase();
  if (!tag || !/^H[1-6]$/.test(tag)) return nodes;
  const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (norm(first.textContent) === norm(title)) return nodes.slice(1);
  return nodes;
}

// Slice a single XHTML body into chapters using NCX/nav fragment IDs.
// `navEntries` are the entries (in NCX order) that all point to this file.
// Returns [{ title, html }] in NCX order, skipping empty slices.
function splitBodyByFragments(body, navEntries) {
  if (!navEntries.length) return [];

  // Resolve each fragment to a real element. Entries without a fragment
  // anchor the slice at the start of the common ancestor.
  const resolved = navEntries.map(e => ({
    entry: e,
    el: e.fragment ? body.querySelector(attrSelector('id', e.fragment)) : null,
  }));

  const anchoredEls = resolved.map(r => r.el).filter(Boolean);
  if (!anchoredEls.length) {
    // No fragments resolved — give the whole file to the first entry.
    return [{ title: navEntries[0].title, html: body.innerHTML }];
  }

  const root = findCommonAncestor(body, anchoredEls);

  // Map each body-direct-child of `root` to the index of the navEntry
  // whose anchor lives inside it.
  const startByChild = new Map();
  for (let i = 0; i < resolved.length; i++) {
    const { entry, el } = resolved[i];
    let child = el ? ascendTo(el, root) : root.firstElementChild;
    if (!child) continue;
    // First entry with no fragment wins the first child; later entries
    // with no fragment are no-ops (rare in real EPUBs).
    if (!startByChild.has(child)) startByChild.set(child, i);
  }

  const slices = navEntries.map(e => ({ title: e.title, nodes: [] }));
  let currentIdx = -1; // content before the first anchor is dropped
  for (const child of Array.from(root.children)) {
    if (startByChild.has(child)) currentIdx = startByChild.get(child);
    if (currentIdx >= 0) slices[currentIdx].nodes.push(child);
  }

  return slices
    .map(s => {
      const trimmed = stripLeadingDuplicateHeading(s.nodes, s.title);
      return { title: s.title, html: trimmed.map(n => n.outerHTML).join('\n') };
    })
    .filter(s => s.html.replace(/\s/g, '') || s.title);
}

export async function parseEpub(arrayBuffer) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(arrayBuffer);
  const warnings = [];

  const containerXml = await zip.file('META-INF/container.xml').async('string');
  const containerDoc = parseXml(containerXml);
  const opfPath = containerDoc.querySelector('rootfile').getAttribute('full-path');

  const opfXml = await zip.file(opfPath).async('string');
  const opfDoc = parseXml(opfXml);

  const manifest = {};
  for (const item of opfDoc.querySelectorAll('manifest item')) {
    manifest[item.getAttribute('id')] = {
      href: resolveHref(opfPath, item.getAttribute('href')),
      mediaType: item.getAttribute('media-type'),
      properties: item.getAttribute('properties') || '',
    };
  }

  const imageManifest = {};
  for (const entry of Object.values(manifest)) {
    if (entry.mediaType && entry.mediaType.startsWith('image/')) {
      imageManifest[entry.href] = entry;
    }
  }

  // ── Authoritative chapter map: NCX (EPUB 2) or nav doc (EPUB 3) ────
  // Spine's toc="…" attribute points at the NCX manifest id; the EPUB 3
  // nav doc is identified by properties="nav" on its manifest item. We
  // try both; if either yields entries, prefer that over heading sniffing.
  let navEntries = [];
  const spineEl = opfDoc.querySelector('spine');
  const ncxId = spineEl?.getAttribute('toc');
  const ncxEntry = (ncxId && manifest[ncxId])
    || Object.values(manifest).find(m => m.mediaType === 'application/x-dtbncx+xml');
  const navManifest = Object.values(manifest).find(m => m.properties && m.properties.split(/\s+/).includes('nav'));

  if (ncxEntry && zip.file(ncxEntry.href)) {
    try {
      const ncxText = await zip.file(ncxEntry.href).async('string');
      const ncxDoc = parseXml(ncxText);
      navEntries = parseNcx(ncxDoc, ncxEntry.href);
    } catch {
      warnings.push('NCX parse failed; falling back to heading detection');
    }
  }
  if (!navEntries.length && navManifest && zip.file(navManifest.href)) {
    try {
      const navText = await zip.file(navManifest.href).async('string');
      const navDoc = new DOMParser().parseFromString(navText, 'text/html');
      navEntries = parseNav(navDoc, navManifest.href);
    } catch {
      warnings.push('Nav doc parse failed; falling back to heading detection');
    }
  }

  const spineItems = Array.from(opfDoc.querySelectorAll('spine itemref'))
    .map(ref => manifest[ref.getAttribute('idref')])
    .filter(Boolean);

  const chapters = [];
  // Collect all image hrefs referenced by chapter HTML (OPF-resolved)
  const referencedImageHrefs = new Set();

  for (const item of spineItems) {
    const mediaType = item.mediaType ?? '';
    if (!mediaType.includes('html') && !mediaType.includes('xhtml')) continue;

    const file = zip.file(item.href);
    if (!file) continue;

    const text = await file.async('string');
    if (isNavDoc(text)) continue;

    const doc = new DOMParser().parseFromString(text, 'text/html');
    const body = doc.body;
    if (!body) continue;

    // Resolve each <img src> against this XHTML doc's directory and
    // collect them into the referenced set. Done BEFORE the text-content
    // gate so image-only pages (covers, plates) still contribute their
    // images — those pages just don't end up as chapters.
    const xhtmlDir = item.href.includes('/') ? item.href.slice(0, item.href.lastIndexOf('/') + 1) : '';
    for (const img of Array.from(body.querySelectorAll('img'))) {
      const src = img.getAttribute('src');
      if (!src) continue;
      const resolved = resolveHref(xhtmlDir + '_', src); // trick: treat xhtmlDir as base "file"
      img.setAttribute('src', resolved);
      referencedImageHrefs.add(resolved);
    }

    // Skip text-less docs from chapter inclusion (cover/plate pages).
    if (!body.textContent.trim()) continue;

    const bodyHtml = body.innerHTML;
    const h1Count = body.querySelectorAll('h1').length;

    // Figure/plate page heuristic: contains an <img>, has no chapter
    // heading (h1/h2), and very little text. Many EPUBs put illustrations
    // on their own spine entry (with just a caption); those should merge
    // into the previous prose chapter so the figure stays anchored where
    // it belongs instead of showing up as a standalone "chapter".
    const hasImg = !!body.querySelector('img');
    const hasHeading = !!body.querySelector('h1, h2');
    const textLen = body.textContent.trim().length;
    const isFigurePage = hasImg && !hasHeading && textLen < 300;

    if (isFigurePage && chapters.length > 0) {
      chapters[chapters.length - 1].html += bodyHtml;
      continue;
    }

    // ── Prefer NCX/nav-driven splitting when it covers this file ───────
    const myNavs = navEntries.filter(e => e.file === item.href);
    if (myNavs.length >= 2 && myNavs.some(e => e.fragment)) {
      // One spine file contains multiple chapters demarcated by anchor IDs
      // (Calibre/Sigil pattern). Slice it.
      const slices = splitBodyByFragments(body, myNavs);
      if (slices.length) {
        chapters.push(...slices);
        continue;
      }
    }
    if (myNavs.length === 1) {
      // Whole file is one chapter — trust the NCX title over any in-file heading.
      chapters.push({ title: myNavs[0].title, html: bodyHtml });
      continue;
    }

    // ── Fallback: heading-based detection (legacy behavior) ────────────
    if (h1Count > 1) {
      const sub = splitHtmlByHeadings(bodyHtml);
      chapters.push(...sub);
    } else {
      const heading = body.querySelector('h1, h2');
      const title = heading ? heading.textContent.trim() : (() => {
        const firstP = body.querySelector('p');
        return firstP && firstP.textContent.trim().length < 80 ? firstP.textContent.trim() : '';
      })();
      chapters.push({ title, html: bodyHtml });
    }
  }

  // Extract bytes for every image referenced by chapters (must exist in zip)
  const images = [];
  for (const href of referencedImageHrefs) {
    const entry = imageManifest[href];
    const zipFile = zip.file(href);
    if (!zipFile) continue;
    const mime = (entry && entry.mediaType) || mimeFromHref(href) || 'application/octet-stream';
    const bytes = await zipFile.async('uint8array');
    const name = href.slice(href.lastIndexOf('/') + 1);
    images.push({ href, name, mime, bytes });
  }

  return {
    chapters: chapters.filter(c => c.title || c.html.replace(/\s/g, '')),
    warnings,
    images,
  };
}
