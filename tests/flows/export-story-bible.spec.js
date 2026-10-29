// The Story bible card on the Export page (2026-10-28, docs/plans/archive/2026-10-28-four-feature-ideas.md
// §3): DOCX or PDF, the "Exclude from AI" switch, and a file named after the book.
import { expect, expectNoSidewaysScroll, test } from "./fixtures.js";

test("the Story bible card exports the story bible as a document", async ({ page }) => {
  await page.goto("/#/export");
  await page.getByRole("radio", { name: /Story bible/ }).click();
  await expect(page.getByText("Leave out entries marked Exclude from AI")).toBeVisible();
  await expectNoSidewaysScroll(page);
  await expect(page.locator("code").filter({ hasText: /-story-bible\.docx$/ })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.getByRole("button", { name: /Export Story bible/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-story-bible\.docx$/);

  // PDF: on the PDF card's page, said so beside the choice
  await page.getByText("PDF", { exact: true }).last().click();
  await expect(page.getByText("The PDF uses the page size set on the PDF card.")).toBeVisible();
  await expect(page.locator("code").filter({ hasText: /-story-bible\.pdf$/ })).toBeVisible();
});
