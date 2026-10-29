// A Relations node's name in its circle (2026-10-28; out of RelationsPage.vue's fitLength, which
// squeezed a long name's letters to fit): one line when it fits; else two, broken at the space
// nearest the middle, at the name's own size; a line still too wide — one long word — is condensed
// to fit (`fit`: the width it may take, for SVG's textLength), as the old fit did for every line.

// an average glyph's width per unit of font size (the old fit's estimate — on the generous side)
const GLYPH_WIDTH = 0.55;
// a name a little over (up to this much, by the estimate) stays on one line, condensed unseen
// ("Petar Coyne" is 3% over); past it, it takes two lines
const ONE_LINE_SLACK = 1.15;

/** `[{ text, fit }]` — one or two lines; `fit` is null when the line fits as it is. */
export function labelLines(label, fontSize, maxWidth) {
  const text = String(label || "");
  const width = (s) => s.length * fontSize * GLYPH_WIDTH;
  const line = (t) => ({ text: t, fit: width(t) > maxWidth ? maxWidth : null });
  const words = text.split(" ").filter(Boolean);
  if (width(text) <= maxWidth * ONE_LINE_SLACK || words.length < 2) return [line(text)];
  let at = 1;
  let best = Infinity;
  for (let i = 1; i < words.length; i++) {
    const diff = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
    if (diff < best) {
      best = diff;
      at = i;
    }
  }
  return [line(words.slice(0, at).join(" ")), line(words.slice(at).join(" "))];
}
