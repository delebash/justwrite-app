// One-off verification harness for the EPUB importer. Shims DOMParser
// with linkedom so the browser-targeted parser runs under Node.
import fs from 'node:fs';
import path from 'node:path';
import { DOMParser } from 'linkedom';

globalThis.DOMParser = DOMParser;

const { parseEpub } = await import('../src/renderer/src/services/import/epub.js');

const epubPath = path.resolve('sample/the-gilgamesh-project-book-v-cuba-obooko.epub');
const buf = fs.readFileSync(epubPath);
const result = await parseEpub(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

console.log(`\n=== ${path.basename(epubPath)} ===`);
console.log(`Chapters: ${result.chapters.length}`);
console.log(`Images:   ${result.images?.length ?? 0}`);
console.log(`Warnings: ${result.warnings?.length ?? 0}`);
if (result.warnings?.length) result.warnings.forEach(w => console.log('  ! ' + w));

console.log('\n--- Chapter list ---');
result.chapters.forEach((c, i) => {
  const title = (c.title || '(no title)').slice(0, 60);
  const len = c.html.length;
  console.log(`${String(i + 1).padStart(2, ' ')}. ${title.padEnd(45, ' ')}  ${String(len).padStart(7, ' ')} chars`);
});
