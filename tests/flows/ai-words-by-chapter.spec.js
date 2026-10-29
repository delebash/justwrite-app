// AI-written words by chapter in Settings → Project (2026-10-28, docs/plans/2026-10-28-four-feature-
// ideas.md §2): under the book's count, "By chapter" opens the chapters with marked words and their
// share; "Copy as text" puts the list on the clipboard.
import { expect, expectNoSidewaysScroll, inStore, navigate, test } from "./fixtures.js";

test("By chapter lists the chapters with AI-written words, and copies them as text", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/#/settings/project");
  // a chapter's first scene gets four AI-written words (the mark the editor gives an accepted draft)
  // (both viewports' runs share one copy of the data, so the chapter's count is read back, not assumed)
  const chapter = await inStore(page, (s) => {
    const c = s.allChapters.find((ch) => (s.scenesFor(ch.id) || []).length);
    const scene = s.scenesFor(c.id)[0];
    s.setSceneBody(c.id, scene.id, `${scene.body}<p><span data-ai-text="">four words the AI</span></p>`);
    const doc = new DOMParser().parseFromString(s.scenesFor(c.id).map((x) => x.body).join(""), "text/html");
    const ai = [...doc.querySelectorAll("[data-ai-text]")].reduce((n, el) => n + (el.textContent.match(/\S+/g) || []).length, 0);
    return { num: c.num, ai };
  });
  await navigate(page, "/settings/project");
  await page.getByRole("button", { name: "By chapter", exact: true }).click();
  const row = page.locator(".ai-by-chapter .ui-table-row").first();
  await expect(row.locator("td").first()).toContainText(String(chapter.num));
  await expect(row.locator("td").nth(1)).toHaveText(String(chapter.ai));
  await expect(page.getByText("Counts the words still marked as AI-written.", { exact: false })).toBeVisible();
  await expectNoSidewaysScroll(page);

  await page.getByRole("button", { name: "Copy as text" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^AI-written words in this book: \d+/);
  expect(copied).toContain(`Chapter ${chapter.num}`);
});
