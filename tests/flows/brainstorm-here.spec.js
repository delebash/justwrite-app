// Brainstorm where it's used (TASKS, the AI drafting section's seventh round, 2026-10-28): a labelled
// button beside a name or a title opens Brainstorm's panel — nothing runs on open; the seed prompt
// (optional) leads, the page and the book follow; Use puts the idea in place and closes. Name ideas
// at a character's name (with a seed), Title ideas at a scene's title in the editor (seed left empty).
import { stubAi } from "../lib/smoke-common.js";
import { expect, inStore, navigate, openSceneWithProse, test } from "./fixtures.js";

const NAMES = "1. Brenna Holt\n2. Sigrun Vale\n3. Odile Marsh";
const TITLES = "1. The Lamp That Lied\n2. Salt on the Ledger";

test("Name ideas at a character's name: the seed, Generate, Use sets the name", async ({ page }) => {
  const asked = await stubAi(page, (b) => (b.action === "brainstorm" ? NAMES : "{}"));
  await page.goto("/#/characters");
  const id = await inStore(page, (store) => store.characters[0]?.id);
  expect(id, "a character").toBeTruthy();
  await navigate(page, `/characters/${id}`);

  await page.getByRole("button", { name: "Name ideas" }).click();
  const panel = page.locator(".bs-popup");
  await expect(panel.getByRole("textbox", { name: "Seed prompt" })).toBeVisible();
  expect(asked.filter((b) => b.action === "brainstorm")).toHaveLength(0);
  await panel.getByRole("textbox", { name: "Seed prompt" }).fill("two syllables, harbour-born");
  await panel.getByRole("button", { name: "Generate" }).click();
  await expect(panel.locator(".bsr-item")).toHaveCount(3);
  const sent = asked.find((b) => b.action === "brainstorm").variables.user_content;
  expect(sent).toContain("Seed: two syllables, harbour-born — names for the character in CHARACTER PROFILE");
  expect(sent).toContain("CHARACTER PROFILE");

  await panel.locator(".bsr-item").nth(1).getByRole("button", { name: "Use" }).click();
  await expect(panel).toHaveCount(0);
  await expect.poll(() => inStore(page, (store, cid) => store.characters.find((c) => c.id === cid)?.name, id)).toBe("Sigrun Vale");
});

test("Title ideas at a scene's title in the editor: an empty seed, Use sets the title", async ({ page }) => {
  const asked = await stubAi(page, (b) => (b.action === "brainstorm" ? TITLES : "{}"));
  const chapterId = await openSceneWithProse(page);

  await page.getByRole("button", { name: "Title ideas" }).click();
  const panel = page.locator(".bs-popup");
  await panel.getByRole("button", { name: "Generate" }).click();
  await expect(panel.locator(".bsr-item")).toHaveCount(2);
  expect(asked.find((b) => b.action === "brainstorm").variables.user_content).toContain("Seed: titles for the scene in THE SCENE");

  await panel.locator(".bsr-item").nth(0).getByRole("button", { name: "Use" }).click();
  await expect(panel).toHaveCount(0);
  await expect.poll(() => inStore(page, (store, ch) => store.scenesFor(ch)[0]?.title, chapterId)).toBe("The Lamp That Lied");
});
