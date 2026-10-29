// SPDX-License-Identifier: MIT
// The PDF's page sizes (2026-10-28): seeded rows, insert-if-missing, read at /v1/page-sizes.
import { expect, test } from "vitest";
import { DEFAULT_PAGE_SIZES, seedPageSizes } from "../src/database/page_sizes.js";
import { state } from "../src/database/session.js";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

test("the sizes are seeded once, in order, and a changed row is left alone", async () => {
  const c = await client(tmpPath());
  const h = state.handle;
  expect(h.tx(() => seedPageSizes(h))).toBe(DEFAULT_PAGE_SIZES.length);
  h.tx(() => h.update("page_sizes", { margin_side_pt: 90 }, { id: "a4" }));
  expect(h.tx(() => seedPageSizes(h))).toBe(0);

  const { sizes } = (await c.get("/v1/page-sizes")).json();
  expect(sizes.map((s) => s.id)).toEqual(DEFAULT_PAGE_SIZES.map(([id]) => id));
  const a4 = sizes[0];
  // A4 keeps the page every PDF had: 595.28 × 841.89 pt, margins 70 top, 80 bottom (and the side
  // margin someone changed stays changed)
  expect([a4.width, a4.height].map((n) => Math.round(n * 100) / 100)).toEqual([595.28, 841.89]);
  expect([a4.marginTop, a4.marginBottom, a4.marginSide, a4.unit]).toEqual([70, 80, 90, "mm"]);
  const sixByNine = sizes.find((s) => s.id === "trim-6x9");
  expect([sixByNine.width, sixByNine.height, sixByNine.marginSide, sixByNine.unit]).toEqual([432, 648, 54, "in"]);
});
