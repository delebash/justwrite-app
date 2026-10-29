// The PDF's page on the Export page (2026-10-28, docs/plans/2026-10-28-four-feature-ideas.md §1): a
// seeded size, its margins in its own unit, kept with the book — a new size brings its own margins,
// and a margin typed in inches is kept in points.
import { expect, expectNoSidewaysScroll, inStore, test } from "./fixtures.js";

test("the PDF card's page size and margins are kept with the book", async ({ page }) => {
  await page.goto("/#/export");
  const block = page.locator(".pdf-page");
  await expect(block.getByText("Page size", { exact: true })).toBeVisible();
  await expectNoSidewaysScroll(page);

  await page.locator("#pdf-page-size").click();
  await page.getByRole("option", { name: "6 × 9 in" }).click();
  await expect(block.getByText("Top margin (in)")).toBeVisible();
  await expect(page.locator("#pdfMarginTop")).toHaveAttribute("placeholder", "0.75");

  await page.locator("#pdfMarginTop").fill("1");
  await page.locator("#pdfMarginTop").press("Enter");
  await expect.poll(() => inStore(page, (s) => [s.project.pdfPageSize, s.project.pdfMarginTop, s.project.pdfMarginSide]))
    .toEqual(["trim-6x9", 72, null]);

  // another size: its own margins again
  await page.locator("#pdf-page-size").click();
  await page.getByRole("option", { name: "A4" }).click();
  await expect(block.getByText("Top margin (mm)")).toBeVisible();
  await expect.poll(() => inStore(page, (s) => [s.project.pdfPageSize, s.project.pdfMarginTop])).toEqual(["a4", null]);
});
