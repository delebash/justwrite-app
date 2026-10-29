// The editor's AI menu → Next plot beats / Plot twists in the Brainstorm window (BrainstormModal.vue;
// TASKS, the seventh round 2026-10-28: Brainstorm where it's used) and Unstuck in its ideas window
// (IdeaListModal.vue): nothing runs on open; the writer's seed prompt (optional) leads, the scene and
// the prose before the cursor follow; More like these steers by the liked ideas, never one shown;
// Write this continues the prose in that direction as the accept/reject diff.
import { stubAi } from "../lib/smoke-common.js";
import { expect, expectNoSidewaysScroll, openAiMenu, openSceneWithProse, test } from "./fixtures.js";

const ideas = (round) => Array.from({ length: 6 }, (_, i) =>
  `${i + 1}. Round ${round} idea ${i + 1}: the harbour master calls in a debt nobody remembers owing.`).join("\n");
const CONTINUED = "She set the lamp down.";
const MOVES = ["goal-shift", "interrupt", "setting", "reveal", "timeframe"].map((kind, i) =>
  ({ kind, label: `Move ${i + 1}`, instruction: `Instruction ${i + 1} for this move, long enough to wrap on a phone.` }));

const lastContinue = (asked) => asked.findLast((b) => String(b.action).startsWith("writerAI."));

test("Next plot beats: the seed, Generate, More like these, Write this continues in that direction", async ({ page }) => {
  let round = 0;
  const asked = await stubAi(page, (b) => (b.action === "brainstormPlot" ? ideas(++round) : String(b.action).startsWith("writerAI.") ? CONTINUED : "{}"));
  await openSceneWithProse(page);
  await (await openAiMenu(page)).getByText("Next plot beats", { exact: true }).click();

  const dialog = page.locator(".q-dialog");
  await expect(dialog.getByRole("textbox", { name: "Seed prompt" })).toBeVisible();
  expect(asked.filter((b) => b.action === "brainstormPlot")).toHaveLength(0);
  await dialog.getByRole("textbox", { name: "Seed prompt" }).fill("the harbour master moves first");
  await dialog.getByRole("button", { name: "Generate" }).click();

  const cards = dialog.locator(".bsr-item");
  await expect(cards).toHaveCount(6);
  const first = asked.find((b) => b.action === "brainstormPlot").variables.user_content;
  expect(first).toContain("STORY CONTEXT\n");
  expect(first).toContain("THE STORY SO FAR\n");
  expect(first).toContain("Seed: the harbour master moves first — next beats from where THE STORY SO FAR ends");
  await expectNoSidewaysScroll(page);

  await cards.nth(0).getByRole("button", { name: "Like" }).click();
  await dialog.getByRole("button", { name: "More like these" }).click();
  await expect(cards).toHaveCount(12);
  const second = asked.filter((b) => b.action === "brainstormPlot")[1].variables.user_content;
  // data only since 2026-10-28 — what to do with the list is the seeded system prompt's
  expect(second).toContain("Liked:\n- Round 1 idea 1");

  const idea = (await cards.nth(7).locator(".bsr-text").innerText()).trim();
  await cards.nth(7).getByRole("button", { name: "Write this" }).click();
  await expect(page.locator(".q-dialog")).toHaveCount(0);
  await expect.poll(() => lastContinue(asked)?.variables?.direction).toBe(idea);
  expect(lastContinue(asked).action).toBe("writerAI.guided-continue");
  await expect(page.locator(".ProseMirror").first()).toContainText(CONTINUED);
  await page.getByRole("button", { name: /Reject all/ }).click();
});

test("Plot twists ask Brainstorm's twists — an empty seed too", async ({ page }) => {
  const asked = await stubAi(page, (b) => (b.action === "brainstormPlot" ? ideas(1) : "{}"));
  await openSceneWithProse(page);
  await (await openAiMenu(page)).getByText("Plot twists", { exact: true }).click();
  await page.locator(".q-dialog").getByRole("button", { name: "Generate" }).click();
  await expect(page.locator(".bsr-item")).toHaveCount(6);
  expect(asked.find((b) => b.action === "brainstormPlot").variables.user_content).toContain("Seed: twists from where THE STORY SO FAR ends");
  await expect(page.locator(".q-dialog")).toContainText(/plot twists/i);
  expect(asked.find((b) => b.action === "brainstormPlot").variables.user_content).toContain("Category: twist\n");
  await page.locator(".q-dialog").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".q-dialog")).toHaveCount(0);
});

test("Unstuck waits for its button, shows five kinds, and Write this continues with the move", async ({ page }) => {
  const asked = await stubAi(page, (b) => (b.action === "unstuck" ? JSON.stringify({ moves: MOVES }) : String(b.action).startsWith("writerAI.") ? CONTINUED : "{}"));
  await openSceneWithProse(page);
  await (await openAiMenu(page)).getByText(/^Unstuck/).click();
  await expect(page.getByRole("button", { name: /Get unstuck/ })).toBeVisible();
  expect(asked.filter((b) => b.action === "unstuck")).toHaveLength(0);

  await page.getByRole("button", { name: /Get unstuck/ }).click();
  await expect(page.locator(".il-item")).toHaveCount(5);
  await expect(page.locator(".il-kind")).toHaveCount(5);
  const colours = await page.locator(".il-item").evaluateAll((els) => new Set(els.map((e) => getComputedStyle(e).borderLeftColor)).size);
  expect(colours).toBe(5);
  await expectNoSidewaysScroll(page);

  await page.locator(".il-item").nth(2).getByRole("button", { name: /Write this/ }).click();
  await expect.poll(() => lastContinue(asked)?.variables?.direction).toBe(MOVES[2].instruction);
  await page.getByRole("button", { name: /Reject all/ }).click();
});
