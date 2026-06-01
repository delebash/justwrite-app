const ZERO_WIDTH_RE = /[​‌‍﻿]/g;

function applyTransforms(str) {
  // Em-dash
  str = str.replace(/--/g, '—');
  // Ellipsis
  str = str.replace(/\.{3,}/g, '…');
  // Smart double quotes: opening after start, whitespace, or open brackets
  str = str.replace(/(^|[\s([{])"(?=\S)/gm, '$1“');
  // Closing double quote after word char or punctuation
  str = str.replace(/(\S)"/g, '$1”');
  // Remaining double quotes (shouldn't be many) → closing
  str = str.replace(/"/g, '”');
  // Smart single quotes: apostrophe between word chars
  str = str.replace(/(\w)'(\w)/g, '$1’$2');
  // Opening single quote after start, whitespace, or open brackets
  str = str.replace(/(^|[\s([{])'(?=\S)/gm, '$1‘');
  // Closing single quote after word char or punctuation
  str = str.replace(/(\S)'/g, '$1’');
  // Zero-width chars
  str = str.replace(ZERO_WIDTH_RE, '');
  // NFC normalization
  str = str.normalize('NFC');
  return str;
}

function collapseBlankLines(str) {
  // Trim trailing whitespace per line, then collapse 3+ blanks to 2
  str = str.replace(/[ \t]+$/gm, '');
  str = str.replace(/\n{3,}/g, '\n\n');
  return str;
}

export function normalizePlain(text) {
  let out = applyTransforms(text);
  out = collapseBlankLines(out);
  return out;
}

export function normalizeHtml(html) {
  // Walk text nodes only; leave markup untouched
  const doc = new DOMParser().parseFromString(html, 'text/html');

  function walkNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      node.textContent = applyTransforms(node.textContent);
    } else {
      for (const child of Array.from(node.childNodes)) {
        walkNode(child);
      }
    }
  }

  walkNode(doc.body ?? doc.documentElement);
  return (doc.body ?? doc.documentElement).innerHTML;
}

export function normalizeText(input) {
  if (typeof input === 'string' && input.trimStart().startsWith('<')) {
    return normalizeHtml(input);
  }
  return normalizePlain(input);
}
