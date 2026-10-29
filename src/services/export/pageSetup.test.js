// The PDF's page from the book's choice and the seeded sizes (2026-10-28).
import { describe, expect, it } from "vitest";
import { chosenSize, fromUnit, pdfPage, toUnit } from "./pageSetup.js";

const A4 = { id: "a4", unit: "mm", width: 595.28, height: 841.89, marginTop: 70, marginBottom: 80, marginSide: 80 };
const SIX_NINE = { id: "trim-6x9", unit: "in", width: 432, height: 648, marginTop: 54, marginBottom: 63, marginSide: 54 };
const SIZES = [A4, SIX_NINE];

describe("the PDF's page", () => {
  it("is A4 with the margins every PDF had, for a book that never chose", () => {
    expect(pdfPage({}, SIZES)).toEqual({ pageSize: { width: 595.28, height: 841.89 }, pageMargins: [80, 70, 80, 80] });
    expect(chosenSize({ pdfPageSize: "gone" }, SIZES)).toBe(A4);
  });

  it("is the chosen size with its own margins, and the book's where it set them", () => {
    expect(pdfPage({ pdfPageSize: "trim-6x9" }, SIZES).pageMargins).toEqual([54, 54, 54, 63]);
    const book = { pdfPageSize: "trim-6x9", pdfMarginTop: 72, pdfMarginBottom: null, pdfMarginSide: 0 };
    expect(pdfPage(book, SIZES)).toEqual({ pageSize: { width: 432, height: 648 }, pageMargins: [0, 72, 0, 63] });
  });

  it("shows points in the size's unit and reads them back", () => {
    expect(toUnit(54, "in")).toBe(0.75);
    expect(toUnit(63, "in")).toBe(0.88);
    expect(toUnit(70, "mm")).toBe(25);
    expect(fromUnit(1, "in")).toBe(72);
    expect(fromUnit(25.4, "mm")).toBeCloseTo(72);
  });
});
