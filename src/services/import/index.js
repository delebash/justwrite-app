import { parseDocx } from './docx.js';
import { parseEpub } from './epub.js';
import { parseOdt }  from './odt.js';
import { parseText } from './text.js';
import { saveImage, urlFor } from '../imageStore.js';

async function rewriteImageSrcs(parsed) {
  const { images = [] } = parsed;
  if (!images.length) return parsed;

  const srcMap = new Map(); // originalHref → finalSrc
  let savedCount = 0;
  let skippedCount = 0;

  for (const { href, name, mime, bytes } of images) {
    if (!mime || mime === 'application/octet-stream') {
      skippedCount++;
      continue;
    }
    try {
      const file = new File([bytes], name, { type: mime });
      const record = await saveImage(file);
      const src = await urlFor(record);
      if (src) {
        srcMap.set(href, src);
        savedCount++;
      } else {
        skippedCount++;
      }
    } catch {
      skippedCount++;
    }
  }

  // Rewrite img srcs in every chapter using DOMParser (never regex over HTML)
  const chapters = parsed.chapters.map(chapter => {
    if (!chapter.html || !srcMap.size) return chapter;
    const doc = new DOMParser().parseFromString(chapter.html, 'text/html');
    let changed = false;
    for (const img of doc.querySelectorAll('img')) {
      const src = img.getAttribute('src');
      if (src && srcMap.has(src)) {
        img.setAttribute('src', srcMap.get(src));
        changed = true;
      }
    }
    return changed ? { ...chapter, html: doc.body.innerHTML } : chapter;
  });

  const warnings = [...(parsed.warnings ?? [])];
  if (savedCount > 0) {
    warnings.push(`${savedCount} image${savedCount === 1 ? '' : 's'} imported`);
  }
  if (skippedCount > 0) {
    warnings.push(`${skippedCount} image${skippedCount === 1 ? '' : 's'} skipped — unsupported format`);
  }

  // Drop the transport-only `images` field from the result
  const { images: _dropped, ...rest } = parsed;
  return { ...rest, chapters, warnings };
}

export async function parseFile(file) {
  const name = file.name ?? '';
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();

  switch (ext) {
    case '.docx': {
      const chapters_and_warnings = await parseDocx(await file.arrayBuffer());
      return { ...chapters_and_warnings, format: 'docx' };
    }
    case '.epub': {
      const parsed = await parseEpub(await file.arrayBuffer());
      const result = await rewriteImageSrcs(parsed);
      return { ...result, format: 'epub' };
    }
    case '.odt': {
      const parsed = await parseOdt(await file.arrayBuffer());
      const result = await rewriteImageSrcs(parsed);
      return { ...result, format: 'odt' };
    }
    case '.txt':
    case '.md':
    case '.markdown': {
      const chapters_and_warnings = await parseText(await file.text());
      return { ...chapters_and_warnings, format: 'text' };
    }
    default:
      throw new Error(`Unsupported file format: ${name}`);
  }
}

export { parseDocx, parseEpub, parseOdt, parseText };
export { splitTextIntoChapters, splitHtmlByHeadings, CHAPTER_HEADING_RE, looksLikeChapterHeading } from './detectChapters.js';
export { normalizeText, normalizeHtml, normalizePlain } from './normalize.js';
