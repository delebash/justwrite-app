// The PDF's page — its size and margins — from the book's choice and the seeded sizes (2026-10-28,
// docs/plans/2026-10-28-four-feature-ideas.md §1). Points throughout (pdfmake's unit: 72 to the
// inch); a size's `unit` is only how its numbers are shown and typed.

/** Points per unit a page size is shown in. */
export const POINTS_PER = { in: 72, mm: 72 / 25.4 };

/** The book's margin, else the size's own (null: the book never set one). */
const pick = (v, own) => (Number.isFinite(v) && v >= 0 ? v : own);

/** The seeded size a book chose; an unknown or missing choice is the first row (A4, the size every
 *  book had before the choice existed). */
export function chosenSize(book, sizes) {
  return sizes.find((s) => s.id === book?.pdfPageSize) || sizes[0];
}

/**
 * pdfmake's page settings for a book: `{ pageSize: { width, height }, pageMargins: [left, top,
 * right, bottom] }` (https://pdfmake.github.io/docs/0.1/document-definition-object/page/). One side
 * margin for left and right: pdfmake has no inside/outside margins.
 */
export function pdfPage(book, sizes) {
  const size = chosenSize(book, sizes);
  const side = pick(book?.pdfMarginSide, size.marginSide);
  const top = pick(book?.pdfMarginTop, size.marginTop);
  const bottom = pick(book?.pdfMarginBottom, size.marginBottom);
  return { pageSize: { width: size.width, height: size.height }, pageMargins: [side, top, side, bottom] };
}

/** Points → the number shown in a field, in the size's unit (inches to 2 places, mm whole). */
export function toUnit(points, unit) {
  const v = points / POINTS_PER[unit];
  return unit === "in" ? Math.round(v * 100) / 100 : Math.round(v);
}

/** A typed number in the size's unit → points. */
export function fromUnit(value, unit) {
  return value * POINTS_PER[unit];
}
