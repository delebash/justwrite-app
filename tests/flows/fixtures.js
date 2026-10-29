// What every flow test shares (Playwright Test fixtures, https://playwright.dev/docs/test-fixtures):
// any page error or console error fails the test, as the smoke's sweep does; and the steps several
// flows take — opening a scene with prose, the editor's AI menu, the page's sideways-scroll check.
import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  // Every JS error the page raises during the test; asserted empty at its end.
  jsErrors: [
    async ({ page }, use) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
      });
      await use(errors);
      expect(errors, "JS errors on the page").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

/** Run `fn(store, arg)` in the page against its project store (a lookup that finds the test's
 *  data) — a JSHandle's evaluate, https://playwright.dev/docs/api/class-jshandle#js-handle-evaluate. */
export async function inStore(page, fn, arg) {
  // Once the app has mounted and the project has loaded.
  const store = await page.waitForFunction(() => {
    const s = document.querySelector("#q-app")?.__vue_app__?.config.globalProperties.$pinia._s.get("project");
    return s?.allChapters?.length ? s : null;
  });
  try {
    return await store.evaluate(fn, arg);
  } finally {
    await store.dispose();
  }
}

/** Run `fn(ui, arg)` in the page against its ui store (the sidebar's open sections, the selections),
 *  once the app has loaded and the store exists: Pinia creates a store on its first use, which can
 *  come after the project has loaded — scene-link failed one run in four on it (2026-10-28). */
export async function inUiStore(page, fn, arg) {
  await inStore(page, () => true);
  const store = await page.waitForFunction(() =>
    document.querySelector("#q-app").__vue_app__.config.globalProperties.$pinia._s.get("ui") || null);
  try {
    return await store.evaluate(fn, arg);
  } finally {
    await store.dispose();
  }
}

/** Go to `path` through the app's own router (as a click in the sidebar does), once it has loaded —
 *  a bare change of the URL's #part can lose the race with the app's first navigation. */
export async function navigate(page, path) {
  await inStore(page, () => true);
  await page.evaluate((p) => document.querySelector("#q-app").__vue_app__.config.globalProperties.$router.push(p), path);
  await expect(page).toHaveURL(new RegExp(`#${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
}

/** A chapter whose first scene has prose, opened at that scene with the cursor at its end. */
export async function openSceneWithProse(page) {
  await page.goto("/#/chapters");
  const chapterId = await inStore(page, (store) =>
    store.allChapters.find((c) => (store.scenesFor(c.id) || [])[0]?.body?.length > 200)?.id);
  expect(chapterId, "a chapter whose first scene has prose").toBeTruthy();
  await navigate(page, `/chapters/${chapterId}`);
  const listView = page.getByRole("button", { name: /List view/ });
  if (await listView.count()) await listView.first().click();
  await page.getByRole("button", { name: /^scene 1/i }).first().click();
  await page.locator(".ProseMirror").first().click();
  await page.keyboard.press("Control+End");
  return chapterId;
}

/** The editor's AI menu, open. */
export async function openAiMenu(page) {
  await page.locator(".ai-strip-trigger").first().click();
  await expect(page.locator(".ai-strip-menu")).toBeVisible();
  return page.locator(".ai-strip-menu");
}

/** The page never scrolls sideways (a control wider than the window shows up here). */
export async function expectNoSidewaysScroll(page) {
  const wide = await page.evaluate(() => document.scrollingElement.scrollWidth > document.scrollingElement.clientWidth);
  expect(wide, "the page scrolls sideways").toBe(false);
}
