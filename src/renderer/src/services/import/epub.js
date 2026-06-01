import { splitHtmlByHeadings } from './detectChapters.js';

function resolveHref(base, href) {
  // base is like 'OEBPS/content.opf', href is relative to that directory
  const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '';
  if (href.startsWith('/')) return href.slice(1);
  return dir + href;
}

function parseXml(str) {
  return new DOMParser().parseFromString(str, 'application/xml');
}

function isNavDoc(text) {
  return /<nav[\s>]/i.test(text) && !/<p[\s>]/i.test(text);
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

  const spineItems = Array.from(opfDoc.querySelectorAll('spine itemref'))
    .map(ref => manifest[ref.getAttribute('idref')])
    .filter(Boolean);

  const chapters = [];
  let droppedImages = 0;

  for (const item of spineItems) {
    const mediaType = item.mediaType ?? '';
    if (!mediaType.includes('html') && !mediaType.includes('xhtml')) continue;

    const file = zip.file(item.href);
    if (!file) continue;

    const text = await file.async('string');
    if (isNavDoc(text)) continue;

    // Count and strip images
    const imgMatches = text.match(/<img\b[^>]*>/gi) ?? [];
    droppedImages += imgMatches.length;

    const doc = new DOMParser().parseFromString(text, 'text/html');
    const body = doc.body;
    if (!body || !body.textContent.trim()) continue;

    // Strip img elements from the DOM
    for (const img of Array.from(body.querySelectorAll('img'))) {
      img.remove();
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

  if (droppedImages > 0) {
    warnings.push(`${droppedImages} image${droppedImages === 1 ? '' : 's'} dropped — not yet supported in import`);
  }

  return { chapters: chapters.filter(c => c.title || c.html.replace(/\s/g, '')), warnings };
}
