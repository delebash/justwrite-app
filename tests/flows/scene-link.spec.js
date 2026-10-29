// A scene opened from a link opens its chapter in the sidebar, the scene's row selected under it — the
// user's report 2026-10-28: Strands → a beat chip ("Ch. 1 · Scene 2") opened the scene, but its chapter
// stayed closed in the sidebar, so the scene's row was hidden. Every link to a scene (a beat chip,
// Appears in scenes, a mention, a search result) is the router's push to the scene's route, as here;
// ChaptersPage opens the chapter for the scene its route names.
import { expect, inStore, inUiStore, navigate, test } from "./fixtures.js";

test("a scene opened from a link shows, selected, under its opened chapter in the sidebar", async ({ page }) => {
  await page.goto("/#/strands");
  // the link's target: a chapter's second scene, as in the report
  const target = await inStore(page, (store) => {
    const c = store.allChapters.find((ch) => (store.scenesFor(ch.id) || []).length >= 2);
    return c ? { chapterId: c.id, sceneId: store.scenesFor(c.id)[1].id } : null;
  });
  expect(target, "a chapter with two scenes").toBeTruthy();
  // every chapter closed in the sidebar first, so the rows below are the target chapter's
  await inUiStore(page, (ui) => {
    ui.expanded = Object.fromEntries(Object.entries(ui.expanded).filter(([k]) => !k.startsWith("chapter:")));
  });
  await expect(page.locator(".sidebar .nav-scene")).toHaveCount(0);

  await navigate(page, `/chapters/${target.chapterId}/${target.sceneId}`);

  await expect(page.locator(".sidebar .chapter-chev[aria-expanded='true']")).toHaveCount(1);
  await expect(page.locator(".sidebar .nav-scene.sel")).toHaveCount(1);
  await expect(page.locator(".sidebar .nav-scene").nth(1)).toHaveClass(/\bsel\b/);
});

// The Outline has no single scene, so a link to one opens it to write even when the Outline was the
// chapter page's last mode (2026-10-29: it showed the Outline).
test("a scene opened from a link while the Outline was last open shows the scene", async ({ page }) => {
  await page.goto("/#/strands");
  const target = await inStore(page, (store) => {
    const c = store.allChapters.find((ch) => (store.scenesFor(ch.id) || []).length >= 2);
    return { chapterId: c.id, sceneId: store.scenesFor(c.id)[1].id };
  });
  await inUiStore(page, (ui) => ui.setChapterMode("outline"));

  await navigate(page, `/chapters/${target.chapterId}/${target.sceneId}`);

  await expect(page.locator(".ProseMirror").first()).toBeVisible();
  await expect(page.locator(".ol-part-title")).toHaveCount(0);
});
