export const CHAPTER_HEADING_RE = /^(#{1,3}\s+|(?:chapter|chapitre|cap[ií]tulo|kapittel|kapitel|capitolo|rozdzia[łl]|hoofdstuk)\s+[\w一-鿿぀-ヿ가-힯]+|prologue|epilogue|epilog|vorwort|nachwort|part\s+[\w]+|partie\s+[\w]+|第[一-鿿\d]+[章話话]|제\d+장|глава\s+\d+)/i;

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function linesToHtml(lines) {
  const paragraphs = [];
  let current = [];
  for (const line of lines) {
    if (line.trim() === '') {
      if (current.length) {
        paragraphs.push('<p>' + escapeHtml(current.join(' ')) + '</p>');
        current = [];
      }
    } else {
      current.push(line.trim());
    }
  }
  if (current.length) {
    paragraphs.push('<p>' + escapeHtml(current.join(' ')) + '</p>');
  }
  return paragraphs.join('\n');
}

function sanitizeHtml(html) {
  return html
    .replace(/<(html|head|body|script|style)(\s[^>]*)?>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(html|head|body|script|style)(\s[^>]*)?>/gi, '');
}

export function looksLikeChapterHeading(line) {
  return CHAPTER_HEADING_RE.test(line.trim());
}

export function splitTextIntoChapters(text) {
  const lines = text.split(/\r?\n/);
  const chapters = [];
  let currentTitle = null;
  let currentLines = [];
  let hasHeading = false;

  for (const line of lines) {
    if (CHAPTER_HEADING_RE.test(line.trim())) {
      hasHeading = true;
      if (currentTitle !== null || currentLines.some(l => l.trim())) {
        const html = linesToHtml(currentLines);
        if (currentTitle !== null || html) {
          chapters.push({ title: currentTitle ?? '', html });
        }
      }
      currentTitle = line.trim().replace(/^#{1,3}\s+/, '');
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentTitle !== null || currentLines.some(l => l.trim())) {
    const html = linesToHtml(currentLines);
    if (currentTitle !== null || html) {
      chapters.push({ title: currentTitle ?? '', html });
    }
  }

  if (!hasHeading) {
    return [{ title: '', html: linesToHtml(lines) }];
  }

  return chapters.filter(c => c.title || c.html.trim());
}

export function splitHtmlByHeadings(html) {
  const sanitized = sanitizeHtml(html);
  const doc = new DOMParser().parseFromString(sanitized, 'text/html');
  const root = doc.body || doc.documentElement;
  const children = Array.from(root.children);

  const chapters = [];
  let currentTitle = null;
  let currentNodes = [];

  function flush() {
    const body = currentNodes.map(n => n.outerHTML).join('\n');
    if (currentTitle !== null || body.trim()) {
      chapters.push({ title: currentTitle ?? '', html: body });
    }
    currentNodes = [];
  }

  for (const node of children) {
    const tag = node.tagName.toUpperCase();
    if (tag === 'H1' || tag === 'H2') {
      flush();
      currentTitle = node.textContent.trim();
    } else {
      currentNodes.push(node);
    }
  }
  flush();

  if (!chapters.some(c => c.title)) {
    return [{ title: '', html: root.innerHTML }];
  }

  return chapters.filter(c => c.title || c.html.replace(/\s/g, ''));
}
