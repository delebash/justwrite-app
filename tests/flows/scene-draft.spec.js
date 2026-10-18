// Slice 4 — scene drafting and the AI-text mark (docs/plans/2026-10-18-ai-text-mark-and-slice-4.md):
// AI scene drafting is per book and off until switched on in Settings → Project; Draft from plan
// drafts an empty scene from its Summary on its own feature row; accepted, the AI's words carry the
// AI-text mark, the words the writer types don't, and Mark as mine clears it; Settings counts them.
import { stubAi } from "../lib/smoke-common.js";
import { expect, expectNoSidewaysScroll, inStore, navigate, openAiMenu, openSceneWithProse, test } from "./fixtures.js";

const PLAN = "Ines radios the harbor about the overdue boat; Brannock talks around it.";
const DRAFT = "Ines keyed the radio twice before the harbor answered.\n\nBrannock's voice came too awake for the hour.";
const setDrafting = (page, on) => inStore(page, (store, v) => store.updateProjectMeta({ aiSceneDrafting: v }), on);

test("Draft from plan isn't offered while AI scene drafting is off", async ({ page }) => {
  await openSceneWithProse(page);
  await setDrafting(page, false);
  const menu = await openAiMenu(page);
  await expect(menu.getByText("Draft from plan", { exact: true })).toHaveCount(0);
  await expect(menu.getByText("Mark as mine", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("Draft from plan drafts an empty scene from its Summary; the AI's words stay marked until Mark as mine", async ({ page }) => {
  const asked = await stubAi(page, (b) => (b.action === "sceneDraft" ? DRAFT : "{}"));

  // The switch, in Settings → Project, with the record under it.
  await page.goto("/#/settings/project");
  await setDrafting(page, false);
  await page.getByRole("switch", { name: "AI scene drafting" }).click();
  await expect.poll(() => inStore(page, (s) => s.project.aiSceneDrafting)).toBe(true);
  await expect(page.getByText(/^AI-written words in this book: \d+$/)).toBeVisible();
  await expectNoSidewaysScroll(page);

  // An empty scene with a Summary.
  const chapterId = await openSceneWithProse(page);
  await page.getByRole("button", { name: /New scene/ }).first().click();
  await page.getByRole("button", { name: /Links/ }).first().click();
  await page.getByRole("textbox", { name: "Summary" }).fill(PLAN);
  await page.getByRole("button", { name: "Close links panel" }).click();

  const draft = page.locator(".scene-draft-cta").getByRole("button", { name: "Draft from plan" });
  await expect(draft).toBeEnabled();
  await draft.click();
  await page.getByRole("button", { name: "Accept all" }).click();

  const editor = page.locator(".ProseMirror").first();
  await expect(editor).toContainText("Ines keyed the radio twice");
  const marked = editor.locator("span[data-ai-text]");
  await expect(marked).toHaveCount(2);
  const sent = asked.at(-1);
  expect(sent.action).toBe("sceneDraft");
  expect(sent.variables.passage).toBe("");
  expect(sent.variables.storyContext).toContain(`## Summary\nWhat this scene is meant to do: ${PLAN}`);
  await expectNoSidewaysScroll(page);

  // A word typed inside the AI's text is the writer's; the AI's words around it stay marked.
  await marked.first().click();
  await page.keyboard.press("Home");
  await page.keyboard.type("Then ");
  const typedIsMarked = await editor.evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (walker.currentNode.nodeValue.includes("Then ")) return !!walker.currentNode.parentElement.closest("[data-ai-text]");
    }
    return null;
  });
  expect(typedIsMarked).toBe(false);
  await expect(marked).toHaveCount(2);

  // Settings counts the AI's words still in the book.
  await navigate(page, "/settings/project");
  await expect(page.getByText(/^AI-written words in this book: [1-9]\d*$/)).toBeVisible();

  // Mark as mine, with nothing selected, clears the scene.
  await navigate(page, `/chapters/${chapterId}`);
  const n = await inStore(page, (store, id) => (store.scenesFor(id) || []).findIndex((x) => x.body.includes("data-ai-text")) + 1, chapterId);
  expect(n, "the drafted scene").toBeGreaterThan(0);
  await page.getByRole("button", { name: new RegExp(`^scene ${n}`, "i") }).first().click();
  await page.locator(".ProseMirror").first().click();
  const menu = await openAiMenu(page);
  await menu.getByText("Mark as mine", { exact: true }).click();
  await expect(page.locator(".ProseMirror").first().locator("span[data-ai-text]")).toHaveCount(0);
  await setDrafting(page, false);
});
