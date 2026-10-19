// Spelling JustWrite checks itself (docs/plans/2026-10-19-spelling.md): a misspelling typed in a
// scene gets the wavy mark once the word is finished, a story-bible name doesn't; a right-click on
// the mark puts its corrections at the top of the editor's menu, and one replaces the word; Add to
// dictionary clears the mark and lists the word in Settings → Project, where it's taken back.
import { expect, expectNoSidewaysScroll, inStore, navigate, openSceneWithProse, test } from "./fixtures.js";

test("a misspelling is marked, corrected from the menu, and a word added to the book's dictionary", async ({ page }) => {
  await openSceneWithProse(page);
  await inStore(page, (s) => {
    for (const w of [...s.dictionary]) s.removeDictionaryWord(w);
    s.updateProjectMeta({ language: "en" });
  });
  const name = await inStore(page, (s) => s.characters.map((c) => c.name.split(" ")[0]).find((w) => /^[A-Z][a-z]{2,}$/.test(w)));
  expect(name, "a character with a one-word first name").toBeTruthy();

  await page.keyboard.press("Enter");
  await page.keyboard.type(`${name} walkd past the storry. Zorbly `);
  const editor = page.locator(".ProseMirror").first();
  // the paragraph this test typed (an earlier run's may be in the data too)
  const marks = editor.locator("p").filter({ hasText: `${name} walkd past the` }).last().locator(".spell-error");
  for (const word of ["walkd", "storry", "Zorbly"]) await expect(marks.filter({ hasText: word })).toHaveCount(1);
  await expect(marks.filter({ hasText: name })).toHaveCount(0);

  // A correction from the menu replaces the word.
  const menu = page.locator(".ctx-menu");
  await marks.filter({ hasText: "storry" }).click({ button: "right" });
  await menu.getByRole("menuitem", { name: "story", exact: true }).click();
  await expect(editor).toContainText("walkd past the story.");
  await expect(marks.filter({ hasText: "storry" })).toHaveCount(0);

  // Add to dictionary: marked nowhere in the book, listed in Settings → Project, taken back there.
  await marks.filter({ hasText: "Zorbly" }).click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Add to dictionary" }).click();
  await expect(marks.filter({ hasText: "Zorbly" })).toHaveCount(0);
  expect(await inStore(page, (s) => s.dictionary)).toEqual(["Zorbly"]);
  await expectNoSidewaysScroll(page);

  await navigate(page, "/settings/project");
  const tag = page.locator(".ui-tag", { hasText: "Zorbly" });
  await expect(tag).toBeVisible();
  await tag.getByRole("button", { name: /Zorbly/ }).click();
  await expect.poll(() => inStore(page, (s) => s.dictionary)).toEqual([]);
  await expectNoSidewaysScroll(page);
});

test("in an inline editor (a location's description) a marked word's menu is its corrections alone", async ({ page }) => {
  await page.goto("/#/locations");
  const id = await inStore(page, (s) => {
    s.updateProjectMeta({ language: "en" });
    return s.locations[0]?.id;
  });
  expect(id, "a location").toBeTruthy();
  await navigate(page, `/locations/${id}`);
  const editor = page.locator(".inline-editor-body .ProseMirror").first();
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("The quay smelld of tar ");
  const para = editor.locator("p").filter({ hasText: "The quay smelld of" }).last();
  const mark = para.locator(".spell-error", { hasText: "smelld" });
  await expect(mark).toHaveCount(1);

  await mark.click({ button: "right" });
  const menu = page.locator(".ctx-menu");
  await expect(menu.getByRole("menuitem", { name: "Add to dictionary" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Cut/ })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "smelled", exact: true }).click();
  await expect(editor).toContainText("The quay smelled of tar");
  await expectNoSidewaysScroll(page);
});
