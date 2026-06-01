function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getTextContent(el) {
  // ODT uses text:span children; just grab all text recursively
  return el.textContent ?? '';
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
    return { chapters: [{ title: '', html: '' }], warnings: ['Could not parse ODT content.xml'] };
  }

  const children = Array.from(officeText.children);
  const chapters = [];
  let currentTitle = null;
  let currentParagraphs = [];
  let listCount = 0;
  let imgCount = 0;

  function flush() {
    if (currentTitle !== null || currentParagraphs.length) {
      chapters.push({
        title: currentTitle ?? '',
        html: currentParagraphs.join('\n'),
      });
    }
    currentParagraphs = [];
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
      const text = getTextContent(el).trim();
      if (text) {
        currentParagraphs.push('<p>' + escapeHtml(text) + '</p>');
      }
    } else if (local === 'list') {
      listCount++;
    } else if (local === 'frame' || local === 'image') {
      imgCount++;
    }
    // other elements silently dropped
  }

  flush();

  if (listCount > 0) {
    warnings.push(`${listCount} list${listCount === 1 ? '' : 's'} dropped — not yet supported in import`);
  }
  if (imgCount > 0) {
    warnings.push(`${imgCount} image${imgCount === 1 ? '' : 's'} dropped — not yet supported in import`);
  }

  const result = chapters.filter(c => c.title || c.html.trim());
  return {
    chapters: result.length ? result : [{ title: '', html: '' }],
    warnings,
  };
}
