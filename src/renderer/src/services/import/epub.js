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
    };
  }

  // Build a lookup from OPF-resolved href → manifest entry for images
  const imageManifest = {}; // href → { href, mediaType }
  for (const entry of Object.values(manifest)) {
    if (entry.mediaType && entry.mediaType.startsWith('image/')) {
      imageManifest[entry.href] = entry;
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
    if (!body || !body.textContent.trim()) continue;

    // Resolve each <img src> against this XHTML doc's directory,
    // producing an OPF-resolved path that matches the manifest keys.
    const xhtmlDir = item.href.includes('/') ? item.href.slice(0, item.href.lastIndexOf('/') + 1) : '';
    for (const img of Array.from(body.querySelectorAll('img'))) {
      const src = img.getAttribute('src');
      if (!src) continue;
      const resolved = resolveHref(xhtmlDir + '_', src); // trick: treat xhtmlDir as base "file"
      img.setAttribute('src', resolved);
      referencedImageHrefs.add(resolved);
    }

    const bodyHtml = body.innerHTML;
    const h1Count = body.querySelectorAll('h1').length;

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
