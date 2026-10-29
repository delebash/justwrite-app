// SPDX-License-Identifier: MIT
// The PDF's page sizes — seeded facts, one row each in `page_sizes` (2026-10-28,
// docs/plans/2026-10-28-four-feature-ideas.md §1): the paper sizes and the common novel trim sizes,
// each with the margins a book on it starts with. Seeded insert-if-missing by id, so a row someone
// changed is never overwritten. Points throughout (72 to the inch); `unit` is how the screen shows
// a size's numbers.
//
// The trim sizes are KDP's paperback ones (https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6).
// Their side margin is 0.75 in, which covers KDP's inside-margin minimum up to 700 pages: pdfmake has
// no inside/outside margins, so the gutter is a margin on both sides. Their bottom margin leaves the
// page number room. A4 keeps the margins every PDF had before the sizes existed.

const IN = 72;
const MM = 72 / 25.4;

/** `[id, label, width, height, unit, top, bottom, side]` — the seeded rows, in the order shown. */
export const DEFAULT_PAGE_SIZES = [
  ["a4", "A4", 210 * MM, 297 * MM, "mm", 70, 80, 80],
  ["letter", "US Letter", 8.5 * IN, 11 * IN, "in", 1 * IN, 1.125 * IN, 1 * IN],
  ["a5", "A5", 148 * MM, 210 * MM, "mm", 18 * MM, 21 * MM, 18 * MM],
  ["trim-5x8", "5 × 8 in", 5 * IN, 8 * IN, "in", 0.75 * IN, 0.875 * IN, 0.75 * IN],
  ["trim-5-25x8", "5.25 × 8 in", 5.25 * IN, 8 * IN, "in", 0.75 * IN, 0.875 * IN, 0.75 * IN],
  ["trim-5-5x8-5", "5.5 × 8.5 in", 5.5 * IN, 8.5 * IN, "in", 0.75 * IN, 0.875 * IN, 0.75 * IN],
  ["trim-6x9", "6 × 9 in", 6 * IN, 9 * IN, "in", 0.75 * IN, 0.875 * IN, 0.75 * IN],
];

/** Insert any seeded size the database lacks. @returns {number} rows added */
export function seedPageSizes(h) {
  const have = new Set(h.all('select "id" from page_sizes').map((r) => r.id));
  let added = 0;
  DEFAULT_PAGE_SIZES.forEach(([id, label, width, height, unit, top, bottom, side], position) => {
    if (have.has(id)) return;
    h.insert("page_sizes", {
      id, position, label, unit,
      width_pt: width, height_pt: height,
      margin_top_pt: top, margin_bottom_pt: bottom, margin_side_pt: side,
    });
    added++;
  });
  return added;
}

/** The sizes as the screen reads them, in their order. */
export function listPageSizes(h) {
  return h.all('select * from page_sizes order by "position", "id"').map((r) => ({
    id: r.id,
    label: r.label,
    unit: r.unit,
    width: r.width_pt,
    height: r.height_pt,
    marginTop: r.margin_top_pt,
    marginBottom: r.margin_bottom_pt,
    marginSide: r.margin_side_pt,
  }));
}
