import { splitHtmlByHeadings } from './detectChapters.js';

export async function parseDocx(arrayBuffer) {
  let mammoth;
  try {
    ({ default: mammoth } = await import('mammoth/mammoth.browser.js'));
  } catch {
    try {
      mammoth = await import('mammoth');
      if (mammoth.default) mammoth = mammoth.default;
    } catch {
      throw new Error('mammoth is required for DOCX import — run: npm install mammoth');
    }
  }

  const result = await mammoth.convertToHtml({ arrayBuffer });
  const warnings = (result.messages ?? [])
    .filter(m => m.type === 'warning')
    .map(m => m.message);

  const chapters = splitHtmlByHeadings(result.value);
  return { chapters, warnings };
}
