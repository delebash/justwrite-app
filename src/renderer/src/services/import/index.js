import { parseDocx } from './docx.js';
import { parseEpub } from './epub.js';
import { parseOdt }  from './odt.js';
import { parseText } from './text.js';

export async function parseFile(file) {
  const name = file.name ?? '';
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();

  switch (ext) {
    case '.docx': {
      const chapters_and_warnings = await parseDocx(await file.arrayBuffer());
      return { ...chapters_and_warnings, format: 'docx' };
    }
    case '.epub': {
      const chapters_and_warnings = await parseEpub(await file.arrayBuffer());
      return { ...chapters_and_warnings, format: 'epub' };
    }
    case '.odt': {
      const chapters_and_warnings = await parseOdt(await file.arrayBuffer());
      return { ...chapters_and_warnings, format: 'odt' };
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
