import { splitTextIntoChapters } from './detectChapters.js';

export async function parseText(text) {
  const chapters = splitTextIntoChapters(text);
  return { chapters, warnings: [] };
}
