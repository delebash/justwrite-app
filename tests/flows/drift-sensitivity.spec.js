// The voice drift's sensitivity on Analysis (2026-10-28): Sensitivity opens the book's three values,
// a changed one is kept with the book, and the card's words follow it.
import { expect, expectNoSidewaysScroll, inStore, test } from "./fixtures.js";

test("Sensitivity sets the book's flag value, hot count and trend value", async ({ page }) => {
  await page.goto("/#/analysis");
  await page.getByRole("button", { name: "Sensitivity", exact: true }).click();
  const hot = page.locator("#styleHotMeasures");
  await expect(hot).toBeVisible();
  await expectNoSidewaysScroll(page);

  await hot.fill("3");
  await hot.press("Enter");
  await expect.poll(() => inStore(page, (s) => s.project.styleHotMeasures)).toBe(3);
  await expect(page.locator(".vd-blurb").first()).toContainText("3 or more");

  await page.locator("#styleFlagZ").fill("1.5");
  await page.locator("#styleFlagZ").press("Tab");
  await expect.poll(() => inStore(page, (s) => s.project.styleFlagZ)).toBe(1.5);
  await expect(page.locator(".vd-blurb").first()).toContainText("±1.5 standard deviations");

  // back to the values every book starts with
  await hot.fill("2");
  await hot.press("Enter");
  await page.locator("#styleFlagZ").fill("1");
  await page.locator("#styleFlagZ").press("Enter");
  await expect.poll(() => inStore(page, (s) => [s.project.styleFlagZ, s.project.styleHotMeasures])).toEqual([1, 2]);
});
