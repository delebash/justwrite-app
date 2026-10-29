// The model's answer in the chat panel is Markdown, rendered and sanitized (the kit's renderAiMarkdown,
// 2026-10-29): Ask the book and Talk to a character showed Gemma's **…** and * bullets as they came.
// Talk to a character needs no book index, so it shows the bubble with the AI stubbed.
import { stubAi } from "../lib/smoke-common.js";
import { expect, expectNoSidewaysScroll, inStore, inUiStore, test } from "./fixtures.js";

const ANSWER = "**The ledger** is mine.\n\n- the salt road\n- the toll-forts\n\nNo one reads <script>window.__x = 1</script> `this`.";

test("a character's answer shows as Markdown, and its HTML as text", async ({ page }) => {
  await stubAi(page, (b) => (b.action === "characterChat" ? ANSWER : "{}"));
  await page.goto("/#/characters");
  const characterId = await inStore(page, (store) => store.characters[0]?.id);
  expect(characterId, "a character").toBeTruthy();
  await inUiStore(page, (ui, id) => ui.openChatPanelFor({ mode: "character", characterId: id, sourceKey: `talk:${id}` }), characterId);

  await page.locator(".cp-textarea textarea").fill("What do you keep?");
  await page.keyboard.press("Enter");

  const bubble = page.locator(".cp-bubble-assistant.cp-md").last();
  await expect(bubble.locator("strong")).toHaveText("The ledger");
  await expect(bubble.locator("li")).toHaveCount(2);
  await expect(bubble.locator("code")).toHaveText("this");
  await expect(bubble.locator("script")).toHaveCount(0);
  await expect(bubble).toContainText("window.__x = 1");
  expect(await page.evaluate(() => window.__x)).toBeUndefined();
  await expectNoSidewaysScroll(page);
});
